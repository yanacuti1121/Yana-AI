// Yana AI — shared components: icons, wordmark, sidebar, atoms
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
  dashboard: (s) => <Ic size={s} d={<><rect x="3" y="3" width="6" height="6" rx="1.6"/><rect x="11" y="3" width="6" height="6" rx="1.6"/><rect x="3" y="11" width="6" height="6" rx="1.6"/><rect x="11" y="11" width="6" height="6" rx="1.6"/></>} />,
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
  menu:      (s) => <Ic size={s} d={<path d="M3.5 6h13M3.5 10h13M3.5 14h13"/>} />,
};

/* ---------- Wordmark: lotus in bloom on the water (matches login.html) ---------- */
function YanaMark({ size = 30 }) {
  return (
    <div aria-label="Yana" style={{
      width: size, height: size, borderRadius: size * 0.32, flex: "none",
      background: "linear-gradient(150deg, color-mix(in oklab, var(--primary) 92%, white), color-mix(in oklab, var(--primary) 72%, #1d3530))",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.4), 0 4px 12px color-mix(in oklab, var(--primary) 28%, transparent)",
      display: "grid", placeItems: "center",
    }}>
      <img src="/logo.png" alt="" width={Math.round(size * 0.74)} height={Math.round(size * 0.74)}
        style={{ display: "block" }} />
    </div>
  );
}

function Wordmark({ compact }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 2px" }}>
      <YanaMark />
      {!compact && (
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.01em" }}>Yana</div>
          <div style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.06em" }}>YAMTAM ENGINE</div>
        </div>
      )}
    </div>
  );
}

/* ---------- Sign out ---------- */
async function signOut() {
  try { await fetch("/api/auth/logout", { method: "POST" }); } catch (_) {}
  location.replace("/login.html");
}

/* ---------- Sidebar ---------- */
const NAV = [
  { id: "dashboard", label: "Lake",          vi: "Mặt hồ",        icon: "dashboard" },
  { id: "missions",  label: "Missions",      vi: "Nhiệm vụ",      icon: "missions" },
  { id: "chat",      label: "Conversation",  vi: "Trò chuyện",    icon: "chat" },
  { id: "agents",    label: "Agents",        vi: "Tác nhân",      icon: "agents" },
  { id: "memory",    label: "Memory Garden", vi: "Vườn ký ức",    icon: "memory" },
  { id: "skills",    label: "Skills",        vi: "Kỹ năng",       icon: "skills" },
  { id: "providers", label: "Providers",     vi: "Nhà cung cấp",  icon: "providers" },
  { id: "settings",  label: "Settings",      vi: "Cài đặt",       icon: "settings" },
];

function Sidebar({ page, onNav }) {
  const D = window.YANA;
  const [account, setAccount] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setAccount(d.username || null))
      .catch(() => {});
  }, []);
  const nav = (id) => { onNav(id); setOpen(false); };
  return (
    <>
      <button className="glass-strong yana-menu-btn" aria-label={L("Open menu", "Mở menu")}
        aria-expanded={open} onClick={() => setOpen(true)}>
        {Icons.menu(18)}
      </button>
      <div className={"yana-backdrop" + (open ? " show" : "")} onClick={() => setOpen(false)} aria-hidden="true"></div>
    <nav className={"glass yana-sidebar" + (open ? " open" : "")} style={{
      borderRadius: "var(--r-lg)",
      display: "flex", flexDirection: "column",
      padding: "calc(14px * var(--sp))", gap: 4,
    }}>
      <div style={{ marginBottom: "calc(14px * var(--sp))" }}><Wordmark /></div>

      {NAV.map((n) => {
        const active = page === n.id;
        return (
          <button key={n.id} onClick={() => nav(n.id)} style={{
            display: "flex", alignItems: "center", gap: 11,
            padding: "calc(8px * var(--sp)) 11px", borderRadius: "var(--r-sm)",
            border: "none", cursor: "pointer", width: "100%", textAlign: "left",
            fontSize: 13.5, fontWeight: active ? 500 : 400,
            color: active ? "var(--primary)" : "var(--ink-2)",
            background: active ? "var(--primary-soft)" : "transparent",
            transition: "background .15s, color .15s",
          }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(var(--surface-rgb), .5)"; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
            {Icons[n.icon](17)}
            <span>{L(n.label, n.vi)}</span>
          </button>
        );
      })}

      <div style={{ flex: 1 }}></div>

      <div style={{
        borderRadius: "var(--r-md)", padding: "11px 12px",
        background: "var(--primary-soft)",
        display: "flex", flexDirection: "column", gap: 7,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--primary)" }}>{Icons.safety(16)}</span>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--primary)" }}>YAMTAM Core</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{D.stats.agents} {L("agents supervised", "tác nhân được giám sát")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="dot on"></span>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{L("All gates active", "Mọi cổng an toàn đang bật")}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px 2px" }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%", flex: "none",
          background: "linear-gradient(145deg, var(--gold), color-mix(in oklab, var(--gold) 55%, white))",
          color: "white", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600,
        }}>{(account || "Y").trim().charAt(0).toUpperCase()}</div>
        <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
          <div title={account || ""} style={{
            fontSize: 12.5, fontWeight: 500,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{account || "Yana"}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{L("Account", "Tài khoản")} · YAMTAM</div>
        </div>
        <button onClick={signOut} title={L("Sign out", "Đăng xuất")} aria-label={L("Sign out", "Đăng xuất")} style={{
          background: "none", border: "none", cursor: "pointer", padding: 4,
          color: "var(--ink-3)", display: "inline-flex", borderRadius: 8,
        }}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.5 6.5V4.5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 4.5v11A1.5 1.5 0 0 0 5 17h6a1.5 1.5 0 0 0 1.5-1.5v-2M8.5 10H17m0 0-2.5-2.5M17 10l-2.5 2.5" />
          </svg>
        </button>
      </div>
    </nav>
    </>
  );
}

/* ---------- Page scaffolding ---------- */
function PageHeader({ title, sub, children }) {
  return (
    <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: "var(--gap)" }}>
      <div>
        <h1 className="h-display" style={{ margin: 0, fontSize: 26 }}>{title}</h1>
        {sub && <p style={{ margin: "3px 0 0", color: "var(--ink-2)", fontSize: 13.5 }}>{sub}</p>}
      </div>
      {children}
    </header>
  );
}

function Card({ title, aside, children, style, className }) {
  return (
    <section className={"glass " + (className || "")} style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", ...style }}>
      {(title || aside) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          {title && <h2 className="label-xs" style={{ margin: 0 }}>{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

Object.assign(window, { Icons, YanaMark, Wordmark, Sidebar, PageHeader, Card, NAV });
