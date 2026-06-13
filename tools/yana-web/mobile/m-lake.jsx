// Yana Mobile — Lake (Dashboard): compact composer + stacked control cards
function MStat({ label, value, sub, accent }) {
  return (
    <div className="glass" style={{ borderRadius: "var(--r-md)", padding: "13px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
      <span className="label-xs" style={{ fontSize: 10 }}>{label}</span>
      <span style={{ fontSize: 25, fontWeight: 300, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 11.5, color: accent ? "var(--primary)" : "var(--ink-3)" }}>{sub}</span>
    </div>
  );
}

/* Compact composer: one tappable bar that drops into the Mission flow */
function MComposer({ onNav }) {
  const D = window.YANA;
  const [v, setV] = React.useState("");
  const suggestions = [
    ["Ship v0.9 safely", "Phát hành v0.9 an toàn"],
    ["Summarize overnight", "Tóm tắt qua đêm"],
    ["Prune stale memories", "Dọn ký ức cũ"],
  ];
  async function begin(text) {
    const goal = (text || v).trim();
    if (!goal) return;
    onNav("missions");
    // POST to real API — server classifies the goal and creates starter tasks
    try {
      const r = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      if (r.ok) {
        const { mission } = await r.json();
        D.missions.unshift(mission);
        D._openMission = mission.id;
        D.stats.missionsActive += 1;
        window.dispatchEvent(new Event("yana:data"));
      }
    } catch (_) {
      // Offline fallback — local optimistic entry shown until server responds
      const id = "m" + Date.now();
      D.missions.unshift({
        id, name: goal, owner: "Navigator", progress: 0, due: "Planning", status: "analyzing",
        tasks: [
          { name: "Understanding the goal", agent: "Navigator", state: "active" },
          { name: "Choosing agents & skills", agent: "Navigator", state: "queued" },
          { name: "Drafting a plan for your review", agent: "Navigator", state: "queued" },
        ],
      });
      D._openMission = id;
      D.stats.missionsActive += 1;
      window.dispatchEvent(new Event("yana:data"));
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <h1 className="h-display" style={{ margin: 0, fontSize: 23 }}>{window.YANA.username ? L("Good morning, " + window.YANA.username, "Chào " + window.YANA.username) : L("Good morning", "Xin chào")}</h1>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}>
          <span className="dot on pulse"></span>{L("Calm", "Tĩnh lặng")}
        </span>
      </div>
      <div className="glass-strong" style={{ borderRadius: 16, padding: "7px 7px 7px 15px", display: "flex", alignItems: "center", gap: 9 }}>
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") begin(); }}
          placeholder={L("What should we accomplish today?", "Hôm nay ta làm gì?")}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", color: "var(--ink)" }}
        />
        <button onClick={() => begin()} aria-label="New Mission" style={{
          width: 38, height: 38, borderRadius: 12, border: "none", cursor: "pointer", flex: "none",
          background: "var(--primary)", color: "white", display: "grid", placeItems: "center",
          boxShadow: "0 4px 14px color-mix(in oklab, var(--primary) 32%, transparent)",
        }}>{Icons.spark(17)}</button>
      </div>
      <div className="hscroll" style={{ margin: 0, padding: 0 }}>
        {suggestions.map(([en, vi]) => (
          <button key={en} onClick={() => begin(en)} className="chip neutral" style={{ cursor: "pointer", fontSize: 12 }}>{L(en, vi)}</button>
        ))}
      </div>
    </div>
  );
}

function MModelRow({ m }) {
  return (
    <div className="mrow" style={{ display: "grid", gridTemplateColumns: "14px 1fr 70px 42px", alignItems: "center", gap: 11 }}>
      <span className={"dot " + (m.status === "active" ? "on" : "idle")}></span>
      <div style={{ lineHeight: 1.3, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.name} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{m.model}</span></div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.role}</div>
      </div>
      <div className="bar"><i style={{ width: m.load + "%" }}></i></div>
      <span style={{ fontSize: 11.5, color: "var(--ink-2)", textAlign: "right" }}>{m.latency}</span>
    </div>
  );
}

function MMissionRow({ m, onOpen }) {
  return (
    <button onClick={onOpen} className="mrow" style={{
      display: "grid", gridTemplateColumns: "1fr 64px 38px", alignItems: "center", gap: 11,
      width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "inherit",
      borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ lineHeight: 1.3, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{m.owner} · {L("due", "hạn")} {m.due}</div>
      </div>
      <div className="bar"><i style={{ width: m.progress + "%" }}></i></div>
      <span style={{ fontSize: 11.5, color: "var(--ink-2)", textAlign: "right" }}>{m.progress}%</span>
    </button>
  );
}

function MLake({ t, onNav }) {
  const D = window.YANA;
  const activeAgents = D.agents.filter((a) => a.status === "active");
  return (
    <div data-screen-label="Lake" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <MComposer onNav={onNav} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        <MStat label={L("Agents", "Tác nhân")} value={<>{D.stats.agentsActive}<span style={{ fontSize: 15, color: "var(--ink-3)" }}> / {D.stats.agents}</span></>} sub={L("active now", "đang hoạt động")} accent />
        <MStat label={L("Missions", "Nhiệm vụ")} value={D.stats.missionsActive} sub={L("in motion", "đang diễn ra")} />
        <MStat label={L("Skills", "Kỹ năng")} value={D.stats.skills.toLocaleString()} sub={D.stats.skillsUsedToday + L(" today", " hôm nay")} />
        <MStat label={L("Memories", "Ký ức")} value={D.stats.memories.toLocaleString()} sub={"+" + D.stats.memoriesToday + L(" today", " hôm nay")} />
      </div>

      <MCard title={L("Active AI Models", "Mô hình đang chạy")} aside={<span className="chip neutral">{D.models.length} {L("providers", "NCC")}</span>}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {D.models.length === 0 && <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{L("Loading providers…", "Đang tải nhà cung cấp…")}</span>}
          {D.models.map((m) => <MModelRow key={m.id} m={m} />)}
        </div>
      </MCard>

      {t.showMissions && (
        <MCard title={L("Missions", "Nhiệm vụ")} aside={<SeeAll label={L("Mission Center", "Trung tâm")} onClick={() => onNav("missions")} />}>
          {D.missions.filter((m) => m.status !== "recurring").slice(0, 4).map((m) => (
            <MMissionRow key={m.id} m={m} onOpen={() => { D._openMission = m.id; onNav("missions"); }} />
          ))}
        </MCard>
      )}

      {t.showAgents && (
        <MCard title={L("Running Agents", "Tác nhân đang chạy")} aside={<SeeAll label={L("Agent Space", "Tác nhân")} onClick={() => onNav("agents")} />}>
          {activeAgents.slice(0, 5).map((a) => (
            <div key={a.id} className="mrow" style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span className={"dot " + (a.status === "active" ? "on" : "idle")}></span>
              <span style={{ fontSize: 13.5, fontWeight: 500, width: 78, flex: "none" }}>{a.name}</span>
              <span style={{ fontSize: 12, color: "var(--ink-3)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.load}</span>
            </div>
          ))}
        </MCard>
      )}

      {t.showMemory && (
        <MCard title={L("Memory Garden", "Vườn ký ức")} aside={<span className="chip pink">{Icons.memory(13)} +{D.stats.memoriesToday}</span>}>
          {D.memories.filter((m) => m.fresh).slice(0, 3).map((m) => (
            <div key={m.id} className="mrow" style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span className="chip neutral" style={{ flex: "none", fontSize: 10.5 }}>{L(m.kind, { Fact: "Dữ kiện", Knowledge: "Kiến thức", Experience: "Trải nghiệm", Context: "Ngữ cảnh" }[m.kind])}</span>
              <span style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45 }}>{m.text}</span>
            </div>
          ))}
        </MCard>
      )}

      {t.showSystem && (
        <MCard title={L("System Health", "Sức khỏe hệ thống")}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "11px 14px" }}>
            {[
              [L("Safety checks", "Kiểm tra an toàn"), D.safety.checksToday.toLocaleString() + L(" today", " hôm nay")],
              [L("Blocked", "Bị chặn"), D.safety.blocked + L(" · ", " · ") + D.safety.pendingReview + L(" in review", " chờ duyệt")],
              [L("Last incident", "Sự cố gần nhất"), D.safety.lastIncident],
              [L("Uptime", "Thời gian chạy"), D.stats.uptimeDays + L(" days", " ngày")],
            ].map(([k, v]) => (
              <div key={k} style={{ lineHeight: 1.35 }}>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
        </MCard>
      )}
    </div>
  );
}

window.MLake = MLake;
