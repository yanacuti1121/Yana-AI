// Yana AI — Agent Space + Mission Center
function AgentCard({ a }) {
  const initial = a.name[0];
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 13, flex: "none", display: "grid", placeItems: "center",
          fontSize: 15, fontWeight: 500, color: "var(--primary)",
          background: "var(--primary-soft)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5)",
        }}>{initial}</div>
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 7 }}>
            {a.name}
            {a.core && <span className="chip gold" style={{ fontSize: 10.5, padding: "1px 8px" }}>Core</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{a.role}</div>
        </div>
        <div style={{ marginLeft: "auto" }}><span className={"dot " + (a.status === "active" ? "on" : "idle")}></span></div>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{a.specialty}</div>
      <div style={{
        fontSize: 12, color: a.status === "active" ? "var(--primary)" : "var(--ink-3)",
        display: "flex", alignItems: "center", gap: 7, paddingTop: 8, borderTop: "1px solid var(--border)",
      }}>
        {a.status === "active" ? Icons.spark(13) : Icons.clock(13)} {a.load}
      </div>
    </div>
  );
}

function AgentSpace() {
  const D = window.YANA;
  const rest = D.stats.agents - D.agents.length;
  return (
    <div data-screen-label="Agent Space">
      <PageHeader title={L("Agent Space", "Không gian tác nhân")} sub={D.stats.agentsActive + L(" of ", " trong ") + D.stats.agents + L(" agents active · orchestrated by Navigator, reviewed by Sentinel", " tác nhân đang hoạt động · Navigator điều phối, Sentinel giám sát")}>
        <button style={{
          display: "flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 99,
          border: "none", cursor: "pointer", background: "var(--primary)", color: "white",
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
        }}>{Icons.plus(15)} {L("New agent", "Tác nhân mới")}</button>
      </PageHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "var(--gap)" }}>
        {D.agents.map((a) => <AgentCard key={a.id} a={a} />)}
        <div style={{
          borderRadius: "var(--r-lg)", border: "1.5px dashed var(--border-strong)",
          display: "grid", placeItems: "center", minHeight: 130, color: "var(--ink-3)", fontSize: 13,
        }}>+ {rest} {L("more specialist agents", "tác nhân chuyên môn khác")}</div>
      </div>
    </div>
  );
}

/* ---------- Mission Center ---------- */
const TASK_STATE = {
  done:   { label: () => L("Done", "Xong"),       color: "var(--good)" },
  active: { label: () => L("Active", "Đang chạy"), color: "var(--primary)" },
  queued: { label: () => L("Queued", "Đang chờ"),  color: "var(--ink-3)" },
};

function MissionCard({ m, open, onToggle }) {
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)" }}>
      <button onClick={onToggle} style={{
        display: "grid", gridTemplateColumns: "1fr 130px 52px 18px", alignItems: "center", gap: 14,
        width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "inherit", padding: 0,
      }}>
        <div style={{ lineHeight: 1.3, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 500 }}>{m.name}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {m.owner} · {L("due", "hạn")} {m.due} · <span style={{ color: m.status === "recurring" ? "var(--gold)" : m.status === "analyzing" ? "var(--primary)" : "var(--good)" }}>{m.status}</span>
          </div>
        </div>
        <div className="bar"><i style={{ width: m.progress + "%" }}></i></div>
        <span style={{ fontSize: 12.5, color: "var(--ink-2)", textAlign: "right" }}>{m.progress}%</span>
        <span style={{ color: "var(--ink-3)", transform: open ? "rotate(90deg)" : "none", transition: "transform .18s", display: "inline-flex" }}>{Icons.chevron(14)}</span>
      </button>
      {open && (
        <div style={{ marginTop: 13, paddingTop: 11, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 2 }}>
          {m.tasks.map((tk) => {
            const st = TASK_STATE[tk.state];
            return (
              <div key={tk.name} style={{ display: "grid", gridTemplateColumns: "16px 1fr 110px 64px", alignItems: "center", gap: 11, padding: "6px 0", fontSize: 13 }}>
                <span style={{ color: st.color, display: "inline-flex" }}>
                  {tk.state === "done" ? Icons.check(14) : tk.state === "active" ? Icons.spark(14) : Icons.clock(14)}
                </span>
                <span style={{ color: tk.state === "done" ? "var(--ink-3)" : "var(--ink)" }}>{tk.name}</span>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{tk.agent}</span>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: st.color, textAlign: "right" }}>{st.label()}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MissionCenter() {
  const D = window.YANA;
  const [open, setOpen] = React.useState(() => window.YANA._openMission || "m1");
  return (
    <div data-screen-label="Mission Center">
      <PageHeader title={L("Mission Center", "Trung tâm nhiệm vụ")} sub={L("Multi-agent work, visible end to end — progress, owners, dependencies.", "Công việc đa tác nhân, nhìn thấy từ đầu đến cuối — tiến độ, người phụ trách, phụ thuộc.")}>
        <button style={{
          display: "flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 99,
          border: "none", cursor: "pointer", background: "var(--primary)", color: "white",
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
        }}>{Icons.plus(15)} {L("New mission", "Nhiệm vụ mới")}</button>
      </PageHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 860 }}>
        {D.missions.map((m) => (
          <MissionCard key={m.id} m={m} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { AgentSpace, MissionCenter });
