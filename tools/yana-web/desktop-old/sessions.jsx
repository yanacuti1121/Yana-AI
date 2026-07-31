// Yana — Sessions page: conversation history browser

const { useState, useEffect, useRef } = React;

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function fmtTs(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function exportSession(s) {
  const text = s.messages.map(m => `[${m.role.toUpperCase()}] ${m.content}`).join("\n\n");
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (s.title || "session").replace(/\s+/g, "-").toLowerCase() + ".txt";
  a.click();
}

function SessionMessages({ id, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/sessions/" + id)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {});
  }, [id]);

  if (!data) return (
    <div style={{ padding: 24, color: "var(--ink-3)", fontSize: 13 }}>
      {L("Loading…", "Đang tải…", "불러오는 중…", "加载中…")}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--glass-border)", flex: "none" }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-2)", padding: 4 }}>
          {Icons.chevronLeft ? Icons.chevronLeft(16) : "←"}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.title}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{data.provider} · {data.model || "default"} · {fmtTs(data.createdAt)}</div>
        </div>
        <button onClick={() => exportSession(data)} style={{
          padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12,
          background: "rgba(var(--shadow-rgb),.08)", color: "var(--ink-2)",
        }}>{L("Export", "Xuất", "내보내기", "导出")}</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {(data.messages || []).map((m, i) => (
          <div key={i} style={{
            display: "flex", gap: 10,
            flexDirection: m.role === "user" ? "row-reverse" : "row",
          }}>
            <div style={{
              maxWidth: "75%", padding: "8px 13px", borderRadius: "var(--r-lg)",
              fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: m.role === "user" ? "var(--primary)" : "rgba(var(--shadow-rgb),.06)",
              color: m.role === "user" ? "white" : "var(--ink)",
            }}>{m.content}</div>
          </div>
        ))}
        {(!data.messages || data.messages.length === 0) && (
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{L("No messages.", "Không có tin nhắn.", "메시지가 없습니다.", "暂无消息。")}</div>
        )}
      </div>
    </div>
  );
}

function Sessions() {
  const [sessions, setSessions] = useState(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(null);

  function load() {
    fetch("/api/sessions")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSessions(d.sessions); })
      .catch(() => {});
  }

  useEffect(() => { load(); }, []);

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

  const PROVIDER_COLORS = {
    anthropic: "var(--primary)", openai: "#19c37d", gemini: "#4285F4",
    groq: "#f55036", openrouter: "#6366f1", "9router": "#14b8a6",
    xai: "#111", novita: "#7c3aed", nvidia: "#76b900", kimi: "#0050ff",
    minimax: "#ff6b35", glm: "#1e3799", huggingface: "#ff9d00",
  };

  return (
    <div data-screen-label="Sessions" style={{ display: "flex", height: "100%", gap: "var(--gap)" }}>
      {/* List panel */}
      <div style={{ flex: selected ? "0 0 340px" : 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
        <PageHeader
          title={L("Sessions", "Lịch sử trò chuyện", "세션", "会话")}
          sub={sessions ? sessions.length + L(" conversations saved", " cuộc trò chuyện đã lưu", "개 대화 저장됨", " 个对话已保存") : L("Loading…", "Đang tải…", "불러오는 중…", "加载中…")}>
          <div style={{ position: "relative" }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={L("Search…", "Tìm kiếm…", "검색…", "搜索…")}
              style={{
                padding: "7px 12px 7px 32px", borderRadius: 99, border: "1px solid var(--glass-border)",
                background: "rgba(var(--shadow-rgb),.05)", fontSize: 13, color: "var(--ink)",
                outline: "none", width: 180,
              }} />
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", pointerEvents: "none" }}>
              {Icons.search ? Icons.search(14) : "🔍"}
            </span>
          </div>
        </PageHeader>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions === null && (
            <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{L("Loading sessions…", "Đang tải…", "세션 불러오는 중…", "加载会话中…")}</div>
          )}
          {sessions !== null && visible.length === 0 && (
            <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
              {search ? L("No results.", "Không tìm thấy.", "결과가 없습니다.", "没有结果。") : L("No sessions yet. Conversations saved from Chat appear here.", "Chưa có lịch sử. Hội thoại lưu từ Chat sẽ hiện ở đây.", "아직 세션이 없습니다. Chat에서 저장된 대화가 여기에 표시됩니다.", "暂无会话。从聊天保存的对话会显示在这里。")}
            </div>
          )}
          {visible.map(s => (
            <div key={s.id} className="glass" onClick={() => setSelected(s.id === selected ? null : s.id)}
              style={{
                borderRadius: "var(--r-lg)", padding: "12px 14px", cursor: "pointer",
                border: s.id === selected ? "1px solid var(--primary)" : "1px solid transparent",
                transition: "border .15s",
                display: "flex", gap: 12, alignItems: "flex-start",
              }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                  {s.title || L("Untitled", "Chưa đặt tên", "제목 없음", "无标题")}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="chip" style={{
                    fontSize: 11, background: "color-mix(in oklab," + (PROVIDER_COLORS[s.provider] || "var(--primary)") + " 15%, transparent)",
                    color: PROVIDER_COLORS[s.provider] || "var(--primary)",
                  }}>{s.provider}</span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{s.messageCount} msg</span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginLeft: "auto" }}>{fmtDate(s.updatedAt)}</span>
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

      {/* Detail panel */}
      {selected && (
        <div className="glass" style={{ flex: 1, minWidth: 0, borderRadius: "var(--r-lg)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <SessionMessages id={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Sessions });
