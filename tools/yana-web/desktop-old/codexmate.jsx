// Yana AI — Codexmate page
// Web: launcher panel (X-Frame-Options blocks iframe)
// Desktop (Electron): full iframe — main.js strips X-Frame-Options from localhost
const { useState, useEffect, useRef } = React;

const IS_ELECTRON = /Electron/i.test(navigator.userAgent);

function CodemateTool() {
  const [port, setPort]        = useState(() => localStorage.getItem("yana.codexmate.port") || "8080");
  const [status, setStatus]    = useState(null); // null | "checking" | "up" | "down"
  const [copiedIdx, setCopied] = useState(null);
  const inputRef = useRef(null);

  function copyCmd(text, idx) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(idx);
    setTimeout(() => setCopied(null), 1500);
  }

  function check(p) {
    const target = p || port;
    setStatus("checking");
    fetch("http://127.0.0.1:" + target + "/", { mode: "no-cors", signal: AbortSignal.timeout(2000) })
      .then(() => setStatus("up"))
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

  const url = "http://127.0.0.1:" + port;

  /* ── Desktop: full iframe ──────────────────────────────────── */
  if (IS_ELECTRON) {
    return (
      <div data-screen-label="Codexmate" style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
        {/* Slim toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 16px", borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <span className={"dot " + (status === "up" ? "on" : "off")} style={{ flex: "none" }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)", flex: 1 }}>
            {status === "checking"
              ? L("Checking…", "Đang kiểm tra…", "확인 중…", "检查中…")
              : status === "up"
                ? "Codexmate · " + url
                : L("Codexmate is not running", "Codexmate chưa chạy", "Codexmate가 실행 중이 아닙니다", "Codexmate 未运行")}
          </span>
          <input
            ref={inputRef}
            defaultValue={port}
            onBlur={e => savePort(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") savePort(e.target.value); }}
            placeholder="8080"
            style={{
              width: 60, padding: "3px 8px", borderRadius: 6,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--ink)", fontSize: 12, fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => check(inputRef.current ? inputRef.current.value : port)}
            style={{
              padding: "3px 10px", borderRadius: 6,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--ink-2)", cursor: "pointer", fontSize: 12, fontFamily: "inherit",
            }}>
            {L("Check", "Kiểm tra", "확인", "检查")}
          </button>
        </div>

        {/* Iframe or offline guide */}
        {status === "up" ? (
          <iframe
            src={url}
            style={{ flex: 1, border: "none", width: "100%", display: "block" }}
            title="Codexmate"
          />
        ) : (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
              {[
                {
                  label: L("Start Codexmate", "Khởi động Codexmate", "Codexmate 시작", "启动 Codexmate"),
                  cmd: port === "8080" ? "codexmate run" : "CODEXMATE_PORT=" + port + " codexmate run",
                  idx: 0,
                },
                {
                  label: L("Install first (if not installed)", "Cài đặt trước (nếu chưa có)", "먼저 설치 (설치되지 않은 경우)", "先安装（如尚未安装）"),
                  cmd: "npm install -g codexmate",
                  idx: 1,
                },
              ].map(({ label, cmd, idx }) => (
                <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{
                    fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)",
                    textTransform: "uppercase", letterSpacing: ".06em",
                  }}>{label}</span>
                  <div style={{ position: "relative" }}>
                    <pre style={{
                      margin: 0, padding: "11px 48px 11px 14px",
                      borderRadius: "var(--r-sm)",
                      background: "rgba(var(--shadow-rgb), .08)",
                      fontSize: 12.5,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                      color: "var(--ink-2)", whiteSpace: "pre-wrap", wordBreak: "break-all",
                    }}>{cmd}</pre>
                    <button
                      onClick={() => copyCmd(cmd, idx)}
                      title="Copy"
                      style={{
                        position: "absolute", top: 6, right: 8,
                        padding: "3px 8px", borderRadius: 6,
                        border: "1px solid var(--border)", background: "transparent",
                        cursor: "pointer", fontSize: 11, color: "var(--ink-2)",
                        fontFamily: "inherit", transition: "color .15s",
                      }}>
                      {copiedIdx === idx ? "✓" : "Copy"}
                    </button>
                  </div>
                </div>
              ))}
              <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                {L("Then click Check above ↑", "Xong rồi bấm Kiểm tra ở trên ↑", "완료 후 위의 확인을 클릭하세요 ↑", "然后点击上方的检查 ↑")}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Web: launcher panel ───────────────────────────────────── */
  return (
    <div data-screen-label="Codexmate" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <PageHeader
        title="Codexmate"
        sub={L(
          "Claude Code session manager · agent tasks · config health",
          "Quản lý phiên Claude Code · nhiệm vụ agent · kiểm tra cấu hình",
          "Claude Code 세션 관리 · 에이전트 작업 · 설정 상태",
          "Claude Code 会话管理 · 智能体任务 · 配置健康检查",
        )} />

      <div className="glass" style={{
        borderRadius: "var(--r-lg)", padding: "var(--pad-card)",
        display: "flex", flexDirection: "column", gap: 20, maxWidth: 560,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={"dot " + (status === "up" ? "on" : "off")} style={{ flex: "none" }} />
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            {status === "checking"
              ? L("Checking…", "Đang kiểm tra…", "확인 중…", "检查中…")
              : status === "up"
                ? L("Codexmate is running", "Codexmate đang chạy", "Codexmate가 실행 중입니다", "Codexmate 正在运行")
                : L("Codexmate is not running", "Codexmate chưa chạy", "Codexmate가 실행 중이 아닙니다", "Codexmate 未运行")}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{L("Port", "Cổng", "포트", "端口")}</span>
          <input
            ref={inputRef}
            defaultValue={port}
            onBlur={e => savePort(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") savePort(e.target.value); }}
            placeholder="8080"
            style={{
              width: 72, padding: "5px 10px", borderRadius: 8,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--ink)", fontSize: 13, fontFamily: "inherit",
            }}
          />
          <button
            onClick={() => check(inputRef.current ? inputRef.current.value : port)}
            style={{
              padding: "5px 13px", borderRadius: 8,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--ink-2)", cursor: "pointer",
              fontSize: 13, fontFamily: "inherit",
            }}>
            {L("Check", "Kiểm tra", "확인", "检查")}
          </button>
        </div>

        {status === "up" ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
              padding: "10px 22px", borderRadius: "var(--r-sm)",
              background: "var(--primary)", color: "white",
              fontSize: 14, fontWeight: 500, textDecoration: "none",
              transition: "opacity .15s",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = ".85"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
            {Icons.code(15)}
            {L("Open Codexmate ↗", "Mở Codexmate ↗", "Codexmate 열기 ↗", "打开 Codexmate ↗")}
          </a>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              {
                label: L("Start Codexmate", "Khởi động Codexmate", "Codexmate 시작", "启动 Codexmate"),
                cmd: port === "8080" ? "codexmate run" : "CODEXMATE_PORT=" + port + " codexmate run",
                idx: 0,
              },
              {
                label: L("Install first (if not installed)", "Cài đặt trước (nếu chưa có)", "먼저 설치 (설치되지 않은 경우)", "先安装（如尚未安装）"),
                cmd: "npm install -g codexmate",
                idx: 1,
              },
            ].map(({ label, cmd, idx }) => (
              <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{
                  fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)",
                  textTransform: "uppercase", letterSpacing: ".06em",
                }}>{label}</span>
                <div style={{ position: "relative" }}>
                  <pre style={{
                    margin: 0, padding: "11px 48px 11px 14px",
                    borderRadius: "var(--r-sm)",
                    background: "rgba(var(--shadow-rgb), .08)",
                    fontSize: 12.5,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    color: "var(--ink-2)", whiteSpace: "pre-wrap", wordBreak: "break-all",
                  }}>{cmd}</pre>
                  <button
                    onClick={() => copyCmd(cmd, idx)}
                    title="Copy"
                    style={{
                      position: "absolute", top: 6, right: 8,
                      padding: "3px 8px", borderRadius: 6,
                      border: "1px solid var(--border)", background: "transparent",
                      cursor: "pointer", fontSize: 11, color: "var(--ink-2)",
                      fontFamily: "inherit", transition: "color .15s",
                    }}>
                    {copiedIdx === idx ? "✓" : "Copy"}
                  </button>
                </div>
              </div>
            ))}
            <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
              {L("Then click Check above ↑", "Xong rồi bấm Kiểm tra ở trên ↑", "완료 후 위의 확인을 클릭하세요 ↑", "然后点击上方的检查 ↑")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

window.CodemateTool = CodemateTool;
