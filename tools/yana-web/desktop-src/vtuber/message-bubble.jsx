// Yana AI — VTuber companion: one chat-panel message bubble
import React from 'react';
import vtuberChar from '../vtuber-char.jpg';

export function VTMessageBubble({ m }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: m.who === "user" ? "flex-end" : "flex-start",
      alignItems: "flex-end", gap: 6,
    }}>
      {m.who === "yana" && (
        <img src={vtuberChar} alt="Yana" style={{
          width: 24, height: 24, borderRadius: 99, objectFit: "cover",
          objectPosition: "top center", flexShrink: 0, border: "1.5px solid rgba(47,126,110,0.2)",
        }} />
      )}
      <div style={{
        maxWidth: "78%",
        padding: "7px 11px",
        borderRadius: m.who === "user"
          ? "14px 14px 4px 14px"
          : "14px 14px 14px 4px",
        background: m.who === "user"
          ? "linear-gradient(135deg, #2f7e6e, #4dbf96)"
          : "rgba(47,126,110,0.07)",
        color: m.who === "user" ? "white" : "#1a2e1a",
        fontSize: 12.5,
        lineHeight: 1.55,
      }}>{m.text}</div>
    </div>
  );
}
