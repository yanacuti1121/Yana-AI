// Yana AI desktop-v2 — entry module.
// Temporary router covering every page converted so far (Phases 1-2).
// chat, providers/settings (system.jsx split), and app.jsx's own
// memory/skills pages are still Phase 3/4 work — see
// .claude/plans/functional-shimmying-boole.md. This file itself gets
// replaced by the real app.jsx conversion in Phase 4.
import React from 'react';
import ReactDOM from 'react-dom/client';
import './themes.css';
import { Sidebar } from './components.jsx';
import { Dashboard } from './dashboard.jsx';
import { AgentSpace, MissionCenter } from './spaces.jsx';
import { Sessions } from './sessions.jsx';
import { Analytics } from './analytics.jsx';
import { Cron } from './cron.jsx';
import { HtmlMaker } from './html-maker.jsx';
import { CodemateTool } from './codexmate.jsx';
import { TerminalPage } from './terminal.jsx';
import { VTuber } from './vtuber.jsx';
import { Providers } from './pages/system/providers.jsx';
import { Settings } from './pages/system/settings.jsx';
import { Chat } from './pages/chat.jsx';

// Temporary stand-in for app.jsx's real TWEAK_DEFAULTS/useTweaks (Phase 4) —
// just enough shape for Providers/Settings/AppearanceCard to render without
// crashing during this Phase 1-3 harness.
const TWEAK_DEFAULTS = {
  theme: "Jade Lake 🌿", language: "English", blur: 70, transparency: 60,
  reflection: 70, depth: 55, layout: "Regular", showAgents: true,
  showMissions: true, showMemory: true, showSystem: true, accent: "",
  showVTuber: true, showMotes: true, showRipple: true, showWater: true,
  showGlassShine: true, chatFont: "System", reduceMotion: false,
};

const PAGES = {
  dashboard: () => <Dashboard t={{ showAgents: true, showMissions: true, showMemory: true, showSystem: true }} onNav={setPageGlobal} />,
  agents: () => <AgentSpace />,
  missions: () => <MissionCenter />,
  sessions: () => <Sessions />,
  analytics: () => <Analytics />,
  cron: () => <Cron />,
  "html-maker": () => <HtmlMaker />,
  codexmate: () => <CodemateTool />,
  terminal: () => <TerminalPage />,
  providers: () => <Providers />,
  settings: () => <Settings t={tweakStateGlobal} setTweak={setTweakGlobal} />,
  chat: () => <Chat t={tweakStateGlobal} />,
};

// Set by App() once mounted, so page components' onNav callbacks (which
// close over this module's top-level PAGES map) can still switch pages —
// a temporary wiring detail specific to this Phase 1-2 harness; the real
// app.jsx (Phase 4) does this properly via component state, not a module
// global.
let setPageGlobal = () => {};
let tweakStateGlobal = TWEAK_DEFAULTS;
let setTweakGlobal = () => {};

function App() {
  const [page, setPage] = React.useState('analytics');
  const [tweak, setTweak] = React.useState(TWEAK_DEFAULTS);
  setPageGlobal = setPage;
  tweakStateGlobal = tweak;
  setTweakGlobal = (key, value) => setTweak((prev) => ({ ...prev, [key]: value }));
  const Page = PAGES[page] || PAGES.analytics;
  return (
    <div className="yana-app" style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', gap: 'var(--gap)' }}>
      <Sidebar page={page} onNav={setPage} />
      <main className="yana-main" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: page === 'chat' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column' }}>
        <Page />
      </main>
      <VTuber />
    </div>
  );
}

// Same boot gate as the shipping app: Sidebar/pages read window.YANA
// synchronously at render time, and provider/vault-dependent pages need
// the vault's IndexedDB/WebCrypto init to have already resolved before
// first paint.
window.YanaVault.ready.then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
});
