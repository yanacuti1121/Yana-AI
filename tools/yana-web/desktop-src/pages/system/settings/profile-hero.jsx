// Yana AI — Settings: Profile Hero (avatar/name/theme-mode strip).
//
// Split out of profile-card.jsx (which originally held both ProfileHero and
// ProfileCard) purely to fit this repo's 300-line file limit — ProfileCard
// is a separate, unrelated component. State logic is further split into
// three small hooks below (useDisplayName, useAvatar, useColorMode) so the
// ProfileHero component function itself stays under the 50-line function
// limit — in the original file this was all one ~240-line function body.
import React from 'react';
import { L } from '../../../components.jsx';
import { providerAvailable } from '../../../lib/provider-config.js';

const DARK_THEMES = new Set(["iOS Night 🌙", "Obsidian 🌑"]);

function useDisplayName(account) {
  const [dispName, setDispName] = React.useState(() =>
    localStorage.getItem("yana.display-name") || account || "Yana AI"
  );
  const [editingName, setEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(() =>
    localStorage.getItem("yana.display-name") || account || "Yana AI"
  );
  const nameInputRef = React.useRef(null);

  function editName() {
    setNameDraft(dispName);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 20);
  }
  function saveName() {
    const next = nameDraft.trim() || account || "Yana AI";
    setDispName(next);
    localStorage.setItem("yana.display-name", next);
    setEditingName(false);
  }
  function handleNameKeyDown(e) {
    if (e.key === "Enter") saveName();
    if (e.key === "Escape") setEditingName(false);
  }

  return { dispName, editingName, nameDraft, setNameDraft, nameInputRef, editName, saveName, handleNameKeyDown };
}

function useAvatar() {
  const [avatarUrl, setAvatarUrl] = React.useState(() =>
    localStorage.getItem("yana.avatar-url") || null
  );
  const avatarInputRef = React.useRef(null);

  function onAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target.result;
      setAvatarUrl(url);
      localStorage.setItem("yana.avatar-url", url);
      window.dispatchEvent(new CustomEvent("yana-avatar-changed"));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return { avatarUrl, avatarInputRef, onAvatarChange };
}

function useColorMode(t, setTweak) {
  const [colorMode, setColorMode] = React.useState(() => {
    const stored = localStorage.getItem("yana.color-mode");
    if (stored === "auto") return "auto";
    return DARK_THEMES.has(t.theme) ? "dark" : "light";
  });
  // Sync when theme changes externally (e.g. AppearanceCard click)
  React.useEffect(() => {
    if (localStorage.getItem("yana.color-mode") !== "auto") {
      setColorMode(DARK_THEMES.has(t.theme) ? "dark" : "light");
    }
  }, [t.theme]);

  function applyMode(mode) {
    localStorage.setItem("yana.color-mode", mode);
    setColorMode(mode);
    if (mode === "dark") {
      if (!DARK_THEMES.has(t.theme)) localStorage.setItem("yana.last-light-theme", t.theme);
      setTweak("theme", localStorage.getItem("yana.last-dark-theme") || "iOS Night 🌙");
    } else if (mode === "light") {
      if (DARK_THEMES.has(t.theme)) localStorage.setItem("yana.last-dark-theme", t.theme);
      setTweak("theme", localStorage.getItem("yana.last-light-theme") || "Jade Lake 🌿");
    } else {
      // auto — follow system preference
      if (DARK_THEMES.has(t.theme)) localStorage.setItem("yana.last-dark-theme", t.theme);
      else localStorage.setItem("yana.last-light-theme", t.theme);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTweak("theme",
        prefersDark
          ? (localStorage.getItem("yana.last-dark-theme") || "iOS Night 🌙")
          : (localStorage.getItem("yana.last-light-theme") || "Jade Lake 🌿")
      );
    }
  }

  return { colorMode, applyMode };
}

