// Yana AI desktop-v2 — entry module (Phase 1: pipeline proof).
// Only Sidebar + Analytics exist as real pages so far; the rest of the
// nav ids are wired to Sidebar/NAV already but have no Page component yet
// until later phases (see .claude/plans/functional-shimmying-boole.md).
import React from 'react';
import ReactDOM from 'react-dom/client';
import './themes.css';
import { Sidebar } from './components.jsx';
import { Analytics } from './analytics.jsx';

function App() {
  const [page, setPage] = React.useState('analytics');
  return (
    <div className="yana-app" style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', gap: 'var(--gap)' }}>
      <Sidebar page={page} onNav={setPage} />
      <main className="yana-main" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Analytics />
      </main>
    </div>
  );
}

// Same boot gate as the shipping app: Sidebar reads window.YANA synchronously
// at render time, and provider/vault-dependent pages need the vault's
// IndexedDB/WebCrypto init to have already resolved before first paint.
window.YanaVault.ready.then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
});
