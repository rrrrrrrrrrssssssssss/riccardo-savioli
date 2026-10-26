"use client";

import { useEffect, useRef, useState } from "react";
import type { Block, Project } from "@/lib/content";
import { Scramble, ScrambleClock } from "./Scramble";

// Time the open project needs to fade out its caption and image before collapsing
// (see --fade in app/globals.css); another project opens only after that.
const SWITCH_DELAY = 450;

export default function Bio({ blocks }: { blocks: Block[] }) {
  const [open, setOpen] = useState<{ slug: string; index: number } | null>(null);

  const openProject = blocks.find(
    (b): b is Extract<Block, { type: "project" }> => b.type === "project" && b.slug === open?.slug,
  );
  const total = openProject?.project.images.length ?? 0;

  const step = (delta: number) =>
    setOpen((o) => o && { ...o, index: (o.index + delta + total) % total });

  const switchTimer = useRef<number | undefined>(undefined);
  const toggle = (slug: string) => {
    window.clearTimeout(switchTimer.current);
    if (open?.slug === slug) return setOpen(null);
    if (!open) return setOpen({ slug, index: 0 });
    setOpen(null);
    switchTimer.current = window.setTimeout(() => setOpen({ slug, index: 0 }), SWITCH_DELAY);
  };

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
    <ScrambleClock>
      <main className="bio">
        {blocks.map((b, i) => {
          if (b.type === "text")
            return (
              <p key={i} className="line">
                <Scramble text={b.text} />
              </p>
            );
          if (b.type === "contact")
            return (
              <p key={i} className="line">
                <Scramble text="You can contact him at " />
                <a href={`mailto:${b.email}`}>
                  <Scramble text={b.email} />
                </a>
                <Scramble text=" or " />
                <a
                  href={`https://www.instagram.com/${b.instagram}/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Scramble text={`@${b.instagram}`} />
                </a>
                <Scramble text={`. His VAT number is ${b.vat}.`} />
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
              onToggle={() => toggle(b.slug)}
              onStep={step}
            />
          );
        })}
      </main>
    </ScrambleClock>
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
  // While closing, keep showing the last image so it can fade out.
  const [shown, setShown] = useState(index);
  useEffect(() => {
    if (!isOpen) return;
    setMounted(true);
    setShown(index);
  }, [isOpen, index]);

  const total = project.images.length;
  const image = project.images[isOpen ? index : shown];

  // Preload the neighbouring photos so moving through the carousel doesn't wait for them.
  useEffect(() => {
    if (!isOpen) return;
    for (const i of [index + 1, index - 1]) {
      const next = project.images[(i + total) % total];
      if (next && !next.video) new window.Image().src = next.src;
    }
  }, [isOpen, index, project.images, total]);

  const digits = String(total).length;

  return (
    <div className={`project${isOpen ? " is-open" : ""}`}>
      <p className="line">
        <button className="title" onClick={onToggle} aria-expanded={isOpen} disabled={total === 0}>
          <Scramble text={label} />
          <span className="count">
            {isOpen ? (
              // Fixed-width slot for the current number, so the parentheses never move.
              <>
                (
                <span className="num" style={{ width: `${digits}ch` }}>
                  {index + 1}
                </span>
                /{"\u2002"}
                {total})
              </>
            ) : (
              <Scramble text={`(${total})`} />
            )}
          </span>
        </button>
        {isOpen && total > 1 && (
          <>
            <button className="nav" onClick={() => onStep(-1)}>
              Back
            </button>
            <button className="nav" onClick={() => onStep(1)}>
              Next
            </button>
          </>
        )}
      </p>
      <div className="panel" inert={!isOpen}>
        <div className="panel-inner">
          {mounted && image && (
            <figure>
              <div className="media">
                {image.video ? (
                  <video
                    key={image.src}
                    src={image.src}
                    width={image.width}
                    height={image.height}
                    muted
                    loop
                    autoPlay
                    playsInline
                    aria-label={`${label} — ${index + 1}/${total}`}
                    onClick={() => onStep(1)}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={image.src}
                    width={image.width}
                    height={image.height}
                    alt={`${label} — ${index + 1}/${total}`}
                    onClick={() => onStep(1)}
                  />
                )}
              </div>
              {project.caption && <figcaption className="caption">{project.caption}</figcaption>}
            </figure>
          )}
        </div>
      </div>
    </div>
  );
}
