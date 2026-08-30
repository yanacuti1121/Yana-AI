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
export function XTermPanel({ active, onSessionStart, onSessionExit }) {
  const containerRef = React.useRef(null);
  const termRef = React.useRef(null);
  const fitRef = React.useRef(null);
  const startedRef = React.useRef(false);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      // Dark navy, not pure black — sits on the app's own dark surface
      // instead of reading as an unrelated terminal window dropped into
      // the workspace. ANSI colors (theme.red/green/... left unset) keep
      // xterm's own defaults, so readability/contrast is unaffected.
      theme: { background: "#0a0e18", foreground: "#d8dee9" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    let unsubData = () => {};
    let unsubExit = () => {};

    async function start() {
      if (startedRef.current) return;
      startedRef.current = true;
      const result = await window.yana.ptyStart({
        sessionType: 'user-shell',
        cols: term.cols,
        rows: term.rows,
      });
      if (!result || !result.ok) {
        term.writeln(`\r\n[yana] failed to start terminal: ${result && result.error}\r\n`);
        return;
      }
      terminalContext.recordStart(result.initialCwd);
      onSessionStart?.();
      unsubData = window.yana.onPtyData((chunk) => {
        term.write(chunk);
        terminalContext.recordData(chunk);
      });
      unsubExit = window.yana.onPtyExit((code) => {
        term.writeln(`\r\n[process exited with code ${code}]\r\n`);
        terminalContext.recordExit(code);
        onSessionExit?.(code);
        startedRef.current = false;
      });
    }
    start();

    const dataDisposable = term.onData((data) => {
      window.yana.ptyWrite(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      window.yana.ptyResize({ cols: term.cols, rows: term.rows });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      unsubData();
      unsubExit();
      term.dispose();
      startedRef.current = false;
      window.yana.ptyStop();
      terminalContext.reset();
    };
    // Mount once for the lifetime of the Terminal tab — same
    // "don't tear down on navigation" contract terminal.jsx has always had
    // (see the header comment), now scoped to the xterm instance instead
    // of an iframe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  return (
    <iframe
      src="http://127.0.0.1:8092"
      title="VS Code (code-server)"
      style={{ display: active ? "block" : "none", flex: 1, minHeight: 0, border: "1px solid var(--border)", borderRadius: "var(--r-lg)" }}
    />
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
