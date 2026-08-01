// Yana AI — VTuber companion
// Always-visible toggle button. Click to open/close the chat panel.
//
// This is desktop-v2's ES-module conversion of the file. The raw,
// unconverted source (still a classic Babel script — no import/export)
// lives at tools/yana-web/shared/vtuber.jsx and stays the canonical copy
// for mobile/, which still loads it as a classic <script type="text/babel">
// and can't consume an ES module the same way. Keep both in sync by hand
// if the VTuber behavior changes — see the migration plan for why one
// file can't serve both consumers.
import React from 'react';
import { L, Icons } from './components.jsx';
import vtuberChar from './vtuber-char.jpg';
import { VT_HINTS, VT_IDLE, VT_GREET, vtLang, vtPick } from './vtuber/phrases.js';
import { VTCharacter } from './vtuber/character.jsx';
import { VTMessageBubble } from './vtuber/message-bubble.jsx';

// Shared between /desktop and /mobile shells. Mobile has a bottom tab bar
// (.mtabbar, ~64px + safe-area-inset-bottom) that the default bottom:20
// offset sits on top of, hiding the rightmost tab — lift it clear there.
// (Always false for desktop-v2 itself; kept for parity with the shared
// source this was converted from.)
const VT_IS_MOBILE_SHELL = typeof window !== "undefined" && window.location.pathname.startsWith("/mobile");
const VT_TOGGLE_BOTTOM = VT_IS_MOBILE_SHELL ? "calc(78px + env(safe-area-inset-bottom, 0px))" : 20;
const VT_PANEL_BOTTOM = VT_IS_MOBILE_SHELL ? "calc(138px + env(safe-area-inset-bottom, 0px))" : 80;

