// Yana AI — Dashboard (AI Control Center)
// All numbers are real: /api/status (MANIFEST), /api/dashboard (L1 memory +
// audit log + uptime), /api/usage (per-provider stats), YanaVault (keys).
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

function MissionRowMini({ m, onOpen }) {
  return (
    <button onClick={onOpen} style={{
      display: "grid", gridTemplateColumns: "1fr 90px 48px", alignItems: "center", gap: 12,
      padding: "calc(8px * var(--sp)) 0", width: "100%", textAlign: "left",
      background: "none", border: "none", cursor: "pointer", color: "inherit",
    }}>
      <div style={{ lineHeight: 1.3, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{m.owner} · {m.status}</div>
      </div>
      <div className="bar"><i style={{ width: m.progress + "%" }}></i></div>
      <span style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "right" }}>{m.progress}%</span>
    </button>
  );
}

function EmptyHint({ text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(8px * var(--sp)) 0" }}>
      <span className="dot idle" style={{ flex: "none" }}></span>
      <span style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}

function fmtAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins + L(" min ago", " phút trước");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + L(" h ago", " giờ trước");
  return Math.floor(hours / 24) + L(" days ago", " ngày trước");
}

function fmtUptime(s) {
  if (s < 3600) return Math.floor(s / 60) + L(" min", " phút");
  if (s < 86400) return (s / 3600).toFixed(1) + L(" h", " giờ");
  return (s / 86400).toFixed(1) + L(" days", " ngày");
}

/* ---------- Local time + weather (browser timezone = wherever you are) ----- */
function greetingFor(hour, name) {
  const who = name ? ", " + name : "";
  if (hour >= 5  && hour < 12) return L("Good morning" + who,   "Chào buổi sáng" + who);
  if (hour >= 12 && hour < 18) return L("Good afternoon" + who, "Chào buổi chiều" + who);
  if (hour >= 18 && hour < 22) return L("Good evening" + who,   "Chào buổi tối" + who);
  return L("Up late" + who, "Khuya rồi" + who);
}

// WMO weather codes → emoji + label (open-meteo current.weather_code)
function describeWeather(code) {
  if (code === 0)              return ["☀️", L("Clear", "Quang đãng")];
  if (code <= 2)               return ["⛅", L("Partly cloudy", "Ít mây")];
  if (code === 3)              return ["☁️", L("Overcast", "Nhiều mây")];
  if (code === 45 || code === 48) return ["🌫️", L("Fog", "Sương mù")];
  if (code <= 57)              return ["🌦️", L("Drizzle", "Mưa phùn")];
  if (code <= 67)              return ["🌧️", L("Rain", "Mưa")];
  if (code <= 77)              return ["🌨️", L("Snow", "Tuyết")];
  if (code <= 82)              return ["🌧️", L("Showers", "Mưa rào")];
  if (code <= 86)              return ["🌨️", L("Snow showers", "Mưa tuyết")];
  return ["⛈️", L("Thunderstorm", "Dông bão")];
}

function useLocalWeather() {
  const [weather, setWeather] = React.useState(null);
  React.useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        fetch("https://api.open-meteo.com/v1/forecast?latitude=" + latitude.toFixed(3) +
              "&longitude=" + longitude.toFixed(3) + "&current=temperature_2m,weather_code&timezone=auto")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d && d.current) setWeather(d.current); })
          .catch(() => {});
      },
      () => {},            // permission denied → no widget, no nagging
      { timeout: 10000, maximumAge: 30 * 60 * 1000 }
    );
  }, []);
  return weather;
}

/* ---------- The heart of Yana: the mission composer ---------- */
function MissionComposer({ onNav, missionCount }) {
  const D = window.YANA;
  const [v, setV] = React.useState("");
  const [account, setAccount] = React.useState(null);
  const [now, setNow] = React.useState(() => new Date());
  const weather = useLocalWeather();

  React.useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setAccount(d.username || null))
      .catch(() => {});
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const suggestions = [
    ["Ship v0.9 safely", "Phát hành v0.9 an toàn"],
    ["Summarize what changed overnight", "Tóm tắt thay đổi qua đêm"],
    ["Prune stale memories", "Dọn ký ức cũ"],
  ];

  async function begin(text) {
    const goal = (text || v).trim();
    if (!goal) return;
    try {
      const r = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: goal }),
      });
      if (r.ok) {
        const { mission } = await r.json();
        D._openMission = mission.id;
      }
    } catch (_) {}
    onNav("missions");
  }

  const connectedN = D.providers.filter((p) => YanaVault.hasKey(p.id)).length;

  return (
    <div style={{ maxWidth: 660, margin: "0 auto", padding: "calc(34px * var(--sp)) 0 calc(40px * var(--sp))", textAlign: "center" }}>
      <h1 className="h-display" style={{ margin: "0 0 18px", fontSize: 30 }}>{greetingFor(now.getHours(), account)}</h1>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 22, fontSize: 12.5, color: "var(--ink-3)", flexWrap: "wrap" }}>
        <span className="dot on pulse"></span>
        <span>{L("Lake status:", "Trạng thái hồ:")} <b style={{ fontWeight: 500, color: "var(--ink-2)" }}>{L("Calm", "Tĩnh lặng")}</b></span>
        <span style={{ opacity: .5 }}>·</span>
        <span>{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        {weather && <span style={{ opacity: .5 }}>·</span>}
        {weather && (
          <span title={describeWeather(weather.weather_code)[1]}>
            {describeWeather(weather.weather_code)[0]} {Math.round(weather.temperature_2m)}°C
          </span>
        )}
        <span style={{ opacity: .5 }}>·</span>
        <span>{connectedN} {L("providers connected", "nhà cung cấp đã kết nối")}</span>
        <span style={{ opacity: .5 }}>·</span>
        <span>{missionCount} {L("missions running", "nhiệm vụ đang chạy")}</span>
      </div>
    </div>
  );
}

