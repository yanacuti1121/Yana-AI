// Yana AI — Chat: Ollama model manager (list/pull/delete local models)
import React from 'react';
import { L } from '../../components.jsx';

export function OllamaManager() {
  const [models, setModels]       = React.useState(null);   // null=loading, []=loaded
  const [pullName, setPullName]   = React.useState("");
  const [pulling, setPulling]     = React.useState(false);
  const [pullLog, setPullLog]     = React.useState("");
  const [open, setOpen]           = React.useState(false);
  const [deleting, setDeleting]   = React.useState(null);

  function reload() {
    fetch("/api/ollama/models")
      .then(r => r.ok ? r.json() : null)
      .then(d => setModels(d ? d.models : []))
      .catch(() => setModels([]));
  }

  React.useEffect(() => { if (open) reload(); }, [open]);

  function formatSize(bytes) {
    if (!bytes) return "";
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
    return (bytes / 1e6).toFixed(0) + " MB";
  }

  async function doPull() {
    const name = pullName.trim();
    if (!name || pulling) return;
    setPulling(true);
    setPullLog("");
    try {
      const res = await fetch("/api/ollama/pull", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop();
        for (const line of lines) {
          const data = line.replace(/^data: /, "").trim();
          if (!data) continue;
          try {
            const j = JSON.parse(data);
            if (j.status === "done") { setPullLog("✓ " + L("Done", "Xong", "완료", "完成")); reload(); setPullName(""); }
            else if (j.error)        { setPullLog("✗ " + j.error); }
            else if (j.status)       { setPullLog(j.status + (j.completed && j.total ? ` ${Math.round(j.completed/j.total*100)}%` : "")); }
          } catch (_) {}
        }
      }
    } catch (e) { setPullLog("✗ " + e.message); }
    setPulling(false);
  }

  async function doDelete(name) {
    if (!confirm(L("Delete " + name + "?", "Xoá " + name + "?", name + " 삭제할까요?", "删除 " + name + "？"))) return;
    setDeleting(name);
    try {
      await fetch("/api/ollama/models", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      reload();
    } catch (_) {}
    setDeleting(null);
  }

  return (
    <div style={{ marginTop: 8, textAlign: "left" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        fontSize: 12, color: "var(--ink-3)", background: "transparent", border: "1px solid var(--border)",
        borderRadius: 8, padding: "4px 10px", cursor: "pointer",
      }}>
        {open ? "▾" : "▸"} {L("Ollama models", "Quản lý model Ollama", "Ollama 모델", "Ollama 模型")}
      </button>

      {open && (
        <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--ink) 4%, transparent)", border: "1px solid var(--border)", fontSize: 12 }}>
          {/* installed models list */}
          {models === null
            ? <div style={{ color: "var(--ink-3)" }}>{L("Loading…", "Đang tải…", "불러오는 중…", "加载中…")}</div>
            : models.length === 0
              ? <div style={{ color: "var(--ink-3)" }}>{L("No models installed yet.", "Chưa cài model nào.", "설치된 모델이 없습니다.", "尚未安装任何模型。")}</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  {models.map(m => (
                    <div key={m.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                      <div>
                        <span style={{ fontWeight: 500, color: "var(--ink-2)" }}>{m.name}</span>
                        {m.size && <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>{formatSize(m.size)}</span>}
                        {m.details && m.details.parameter_size && <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>{m.details.parameter_size}</span>}
                      </div>
                      <button onClick={() => doDelete(m.name)} disabled={deleting === m.name} style={{
                        fontSize: 11, color: "var(--ink-3)", background: "transparent",
                        border: "none", cursor: "pointer", padding: "2px 4px",
                      }}>
                        {deleting === m.name ? "…" : "✕"}
                      </button>
                    </div>
                  ))}
                </div>
              )
          }

          {/* pull new model */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
            <input value={pullName} onChange={e => setPullName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doPull()}
              placeholder={L("e.g. qwen2.5-coder:7b", "vd. qwen2.5-coder:7b", "예: qwen2.5-coder:7b", "例：qwen2.5-coder:7b")}
              style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", outline: "none" }}
            />
            <button onClick={doPull} disabled={pulling || !pullName.trim()} style={{
              fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "none",
              background: "var(--primary)", color: "#fff", cursor: pulling ? "default" : "pointer", opacity: pulling ? 0.6 : 1,
            }}>
              {pulling ? L("Pulling…", "Đang tải…", "다운로드 중…", "拉取中…") : L("Pull", "Tải", "다운로드", "拉取")}
            </button>
          </div>
          {pullLog && <div style={{ marginTop: 5, fontSize: 11.5, color: pullLog.startsWith("✓") ? "#16a34a" : pullLog.startsWith("✗") ? "#dc2626" : "var(--ink-3)", fontFamily: "monospace" }}>{pullLog}</div>}
        </div>
      )}
    </div>
  );
}
