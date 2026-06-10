// Yana AI — Dashboard (AI Control Center)
function StatTile({ label, value, sub, accent }) {
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="label-xs">{label}</span>
      <span className="num-lg">{value}</span>
      <span style={{ fontSize: 12.5, color: accent ? "var(--primary)" : "var(--ink-3)" }}>{sub}</span>
    </div>
  );
}

function ModelRow({ m }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "16px 1fr 110px 56px", alignItems: "center", gap: 12, padding: "calc(8px * var(--sp)) 0" }}>
      <span className={"dot " + (m.status === "active" ? "on" : "idle")}></span>
      <div style={{ lineHeight: 1.3, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.name} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{m.model}</span></div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.role}</div>
      </div>
      <div className="bar"><i style={{ width: m.load + "%" }}></i></div>
      <span style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "right" }}>{m.latency}</span>
    </div>
  );
}

function AgentRowMini({ a }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "calc(7px * var(--sp)) 0" }}>
      <span className={"dot " + (a.status === "active" ? "on" : "idle")}></span>
      <span style={{ fontSize: 13.5, fontWeight: 500, width: 86, flex: "none" }}>{a.name}</span>
      <span style={{ fontSize: 12.5, color: "var(--ink-3)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.load}</span>
    </div>
  );
}

function MissionRowMini({ m, onOpen }) {
  return (
    <button onClick={onOpen} style={{
      display: "grid", gridTemplateColumns: "1fr 90px 48px", alignItems: "center", gap: 12,
      padding: "calc(8px * var(--sp)) 0", width: "100%", textAlign: "left",
      background: "none", border: "none", cursor: "pointer", color: "inherit",
    }}>
      <div style={{ lineHeight: 1.3, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{m.owner} · due {m.due}</div>
      </div>
      <div className="bar"><i style={{ width: m.progress + "%" }}></i></div>
      <span style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "right" }}>{m.progress}%</span>
    </button>
  );
}

/* ---------- The heart of Yana: the mission composer ---------- */
function MissionComposer({ onNav }) {
  const D = window.YANA;
  const [v, setV] = React.useState("");
  const suggestions = [
    ["Ship v0.9 safely", "Phát hành v0.9 an toàn"],
    ["Summarize what changed overnight", "Tóm tắt thay đổi qua đêm"],
    ["Prune stale memories", "Dọn ký ức cũ"],
  ];

  function begin(text) {
    const goal = (text || v).trim();
    if (!goal) return;
    const id = "m" + Date.now();
    D.missions.unshift({
      id, name: goal, owner: "Navigator", progress: 4, due: "Planning", status: "analyzing",
      tasks: [
        { name: "Understanding the goal", agent: "Navigator", state: "active" },
        { name: "Choosing agents & skills", agent: "Navigator", state: "queued" },
        { name: "Drafting a plan for your review", agent: "Navigator", state: "queued" },
      ],
    });
    D._openMission = id;
    D.stats.missionsActive += 1;
    onNav("missions");
  }

  return (
    <div style={{ maxWidth: 660, margin: "0 auto", padding: "calc(34px * var(--sp)) 0 calc(40px * var(--sp))", textAlign: "center" }}>
      <h1 className="h-display" style={{ margin: "0 0 18px", fontSize: 30 }}>{L("Good morning, Tâm", "Chào buổi sáng, Tâm")}</h1>
      <div className="glass-strong" style={{ borderRadius: 18, padding: "10px 10px 10px 20px", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") begin(); }}
          placeholder={L("What do you want to accomplish today?", "Hôm nay bạn muốn hoàn thành điều gì?")}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15.5, fontFamily: "inherit", color: "var(--ink)" }}
        />
        <button onClick={() => begin()} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "9px 17px", borderRadius: 13,
          border: "none", cursor: "pointer", background: "var(--primary)", color: "white",
          fontSize: 13.5, fontWeight: 500, flex: "none",
          boxShadow: "0 4px 14px color-mix(in oklab, var(--primary) 32%, transparent)",
        }}>{Icons.spark(15)} {L("New Mission", "Nhiệm vụ mới")}</button>
      </div>
      <div style={{ display: "flex", gap: 7, justifyContent: "center", flexWrap: "wrap", marginTop: 13 }}>
        {suggestions.map(([en, vi]) => (
          <button key={en} onClick={() => begin(en)} className="chip neutral" style={{ cursor: "pointer", fontSize: 12 }}>{L(en, vi)}</button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 22, fontSize: 12.5, color: "var(--ink-3)" }}>
        <span className="dot on pulse"></span>
        <span>{L("Lake status:", "Trạng thái hồ:")} <b style={{ fontWeight: 500, color: "var(--ink-2)" }}>{L("Calm", "Tĩnh lặng")}</b></span>
        <span style={{ opacity: .5 }}>·</span>
        <span>{D.stats.agentsActive} {L("agents active", "tác nhân hoạt động")}</span>
        <span style={{ opacity: .5 }}>·</span>
        <span>{D.stats.missionsActive} {L("missions running", "nhiệm vụ đang chạy")}</span>
      </div>
    </div>
  );
}

