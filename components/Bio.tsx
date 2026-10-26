"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Block, Image, Project } from "@/lib/content";
import { Scramble, ScrambleClock } from "./Scramble";

// Keep in sync with app/globals.css: --open-duration, and the caption + image fade-out (--fade × 1.8).
const OPEN_DURATION = 600;
const CLOSE_FADE = 450;
// If the first image is slow (bad connection), show the project anyway after this long;
// the image then appears as soon as it arrives.
const REVEAL_TIMEOUT = 800;

// Mobile: scroll so the project being opened sits near the top of the screen, with two lines of
// text above it, so its carousel doesn't open half off-screen.
function bringToTop(slug: string) {
  if (!window.matchMedia("(max-width: 767px)").matches) return;
  const el = document.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`);
  if (!el) return;
  let top = el.getBoundingClientRect().top + window.scrollY;
  // A project above that collapses at the same moment will pull this one up by its panel height.
  for (const other of document.querySelectorAll<HTMLElement>(".project.is-open")) {
    if (other !== el && other.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
      top -= other.querySelector(".panel")!.getBoundingClientRect().height;
    }
  }
  const leading = parseFloat(getComputedStyle(el.querySelector(".line")!).lineHeight) || 20;
  const target = Math.max(0, top - 2 * leading);
  window.scrollTo({ top: target, behavior: "smooth" });
  // Near the end of the page the target may only become reachable once the panel has opened.
  window.setTimeout(() => {
    if (Math.abs(window.scrollY - target) > 2) window.scrollTo({ top: target, behavior: "smooth" });
  }, OPEN_DURATION);
}

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
      bringToTop(slug);
      return setOpen({ slug, index: 0 });
    }
    if (open.slug === slug && closing) return setClosing(false); // reopened while fading out
    const next = open.slug === slug ? null : { slug, index: 0 };
    setClosing(true);
    timer.current = window.setTimeout(() => {
      setClosing(false);
      if (next) bringToTop(next.slug);
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
              slug={b.slug}
              label={b.label}
              project={b.project}
              isOpen={isOpen}
              isClosing={isOpen && closing}
              index={isOpen ? open.index : 0}
              onToggle={() => toggle(b.slug)}
              onStep={step}
              onSelect={(index) => setOpen((o) => o && { ...o, index })}
            />
          );
        })}
      </main>
    </ScrambleClock>
  );
}

function ProjectLine({
  slug,
  label,
  project,
  isOpen,
  isClosing,
  index,
  onToggle,
  onStep,
  onSelect,
}: {
  slug: string;
  label: string;
  project: Project;
  isOpen: boolean;
  isClosing: boolean;
  index: number;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onSelect: (index: number) => void;
}) {
  const mobile = useMediaQuery("(max-width: 767px)");
  const lineRef = useRef<HTMLParagraphElement>(null);
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

  // Mobile has no hover: start loading the first image once the title is on screen.
  useEffect(() => {
    if (!mobile || mounted || !total) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setMounted(true);
    });
    observer.observe(lineRef.current!);
    return () => observer.disconnect();
  }, [mobile, mounted, total]);
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
  useEffect(() => {
    if (!isOpen || revealDelay !== null) return;
    const timer = window.setTimeout(() => setRevealDelay(0), OPEN_DURATION + REVEAL_TIMEOUT);
    return () => window.clearTimeout(timer);
  }, [isOpen, revealDelay]);

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
      data-slug={slug}
      className={`project${isOpen ? " is-open" : ""}${isOpen && isClosing ? " is-closing" : ""}${stateClass}`}
      style={
        {
          "--reveal-delay": `${revealDelay ?? 0}ms`,
        } as React.CSSProperties
      }
    >
      <p className="line" ref={lineRef}>
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
                {mobile ? (
                  <Strip
                    isOpen={isOpen}
                    images={project.images}
                    index={isOpen ? index : shown}
                    label={label}
                    onSelect={onSelect}
                    onLoaded={setLoadedSrc}
                  />
                ) : (
                  <MediaItem
                    key={image.src}
                    image={image}
                    alt={`${label} — ${(isOpen ? index : shown) + 1}/${total}`}
                    active
                    onLoaded={setLoadedSrc}
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

// Mobile: all the media of a project side by side with the page margin between them, moved by
// swiping. Each swipe moves exactly one item: past SWIPE_DISTANCE of the width or faster than
// SWIPE_SPEED it goes to the next/previous one, otherwise it springs back. Vertical swipes scroll
// the page as usual. The height follows the finger, blending between the two items involved.
// Only the current item and its neighbours are loaded (just the first while closed).
const NEAR = 1;
const SWIPE_DISTANCE = 0.2;
const SWIPE_SPEED = 0.3; // px per ms
const SLIDE_DURATION = 300;

function Strip({
  images,
  index,
  isOpen,
  label,
  onSelect,
  onLoaded,
}: {
  images: Image[];
  index: number;
  isOpen: boolean;
  label: string;
  onSelect: (index: number) => void;
  onLoaded: (src: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const resting = useRef(index); // the item the track currently rests on
  const gesture = useRef<{
    x: number;
    y: number;
    dx: number;
    t: number;
    speed: number;
    dragging: boolean;
  } | null>(null);

  const last = images.length - 1;
  const clamp = (n: number) => Math.min(Math.max(n, 0), last);
  const pitch = () =>
    ref.current!.clientWidth + (parseFloat(getComputedStyle(track.current!).columnGap) || 0);
  const heightAt = (pos: number) => {
    const w = ref.current!.clientWidth;
    const p = clamp(pos);
    const i = Math.floor(p);
    const h = (k: number) => (w * images[k].height) / images[k].width;
    return h(i) + (h(Math.min(i + 1, last)) - h(i)) * (p - i);
  };

  // Puts the track at a (possibly fractional) item position, sliding there or jumping.
  // Transform and height are set on the elements directly so they can follow the finger.
  const place = (pos: number, slide: boolean) => {
    const el = ref.current;
    const tr = track.current;
    if (!el || !tr || !el.clientWidth) return;
    const ease = `${SLIDE_DURATION}ms var(--ease)`;
    tr.style.transition = slide ? `transform ${ease}` : "none";
    el.style.transition = slide ? `height ${ease}` : "none";
    tr.style.transform = `translate3d(${-pos * pitch()}px, 0, 0)`;
    el.style.height = `${heightAt(pos)}px`;
  };

  // New index (swipe, Back, Next, keys): slide there; wrapping around jumps instead.
  useLayoutEffect(() => {
    const far = Math.abs(index - resting.current) > 1;
    place(index, index !== resting.current && !far);
    resting.current = index;
  }, [index]);

  // Width changes (rotation, resize): re-place without animation.
  useLayoutEffect(() => {
    let width = ref.current!.clientWidth;
    const observer = new ResizeObserver(() => {
      const w = ref.current!.clientWidth;
      if (w !== width && !gesture.current?.dragging) place(resting.current, false);
      width = w;
    });
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);

  const end = (cancelled: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.dragging) return;
    let target = index;
    if (!cancelled) {
      const w = ref.current!.clientWidth;
      if (g.dx < -w * SWIPE_DISTANCE || g.speed < -SWIPE_SPEED) target = clamp(index + 1);
      else if (g.dx > w * SWIPE_DISTANCE || g.speed > SWIPE_SPEED) target = clamp(index - 1);
    }
    if (target !== index) onSelect(target);
    else place(index, true);
  };

  const near = isOpen ? NEAR : 0;
  return (
    <div
      ref={ref}
      className="strip"
      onPointerDown={(e) => {
        if (!e.isPrimary) return;
        gesture.current = {
          x: e.clientX,
          y: e.clientY,
          dx: 0,
          t: e.timeStamp,
          speed: 0,
          dragging: false,
        };
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g || !e.isPrimary) return;
        const dx = e.clientX - g.x;
        if (!g.dragging) {
          if (Math.abs(dx) < 8) return;
          if (Math.abs(e.clientY - g.y) > Math.abs(dx)) {
            gesture.current = null; // a vertical scroll of the page
            return;
          }
          g.dragging = true;
          try {
            ref.current!.setPointerCapture(e.pointerId);
          } catch {}
        }
        const dt = e.timeStamp - g.t;
        if (dt > 0) g.speed = 0.7 * ((dx - g.dx) / dt) + 0.3 * g.speed;
        g.dx = dx;
        g.t = e.timeStamp;
        // Past the first and last item the strip resists.
        let pos = index - dx / pitch();
        if (pos < 0) pos /= 3;
        if (pos > last) pos = last + (pos - last) / 3;
        place(pos, false);
      }}
      onPointerUp={() => end(false)}
      onPointerCancel={() => end(true)}
    >
      <div ref={track} className="track">
        {images.map((img, i) => (
          <div key={i} className="slide" style={{ aspectRatio: `${img.width} / ${img.height}` }}>
            {Math.abs(i - index) <= near && (
              <MediaItem
                image={img}
                alt={`${label} — ${i + 1}/${images.length}`}
                active={i === index}
                onLoaded={onLoaded}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// One photo or silent looping video. Its box is sized from the known proportions (the --ratio
// variable and the width/height attributes), so the layout is right before the file loads.
function MediaItem({
  image,
  alt,
  active,
  onLoaded,
  onClick,
}: {
  image: Image;
  alt: string;
  active: boolean;
  onLoaded: (src: string) => void;
  onClick?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active) v.play().catch(() => {});
    else v.pause();
  }, [active]);

  const style = { "--ratio": image.height / image.width } as React.CSSProperties;
  const done = () => onLoaded(image.src);
  return image.video ? (
    <video
      ref={video}
      src={image.src}
      width={image.width}
      height={image.height}
      style={style}
      muted
      loop
      autoPlay={active}
      playsInline
      preload={active ? "auto" : "metadata"}
      aria-label={alt}
      onLoadedMetadata={done}
      onError={done}
      onClick={onClick}
    />
  ) : (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={image.src}
      width={image.width}
      height={image.height}
      style={style}
      alt={alt}
      onLoad={done}
      onError={done}
      onClick={onClick}
    />
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}