export function VTuber() {
  const [open,     setOpen]     = React.useState(false);
  const [msgs,     setMsgs]     = React.useState([]);
  const [draft,    setDraft]    = React.useState("");
  const [talking,  setTalking]  = React.useState(false);
  const [wiggling, setWiggling] = React.useState(false);
  const [dot,      setDot]      = React.useState(false);   // notification dot on button
  const [sending,  setSending]  = React.useState(false);
  const logRef   = React.useRef(null);
  const inputRef = React.useRef(null);

  function addMsg(who, text) {
    setMsgs(m => [...m, { who, text, id: Date.now() + Math.random() }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
  }

  function speak(text) {
    setTalking(true);
    setWiggling(true);
    addMsg("yana", text);
    setTimeout(() => setTalking(false), Math.min(text.length * 40, 2500));
    setTimeout(() => setWiggling(false), 600);
    if (!open) setDot(true);
  }

  function toggle() {
    setOpen(o => {
      if (!o) {
        setDot(false);
        if (msgs.length === 0) setTimeout(() => speak(vtPick(VT_GREET)), 300);
      }
      return !o;
    });
  }

  // Chat with VTuber — calls /api/chat with a fun persona
  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    addMsg("user", text);
    setSending(true);
    setTalking(true);

    try {
      if (typeof YanaVault !== "undefined") await YanaVault.ready;
      const key = (typeof YanaVault !== "undefined") ? (YanaVault.getKey("claude") || YanaVault.getKey("openai") || YanaVault.getKey("gemini") || "") : "";
      const providerOrder = ["claude", "openai", "gemini", "groq"];
      let provider = "claude", apiKey = key;
      if (typeof YanaVault !== "undefined") {
        for (const p of providerOrder) {
          const k = YanaVault.getKey(p);
          if (k) { provider = p; apiKey = k; break; }
        }
      }

      const persona = vtLang() === "vi"
        ? "Bạn là Yana — trợ lý AI dễ thương, thân thiện. Trả lời ngắn gọn, tự nhiên, dùng emoji phù hợp. Đừng quá formal. Bạn đang chat trong một cửa sổ nhỏ."
        : "You are Yana — a friendly, cute AI assistant. Keep replies short and natural, use appropriate emojis. You're chatting in a small side panel.";

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: text, apiKey, provider, model: "", about: persona }),
      });

      if (!res.ok || !res.body) throw new Error("HTTP " + res.status);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", accumulated = "";
      const msgId = Date.now();
      setMsgs(m => [...m, { who: "yana", text: "…", id: msgId }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const obj = JSON.parse(payload);
            if (obj.text) accumulated += obj.text;
            const snap = accumulated;
            setMsgs(m => m.map(msg => msg.id === msgId ? { ...msg, text: snap } : msg));
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
          } catch (_) {}
        }
      }
    } catch (_) {
      speak(vtPick(VT_HINTS));
    } finally {
      setSending(false);
      setTalking(false);
    }
  }

  // Listen for chat messages from main chat
  React.useEffect(() => {
    let msgCount = 0;
    function onMsg() {
      msgCount++;
      if (msgCount % 5 === 0) speak(vtPick(VT_HINTS));
    }
    window.addEventListener("yana-chat-message", onMsg);
    // Idle nudge after 3 min
    const idleT = setTimeout(() => speak(vtPick(VT_IDLE)), 3 * 60 * 1000);
    return () => {
      window.removeEventListener("yana-chat-message", onMsg);
      clearTimeout(idleT);
    };
  }, []);

  // Auto-scroll when panel opens
  React.useEffect(() => {
    if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  return (
    <>
      {/* ── Chat panel ── */}
      <div style={{
        position: "fixed",
        bottom: VT_PANEL_BOTTOM,
        right: 20,
        width: 280,
        maxHeight: 420,
        borderRadius: 20,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 8px 40px rgba(47,126,110,0.22), 0 2px 8px rgba(0,0,0,0.10)",
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(47,126,110,0.15)",
        transform: open ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease",
        zIndex: 9997,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px 8px",
          borderBottom: "1px solid rgba(47,126,110,0.10)",
          background: "rgba(47,126,110,0.05)",
        }}>
          <VTCharacter talking={talking} wiggling={wiggling} size={38} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2e1a" }}>Yana</div>
            <div style={{ fontSize: 11, color: "#6a8c7a", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: "#4dbf96", display: "inline-block" }}></span>
              {vtLang() === "vi" ? "Đang hoạt động" : "Online"}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#6a8c7a", fontSize: 16, lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Messages */}
        <div ref={logRef} style={{
          flex: 1, overflowY: "auto", padding: "10px 12px",
          display: "flex", flexDirection: "column", gap: 8,
          scrollbarWidth: "thin",
        }}>
          {msgs.map(m => <VTMessageBubble key={m.id} m={m} />)}
          {sending && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              <img src={vtuberChar} alt="Yana" style={{ width: 24, height: 24, borderRadius: 99, objectFit: "cover", objectPosition: "top center", flexShrink: 0, border: "1.5px solid rgba(47,126,110,0.2)" }} />
              <div style={{ padding: "7px 12px", borderRadius: "14px 14px 14px 4px", background: "rgba(47,126,110,0.07)", fontSize: 18, letterSpacing: 2 }}>···</div>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "8px 10px 10px",
          borderTop: "1px solid rgba(47,126,110,0.08)",
        }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={vtLang() === "vi" ? "Nhắn cho Yana…" : "Message Yana…"}
            style={{
              flex: 1, border: "1px solid rgba(47,126,110,0.2)", borderRadius: 99,
              padding: "6px 12px", fontSize: 12.5, outline: "none",
              background: "rgba(47,126,110,0.04)", color: "#1a2e1a", fontFamily: "inherit",
            }}
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            style={{
              width: 32, height: 32, borderRadius: 99, border: "none", cursor: "pointer",
              background: draft.trim() && !sending ? "linear-gradient(135deg,#2f7e6e,#4dbf96)" : "rgba(47,126,110,0.15)",
              color: "white", display: "grid", placeItems: "center", flexShrink: 0,
              transition: "background 0.2s",
            }}
          >{Icons && Icons.send ? Icons.send(13) : "↑"}</button>
        </div>
      </div>

      {/* ── Toggle button — always visible ── */}
      <button
        onClick={toggle}
        title={vtLang() === "vi" ? "Chat với Yana" : "Chat with Yana"}
        style={{
          position: "fixed",
          bottom: VT_TOGGLE_BOTTOM,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: 99,
          border: "2.5px solid rgba(255,255,255,0.9)",
          background: "none",
          padding: 0,
          cursor: "pointer",
          zIndex: 9998,
          boxShadow: open
            ? "0 4px 20px rgba(47,126,110,0.45)"
            : "0 4px 16px rgba(47,126,110,0.30)",
          transform: open ? "scale(1.05)" : "scale(1)",
          transition: "box-shadow 0.2s, transform 0.2s",
          overflow: "hidden",
        }}
      >
        <img
          src={vtuberChar}
          alt="Yana"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
        />
        {/* Notification dot */}
        {dot && !open && (
          <span style={{
            position: "absolute", top: 2, right: 2,
            width: 11, height: 11, borderRadius: 99,
            background: "#ff6b6b", border: "2px solid white",
          }} />
        )}
      </button>
    </>
  );
}
