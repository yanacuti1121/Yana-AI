// Yana AI — Chat: Artifact Panel — Claude-style inline HTML preview
import React from 'react';
import { L, Icons } from '../../components.jsx';

export function ArtifactPanel({ artifact, onClose }) {
  const [tab, setTab] = React.useState("preview");
  const [copied, setCopied] = React.useState(false);
  const iframeRef = React.useRef(null);

  React.useEffect(() => {
    if (tab === "preview" && iframeRef.current) {
      iframeRef.current.srcdoc = artifact.html || "";
    }
  }, [artifact.html, tab]);

  function copyHtml() {
    navigator.clipboard.writeText(artifact.html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function downloadHtml() {
    const blob = new Blob([artifact.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "output.html" });
    a.click();
    URL.revokeObjectURL(url);
  }

  const btnStyle = {
    padding: "4px 10px", borderRadius: 8, border: "1px solid var(--border)",
    cursor: "pointer", fontSize: 11.5, fontFamily: "inherit",
    background: "transparent", color: "var(--ink-2)",
  };
  const tabStyle = (active) => ({
    padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer",
    fontSize: 11.5, fontFamily: "inherit", fontWeight: active ? 500 : 400,
    background: active ? "var(--primary-soft)" : "transparent",
    color: active ? "var(--primary)" : "var(--ink-3)",
  });

  return (
    <aside style={{ width: 460, flex: "none", display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flex: "none" }}>
        <span style={{ color: "var(--ink-3)", display: "flex", alignItems: "center" }}>{Icons.code(14)}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>HTML</span>
        <button style={tabStyle(tab === "preview")} onClick={() => setTab("preview")}>{L("Preview", "Xem trước", "미리보기", "预览")}</button>
        <button style={tabStyle(tab === "code")} onClick={() => setTab("code")}>{L("Code", "Code", "코드", "代码")}</button>
        <button style={btnStyle} onClick={copyHtml}>{copied ? L("Copied!", "Đã chép!", "복사됨!", "已复制！") : L("Copy", "Chép", "복사", "复制")}</button>
        <button style={btnStyle} onClick={downloadHtml}>↓</button>
        <button style={{ ...btnStyle, borderColor: "transparent" }} onClick={onClose}>✕</button>
      </div>
      <div className="glass" style={{ flex: 1, borderRadius: "var(--r-lg)", overflow: "hidden", minHeight: 0 }}>
        {tab === "preview"
          ? <iframe ref={iframeRef} sandbox="allow-scripts allow-same-origin" style={{ width: "100%", height: "100%", border: "none", display: "block" }} />
          : <pre style={{ margin: 0, padding: "14px 16px", overflowY: "auto", fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.5, color: "var(--ink-2)", height: "100%", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{artifact.html}</pre>
        }
      </div>
    </aside>
  );
}
