// Yana AI — Skills catalog: real counts via /api/skills (core/skills on disk)
import React from 'react';
import { L, PageHeader } from '../components.jsx';

export function Skills() {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/skills")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  const groups = data
    ? [{ name: L("core (standalone)", "lõi (độc lập)", "코어 (독립형)", "核心 (独立)"), count: data.standalone }, ...data.packs]
    : [];

  return (
    <div data-screen-label="Skills">
      <PageHeader
        title={L("Skills", "Kỹ năng", "스킬", "技能")}
        sub={data
          ? data.total.toLocaleString() + L(" skills on disk · " + data.pack_count + " imported packs", " kỹ năng trên đĩa · " + data.pack_count + " gói đã nhập", " 디스크의 스킬 · " + data.pack_count + " 가져온 팩", " 磁盘上的技能 · " + data.pack_count + " 个已导入包")
          : L("Counting skills…", "Đang đếm kỹ năng…", "스킬 계산 중…", "正在统计技能…")} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--gap)" }}>
        {groups.map((c) => (
          <div key={c.name} className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 14.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <span className="chip neutral" style={{ fontSize: 11.5, flex: "none" }}>{c.count.toLocaleString()}</span>
            </div>
            <div className="bar" style={{ height: 4 }}>
              <i style={{ width: Math.round(c.count / data.total * 100) + "%" }}></i>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {Math.round(c.count / data.total * 100)}% {L("of catalog", "danh mục", "카탈로그 중", "占目录")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
