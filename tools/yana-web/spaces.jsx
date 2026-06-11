// Yana AI — Agent Space + Mission Center
// Agent catalog is real: GET /api/agents reads core/agents/*.md frontmatter.
function AgentCard({ a }) {
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 13, flex: "none", display: "grid", placeItems: "center",
          fontSize: 15, fontWeight: 500, color: "var(--primary)",
          background: "var(--primary-soft)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5)",
        }}>{a.name[0].toUpperCase()}</div>
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{a.category}</div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
        {a.description || L("No description.", "Chưa có mô tả.")}
      </div>
    </div>
  );
}

function AgentSpace() {
  const [data, setData] = React.useState(null);
  const [filter, setFilter] = React.useState("all");

  React.useEffect(() => {
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  const agents = data ? data.agents : [];
  const categories = ["all", ...Array.from(new Set(agents.map((a) => a.category)))];
  const visible = filter === "all" ? agents : agents.filter((a) => a.category === filter);

  return (
    <div data-screen-label="Agent Space">
      <PageHeader
        title={L("Agent Space", "Không gian tác nhân")}
        sub={data
          ? data.total + L(" agents in catalog · none running — agents start when a mission dispatches", " tác nhân trong danh mục · chưa có tác nhân nào chạy — khởi động khi nhiệm vụ được giao")
          : L("Loading agent catalog…", "Đang tải danh mục tác nhân…")}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{
          padding: "7px 12px", borderRadius: 99, border: "1px solid var(--border-strong)",
          background: "transparent", color: "var(--ink-2)", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer",
        }}>
          {categories.map((c) => <option key={c} value={c}>{c === "all" ? L("All categories", "Tất cả danh mục") : c}</option>)}
        </select>
      </PageHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "var(--gap)" }}>
        {visible.map((a) => <AgentCard key={a.category + "/" + a.name} a={a} />)}
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

// Clicking a task cycles its state: queued → active → done → queued
const NEXT_STATE = { queued: "active", active: "done", done: "queued" };

function MissionCard({ m, open, onToggle, onUpdate, onDelete, onPlan, planning }) {
  function cycleTask(i) {
    const tasks = m.tasks.map((tk, j) => j === i ? { ...tk, state: NEXT_STATE[tk.state] } : tk);
    onUpdate({ id: m.id, tasks });
  }
  const statusColor = m.status === "done" ? "var(--good)" : m.status === "active" ? "var(--primary)" : "var(--gold)";
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)" }}>
      <button onClick={onToggle} style={{
        display: "grid", gridTemplateColumns: "1fr 130px 52px 18px", alignItems: "center", gap: 14,
        width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "inherit", padding: 0,
      }}>
        <div style={{ lineHeight: 1.3, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 500 }}>{m.name}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {m.owner} · <span style={{ color: statusColor }}>{m.status}</span>
            {m.route && <span> · {L("route:", "tuyến:")} {m.route}</span>}
            {m.skill && <span> · {m.skill}</span>}
          </div>
        </div>
        <div className="bar"><i style={{ width: m.progress + "%" }}></i></div>
        <span style={{ fontSize: 12.5, color: "var(--ink-2)", textAlign: "right" }}>{m.progress}%</span>
        <span style={{ color: "var(--ink-3)", transform: open ? "rotate(90deg)" : "none", transition: "transform .18s", display: "inline-flex" }}>{Icons.chevron(14)}</span>
      </button>
      {open && (
        <div style={{ marginTop: 13, paddingTop: 11, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 2 }}>
          {m.tasks.map((tk, i) => {
            const st = TASK_STATE[tk.state];
            return (
              <button key={i} onClick={() => cycleTask(i)}
                title={L("Click to advance state", "Nhấn để chuyển trạng thái")}
                style={{
                  display: "grid", gridTemplateColumns: "16px 1fr 110px 64px", alignItems: "center", gap: 11,
                  padding: "6px 0", fontSize: 13, background: "none", border: "none",
                  cursor: "pointer", textAlign: "left", color: "inherit", width: "100%",
                }}>
                <span style={{ color: st.color, display: "inline-flex" }}>
                  {tk.state === "done" ? Icons.check(14) : tk.state === "active" ? Icons.spark(14) : Icons.clock(14)}
                </span>
                <span style={{ color: tk.state === "done" ? "var(--ink-3)" : "var(--ink)" }}>{tk.name}</span>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{tk.agent}</span>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: st.color, textAlign: "right" }}>{st.label()}</span>
              </button>
            );
          })}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => onPlan(m)} disabled={planning} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 99,
              border: "none", cursor: planning ? "wait" : "pointer", fontSize: 12, fontWeight: 500,
              background: "var(--primary-soft)", color: "var(--primary)",
            }}>{Icons.spark(13)} {planning ? L("Planning…", "Đang lập kế hoạch…") : L("Plan with Yana", "Yana lập kế hoạch")}</button>
            <button onClick={() => onDelete(m)} style={{
              padding: "6px 13px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12,
              background: "rgba(var(--shadow-rgb), .07)", color: "var(--ink-3)",
            }}>{L("Delete", "Xóa")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// "Plan with Yana": ask the connected provider for a 3-7 step task breakdown
// (JSON), then PATCH the mission. Reuses the /api/chat streaming pipeline.
async function planMission(m) {
  const cfg = window.getProviderConfig();
  if (!cfg.apiKey) { alert(L("Add a provider API key first (Providers page).", "Thêm API key ở mục Nhà cung cấp trước.")); return null; }

  const prompt =
    `Break this mission into 3-7 concrete tasks: "${m.name}".\n` +
    `Reply with ONLY a JSON array, no prose: ` +
    `[{"name":"<task>","agent":"<one of: Navigator, Builder, Reviewer, Researcher>"}]`;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: prompt, apiKey: cfg.apiKey, provider: cfg.provider }),
  });
  if (!res.ok || !res.body) return null;

  // Drain the SSE stream into one string
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value, { stream: true }).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try { const o = JSON.parse(payload); if (o.text) raw += o.text; } catch (_) {}
    }
  }
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0])
      .filter((t) => t && t.name)
      .map((t) => ({ name: String(t.name), agent: String(t.agent || "Navigator"), state: "queued" }));
  } catch (_) { return null; }
}

