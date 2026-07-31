// Yana AI — VTuber companion: the animated avatar (float/wiggle/talk states)
import React from 'react';
import vtuberChar from '../vtuber-char.jpg';

export function VTCharacter({ talking, wiggling, size }) {
  const s = size || 110;
  return (
    <div style={{
      width: s, height: s,
      borderRadius: "50%",
      overflow: "hidden",
      border: "2.5px solid rgba(255,255,255,0.85)",
      boxShadow: "0 4px 18px rgba(47,126,110,0.30)",
      background: "#fff8f0",
      flexShrink: 0,
      animation: wiggling
        ? "vt-wiggle 0.55s ease"
        : "vt-float 3.2s ease-in-out infinite",
    }}>
      <style>{`
        @keyframes vt-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes vt-wiggle { 0%,100%{transform:rotate(0) scale(1)} 25%{transform:rotate(-8deg) scale(1.05)} 75%{transform:rotate(8deg) scale(1.05)} }
        @keyframes vt-talk   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.03)} }
        .vt-talking { animation: vt-talk 0.25s ease infinite; }
      `}</style>
      <img
        src={vtuberChar}
        alt="Yana"
        className={talking ? "vt-talking" : ""}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
      />
    </div>
  );
}
