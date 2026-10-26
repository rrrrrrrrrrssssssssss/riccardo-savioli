"use client";

import { useEffect, useRef, useState } from "react";
import type { Block, Project } from "@/lib/content";
import { Scramble, ScrambleClock } from "./Scramble";

// Keep in sync with app/globals.css: --open-duration, and the caption + image fade-out (--fade × 1.8).
const OPEN_DURATION = 600;
const CLOSE_FADE = 450;

export default function Bio({ blocks }: { blocks: Block[] }) {
  const [open, setOpen] = useState<{ slug: string; index: number } | null>(null);
  // The open project is fading out its caption and image before its panel collapses.
  const [closing, setClosing] = useState(false);

  const openProject = blocks.find(
    (b): b is Extract<Block, { type: "project" }> => b.type === "project" && b.slug === open?.slug,
  );
  const total = openProject?.project.images.length ?? 0;

  const step = (delta: number) =>
    setOpen((o) => o && { ...o, index: (o.index + delta + total) % total });

  // Closing fades out first; then, in the same frame, the old panel collapses and the new one
  // (if any) opens, so only the text between the two projects moves.
  const timer = useRef<number | undefined>(undefined);
  const toggle = (slug: string) => {
    window.clearTimeout(timer.current);
    if (!open) {
      setClosing(false);
      return setOpen({ slug, index: 0 });
    }
    if (open.slug === slug && closing) return setClosing(false); // reopened while fading out
    const next = open.slug === slug ? null : { slug, index: 0 };
    setClosing(true);
    timer.current = window.setTimeout(() => {
      setClosing(false);
      setOpen(next);
    }, CLOSE_FADE);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape" && !closing) toggle(open.slug);
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
              isClosing={isOpen && closing}
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
  isClosing,
  index,
  onToggle,
  onStep,
}: {
  label: string;
  project: Project;
  isOpen: boolean;
  isClosing: boolean;
  index: number;
  onToggle: () => void;
  onStep: (delta: number) => void;
}) {
  // Images load once the title is hovered or the project opened, not with the page.
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

  // The image and caption fade in only once the image has loaded, and not before the text has
  // finished moving: revealDelay is how long they still have to wait at that moment.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [revealDelay, setRevealDelay] = useState<number | null>(null);
  const openedAt = useRef(0);
  useEffect(() => {
    if (isOpen) openedAt.current = performance.now();
    else setRevealDelay(null);
  }, [isOpen]);
  useEffect(() => {
    if (isOpen && revealDelay === null && image && loadedSrc === image.src) {
      setRevealDelay(Math.max(0, OPEN_DURATION - (performance.now() - openedAt.current)));
    }
  }, [isOpen, revealDelay, image, loadedSrc]);
  const loaded = () => image && setLoadedSrc(image.src);

  // Preload the neighbouring photos so moving through the carousel doesn't wait for them.
  useEffect(() => {
    if (!isOpen) return;
    for (const i of [index + 1, index - 1]) {
      const next = project.images[(i + total) % total];
      if (next && !next.video) new window.Image().src = next.src;
    }
  }, [isOpen, index, project.images, total]);

  // is-shown fades image and caption in; is-hiding fades them out, only if they were visible.
  const revealed = isOpen && revealDelay !== null;
  const stateClass = revealed ? (isClosing ? " is-hiding" : " is-shown") : "";

  return (
    <div
      className={`project${isOpen ? " is-open" : ""}${stateClass}`}
      style={
        {
          "--reveal-delay": `${revealDelay ?? 0}ms`,
        } as React.CSSProperties
      }
    >
      <p className="line">
        <button
          className="title"
          onClick={onToggle}
          onMouseEnter={() => total && setMounted(true)}
          aria-expanded={isOpen}
          disabled={total === 0}
        >
          <Scramble text={label} />
          <span className="count">
            {isOpen ? (
              // As wide as the widest counter of this project (invisible copies set the width),
              // so Back and Next never move while the number changes.
              <span className="count-box">
                {project.images.map((_, k) => (
                  <span key={k} className="count-sizer" aria-hidden="true">
                    ({k + 1}/ {total})
                  </span>
                ))}
                <span>
                  <Scramble text={`(${index + 1}/ ${total})`} />
                </span>
              </span>
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
                    onLoadedData={loaded}
                    onError={loaded}
                    onClick={() => onStep(1)}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={image.src}
                    src={image.src}
                    width={image.width}
                    height={image.height}
                    alt={`${label} — ${index + 1}/${total}`}
                    onLoad={loaded}
                    onError={loaded}
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
