// Yana Mobile — shell: icons, wordmark, bilingual helper, mobile chrome, atoms
const { useState, useEffect, useMemo, useRef } = React;

/* Bilingual helper: L("English", "Tiếng Việt") */
window.L = (en, vi) => (window.YANA_LANG === "vi" ? vi : en);

/* ---------- Icons: minimal 1.5px stroke, 20px grid ---------- */
function Ic({ d, size = 18, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {d}
    </svg>
  );
}
const Icons = {
  dashboard: (s) => <Ic size={s} d={<><path d="M10 3.2 16.5 8v8.2a.8.8 0 0 1-.8.8h-3.2v-4.4H7.5V17H4.3a.8.8 0 0 1-.8-.8V8L10 3.2Z"/></>} />,
  chat:      (s) => <Ic size={s} d={<path d="M17 9.5c0 3.3-3.1 6-7 6-.9 0-1.8-.14-2.6-.4L3 16.5l1.2-3.1C3.4 12.3 3 11 3 9.5c0-3.3 3.1-6 7-6s7 2.7 7 6Z"/>} />,
  agents:    (s) => <Ic size={s} d={<><circle cx="7" cy="7.5" r="3"/><path d="M2.5 16.5c.6-2.6 2.4-4 4.5-4s3.9 1.4 4.5 4"/><circle cx="14.5" cy="8.5" r="2.2"/><path d="M13.3 12.6c2 .2 3.6 1.5 4.2 3.9"/></>} />,
  missions:  (s) => <Ic size={s} d={<><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.4"/><circle cx="10" cy="10" r="0.4" fill="currentColor"/></>} />,
  memory:    (s) => <Ic size={s} d={<><path d="M10 17c4-1.6 6.2-4.4 6.2-8.1C16.2 6 14.5 4 12.3 4 11.3 4 10.4 4.5 10 5.3 9.6 4.5 8.7 4 7.7 4 5.5 4 3.8 6 3.8 8.9 3.8 12.6 6 15.4 10 17Z"/><path d="M10 17V9.5"/></>} />,
  skills:    (s) => <Ic size={s} d={<><path d="m10 3 7 3.5L10 10 3 6.5 10 3Z"/><path d="m3 10.5 7 3.5 7-3.5"/><path d="m3 14.5 7 3.5 7-3.5"/></>} />,
  safety:    (s) => <Ic size={s} d={<><path d="M10 2.8 16 5v4.7c0 3.6-2.4 6.4-6 7.8-3.6-1.4-6-4.2-6-7.8V5l6-2.2Z"/><path d="m7.4 9.8 1.8 1.8 3.4-3.6"/></>} />,
  search:    (s) => <Ic size={s} d={<><circle cx="9" cy="9" r="5.5"/><path d="m17 17-4-4"/></>} />,
  send:      (s) => <Ic size={s} d={<path d="M3.5 10 17 3.5 13.5 17l-3-5.5-7-1.5Zm7 1.5L17 3.5"/>} />,
  check:     (s) => <Ic size={s} d={<path d="m4.5 10.5 3.5 3.5 7.5-8"/>} />,
  clock:     (s) => <Ic size={s} d={<><circle cx="10" cy="10" r="7"/><path d="M10 6v4.2l2.6 1.6"/></>} />,
  pin:       (s) => <Ic size={s} d={<path d="m11.5 3 5.5 5.5-2.8.7-2.5 2.5-.4 3.8-3-3L4 16.3 7.5 12l-3-3 3.8-.4 2.5-2.5.7-2.6Z"/>} />,
  plus:      (s) => <Ic size={s} d={<path d="M10 4v12M4 10h12"/>} />,
  chevron:   (s) => <Ic size={s} d={<path d="m7.5 4.5 5 5.5-5 5.5"/>} />,
  pause:     (s) => <Ic size={s} d={<path d="M7.5 5v10M12.5 5v10"/>} />,
  providers: (s) => <Ic size={s} d={<><circle cx="10" cy="10" r="2.4"/><path d="M10 3v2.6M10 14.4V17M3 10h2.6M14.4 10H17M5.2 5.2l1.8 1.8M13 13l1.8 1.8M14.8 5.2 13 7M7 13l-1.8 1.8"/></>} />,
  settings:  (s) => <Ic size={s} d={<><circle cx="10" cy="10" r="2.6"/><path d="M10 2.8v2.4m0 9.6v2.4M2.8 10h2.4m9.6 0h2.4M4.9 4.9l1.7 1.7m6.8 6.8 1.7 1.7m0-10.2-1.7 1.7M6.6 13.4l-1.7 1.7"/></>} />,
  spark:     (s) => <Ic size={s} d={<path d="M10 3c.5 3.9 2.6 6.1 7 7-4.4.9-6.5 3.1-7 7-.5-3.9-2.6-6.1-7-7 4.4-.9 6.5-3.1 7-7Z"/>} />,
  more:      (s) => <Ic size={s} d={<><circle cx="4.5" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10" r="1.3" fill="currentColor" stroke="none"/></>} />,
  bell:      (s) => <Ic size={s} d={<><path d="M6 8.5a4 4 0 0 1 8 0c0 3 1 4.2 1.6 4.8H4.4C5 12.7 6 11.5 6 8.5Z"/><path d="M8.4 15.5a1.8 1.8 0 0 0 3.2 0"/></>} />,
  back:      (s) => <Ic size={s} d={<path d="m11.5 5-5 5 5 5"/>} />,
};

/* ---------- Wordmark: lotus bud resting on the water ---------- */
function YanaMark({ size = 30 }) {
  return (
    <div aria-label="Yana" style={{
      width: size, height: size, borderRadius: size * 0.32, flex: "none",
      background: "linear-gradient(145deg, color-mix(in oklab, var(--primary) 88%, white), color-mix(in oklab, var(--primary) 60%, var(--pink)))",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.5), 0 4px 12px color-mix(in oklab, var(--primary) 28%, transparent)",
      display: "grid", placeItems: "center",
    }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 20 20" fill="none"
        stroke="rgba(255,255,255,.95)" strokeWidth="1.6" strokeLinecap="round">
        <path d="M10 2.8C7.5 5.3 7.5 8.7 10 10.7c2.5-2 2.5-5.4 0-7.9Z" />
        <path d="M4.8 13.3c1.6 1.5 3.3 2.2 5.2 2.2s3.6-.7 5.2-2.2" />
        <path d="M7.3 16.5c.85.6 1.75.9 2.7.9s1.85-.3 2.7-.9" />
      </svg>
    </div>
  );
}

/* ---------- Mobile navigation model ---------- */
// Primary tabs live in the thumb zone; the rest fold into More.
const TABS = [
  { id: "dashboard", label: "Lake",         vi: "Mặt hồ",      icon: "dashboard" },
  { id: "missions",  label: "Missions",     vi: "Nhiệm vụ",    icon: "missions" },
  { id: "chat",      label: "Chat",         vi: "Trò chuyện",  icon: "chat" },
  { id: "agents",    label: "Agents",       vi: "Tác nhân",    icon: "agents" },
];
const MORE_ITEMS = [
  { id: "memory",    label: "Memory Garden", vi: "Vườn ký ức",   icon: "memory" },
  { id: "skills",    label: "Skills",        vi: "Kỹ năng",      icon: "skills" },
  { id: "providers", label: "Providers",     vi: "Nhà cung cấp", icon: "providers" },
  { id: "settings",  label: "Settings",      vi: "Cài đặt",      icon: "settings" },
];
const ALL_PAGES = [...TABS, ...MORE_ITEMS];
const PAGE_TITLE = (id) => {
  const p = ALL_PAGES.find((x) => x.id === id);
  return p ? L(p.label, p.vi) : "Yana";
};

/* ---------- Top bar ---------- */
function TopBar({ page, lang, onLang, onMore }) {
  const onLake = page === "dashboard";
  return (
    <header className="mtopbar">
      <div className="mtopbar-l">
        {onLake
          ? <YanaMark size={30} />
          : <span style={{ color: "var(--primary)", display: "inline-flex" }}>{Icons[ALL_PAGES.find((x) => x.id === page)?.icon || "dashboard"](20)}</span>}
        <div style={{ minWidth: 0 }}>
          <div className="mtopbar-title">{onLake ? "Yana" : PAGE_TITLE(page)}</div>
          {onLake && <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".06em" }}>YAMTAM ENGINE</div>}
        </div>
      </div>
      <div className="mtopbar-r">
        <button className="lang-pill" onClick={onLang}>{lang === "vi" ? "VI" : "EN"}</button>
        <button className="icon-btn" aria-label="Notifications">{Icons.bell(18)}</button>
        <button className="avatar-btn" onClick={onMore} aria-label="Menu">T</button>
      </div>
    </header>
  );
}

