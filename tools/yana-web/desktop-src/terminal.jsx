// Yana AI — Terminal page: code-server (a real VS Code, coder/code-server)
// embedded directly, loopback-only (127.0.0.1:8092). Replaces the earlier
// hand-built xterm.js + PTY terminal and CodeMirror-based file editor —
// anh's explicit call after testing both: code-server's real file
// explorer/editor/terminal beats maintaining a custom equivalent, and its
// own built-in terminal already covers `yana-rt chat` (anyone can just
// type that command there — no functionality actually lost).
//
// Rendered directly by app.jsx as an always-mounted sibling of the normal
// per-page router (not through the `Page` map, toggled with CSS `display`
// via the `active` prop) — anh's other explicit requirement: switching
// away and back must not reload the embedded VS Code (open file, terminal
// session, etc. all stay put). A component that only mounts while its page
// is selected would tear the iframe down on every navigation.
import React from 'react';
import { L, PageHeader } from './components.jsx';

export function TerminalPanel({ active }) {
  return (
    <div style={{ display: active ? "flex" : "none", flexDirection: "column", height: "100%", gap: "var(--gap)" }}>
      <PageHeader
        title={L("Terminal", "Dòng lệnh", "터미널", "终端")}
        sub={L(
          "code-server (a real VS Code), embedded — loopback-only.",
          "code-server (VS Code thật), nhúng sẵn — chỉ chạy trên máy.",
          "code-server(진짜 VS Code)가 내장되어 있습니다 — 루프백 전용.",
          "code-server（真正的 VS Code），已内嵌 — 仅限本机。",
        )}
      />
      <iframe
        src="http://127.0.0.1:8092"
        title="VS Code (code-server)"
        style={{ flex: 1, minHeight: 0, border: "1px solid var(--border)", borderRadius: "var(--r-lg)" }}
      />
    </div>
  );
}
