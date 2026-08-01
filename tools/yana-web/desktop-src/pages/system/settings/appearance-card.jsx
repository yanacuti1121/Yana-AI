// Yana AI — Settings: Appearance card (Apple-style theme picker)
import React from 'react';
import { L, Card } from '../../../components.jsx';
import { YSwitch, YSeg } from './atoms.jsx';

const THEME_PREVIEWS = [
  { label: "Lotus Dawn 🌸",      accent: "#b96b80", sky: "linear-gradient(160deg, #faf5f3 30%, #f2dfdc 100%)", wash: "rgba(236,196,134,.45)" },
  { label: "Jade Lake 🌿",       accent: "#2f7e6e", sky: "linear-gradient(160deg, #f6faf7 30%, #ddeee7 100%)", wash: "rgba(122,184,168,.40)" },
  { label: "Morning Mist ☁️",    accent: "#4a7a6a", sky: "linear-gradient(160deg, #f8f7f4 30%, #ecebe5 100%)", wash: "rgba(214,222,214,.55)" },
  { label: "Glass Silver ✨",     accent: "#3a7ca5", sky: "linear-gradient(160deg, #f3f6fa 30%, #dde6ef 100%)", wash: "rgba(168,199,224,.45)" },
  { label: "Sage Forest 🌲",     accent: "#5a8a50", sky: "linear-gradient(160deg, #f4f7f1 30%, #e4ede0 100%)", wash: "rgba(120,180,100,.38)" },
  { label: "Sunset Amber 🌅",    accent: "#c97c18", sky: "linear-gradient(160deg, #faf4e8 30%, #f0e4cc 100%)", wash: "rgba(248,200,100,.42)" },
  { label: "Arctic Blue ❄️",     accent: "#1a7eb0", sky: "linear-gradient(160deg, #f3f8fc 30%, #ddeef8 100%)", wash: "rgba(160,210,248,.42)" },
  { label: "Lavender Dream 💜",  accent: "#7c5cbf", sky: "linear-gradient(160deg, #f7f4fd 30%, #e8e0f8 100%)", wash: "rgba(190,170,255,.40)" },
  { label: "iOS Rose 🌷",        accent: "#e879a0", sky: "linear-gradient(160deg, #fdf0f6 30%, #f5d0e8 100%)", wash: "rgba(232,121,160,.40)", dark: false },
  { label: "iOS Night 🌙",       accent: "#e879a0", sky: "linear-gradient(160deg, #2a0818 30%, #14020a 100%)", wash: "rgba(232,121,160,.22)", dark: true },
  { label: "Prism Glass 🔮",     accent: "#6060ff", sky: "linear-gradient(160deg, #f5f5fc 30%, #e0e0f8 100%)", wash: "rgba(96,96,255,.35)" },
  { label: "Obsidian 🌑",        accent: "#8080ff", sky: "linear-gradient(160deg, #1a1a2e 30%, #0c0c1a 100%)", wash: "rgba(128,128,255,.22)", dark: true },
  { label: "Deep Ocean 🌊",      accent: "#00c4a7", sky: "linear-gradient(160deg, #0d2030 30%, #071820 100%)", wash: "rgba(0,196,167,.28)", dark: true },
  { label: "Midnight Navy 🌌",   accent: "#6080e0", sky: "linear-gradient(160deg, #121828 30%, #090e1a 100%)", wash: "rgba(60,80,200,.28)", dark: true },
];

function ThemeCard({ p, active, onPick }) {
  const glass = p.dark ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.65)";
  const glass2 = p.dark ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.6)";
  return (
    <button onClick={onPick} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "center", color: "inherit" }}>
      <div style={{
        width: 118, height: 72, borderRadius: 12, background: p.sky, position: "relative", overflow: "hidden",
        boxShadow: active
          ? "0 0 0 2px var(--bg-base), 0 0 0 4px " + p.accent
          : "inset 0 0 0 1px var(--border)",
        transition: "box-shadow .15s",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(80px 40px at 80% 100%, " + p.wash + ", transparent 70%)" }}></div>
        <div style={{ position: "absolute", left: 8, top: 8, bottom: 8, width: 26, borderRadius: 6, background: glass, boxShadow: "inset 0 0 0 .5px rgba(255,255,255,.25)" }}></div>
        <div style={{ position: "absolute", left: 40, top: 8, right: 8, height: 22, borderRadius: 6, background: glass2 }}></div>
        <div style={{ position: "absolute", left: 40, top: 34, width: 34, height: 30, borderRadius: 6, background: glass2 }}></div>
        <div style={{ position: "absolute", left: 80, top: 34, right: 8, height: 30, borderRadius: 6, background: glass2 }}></div>
        <div style={{ position: "absolute", left: 13, top: 13, width: 10, height: 10, borderRadius: 4, background: p.accent, opacity: .9 }}></div>
      </div>
      <div style={{ fontSize: 12, marginTop: 7, fontWeight: active ? 500 : 400, color: active ? "var(--ink)" : "var(--ink-2)" }}>{p.label}</div>
    </button>
  );
}

