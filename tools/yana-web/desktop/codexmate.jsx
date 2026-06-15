// Yana AI — Codexmate integration: embed Codexmate web UI inside Yana
const { useState, useEffect, useRef } = React;

function CodemateTool() {
  const [port, setPort]     = useState(() => localStorage.getItem("yana.codexmate.port") || "8080");
  const [status, setStatus] = useState(null); // null | "checking" | "up" | "down"
  const inputRef = useRef(null);

  function check(p) {
    setStatus("checking");
    fetch("/api/codexmate/status?port=" + encodeURIComponent(p || port))
      .then(r => r.ok ? r.json() : null)
      .then(d => setStatus(d && d.up ? "up" : "down"))
      .catch(() => setStatus("down"));
  }

  useEffect(() => { check(port); }, []);

  function savePort(v) {
    const safe = v.trim();
    if (!safe) return;
    localStorage.setItem("yana.codexmate.port", safe);
    setPort(safe);
    check(safe);
  }

  return (
    <div data-screen-label="Codexmate" style={{
      display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: "var(--gap)",
    }}>
      <PageHeader
        title="Codexmate"
        sub={L(
          "Claude Code session manager · agent tasks · config health",
          "Quản lý phiên Claude Code · nhiệm vụ agent · kiểm tra cấu hình",
        )}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={"dot " + (status === "up" ? "on" : "off")} />
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {status === "checking"
              ? L("Checking…", "Đang kiểm tra…")
              : status === "up"
                ? L("Running", "Đang chạy")
                : L("Not running", "Chưa chạy")}
          </span>
          <input
            ref={inputRef}
            defaultValue={port}
            onBlur={e => savePort(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") savePort(e.target.value); }}
            placeholder="8080"
            style={{
              width: 58, padding: "4px 8px", borderRadius: 8,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--ink)", fontSize: 12, fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => check(inputRef.current ? inputRef.current.value : port)}
            style={{
              padding: "5px 12px", borderRadius: 8,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--ink-2)", cursor: "pointer",
              fontSize: 12, fontFamily: "inherit",
            }}>
            {L("Refresh", "Làm mới")}
          </button>
          <a
            href={"http://127.0.0.1:" + port}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "5px 12px", borderRadius: 8,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--ink-2)", cursor: "pointer",
              fontSize: 12, fontFamily: "inherit",
              textDecoration: "none", display: "inline-block",
            }}>
            {L("Open in tab ↗", "Mở tab mới ↗")}
          </a>
        </div>
      </PageHeader>

      {status === "up" ? (
        <iframe
          src={"http://127.0.0.1:" + port}
          style={{
            flex: 1, border: "none", borderRadius: "var(--r-lg)",
            display: "block", minHeight: 0,
          }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          title="Codexmate"
        />
      ) : (
        <div className="glass" style={{
          borderRadius: "var(--r-lg)", padding: "var(--pad-card)",
          display: "flex", flexDirection: "column", gap: 14, maxWidth: 520,
        }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>
            {L("Codexmate is not running", "Codexmate chưa chạy")}
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
            {L(
              "Start Codexmate on the port configured above, then click Refresh.",
              "Khởi động Codexmate trên cổng đã cài ở trên rồi bấm Làm mới.",
            )}
          </div>
          <pre style={{
            margin: 0, padding: "12px 14px",
            borderRadius: "var(--r-sm)",
            background: "rgba(var(--shadow-rgb), .08)",
            fontSize: 12.5,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            color: "var(--ink-2)",
          }}>{"CODEXMATE_PORT=" + port + " codexmate run"}</pre>
        </div>
      )}
    </div>
  );
}

window.CodemateTool = CodemateTool;
