// Yana AI — Undercurrent: the decorative "living lake" background layer
// (breathing swell, caustic shimmer, sliding shimmer band, lotus shadows,
// floating motes). Purely decorative, no state/data dependencies — split
// out of app.jsx since it's fully self-contained.
import React from 'react';

// Primary green motes (main)
const MOTES = [
  { left: "12%", top: "78%", dur: "64s", delay: "0s",   dx: "60px",  dy: "-50px", peak: 0.20 },
  { left: "26%", top: "88%", dur: "82s", delay: "-20s", dx: "-45px", dy: "-70px", peak: 0.16 },
  { left: "44%", top: "72%", dur: "71s", delay: "-40s", dx: "50px",  dy: "-40px", peak: 0.18 },
  { left: "58%", top: "84%", dur: "90s", delay: "-10s", dx: "-60px", dy: "-55px", peak: 0.22 },
  { left: "72%", top: "76%", dur: "76s", delay: "-55s", dx: "40px",  dy: "-65px", peak: 0.16 },
  { left: "84%", top: "90%", dur: "68s", delay: "-30s", dx: "-50px", dy: "-45px", peak: 0.20 },
  { left: "35%", top: "94%", dur: "86s", delay: "-65s", dx: "55px",  dy: "-60px", peak: 0.14 },
  { left: "92%", top: "68%", dur: "79s", delay: "-48s", dx: "-35px", dy: "-50px", peak: 0.14 },
  { left: "6%",  top: "82%", dur: "73s", delay: "-38s", dx: "45px",  dy: "-55px", peak: 0.13 },
  { left: "54%", top: "92%", dur: "88s", delay: "-72s", dx: "-40px", dy: "-62px", peak: 0.15 },
];
// Larger, softer motes
const MOTES_LG = [
  { left: "18%", top: "85%", dur: "95s", delay: "-15s", dx: "55px",  dy: "-45px", peak: 0.12 },
  { left: "62%", top: "79%", dur:"108s", delay: "-50s", dx: "-50px", dy: "-60px", peak: 0.10 },
  { left: "88%", top: "88%", dur: "92s", delay: "-70s", dx: "40px",  dy: "-50px", peak: 0.11 },
];
// Small gold pollen motes
const MOTES_SM = [
  { left: "8%",  top: "70%", dur: "48s", delay: "0s",   dx: "35px",  dy: "-45px", peak: 0.28 },
  { left: "30%", top: "80%", dur: "57s", delay: "-18s", dx: "-30px", dy: "-55px", peak: 0.24 },
  { left: "52%", top: "74%", dur: "44s", delay: "-35s", dx: "40px",  dy: "-40px", peak: 0.26 },
  { left: "76%", top: "82%", dur: "61s", delay: "-27s", dx: "-35px", dy: "-48px", peak: 0.22 },
  { left: "94%", top: "72%", dur: "51s", delay: "-44s", dx: "25px",  dy: "-50px", peak: 0.20 },
  { left: "20%", top: "92%", dur: "55s", delay: "-60s", dx: "45px",  dy: "-42px", peak: 0.18 },
];
// Pink lotus-blush motes
const MOTES_PINK = [
  { left: "38%", top: "86%", dur: "80s", delay: "-8s",  dx: "-55px", dy: "-60px", peak: 0.16 },
  { left: "68%", top: "90%", dur: "74s", delay: "-45s", dx: "48px",  dy: "-52px", peak: 0.14 },
  { left: "82%", top: "76%", dur: "86s", delay: "-62s", dx: "-42px", dy: "-48px", peak: 0.13 },
];

export function Undercurrent() {
  const css = function(m) {
    return { left: m.left, top: m.top, "--dur": m.dur, "--delay": m.delay, "--dx": m.dx, "--dy": m.dy, "--peak": m.peak };
  };
  return (
    <div className="scene">
      {/* layer 1: breathing light swell */}
      <div className="scene-swell" />
      {/* layer 2: caustic shimmer patches */}
      <div className="scene-caustics" />
      {/* layer 3: horizontal sliding shimmer band */}
      <div className="scene-shimmer" />
      {/* layer 4: lotus / lily-pad blob shadows deep in the water */}
      <div className="scene-lotus" />
      {/* motes — four varieties */}
      {MOTES.map((m, i)      => <span key={"m"+i}  className="mote"      style={css(m)} />)}
      {MOTES_LG.map((m, i)   => <span key={"lg"+i} className="mote-lg"   style={css(m)} />)}
      {MOTES_SM.map((m, i)   => <span key={"sm"+i} className="mote-sm"   style={css(m)} />)}
      {MOTES_PINK.map((m, i) => <span key={"pk"+i} className="mote-pink" style={css(m)} />)}
    </div>
  );
}
