"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Image, Project, RawBlock, Site } from "@/lib/content";
import { joinLabel, splitLabel } from "@/lib/label";
import { ACCEPT, convert, isMedia } from "@/lib/media";

// Layout: on the left the text, laid out line by line as on the site and editable in place;
// on the right a panel for the selected project (title, caption, photos and videos) or the contacts.

// A file uploaded in this session but not saved yet: its blob is on GitHub, shown from a local preview.
type EditorImage = Image & { pending?: { sha: string; preview: string } };
type EditorProject = { caption: string; images: EditorImage[] };
type Row = { id: number; block: RawBlock };
type ProjectBlock = Extract<RawBlock, { type: "project" }>;
type ContactBlock = Extract<RawBlock, { type: "contact" }>;
type Upload = { id: number; slug: string; name: string; label: string };

const EMPTY: EditorProject = { caption: "", images: [] };

let nextId = 0;
const toRow = (block: RawBlock): Row => ({ id: nextId++, block });
const randomName = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

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
  // Media that exist in the repo, so removing them from a project deletes the file on save.
  const committed = useRef(
    new Set(Object.values(initialSite.projects).flatMap((p) => p.images.map((i) => i.src))),
  );
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const [selected, setSelected] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null); // text row to focus after render
  const [rowDrag, setRowDrag] = useState<number | null>(null);
  const [rowOver, setRowOver] = useState<number | null>(null);
  const [fileOver, setFileOver] = useState<number | null>(null);

  // A file dropped outside a project must not make the browser open it and leave the admin.
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

  // ⌘S / Ctrl+S saves.
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changed = () => {
    setDirty(true);
    setNotice(null);
  };

  // Rows

  const updateRow = (id: number, block: RawBlock) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, block } : r)));
    changed();
  };

  const insertAt = (index: number, block: RawBlock) => {
    const row = toRow(block);
    setRows((rs) => [...rs.slice(0, index), row, ...rs.slice(index)]);
    changed();
    if (block.type === "project") setSelected(row.id);
    else setFocusId(row.id);
  };

  const moveRow = (id: number, to: number) => {
    setRows((rs) => {
      const from = rs.findIndex((r) => r.id === id);
      if (from < 0 || from === to || to < 0 || to >= rs.length) return rs;
      const next = [...rs];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
    changed();
  };

  const removeRow = (row: Row) => {
    const b = row.block;
    if (b.type === "project") {
      const n = projects[b.slug]?.images.length ?? 0;
      const files = n ? ` e i suoi ${n} file` : "";
      if (!confirm(`Eliminare il progetto "${b.label || "senza titolo"}"${files}?`)) return;
    }
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    if (selected === row.id) setSelected(null);
    changed();
  };

  const newProject = (label: string): ProjectBlock => {
    const slug = `p-${randomName()}`;
    setProjects((ps) => ({ ...ps, [slug]: { caption: "", images: [] } }));
    return { type: "project", slug, label };
  };

  // Switching a line between text and project keeps its words.
  const toProject = (row: Row) => {
    if (row.block.type !== "text") return;
    updateRow(row.id, newProject(row.block.text));
    setSelected(row.id);
  };

  const toText = (row: Row) => {
    const b = row.block;
    if (b.type !== "project") return;
    const n = projects[b.slug]?.images.length ?? 0;
    const warning = `"${b.label}" tornerà testo semplice e i suoi ${n} file verranno eliminati al salvataggio. Continuare?`;
    if (n && !confirm(warning)) return;
    updateRow(row.id, { type: "text", text: b.label });
    if (selected === row.id) setSelected(null);
  };

  // Projects and media

  const updateProject = (slug: string, fn: (p: EditorProject) => EditorProject) => {
    setProjects((ps) => ({ ...ps, [slug]: fn(ps[slug] ?? EMPTY) }));
    changed();
  };

  const setUploadLabel = (id: number, label: string) =>
    setUploads((us) => us.map((u) => (u.id === id ? { ...u, label } : u)));

  const addFiles = async (slug: string, files: FileList) => {
    const all = [...files];
    const list = all.filter(isMedia);
    if (list.length < all.length) {
      setNotice({ text: "Alcuni file non sono foto o video e sono stati ignorati.", error: true });
    }
    const queued = list.map((file) => ({ id: nextId++, slug, name: file.name, label: "In coda" }));
    setUploads((us) => [...us, ...queued]);

    for (const [k, file] of list.entries()) {
      const { id } = queued[k];
      try {
        setUploadLabel(id, "Conversione…");
        const { blob, ext, width, height, video } = await convert(file, (p) =>
          setUploadLabel(id, `Conversione ${Math.round(p * 100)}%`),
        );
        setUploadLabel(id, "Caricamento…");
        const res = await fetch("/api/admin/upload", { method: "POST", body: blob });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        const image: EditorImage = {
          src: `/projects/${slug}/${randomName()}.${ext}`,
          width,
          height,
          ...(video && { video }),
          pending: { sha: json.sha, preview: URL.createObjectURL(blob) },
        };
        updateProject(slug, (p) => ({ ...p, images: [...p.images, image] }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setNotice({ text: `${file.name} non caricato: ${message}`, error: true });
      } finally {
        setUploads((us) => us.filter((u) => u.id !== id));
      }
    }
  };

  const mediaUrl = (img: EditorImage) =>
    img.pending?.preview ?? `https://raw.githubusercontent.com/${repo}/${sha}/public${img.src}`;

  // Save: one commit with site.json, new media and removed media.

  const save = async () => {
    if (saving || uploads.length > 0 || !dirty) return;
    setSaving(true);
    setNotice(null);

    const blocks = rows.map((r) => r.block);
    const used = new Set(blocks.flatMap((b) => (b.type === "project" ? [b.slug] : [])));
    const kept: Record<string, Project> = {};
    const added: { path: string; sha: string }[] = [];
    for (const slug of used) {
      const p = projects[slug] ?? EMPTY;
      kept[slug] = { caption: p.caption, images: p.images.map(({ pending, ...image }) => image) };
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
        body: JSON.stringify({ site: { blocks, projects: kept }, added, removed, baseSha: sha }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      committed.current = keptSrc;
      setProjects(kept);
      setSha(json.sha);
      setDirty(false);
      setNotice({ text: "Salvato. Il sito online si aggiorna in circa un minuto." });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setNotice({ text: `Salvataggio non riuscito. ${message}`, error: true });
    } finally {
      setSaving(false);
    }
  };
  saveRef.current = save;

  // Rendering

  const selectedRow = rows.find((r) => r.id === selected) ?? null;
  const status = uploads.length
    ? `Caricamento di ${uploads.length} file…`
    : saving
      ? "Salvataggio…"
      : (notice?.text ?? (dirty ? "Modifiche non salvate" : "Tutto salvato"));

  const renderPanel = () => {
    if (!selectedRow) return <PanelHelp />;
    const { id } = selectedRow;
    const b = selectedRow.block;
    if (b.type === "project") {
      return (
        <ProjectPanel
          key={id}
          label={b.label}
          project={projects[b.slug] ?? EMPTY}
          uploads={uploads.filter((u) => u.slug === b.slug)}
          mediaUrl={mediaUrl}
          onLabel={(label) => updateRow(id, { ...b, label })}
          onChange={(fn) => updateProject(b.slug, fn)}
          onAddFiles={(files) => addFiles(b.slug, files)}
          onClose={() => setSelected(null)}
          onToText={() => toText(selectedRow)}
          onRemove={() => removeRow(selectedRow)}
        />
      );
    }
    if (b.type === "contact") {
      return (
        <ContactPanel
          block={b}
          onChange={(block) => updateRow(id, block)}
          onClose={() => setSelected(null)}
        />
      );
    }
    return <PanelHelp />;
  };

  return (
    <div className={`admin editor${selectedRow ? " has-selection" : ""}`}>
      <header className="bar">
        <span className="brand">Admin</span>
        <span className={`status${notice?.error ? " error" : ""}${dirty ? " dirty" : ""}`}>
          {status}
          {notice && (
            <button className="dismiss" onClick={() => setNotice(null)} title="Chiudi messaggio">
              ✕
            </button>
          )}
        </span>
        <span className="spacer" />
        <a href="/" target="_blank" rel="noreferrer">
          Vedi sito ↗
        </a>
        <form method="post" action="/api/admin/logout">
          <button>Esci</button>
        </form>
        <button
          className="save"
          onClick={save}
          disabled={saving || uploads.length > 0 || !dirty}
          title="Salva (⌘S)"
        >
          {saving ? "Salvataggio…" : "Salva"}
        </button>
      </header>

      <main className="layout">
        <section className="doc" aria-label="Testo">
          <ol>
            {rows.map((row, i) => {
              const b = row.block;
              const slug = b.type === "project" ? b.slug : null;
              return (
                <Fragment key={row.id}>
                  <Inserter
                    onText={() => insertAt(i, { type: "text", text: "" })}
                    onProject={() => insertAt(i, newProject(""))}
                  />
                  <BlockRow
                    row={row}
                    index={i}
                    count={rows.length}
                    images={slug ? (projects[slug]?.images.length ?? 0) : 0}
                    uploading={slug ? uploads.filter((u) => u.slug === slug).length : 0}
                    selected={selected === row.id}
                    dragging={rowDrag === row.id}
                    dropBefore={rowDrag !== null && rowDrag !== row.id && rowOver === row.id}
                    fileOver={fileOver === row.id}
                    focus={focusId === row.id}
                    onFocused={() => setFocusId(null)}
                    onSelect={() => setSelected(selected === row.id ? null : row.id)}
                    onChange={(block) => updateRow(row.id, block)}
                    onEnter={() => insertAt(i + 1, { type: "text", text: "" })}
                    onRemoveEmpty={() => {
                      const prev = rows
                        .slice(0, i)
                        .reverse()
                        .find((r) => r.block.type === "text");
                      setRows((rs) => rs.filter((r) => r.id !== row.id));
                      changed();
                      if (prev) setFocusId(prev.id);
                    }}
                    onMove={(delta) => moveRow(row.id, i + delta)}
                    onRemove={() => removeRow(row)}
                    onToProject={() => toProject(row)}
                    onToText={() => toText(row)}
                    drag={{
                      onDragStart: (e) => {
                        e.dataTransfer.setData("application/x-admin-row", String(row.id));
                        e.dataTransfer.effectAllowed = "move";
                        const li = (e.currentTarget as HTMLElement).closest("li");
                        if (li) e.dataTransfer.setDragImage(li, 0, 0);
                        setRowDrag(row.id);
                      },
                      onDragEnd: () => {
                        setRowDrag(null);
                        setRowOver(null);
                      },
                    }}
                    drop={{
                      onDragOver: (e) => {
                        if (rowDrag !== null) {
                          e.preventDefault();
                          setRowOver(row.id);
                        } else if (slug && hasFiles(e)) {
                          e.preventDefault();
                          setFileOver(row.id);
                        }
                      },
                      onDragLeave: (e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver(null);
                      },
                      onDrop: (e) => {
                        e.preventDefault();
                        if (rowDrag !== null) {
                          moveRow(rowDrag, i);
                          setRowDrag(null);
                          setRowOver(null);
                        } else if (slug && e.dataTransfer.files.length) {
                          setFileOver(null);
                          setSelected(row.id);
                          addFiles(slug, e.dataTransfer.files);
                        }
                      },
                    }}
                  />
                </Fragment>
              );
            })}
            <Inserter
              always
              onText={() => insertAt(rows.length, { type: "text", text: "" })}
              onProject={() => insertAt(rows.length, newProject(""))}
            />
          </ol>
        </section>

        <aside className="panel" aria-label="Dettagli">
          {renderPanel()}
        </aside>
      </main>
    </div>
  );
}

function PanelHelp() {
  return (
    <div className="panel-body panel-help">
      <p>
        Clicca un <u>progetto</u> nel testo per modificarne titolo, didascalia, foto e video. Puoi
        anche trascinare i file direttamente sul progetto.
      </p>
      <ul>
        <li>Scrivi direttamente nel testo: ogni riga va a capo come sul sito.</li>
        <li>
          <kbd>Invio</kbd> crea una nuova riga, <kbd>⌫</kbd> su una riga vuota la elimina.
        </li>
        <li>Passa tra due righe per inserire un testo o un progetto.</li>
        <li>
          Trascina <span className="muted">⋮⋮</span> a sinistra di una riga per spostarla.
        </li>
        <li>
          Foto e video vengono convertiti e ridimensionati per il web; i video sono senza audio e in
          loop.
        </li>
        <li>
          <kbd>⌘S</kbd> salva. Il sito online si aggiorna circa un minuto dopo.
        </li>
      </ul>
    </div>
  );
}

// One line of the text: plain text, a project or the contacts.
function BlockRow({
  row,
  index,
  count,
  images,
  uploading,
  selected,
  dragging,
  dropBefore,
  fileOver,
  focus,
  onFocused,
  onSelect,
  onChange,
  onEnter,
  onRemoveEmpty,
  onMove,
  onRemove,
  onToProject,
  onToText,
  drag,
  drop,
}: {
  row: Row;
  index: number;
  count: number;
  images: number;
  uploading: number;
  selected: boolean;
  dragging: boolean;
  dropBefore: boolean;
  fileOver: boolean;
  focus: boolean;
  onFocused: () => void;
  onSelect: () => void;
  onChange: (block: RawBlock) => void;
  onEnter: () => void;
  onRemoveEmpty: () => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onToProject: () => void;
  onToText: () => void;
  drag: Pick<React.HTMLAttributes<HTMLElement>, "onDragStart" | "onDragEnd">;
  drop: Pick<React.HTMLAttributes<HTMLElement>, "onDragOver" | "onDragLeave" | "onDrop">;
}) {
  const b = row.block;
  const className = [
    "block",
    `block-${b.type}`,
    selected && "is-selected",
    dragging && "is-dragging",
    dropBefore && "is-drop-before",
    fileOver && "is-file-over",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={className} {...drop}>
      <span className="handle" draggable title="Trascina per spostare" {...drag}>
        ⋮⋮
      </span>

      <div className="content">
        {b.type === "text" && (
          <AutoText
            value={b.text}
            focus={focus}
            onFocused={onFocused}
            placeholder="Scrivi…"
            onChange={(e) => onChange({ ...b, text: e.target.value.replace(/\n/g, " ") })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              } else if (e.key === "Backspace" && b.text === "") {
                e.preventDefault();
                onRemoveEmpty();
              }
            }}
          />
        )}

        {b.type === "project" && (
          <button className="project-line" onClick={onSelect} aria-pressed={selected}>
            <ProjectLabel label={b.label} />
            <span className="count">({images})</span>
            {uploading > 0 && <span className="busy">caricamento…</span>}
          </button>
        )}

        {b.type === "contact" && (
          <button className="contact-line" onClick={onSelect} aria-pressed={selected}>
            You can contact him at <u>{b.email}</u> or <u>@{b.instagram}</u>. His VAT number is{" "}
            <u>{b.vat}</u>.
          </button>
        )}
      </div>

      <span className="tools">
        <button onClick={() => onMove(-1)} disabled={index === 0} title="Sposta su">
          ↑
        </button>
        <button onClick={() => onMove(1)} disabled={index === count - 1} title="Sposta giù">
          ↓
        </button>
        {b.type === "text" && (
          <button onClick={onToProject} title="Trasforma questa riga in un progetto">
            Rendi progetto
          </button>
        )}
        {b.type === "project" && (
          <button onClick={onToText} title="Trasforma il progetto in testo semplice">
            Rendi testo
          </button>
        )}
        {b.type !== "contact" && (
          <button className="danger" onClick={onRemove} title="Elimina riga">
            ✕
          </button>
        )}
      </span>
    </li>
  );
}

// Between two lines: a "+" in the left margin that opens the choice of what to insert.
function Inserter({
  always,
  onText,
  onProject,
}: {
  always?: boolean;
  onText: () => void;
  onProject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  if (always) {
    return (
      <li className="inserter always">
        <button onClick={onText}>+ Testo</button>
        <button onClick={onProject}>+ Progetto</button>
      </li>
    );
  }
  return (
    <li className={`inserter${open ? " is-open" : ""}`} onMouseLeave={() => setOpen(false)}>
      <span className="inserter-line" />
      <button className="plus" onClick={() => setOpen(!open)} title="Inserisci una riga qui">
        +
      </button>
      {open && (
        <span className="inserter-menu">
          <button onClick={pick(onText)}>Testo</button>
          <button onClick={pick(onProject)}>Progetto</button>
        </span>
      )}
    </li>
  );
}

// Textarea that grows with its content, so each line reads like the text on the site.
function AutoText({
  focus,
  onFocused,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  focus?: boolean;
  onFocused?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [props.value]);

  useEffect(() => {
    if (!focus) return;
    const el = ref.current!;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    onFocused?.();
  }, [focus, onFocused]);

  return <textarea ref={ref} rows={1} {...props} />;
}

function ProjectPanel({
  label,
  project,
  uploads,
  mediaUrl,
  onLabel,
  onChange,
  onAddFiles,
  onClose,
  onToText,
  onRemove,
}: {
  label: string;
  project: EditorProject;
  uploads: Upload[];
  mediaUrl: (img: EditorImage) => string;
  onLabel: (label: string) => void;
  onChange: (fn: (p: EditorProject) => EditorProject) => void;
  onAddFiles: (files: FileList) => void;
  onClose: () => void;
  onToText: () => void;
  onRemove: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [fileOver, setFileOver] = useState(false);
  const total = project.images.length;

  const move = (from: number, to: number) =>
    onChange((p) => {
      if (from === to || to < 0 || to >= p.images.length) return p;
      const images = [...p.images];
      images.splice(to, 0, ...images.splice(from, 1));
      return { ...p, images };
    });

  const endDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <div
      className={`panel-body${fileOver ? " is-file-over" : ""}`}
      onDragOver={(e) => {
        if (dragFrom !== null || !hasFiles(e)) return;
        e.preventDefault();
        setFileOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileOver(false);
      }}
      onDrop={(e) => {
        if (dragFrom !== null) return;
        e.preventDefault();
        setFileOver(false);
        if (e.dataTransfer.files.length) onAddFiles(e.dataTransfer.files);
      }}
    >
      <div className="panel-head">
        <span className="kicker">Progetto</span>
        <button className="close" onClick={onClose} title="Chiudi">
          ✕
        </button>
      </div>

      <TitleFields label={label} onLabel={onLabel} />

      <label className="field">
        <span>Didascalia</span>
        <AutoText
          className="caption-input"
          value={project.caption}
          onChange={(e) => onChange((p) => ({ ...p, caption: e.target.value }))}
          placeholder="Testo che compare sotto le immagini"
        />
      </label>

      <div className="field">
        <span>
          Foto e video <span className="muted">({total})</span>
          {total > 1 && <span className="muted"> · trascina per riordinare</span>}
        </span>
        <div className="grid">
          {project.images.map((img, i) => (
            <figure
              key={i}
              draggable
              className={
                i === dragFrom
                  ? "is-dragging"
                  : i === dragOver && dragFrom !== null
                    ? "is-over"
                    : ""
              }
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-admin-photo", String(i));
                e.dataTransfer.effectAllowed = "move";
                setDragFrom(i);
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.stopPropagation();
                setDragOver(i);
              }}
              onDrop={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.stopPropagation();
                move(dragFrom, i);
                endDrag();
              }}
              onDragEnd={endDrag}
            >
              {img.video ? (
                <video src={mediaUrl(img)} muted loop autoPlay playsInline draggable={false} />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={mediaUrl(img)} alt="" loading="lazy" draggable={false} />
              )}
              <span className="index">{i + 1}</span>
              {img.video && <span className="badge">Video</span>}
              <button
                className="remove"
                onClick={() =>
                  onChange((p) => ({ ...p, images: p.images.filter((_, k) => k !== i) }))
                }
                title="Elimina"
              >
                ✕
              </button>
            </figure>
          ))}

          {uploads.map((u) => (
            <figure key={`u${u.id}`} className="uploading">
              <span className="upload-name">{u.name}</span>
              <span className="upload-state">{u.label}</span>
            </figure>
          ))}

          <label className="add">
            <span>
              + Aggiungi
              <small>o trascina qui foto e video</small>
            </span>
            <input
              type="file"
              accept={ACCEPT}
              multiple
              onChange={(e) => {
                if (e.target.files?.length) onAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className="panel-foot">
        <button onClick={onToText}>Rendi testo semplice</button>
        <button className="danger" onClick={onRemove}>
          Elimina progetto
        </button>
      </div>
    </div>
  );
}

// A project line in the text column: the clickable name underlined, the words around it plain.
function ProjectLabel({ label }: { label: string }) {
  const { before, name, after } = splitLabel(label);
  if (!name.trim()) return <span className="label empty">Progetto senza titolo</span>;
  return (
    <>
      {before && <span className="plain">{before}</span>}
      <span className="label">{name}</span>
      {after && <span className="plain">{after}</span>}
    </>
  );
}

// The project line edited as the sentence it is part of: [text before] [name] [text after].
// Only the name is clickable on the site; spaces between the parts are added automatically.
function TitleFields({ label, onLabel }: { label: string; onLabel: (label: string) => void }) {
  const [parts, setParts] = useState(() => {
    const p = splitLabel(label);
    return { before: p.before.trim(), name: p.name, after: p.after.trim() };
  });
  const update = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch };
    setParts(next);
    onLabel(joinLabel(next));
  };
  const part = (key: keyof typeof parts, placeholder: string, extra = {}) => (
    <input
      className={`part part-${key}`}
      value={parts[key]}
      placeholder={placeholder}
      size={Math.max(parts[key].length, placeholder.length, 1)}
      onChange={(e) => update({ [key]: e.target.value })}
      {...extra}
    />
  );

  return (
    <div className="field">
      <span>Riga nel testo</span>
      <div className="sentence">
        {part("before", "testo prima", { "aria-label": "Testo prima del nome (facoltativo)" })}
        {part("name", "Nome del progetto", {
          "aria-label": "Nome del progetto (cliccabile)",
          autoFocus: !parts.name,
        })}
        {part("after", "dopo", { "aria-label": "Testo dopo il nome (facoltativo)" })}
      </div>
      <small className="muted">
        Sul sito è cliccabile solo il <u>nome</u>. Il testo prima e dopo (articoli, “by…”,
        punteggiatura) è facoltativo e resta testo normale.
      </small>
    </div>
  );
}

function ContactPanel({
  block,
  onChange,
  onClose,
}: {
  block: ContactBlock;
  onChange: (block: RawBlock) => void;
  onClose: () => void;
}) {
  return (
    <div className="panel-body">
      <div className="panel-head">
        <span className="kicker">Contatti</span>
        <button className="close" onClick={onClose} title="Chiudi">
          ✕
        </button>
      </div>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          value={block.email}
          onChange={(e) => onChange({ ...block, email: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Instagram</span>
        <input
          value={block.instagram}
          onChange={(e) => onChange({ ...block, instagram: e.target.value.replace(/^@/, "") })}
        />
      </label>
      <label className="field">
        <span>Partita IVA</span>
        <input value={block.vat} onChange={(e) => onChange({ ...block, vat: e.target.value })} />
      </label>
    </div>
  );
}
