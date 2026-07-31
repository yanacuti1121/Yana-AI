// Yana AI desktop-v2 — entry module.
// Phase 4 of the migration (see .claude/plans/functional-shimmying-boole.md):
// this is now the real app, not the Phase 1-3 temporary per-page harness —
// App() in app.jsx owns routing/tweaks for all 14 pages.
import ReactDOM from 'react-dom/client';
import './themes.css';
import { App } from './app.jsx';
import { Undercurrent } from './app/undercurrent.jsx';

// Render only after the key vault has decrypted into its in-memory cache —
// otherwise ProviderCard/Chat would see an empty vault on first paint.
window.YanaVault.ready.then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <>
      <Undercurrent />
      <App />
    </>
  );
});
