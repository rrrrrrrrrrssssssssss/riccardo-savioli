"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

// All the text animations of the site. Characters go through these colours: a red glyph
// (mostly dots, some ! and ?), then their letter in grey for GREY ms, then the plain letter.
const GLYPHS = "........!?";
const GREY = 400;

// Landing: every character starts as a red glyph, holds for HOLD ms, then each one turns back into
// its letter at a random moment within REVEAL ms.
const HOLD = 1000;
const REVEAL = 2500;

// Recurring glitch once the landing is over: the reverse of the landing, quicker. It comes
// FIRST_GLITCH ms after the landing, SECOND_GLITCH ms after the end of the first, then
// LATER_GLITCH ms after the end of each one. Each character turns into a red glyph at a random
// moment within GLITCH_OUT ms, they all hold for GLITCH_HOLD ms, then each turns back into its
// letter within GLITCH_BACK ms.
const FIRST_GLITCH = 15_000;
const SECOND_GLITCH = 30_000;
const LATER_GLITCH = 60_000;
const GLITCH_OUT = 500;
const GLITCH_HOLD = 250;
const GLITCH_BACK = 500;
const GLITCH = GLITCH_OUT + GLITCH_HOLD + GLITCH_BACK + GREY;

// Idle: after IDLE ms without any activity, the text is deleted from its last character back to the
// first, like holding the backspace key, within VANISH ms (open images and captions fade out too).
// On the next activity it comes back: each character appears as a red glyph within WAKE_IN ms,
// they hold for WAKE_HOLD ms, then turn into letters within WAKE_BACK ms. The click, tap or key
// press that wakes the page only does that: it doesn't open projects or follow links.
const IDLE = 40_000;
const VANISH = 3000;
const WAKE_IN = 400;
const WAKE_HOLD = 200;
const WAKE_BACK = 600;
const WAKE = WAKE_IN + WAKE_HOLD + WAKE_BACK + GREY;

type Anim =
  | { kind: "landing"; id: number; t: number }
  | { kind: "glitch"; id: number; t: number }
  | { kind: "vanish"; id: number; t: number } // stays at its end (hidden) until activity
  | { kind: "wake"; id: number; t: number }
  | null;

const Clock = createContext<Anim>(null);

