// Yana AI — app shell, routing, tweaks wiring

/* ---------- Memory Garden — real L1 atomic facts via /api/memories ---------- */
function MemoryGarden() {
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
        title={L("Memory Garden", "Vườn ký ức")}
        sub={data
          ? data.total + L(" L1 atomic facts · persisted in memory/L1_atomic", " fact L1 · lưu tại memory/L1_atomic")
          : L("Loading memories…", "Đang tải ký ức…")}>
        <div style={{ display: "flex", gap: 6 }}>
          {kinds.map((k) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              padding: "5px 13px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12.5,
              fontWeight: filter === k ? 500 : 400,
              background: filter === k ? "var(--primary)" : "rgba(var(--shadow-rgb), .08)",
              color: filter === k ? "white" : "var(--ink-2)",
              transition: "background .15s",
            }}>{k === "all" ? L("All", "Tất cả") : k}</button>
          ))}
        </div>
      </PageHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 800 }}>
        {data && visible.length === 0 && (
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{L("No memories yet.", "Chưa có ký ức nào.")}</div>
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
                {m.fresh && <span className="chip" style={{ fontSize: 10.5, color: "var(--good)" }}>{L("Fresh", "Mới")}</span>}
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

/* ---------- Skills — real counts via /api/skills (core/skills on disk) ---------- */
function Skills() {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/skills")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {});
  }, []);

  const groups = data
    ? [{ name: L("core (standalone)", "lõi (độc lập)"), count: data.standalone }, ...data.packs]
    : [];

  return (
    <div data-screen-label="Skills">
      <PageHeader
        title={L("Skills", "Kỹ năng")}
        sub={data
          ? data.total.toLocaleString() + L(" skills on disk · " + data.pack_count + " imported packs", " kỹ năng trên đĩa · " + data.pack_count + " gói đã nhập")
          : L("Counting skills…", "Đang đếm kỹ năng…")} />
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
              {Math.round(c.count / data.total * 100)}% {L("of catalog", "danh mục")}
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
  "accent": "",
  "showVTuber": true,
  "showMotes": true,
  "showRipple": true,
  "showWater": true,
  "showGlassShine": true,
};

const THEME_MAP = {
  /* ── Light ── */
  "Jade Lake 🌿":    "jade",
  "Lotus Dawn 🌸":   "dawn",
  "Morning Mist ☁️": "mist",
  "Glass Silver ✨":  "silver",
  "Sage Forest 🌲":  "sage",
  "Sunset Amber 🌅": "amber",
  "Arctic Blue ❄️":  "arctic",
  "Lavender Dream 💜": "lavender",
  "iOS Rose 🌷":     "ios-rose",
  /* ── Dark ── */
  "iOS Night 🌙":    "ios-night",
  "Prism Glass 🔮":  "liquid",
  "Obsidian 🌑":     "obsidian",
  "Deep Ocean 🌊":   "ocean",
  "Midnight Navy 🌌":"navy",
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
  const spd = (t.glassSpeed ?? 100) / 100;
  root.style.setProperty("--shine-dur", spd > 0 ? (11 / spd).toFixed(2) + "s" : "0s");
  root.style.setProperty("--anim-speed", spd.toFixed(3));
  // Effects
  document.body.classList.toggle("no-motes",       t.showMotes      === false);
  document.body.classList.toggle("no-ripple",      t.showRipple     === false);
  document.body.classList.toggle("no-glass-shine", t.showGlassShine === false);
  document.body.classList.toggle("no-water",       t.showWater      === false);
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
    sessions:  () => <Sessions />,
    analytics: () => <Analytics />,
    cron:      () => <Cron />,
    memory: () => <MemoryGarden />,
    skills: () => <Skills />,
    providers:    () => <Providers />,
    "html-maker": () => <HtmlMaker />,
    settings:     () => <Settings t={t} setTweak={setTweak} />,
    codexmate:    () => <CodemateTool />,
  }[page] || (() => <Dashboard t={t} onNav={setPage} />);

  return (
    <div key={t.language} className="yana-app" style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", gap: "var(--gap)" }}>
      <Sidebar page={page} onNav={setPage} />
      <main className="yana-main" style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: page === "chat" ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <Page />
        </div>
      </main>

      {t.showVTuber !== false && <VTuber />}

      <TweaksPanel>
        <TweakSection label={L("Theme", "Giao diện")} />
        <TweakSelect label={L("Preset", "Mẫu")} value={t.theme}
          options={Object.keys(THEME_MAP)}
          onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label={L("Language", "Ngôn ngữ")} value={t.language}
          options={["English", "Tiếng Việt"]}
          onChange={(v) => setTweak("language", v)} />

        <TweakSection label={L("Glass", "Kính")} />
        <TweakSlider label={L("Blur", "Mờ")} value={t.blur} min={0} max={100} unit="%" onChange={(v) => setTweak("blur", v)} />
        <TweakSlider label={L("Transparency", "Trong suốt")} value={t.transparency} min={0} max={100} unit="%" onChange={(v) => setTweak("transparency", v)} />
        <TweakSlider label={L("Reflection", "Phản chiếu")} value={t.reflection} min={0} max={100} unit="%" onChange={(v) => setTweak("reflection", v)} />
        <TweakSlider label={L("Depth", "Chiều sâu")} value={t.depth} min={0} max={100} unit="%" onChange={(v) => setTweak("depth", v)} />

        <TweakSection label={L("Effects", "Hiệu ứng")} />
        <TweakToggle label={L("Yana companion", "Nhân vật Yana")} value={t.showVTuber !== false} onChange={(v) => setTweak("showVTuber", v)} />
        <TweakToggle label={L("Floating motes", "Hạt nổi")} value={t.showMotes !== false} onChange={(v) => setTweak("showMotes", v)} />
        <TweakToggle label={L("Water ripple", "Gợn nước")} value={t.showRipple !== false} onChange={(v) => setTweak("showRipple", v)} />
        <TweakToggle label={L("Canvas waves", "Sóng canvas")} value={t.showWater !== false} onChange={(v) => setTweak("showWater", v)} />
        <TweakToggle label={L("Glass shine", "Ánh kính")} value={t.showGlassShine !== false} onChange={(v) => setTweak("showGlassShine", v)} />

        <TweakSection label={L("Layout", "Bố cục")} />
        <TweakRadio label={L("Density", "Mật độ")} value={t.layout} options={["Compact", "Regular", "Spacious"]} onChange={(v) => setTweak("layout", v)} />

        <TweakSection label={L("AI panels", "Bảng AI")} />
        <TweakToggle label={L("Agents", "Tác nhân")} value={t.showAgents} onChange={(v) => setTweak("showAgents", v)} />
        <TweakToggle label={L("Missions", "Nhiệm vụ")} value={t.showMissions} onChange={(v) => setTweak("showMissions", v)} />
        <TweakToggle label={L("Memory Garden", "Vườn ký ức")} value={t.showMemory} onChange={(v) => setTweak("showMemory", v)} />
        <TweakToggle label={L("System status", "Trạng thái hệ thống")} value={t.showSystem} onChange={(v) => setTweak("showSystem", v)} />

        <TweakSection label={L("Accent color", "Màu nhấn")} />
        <TweakColor label="" value={t.accent || "#2f7e6e"}
          options={["#2f7e6e","#5a8a50","#1a7eb0","#7c5cbf","#b96b80","#c97c18","#3a7ca5","#c06050","#56949f","#6f8f5a"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakButton label={L("Use theme accent", "Dùng màu theo theme")} onClick={() => setTweak("accent", "")} />

        <TweakSection label={L("Animation", "Hoạt ảnh")} />
        <TweakSlider label={L("Glass speed", "Tốc độ kính")} value={t.glassSpeed ?? 100} min={0} max={200} unit="%" onChange={(v) => setTweak("glassSpeed", v)} />

        <TweakSection label={L("Reset", "Đặt lại")} />
        <TweakButton label={L("↺ Restore defaults", "↺ Khôi phục mặc định")} secondary onClick={() => setTweak(TWEAK_DEFAULTS)} />
      </TweaksPanel>

    </div>
  );
}

/* ---------- Undercurrent: living lake surface ---------- */
// Primary green motes (main)
const MOTES = [
  { left: "12%", top: "78%", dur: "64s", delay: "0s",   dx: "60px",  dy: "-50px", peak: 0.20 },
  { left: "26%", top: "88%", dur: "82s", delay: "-20s", dx: "-45px", dy: "-70px", peak: 0.16 },
  { left: "44%", top: "72%", dur: "71s", delay: "-40s", dx: "50px",  dy: "-40px", peak: 0.18 },
  { left: "58%", top: "84%", dur: "90s", delay: "-10s", dx: "-60px", dy: "-55px", peak: 0.22 },
  { left: "72%", top: "76%", dur: "76s", delay: "-55s", dx: "40px",  dy: "-65px", peak: 0.16 },
  { left: "84%", top: "90%", dur: "68s", delay: "-30s", dx: "-50px", dy: "-45px", peak: 0.20 },
  { left: "35%", top: "94%", dur: "86s", delay: "-65s", dx: "55px",  dy: "-60px", peak: 0.14 },
  { left: "92%", top: "68%", dur: "79s", delay: "-48s", dx: "-35px", dy: "-50px", peak: 0.14 },
  { left: "6%",  top: "82%", dur: "73s", delay: "-38s", dx: "45px",  dy: "-55px", peak: 0.13 },
  { left: "54%", top: "92%", dur: "88s", delay: "-72s", dx: "-40px", dy: "-62px", peak: 0.15 },
];
// Larger, softer motes
const MOTES_LG = [
  { left: "18%", top: "85%", dur: "95s", delay: "-15s", dx: "55px",  dy: "-45px", peak: 0.12 },
  { left: "62%", top: "79%", dur:"108s", delay: "-50s", dx: "-50px", dy: "-60px", peak: 0.10 },
  { left: "88%", top: "88%", dur: "92s", delay: "-70s", dx: "40px",  dy: "-50px", peak: 0.11 },
];
// Small gold pollen motes
const MOTES_SM = [
  { left: "8%",  top: "70%", dur: "48s", delay: "0s",   dx: "35px",  dy: "-45px", peak: 0.28 },
  { left: "30%", top: "80%", dur: "57s", delay: "-18s", dx: "-30px", dy: "-55px", peak: 0.24 },
  { left: "52%", top: "74%", dur: "44s", delay: "-35s", dx: "40px",  dy: "-40px", peak: 0.26 },
  { left: "76%", top: "82%", dur: "61s", delay: "-27s", dx: "-35px", dy: "-48px", peak: 0.22 },
  { left: "94%", top: "72%", dur: "51s", delay: "-44s", dx: "25px",  dy: "-50px", peak: 0.20 },
  { left: "20%", top: "92%", dur: "55s", delay: "-60s", dx: "45px",  dy: "-42px", peak: 0.18 },
];
// Pink lotus-blush motes
const MOTES_PINK = [
  { left: "38%", top: "86%", dur: "80s", delay: "-8s",  dx: "-55px", dy: "-60px", peak: 0.16 },
  { left: "68%", top: "90%", dur: "74s", delay: "-45s", dx: "48px",  dy: "-52px", peak: 0.14 },
  { left: "82%", top: "76%", dur: "86s", delay: "-62s", dx: "-42px", dy: "-48px", peak: 0.13 },
];

function Undercurrent() {
  const css = function(m) {
    return { left: m.left, top: m.top, "--dur": m.dur, "--delay": m.delay, "--dx": m.dx, "--dy": m.dy, "--peak": m.peak };
  };
  return (
    <div className="scene">
      {/* layer 1: breathing light swell */}
      <div className="scene-swell" />
      {/* layer 2: caustic shimmer patches */}
      <div className="scene-caustics" />
      {/* layer 3: horizontal sliding shimmer band */}
      <div className="scene-shimmer" />
      {/* layer 4: lotus / lily-pad blob shadows deep in the water */}
      <div className="scene-lotus" />
      {/* motes — four varieties */}
      {MOTES.map((m, i)      => <span key={"m"+i}  className="mote"      style={css(m)} />)}
      {MOTES_LG.map((m, i)   => <span key={"lg"+i} className="mote-lg"   style={css(m)} />)}
      {MOTES_SM.map((m, i)   => <span key={"sm"+i} className="mote-sm"   style={css(m)} />)}
      {MOTES_PINK.map((m, i) => <span key={"pk"+i} className="mote-pink" style={css(m)} />)}
    </div>
  );
}

// Render only after the key vault has decrypted into its in-memory cache —
// otherwise ProviderCard/Chat would see an empty vault on first paint.
YanaVault.ready.then(() => ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    <Undercurrent />
    <App />
  </>
));
