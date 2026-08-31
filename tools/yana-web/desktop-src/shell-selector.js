// Entrypoint-only decision: which top-level shell renders — the NEW app
// (desktop-src/new-app/) or the legacy page-router (app.jsx). Deliberately
// isolated in its own module, not inlined in main.jsx and not read by
// anything inside new-app/ itself: new-app/index.jsx takes an
// `onSwitchToLegacy` callback and has zero knowledge of how this decision
// is made or stored.
//
// TEMPORARY for Phase 1: a localStorage flag. When this needs to become a
// real route or a build/runtime config flag, only this file and its two
// call sites in main.jsx change — nothing inside new-app/ or app.jsx does.
const STORAGE_KEY = 'yana.shell';
const NEW_WORKSPACE_MIGRATION_KEY = 'yana.new-workspace.migrated.v1';

export function shouldUseLegacyShell() {
  // `yana.shell=legacy` was written while the new workspace was still an
  // incomplete Phase-1 preview. It is a stale default for existing desktop
  // profiles, not an explicit choice made after the workspace became the
  // supported shell. Migrate it once, then continue honoring a later,
  // deliberate "Legacy UI" choice without surprising the user again.
  if (localStorage.getItem(NEW_WORKSPACE_MIGRATION_KEY) !== 'true') {
    localStorage.setItem(NEW_WORKSPACE_MIGRATION_KEY, 'true');
    if (localStorage.getItem(STORAGE_KEY) === 'legacy') {
      localStorage.setItem(STORAGE_KEY, 'new');
    }
    return false;
  }
  return localStorage.getItem(STORAGE_KEY) === 'legacy';
}

export function switchToLegacyShell() {
  localStorage.setItem(STORAGE_KEY, 'legacy');
  window.location.reload();
}

// Reciprocal of switchToLegacyShell(). Needed because the flag persists
// in the Electron profile's localStorage across every relaunch (it is
// not a one-session toggle) — once switched to legacy, the ONLY shell
// that could switch back was new-app's own Header menu, which is no
// longer rendered. Wired into the legacy Settings page's own "Interface"
// card so switching back never requires DevTools.
export function switchToNewShell() {
  localStorage.setItem(STORAGE_KEY, 'new');
  window.location.reload();
}
