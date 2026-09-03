// Yana AI — Terminal page.
//
// Desktop Terminal vertical slice, Phase B: real PTY terminal (xterm.js +
// the existing Electron pty IPC — `window.yana.ptyStart/ptyWrite/ptyResize`,
// `main.js`), replacing the earlier code-server-only page as the primary
// surface. code-server (a real VS Code, coder/code-server, loopback-only
// at 127.0.0.1:8092) is kept available as a secondary "IDE" tab, per anh's
// explicit correction — it still provides real file-explorer/editor value,
// it just can no longer BE the terminal, because a shared terminal/model
// context (Phase C/D) requires a PTY Electron's own main process can see;
// code-server manages its own terminal sessions internally, invisible to
// this app.
//
// Rendered directly by app.jsx as an always-mounted sibling of the normal
// per-page router (toggled with CSS `display`, not a route match) — both
// sub-surfaces below need this: switching away and back must not kill the
// live shell session or reload the embedded IDE.
import React from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { L, PageHeader } from './components.jsx';
import * as terminalContext from './lib/terminal-context.mjs';
import { DEFAULT_TERMINAL_PREFERENCES } from './lib/terminal-preferences.mjs';

// xterm.js's `theme` option needs resolved color strings, not var(...)
// references (it paints to a canvas, outside the DOM cascade). Reads the
// live computed --bg-card/--ink from the document root so the embedded
// terminal matches whichever theme (light/dark, via prefers-color-scheme)
// is currently active — falls back to themes.css's own dark values if
// the properties aren't resolvable yet (e.g. stylesheet not loaded).
function readTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  const bg = style.getPropertyValue('--bg-card').trim() || '#11201e';
  const fg = style.getPropertyValue('--ink').trim() || '#e7f1ee';
  return { background: bg, foreground: fg };
}

