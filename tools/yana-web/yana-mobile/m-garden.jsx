// Yana Mobile — Memory Garden + Skills
const M_MEM_KINDS = [
  { id: "Fact",       color: "var(--primary)", soft: "var(--primary-soft)" },
  { id: "Knowledge",  color: "var(--gold)",    soft: "var(--gold-soft)" },
  { id: "Experience", color: "var(--pink)",    soft: "var(--pink-soft)" },
  { id: "Context",    color: "var(--ink-2)",   soft: "rgba(var(--surface-rgb), .6)" },
];
const M_KIND_VI = { All: "Tất cả", Fact: "Dữ kiện", Knowledge: "Kiến thức", Experience: "Trải nghiệm", Context: "Ngữ cảnh" };

function MMemoryCard({ m }) {
  const kind = M_MEM_KINDS.find((k) => k.id === m.kind);
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "15px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="chip" style={{ background: kind.soft, color: kind.color, fontSize: 11 }}>{L(m.kind, M_KIND_VI[m.kind])}</span>
        {m.pinned && <span style={{ color: "var(--gold)", display: "inline-flex" }}>{Icons.pin(13)}</span>}
        {m.fresh && !m.pinned && <span className="chip pink" style={{ fontSize: 10.5, padding: "1px 8px" }}>{L("New", "Mới")}</span>}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>{m.text}</div>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{m.source}</div>
    </div>
  );
}

function MMemoryGarden() {
  const D = window.YANA;
  const [filter, setFilter] = React.useState("All");
  const kinds = ["All", ...M_MEM_KINDS.map((k) => k.id)];
  const list = filter === "All" ? D.memories : D.memories.filter((m) => m.kind === filter);
  return (
    <div data-screen-label="Memory Garden" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <MHead title={L("Memory Garden", "Vườn ký ức")} sub={D.stats.memories.toLocaleString() + L(" memories · +", " ký ức · +") + D.stats.memoriesToday + L(" planted today", " trồng hôm nay")} />
      <div className="hscroll">
        {kinds.map((k) => (
          <button key={k} className="fchip" data-on={filter === k ? "1" : "0"} onClick={() => setFilter(k)}>{L(k, M_KIND_VI[k])}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {list.map((m) => <MMemoryCard key={m.id} m={m} />)}
      </div>
    </div>
  );
}

/* ---------- Skills ---------- */
function MSkills() {
  const D = window.YANA;
  const max = Math.max(...D.skillCategories.map((c) => c.usage));
  return (
    <div data-screen-label="Skills" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <MHead title={L("Skills", "Kỹ năng")} sub={D.stats.skills.toLocaleString() + L(" installed · ", " đã cài · ") + D.stats.skillsUsedToday + L(" invoked today · deny-by-default", " được gọi hôm nay · mặc định từ chối")} />
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {D.skillCategories.map((c) => (
          <div key={c.name} className="glass" style={{ borderRadius: "var(--r-lg)", padding: "15px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 14.5, fontWeight: 500 }}>{c.name}</span>
              <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{c.count.toLocaleString()}</span>
            </div>
            <div className="bar"><i style={{ width: (c.usage / max) * 100 + "%" }}></i></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)", gap: 10 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{L("Top:", "Dùng nhiều:")} <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, color: "var(--ink-2)" }}>{c.top}</code></span>
              <span style={{ flex: "none" }}>{c.usage}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { MMemoryGarden, MSkills });