function MissionCenter() {
  const [missions, setMissions] = React.useState(null);
  const [open, setOpen] = React.useState(() => window.YANA._openMission || null);
  const [planningId, setPlanningId] = React.useState(null);

  const reload = React.useCallback(() => {
    fetch("/api/missions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setMissions(d.missions); })
      .catch(() => {});
  }, []);
  React.useEffect(reload, []);

  async function update(patch) {
    const r = await fetch("/api/missions/update", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (r.ok) reload();
  }

  async function create() {
    const name = window.prompt(L("What should this mission accomplish?", "Nhiệm vụ này cần hoàn thành điều gì?"));
    if (!name || !name.trim()) return;
    const r = await fetch("/api/missions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
    });
    if (r.ok) { const { mission } = await r.json(); setOpen(mission.id); reload(); }
  }

  async function remove(m) {
    if (!window.confirm(L("Delete mission “" + m.name + "”?", "Xóa nhiệm vụ “" + m.name + "”?"))) return;
    await fetch("/api/missions/delete", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id }),
    });
    reload();
  }

  async function plan(m) {
    setPlanningId(m.id);
    try {
      const tasks = await planMission(m);
      if (tasks && tasks.length) await update({ id: m.id, tasks, status: "active" });
      else alert(L("Could not get a plan — check the provider key.", "Không lấy được kế hoạch — kiểm tra API key."));
    } finally { setPlanningId(null); }
  }

  return (
    <div data-screen-label="Mission Center">
      <PageHeader title={L("Mission Center", "Trung tâm nhiệm vụ")} sub={L("Multi-agent work, visible end to end — progress, owners, dependencies.", "Công việc đa tác nhân, nhìn thấy từ đầu đến cuối — tiến độ, người phụ trách, phụ thuộc.")}>
        <button onClick={create} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 99,
          border: "none", cursor: "pointer", background: "var(--primary)", color: "white",
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
        }}>{Icons.plus(15)} {L("New mission", "Nhiệm vụ mới")}</button>
      </PageHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 860 }}>
        {missions && missions.length === 0 && (
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
            {L("No missions yet — create one above or from the Lake.", "Chưa có nhiệm vụ — tạo ở trên hoặc từ Mặt hồ.")}
          </div>
        )}
        {(missions || []).map((m) => (
          <MissionCard key={m.id} m={m}
            open={open === m.id}
            onToggle={() => setOpen(open === m.id ? null : m.id)}
            onUpdate={update}
            onDelete={remove}
            onPlan={plan}
            planning={planningId === m.id} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { AgentSpace, MissionCenter });