// Reading-order position of the first character of each piece of text, numbered when the deletion
// starts, so the whole page can be deleted from its end back to its start.
const positions = new WeakMap<Element, number>();
let totalCharacters = 1;
function numberCharacters() {
  let n = 0;
  for (const el of document.querySelectorAll<HTMLElement>("[data-scramble]")) {
    positions.set(el, n);
    n += Number(el.dataset.scramble);
  }
  totalCharacters = Math.max(n, 1);
}
export function ScrambleClock({ children }: { children: React.ReactNode }) {
  const [anim, setAnim] = useState<Anim>({ kind: "landing", id: 0, t: 0 });
  const current = useRef<Anim>(anim);
  current.current = anim;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnim(null);
      return;
    }

    let frame = 0;
    let glitchTimer = 0;
    let ids = 0;

    // Runs one animation frame by frame. A vanish stays at its end (letters hidden).
    const play = (kind: Exclude<Anim, null>["kind"], duration: number) => {
      const id = ++ids;
      const start = performance.now();
      current.current = { kind, id, t: 0 };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function tick(now) {
        const t = now - start;
        if (t >= duration) {
          if (kind === "vanish") return setAnim({ kind, id, t: duration });
          return setAnim(null);
        }
        setAnim({ kind, id, t });
        frame = requestAnimationFrame(tick);
      });
    };

    play("landing", HOLD + REVEAL + GREY);

    // Recurring glitch, skipped while something else is playing or nobody is looking.
    let round = 0;
    const glitch = () => {
      if (!document.hidden && current.current === null) play("glitch", GLITCH);
      round++;
      const next = round === 1 ? SECOND_GLITCH : LATER_GLITCH;
      glitchTimer = window.setTimeout(glitch, GLITCH + next);
    };
    glitchTimer = window.setTimeout(glitch, HOLD + REVEAL + GREY + FIRST_GLITCH);

    // Idle: vanish after IDLE ms without activity; come back on the next one.
    let lastActivity = performance.now();
    let swallowClick = false;
    const wake = () => {
      lastActivity = performance.now();
      if (current.current?.kind !== "vanish") return false;
      play("wake", WAKE);
      return true;
    };
    const onActivity = () => {
      wake();
    };
    // A press that wakes the page must not also act on it: the click it produces is cancelled.
    const onPress = () => {
      swallowClick = wake();
    };
    const onClick = (e: Event) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const onKey = (e: Event) => {
      if (!wake()) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const passive = ["pointermove", "wheel", "scroll"];
    for (const e of passive) window.addEventListener(e, onActivity, { passive: true });
    // Capture phase, so these run before the page's own handlers.
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("touchstart", onPress, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    const idleCheck = window.setInterval(() => {
      if (
        current.current === null &&
        !document.hidden &&
        performance.now() - lastActivity >= IDLE
      ) {
        numberCharacters();
        play("vanish", VANISH);
      }
    }, 1000);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(glitchTimer);
      window.clearInterval(idleCheck);
      for (const e of passive) window.removeEventListener(e, onActivity);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("touchstart", onPress, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  // Images and captions fade with the letters while idle (see .is-idle in app/globals.css).
  const idle = anim?.kind === "vanish";
  return (
    <Clock.Provider value={anim}>
      <div className={idle ? "anim-root is-idle" : "anim-root"}>{children}</div>
    </Clock.Provider>
  );
}

// Deterministic pseudo-random value in [0, 1) so server and client render the same first frame.
function seeded(text: string, i: number) {
  let h = 2166136261 ^ i;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

const pick = (r: number) => GLYPHS[Math.floor(r * GLYPHS.length)];
const randomGlyphs = (text: string) =>
  Array.from(text, (c) => (c === " " ? " " : pick(Math.random())));
const randomTimes = (text: string, from: number, span: number) =>
  Array.from(text, () => from + Math.random() * span);

type CharState = "letter" | "glyph" | "grey" | "hidden";

export function Scramble({ text }: { text: string }) {
  const anim = useContext(Clock);
  const ref = useRef<HTMLSpanElement>(null);

  // The landing's first frame is rendered on the server too, so its glyphs are seeded.
  const [landingGlyphs, setLandingGlyphs] = useState(() =>
    Array.from(text, (c, i) => (c === " " ? " " : pick(seeded(text, i)))),
  );
  const revealAt = useMemo(() => randomTimes(text, HOLD, REVEAL), [text]);
  // Fresh random glyphs on every visit (after hydration, so the markup matches).
  useEffect(() => {
    setLandingGlyphs(randomGlyphs(text));
  }, [text]);

  // New random glyphs and timings for each later animation.
  const animId = anim && anim.kind !== "landing" ? `${anim.kind}${anim.id}` : null;
  const round = useMemo(
    () => ({
      glyphs: randomGlyphs(text),
      outAt: randomTimes(text, 0, GLITCH_OUT),
      backAt: randomTimes(text, GLITCH_OUT + GLITCH_HOLD, GLITCH_BACK),
      inAt: randomTimes(text, 0, WAKE_IN),
      wakeBackAt: randomTimes(text, WAKE_IN + WAKE_HOLD, WAKE_BACK),
    }),
    [text, animId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Every piece of text is wrapped, so the deletion can find it in reading order.
  const wrap = (content: React.ReactNode) => (
    <span ref={ref} data-scramble={text.length}>
      {content}
    </span>
  );
  if (!anim) return wrap(text);
  const first = positions.get(ref.current!) ?? 0;

  // A red glyph until `until`, then the letter in grey for a moment, then the plain letter.
  const backFrom = (t: number, until: number): CharState =>
    t < until ? "glyph" : t < until + GREY ? "grey" : "letter";

  const t = anim.t;
  const states: CharState[] = Array.from(text, (c, i) => {
    if (c === " ") return "letter";
    switch (anim.kind) {
      case "landing":
        return backFrom(t, revealAt[i]);
      case "glitch":
        return t < round.outAt[i] ? "letter" : backFrom(t, round.backAt[i]);
      case "vanish": {
        // Deleted from the end of the page back to its start.
        const fromEnd = totalCharacters - 1 - (first + i);
        return t < (fromEnd / totalCharacters) * VANISH ? "letter" : "hidden";
      }
      case "wake":
        return t < round.inAt[i] ? "hidden" : backFrom(t, round.wakeBackAt[i]);
    }
  });
  const glyphs = anim.kind === "landing" ? landingGlyphs : round.glyphs;

  // Group consecutive characters in the same state into one span. Hidden characters keep their
  // letter (invisible), so the text keeps its layout while it vanishes.
  const runs: { state: CharState; text: string }[] = [];
  Array.from(text).forEach((c, i) => {
    const state = states[i];
    const char = state === "glyph" ? glyphs[i] : c;
    const last = runs[runs.length - 1];
    if (last && last.state === state) last.text += char;
    else runs.push({ state, text: char });
  });

  return wrap(
    <>
      <span aria-hidden="true">
        {runs.map((run, k) =>
          run.state === "letter" ? (
            run.text
          ) : (
            <span key={k} className={`glitch-${run.state}`}>
              {run.text}
            </span>
          ),
        )}
      </span>
      <span className="sr-only">{text}</span>
    </>,
  );
}
