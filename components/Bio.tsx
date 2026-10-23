"use client";

import { useEffect, useState } from "react";
import type { Block, Project } from "@/lib/content";

export default function Bio({ blocks }: { blocks: Block[] }) {
  const [open, setOpen] = useState<{ slug: string; index: number } | null>(null);

  const openProject = blocks.find(
    (b): b is Extract<Block, { type: "project" }> => b.type === "project" && b.slug === open?.slug,
  );
  const total = openProject?.project.images.length ?? 0;

  const step = (delta: number) =>
    setOpen((o) => o && { ...o, index: (o.index + delta + total) % total });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="bio">
      {blocks.map((b, i) => {
        if (b.type === "text") return <p key={i} className="line">{b.text}</p>;
        if (b.type === "contact")
          return (
            <p key={i} className="line">
              You can contact him at <a href={`mailto:${b.email}`}>{b.email}</a> or{" "}
              <a href={`https://www.instagram.com/${b.instagram}/`} target="_blank" rel="noreferrer">
                @{b.instagram}
              </a>
              . His VAT number is {b.vat}.
            </p>
          );
        const isOpen = open?.slug === b.slug;
        return (
          <ProjectLine
            key={b.slug}
            label={b.label}
            project={b.project}
            isOpen={isOpen}
            index={isOpen ? open.index : 0}
            onToggle={() => setOpen(isOpen ? null : { slug: b.slug, index: 0 })}
            onStep={step}
          />
        );
      })}
    </main>
  );
}

function ProjectLine({
  label,
  project,
  isOpen,
  index,
  onToggle,
  onStep,
}: {
  label: string;
  project: Project;
  isOpen: boolean;
  index: number;
  onToggle: () => void;
  onStep: (delta: number) => void;
}) {
  // Images are only loaded once the project has been opened the first time.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (isOpen) setMounted(true);
  }, [isOpen]);

  const total = project.images.length;
  const image = project.images[index];

  return (
    <div className={`project${isOpen ? " is-open" : ""}`}>
      <p className="line">
        <button className="title" onClick={onToggle} aria-expanded={isOpen}>
          {label}
          <span className="count">{isOpen ? `(${index + 1}/ ${total})` : `(${total})`}</span>
        </button>
        {isOpen && total > 1 && (
          <>
            <button className="nav" onClick={() => onStep(-1)}>Back</button>
            <button className="nav" onClick={() => onStep(1)}>Next</button>
          </>
        )}
      </p>
      <div className="panel" inert={!isOpen}>
        <div className="panel-inner">
          {mounted && image && (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.src}
                width={image.width}
                height={image.height}
                alt={`${label} — ${index + 1}/${total}`}
                onClick={() => onStep(1)}
              />
              {project.caption && <figcaption className="caption">{project.caption}</figcaption>}
            </figure>
          )}
        </div>
      </div>
    </div>
  );
}
