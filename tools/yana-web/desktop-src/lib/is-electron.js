// Unified Electron-detection helper. Previously terminal.jsx and
// codexmate.jsx each rolled their own: terminal.jsx duck-typed against the
// real preload bridge (window.yana?.ptyStart), codexmate.jsx UA-sniffed
// (/Electron/i.test(navigator.userAgent)). Duck-typing is strictly more
// reliable — a spoofed or unusual UA string can't false-negative it — so
// both now import this single helper instead.
export const IS_ELECTRON = typeof window.yana?.ptyStart === "function";
