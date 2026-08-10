// Yana AI — app shell: routing + tweaks wiring.
// Converted last of the whole migration since it imports every page —
// see .claude/plans/functional-shimmying-boole.md Phase 4.
import React from 'react';
import { L, Sidebar } from './components.jsx';
import { setLang } from './lib/i18n-lang.js';
import { PageErrorBoundary } from './lib/page-error-boundary.jsx';
import { useTweaks } from './lib/tweaks/use-tweaks.js';
import { TweaksPanel } from './lib/tweaks/panel.jsx';
import { TweakSection, TweakToggle, TweakRadio, TweakSelect } from './lib/tweaks/controls.jsx';
import { TweakColor, TweakButton } from './lib/tweaks/color-control.jsx';
import { applyPresentationPreferences, PRESENTATION_DEFAULTS } from './design/preferences.js';

import { Dashboard } from './dashboard.jsx';
import { Chat } from './pages/chat.jsx';
import { AgentSpace, MissionCenter } from './spaces.jsx';
import { Sessions } from './sessions.jsx';
import { Analytics } from './analytics.jsx';
import { Cron } from './cron.jsx';
import { MemoryGarden } from './pages/memory.jsx';
import { Skills } from './pages/skills.jsx';
import { Providers } from './pages/system/providers.jsx';
import { HtmlMaker } from './html-maker.jsx';
import { Settings } from './pages/system/settings.jsx';
import { CodemateTool } from './codexmate.jsx';
import { TerminalPanel } from './terminal.jsx';
import { VTuber } from './vtuber.jsx';

const TWEAK_DEFAULTS = {
  "theme": "Cyber-Sakura Lotus 🌸",
  "language": "English",
  "layout": "Regular",
  "showAgents": true,
  "showMissions": true,
  "showMemory": true,
  "showSystem": true,
  "accent": "",
  "showVTuber": true,
  "showMotes": true,
  "showRipple": true,
  "showWater": true,
  "chatFont": "System",
  ...PRESENTATION_DEFAULTS,
};

const THEME_MAP = {
  /* ── Signature ── */
  "Cyber-Sakura Lotus 🌸": "cyber-sakura",
  /* ── Light ── */
  "Jade Lake 🌿":    "jade",
  "Lotus Dawn 🌸":   "dawn",
  "Morning Mist ☁️": "mist",
  "Glass Silver ✨":  "silver",
  "Sage Forest 🌲":  "sage",
  "Sunset Amber 🌅": "amber",
  "Arctic Blue ❄️":  "arctic",
  "Lavender Dream 💜": "lavender",
  "iOS Rose 🌷":     "ios-rose",
  /* ── Dark ── */
  "iOS Night 🌙":    "ios-night",
  "Prism Glass 🔮":  "liquid",
  "Obsidian 🌑":     "obsidian",
  "Deep Ocean 🌊":   "ocean",
  "Midnight Navy 🌌":"navy",
};
const DENSITY = { "Compact": 0.85, "Regular": 1, "Spacious": 1.18 };

