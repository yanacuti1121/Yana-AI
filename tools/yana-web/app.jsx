// Yana AI — app shell, routing, tweaks wiring

/* ---------- MemoryGarden stub ---------- */
function MemoryGarden() {
  const D = window.YANA;
  const kinds = ["All", "Fact", "Knowledge", "Experience", "Context"];
  const [filter, setFilter] = React.useState("All");
  const visible = filter === "All" ? D.memories : D.memories.filter((m) => m.kind === filter);
  return (
    <div data-screen-label="Memory Garden">
      <PageHeader
        title={L("Memory Garden", "Vườn ký ức")}
        sub={D.stats.memories.toLocaleString() + L(" memories · +" + D.stats.memoriesToday + " today", " ký ức · +" + D.stats.memoriesToday + " hôm nay")}>
        <div style={{ display: "flex", gap: 6 }}>
          {kinds.map((k) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              padding: "5px 13px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12.5,
              fontWeight: filter === k ? 500 : 400,
              background: filter === k ? "var(--primary)" : "rgba(var(--shadow-rgb), .08)",
              color: filter === k ? "white" : "var(--ink-2)",
              transition: "background .15s",
            }}>{k}</button>
          ))}
        </div>
      </PageHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 800 }}>
        {visible.map((m) => (
          <div key={m.id} className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", gap: 14 }}>
            <div style={{ flex: "none", paddingTop: 2 }}>
              <span style={{ color: m.pinned ? "var(--gold)" : "var(--pink)" }}>
                {m.pinned ? Icons.pin(16) : Icons.memory(16)}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span className="chip neutral" style={{ fontSize: 11 }}>{m.kind}</span>
                {m.pinned && <span className="chip gold" style={{ fontSize: 10.5 }}>Pinned</span>}
                {m.fresh && <span className="chip" style={{ fontSize: 10.5, color: "var(--good)" }}>Fresh</span>}
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)" }}>{m.text}</p>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 7 }}>{m.source}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Skills stub ---------- */
function Skills() {
  const D = window.YANA;
  const total = D.skillCategories.reduce((s, c) => s + c.count, 0);
  return (
    <div data-screen-label="Skills">
      <PageHeader
        title={L("Skills", "Kỹ năng")}
        sub={total.toLocaleString() + L(" skills across " + D.skillCategories.length + " categories · " + D.stats.skillsUsedToday + " used today",
          " kỹ năng trong " + D.skillCategories.length + " danh mục · " + D.stats.skillsUsedToday + " dùng hôm nay")}>
        <button style={{
          display: "flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 99,
          border: "none", cursor: "pointer", background: "var(--primary)", color: "white",
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
        }}>{Icons.plus(15)} {L("New skill", "Kỹ năng mới")}</button>
      </PageHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "var(--gap)" }}>
        {D.skillCategories.map((c) => (
          <div key={c.name} className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14.5, fontWeight: 500 }}>{c.name}</span>
              <span className="chip neutral" style={{ fontSize: 11.5 }}>{c.count.toLocaleString()}</span>
            </div>
            <div className="bar" style={{ height: 4 }}>
              <i style={{ width: Math.round(c.usage / D.stats.skillsUsedToday * 100) + "%" }}></i>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", display: "flex", justifyContent: "space-between" }}>
              <span>{c.usage} {L("uses today", "lượt dùng hôm nay")}</span>
              <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>{c.top}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- App shell ---------- */
const TWEAK_DEFAULTS = {
  "theme": "Jade Lake 🌿",
  "language": "English",
  "blur": 70,
  "transparency": 60,
  "reflection": 70,
  "depth": 55,
  "layout": "Regular",
  "showAgents": true,
  "showMissions": true,
  "showMemory": true,
  "showSystem": true,
  "accent": ""
};

const THEME_MAP = {
  "Lotus Dawn 🌸": "dawn",
  "Jade Lake 🌿": "jade",
  "Morning Mist ☁️": "mist",
  "Glass Silver ✨": "silver",
};
const DENSITY = { "Compact": 0.85, "Regular": 1, "Spacious": 1.18 };

function applyTweaks(t) {
  const root = document.documentElement;
  root.setAttribute("data-theme", THEME_MAP[t.theme] || "jade");
  root.style.setProperty("--blur", t.blur / 100);
  root.style.setProperty("--alpha", t.transparency / 100);
  root.style.setProperty("--reflect", t.reflection / 100);
  root.style.setProperty("--depth", t.depth / 100);
  root.style.setProperty("--sp", DENSITY[t.layout] || 1);
  if (t.accent) {
    root.style.setProperty("--primary", t.accent);
    root.style.setProperty("--primary-soft", "color-mix(in oklab, " + t.accent + " 10%, transparent)");
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-soft");
  }
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = React.useState(() => localStorage.getItem("yana.page") || "dashboard");
  window.YANA_LANG = t.language === "Tiếng Việt" ? "vi" : "en";

  React.useEffect(() => applyTweaks(t), [t]);
  React.useEffect(() => localStorage.setItem("yana.page", page), [page]);

  const Page = {
    dashboard: () => <Dashboard t={t} onNav={setPage} />,
    chat: () => <Chat t={t} />,
    agents: () => <AgentSpace />,
    missions: () => <MissionCenter />,
    memory: () => <MemoryGarden />,
    skills: () => <Skills />,
    providers: () => <Providers />,
    settings: () => <Settings t={t} setTweak={setTweak} />,
  }[page] || (() => <Dashboard t={t} onNav={setPage} />);

  return (
    <div key={t.language} style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", gap: "var(--gap)", padding: "calc(16px * var(--sp))" }}>
      <Sidebar page={page} onNav={setPage} />
      <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: page === "chat" ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Page />
        </div>
      </main>

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakSelect label="Direction" value={t.theme}
          options={Object.keys(THEME_MAP)}
          onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label="Language" value={t.language}
          options={["English", "Tiếng Việt"]}
          onChange={(v) => setTweak("language", v)} />

        <TweakSection label="Glass" />
        <TweakSlider label="Blur strength" value={t.blur} min={0} max={100} unit="%" onChange={(v) => setTweak("blur", v)} />
        <TweakSlider label="Transparency" value={t.transparency} min={0} max={100} unit="%" onChange={(v) => setTweak("transparency", v)} />
        <TweakSlider label="Reflection" value={t.reflection} min={0} max={100} unit="%" onChange={(v) => setTweak("reflection", v)} />
        <TweakSlider label="Depth" value={t.depth} min={0} max={100} unit="%" onChange={(v) => setTweak("depth", v)} />

        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.layout} options={["Compact", "Regular", "Spacious"]} onChange={(v) => setTweak("layout", v)} />

        <TweakSection label="AI Control Center" />
        <TweakToggle label="Show agents" value={t.showAgents} onChange={(v) => setTweak("showAgents", v)} />
        <TweakToggle label="Show missions" value={t.showMissions} onChange={(v) => setTweak("showMissions", v)} />
        <TweakToggle label="Show Memory Garden" value={t.showMemory} onChange={(v) => setTweak("showMemory", v)} />
        <TweakToggle label="Show system status" value={t.showSystem} onChange={(v) => setTweak("showSystem", v)} />

        <TweakSection label="Visual style" />
        <TweakColor label="Accent" value={t.accent || "#2f7e6e"}
          options={["#2f7e6e", "#56949f", "#3a7ca5", "#7d6aa8", "#b96b80", "#b07a4f", "#b78f3d", "#6f8f5a", "#5b7282"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakButton label="Use theme accent" onClick={() => setTweak("accent", "")} />
      </TweaksPanel>
    </div>
  );
}

/* ---------- Undercurrent: slow drifting motes ---------- */
const MOTES = [
  { left: "12%", top: "78%", dur: "64s", delay: "0s",   dx: "60px",  dy: "-50px", peak: 0.20 },
  { left: "26%", top: "88%", dur: "82s", delay: "-20s", dx: "-45px", dy: "-70px", peak: 0.16 },
  { left: "44%", top: "72%", dur: "71s", delay: "-40s", dx: "50px",  dy: "-40px", peak: 0.18 },
  { left: "58%", top: "84%", dur: "90s", delay: "-10s", dx: "-60px", dy: "-55px", peak: 0.22 },
  { left: "72%", top: "76%", dur: "76s", delay: "-55s", dx: "40px",  dy: "-65px", peak: 0.16 },
  { left: "84%", top: "90%", dur: "68s", delay: "-30s", dx: "-50px", dy: "-45px", peak: 0.20 },
  { left: "35%", top: "94%", dur: "86s", delay: "-65s", dx: "55px",  dy: "-60px", peak: 0.14 },
  { left: "92%", top: "68%", dur: "79s", delay: "-48s", dx: "-35px", dy: "-50px", peak: 0.14 },
];

function Undercurrent() {
  return (
    <div className="scene">
      {MOTES.map((m, i) => (
        <span key={i} className="mote" style={{
          left: m.left, top: m.top,
          "--dur": m.dur, "--delay": m.delay, "--dx": m.dx, "--dy": m.dy, "--peak": m.peak,
        }}></span>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    <Undercurrent />
    <App />
  </>
);
