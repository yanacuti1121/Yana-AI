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
};

// Set by App() once mounted, so page components' onNav callbacks (which
// close over this module's top-level PAGES map) can still switch pages —
// a temporary wiring detail specific to this Phase 1-2 harness; the real
// app.jsx (Phase 4) does this properly via component state, not a module
// global.
let setPageGlobal = () => {};

function App() {
  const [page, setPage] = React.useState('analytics');
  setPageGlobal = setPage;
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
