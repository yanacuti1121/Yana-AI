// Yana Mobile — Sessions: conversation history browser
const { useState: useStateMS, useEffect: useEffectMS } = React;

function msFmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function msFmtTs(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function msExportSession(s) {
  const text = s.messages.map(m => `[${m.role.toUpperCase()}] ${m.content}`).join("\n\n");
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (s.title || "session").replace(/\s+/g, "-").toLowerCase() + ".txt";
  a.click();
}

const MS_PROVIDER_COLORS = {
  anthropic: "var(--primary)", openai: "#19c37d", gemini: "#4285F4",
  groq: "#f55036", openrouter: "#6366f1", "9router": "#14b8a6",
  xai: "#111", novita: "#7c3aed", nvidia: "#76b900", kimi: "#0050ff",
  minimax: "#ff6b35", glm: "#1e3799", huggingface: "#ff9d00",
};

function MSessionMessages({ id, onClose }) {
  const [data, setData] = useStateMS(null);

  useEffectMS(() => {
    fetch("/api/sessions/" + id)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {});
  }, [id]);

  if (!data) return (
    <div style={{ padding: 24, color: "var(--ink-3)", fontSize: 13 }}>
      {L("Loading…", "Đang tải…")}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0 14px" }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-2)", padding: 4, flex: "none" }}>
          {Icons.back(18)}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{data.provider} · {data.model || "default"} · {msFmtTs(data.createdAt)}</div>
        </div>
        <button onClick={() => msExportSession(data)} style={{
          padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, flex: "none",
          background: "rgba(var(--shadow-rgb),.08)", color: "var(--ink-2)",
        }}>{L("Export", "Xuất")}</button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        {(data.messages || []).map((m, i) => (
          <div key={i} style={{
            display: "flex", gap: 10,
            flexDirection: m.role === "user" ? "row-reverse" : "row",
          }}>
            <div style={{
              maxWidth: "85%", padding: "8px 13px", borderRadius: "var(--r-lg)",
              fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: m.role === "user" ? "var(--primary)" : "rgba(var(--shadow-rgb),.06)",
              color: m.role === "user" ? "white" : "var(--ink)",
            }}>{m.content}</div>
          </div>
        ))}
        {(!data.messages || data.messages.length === 0) && (
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{L("No messages.", "Không có tin nhắn.")}</div>
        )}
      </div>
    </div>
  );
}

function MSessions() {
  const [sessions, setSessions] = useStateMS(null);
  const [search, setSearch] = useStateMS("");
  const [selected, setSelected] = useStateMS(null);
  const [deleting, setDeleting] = useStateMS(null);

  function load() {
    fetch("/api/sessions")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSessions(d.sessions); })
      .catch(() => {});
  }

  useEffectMS(() => { load(); }, []);

  function del(id) {
    setDeleting(id);
    fetch("/api/sessions/" + id, { method: "DELETE" })
      .then(r => r.ok ? r.json() : null)
      .then(() => { setSessions(prev => prev.filter(s => s.id !== id)); setDeleting(null); if (selected === id) setSelected(null); })
      .catch(() => setDeleting(null));
  }

  const visible = sessions
    ? sessions.filter(s => !search || (s.title || "").toLowerCase().includes(search.toLowerCase()))
    : [];

  // Detail view replaces the list entirely on a narrow screen
  if (selected) {
    return (
      <div data-screen-label="Sessions" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <MSessionMessages id={selected} onClose={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div data-screen-label="Sessions" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <MHead title={L("Sessions", "Lịch sử trò chuyện")}
        sub={sessions ? sessions.length + L(" conversations saved", " cuộc trò chuyện đã lưu") : L("Loading…", "Đang tải…")} />

      <div style={{ position: "relative" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={L("Search…", "Tìm kiếm…")}
          style={{
            width: "100%", boxSizing: "border-box", padding: "9px 14px 9px 36px", borderRadius: 99,
            border: "1px solid var(--glass-border)", background: "rgba(var(--shadow-rgb),.05)",
            fontSize: 14, color: "var(--ink)", outline: "none",
          }} />
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", pointerEvents: "none" }}>
          {Icons.search(15)}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sessions === null && (
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{L("Loading sessions…", "Đang tải…")}</div>
        )}
        {sessions !== null && visible.length === 0 && (
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
            {search ? L("No results.", "Không tìm thấy.") : L("No sessions yet. Conversations saved from Chat appear here.", "Chưa có lịch sử. Hội thoại lưu từ Chat sẽ hiện ở đây.")}
          </div>
        )}
        {visible.map(s => (
          <div key={s.id} className="glass" onClick={() => setSelected(s.id)}
            style={{
              borderRadius: "var(--r-lg)", padding: "13px 14px", cursor: "pointer",
              display: "flex", gap: 12, alignItems: "flex-start",
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                {s.title || L("Untitled", "Chưa đặt tên")}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span className="chip" style={{
                  fontSize: 11, background: "color-mix(in oklab," + (MS_PROVIDER_COLORS[s.provider] || "var(--primary)") + " 15%, transparent)",
                  color: MS_PROVIDER_COLORS[s.provider] || "var(--primary)",
                }}>{s.provider}</span>
                <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{s.messageCount} msg</span>
                <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginLeft: "auto" }}>{msFmtDate(s.updatedAt)}</span>
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); del(s.id); }}
              disabled={deleting === s.id}
              style={{
                background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)",
                padding: 4, flex: "none", fontSize: 16, lineHeight: 1,
                opacity: deleting === s.id ? 0.4 : 1,
              }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { MSessions });