// Real bugs found 2026-09-03, both a consequence of TerminalDock always
// keeping every tab's XTermPanel mounted (fixed earlier the same day so
// switching tabs never kills the live shell) combined with pre-existing
// per-tab logic that assumed only the visible tab's panel existed:
//
// Bug A — a tab that's inactive at mount (a restored background tab from
// a saved layout) has a display:none container, so FitAddon.fit() sees
// zero size and proposes cols:2/rows:1. security.js's normalizeDims
// below rejects that, ptyStart fails, and nothing ever retried — that
// tab showed the raw validation error forever, even after switching to
// it, because switching only flips CSS visibility, it never remounts.
// Fixed by deferring the actual PTY start until the tab is genuinely
// visible (see the second useEffect below), not at raw mount.
//
// Bug B — ordinary panel resizing (dragging the dock handle, a narrow
// window, a large terminal-font preference) can transiently propose
// dimensions outside the valid range too. The old code sent whatever
// FitAddon proposed straight to ptyResize with no validation; a
// rejected call was silently dropped, so the real PTY size drifted away
// from xterm's own visual size — wrapped/misaligned text, corrupted TUI
// apps (vim/htop). Fixed by clamping to the exact same range
// security.js's normalizeDims enforces, and forcing xterm's own buffer
// to that same clamped size with term.resize() so the visual terminal
// and the real PTY can never diverge.
const PTY_MIN_COLS = 20, PTY_MAX_COLS = 500, PTY_MIN_ROWS = 5, PTY_MAX_ROWS = 300;
function clampPtyDims(cols, rows) {
  return {
    cols: Math.max(PTY_MIN_COLS, Math.min(PTY_MAX_COLS, cols)),
    rows: Math.max(PTY_MIN_ROWS, Math.min(PTY_MAX_ROWS, rows)),
  };
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: "var(--r-lg)",
        border: active ? "1px solid var(--color-primary)" : "1px solid var(--border)",
        background: "var(--color-bg-subtle)",
        color: active ? "var(--ink)" : "var(--color-text-muted)",
        fontSize: "var(--font-size-sm)",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// Exported so the new app shell's terminal dock (desktop-src/new-app/
// terminal-dock.jsx) can reuse the exact same xterm.js + PTY IPC wiring
// instead of duplicating it — same component, different presentational
// wrapper (this file's own PageHeader-based full page vs. the new
// shell's compact tab bar).
export function XTermPanel({ active, onSessionStart, onSessionExit, preferences = DEFAULT_TERMINAL_PREFERENCES }) {
  const containerRef = React.useRef(null);
  const termRef = React.useRef(null);
  const fitRef = React.useRef(null);
  const startedRef = React.useRef(false);
  const sessionIdRef = React.useRef(null);
  const startRef = React.useRef(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      convertEol: true,
      fontFamily: "var(--font-mono)",
      fontSize: preferences.fontSize,
      lineHeight: preferences.lineHeight,
      cursorBlink: preferences.cursorBlink,
      // xterm.js's theme option takes resolved color strings, not CSS
      // var(...) references — it renders to a canvas, outside the DOM
      // cascade. Read the app's actual current --bg-card/--ink values so
      // the terminal matches the app shell instead of carrying its own
      // fixed dark navy regardless of theme (that was the pre-2026-09-03
      // behavior). Since the app now follows the OS light/dark setting
      // automatically (no manual toggle), re-read on every OS scheme
      // change too, not just once at mount.
      theme: readTerminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const schemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => { term.options.theme = readTerminalTheme(); };
    schemeQuery.addEventListener('change', applyTheme);

    let unsubData = () => {};
    let unsubExit = () => {};

    let disposed = false;

    async function start() {
      if (startedRef.current) return;
      // Fit right before starting, using the container's real current
      // size — deferred to here (not raw mount) so an inactive tab
      // (display:none, zero size) never computes the PTY size from a
      // bogus 2x1 proposal. See this file's readTerminalTheme() block
      // comment above for the full bug writeup.
      fit.fit();
      const dims = clampPtyDims(term.cols, term.rows);
      if (dims.cols !== term.cols || dims.rows !== term.rows) term.resize(dims.cols, dims.rows);
      startedRef.current = true;
      const result = await window.yana.ptyStart({
        sessionType: 'user-shell',
        cols: dims.cols,
        rows: dims.rows,
      });
      if (!result || !result.ok) {
        term.writeln(`\r\n[yana] failed to start terminal: ${result && result.error}\r\n`);
        startedRef.current = false;
        return;
      }
      if (disposed) {
        window.yana.ptyStop(result.sessionId);
        return;
      }
      const sessionId = result.sessionId;
      sessionIdRef.current = sessionId;
      terminalContext.recordStart(sessionId, result.initialCwd);
      onSessionStart?.(result);
      unsubData = window.yana.onPtyData((payload) => {
        if (payload?.sessionId !== sessionId || typeof payload.chunk !== 'string') return;
        term.write(payload.chunk);
        terminalContext.recordData(sessionId, payload.chunk);
      });
      unsubExit = window.yana.onPtyExit((payload) => {
        if (payload?.sessionId !== sessionId) return;
        term.writeln(`\r\n[process exited with code ${payload.code}]\r\n`);
        terminalContext.recordExit(sessionId, payload.code);
        onSessionExit?.(payload.code);
        startedRef.current = false;
      });
    }
    startRef.current = start;
    // Only start immediately if this tab is the one actually visible at
    // mount — an inactive tab's start is deferred to the useEffect below,
    // triggered once it actually becomes active.
    if (active) start();

    const dataDisposable = term.onData((data) => {
      if (sessionIdRef.current) window.yana.ptyWrite(sessionIdRef.current, data);
    });

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      const dims = clampPtyDims(term.cols, term.rows);
      if (dims.cols !== term.cols || dims.rows !== term.rows) term.resize(dims.cols, dims.rows);
      if (sessionIdRef.current) window.yana.ptyResize(sessionIdRef.current, dims);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      schemeQuery.removeEventListener('change', applyTheme);
      dataDisposable.dispose();
      unsubData();
      unsubExit();
      term.dispose();
      startedRef.current = false;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sessionId) {
        window.yana.ptyStop(sessionId);
        terminalContext.reset(sessionId);
      }
    };
    // Mount once for the lifetime of the Terminal tab — same
    // "don't tear down on navigation" contract terminal.jsx has always had
    // (see the header comment), now scoped to the xterm instance instead
    // of an iframe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deferred start for a tab that was inactive at mount (e.g. a restored
  // background terminal tab from a saved layout) — Bug A, see this
  // file's readTerminalTheme() block comment for the full writeup.
  // startRef.current is set once by the mount effect above; start()'s own
  // startedRef.current guard makes this a no-op for a tab that was
  // already started (either at mount, because it was active then, or by
  // an earlier activation).
  React.useEffect(() => {
    if (active) startRef.current?.();
  }, [active]);

  React.useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = preferences.fontSize;
    term.options.lineHeight = preferences.lineHeight;
    term.options.cursorBlink = preferences.cursorBlink;
    fitRef.current?.fit();
  }, [preferences.fontSize, preferences.lineHeight, preferences.cursorBlink]);

  return (
    <div
      ref={containerRef}
      style={{
        display: active ? "block" : "none",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 4,
      }}
    />
  );
}

