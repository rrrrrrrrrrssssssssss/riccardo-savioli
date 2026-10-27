"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Block, Image, Project } from "@/lib/content";
import { splitLabel } from "@/lib/label";
import { Scramble, ScrambleClock } from "./Scramble";

// Keep in sync with app/globals.css: --open-duration, and the caption + image fade-out (--fade × 1.8).
const OPEN_DURATION = 600;
const CLOSE_FADE = 450;
// If the first image is slow (bad connection), show the project anyway after this long;
// the image then appears as soon as it arrives.
const REVEAL_TIMEOUT = 800;

// When a project opens, scroll so it can be seen whole.
// Mobile: the project goes near the top of the screen, two lines of text above it.
// Desktop: only if needed, just enough to show the tallest of its images and the caption in
// full, without the title leaving the top of the screen.
// Near the end of the page there may not be enough page below to scroll that far, so the page
// is given that room (min-height) for as long as the project stays open.
function revealProject(slug: string, images: Image[]) {
  const el = document.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`);
  if (!el) return;
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  const css = getComputedStyle(document.documentElement);
  const margin = parseFloat(css.getPropertyValue("--margin")) || 5;
  const leading = parseFloat(getComputedStyle(el.querySelector(".line")!).lineHeight) || 20;

  let top = el.getBoundingClientRect().top + window.scrollY;
  // A project above that collapses at the same moment will pull this one up by its panel height.
  for (const other of document.querySelectorAll<HTMLElement>(".project.is-open")) {
    if (other !== el && other.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
      top -= other.querySelector(".panel")!.getBoundingClientRect().height;
    }
  }

  let target: number;
  if (mobile) {
    target = Math.max(0, top - 2 * leading);
  } else {
    const tallest = Math.max(0, ...images.map(desktopHeight));
    const caption = el.querySelector<HTMLElement>(".caption")?.offsetHeight ?? 3 * leading;
    const bottom =
      top + el.querySelector<HTMLElement>(".line")!.offsetHeight + 4 + tallest + caption;
    const needed = bottom + margin - window.innerHeight;
    if (needed <= window.scrollY) return;
    target = Math.min(needed, top - margin);
  }

  window.clearTimeout(releaseTimer); // a pending release must not undo this
  document.documentElement.style.minHeight = `${target + window.innerHeight}px`;
  window.scrollTo({ top: target, behavior: "smooth" });
}

// Height of an image on desktop: the same sizing as figure img in app/globals.css (294px tall,
// but 20–37% of the screen wide).
function desktopHeight(img: Image) {
  const vw = window.innerWidth;
  const css = getComputedStyle(document.documentElement);
  const imageHeight = parseFloat(css.getPropertyValue("--image-height")) || 294;
  const ratio = img.height / img.width;
  return Math.min(Math.max(0.2 * vw, imageHeight / ratio), 0.37 * vw) * ratio;
}

// Gives the page back its own height once no project is open, after its panel has closed.
let releaseTimer: number | undefined;
function releaseRoom() {
  window.clearTimeout(releaseTimer);
  releaseTimer = window.setTimeout(() => {
    document.documentElement.style.minHeight = "";
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
  const imagesOf = (slug: string) =>
    blocks.find(
      (b): b is Extract<Block, { type: "project" }> => b.type === "project" && b.slug === slug,
    )?.project.images ?? [];
  const toggle = (slug: string) => {
    window.clearTimeout(timer.current);
    if (!open) {
      setClosing(false);
      revealProject(slug, imagesOf(slug));
      return setOpen({ slug, index: 0 });
    }
    if (open.slug === slug && closing) return setClosing(false); // reopened while fading out
    const next = open.slug === slug ? null : { slug, index: 0 };
    setClosing(true);
    timer.current = window.setTimeout(() => {
      setClosing(false);
      if (next) revealProject(next.slug, imagesOf(next.slug));
      else releaseRoom();
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
  const mediaRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const navsRef = useRef<HTMLSpanElement>(null);
  const countBreak = useRef<HTMLSpanElement>(null);
  const navsBreak = useRef<HTMLSpanElement>(null);

  // When the counter doesn't fit on the title's last line, it starts a new line without the space
  // before it; Back and Next likewise, together. Measured after every render, and whenever the
  // line changes shape without this component re-rendering: the letters of the landing and glitch
  // animations (narrower glyphs), the web font arriving, the window resizing.
  const fitRef = useRef(() => {});
  useLayoutEffect(() => {
    fitRef.current = () => {
      const label = labelRef.current;
      const count = countRef.current;
      if (!label || !count) return;
      for (const [brk, el] of [
        [countBreak, count],
        [navsBreak, navsRef.current],
      ] as const) {
        brk.current?.classList.remove("on");
        el?.classList.remove("wrapped");
      }
      const lastLineTop = (el: Element) => {
        const rects = el.getClientRects();
        return rects[rects.length - 1]?.top ?? 0;
      };
      const wrap = (
        brk: React.RefObject<HTMLSpanElement | null>,
        el: HTMLElement,
        after: Element,
      ) => {
        if (el.getBoundingClientRect().top > lastLineTop(after) + 1) {
          brk.current?.classList.add("on");
          el.classList.add("wrapped");
        }
      };
      wrap(countBreak, count, label);
      if (navsRef.current) wrap(navsBreak, navsRef.current, count);
    };
    fitRef.current();
  });
  useEffect(() => {
    let frame = 0;
    const refit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitRef.current());
    };
    // The line's height changes whenever the counter moves to or from another line.
    const observer = new ResizeObserver(refit);
    observer.observe(lineRef.current!);
    window.addEventListener("resize", refit);
    document.fonts?.ready.then(refit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refit);
      cancelAnimationFrame(frame);
    };
  }, []);
  // Images load once the line is hovered or the project opened, not with the page.
  const [mounted, setMounted] = useState(false);
  // While closing, keep showing the last image so it can fade out.
  const [shown, setShown] = useState(index);
  useEffect(() => {
    if (!isOpen) return;
    setMounted(true);
    setShown(index);
  }, [isOpen, index]);

  const total = project.images.length;
  const { before, name, after } = splitLabel(label);
  const plainLabel = before + name + after;

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

  // Desktop: moving through the carousel, the media area eases to the height of the new image, so
  // the caption and the text below move smoothly, as on mobile (same duration and curve).
  const shownHeight = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (mobile || !image) {
      el.style.height = el.style.transition = "";
      shownHeight.current = null;
      return;
    }
    const height = desktopHeight(image);
    const animate = shownHeight.current !== null && isOpen;
    el.style.transition = animate ? `height ${SLIDE_DURATION}ms ${SLIDE_EASE}` : "none";
    el.style.height = `${height}px`;
    shownHeight.current = height;
  });
  useEffect(() => {
    // A new window size changes the sizes: follow at once, without animating.
    const resize = () => {
      const el = mediaRef.current;
      if (!el || !shownHeight.current || window.matchMedia("(max-width: 767px)").matches) return;
      const img = el.querySelector("img, video");
      if (!img) return;
      el.style.transition = "none";
      el.style.height = `${img.getBoundingClientRect().height}px`;
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

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
      {/* The whole line opens or closes the project (Back and Next excepted). */}
      <p
        className={`line${total ? " is-toggle" : ""}`}
        ref={lineRef}
        onMouseEnter={() => total && setMounted(true)}
        onClick={(e) => {
          if (total && !(e.target as Element).closest(".navs")) onToggle();
        }}
      >
        {/* Inline (not a <button>) so the counter can follow the last line of a long title. */}
        <span
          className="title"
          role="button"
          tabIndex={total ? 0 : -1}
          aria-disabled={total === 0}
          aria-expanded={isOpen}
          onKeyDown={(e) => {
            if (total && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onToggle();
            }
          }}
        >
          <span ref={labelRef}>
            {before && <Plain text={before} />}
            <Scramble text={name} />
            {after && <Plain text={after} />}
          </span>
          <span ref={countBreak} className="break" />
          <span ref={countRef} className="count">
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
        </span>
        {isOpen && total > 1 && (
          <>
            <span ref={navsBreak} className="break" />
            <span ref={navsRef} className="navs">
              <button className="nav" onClick={() => onStep(-1)}>
                <Scramble text="Back" />
              </button>
              <button className="nav" onClick={() => onStep(1)}>
                <Scramble text="Next" />
              </button>
            </span>
          </>
        )}
      </p>
      <div className="panel" inert={!isOpen}>
        <div className="panel-inner">
          {mounted && image && (
            <figure>
              <div
                ref={mediaRef}
                className="media"
                // Desktop: this wrapper reaches the middle of the screen. Clicking the left half of
                // the image goes back; the right half, or anywhere to the right of the image up to
                // the middle of the screen, goes forward. The side under the pointer (for the
                // arrow cursor) is kept here, so the next image shows the right arrow at once.
                onMouseMove={(e) => {
                  const media = e.currentTarget.querySelector("img, video");
                  if (!mobile && media) {
                    e.currentTarget.dataset.half = backwards(media, e.clientX) ? "left" : "right";
                  }
                }}
                onClick={(e) => {
                  const media = e.currentTarget.querySelector("img, video");
                  if (!mobile && media) onStep(backwards(media, e.clientX) ? -1 : 1);
                }}
              >
                {mobile ? (
                  <Strip
                    isOpen={isOpen}
                    images={project.images}
                    index={isOpen ? index : shown}
                    label={plainLabel}
                    onSelect={onSelect}
                    onLoaded={setLoadedSrc}
                  />
                ) : (
                  <MediaItem
                    key={image.src}
                    image={image}
                    alt={`${plainLabel} — ${(isOpen ? index : shown) + 1}/${total}`}
                    active
                    onLoaded={setLoadedSrc}
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

// Sentence text inside a project line: stays black, no hover colour.
function Plain({ text }: { text: string }) {
  return (
    <span className="punct">
      <Scramble text={text} />
    </span>
  );
}

// Mobile: all the media of a project side by side with the page margin between them, moved by
// swiping. Each swipe moves exactly one item: past SWIPE_DISTANCE of the width or faster than
// SWIPE_SPEED it goes to the next/previous one, otherwise it springs back. It loops: after the last
// item comes the first again (and before the first, the last), using a copy of each at the ends
// that the track slides onto before jumping back, unseen, to the real item. Vertical swipes scroll
// the page as usual. The text below stays still while dragging; on release the item and the height
// move together, in one movement that starts fast and settles (SLIDE_EASE).
// Photos load two items ahead and behind and stay loaded once seen; videos (heavier, and phones
// limit how many can play) only right next to the current item. While closed, just the first.
const NEAR_PHOTOS = 2;
const NEAR_VIDEOS = 1;
const SWIPE_DISTANCE = 0.2;
const SWIPE_SPEED = 0.3; // px per ms
const SLIDE_DURATION = 350;
const SLIDE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

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
  const wrapTimer = useRef<number | undefined>(undefined);
  const gesture = useRef<{
    x: number;
    y: number;
    dx: number;
    t: number;
    speed: number;
    dragging: boolean;
  } | null>(null);

  const count = images.length;
  const loops = count > 1;
  // Positions run from -1 (copy of the last item) to count (copy of the first) when looping.
  const first = loops ? -1 : 0;
  const end = loops ? count : count - 1;
  const itemAt = (pos: number) => images[(pos + count) % count];
  const pitch = () =>
    ref.current!.clientWidth + (parseFloat(getComputedStyle(track.current!).columnGap) || 0);
  const heightAt = (pos: number) => {
    const w = ref.current!.clientWidth;
    const p = Math.min(Math.max(pos, first), end);
    const i = Math.floor(p);
    const h = (k: number) => (w * itemAt(k).height) / itemAt(k).width;
    return h(i) + (h(Math.min(i + 1, end)) - h(i)) * (p - i);
  };

  // Puts the track at a (possibly fractional) position, sliding there or jumping, with the height
  // of the item at heightPos. Set on the elements directly so the track can follow the finger.
  const place = (pos: number, slide: boolean, heightPos = pos) => {
    const el = ref.current;
    const tr = track.current;
    if (!el || !tr || !el.clientWidth) return;
    const ease = `${SLIDE_DURATION}ms ${SLIDE_EASE}`;
    tr.style.transition = slide ? `transform ${ease}` : "none";
    el.style.transition = slide ? `height ${ease}` : "none";
    tr.style.transform = `translate3d(${-(pos - first) * pitch()}px, 0, 0)`;
    el.style.height = `${heightAt(heightPos)}px`;
  };

  // Slides onto the copy at one end, then jumps to the real item it stands for.
  const slideAround = (copy: number, real: number) => {
    place(copy, true);
    wrapTimer.current = window.setTimeout(() => {
      wrapTimer.current = undefined;
      place(real, false);
    }, SLIDE_DURATION);
  };
  // Interrupted wrap-around (a new swipe, Back or Next within SLIDE_DURATION): finish the jump
  // to the real item now, otherwise the next move would start from the copy at the far end.
  const finishWrap = () => {
    if (wrapTimer.current === undefined) return;
    window.clearTimeout(wrapTimer.current);
    wrapTimer.current = undefined;
    place(resting.current, false);
  };

  // New index (swipe, Back, Next, keys): slide there, the short way round when wrapping.
  // Bigger jumps (reopening on another item) are instant.
  useLayoutEffect(() => {
    finishWrap();
    const from = resting.current;
    resting.current = index;
    if (loops && from === count - 1 && index === 0) slideAround(count, 0);
    else if (loops && from === 0 && index === count - 1) slideAround(-1, count - 1);
    else place(index, Math.abs(index - from) === 1);
  }, [index]);
  useEffect(() => () => window.clearTimeout(wrapTimer.current), []);

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

  const release = (cancelled: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.dragging) return;
    let target = index;
    if (!cancelled && loops) {
      const w = ref.current!.clientWidth;
      if (g.dx < -w * SWIPE_DISTANCE || g.speed < -SWIPE_SPEED) target = (index + 1) % count;
      else if (g.dx > w * SWIPE_DISTANCE || g.speed > SWIPE_SPEED)
        target = (index - 1 + count) % count;
    }
    if (target !== index) onSelect(target);
    else place(index, true);
  };

  // The real items, plus a copy of the last before them and of the first after them.
  const slots = loops
    ? [
        { pos: -1, img: images[count - 1] },
        ...images.map((img, i) => ({ pos: i, img })),
        { pos: count, img: images[0] },
      ]
    : images.map((img, i) => ({ pos: i, img }));
  // Which slots get their media: near the current item, plus photos already shown once.
  const seen = useRef(new Set<number>());
  const loads = (pos: number, img: Image) => {
    const distance = Math.abs(pos - index);
    if (!isOpen) return distance === 0;
    if (distance <= (img.video ? NEAR_VIDEOS : NEAR_PHOTOS)) {
      if (!img.video) seen.current.add(pos);
      return true;
    }
    return !img.video && seen.current.has(pos);
  };

  return (
    <div
      ref={ref}
      className="strip"
      onPointerDown={(e) => {
        if (!e.isPrimary) return;
        finishWrap();
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
        // A single item resists being dragged; otherwise the copies at the ends take over.
        let pos = index - dx / pitch();
        if (pos < first) pos = first + (pos - first) / 3;
        if (pos > end) pos = end + (pos - end) / 3;
        place(pos, false, index);
      }}
      onPointerUp={() => release(false)}
      onPointerCancel={() => release(true)}
    >
      <div ref={track} className="track">
        {slots.map(({ pos, img }) => (
          <div key={pos} className="slide" style={{ aspectRatio: `${img.width} / ${img.height}` }}>
            {loads(pos, img) && (
              <MediaItem
                image={img}
                alt={`${label} — ${((pos + count) % count) + 1}/${count}`}
                active={pos === index}
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
}: {
  image: Image;
  alt: string;
  active: boolean;
  onLoaded: (src: string) => void;
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
      // #t= makes iOS show the first frame even when it won't autoplay (e.g. Low Power Mode).
      src={`${image.src}#t=0.001`}
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
    />
  ) : (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={image.src}
      width={image.width}
      height={image.height}
      style={style}
      alt={alt}
      decoding="async"
      fetchPriority={active ? "high" : "low"}
      onLoad={done}
      onError={done}
    />
  );
}

// Whether a click at clientX means "back": on the left half of the image.
function backwards(media: Element, clientX: number) {
  const box = media.getBoundingClientRect();
  return clientX < box.left + box.width / 2;
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