function Dashboard({ t, onNav }) {
  const D = window.YANA;
  const activeAgents = D.agents.filter((a) => a.status === "active");
  return (
    <div data-screen-label="Lake">
      <MissionComposer onNav={onNav} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap)", marginBottom: "var(--gap)" }}>
        <StatTile label={L("Agents", "Tác nhân")} value={<>{D.stats.agentsActive}<span style={{ fontSize: 17, color: "var(--ink-3)" }}> / {D.stats.agents}</span></>} sub={L("active right now", "đang hoạt động")} accent />
        <StatTile label={L("Skills", "Kỹ năng")} value={D.stats.skills.toLocaleString()} sub={D.stats.skillsUsedToday + L(" used today", " dùng hôm nay")} />
        <StatTile label={L("Missions", "Nhiệm vụ")} value={D.stats.missionsActive} sub={L("in motion", "đang diễn ra")} />
        <StatTile label={L("Memories", "Ký ức")} value={D.stats.memories.toLocaleString()} sub={"+" + D.stats.memoriesToday + L(" today", " hôm nay")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: "var(--gap)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
          <Card title={L("Active AI Models", "Mô hình AI đang hoạt động")} aside={<span className="chip neutral">4 {L("providers", "nhà cung cấp")}</span>}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {D.models.map((m) => <ModelRow key={m.id} m={m} />)}
            </div>
          </Card>

          {t.showMissions && (
            <Card title={L("Missions", "Nhiệm vụ")} aside={
              <button onClick={() => onNav("missions")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 2 }}>
                {L("Mission Center", "Trung tâm nhiệm vụ")} {Icons.chevron(13)}
              </button>
            }>
              {D.missions.filter((m) => m.status !== "recurring").slice(0, 4).map((m) => (
                <MissionRowMini key={m.id} m={m} onOpen={() => onNav("missions")} />
              ))}
            </Card>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
          {t.showAgents && (
            <Card title={L("Running Agents", "Tác nhân đang chạy")} aside={
              <button onClick={() => onNav("agents")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 2 }}>
                {L("Agent Space", "Không gian tác nhân")} {Icons.chevron(13)}
              </button>
            }>
              {activeAgents.slice(0, 6).map((a) => <AgentRowMini key={a.id} a={a} />)}
            </Card>
          )}

          {t.showMemory && (
            <Card title={L("Memory Garden", "Vườn ký ức")} aside={<span className="chip pink">{Icons.memory(13)} +{D.stats.memoriesToday} {L("today", "hôm nay")}</span>}>
              {D.memories.filter((m) => m.fresh).slice(0, 3).map((m) => (
                <div key={m.id} style={{ padding: "calc(7px * var(--sp)) 0", display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span className="chip neutral" style={{ flex: "none", fontSize: 11 }}>{m.kind}</span>
                  <span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>{m.text}</span>
                </div>
              ))}
            </Card>
          )}

          {t.showSystem && (
            <Card title={L("System Health", "Sức khỏe hệ thống")}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  [L("Safety checks", "Kiểm tra an toàn"), D.safety.checksToday.toLocaleString() + L(" today", " hôm nay")],
                  [L("Blocked actions", "Hành động bị chặn"), D.safety.blocked + L(" (review queue ", " (chờ duyệt ") + D.safety.pendingReview + ")"],
                  [L("Last incident", "Sự cố gần nhất"), L(D.safety.lastIncident, "27 ngày trước")],
                  [L("Uptime", "Thời gian chạy"), D.stats.uptimeDays + L(" days", " ngày")],
                ].map(([k, v]) => (
                  <div key={k} style={{ lineHeight: 1.35 }}>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
