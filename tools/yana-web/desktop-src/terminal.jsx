// Yana AI — Terminal page
// Embedded `yana-rt chat`, running inside a real PTY (Rust `pty_bridge`
// binary, see Cargo.toml's `pty-bridge` feature) bridged over Electron
// IPC to an xterm.js view here. Desktop-app only — a plain browser tab
// has no `window.yana` (no Electron main process to talk to).
import React from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { L, PageHeader } from './components.jsx';
import { IS_ELECTRON } from './lib/is-electron.js';

const { useEffect, useRef, useState } = React;

// Pulls the app's live CSS custom properties into real color values —
// xterm.js's Terminal constructor needs actual colors, not CSS var
// references, and this app ships several selectable palettes (not just
// light/dark), so reading them at mount time (rather than hardcoding one
// palette's hex values) keeps the terminal in sync with whatever theme
// is active.
function xtermTheme() {
  const style = getComputedStyle(document.documentElement);
  const v = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--bg-base", "#1a1a1a"),
    foreground: v("--ink", "#e6e6e6"),
    cursor:     v("--primary", "#2f7e6e"),
    selectionBackground: v("--primary-soft", "rgba(47,126,110,.25)"),
  };
}

// Single-quote-wraps a path for safe use inside a shell command string
// typed into the terminal (`cat <path>`) — protects spaces/special
// characters. This is the one place in the terminal feature that builds
// a shell string rather than passing argv directly (unlike `run_command`'s
// Rust side), since it's typed into an already-interactive shell the same
// way a human would type it.
function shellQuote(p) {
  return "'" + p.replace(/'/g, `'\\''`) + "'";
}

// Left-side repo browser for the Terminal page (VS Code/Antigravity-style).
// Lazily fetches one directory's contents at a time via `window.yana.listDir`
// — clicking a folder expands/collapses it, clicking a file sends `cat
// <path>` into the running terminal (anh's explicit choice — see the plan;
// no separate file-viewer panel).
function FileTree({ onOpenFile }) {
  const [root, setRoot] = useState(null); // entries at "" once loaded
  const [expanded, setExpanded] = useState(() => new Set());
  const cacheRef = useRef(new Map()); // relPath -> entries

  useEffect(() => {
    window.yana.listDir("").then((res) => {
      if (res.ok) {
        cacheRef.current.set("", res.entries);
        setRoot(res.entries);
      }
    });
  }, []);

  function toggle(entry) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entry.relPath)) {
        next.delete(entry.relPath);
      } else {
        next.add(entry.relPath);
        if (!cacheRef.current.has(entry.relPath)) {
          window.yana.listDir(entry.relPath).then((res) => {
            if (res.ok) {
              cacheRef.current.set(entry.relPath, res.entries);
              // Force a re-render now that the cache has this entry's
              // children — cheapest way without a second piece of state.
              setExpanded((s) => new Set(s));
            }
          });
        }
      }
      return next;
    });
  }

  function renderEntries(entries, depth) {
    return entries.map((entry) => (
      <div key={entry.relPath}>
        <div
          onClick={() => (entry.isDir ? toggle(entry) : onOpenFile(entry))}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            paddingLeft: 8 + depth * 14, paddingRight: 8,
            height: 24, cursor: "pointer", borderRadius: 5,
            fontSize: 12.5, color: "var(--ink-2)", userSelect: "none",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(var(--shadow-rgb), .06)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
        >
          <span style={{ width: 10, flex: "none", opacity: entry.isDir ? 1 : 0 }}>
            {entry.isDir ? (expanded.has(entry.relPath) ? "▾" : "▸") : ""}
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</span>
        </div>
        {entry.isDir && expanded.has(entry.relPath) && cacheRef.current.has(entry.relPath) &&
          renderEntries(cacheRef.current.get(entry.relPath), depth + 1)}
      </div>
    ));
  }

  return (
    <div
      className="glass"
      style={{
        width: 220, flex: "none", minHeight: 0, borderRadius: "var(--r-lg)",
        padding: "8px 4px", overflowY: "auto",
      }}
    >
      {root === null ? (
        <div style={{ padding: "8px 12px", fontSize: 12.5, color: "var(--ink-2)" }}>
          {L("Loading…", "Đang tải…", "로딩 중…", "加载中…")}
        </div>
      ) : (
        renderEntries(root, 0)
      )}
    </div>
  );
}