function applyTweaks(t) {
  const root = document.documentElement;
  root.setAttribute("data-theme", THEME_MAP[t.theme] || "jade");
  root.style.setProperty("--sp", DENSITY[t.layout] || 1);
  if (t.accent) {
    root.style.setProperty("--primary", t.accent);
    root.style.setProperty("--primary-soft", "color-mix(in oklab, " + t.accent + " 10%, transparent)");
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-soft");
  }
  // Effects
  document.body.classList.toggle("no-motes",       t.showMotes      === false);
  document.body.classList.toggle("no-ripple",      t.showRipple     === false);
  document.body.classList.toggle("no-water",       t.showWater      === false);
  document.body.classList.toggle("reduce-motion",  t.reduceMotion   === true);
  applyPresentationPreferences(t);
  const FONT_MAP = {
    "System":     "ui-sans-serif, system-ui, -apple-system, sans-serif",
    "Be Vietnam": "'Be Vietnam Pro', ui-sans-serif, sans-serif",
    "Mono":       "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  };
  root.style.setProperty("--chat-font", FONT_MAP[t.chatFont] || FONT_MAP["System"]);
}

export function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = React.useState(() => localStorage.getItem("yana.page") || "dashboard");
  const mainRef = React.useRef(null);
  setLang(t.language);

  React.useEffect(() => applyTweaks(t), [t]);
  React.useEffect(() => localStorage.setItem("yana.page", page), [page]);

  const Page = {
    dashboard: () => <Dashboard t={t} onNav={setPage} />,
    chat: () => <Chat t={t} />,
    agents: () => <AgentSpace />,
    missions: () => <MissionCenter />,
    sessions:  () => <Sessions />,
    analytics: () => <Analytics />,
    cron:      () => <Cron />,
    memory: () => <MemoryGarden />,
    skills: () => <Skills />,
    providers:    () => <Providers />,
    "html-maker": () => <HtmlMaker />,
    settings:     () => <Settings t={t} setTweak={setTweak} />,
    codexmate:    () => <CodemateTool />,
    // Not routed here — see the <TerminalPanel> comment below.
  }[page] || (() => <Dashboard t={t} onNav={setPage} />);

  return (
    <div className="yana-app" style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", gap: "var(--gap)" }}>
      <Sidebar page={page} onNav={setPage} />
      {/* chat and terminal both manage their own internal scroll regions
          (message log; file tree / editor / terminal buffer) instead of
          letting the whole page grow tall and scroll as one block — with
          <main> itself set to overflow-y: auto, those inner flex children
          never get a stable bounded height to scroll within (the classic
          "overflow: auto ancestor breaks flex: 1 + min-height: 0 children"
          issue), so their own scrollbars silently stop working. */}
      <main ref={mainRef} className="yana-main" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: (page === "chat" || page === "terminal") ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
        <div key={t.language} style={{ flex: 1, minHeight: 0, display: page === "terminal" ? "none" : "flex", flexDirection: "column" }}>
          <PageErrorBoundary pageId={page}><Page /></PageErrorBoundary>
        </div>
        {/* Always mounted (not swapped in/out with the rest of Page above)
            so navigating away and back doesn't reload the embedded VS Code
            — anh's explicit requirement. Toggled purely with CSS display,
            same technique as the per-page div above. */}
        <TerminalPanel active={page === "terminal"} />
      </main>

      {t.showVTuber !== false && <VTuber />}

      <TweaksPanel>
        <TweakSection label={L("Theme", "Giao diện", "테마", "主题")} />
        <TweakSelect label={L("Preset", "Mẫu", "프리셋", "预设")} value={t.theme}
          options={Object.keys(THEME_MAP)}
          onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label={L("Language", "Ngôn ngữ", "언어", "语言")} value={t.language}
          options={["English", "Tiếng Việt", "한국어", "中文"]}
          onChange={(v) => setTweak("language", v)} />

        <TweakSection label={L("Effects", "Hiệu ứng", "효과", "效果")} />
        <TweakToggle label={L("Yana companion", "Nhân vật Yana", "야나 동반자", "야나 伴侣")} value={t.showVTuber !== false} onChange={(v) => setTweak("showVTuber", v)} />
        <TweakToggle label={L("Floating motes", "Hạt nổi", "부유 입자", "浮动粒子")} value={t.showMotes !== false} onChange={(v) => setTweak("showMotes", v)} />
        <TweakToggle label={L("Water ripple", "Gợn nước", "물결 효과", "水面涟漪")} value={t.showRipple !== false} onChange={(v) => setTweak("showRipple", v)} />
        <TweakToggle label={L("Canvas waves", "Sóng canvas", "캔버스 파도", "画布波浪")} value={t.showWater !== false} onChange={(v) => setTweak("showWater", v)} />

        <TweakSection label={L("Layout", "Bố cục", "레이아웃", "布局")} />
        <TweakRadio label={L("Density", "Mật độ", "밀도", "密度")} value={t.layout} options={["Compact", "Regular", "Spacious"]} onChange={(v) => setTweak("layout", v)} />

        <TweakSection label={L("AI panels", "Bảng AI", "AI 패널", "AI 面板")} />
        <TweakToggle label={L("Agents", "Tác nhân", "에이전트", "代理")} value={t.showAgents} onChange={(v) => setTweak("showAgents", v)} />
        <TweakToggle label={L("Missions", "Nhiệm vụ", "미션", "任务")} value={t.showMissions} onChange={(v) => setTweak("showMissions", v)} />
        <TweakToggle label={L("Memory Garden", "Vườn ký ức", "기억 정원", "记忆花园")} value={t.showMemory} onChange={(v) => setTweak("showMemory", v)} />
        <TweakToggle label={L("System status", "Trạng thái hệ thống", "시스템 상태", "系统状态")} value={t.showSystem} onChange={(v) => setTweak("showSystem", v)} />

        <TweakSection label={L("Accent color", "Màu nhấn", "강조 색상", "强调色")} />
        <TweakColor label="" value={t.accent || "#38bdf8"}
          options={["#2f7e6e","#5a8a50","#1a7eb0","#7c5cbf","#b96b80","#c97c18","#3a7ca5","#c06050","#56949f","#6f8f5a"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakButton label={L("Use theme accent", "Dùng màu theo theme", "테마 색상 사용", "使用主题色")} onClick={() => setTweak("accent", "")} />

        <TweakSection label={L("Reset", "Đặt lại", "초기화", "重置")} />
        <TweakButton label={L("↺ Restore defaults", "↺ Khôi phục mặc định", "↺ 기본값 복원", "↺ 恢复默认")} secondary onClick={() => setTweak(TWEAK_DEFAULTS)} />
      </TweaksPanel>

    </div>
  );
}