// Exported alongside XTermPanel for the same reason — the new app shell's
// terminal dock keeps the Terminal/IDE tab affordance this file already
// established, without duplicating the iframe embed.
export function IdePanel({ active }) {
  const [state, setState] = React.useState({ status: 'idle', error: null });

  const openIde = React.useCallback(async () => {
    setState({ status: 'loading', error: null });
    const result = await window.yana?.ideOpen?.();
    if (result?.ok) setState({ status: 'opened', error: null });
    else setState({ status: 'error', error: result?.error || 'Desktop IDE bridge unavailable.' });
  }, []);

  React.useEffect(() => {
    if (active && state.status === 'idle') openIde();
  }, [active, openIde, state.status]);

  return (
    <div style={{ display: active ? 'flex' : 'none', flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
      {state.status === 'loading' && <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{L('Starting local IDE in your browser…', 'Đang mở IDE cục bộ trong trình duyệt…', '브라우저에서 로컬 IDE 시작 중…', '正在浏览器中启动本地 IDE…')}</span>}
      {state.status === 'opened' && (
        <div style={{ maxWidth: 460, padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{L('IDE opened in your default browser. It runs only after you request it.', 'IDE đã mở trong trình duyệt mặc định. Nó chỉ chạy khi anh chủ động yêu cầu.', 'IDE가 기본 브라우저에서 열렸습니다. 요청할 때만 실행됩니다.', 'IDE 已在默认浏览器中打开，仅在您主动请求后运行。')}</p>
          <button type="button" onClick={openIde} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--primary)', borderRadius: 'var(--r-sm)', padding: '6px 10px', cursor: 'pointer' }}>{L('Open again', 'Mở lại', '다시 열기', '再次打开')}</button>
        </div>
      )}
      {state.status === 'error' && (
        <div style={{ maxWidth: 460, padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--warn)', fontSize: 'var(--font-size-sm)', overflowWrap: 'anywhere' }}>{state.error}</p>
          <button type="button" onClick={openIde} style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--primary)', borderRadius: 'var(--r-sm)', padding: '6px 10px', cursor: 'pointer' }}>{L('Retry', 'Thử lại', '다시 시도', '重试')}</button>
        </div>
      )}
    </div>
  );
}

export function TerminalPanel({ active }) {
  const [tab, setTab] = React.useState(() => localStorage.getItem("yana.terminal.tab") || "shell");
  React.useEffect(() => { localStorage.setItem("yana.terminal.tab", tab); }, [tab]);

  return (
    <div style={{ display: active ? "flex" : "none", flexDirection: "column", height: "100%", gap: "var(--gap)" }}>
      <PageHeader
        title={L("Terminal", "Dòng lệnh", "터미널", "终端")}
        sub={L(
          "Your real shell, in your project's directory.",
          "Shell thật của bạn, ngay trong thư mục dự án.",
          "프로젝트 디렉터리에서 실행되는 실제 셸입니다.",
          "在项目目录中运行的真实 shell。",
        )}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <TabButton active={tab === "shell"} onClick={() => setTab("shell")}>
            {L("Terminal", "Dòng lệnh", "터미널", "终端")}
          </TabButton>
          <TabButton active={tab === "ide"} onClick={() => setTab("ide")}>
            {L("IDE", "IDE", "IDE", "IDE")}
          </TabButton>
        </div>
      </PageHeader>
      <XTermPanel active={tab === "shell"} />
      <IdePanel active={tab === "ide"} />
    </div>
  );
}