export function TerminalPage() {
  if (!IS_ELECTRON) {
    return (
      <div data-screen-label="Terminal" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
        <PageHeader title={L("Terminal", "Dòng lệnh", "터미널", "终端")} />
        <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", maxWidth: 560 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)" }}>
            {L(
              "The terminal is only available in the Yana AI desktop app — it runs a real local process, which a browser tab can't do.",
              "Dòng lệnh chỉ hoạt động trong app Yana AI trên máy — nó chạy 1 process cục bộ thật, tab trình duyệt không làm được việc này.",
              "터미널은 Yana AI 데스크톱 앱에서만 사용할 수 있습니다 — 실제 로컬 프로세스를 실행하며, 브라우저 탭에서는 불가능합니다.",
              "终端仅在 Yana AI 桌面应用中可用 — 它运行一个真实的本地进程，浏览器标签页无法做到这一点。",
            )}
          </p>
        </div>
      </div>
    );
  }
  return <TerminalPane />;
}

function TerminalPane() {
  const containerRef = useRef(null);
  const [status, setStatus] = useState("starting"); // starting | running | exited

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      theme: xtermTheme(),
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    // One-time sizing at mount — live resize propagation to the running
    // PTY is out of scope for this pass (see the plan).
    fitAddon.fit();

    const unsubData = window.yana.onPtyData((chunk) => term.write(chunk));
    const unsubExit = window.yana.onPtyExit((code) => {
      setStatus("exited");
      term.write(`\r\n\x1b[2m[process exited: ${code}]\x1b[0m\r\n`);
    });
    const onDataDisposable = term.onData((data) => window.yana.ptyWrite(data));

    window.yana.ptyStart({ cols: term.cols, rows: term.rows, args: [] }).then((result) => {
      if (result && result.ok === false) {
        setStatus("exited");
        term.write(`\x1b[31m${result.error}\x1b[0m\r\n`);
      } else {
        setStatus("running");
      }
    });

    return () => {
      unsubData();
      unsubExit();
      onDataDisposable.dispose();
      window.yana.ptyStop();
      term.dispose();
    };
  }, []);

  return (
    <div data-screen-label="Terminal" style={{ display: "flex", flexDirection: "column", height: "100%", gap: "var(--gap)" }}>
      <PageHeader
        title={L("Terminal", "Dòng lệnh", "터미널", "终端")}
        sub={L(
          "yana-rt chat, running in a real terminal.",
          "yana-rt chat, chạy trong terminal thật.",
          "yana-rt chat, 실제 터미널에서 실행 중입니다.",
          "yana-rt chat，运行在真实终端中。",
        )}
      />
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: "var(--gap)" }}>
        <FileTree
          onOpenFile={(entry) => window.yana.ptyWrite("cat " + shellQuote(entry.relPath) + "\n")}
        />
        <div
          className="glass"
          style={{
            flex: 1, minHeight: 0, borderRadius: "var(--r-lg)",
            padding: "10px 12px", display: "flex", flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flex: "none" }}>
            <span className={"dot " + (status === "running" ? "on" : "off")} />
            <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
              {status === "starting"
                ? L("Starting…", "Đang khởi động…", "시작 중…", "启动中…")
                : status === "running"
                  ? L("Running", "Đang chạy", "실행 중", "运行中")
                  : L("Exited", "Đã thoát", "종료됨", "已退出")}
            </span>
          </div>
          <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
        </div>
      </div>
    </div>
  );
}
