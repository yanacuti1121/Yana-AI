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
  "accent": ""
}/*EDITMODE-END*/;

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
    root.style.setProperty("--primary-soft", `color-mix(in oklab, ${t.accent} 10%, transparent)`);
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-soft");
  }
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = React.useState(() => localStorage.getItem("yana.m.page") || "dashboard");
  const [more, setMore] = React.useState(false);
  const mainRef = React.useRef(null);
  window.YANA_LANG = t.language === "Tiếng Việt" ? "vi" : "en";

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

        <TweakSection label="Lake cards" />
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