function Dashboard({ t, onNav }) {
  const D = window.YANA;
  const [dash, setDash]   = React.useState(null);
  const [usage, setUsage] = React.useState(null);
  const [missions, setMissions] = React.useState([]);

  React.useEffect(() => {
    fetch("/api/dashboard").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setDash(d); }).catch(() => {});
    fetch("/api/usage").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setUsage(d.usage); }).catch(() => {});
    fetch("/api/missions").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setMissions(d.missions); }).catch(() => {});
  }, []);

  const connected = D.providers.filter((p) => YanaVault.hasKey(p.id));
  const totalTok  = connected.reduce((s, p) => s + ((usage && usage[p.id] && usage[p.id].est_tokens) || 0), 0);
  const liveModels = connected.map((p) => {
    const u = usage && usage[p.id];
    return {
      id: p.id, name: p.name, model: p.models[0], role: p.role,
      status:  u && u.requests > 0 ? "active" : "idle",
      load:    totalTok > 0 && u ? Math.round((u.est_tokens / totalTok) * 100) : 0,
      latency: u && u.avg_latency_ms ? (u.avg_latency_ms / 1000).toFixed(1) + "s" : "—",
    };
  });
  const mem    = dash && dash.memories;
  const safety = dash && dash.safety;

  return (
    <div data-screen-label="Lake">
      <MissionComposer onNav={onNav} missionCount={missions.filter((m) => m.status !== "done").length} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap)", marginBottom: "var(--gap)" }}>
        <StatTile label={L("Agents", "Tác nhân")} value={D.stats.agents || "—"} sub={L("in catalog", "trong danh mục")} accent />
        <StatTile label={L("Skills", "Kỹ năng")} value={(D.stats.skills || 0).toLocaleString()} sub={L("indexed & callable", "đã lập chỉ mục")} />
        <StatTile label={L("Missions", "Nhiệm vụ")} value={missions.filter((m) => m.status !== "done").length} sub={L("in motion", "đang diễn ra")} />
        <StatTile label={L("Memories", "Ký ức")} value={mem ? mem.total : "—"} sub={mem ? "+" + mem.today + L(" today", " hôm nay") : L("L1 atomic facts", "L1 atomic facts")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: "var(--gap)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
          <Card title={L("Active AI Models", "Mô hình AI đang hoạt động")} aside={<span className="chip neutral">{connected.length} {L("providers", "nhà cung cấp")}</span>}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {liveModels.length
                ? liveModels.map((m) => <ModelRow key={m.id} m={m} />)
                : <EmptyHint text={L("No providers connected — add an API key in Providers.", "Chưa kết nối nhà cung cấp — thêm API key ở mục Nhà cung cấp.")} />}
            </div>
          </Card>

          {t.showMissions && (
            <Card title={L("Missions", "Nhiệm vụ")} aside={
              <button onClick={() => onNav("missions")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 2 }}>
                {L("Mission Center", "Trung tâm nhiệm vụ")} {Icons.chevron(13)}
              </button>
            }>
              {missions.length
                ? missions.slice(0, 4).map((m) => <MissionRowMini key={m.id} m={m} onOpen={() => { window.YANA._openMission = m.id; onNav("missions"); }} />)
                : <EmptyHint text={L("No missions yet — start one above.", "Chưa có nhiệm vụ — bắt đầu một nhiệm vụ ở trên.")} />}
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
              <EmptyHint text={L("No agents running — agents start when a mission dispatches.", "Chưa có tác nhân nào chạy — tác nhân khởi động khi nhiệm vụ được giao.")} />
            </Card>
          )}

          {t.showMemory && (
            <Card title={L("Memory Garden", "Vườn ký ức")} aside={<span className="chip pink">{Icons.memory(13)} {mem ? "+" + mem.today : "—"} {L("today", "hôm nay")}</span>}>
              {mem && mem.recent.length
                ? mem.recent.map((m, i) => (
                    <div key={i} style={{ padding: "calc(7px * var(--sp)) 0", display: "flex", gap: 10, alignItems: "baseline" }}>
                      <span className="chip neutral" style={{ flex: "none", fontSize: 11 }}>{m.kind}</span>
                      <span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>{m.text}</span>
                    </div>
                  ))
                : <EmptyHint text={L("No memories yet.", "Chưa có ký ức nào.")} />}
            </Card>
          )}

          {t.showSystem && (
            <Card title={L("System Health", "Sức khỏe hệ thống")}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  [L("Audit events", "Sự kiện audit"), safety ? safety.events_today + L(" today", " hôm nay") : "—"],
                  [L("Blocked actions", "Hành động bị chặn"), safety ? String(safety.blocked_today) : "—"],
                  [L("Last incident", "Sự cố gần nhất"), safety ? (safety.last_incident ? fmtAgo(safety.last_incident) : L("None recorded", "Chưa ghi nhận")) : "—"],
                  [L("Server uptime", "Uptime máy chủ"), dash ? fmtUptime(dash.uptime_s) : "—"],
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