const ACCENTS = ["#2f7e6e", "#56949f", "#3a7ca5", "#7d6aa8", "#b96b80", "#b07a4f", "#b78f3d", "#6f8f5a", "#5b7282"];

export function AppearanceCard({ t, setTweak }) {
  const toggleLabels = [
    [L("Show agents on Lake", "Hiện tác nhân trên Mặt hồ", "호수에 에이전트 표시", "在湖面显示智能体"), "showAgents"],
    [L("Show missions on Lake", "Hiện nhiệm vụ trên Mặt hồ", "호수에 미션 표시", "在湖面显示任务"), "showMissions"],
    [L("Show Memory Garden", "Hiện Vườn ký ức", "메모리 가든 표시", "显示记忆花园"), "showMemory"],
    [L("Show system status", "Hiện trạng thái hệ thống", "시스템 상태 표시", "显示系统状态"), "showSystem"],
    [L("Reduce motion", "Giảm chuyển động", "모션 줄이기", "减少动效"), "reduceMotion"],
  ];
  return (
    <Card title={L("Appearance", "Giao diện", "외관", "外观")} style={{ gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        {THEME_PREVIEWS.map((p) => (
          <ThemeCard key={p.label} p={p} active={t.theme === p.label} onPick={() => setTweak("theme", p.label)} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, width: 110, flex: "none" }}>{L("Accent colour", "Màu nhấn", "강조 색상", "强调色")}</span>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <button onClick={() => setTweak("accent", "")} title={L("Theme default", "Màu mặc định theme", "테마 기본값", "主题默认色")} style={{
            width: 22, height: 22, borderRadius: "50%", cursor: "pointer", padding: 0,
            background: "conic-gradient(#2f7e6e, #3a7ca5, #b96b80, #b78f3d, #2f7e6e)",
            border: "none",
            boxShadow: !t.accent ? "0 0 0 2px var(--bg-base), 0 0 0 4px var(--ink-3)" : "inset 0 0 0 1px rgba(0,0,0,.08)",
          }}></button>
          {ACCENTS.map((c) => (
            <button key={c} onClick={() => setTweak("accent", c)} style={{
              width: 22, height: 22, borderRadius: "50%", cursor: "pointer", padding: 0,
              background: c, border: "none",
              boxShadow: t.accent === c ? "0 0 0 2px var(--bg-base), 0 0 0 4px " + c : "inset 0 0 0 1px rgba(0,0,0,.08)",
            }}></button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: "auto" }}>
          {t.accent ? t.accent : L("Theme default", "Màu mặc định", "테마 기본값", "主题默认色")}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, width: 110, flex: "none" }}>{L("Density", "Mật độ", "밀도", "密度")}</span>
        <YSeg options={["Compact", "Regular", "Spacious"]} value={t.layout} onChange={(v) => setTweak("layout", v)} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, width: 110, flex: "none" }}>{L("Chat font", "Font trò chuyện", "채팅 글꼴", "聊天字体")}</span>
        <YSeg
          options={["System", "Be Vietnam", "Mono"]}
          value={t.chatFont || "System"}
          onChange={(v) => setTweak("chatFont", v)}
        />
        <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: "auto" }}>
          {(t.chatFont || "System") === "System"    && L("ui-sans-serif — fastest", "ui-sans-serif — nhanh nhất", "ui-sans-serif — 가장 빠름", "ui-sans-serif — 最快")}
          {(t.chatFont || "System") === "Be Vietnam" && L("Be Vietnam Pro — elegant", "Be Vietnam Pro — thanh lịch", "Be Vietnam Pro — 우아함", "Be Vietnam Pro — 优雅")}
          {(t.chatFont || "System") === "Mono"       && L("ui-monospace — code-ready", "ui-monospace — thân thiện code", "ui-monospace — 코드에 적합", "ui-monospace — 适合代码")}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "4px 24px", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        {toggleLabels.map(([label, key]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0" }}>
            <span style={{ fontSize: 13 }}>{label}</span>
            <YSwitch value={t[key]} onChange={(v) => setTweak(key, v)} />
          </div>
        ))}
      </div>
    </Card>
  );
}
