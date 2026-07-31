// Yana AI — Memory Garden: real L1 atomic facts via /api/memories
import React from 'react';
import { L, PageHeader, Icons } from '../components.jsx';

export function MemoryGarden() {
  const [data, setData] = React.useState(null);
  const [filter, setFilter] = React.useState("all");

  React.useEffect(() => {
    fetch("/api/memories")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  const memories = data ? data.memories : [];
  const kinds = ["all", ...Array.from(new Set(memories.map((m) => m.kind)))];
  const visible = filter === "all" ? memories : memories.filter((m) => m.kind === filter);

  return (
    <div data-screen-label="Memory Garden">
      <PageHeader
        title={L("Memory Garden", "Vườn ký ức", "기억 정원", "记忆花园")}
        sub={data
          ? data.total + L(" L1 atomic facts · persisted in memory/L1_atomic", " fact L1 · lưu tại memory/L1_atomic", " L1 원자 사실 · memory/L1_atomic에 저장", " L1 原子事实 · 存储于 memory/L1_atomic")
          : L("Loading memories…", "Đang tải ký ức…", "기억 불러오는 중…", "加载记忆中…")}>
        <div style={{ display: "flex", gap: 6 }}>
          {kinds.map((k) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              padding: "5px 13px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12.5,
              fontWeight: filter === k ? 500 : 400,
              background: filter === k ? "var(--primary)" : "rgba(var(--shadow-rgb), .08)",
              color: filter === k ? "white" : "var(--ink-2)",
              transition: "background .15s",
            }}>{k === "all" ? L("All", "Tất cả", "전체", "全部") : k}</button>
          ))}
        </div>
      </PageHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 800 }}>
        {data && visible.length === 0 && (
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{L("No memories yet.", "Chưa có ký ức nào.", "아직 기억이 없습니다.", "暂无记忆。")}</div>
        )}
        {visible.map((m) => (
          <div key={m.id} className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", gap: 14 }}>
            <div style={{ flex: "none", paddingTop: 2 }}>
              <span style={{ color: "var(--pink)" }}>{Icons.memory(16)}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span className="chip neutral" style={{ fontSize: 11 }}>{m.kind}</span>
                {m.confidence && <span className="chip gold" style={{ fontSize: 10.5 }}>{m.confidence}</span>}
                {m.fresh && <span className="chip" style={{ fontSize: 10.5, color: "var(--good)" }}>{L("Fresh", "Mới", "최신", "最新")}</span>}
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>{m.text}</p>
              {m.source && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 7 }}>{m.source}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
