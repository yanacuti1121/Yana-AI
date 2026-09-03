// Yana AI — shared components: icons, wordmark, atoms
import React from 'react';
import { currentLang } from './lib/i18n-lang.js';

/* Multilingual helper: L("English", "Tiếng Việt", "한국어", "中文") */
export function L(en, vi, ko, zh) {
  if (currentLang === "vi" && vi != null) return vi;
  if (currentLang === "ko" && ko != null) return ko;
  if (currentLang === "zh" && zh != null) return zh;
  return en;
}

/* ---------- Icons: real Lucide (lucide-icons/lucide, MIT), 24px grid ----------
   Replaces the previous hand-drawn set (2026-09-02 redesign, anh's explicit
   call: icons looked hand-made because they were). Path data fetched
   verbatim from Lucide's own source, not approximated — vendored inline
   (no new npm dependency, matching this codebase's existing "no new
   dependency for a small, stable need" precedent — see use-resizable.js).
   Three icons keep their original hand-drawn 20px-grid paths and get an
   explicit viewBox/strokeWidth override on <Ic> below, for real reasons:
   `repo` is deliberately a neutral, non-trademark mark (Lucide ships no
   brand/logo icons at all, GitHub's included — confirmed, not assumed);
   `commandRef` and `providers` have no close Lucide equivalent for their
   specific concept and weren't worth forcing a mismatch. */
function Ic({ d, size = 18, viewBox = "0 0 24 24", strokeWidth = "2", ...rest }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {d}
    </svg>
  );
}
export const Icons = {
  dashboard: (s) => <Ic size={s} d={<><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></>} />,
  chat:      (s) => <Ic size={s} d={<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>} />,
  agents:    (s) => <Ic size={s} d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></>} />,
  missions:  (s) => <Ic size={s} d={<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>} />,
  memory:    (s) => <Ic size={s} d={<><path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/></>} />,
  skills:    (s) => <Ic size={s} d={<><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></>} />,
  safety:    (s) => <Ic size={s} d={<><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></>} />,
  search:    (s) => <Ic size={s} d={<><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></>} />,
  send:      (s) => <Ic size={s} d={<><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></>} />,
  check:     (s) => <Ic size={s} d={<path d="M20 6 9 17l-5-5"/>} />,
  clock:     (s) => <Ic size={s} d={<><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>} />,
  pin:       (s) => <Ic size={s} d={<><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></>} />,
  plus:      (s) => <Ic size={s} d={<><path d="M5 12h14"/><path d="M12 5v14"/></>} />,
  chevron:   (s) => <Ic size={s} d={<path d="m9 18 6-6-6-6"/>} />,
  pause:     (s) => <Ic size={s} d={<><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></>} />,
  // No close Lucide equivalent for this specific "provider connection
  // dial" concept — kept as the original hand-drawn 20px-grid glyph.
  providers: (s) => <Ic size={s} viewBox="0 0 20 20" strokeWidth="1.75" d={<><circle cx="10" cy="10" r="2.4"/><path d="M10 3v2.6M10 14.4V17M3 10h2.6M14.4 10H17M5.2 5.2l1.8 1.8M13 13l1.8 1.8M14.8 5.2 13 7M7 13l-1.8 1.8"/></>} />,
  settings:  (s) => <Ic size={s} d={<><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></>} />,
  spark:     (s) => <Ic size={s} d={<><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></>} />,
  code:      (s) => <Ic size={s} d={<><path d="M12 19h8"/><path d="m4 17 6-6-6-6"/></>} />,
  menu:      (s) => <Ic size={s} d={<><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/></>} />,
  attach:    (s) => <Ic size={s} d={<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>} />,
  pencil:    (s) => <Ic size={s} d={<><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></>} />,
  folder:    (s) => <Ic size={s} d={<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>} />,
  file:      (s) => <Ic size={s} d={<><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/></>} />,
  gitBranch: (s) => <Ic size={s} d={<><path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/></>} />,
  monitor:   (s) => <Ic size={s} d={<><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></>} />,
  // Generic code-repository mark for the Context Panel's Repository
  // section — deliberately NOT a reproduction of any specific hosting
  // provider's trademarked logo (Lucide ships no brand icons at all,
  // confirmed), just a neutral "this is a repo" glyph. Kept as the
  // original hand-drawn 20px-grid version.
  repo:      (s) => <Ic size={s} viewBox="0 0 20 20" strokeWidth="1.75" d={<><rect x="4" y="3" width="12" height="14" rx="1.4"/><path d="M7 3v14M7 6.5h6M7 10h6"/></>} />,
  // Command reference view's sidebar entry — a terminal prompt glyph
  // (">_"), distinct from `code` (now Lucide's terminal.svg). Kept as
  // the original hand-drawn 20px-grid version.
  commandRef: (s) => <Ic size={s} viewBox="0 0 20 20" strokeWidth="1.75" d={<><path d="m4 6 4 4-4 4"/><path d="M11 15h5"/></>} />,
};

/* ---------- Wordmark: lotus in bloom on the water (matches login.html) ---------- */
export function YanaMark({ size = 30 }) {
  return (
    <div aria-label="Yana" style={{
      width: size, height: size, borderRadius: size * 0.32, flex: "none",
      background: "linear-gradient(150deg, color-mix(in oklab, var(--primary) 92%, white), color-mix(in oklab, var(--primary) 72%, var(--ink)))",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.4), 0 4px 12px color-mix(in oklab, var(--primary) 28%, transparent)",
      display: "grid", placeItems: "center", overflow: "hidden",
    }}>
      <img src="/logo.png" alt="" width={size} height={size}
        style={{ display: "block", objectFit: "cover" }} />
    </div>
  );
}

export function Wordmark({ compact }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 2px" }}>
      <YanaMark />
      {!compact && (
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.01em" }}>Yana</div>
          <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.06em" }}>Yana AI</div>
        </div>
      )}
    </div>
  );
}

/* ---------- Sign out ---------- */
export async function signOut() {
  try { await fetch("/api/auth/logout", { method: "POST" }); } catch (_) {}
  location.replace("/login.html");
}

/* ---------- Page scaffolding ---------- */
export function PageHeader({ title, sub, children }) {
  return (
    <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: "var(--gap)" }}>
      <div>
        <h1 className="h-display" style={{ margin: 0, fontSize: "var(--font-size-2xl)" }}>{title}</h1>
        {sub && <p style={{ margin: "3px 0 0", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{sub}</p>}
      </div>
      {children}
    </header>
  );
}

export function Card({ title, aside, children, style, className, interactive }) {
  const iClass = interactive !== false ? "card-interactive" : "";
  return (
    <section className={"glass " + iClass + " " + (className || "")} style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", ...style }}>
      {(title || aside) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          {title && <h2 className="card-title" style={{ margin: 0 }}>{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
