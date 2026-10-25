"use client";

import { useEffect, useRef, useState } from "react";
import type { Image, Project, RawBlock, Site } from "@/lib/content";

// A photo uploaded in this session but not saved yet: its blob is on GitHub, shown from a local preview.
type EditorImage = Image & { pending?: { sha: string; preview: string } };
type EditorProject = { caption: string; images: EditorImage[] };
type Row = { id: number; block: RawBlock };

const MAX_SIDE = 2400; // photos are resized to this long side before upload
const JPEG_QUALITY = 0.85;

let nextId = 0;
const toRow = (block: RawBlock): Row => ({ id: nextId++, block });
const randomName = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default function Editor({
  initialSite,
  initialSha,
  repo,
}: {
  initialSite: Site;
  initialSha: string;
  repo: string;
}) {
  const [rows, setRows] = useState(() => initialSite.blocks.map(toRow));
  const [projects, setProjects] = useState<Record<string, EditorProject>>(initialSite.projects);
  const [sha, setSha] = useState(initialSha);
  // Photos that exist in the repo, so removing them from a project deletes the file on save.
  const committed = useRef(
    new Set(Object.values(initialSite.projects).flatMap((p) => p.images.map((i) => i.src))),
  );
  const [uploading, setUploading] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  // Projects are collapsed by default; these slugs are open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const setOpen = (slug: string, open: boolean) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (open) next.add(slug);
      else next.delete(slug);
      return next;
    });

  // A photo dropped outside a project must not make the browser open it and leave the admin.
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const changed = () => {
    setDirty(true);
    setStatus(null);
  };

  const updateRow = (id: number, block: RawBlock) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, block } : r)));
    changed();
  };

  const insertAfter = (id: number | null, block: RawBlock) => {
    setRows((rs) => {
      const at = id === null ? rs.length : rs.findIndex((r) => r.id === id) + 1;
      return [...rs.slice(0, at), toRow(block), ...rs.slice(at)];
    });
    changed();
  };

  const move = (id: number, delta: number) => {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.id === id);
      const j = i + delta;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    changed();
  };

  const remove = (id: number) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
    changed();
  };

  const newProject = (label: string): RawBlock => {
    const slug = `p-${randomName()}`;
    setProjects((ps) => ({ ...ps, [slug]: { caption: "", images: [] } }));
    setOpen(slug, true);
    return { type: "project", slug, label };
  };

  // Switching a line between text and project keeps its words.
  const toggleType = (row: Row) => {
    const b = row.block;
    if (b.type === "text") updateRow(row.id, newProject(b.text));
    else if (b.type === "project") {
      const photos = projects[b.slug]?.images.length ?? 0;
      if (
        photos &&
        !confirm(
          `Trasformando "${b.label}" in testo, le sue ${photos} foto verranno eliminate al salvataggio. Continuare?`,
        )
      )
        return;
      updateRow(row.id, { type: "text", text: b.label });
    }
  };

  const updateProject = (slug: string, fn: (p: EditorProject) => EditorProject) => {
    setProjects((ps) => ({ ...ps, [slug]: fn(ps[slug] ?? { caption: "", images: [] }) }));
    changed();
  };

  const addPhotos = async (slug: string, files: FileList) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const { base64, width, height, preview } = await resize(file);
        const res = await fetch("/api/admin/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: base64 }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        const image: EditorImage = {
          src: `/projects/${slug}/${randomName()}.jpg`,
          width,
          height,
          pending: { sha: json.sha, preview },
        };
        updateProject(slug, (p) => ({ ...p, images: [...p.images, image] }));
      } catch (e) {
        setStatus({ text: `Caricamento di ${file.name} non riuscito: ${String(e)}`, error: true });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const save = async () => {
    setSaving(true);
    setStatus({ text: "Salvataggio…" });

    const blocks = rows.map((r) => r.block);
    const used = new Set(blocks.flatMap((b) => (b.type === "project" ? [b.slug] : [])));
    const kept: Record<string, Project> = {};
    const added: { path: string; sha: string }[] = [];
    for (const slug of used) {
      const p = projects[slug] ?? { caption: "", images: [] };
      kept[slug] = {
        caption: p.caption,
        images: p.images.map(({ src, width, height }) => ({ src, width, height })),
      };
      for (const img of p.images)
        if (img.pending) added.push({ path: `public${img.src}`, sha: img.pending.sha });
    }
    const keptSrc = new Set(Object.values(kept).flatMap((p) => p.images.map((i) => i.src)));
    const removed = [...committed.current]
      .filter((src) => !keptSrc.has(src))
      .map((src) => `public${src}`);

    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: { blocks, projects: kept }, added, removed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      committed.current = keptSrc;
      setProjects(kept);
      setSha(json.sha);
      setDirty(false);
      setStatus({ text: "Salvato. Il sito online si aggiorna in circa un minuto." });
    } catch (e) {
      setStatus({ text: `Salvataggio non riuscito: ${String(e)}`, error: true });
    } finally {
      setSaving(false);
    }
  };

  const photoUrl = (img: EditorImage) =>
    img.pending?.preview ?? `https://raw.githubusercontent.com/${repo}/${sha}/public${img.src}`;

  return (
    <main className="admin">
      <header className="bar">
        <button className="primary" onClick={save} disabled={saving || uploading > 0 || !dirty}>
          {saving ? "Salvataggio…" : "Salva"}
        </button>
        <span className={status?.error ? "status error" : "status"}>
          {uploading > 0
            ? `Caricamento di ${uploading} foto…`
            : (status?.text ?? (dirty ? "Modifiche non salvate" : ""))}
        </span>
        <span className="spacer" />
        <a href="/" target="_blank" rel="noreferrer">
          Vedi sito
        </a>
        <form method="post" action="/api/admin/logout">
          <button>Esci</button>
        </form>
      </header>

      <p className="hint">
        Ogni riga del sito è un blocco. Un blocco <strong>Progetto</strong> va sempre a capo e apre
        le sue foto; il numero tra parentesi è il numero di foto. Puoi trascinare le foto su un
        progetto, anche se è chiuso.
      </p>
      <div className="expand-all">
        <button
          onClick={() =>
            setExpanded(
              new Set(rows.flatMap((r) => (r.block.type === "project" ? [r.block.slug] : []))),
            )
          }
        >
          Apri tutti i progetti
        </button>
        <button onClick={() => setExpanded(new Set())}>Chiudi tutti</button>
      </div>

      <ol className="rows">
        {rows.map((row, i) => {
          const b = row.block;
          const isOpen = b.type === "project" && expanded.has(b.slug);
          const drop =
            b.type === "project"
              ? {
                  onDragOver: (e: React.DragEvent) => {
                    if (!e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    setDropTarget(b.slug);
                  },
                  onDragLeave: (e: React.DragEvent) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
                  },
                  onDrop: (e: React.DragEvent) => {
                    e.preventDefault();
                    setDropTarget(null);
                    if (e.dataTransfer.files.length) {
                      setOpen(b.slug, true);
                      addPhotos(b.slug, e.dataTransfer.files);
                    }
                  },
                }
              : {};
          return (
            <li
              key={row.id}
              className={`row row-${b.type}${b.type === "project" && dropTarget === b.slug ? " is-drop" : ""}`}
              {...drop}
            >
              <div className="row-tools">
                {b.type === "contact" ? (
                  <span className="kind">Contatti</span>
                ) : (
                  <button className="kind" onClick={() => toggleType(row)} title="Cambia tipo">
                    {b.type === "text" ? "Testo" : "Progetto"} ⇄
                  </button>
                )}
                {b.type === "project" && (
                  <button
                    className="toggle"
                    onClick={() => setOpen(b.slug, !isOpen)}
                    aria-expanded={isOpen}
                  >
                    <span className="arrow">{isOpen ? "▾" : "▸"}</span>
                    {b.label || "Senza titolo"}{" "}
                    <span className="count">({projects[b.slug]?.images.length ?? 0})</span>
                  </button>
                )}
                <span className="spacer" />
                <button onClick={() => move(row.id, -1)} disabled={i === 0} title="Sposta su">
                  ↑
                </button>
                <button
                  onClick={() => move(row.id, 1)}
                  disabled={i === rows.length - 1}
                  title="Sposta giù"
                >
                  ↓
                </button>
                <button
                  onClick={() => {
                    if (
                      b.type !== "project" ||
                      confirm(`Eliminare il progetto "${b.label}" e le sue foto?`)
                    )
                      remove(row.id);
                  }}
                  title="Elimina"
                >
                  ✕
                </button>
              </div>

              {b.type === "text" && (
                <textarea
                  value={b.text}
                  rows={Math.max(1, Math.ceil(b.text.length / 90))}
                  onChange={(e) => updateRow(row.id, { ...b, text: e.target.value })}
                  placeholder="Testo"
                />
              )}

              {b.type === "contact" && (
                <div className="fields">
                  <label>
                    Email
                    <input
                      value={b.email}
                      onChange={(e) => updateRow(row.id, { ...b, email: e.target.value })}
                    />
                  </label>
                  <label>
                    Instagram
                    <input
                      value={b.instagram}
                      onChange={(e) =>
                        updateRow(row.id, { ...b, instagram: e.target.value.replace(/^@/, "") })
                      }
                    />
                  </label>
                  <label>
                    Partita IVA
                    <input
                      value={b.vat}
                      onChange={(e) => updateRow(row.id, { ...b, vat: e.target.value })}
                    />
                  </label>
                </div>
              )}

              {b.type === "project" && isOpen && (
                <ProjectEditor
                  label={b.label}
                  project={projects[b.slug] ?? { caption: "", images: [] }}
                  photoUrl={photoUrl}
                  onLabel={(label) => updateRow(row.id, { ...b, label })}
                  onChange={(fn) => updateProject(b.slug, fn)}
                  onAddPhotos={(files) => addPhotos(b.slug, files)}
                />
              )}

              <div className="insert">
                <button onClick={() => insertAfter(row.id, { type: "text", text: "" })}>
                  + Testo sotto
                </button>
                <button onClick={() => insertAfter(row.id, newProject(""))}>
                  + Progetto sotto
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {rows.length === 0 && (
        <div className="insert">
          <button onClick={() => insertAfter(null, { type: "text", text: "" })}>+ Testo</button>
          <button onClick={() => insertAfter(null, newProject(""))}>+ Progetto</button>
        </div>
      )}
    </main>
  );
}

function ProjectEditor({
  label,
  project,
  photoUrl,
  onLabel,
  onChange,
  onAddPhotos,
}: {
  label: string;
  project: EditorProject;
  photoUrl: (img: EditorImage) => string;
  onLabel: (label: string) => void;
  onChange: (fn: (p: EditorProject) => EditorProject) => void;
  onAddPhotos: (files: FileList) => void;
}) {
  const movePhoto = (i: number, delta: number) =>
    onChange((p) => {
      const j = i + delta;
      if (j < 0 || j >= p.images.length) return p;
      const images = [...p.images];
      [images[i], images[j]] = [images[j], images[i]];
      return { ...p, images };
    });

  return (
    <div className="project-fields">
      <label>
        Titolo nel testo <span className="count">({project.images.length})</span>
        <input
          value={label}
          onChange={(e) => onLabel(e.target.value)}
          placeholder="Titolo del progetto"
        />
      </label>
      <label>
        Didascalia
        <textarea
          value={project.caption}
          rows={2}
          onChange={(e) => onChange((p) => ({ ...p, caption: e.target.value }))}
          placeholder="Didascalia"
        />
      </label>
      <div className="photos">
        {project.images.map((img, i) => (
          <figure key={i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(img)} alt="" loading="lazy" />
            <figcaption>
              <button onClick={() => movePhoto(i, -1)} disabled={i === 0} title="Sposta a sinistra">
                ←
              </button>
              <span>{i + 1}</span>
              <button
                onClick={() => movePhoto(i, 1)}
                disabled={i === project.images.length - 1}
                title="Sposta a destra"
              >
                →
              </button>
              <button
                onClick={() =>
                  onChange((p) => ({ ...p, images: p.images.filter((_, k) => k !== i) }))
                }
                title="Elimina foto"
              >
                ✕
              </button>
            </figcaption>
          </figure>
        ))}
        <label className="add-photos">
          <span>
            + Aggiungi foto
            <br />o trascinale qui
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files?.length) onAddPhotos(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

// Resizes a photo to at most MAX_SIDE px and encodes it as JPEG, so uploads stay small.
async function resize(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Conversione non riuscita"))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(binary), width, height, preview: URL.createObjectURL(blob) };
}
