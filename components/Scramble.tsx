"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

// Landing effect: every character starts as a random glyph, holds for HOLD ms,
// then each one turns back into its real character at a random moment within REVEAL ms.
const HOLD = 1000;
const REVEAL = 2500;
const GLYPHS = "........!?"; // mostly dots

// Recurring effect, every CYCLE_EVERY ms once the landing is over: the reverse of the landing,
// quicker. Each character turns into a red glyph at a random moment within GLITCH_OUT ms, they
// all hold for GLITCH_HOLD ms, then each turns back into its letter within GLITCH_BACK ms, grey
// for GLITCH_GREY ms, then black again.
const CYCLE_EVERY = 45000;
const GLITCH_OUT = 500;
const GLITCH_HOLD = 250;
const GLITCH_BACK = 500;
const GLITCH_GREY = 400;
const GLITCH = GLITCH_OUT + GLITCH_HOLD + GLITCH_BACK + GLITCH_GREY;

type ClockValue = {
  landing: number; // ms since landing; Infinity = finished
  glitch: { id: number; t: number } | null; // the running recurring effect, if any
};

const Clock = createContext<ClockValue>({ landing: Infinity, glitch: null });

export function ScrambleClock({ children }: { children: React.ReactNode }) {
  const [landing, setLanding] = useState(0);
  const [glitch, setGlitch] = useState<ClockValue["glitch"]>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLanding(Infinity);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = now - start;
      if (t >= HOLD + REVEAL) return setLanding(Infinity);
      setLanding(t);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (landing !== Infinity || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    let id = 0;
    let frame = 0;
    const run = () => {
      if (document.hidden) return; // nobody is looking: skip this round
      const start = performance.now();
      id++;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function tick(now) {
        const t = now - start;
        if (t >= GLITCH) return setGlitch(null);
        setGlitch({ id, t });
        frame = requestAnimationFrame(tick);
      });
    };
    const timer = window.setInterval(run, CYCLE_EVERY);
    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(frame);
    };
  }, [landing === Infinity]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Clock.Provider value={{ landing, glitch }}>{children}</Clock.Provider>;
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

type CharState = "letter" | "glyph" | "grey";

export function Scramble({ text }: { text: string }) {
  const { landing, glitch } = useContext(Clock);

  const [glyphs, setGlyphs] = useState(() =>
    Array.from(text, (c, i) => (c === " " ? " " : pick(seeded(text, i)))),
  );
  const revealAt = useMemo(() => Array.from(text, () => HOLD + Math.random() * REVEAL), [text]);

  // Fresh random glyphs on every visit (after hydration, so the markup matches).
  useEffect(() => {
    setGlyphs(randomGlyphs(text));
  }, [text]);

  // New random glyphs and timings for each round of the recurring effect.
  const glitchId = glitch?.id;
  const round = useMemo(
    () => ({
      glyphs: randomGlyphs(text),
      outAt: Array.from(text, () => Math.random() * GLITCH_OUT),
      backAt: Array.from(text, () => GLITCH_OUT + GLITCH_HOLD + Math.random() * GLITCH_BACK),
    }),
    [text, glitchId],
  );

  if (landing !== Infinity) {
    const shown = Array.from(text, (c, i) => (landing >= revealAt[i] ? c : glyphs[i])).join("");
    return (
      <>
        <span aria-hidden="true">{shown}</span>
        <span className="sr-only">{text}</span>
      </>
    );
  }

  if (!glitch) return text;

  // Group consecutive characters in the same state into one span (red glyphs, grey letters).
  const t = glitch.t;
  const runs: { state: CharState; text: string }[] = [];
  Array.from(text).forEach((c, i) => {
    const state: CharState =
      c === " " || t < round.outAt[i]
        ? "letter"
        : t < round.backAt[i]
          ? "glyph"
          : t < round.backAt[i] + GLITCH_GREY
            ? "grey"
            : "letter";
    const char = state === "glyph" ? round.glyphs[i] : c;
    const last = runs[runs.length - 1];
    if (last && last.state === state) last.text += char;
    else runs.push({ state, text: char });
  });

  return (
    <>
      <span aria-hidden="true">
        {runs.map((run, k) =>
          run.state === "letter" ? (
            run.text
          ) : (
            <span key={k} className={run.state === "glyph" ? "glitch-glyph" : "glitch-grey"}>
              {run.text}
            </span>
          ),
        )}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}