export function ProfileHero({ t, setTweak, dash }) {
  const D = window.YANA;
  const account = D.account || "";
  const initial = account.trim().charAt(0).toUpperCase() || "Y";

  const name = useDisplayName(account);
  const avatar = useAvatar();
  const mode = useColorMode(t, setTweak);

  const memberSince = React.useMemo(() => {
    const key = "yana.member-since";
    let s = localStorage.getItem(key);
    if (!s) {
      s = new Date().toLocaleDateString(
        { "Tiếng Việt": "vi-VN", "한국어": "ko-KR", "中文": "zh-CN" }[t.language] || "en-US",
        { year: "numeric", month: "long" }
      );
      localStorage.setItem(key, s);
    }
    return s;
  }, []);

  const connectedCount = D.providers.filter((p) => providerAvailable(p.id)).length;
  const heroStats = [
    { v: D.stats.agents,                  lb: L("agents", "tác nhân", "에이전트", "智能体") },
    { v: dash ? dash.memories.total : "…", lb: L("memories", "ký ức", "메모리", "记忆") },
    { v: connectedCount + "/" + D.providers.length, lb: L("providers", "kết nối", "프로바이더", "提供商") },
    { v: L("Strict", "Nghiêm", "엄격", "严格"),            lb: L("gate mode", "chế độ cổng", "게이트 모드", "门控模式") },
  ];

  const MODES = [
    { key: "light", icon: "☀️", label: L("Light", "Sáng", "라이트", "浅色") },
    { key: "dark",  icon: "🌙", label: L("Dark", "Tối", "다크", "深色") },
    { key: "auto",  icon: "✦",  label: L("Auto", "Tự động", "자동", "自动") },
  ];

  return (
    <div style={{
      borderRadius: "var(--r-md)",
      background: "rgba(var(--surface-rgb), 0.65)",
      backdropFilter: "blur(20px) saturate(140%)",
      border: "0.5px solid var(--border)",
      boxShadow: "0 4px 28px rgba(var(--shadow-rgb), .1), 0 1px 0 rgba(255,255,255,.22) inset",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Ambient gradient overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 11%, transparent) 0%, transparent 52%, color-mix(in oklab, var(--gold, #c9a227) 6%, transparent) 100%)",
      }} />

      {/* Avatar + info row */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "22px 24px 20px", position: "relative" }}>
        <div className="sidebar-avatar-wrap"
          onClick={() => avatar.avatarInputRef.current?.click()}
          title={L("Change photo", "Đổi ảnh đại diện", "사진 변경", "更换照片")}
          style={{ width: 56, height: 56, flexShrink: 0, position: "relative", cursor: "pointer" }}
        >
          <input ref={avatar.avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={avatar.onAvatarChange} />
          {avatar.avatarUrl ? (
            <img src={avatar.avatarUrl} alt="avatar" style={{
              width: 56, height: 56, borderRadius: "50%", objectFit: "cover",
              border: "2.5px solid rgba(var(--surface-rgb), 0.55)",
              display: "block",
            }} />
          ) : (
            <div className="sidebar-avatar" style={{
              fontSize: 21, fontWeight: 700,
              background: "linear-gradient(145deg, var(--primary), color-mix(in oklab, var(--primary) 60%, var(--gold, #c9a227)))",
              color: "white",
              border: "2.5px solid rgba(var(--surface-rgb), 0.55)",
            }}>{initial}</div>
          )}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: 0, transition: "opacity .15s",
            fontSize: 18,
          }} onMouseEnter={e => e.currentTarget.style.opacity = 1}
             onMouseLeave={e => e.currentTarget.style.opacity = 0}>
            📷
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {name.editingName ? (
              <input ref={name.nameInputRef} value={name.nameDraft}
                onChange={e => name.setNameDraft(e.target.value)}
                onKeyDown={name.handleNameKeyDown} onBlur={name.saveName}
                style={{
                  fontSize: 17, fontWeight: 700, color: "var(--ink)", lineHeight: 1.2,
                  background: "transparent", border: "none",
                  borderBottom: "1.5px solid var(--primary)",
                  outline: "none", fontFamily: "inherit", minWidth: 80, width: "auto",
                }} />
            ) : (
              <>
                <span style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", lineHeight: 1.2 }}>{name.dispName}</span>
                <button onClick={name.editName} title={L("Edit name", "Sửa tên", "이름 수정", "编辑名称")} style={{
                  background: "none", border: "none", padding: "2px 8px", borderRadius: 6, cursor: "pointer",
                  fontSize: 11, color: "var(--ink-3)",
                }}>✎</button>
              </>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 3 }}>{account}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
            {L("Member since", "Thành viên từ", "가입일", "加入于")} {memberSince}
          </div>
        </div>

        <span style={{
          background: "color-mix(in oklab, var(--primary) 13%, transparent)",
          color: "var(--primary)", border: "0.5px solid color-mix(in oklab, var(--primary) 28%, transparent)",
          padding: "3px 11px", borderRadius: 99, fontSize: 11.5, fontWeight: 600,
          flexShrink: 0, alignSelf: "flex-start",
        }}>Sovereign</span>
      </div>

      {/* Dark mode toggle row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "9px 24px", borderTop: "0.5px solid var(--border)", position: "relative",
      }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          {L("Appearance mode", "Chế độ hiển thị", "화면 모드", "外观模式")}
        </span>
        <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 9, background: "rgba(var(--shadow-rgb), .07)" }}>
          {MODES.map(({ key, icon, label }) => (
            <button key={key} onClick={() => mode.applyMode(key)} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 11px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: mode.colorMode === key ? 500 : 400,
              background: mode.colorMode === key ? "rgba(var(--surface-rgb), .95)" : "transparent",
              boxShadow: mode.colorMode === key ? "0 1px 3px rgba(var(--shadow-rgb), .15)" : "none",
              color: mode.colorMode === key ? "var(--ink)" : "var(--ink-3)",
              transition: "background .15s, color .15s", fontFamily: "inherit",
            }}>
              <span style={{ fontSize: 13 }}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: "flex", borderTop: "0.5px solid var(--border)", position: "relative" }}>
        {heroStats.map((s, i) => (
          <div key={i} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "11px 6px",
            borderRight: i < heroStats.length - 1 ? "0.5px solid var(--border)" : "none",
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{s.v}</span>
            <span style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1, textAlign: "center" }}>{s.lb}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
