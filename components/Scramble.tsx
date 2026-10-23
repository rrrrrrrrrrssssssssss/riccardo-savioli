"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

// Landing effect: every character starts as a random glyph, holds for HOLD ms,
// then each one turns back into its real character at a random moment within REVEAL ms.
const HOLD = 1000;
const REVEAL = 2500;
const GLYPHS = "........!?"; // mostly dots

const Clock = createContext<number>(Infinity); // ms since landing; Infinity = finished

export function ScrambleClock({ children }: { children: React.ReactNode }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setElapsed(Infinity);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = now - start;
      if (t >= HOLD + REVEAL) return setElapsed(Infinity);
      setElapsed(t);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return <Clock.Provider value={elapsed}>{children}</Clock.Provider>;
}

// Deterministic pseudo-random value in [0, 1) so server and client render the same first frame.
function seeded(text: string, i: number) {
  let h = 2166136261 ^ i;
  for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

const pick = (r: number) => GLYPHS[Math.floor(r * GLYPHS.length)];

export function Scramble({ text }: { text: string }) {
  const elapsed = useContext(Clock);

  const [glyphs, setGlyphs] = useState(() =>
    Array.from(text, (c, i) => (c === " " ? " " : pick(seeded(text, i)))),
  );
  const revealAt = useMemo(() => Array.from(text, () => HOLD + Math.random() * REVEAL), [text]);

  // Fresh random glyphs on every visit (after hydration, so the markup matches).
  useEffect(() => {
    setGlyphs(Array.from(text, (c) => (c === " " ? " " : pick(Math.random()))));
  }, [text]);

  if (elapsed === Infinity) return text;

  const shown = Array.from(text, (c, i) => (elapsed >= revealAt[i] ? c : glyphs[i])).join("");
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}
