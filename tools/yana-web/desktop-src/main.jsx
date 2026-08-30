// Yana AI desktop — entry module.
//
// Renders one of two top-level shells, decided ONLY here (see
// shell-selector.js's own doc comment for why that decision lives in its
// own module rather than inline): the NEW app shell (desktop-src/new-app/,
// the product target going forward) or the legacy page-router (app.jsx,
// kept — not deleted — while the new shell's Phase 2/3 catch up to it).
import ReactDOM from 'react-dom/client';
import './themes.css';
import { App } from './app.jsx';
import { Undercurrent } from './app/undercurrent.jsx';
import { NewAppShell } from './new-app/index.jsx';
import { shouldUseLegacyShell, switchToLegacyShell } from './shell-selector.js';

// Render only after the key vault has decrypted into its in-memory cache —
// otherwise ProviderCard/Chat would see an empty vault on first paint.
window.YanaVault.ready.then(() => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  if (shouldUseLegacyShell()) {
    root.render(
      <>
        <Undercurrent />
        <App />
      </>
    );
  } else {
    root.render(<NewAppShell onSwitchToLegacy={switchToLegacyShell} />);
  }
});
