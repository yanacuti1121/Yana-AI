// Yana AI — Providers + Settings
function ProviderCard({ p }) {
  const connected = p.status === "connected";
  const storageKey = "yana.key." + p.id;
  const [hasKey, setHasKey] = React.useState(() => !!localStorage.getItem(storageKey));

  function promptKey() {
    const current = localStorage.getItem(storageKey) || "";
    const raw = window.prompt("API key for " + p.name + " (leave blank to clear):", current);
    if (raw === null) return; // cancelled
    const trimmed = raw.trim();
    if (trimmed) {
      localStorage.setItem(storageKey, trimmed);
      setHasKey(true);
    } else {
      localStorage.removeItem(storageKey);
      setHasKey(false);
    }
  }

  const keyDisplay = hasKey
    ? localStorage.getItem(storageKey).slice(0, 8) + "····"
    : (p.key || "—");

  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 13, flex: "none", display: "grid", placeItems: "center",
          fontSize: 15, fontWeight: 500, color: "var(--primary)",
          background: "var(--primary-soft)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5)",
        }}>{p.name[0]}</div>
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 500 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.company}</div>
        </div>
        <span className={"chip " + (connected ? "" : "gold")} style={{ marginLeft: "auto", fontSize: 11.5 }}>
          <span className={"dot " + (connected ? "on" : "idle")} style={{ width: 6, height: 6, boxShadow: "none" }}></span>
          {connected ? "Connected" : "Standby"}
        </span>
      </div>

      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{p.role}</div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {p.models.map((m) => <span key={m} className="chip neutral" style={{ fontSize: 11 }}>{m}</span>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        {[["Usage", p.usage], ["Latency", p.latency]].map(([k, v]) => (
          <div key={k} style={{ lineHeight: 1.35, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{k}</div>
            <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
          </div>
        ))}
        <div style={{ lineHeight: 1.35, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Key</div>
          <button onClick={promptKey} title="Click to set API key" style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontSize: 12, fontWeight: 500, color: hasKey ? "var(--good)" : "var(--primary)",
            display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit",
          }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 }}>
              {keyDisplay}
            </span>
            <span style={{ fontSize: 10, opacity: .6 }}>✎</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Providers() {
  const D = window.YANA;
  const connected = D.providers.filter((p) => p.status === "connected").length;
  return (
    <div data-screen-label="Providers">
      <PageHeader title="Providers" sub={connected + " of " + D.providers.length + " providers connected · Groq routes, YAMTAM supervises every call"}>
        <button style={{
          display: "flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 99,
          border: "none", cursor: "pointer", background: "var(--primary)", color: "white",
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
        }}>{Icons.plus(15)} Connect provider</button>
      </PageHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--gap)" }}>
        {D.providers.map((p) => <ProviderCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}

/* ---------- Settings ---------- */
function SettingRow({ label, desc, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{desc}</div>}
      </div>
      <span className="chip neutral" style={{ flex: "none" }}>{value}</span>
    </div>
  );
}

/* ---------- Settings: Appearance (Apple-style) ---------- */
const THEME_PREVIEWS = [
  { label: "Lotus Dawn 🌸",  accent: "#b96b80", sky: "linear-gradient(160deg, #faf5f3 30%, #f2dfdc 100%)", wash: "rgba(236,196,134,.45)" },
  { label: "Jade Lake 🌿",   accent: "#2f7e6e", sky: "linear-gradient(160deg, #f6faf7 30%, #ddeee7 100%)", wash: "rgba(122,184,168,.40)" },
  { label: "Morning Mist ☁️", accent: "#4a7a6a", sky: "linear-gradient(160deg, #f8f7f4 30%, #ecebe5 100%)", wash: "rgba(214,222,214,.55)" },
  { label: "Glass Silver ✨", accent: "#3a7ca5", sky: "linear-gradient(160deg, #f3f6fa 30%, #dde6ef 100%)", wash: "rgba(168,199,224,.45)" },
];

function ThemeCard({ p, active, onPick }) {
  return (
    <button onClick={onPick} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "center", color: "inherit" }}>
      <div style={{
        width: 118, height: 72, borderRadius: 12, background: p.sky, position: "relative", overflow: "hidden",
        boxShadow: active
          ? "0 0 0 2px var(--bg-base), 0 0 0 4px " + p.accent
          : "inset 0 0 0 1px var(--border)",
        transition: "box-shadow .15s",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(80px 40px at 80% 100%, " + p.wash + ", transparent 70%)" }}></div>
        <div style={{ position: "absolute", left: 8, top: 8, bottom: 8, width: 26, borderRadius: 6, background: "rgba(255,255,255,.65)", boxShadow: "inset 0 0 0 .5px rgba(255,255,255,.8)" }}></div>
        <div style={{ position: "absolute", left: 40, top: 8, right: 8, height: 22, borderRadius: 6, background: "rgba(255,255,255,.6)" }}></div>
        <div style={{ position: "absolute", left: 40, top: 34, width: 34, height: 30, borderRadius: 6, background: "rgba(255,255,255,.5)" }}></div>
        <div style={{ position: "absolute", left: 80, top: 34, right: 8, height: 30, borderRadius: 6, background: "rgba(255,255,255,.5)" }}></div>
        <div style={{ position: "absolute", left: 13, top: 13, width: 10, height: 10, borderRadius: 4, background: p.accent, opacity: .9 }}></div>
      </div>
      <div style={{ fontSize: 12, marginTop: 7, fontWeight: active ? 500 : 400, color: active ? "var(--ink)" : "var(--ink-2)" }}>{p.label}</div>
    </button>
  );
}

function YSwitch({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} aria-pressed={value} style={{
      width: 40, height: 24, borderRadius: 99, border: "none", cursor: "pointer", flex: "none",
      background: value ? "var(--primary)" : "rgba(var(--shadow-rgb), .15)",
      position: "relative", transition: "background .18s",
    }}>
      <span style={{
        position: "absolute", top: 2, left: value ? 18 : 2, width: 20, height: 20, borderRadius: "50%",
        background: "white", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left .18s",
      }}></span>
    </button>
  );
}

function YSeg({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "rgba(var(--shadow-rgb), .07)" }}>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} style={{
          padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5,
          fontWeight: value === o ? 500 : 400,
          background: value === o ? "rgba(var(--surface-rgb), .95)" : "transparent",
          boxShadow: value === o ? "0 1px 3px rgba(var(--shadow-rgb), .15)" : "none",
          color: "var(--ink)", transition: "background .15s",
        }}>{o}</button>
      ))}
    </div>
  );
}

