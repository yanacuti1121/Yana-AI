// Yana AI — shared components: icons, wordmark, sidebar, atoms
import React from 'react';
import { currentLang } from './lib/i18n-lang.js';
const { useState, useEffect, useRef } = React;

/* Multilingual helper: L("English", "Tiếng Việt", "한국어", "中文") */
export function L(en, vi, ko, zh) {
  if (currentLang === "vi" && vi != null) return vi;
  if (currentLang === "ko" && ko != null) return ko;
  if (currentLang === "zh" && zh != null) return zh;
  return en;
}

/* ---------- Icons: minimal 1.5px stroke, 20px grid ---------- */
function Ic({ d, size = 18, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {d}
    </svg>
  );
}
export const Icons = {
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
  code:      (s) => <Ic size={s} d={<><path d="m7 7-4 3 4 3M13 7l4 3-4 3"/><path d="m11 5-2 10"/></>} />,
  menu:      (s) => <Ic size={s} d={<path d="M3.5 6h13M3.5 10h13M3.5 14h13"/>} />,
  attach:    (s) => <Ic size={s} d={<path d="M17.8 9.2l-7.6 7.6a5 5 0 0 1-7.08-7.08l7.65-7.65a3.3 3.3 0 0 1 4.7 4.7L7.8 13.9a1.65 1.65 0 0 1-2.35-2.35l7.07-7.07"/>} />,
  pencil:    (s) => <Ic size={s} d={<><path d="M14 3.5a1.9 1.9 0 0 1 2.5 2.5L6 17H3v-3L14 3.5Z"/><path d="m12.5 5 2.5 2.5"/></>} />,
  // Added for the new app shell's sidebar (Yana Desktop visual parity
  // pass) — no folder/file/git-branch/monitor glyph existed yet.
  folder:    (s) => <Ic size={s} d={<path d="M3 6a1.5 1.5 0 0 1 1.5-1.5h3.6l1.6 2H16A1.5 1.5 0 0 1 17.5 8v7A1.5 1.5 0 0 1 16 16.5H4.5A1.5 1.5 0 0 1 3 15V6Z"/>} />,
  file:      (s) => <Ic size={s} d={<><path d="M6.5 2.5h5l3 3v10.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M11.5 2.5v3h3"/></>} />,
  gitBranch: (s) => <Ic size={s} d={<><circle cx="6" cy="4.5" r="1.8"/><circle cx="6" cy="15.5" r="1.8"/><circle cx="14" cy="8.5" r="1.8"/><path d="M6 6.3v7.4"/><path d="M6 9c0 2.5 2.5 2.7 5.3 3 1 .1 1.9-.6 1.9-1.7"/></>} />,
  monitor:   (s) => <Ic size={s} d={<><rect x="3" y="4" width="14" height="9.5" rx="1.2"/><path d="M7.5 17h5M10 13.5V17"/></>} />,
  // Generic code-repository mark for the Context Panel's Repository
  // section — deliberately NOT a reproduction of any specific hosting
  // provider's trademarked logo, just a neutral "this is a repo" glyph.
  repo:      (s) => <Ic size={s} d={<><rect x="4" y="3" width="12" height="14" rx="1.4"/><path d="M7 3v14M7 6.5h6M7 10h6"/></>} />,
};

