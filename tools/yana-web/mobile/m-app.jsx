// Yana Mobile — app shell, routing, tweaks wiring, language toggle
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
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
  "showMotes": true,
  "showRipple": true,
  "showGlassShine": true
}/*EDITMODE-END*/;

const THEME_MAP = {
  /* ── Light ── */
  "Jade Lake 🌿":      "jade",
  "Lotus Dawn 🌸":     "dawn",
  "Morning Mist ☁️":   "mist",
  "Glass Silver ✨":   "silver",
  "Sage Forest 🌲":    "sage",
  "Sunset Amber 🌅":   "amber",
  "Arctic Blue ❄️":    "arctic",
  "Lavender Dream 💜": "lavender",
  "iOS Rose 🌷":       "ios-rose",
  /* ── Dark ── */
  "iOS Night 🌙":      "ios-night",
  "Prism Glass 🔮":    "liquid",
  "Obsidian 🌑":       "obsidian",
  "Deep Ocean 🌊":     "ocean",
  "Midnight Navy 🌌":  "navy",
};
const DENSITY = { "Compact": 0.85, "Regular": 1, "Spacious": 1.18 };
const DARK_THEMES = new Set(["iOS Night 🌙", "Obsidian 🌑", "Deep Ocean 🌊", "Midnight Navy 🌌"]);

function applyTweaks(t) {
  const root = document.documentElement;
  root.setAttribute("data-theme", THEME_MAP[t.theme] || "jade");
  root.style.colorScheme = DARK_THEMES.has(t.theme) ? "dark" : "light";
  root.style.setProperty("--blur", t.blur / 100);
  root.style.setProperty("--alpha", t.transparency / 100);
  root.style.setProperty("--reflect", t.reflection / 100);
  root.style.setProperty("--depth", t.depth / 100);
  root.style.setProperty("--sp", DENSITY[t.layout] || 1);
  if (t.accent) {
    root.style.setProperty("--primary", t.accent);
    root.style.setProperty("--primary-soft", `color-mix(in oklab, ${t.accent} 10%, transparent)`);
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-soft");
  }
  document.body.classList.toggle("no-motes",       t.showMotes      === false);
  document.body.classList.toggle("no-ripple",      t.showRipple     === false);
  document.body.classList.toggle("no-glass-shine", t.showGlassShine === false);
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = React.useState(() => localStorage.getItem("yana.m.page") || "dashboard");
  const [more, setMore] = React.useState(false);
  const mainRef = React.useRef(null);
  window.YANA_LANG = t.language === "Tiếng Việt" ? "vi" : "en";

  // data.js hydrates window.YANA from the real APIs after mount — re-render
  // when each batch lands so the screens pick up live values
  const [, forceData] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    window.addEventListener("yana:data", forceData);
    return () => window.removeEventListener("yana:data", forceData);
  }, []);

  React.useEffect(() => applyTweaks(t), [t]);
  React.useEffect(() => localStorage.setItem("yana.m.page", page), [page]);
  // scroll the page region back to top on navigation
  React.useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [page]);

  function nav(id) { setPage(id); }
  function toggleLang() { setTweak("language", t.language === "Tiếng Việt" ? "English" : "Tiếng Việt"); }

  const isChat = page === "chat";
  const Page = {
    dashboard: () => <MLake t={t} onNav={nav} />,
    missions:  () => <MMissions />,
    chat:      () => <MChat />,
    agents:    () => <MAgents />,
    memory:    () => <MMemoryGarden />,
    skills:    () => <MSkills />,
    providers: () => <MProviders />,
    sessions:  () => <MSessions />,
    analytics: () => <MAnalytics />,
    cron:      () => <MCron />,
    "html-maker": () => <MHtmlMaker />,
    settings:  () => <MSettings t={t} setTweak={setTweak} />,
  }[page] || (() => <MLake t={t} onNav={nav} />);

  return (
    <div className="app-stage">
      <div className="app-mobile" key={t.language}>
        <TopBar page={page} lang={window.YANA_LANG} onLang={toggleLang} onMore={() => setMore(true)} />

        <main ref={mainRef} className={"mmain" + (isChat ? " flush" : "")}>
          <Page />
        </main>

        <TabBar page={page} onNav={nav} onMore={() => setMore(true)} />
        <MoreSheet open={more} page={page} onNav={nav} onClose={() => setMore(false)} />
      </div>

      <VTuber />

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

        <TweakSection label={L("Layout", "Bố cục")} />
        <TweakRadio label={L("Density", "Mật độ")} value={t.layout} options={["Compact", "Regular", "Spacious"]} onChange={(v) => setTweak("layout", v)} />

        <TweakSection label={L("Lake cards", "Thẻ Dashboard")} />
        <TweakToggle label={L("Show agents", "Hiện tác nhân")} value={t.showAgents} onChange={(v) => setTweak("showAgents", v)} />
        <TweakToggle label={L("Show missions", "Hiện nhiệm vụ")} value={t.showMissions} onChange={(v) => setTweak("showMissions", v)} />
        <TweakToggle label={L("Show Memory Garden", "Hiện vườn ký ức")} value={t.showMemory} onChange={(v) => setTweak("showMemory", v)} />
        <TweakToggle label={L("Show system status", "Hiện trạng thái hệ thống")} value={t.showSystem} onChange={(v) => setTweak("showSystem", v)} />

        <TweakSection label={L("Accent color", "Màu nhấn")} />
        <TweakColor label="" value={t.accent || "#2f7e6e"}
          options={["#2f7e6e", "#56949f", "#3a7ca5", "#7d6aa8", "#b96b80", "#b07a4f", "#b78f3d", "#6f8f5a", "#5b7282"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakButton label={L("Use theme accent", "Dùng màu theo theme")} onClick={() => setTweak("accent", "")} />

        <TweakSection label={L("Effects", "Hiệu ứng")} />
        <TweakToggle label={L("Floating motes", "Hạt nổi")} value={t.showMotes} onChange={(v) => setTweak("showMotes", v)} />
        <TweakToggle label={L("Water ripple", "Gợn nước")} value={t.showRipple} onChange={(v) => setTweak("showRipple", v)} />
        <TweakToggle label={L("Glass shine", "Ánh kính")} value={t.showGlassShine} onChange={(v) => setTweak("showGlassShine", v)} />
      </TweaksPanel>
    </div>
  );
}

/* life beneath the surface: slow drifting motes */
const MOTES = [
  { left: "12%", top: "78%", dur: "64s", delay: "0s",   dx: "60px",  dy: "-50px", peak: 0.20 },
  { left: "26%", top: "88%", dur: "82s", delay: "-20s", dx: "-45px", dy: "-70px", peak: 0.16 },
  { left: "44%", top: "72%", dur: "71s", delay: "-40s", dx: "50px",  dy: "-40px", peak: 0.18 },
  { left: "58%", top: "84%", dur: "90s", delay: "-10s", dx: "-60px", dy: "-55px", peak: 0.22 },
  { left: "72%", top: "76%", dur: "76s", delay: "-55s", dx: "40px",  dy: "-65px", peak: 0.16 },
  { left: "84%", top: "90%", dur: "68s", delay: "-30s", dx: "-50px", dy: "-45px", peak: 0.20 },
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