/* ---------- Bottom tab bar ---------- */
function TabBar({ page, onNav, onMore }) {
  const moreActive = MORE_ITEMS.some((m) => m.id === page);
  return (
    <nav className="mtabbar">
      {TABS.map((tb) => (
        <button key={tb.id} className="mtab" data-on={page === tb.id ? "1" : "0"} onClick={() => onNav(tb.id)}>
          <span className="tab-ic">{Icons[tb.icon](22)}</span>
          <span>{L(tb.label, tb.vi)}</span>
        </button>
      ))}
      <button className="mtab" data-on={moreActive ? "1" : "0"} onClick={onMore}>
        <span className="tab-ic">{Icons.more(22)}</span>
        <span>{L("More", "Thêm")}</span>
      </button>
    </nav>
  );
}

/* ---------- Generic slide-up sheet ---------- */
function Sheet({ open, title, onClose, children }) {
  const [mounted, setMounted] = React.useState(open);
  React.useEffect(() => {
    if (open) setMounted(true);
    else { const t = setTimeout(() => setMounted(false), 320); return () => clearTimeout(t); }
  }, [open]);
  if (!mounted) return null;
  return (
    <>
      <div className="sheet-backdrop" data-show={open ? "1" : "0"} onClick={onClose}></div>
      <div className="sheet" data-show={open ? "1" : "0"} role="dialog">
        <div className="sheet-grab" onClick={onClose}></div>
        {title && <div className="sheet-title">{title}</div>}
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

/* ---------- More sheet (secondary nav) ---------- */
function MoreSheet({ open, page, onNav, onClose }) {
  const D = window.YANA;
  return (
    <Sheet open={open} title={L("All sections", "Tất cả mục")} onClose={onClose}>
      <div className="more-grid">
        {MORE_ITEMS.map((m) => (
          <button key={m.id} className="more-item" onClick={() => { onNav(m.id); onClose(); }}
            style={page === m.id ? { background: "var(--primary-soft)" } : null}>
            <span className="more-ic">{Icons[m.icon](19)}</span>
            <span className="more-lbl">{L(m.label, m.vi)}</span>
            <span className="more-chev">{Icons.chevron(16)}</span>
          </button>
        ))}
      </div>
      <div style={{
        marginTop: 6, borderRadius: "var(--r-md)", padding: "13px 14px",
        background: "var(--primary-soft)", display: "flex", flexDirection: "column", gap: 7,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--primary)" }}>{Icons.safety(16)}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--primary)" }}>YAMTAM Core</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{D.stats.agents} {L("agents supervised", "tác nhân được giám sát")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="dot on"></span>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("All gates active", "Mọi cổng an toàn đang bật")}</span>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------- Large-title header for a page ---------- */
function MHead({ title, sub, children }) {
  return (
    <div className="mhead">
      <div className="mhead-row">
        <h1 className="h-display mhead-title">{title}</h1>
        {children}
      </div>
      {sub && <p className="mhead-sub">{sub}</p>}
    </div>
  );
}

/* ---------- Card (mobile) ---------- */
function MCard({ title, aside, children, style, pad = true, onClick }) {
  return (
    <section className="glass" onClick={onClick} style={{
      borderRadius: "var(--r-lg)", padding: pad ? "var(--pad-card)" : 0,
      ...(onClick ? { cursor: "pointer" } : null), ...style,
    }}>
      {(title || aside) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, padding: pad ? 0 : "var(--pad-card) var(--pad-card) 0" }}>
          {title && <h2 className="label-xs" style={{ margin: 0 }}>{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/* A "see all" link used in card headers */
function SeeAll({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: "none", border: "none", cursor: "pointer", color: "var(--primary)",
      fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 1, padding: 0,
    }}>{label} {Icons.chevron(13)}</button>
  );
}

Object.assign(window, {
  Icons, YanaMark, TopBar, TabBar, Sheet, MoreSheet, MHead, MCard, SeeAll,
  TABS, MORE_ITEMS, ALL_PAGES, PAGE_TITLE,
});
