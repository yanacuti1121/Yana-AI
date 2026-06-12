// Yana Mobile — Mission Center
const M_TASK_STATE = {
  done:   { label: () => L("Done", "Xong"),        color: "var(--good)" },
  active: { label: () => L("Active", "Đang chạy"),  color: "var(--primary)" },
  queued: { label: () => L("Queued", "Đang chờ"),   color: "var(--ink-3)" },
};

function MMissionCard({ m, open, onToggle }) {
  const statusColor = m.status === "recurring" ? "var(--gold)" : m.status === "analyzing" ? "var(--primary)" : "var(--good)";
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)" }}>
      <button onClick={onToggle} style={{
        display: "flex", flexDirection: "column", gap: 9,
        width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "inherit", padding: 0,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%" }}>
          <div style={{ lineHeight: 1.3, minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 500 }}>{m.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
              {m.owner} · {L("due", "hạn")} {m.due} · <span style={{ color: statusColor }}>{m.status}</span>
            </div>
          </div>
          <span style={{ color: "var(--ink-3)", transform: open ? "rotate(90deg)" : "none", transition: "transform .18s", display: "inline-flex", flex: "none", marginTop: 2 }}>{Icons.chevron(15)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
          <div className="bar" style={{ flex: 1 }}><i style={{ width: m.progress + "%" }}></i></div>
          <span style={{ fontSize: 12, color: "var(--ink-2)", flex: "none", width: 36, textAlign: "right" }}>{m.progress}%</span>
        </div>
      </button>
      {open && (
        <div style={{ marginTop: 13, paddingTop: 11, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 2 }}>
          {m.tasks.map((tk) => {
            const st = M_TASK_STATE[tk.state];
            return (
              <div key={tk.name} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", alignItems: "center", gap: 10, padding: "7px 0", fontSize: 13 }}>
                <span style={{ color: st.color, display: "inline-flex" }}>
                  {tk.state === "done" ? Icons.check(14) : tk.state === "active" ? Icons.spark(14) : Icons.clock(14)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: tk.state === "done" ? "var(--ink-3)" : "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tk.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{tk.agent}</div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: st.color, textAlign: "right", flex: "none" }}>{st.label()}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MMissions() {
  const D = window.YANA;
  const [open, setOpen] = React.useState(() => window.YANA._openMission || "m1");
  const [filter, setFilter] = React.useState("active");
  const filters = [
    ["active", L("Active", "Đang chạy")],
    ["all", L("All", "Tất cả")],
    ["recurring", L("Recurring", "Định kỳ")],
  ];
  const list = D.missions.filter((m) =>
    filter === "all" ? true : filter === "recurring" ? m.status === "recurring" : m.status !== "recurring");
  return (
    <div data-screen-label="Mission Center" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <MHead title={L("Missions", "Nhiệm vụ")} sub={L("Multi-agent work, visible end to end.", "Công việc đa tác nhân, theo dõi đầu đến cuối.")} />
      <div className="hscroll">
        {filters.map(([id, lbl]) => (
          <button key={id} className="fchip" data-on={filter === id ? "1" : "0"} onClick={() => setFilter(id)}>{lbl}</button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {list.map((m) => (
          <MMissionCard key={m.id} m={m} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />
        ))}
      </div>
    </div>
  );
}

window.MMissions = MMissions;
