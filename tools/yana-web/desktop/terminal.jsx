// Yana AI — Terminal page
// Embedded `yana-rt chat`, running inside a real PTY (Rust `pty_bridge`
// binary, see Cargo.toml's `pty-bridge` feature) bridged over Electron
// IPC to an xterm.js view here. Desktop-app only — a plain browser tab
// has no `window.yana` (no Electron main process to talk to).
const { useEffect, useRef, useState } = React;

const IS_ELECTRON = typeof window.yana?.ptyStart === "function";

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

function TerminalPage() {
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
    const term = new window.Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      theme: xtermTheme(),
    });
    const fitAddon = new window.FitAddon.FitAddon();
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
  );
}

window.TerminalPage = TerminalPage;
