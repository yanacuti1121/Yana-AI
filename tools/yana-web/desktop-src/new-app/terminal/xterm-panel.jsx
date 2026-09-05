// Yana Desktop — the real PTY terminal panel (xterm.js + Electron PTY IPC).
//
// 2026-09-05 rewrite: same window.yana.ptyStart/ptyWrite/ptyResize/ptyStop
// IPC contract as the component this replaces (desktop-src/terminal.jsx's
// XTermPanel) — the Electron main-process side (main.js, security.js,
// src/bin/pty_bridge.rs) is untouched. What changed is the renderer:
// the old panel ran xterm.js's default DOM/canvas renderer with only
// FitAddon, which is the well-documented source of redraw/garbling under
// heavy TUI output (vim, htop, long build logs). This version adds:
//   - WebglAddon as the primary renderer, with a fallback to the default
//     renderer if WebGL context creation fails (sandboxed/software-render
//     environments) — the pattern xterm.js's own docs recommend.
//   - Unicode11Addon, so wide-character/emoji columns measure correctly
//     (Vietnamese diacritics, emoji) instead of drifting the cursor.
//   - WebLinksAddon, so URLs in terminal output are clickable.
//   - SearchAddon, exposed via a minimal Cmd/Ctrl+F find bar.
import React from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { L } from '../../components.jsx';
import * as terminalContext from '../../lib/terminal-context.mjs';
import { DEFAULT_TERMINAL_PREFERENCES } from '../../lib/terminal-preferences.mjs';

// xterm.js's `theme` option needs resolved color strings, not var(...)
// references — it paints to a canvas/WebGL surface, outside the DOM
// cascade. Reads the live computed --bg-card/--ink from the document
// root so the embedded terminal matches whichever theme (light/dark, via
// prefers-color-scheme) is currently active — falls back to themes.css's
// own dark values if the properties aren't resolvable yet.
function readTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  const bg = style.getPropertyValue('--bg-card').trim() || '#11201e';
  const fg = style.getPropertyValue('--ink').trim() || '#e7f1ee';
  return { background: bg, foreground: fg };
}

// Carried over verbatim from the 2026-09-03 bug fixes in the component
// this replaces: an inactive tab at mount has a display:none container,
// so FitAddon.fit() sees zero size and proposes cols:2/rows:1 — clamping
// (and deferring start until the tab is genuinely visible, below) is what
// keeps a PTY request from ever going out with a bogus size, and keeps
// xterm's own buffer from drifting away from the real PTY's dimensions
// on drag-resize.
const PTY_MIN_COLS = 20, PTY_MAX_COLS = 500, PTY_MIN_ROWS = 5, PTY_MAX_ROWS = 300;
function clampPtyDims(cols, rows) {
  return {
    cols: Math.max(PTY_MIN_COLS, Math.min(PTY_MAX_COLS, cols)),
    rows: Math.max(PTY_MIN_ROWS, Math.min(PTY_MAX_ROWS, rows)),
  };
}

function FindBar({ searchAddon, onClose }) {
  const inputRef = React.useRef(null);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  function findNext() { if (query) searchAddon.findNext(query, { incremental: false }); }
  function findPrevious() { if (query) searchAddon.findPrevious(query, { incremental: false }); }

  return (
    <div
      style={{
        position: 'absolute', top: 8, right: 8, zIndex: 5, display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
        background: 'var(--color-bg)', boxShadow: '0 10px 28px rgba(0,0,0,.35)',
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={L('Find in terminal…', 'Tìm trong terminal…', '터미널에서 찾기…', '在终端中查找…')}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (value) searchAddon.findNext(value, { incremental: true });
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); event.shiftKey ? findPrevious() : findNext(); }
          else if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        }}
        style={{
          border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--color-bg-subtle)',
          color: 'var(--ink)', fontSize: 'var(--font-size-sm)', padding: '4px 8px', width: 200,
        }}
      />
      <button type="button" onClick={findPrevious} aria-label={L('Previous match', 'Kết quả trước', '이전 항목', '上一个')} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>↑</button>
      <button type="button" onClick={findNext} aria-label={L('Next match', 'Kết quả tiếp', '다음 항목', '下一个')} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>↓</button>
      <button type="button" onClick={onClose} aria-label={L('Close find bar', 'Đóng thanh tìm kiếm', '찾기 닫기', '关闭查找')} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>×</button>
    </div>
  );
}

export function XTermPanel({ active, onSessionStart, onSessionExit, preferences = DEFAULT_TERMINAL_PREFERENCES }) {
  const containerRef = React.useRef(null);
  const termRef = React.useRef(null);
  const fitRef = React.useRef(null);
  const searchAddonRef = React.useRef(null);
  const startedRef = React.useRef(false);
  const sessionIdRef = React.useRef(null);
  const startRef = React.useRef(null);
  const [findOpen, setFindOpen] = React.useState(false);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      convertEol: true,
      fontFamily: "var(--font-mono)",
      fontSize: preferences.fontSize,
      lineHeight: preferences.lineHeight,
      cursorBlink: preferences.cursorBlink,
      theme: readTerminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    // Unicode11 must be loaded and activated before the first real output
    // arrives — wide-character (CJK, emoji) column width is measured at
    // write time, and switching the active version later would leave
    // already-written rows mismeasured.
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';

    term.loadAddon(new WebLinksAddon());

    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    term.open(container);

    // WebGL renderer: real GPU compositing instead of xterm.js's default
    // DOM/canvas renderer, which is the documented source of redraw
    // glitches and misaligned text under heavy TUI output. Falls back to
    // the default renderer (dispose the addon, do nothing else) if WebGL
    // context creation fails or is later lost — a sandboxed or
    // software-rendering environment degrades instead of breaking the
    // terminal outright.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => { webgl.dispose(); });
      term.loadAddon(webgl);
    } catch (error) {
      console.warn('[terminal] WebGL renderer unavailable, using default renderer:', error?.message || error);
    }

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
      // bogus 2x1 proposal.
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

    // Only handles opening the find bar — once open, focus moves to its
    // own input (see FindBar's mount effect), so that element's own
    // onKeyDown handles Escape/Enter from then on. Setting up this
    // handler once at mount (not re-attaching per render) is why it must
    // not read `findOpen` from closure — setFindOpen itself is stable
    // across renders, so only the setter is used here, never the value.
    // attachCustomKeyEventHandler just stores a single handler reference
    // (not a disposable subscription); term.dispose() below clears it.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      const isFindShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f';
      if (isFindShortcut) { setFindOpen(true); return false; }
      return true;
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
    // Mount once for the lifetime of the Terminal tab — the dock keeps
    // every tab's XTermPanel mounted so switching tabs never kills the
    // live shell (see terminal-dock.jsx).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deferred start for a tab that was inactive at mount (e.g. a restored
  // background terminal tab from a saved layout). startRef.current is set
  // once by the mount effect above; start()'s own startedRef.current
  // guard makes this a no-op for a tab that was already started.
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
        position: 'relative',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 4,
      }}
    >
      {findOpen && searchAddonRef.current && (
        <FindBar searchAddon={searchAddonRef.current} onClose={() => setFindOpen(false)} />
      )}
    </div>
  );
}