/* ---------- Wordmark: lotus in bloom on the water (matches login.html) ---------- */
export function YanaMark({ size = 30 }) {
  return (
    <div aria-label="Yana" style={{
      width: size, height: size, borderRadius: size * 0.32, flex: "none",
      background: "linear-gradient(150deg, color-mix(in oklab, var(--primary) 92%, white), color-mix(in oklab, var(--primary) 72%, #1d3530))",
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

/* ---------- Sidebar ---------- */
export const NAV = [
  { id: "dashboard", label: "Lake",          vi: "Mặt hồ",        ko: "호수",         zh: "湖面",     icon: "dashboard" },
  { id: "missions",  label: "Missions",      vi: "Nhiệm vụ",      ko: "미션",         zh: "任务",     icon: "missions" },
  { id: "chat",      label: "Conversation",  vi: "Trò chuyện",    ko: "대화",         zh: "对话",     icon: "chat" },
  { id: "agents",    label: "Agents",        vi: "Tác nhân",      ko: "에이전트",      zh: "智能体",   icon: "agents" },
  { id: "sessions",  label: "Sessions",      vi: "Lịch sử",       ko: "세션",         zh: "会话",     icon: "memory" },
  { id: "analytics", label: "Analytics",     vi: "Thống kê",      ko: "분석",         zh: "分析",     icon: "dashboard" },
  { id: "cron",      label: "Cron",          vi: "Tự động",       ko: "자동화",        zh: "自动化",   icon: "missions" },
  { id: "memory",    label: "Memory Garden", vi: "Vườn ký ức",    ko: "메모리 가든",    zh: "记忆花园", icon: "memory" },
  { id: "skills",    label: "Skills",        vi: "Kỹ năng",       ko: "스킬",         zh: "技能",     icon: "skills" },
  { id: "providers",  label: "Providers",     vi: "Nhà cung cấp",  ko: "프로바이더",    zh: "提供商",   icon: "providers" },
  { id: "html-maker", label: "HTML Maker",    vi: "Tạo HTML",      ko: "HTML 메이커",   zh: "HTML 制作", icon: "spark" },
  { id: "codexmate",  label: "Codexmate",     vi: "Codexmate",     ko: "Codexmate",    zh: "Codexmate", icon: "code" },
  { id: "terminal",   label: "Terminal",      vi: "Dòng lệnh",     ko: "터미널",        zh: "终端",      icon: "code" },
];

export function Sidebar({ page, onNav }) {
  const D = window.YANA;
  const [account, setAccount] = useState(null);
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(() => localStorage.getItem("yana.avatar-url") || null);
  const profileRef = useRef(null);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setAccount(d.username || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onAvatarUpdate = () => setAvatarUrl(localStorage.getItem("yana.avatar-url") || null);
    window.addEventListener("yana-avatar-changed", onAvatarUpdate);
    return () => window.removeEventListener("yana-avatar-changed", onAvatarUpdate);
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    const close = (e) => { if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [profileOpen]);

  const nav = (id) => { onNav(id); setOpen(false); setProfileOpen(false); };

  const MENU = [
    {
      icon: <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.8v2.4m0 9.6v2.4M2.8 10h2.4m9.6 0h2.4M4.9 4.9l1.7 1.7m6.8 6.8 1.7 1.7m0-10.2-1.7 1.7M6.6 13.4l-1.7 1.7"/></svg>,
      label: L("Settings", "Cài đặt", "설정", "设置"),
      action: () => nav("settings"),
    },
    {
      icon: <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2.5"/></svg>,
      label: L("Customize UI", "Tuỳ biến giao diện", "UI 커스터마이즈", "自定义界面"),
      action: () => { window.postMessage({ type: "__activate_edit_mode" }, "*"); setProfileOpen(false); },
    },
    { divider: true },
    {
      icon: <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 6.5V4.5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 4.5v11A1.5 1.5 0 0 0 5 17h6a1.5 1.5 0 0 0 1.5-1.5v-2M8.5 10H17m0 0-2.5-2.5M17 10l-2.5 2.5"/></svg>,
      label: L("Sign out", "Đăng xuất", "로그아웃", "退出登录"),
      danger: true,
      action: signOut,
    },
  ];

  return (
    <>
      <button className="glass-strong yana-menu-btn" aria-label={L("Open menu", "Mở menu", "메뉴 열기", "打开菜单")}
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
              <span>{L(n.label, n.vi, n.ko, n.zh)}</span>
            </button>
          );
        })}

        <div style={{ flex: 1 }}></div>

        {/* ── Profile footer ────────────────────────────────── */}
        <div ref={profileRef} style={{ position: "relative" }}>

          {/* Popup menu */}
          {profileOpen && (
            <div className="profile-menu">
              {MENU.map((item, i) => item.divider
                ? <div key={i} style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                : (
                  <button key={i} onClick={item.action} className={"profile-menu-item" + (item.danger ? " danger" : "")}>
                    <span style={{ opacity: 0.7 }}>{item.icon}</span>
                    {item.label}
                  </button>
                )
              )}
            </div>
          )}

          {/* Clickable profile row */}
          <button onClick={() => setProfileOpen((v) => !v)} className="profile-row">
            <div className="sidebar-avatar-wrap">
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" style={{
                  width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover",
                  border: "2px solid rgba(var(--surface-rgb), 0.5)", display: "block",
                }} />
              ) : (
                <div className="sidebar-avatar" style={{
                  background: "linear-gradient(145deg, var(--primary), color-mix(in oklab, var(--primary) 60%, var(--gold)))",
                  color: "white", fontSize: 13, fontWeight: 700,
                  border: "2px solid rgba(var(--surface-rgb), 0.5)",
                }}>
                  {(account || "Y").trim().charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3, textAlign: "left" }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: "var(--ink)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{account || "Yana"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                <span className="dot on"></span>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {D.stats.agents} {L("agents", "tác nhân", "에이전트", "智能体")} · {L("All gates on", "Mọi cổng bật", "모든 게이트 활성", "所有门控已启用")}
                </span>
              </div>
            </div>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, color: "var(--ink-3)", transform: profileOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
              <path d="M5 8l5 5 5-5"/>
            </svg>
          </button>
        </div>
      </nav>
    </>
  );
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
