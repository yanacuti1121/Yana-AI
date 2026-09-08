// Yana AI desktop — entry module.
//
// Renders the app shell (desktop-src/new-app/). The legacy page-router
// (app.jsx) and its shell-selector toggle were removed once new-app
// reached parity — anh's explicit call (2026-09-02), not an automatic
// migration: see git history for what app.jsx/shell-selector.js used to
// contain if it's ever needed for reference.
import ReactDOM from 'react-dom/client';
import './themes.css';

// auth.js provisions a fresh single-slot account on first-ever Google
// sign-in and redirects here with ?google=first-run (see its own comment
// on that redirect). The password-setup path handles the equivalent case
// in login.html's clearPreviousOwnerData() — this is the Google-OAuth
// counterpart for the one path that redirects straight into the app
// instead of back through login.html. Keep both key lists in sync.
(function clearPreviousOwnerDataOnFirstRunGoogleSignIn() {
  if (new URLSearchParams(location.search).get('google') !== 'first-run') return;
  [
    'yana.chat', 'yana.new-app.conversation-tabs.v1',
    'yana.about.who', 'yana.about.strengths', 'yana.about.weaknesses', 'yana.about.style',
    'yana.profile.role', 'yana.profile.instructions',
    'yana.avatar-url', 'yana.member-since', 'yana.onboarded',
  ].forEach((k) => { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } });
  history.replaceState(null, '', location.pathname);
})();

// Render only after the key vault has decrypted into its in-memory cache —
// otherwise ProviderCard/Chat would see an empty vault on first paint.
window.YanaVault.ready.then(async () => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  const { NewAppShell } = await import('./new-app/index.jsx');
  root.render(<NewAppShell />);
});