function SliderRow({ label, value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 42px", alignItems: "center", gap: 14, padding: "7px 0" }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <input type="range" min="0" max="100" value={value}
        onChange={(e) => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: "var(--primary)", height: 4 }} />
      <span style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "right" }}>{value}%</span>
    </div>
  );
}

const ACCENTS = ["#2f7e6e", "#56949f", "#3a7ca5", "#7d6aa8", "#b96b80", "#b07a4f", "#b78f3d", "#6f8f5a", "#5b7282"];

function AppearanceCard({ t, setTweak }) {
  return (
    <Card title="Appearance" style={{ gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        {THEME_PREVIEWS.map((p) => (
          <ThemeCard key={p.label} p={p} active={t.theme === p.label} onPick={() => setTweak("theme", p.label)} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, width: 110, flex: "none" }}>Accent colour</span>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <button onClick={() => setTweak("accent", "")} title="Theme default" style={{
            width: 22, height: 22, borderRadius: "50%", cursor: "pointer", padding: 0,
            background: "conic-gradient(#2f7e6e, #3a7ca5, #b96b80, #b78f3d, #2f7e6e)",
            border: "none",
            boxShadow: !t.accent ? "0 0 0 2px var(--bg-base), 0 0 0 4px var(--ink-3)" : "inset 0 0 0 1px rgba(0,0,0,.08)",
          }}></button>
          {ACCENTS.map((c) => (
            <button key={c} onClick={() => setTweak("accent", c)} style={{
              width: 22, height: 22, borderRadius: "50%", cursor: "pointer", padding: 0,
              background: c, border: "none",
              boxShadow: t.accent === c ? "0 0 0 2px var(--bg-base), 0 0 0 4px " + c : "inset 0 0 0 1px rgba(0,0,0,.08)",
            }}></button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: "auto" }}>{t.accent ? t.accent : "Theme default"}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, width: 110, flex: "none" }}>Density</span>
        <YSeg options={["Compact", "Regular", "Spacious"]} value={t.layout} onChange={(v) => setTweak("layout", v)} />
      </div>

      <div style={{ padding: "8px 0 0", borderTop: "1px solid var(--border)" }}>
        <SliderRow label="Blur" value={t.blur} onChange={(v) => setTweak("blur", v)} />
        <SliderRow label="Transparency" value={t.transparency} onChange={(v) => setTweak("transparency", v)} />
        <SliderRow label="Reflection" value={t.reflection} onChange={(v) => setTweak("reflection", v)} />
        <SliderRow label="Depth" value={t.depth} onChange={(v) => setTweak("depth", v)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "4px 24px", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        {[["Show agents on Lake", "showAgents"], ["Show missions on Lake", "showMissions"], ["Show Memory Garden", "showMemory"], ["Show system status", "showSystem"]].map(([label, key]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0" }}>
            <span style={{ fontSize: 13 }}>{label}</span>
            <YSwitch value={t[key]} onChange={(v) => setTweak(key, v)} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- About you: personal context for Yana ---------- */
function AboutField({ id, label, hint, placeholder, rows }) {
  const key = "yana.about." + id;
  const [v, setV] = React.useState(() => localStorage.getItem(key) || "");
  const [saved, setSaved] = React.useState(false);
  const timer = React.useRef(null);

  function onChange(e) {
    const val = e.target.value;
    setV(val);
    localStorage.setItem(key, val);
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(true), 800);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <label htmlFor={"about-" + id} style={{ fontSize: 13, fontWeight: 500 }}>{label}</label>
        <span style={{ fontSize: 11, color: "var(--good)", opacity: saved ? 1 : 0, transition: "opacity .3s", display: "inline-flex", alignItems: "center", gap: 4 }}>
          {Icons.check(11)} Planted in Memory Garden
        </span>
      </div>
      {hint && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: -3 }}>{hint}</div>}
      <textarea id={"about-" + id} value={v} onChange={onChange} rows={rows || 3}
        placeholder={placeholder}
        style={{
          width: "100%", resize: "vertical", padding: "10px 13px",
          borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
          background: "rgba(var(--surface-rgb), .6)", color: "var(--ink)",
          fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.55, outline: "none",
        }}
        onFocus={(e) => e.target.style.borderColor = "var(--primary)"}
        onBlur={(e) => e.target.style.borderColor = "var(--border)"}
      ></textarea>
    </div>
  );
}

function AboutYouCard() {
  return (
    <Card title="About you" style={{ gridColumn: "1 / -1" }}
      aside={<span className="chip pink" style={{ fontSize: 11 }}>{Icons.memory(12)} Pinned · never pruned</span>}>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
        Yana reads this before every mission. The more honestly you describe yourself, the better she routes, plans, and phrases things for you.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <AboutField id="who" label="Who you are"
          hint="Role, what you're building, how you work"
          placeholder="e.g. I'm a system builder. I think in workflows, not code. I'd rather design the machine than turn its crank." rows={4} />
        <AboutField id="strengths" label="Strengths"
          hint="What Yana should lean on"
          placeholder="e.g. Big-picture architecture, fast decisions, spotting what matters." rows={4} />
        <AboutField id="weaknesses" label="Weak spots"
          hint="Where Yana should quietly cover for you"
          placeholder="e.g. I lose patience with long documents. Remind me of deadlines — once, gently." rows={4} />
        <AboutField id="style" label="How Yana should respond"
          hint="Tone, length, language"
          placeholder="e.g. Calm and brief. No hype, no exclamation marks. Vietnamese is fine for casual notes." rows={4} />
      </div>
    </Card>
  );
}

function Settings({ t, setTweak }) {
  return (
    <div data-screen-label="Settings">
      <PageHeader title="Settings" sub="Quiet defaults. Everything supervised by YAMTAM Core." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "var(--gap)", maxWidth: 900 }}>
        <AppearanceCard t={t} setTweak={setTweak} />
        <AboutYouCard />
        <Card title="Workspace">
          <SettingRow label="Workspace name" value="Tâm's Lake" />
          <SettingRow label="Language" value="English" />
          <SettingRow label="Timezone" value="GMT+7 · Hà Nội" />
        </Card>
        <Card title="Orchestration">
          <SettingRow label="Default orchestrator" desc="Plans and delegates missions" value="Navigator · Claude" />
          <SettingRow label="Router budget" desc="Max time for routing decisions" value="300 ms · Groq" />
          <SettingRow label="Fallback chain" value="GPT → Gemini → OpenRouter" />
        </Card>
        <Card title="Safety">
          <SettingRow label="Gate mode" desc="Every agent action is reviewed" value="Strict · deny by default" />
          <SettingRow label="Merge protection" desc="Sentinel sign-off before main" value="On" />
          <SettingRow label="Incident retention" value="90 days" />
        </Card>
        <Card title="Memory">
          <SettingRow label="Garden pruning" desc="Gardener's nightly decay pass" value="02:00 daily" />
          <SettingRow label="Pinned memories" desc="Never pruned" value="2 pinned" />
          <SettingRow label="Storage" value="Local · encrypted" />
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { Providers, Settings });
