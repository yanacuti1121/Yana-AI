// Yana AI — Providers + Settings
function fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

const LIVE_MODEL_PROVIDERS = new Set(["openrouter", "groq", "9router", "ollama", "lmstudio"]);

const PROVIDER_SETUP = {
  claude:     { url: "https://console.anthropic.com/settings/keys",   label: "Get key → console.anthropic.com" },
  openai:     { url: "https://platform.openai.com/api-keys",          label: "Get key → platform.openai.com" },
  gemini:     { url: "https://aistudio.google.com/app/apikey",        label: "Get key → aistudio.google.com" },
  groq:       { url: "https://console.groq.com/keys",                 label: "Get key → console.groq.com" },
  deepseek:   { url: "https://platform.deepseek.com/api_keys",        label: "Get key → platform.deepseek.com" },
  openrouter: { url: "https://openrouter.ai/settings/keys",           label: "Get key → openrouter.ai" },
  "9router":  { cmd: "npm install -g 9router",  cmd2: "9router",      label: "Local gateway — run on port 20128" },
  ollama:     { url: "https://ollama.com/download", cmd: "ollama serve", cmd2: "ollama pull llama3.2", label: "On-device — ollama.com/download" },
  lmstudio:   { url: "https://lmstudio.ai/download", cmd: "Open LM Studio → Developer tab", cmd2: "Start server (port 1234), load a model", label: "On-device — lmstudio.ai/download" },
};

function ProviderCard({ p, usage, onKeyChange, forceOpen }) {
  const keyless = KEYLESS_PROVIDERS.has(p.id);
  const [hasKey, setHasKey] = React.useState(() => YanaVault.hasKey(p.id));
  const connected = hasKey || keyless;
  const [liveModels, setLiveModels] = React.useState(null);
  const [checking, setChecking] = React.useState(false);
  const [editing, setEditing]   = React.useState(false);
  const [draft, setDraft]       = React.useState("");
  const [saved, setSaved]       = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (forceOpen && !keyless) {
      setDraft(YanaVault.getKey(p.id) || "");
      setEditing(true);
      setSaved(false);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
    }
  }, [forceOpen]);

  async function fetchLiveModels(key) {
    if (!LIVE_MODEL_PROVIDERS.has(p.id)) return;
    setChecking(true);
    try {
      const r = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p.id, key: key || "" }),
      });
      if (r.ok) {
        const { models } = await r.json();
        setLiveModels(models.slice(0, 6).map((m) => m.name || m.id));
      }
    } catch (_) {}
    setChecking(false);
  }

  React.useEffect(() => { if (keyless) fetchLiveModels(""); }, []);

  function openEdit() {
    setDraft(YanaVault.getKey(p.id) || "");
    setEditing(true);
    setSaved(false);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
  }

  async function saveKey() {
    const trimmed = draft.trim();
    if (trimmed) {
      await YanaVault.setKey(p.id, trimmed);
      setHasKey(true);
      fetchLiveModels(trimmed);
    } else {
      YanaVault.removeKey(p.id);
      setHasKey(false);
      setLiveModels(null);
    }
    setSaved(true);
    setTimeout(() => { setEditing(false); setSaved(false); }, 800);
    if (onKeyChange) onKeyChange();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter")  { e.preventDefault(); saveKey(); }
    if (e.key === "Escape") { setEditing(false); }
  }

  const keyDisplay = hasKey ? YanaVault.getKey(p.id).slice(0, 10) + "····" : "—";

  const u = usage && usage[p.id];
  const usageDisplay   = u ? "~" + fmtTokens(u.est_tokens) + L(" tokens", " tokens") : L("Not used yet", "Chưa dùng");
  const latencyDisplay = u && u.avg_latency_ms ? (u.avg_latency_ms / 1000).toFixed(1) + "s" : "—";

  const displayModels = liveModels || p.models;
  const modelLabel = liveModels
    ? L("Live models", "Model thực tế")
    : L("Models", "Mô hình");

  return (
    <div id={"provider-card-" + p.id} className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 11 }}>
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
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
          {p.desktopOnly && (
            <span className="chip neutral" style={{ fontSize: 10.5 }}
              title={L("Only available on desktop — requires a local server running on this machine",
                       "Chỉ dùng được trên máy tính — cần server local chạy trên máy này")}>
              🖥 {L("Desktop", "Máy tính")}
            </span>
          )}
          <span className={"chip " + (connected ? "" : "gold")} style={{ fontSize: 11.5 }}>
            <span className={"dot " + (connected ? "on" : "idle")} style={{ width: 6, height: 6, boxShadow: "none" }}></span>
            {keyless ? L("On-device", "Trên máy") : connected ? L("Connected", "Kết nối") : L("Standby", "Dự phòng")}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{p.role}</div>

      {(() => {
        const s = PROVIDER_SETUP[p.id];
        if (!s) return null;
        const isLocal = p.id === "9router" || p.id === "ollama" || p.id === "lmstudio";
        if (!isLocal && connected) return null;
        return (
          <div style={{
            fontSize: 11.5, borderRadius: 8, padding: "8px 11px", lineHeight: 1.6,
            background: "var(--primary-soft)", color: "var(--ink-2)",
          }}>
            {isLocal ? (
              <>
                <div style={{ fontWeight: 500, marginBottom: 3, color: "var(--primary)" }}>{s.label}</div>
                {s.url && <div><a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{s.url}</a></div>}
                {s.cmd  && <div style={{ fontFamily: "monospace", marginTop: 2 }}>$ {s.cmd}</div>}
                {s.cmd2 && <div style={{ fontFamily: "monospace" }}>$ {s.cmd2}</div>}
              </>
            ) : (
              <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", fontWeight: 500 }}>
                {s.label} ↗
              </a>
            )}
          </div>
        );
      })()}

      <div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 5 }}>
          {checking ? L("Fetching live models…", "Đang tải model thực tế…") : modelLabel}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {displayModels.map((m) => <span key={m} className="chip neutral" style={{ fontSize: 11 }}>{m}</span>)}
        </div>
      </div>

      <div className="grid-3" style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        {[[L("Usage", "Sử dụng"), usageDisplay], [L("Latency", "Độ trễ"), latencyDisplay]].map(([k, v]) => (
          <div key={k} style={{ lineHeight: 1.35, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{k}</div>
            <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
          </div>
        ))}
        <div style={{ lineHeight: 1.35, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{L("Key", "Khóa")}</div>
          {keyless ? (
            <span title={L("On-device provider — no API key needed", "Provider trên máy — không cần API key")}
              style={{ fontSize: 12, fontWeight: 500, color: "var(--good)" }}>
              {L("keyless", "không cần")}
            </span>
          ) : (
            <button onClick={openEdit} title={L("Click to set API key", "Nhấn để đặt API key")} style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 12, fontWeight: 500, color: hasKey ? "var(--good)" : "var(--primary)",
              display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit",
            }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 }}>
                {keyDisplay}
              </span>
              <span style={{ fontSize: 10, opacity: .6 }}>✎</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline key editor — replaces window.prompt() */}
      {editing && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", paddingTop: 4 }}>
          <input
            ref={inputRef}
            type="password"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={L("Paste API key here…", "Dán API key vào đây…")}
            style={{
              flex: 1, fontSize: 13, padding: "6px 10px", borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--ink)", outline: "none", fontFamily: "monospace",
            }}
          />
          <button onClick={saveKey} style={{
            padding: "6px 12px", borderRadius: 8, border: "none",
            background: saved ? "var(--good)" : "var(--primary)", color: "#fff",
            cursor: "pointer", fontSize: 12, fontWeight: 500, flex: "none",
          }}>
            {saved ? "✓" : L("Save", "Lưu")}
          </button>
          <button onClick={() => setEditing(false)} style={{
            padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)",
            background: "transparent", color: "var(--ink-3)", cursor: "pointer", fontSize: 12,
          }}>✕</button>
        </div>
      )}
    </div>
  );
}

function Providers() {
  const D = window.YANA;
  const [usage, setUsage] = React.useState(null);
  const [, bump] = React.useReducer((x) => x + 1, 0);
  const [openId, setOpenId] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setUsage(d.usage); })
      .catch(() => {});
  }, []);

  const connected = D.providers.filter((p) => providerAvailable(p.id)).length;

  function connectNext() {
    const next = D.providers.find((p) => !KEYLESS_PROVIDERS.has(p.id) && !YanaVault.hasKey(p.id));
    if (!next) { alert(L("All providers are connected.", "Tất cả nhà cung cấp đã kết nối.")); return; }
    setOpenId(next.id);
    setTimeout(() => {
      const el = document.getElementById("provider-card-" + next.id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  return (
    <div data-screen-label="Providers">
      <PageHeader
        title={L("Providers", "Nhà cung cấp")}
        sub={connected + L(" of ", " trong ") + D.providers.length + L(" providers connected · Groq routes, Yana AI supervises every call", " nhà cung cấp đã kết nối · Groq định tuyến, Yana AI giám sát mọi lệnh gọi")}>
        <button onClick={connectNext} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 99,
          border: "none", cursor: "pointer", background: "var(--primary)", color: "white",
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
        }}>{Icons.plus(15)} {L("Connect provider", "Kết nối nhà cung cấp")}</button>
      </PageHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--gap)" }}>
        {D.providers.map((p) => (
          <ProviderCard
            key={p.id + (YanaVault.hasKey(p.id) ? ":on" : ":off")}
            p={p}
            usage={usage}
            forceOpen={openId === p.id}
            onKeyChange={() => { bump(); setOpenId(null); }}
          />
        ))}
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
  { label: "Lotus Dawn 🌸",      accent: "#b96b80", sky: "linear-gradient(160deg, #faf5f3 30%, #f2dfdc 100%)", wash: "rgba(236,196,134,.45)" },
  { label: "Jade Lake 🌿",       accent: "#2f7e6e", sky: "linear-gradient(160deg, #f6faf7 30%, #ddeee7 100%)", wash: "rgba(122,184,168,.40)" },
  { label: "Morning Mist ☁️",    accent: "#4a7a6a", sky: "linear-gradient(160deg, #f8f7f4 30%, #ecebe5 100%)", wash: "rgba(214,222,214,.55)" },
  { label: "Glass Silver ✨",     accent: "#3a7ca5", sky: "linear-gradient(160deg, #f3f6fa 30%, #dde6ef 100%)", wash: "rgba(168,199,224,.45)" },
  { label: "Sage Forest 🌲",     accent: "#5a8a50", sky: "linear-gradient(160deg, #f4f7f1 30%, #e4ede0 100%)", wash: "rgba(120,180,100,.38)" },
  { label: "Sunset Amber 🌅",    accent: "#c97c18", sky: "linear-gradient(160deg, #faf4e8 30%, #f0e4cc 100%)", wash: "rgba(248,200,100,.42)" },
  { label: "Arctic Blue ❄️",     accent: "#1a7eb0", sky: "linear-gradient(160deg, #f3f8fc 30%, #ddeef8 100%)", wash: "rgba(160,210,248,.42)" },
  { label: "Lavender Dream 💜",  accent: "#7c5cbf", sky: "linear-gradient(160deg, #f7f4fd 30%, #e8e0f8 100%)", wash: "rgba(190,170,255,.40)" },
  { label: "iOS Rose 🌷",        accent: "#e879a0", sky: "linear-gradient(160deg, #fdf0f6 30%, #f5d0e8 100%)", wash: "rgba(232,121,160,.40)", dark: false },
  { label: "iOS Night 🌙",       accent: "#e879a0", sky: "linear-gradient(160deg, #2a0818 30%, #14020a 100%)", wash: "rgba(232,121,160,.22)", dark: true },
  { label: "Prism Glass 🔮",     accent: "#6060ff", sky: "linear-gradient(160deg, #f5f5fc 30%, #e0e0f8 100%)", wash: "rgba(96,96,255,.35)" },
  { label: "Obsidian 🌑",        accent: "#8080ff", sky: "linear-gradient(160deg, #1a1a2e 30%, #0c0c1a 100%)", wash: "rgba(128,128,255,.22)", dark: true },
  { label: "Deep Ocean 🌊",      accent: "#00c4a7", sky: "linear-gradient(160deg, #0d2030 30%, #071820 100%)", wash: "rgba(0,196,167,.28)", dark: true },
  { label: "Midnight Navy 🌌",   accent: "#6080e0", sky: "linear-gradient(160deg, #121828 30%, #090e1a 100%)", wash: "rgba(60,80,200,.28)", dark: true },
];

function ThemeCard({ p, active, onPick }) {
  const glass = p.dark ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.65)";
  const glass2 = p.dark ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.6)";
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
        <div style={{ position: "absolute", left: 8, top: 8, bottom: 8, width: 26, borderRadius: 6, background: glass, boxShadow: "inset 0 0 0 .5px rgba(255,255,255,.25)" }}></div>
        <div style={{ position: "absolute", left: 40, top: 8, right: 8, height: 22, borderRadius: 6, background: glass2 }}></div>
        <div style={{ position: "absolute", left: 40, top: 34, width: 34, height: 30, borderRadius: 6, background: glass2 }}></div>
        <div style={{ position: "absolute", left: 80, top: 34, right: 8, height: 30, borderRadius: 6, background: glass2 }}></div>
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
  const toggleLabels = [
    [L("Show agents on Lake", "Hiện tác nhân trên Mặt hồ"), "showAgents"],
    [L("Show missions on Lake", "Hiện nhiệm vụ trên Mặt hồ"), "showMissions"],
    [L("Show Memory Garden", "Hiện Vườn ký ức"), "showMemory"],
    [L("Show system status", "Hiện trạng thái hệ thống"), "showSystem"],
    [L("Reduce motion", "Giảm chuyển động"), "reduceMotion"],
  ];
  return (
    <Card title={L("Appearance", "Giao diện")} style={{ gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        {THEME_PREVIEWS.map((p) => (
          <ThemeCard key={p.label} p={p} active={t.theme === p.label} onPick={() => setTweak("theme", p.label)} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, width: 110, flex: "none" }}>{L("Accent colour", "Màu nhấn")}</span>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <button onClick={() => setTweak("accent", "")} title={L("Theme default", "Màu mặc định theme")} style={{
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
        <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: "auto" }}>
          {t.accent ? t.accent : L("Theme default", "Màu mặc định")}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, width: 110, flex: "none" }}>{L("Density", "Mật độ")}</span>
        <YSeg options={["Compact", "Regular", "Spacious"]} value={t.layout} onChange={(v) => setTweak("layout", v)} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, width: 110, flex: "none" }}>{L("Chat font", "Font trò chuyện")}</span>
        <YSeg
          options={["System", "Be Vietnam", "Mono"]}
          value={t.chatFont || "System"}
          onChange={(v) => setTweak("chatFont", v)}
        />
        <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: "auto" }}>
          {(t.chatFont || "System") === "System"    && L("ui-sans-serif — fastest", "ui-sans-serif — nhanh nhất")}
          {(t.chatFont || "System") === "Be Vietnam" && L("Be Vietnam Pro — elegant", "Be Vietnam Pro — thanh lịch")}
          {(t.chatFont || "System") === "Mono"       && L("ui-monospace — code-ready", "ui-monospace — thân thiện code")}
        </span>
      </div>

      <div style={{ padding: "8px 0 0", borderTop: "1px solid var(--border)" }}>
        <SliderRow label={L("Blur", "Mờ")} value={t.blur} onChange={(v) => setTweak("blur", v)} />
        <SliderRow label={L("Transparency", "Trong suốt")} value={t.transparency} onChange={(v) => setTweak("transparency", v)} />
        <SliderRow label={L("Reflection", "Phản chiếu")} value={t.reflection} onChange={(v) => setTweak("reflection", v)} />
        <SliderRow label={L("Depth", "Độ sâu")} value={t.depth} onChange={(v) => setTweak("depth", v)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "4px 24px", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        {toggleLabels.map(([label, key]) => (
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
          {Icons.check(11)} {L("Planted in Memory Garden", "Đã lưu vào Vườn ký ức")}
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
    <Card title={L("About you", "Về bạn")} style={{ gridColumn: "1 / -1" }}
      aside={<span className="chip pink" style={{ fontSize: 11 }}>{Icons.memory(12)} {L("Pinned · never pruned", "Đã ghim · không bao giờ xóa")}</span>}>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
        {L(
          "Yana reads this before every mission. The more honestly you describe yourself, the better she routes, plans, and phrases things for you.",
          "Yana đọc phần này trước mỗi nhiệm vụ. Bạn mô tả bản thân càng thực tế, cô ấy càng định tuyến, lên kế hoạch và diễn đạt tốt hơn cho bạn."
        )}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <AboutField id="who" label={L("Who you are", "Bạn là ai")}
          hint={L("Role, what you're building, how you work", "Vai trò, bạn đang xây dựng gì, cách bạn làm việc")}
          placeholder={L("e.g. I'm a system builder. I think in workflows, not code.", "e.g. Tôi xây hệ thống. Tôi nghĩ theo luồng công việc, không phải code.")} rows={4} />
        <AboutField id="strengths" label={L("Strengths", "Điểm mạnh")}
          hint={L("What Yana should lean on", "Điều Yana nên dựa vào")}
          placeholder={L("e.g. Big-picture architecture, fast decisions.", "e.g. Kiến trúc tổng thể, ra quyết định nhanh.")} rows={4} />
        <AboutField id="weaknesses" label={L("Weak spots", "Điểm yếu")}
          hint={L("Where Yana should quietly cover for you", "Nơi Yana nên lặng lẽ hỗ trợ bạn")}
          placeholder={L("e.g. I lose patience with long documents.", "e.g. Tôi mất kiên nhẫn với tài liệu dài.")} rows={4} />
        <AboutField id="style" label={L("How Yana should respond", "Yana nên trả lời thế nào")}
          hint={L("Tone, length, language", "Giọng điệu, độ dài, ngôn ngữ")}
          placeholder={L("e.g. Calm and brief. Vietnamese is fine for casual notes.", "e.g. Bình tĩnh và ngắn gọn. Tiếng Việt được cho ghi chú thường ngày.")} rows={4} />
      </div>
    </Card>
  );
}

/* ---------- Settings: toggle row (localStorage-persisted switch) ----------- */
function ToggleRow({ label, desc, storeKey, defaultVal }) {
  const [v, setV] = React.useState(() => {
    const s = localStorage.getItem(storeKey);
    return s !== null ? s !== "false" : defaultVal;
  });
  function toggle(next) {
    setV(next);
    localStorage.setItem(storeKey, next);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key: storeKey, value: next } }));
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{desc}</div>}
      </div>
      <YSwitch value={v} onChange={toggle} />
    </div>
  );
}

/* ---------- Settings: live data + editable rows (no display-only fakes) ---- */

// Editable text row — click ✎ to rename, persisted in localStorage
function EditableRow({ label, desc, storeKey, fallback }) {
  const [v, setV] = React.useState(() => localStorage.getItem(storeKey) || fallback);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(v);
  const inputRef = React.useRef(null);

  function startEdit() {
    setDraft(v);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 20);
  }
  function save() {
    const next = draft.trim() || fallback;
    setV(next);
    localStorage.setItem(storeKey, next);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key: storeKey, value: next } }));
    setEditing(false);
  }
  function handleKeyDown(e) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{desc}</div>}
      </div>
      {editing ? (
        <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown} onBlur={save}
          style={{
            fontSize: 12, padding: "4px 10px", borderRadius: 8, fontFamily: "inherit",
            border: "1.5px solid var(--primary)", background: "var(--surface)",
            color: "var(--ink)", outline: "none", width: 160,
          }} />
      ) : (
        <button onClick={startEdit} title={L("Click to edit", "Nhấn để sửa")} style={{
          background: "none", border: "1px solid var(--border)", padding: "4px 12px",
          borderRadius: 99, cursor: "pointer", fontSize: 12, color: "var(--primary)",
          fontWeight: 500, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
        }}>{v} <span style={{ fontSize: 10, opacity: .6 }}>✎</span></button>
      )}
    </div>
  );
}

function detectTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const offMin = -new Date().getTimezoneOffset();
    const sign = offMin >= 0 ? "+" : "−";
    const hours = Math.floor(Math.abs(offMin) / 60);
    const mins = Math.abs(offMin) % 60;
    return "GMT" + sign + hours + (mins ? ":" + String(mins).padStart(2, "0") : "") + " · " + tz.split("/").pop().replace(/_/g, " ");
  } catch (_) { return "UTC"; }
}

/* ---------- Profile Hero ---------- */
const DARK_THEMES = new Set(["iOS Night 🌙", "Obsidian 🌑"]);

function ProfileHero({ t, setTweak, dash }) {
  const D = window.YANA;
  const account = D.account || "";
  const initial = account.trim().charAt(0).toUpperCase() || "Y";

  const [dispName, setDispName] = React.useState(() =>
    localStorage.getItem("yana.display-name") || account || "Yana AI"
  );
  const [editingName, setEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(() =>
    localStorage.getItem("yana.display-name") || account || "Yana AI"
  );
  const nameInputRef = React.useRef(null);
  const [avatarUrl, setAvatarUrl] = React.useState(() =>
    localStorage.getItem("yana.avatar-url") || null
  );
  const avatarInputRef = React.useRef(null);

  function editName() {
    setNameDraft(dispName);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 20);
  }
  function saveName() {
    const next = nameDraft.trim() || account || "Yana AI";
    setDispName(next);
    localStorage.setItem("yana.display-name", next);
    setEditingName(false);
  }
  function handleNameKeyDown(e) {
    if (e.key === "Enter") saveName();
    if (e.key === "Escape") setEditingName(false);
  }

  function onAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target.result;
      setAvatarUrl(url);
      localStorage.setItem("yana.avatar-url", url);
      window.dispatchEvent(new CustomEvent("yana-avatar-changed"));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const memberSince = React.useMemo(() => {
    const key = "yana.member-since";
    let s = localStorage.getItem(key);
    if (!s) {
      s = new Date().toLocaleDateString(
        t.language === "Tiếng Việt" ? "vi-VN" : "en-US",
        { year: "numeric", month: "long" }
      );
      localStorage.setItem(key, s);
    }
    return s;
  }, []);

  // Color mode toggle
  const [colorMode, setColorMode] = React.useState(() => {
    const stored = localStorage.getItem("yana.color-mode");
    if (stored === "auto") return "auto";
    return DARK_THEMES.has(t.theme) ? "dark" : "light";
  });
  // Sync when theme changes externally (e.g. AppearanceCard click)
  React.useEffect(() => {
    if (localStorage.getItem("yana.color-mode") !== "auto") {
      setColorMode(DARK_THEMES.has(t.theme) ? "dark" : "light");
    }
  }, [t.theme]);

  function applyMode(mode) {
    localStorage.setItem("yana.color-mode", mode);
    setColorMode(mode);
    if (mode === "dark") {
      if (!DARK_THEMES.has(t.theme)) localStorage.setItem("yana.last-light-theme", t.theme);
      setTweak("theme", localStorage.getItem("yana.last-dark-theme") || "iOS Night 🌙");
    } else if (mode === "light") {
      if (DARK_THEMES.has(t.theme)) localStorage.setItem("yana.last-dark-theme", t.theme);
      setTweak("theme", localStorage.getItem("yana.last-light-theme") || "Jade Lake 🌿");
    } else {
      // auto — follow system preference
      if (DARK_THEMES.has(t.theme)) localStorage.setItem("yana.last-dark-theme", t.theme);
      else localStorage.setItem("yana.last-light-theme", t.theme);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTweak("theme",
        prefersDark
          ? (localStorage.getItem("yana.last-dark-theme") || "iOS Night 🌙")
          : (localStorage.getItem("yana.last-light-theme") || "Jade Lake 🌿")
      );
    }
  }

  const connectedCount = D.providers.filter((p) => providerAvailable(p.id)).length;
  const heroStats = [
    { v: D.stats.agents,                  lb: L("agents", "tác nhân") },
    { v: dash ? dash.memories.total : "…", lb: L("memories", "ký ức") },
    { v: connectedCount + "/" + D.providers.length, lb: L("providers", "kết nối") },
    { v: L("Strict", "Nghiêm"),            lb: L("gate mode", "chế độ cổng") },
  ];

  const MODES = [
    { key: "light", icon: "☀️", label: L("Light", "Sáng") },
    { key: "dark",  icon: "🌙", label: L("Dark", "Tối") },
    { key: "auto",  icon: "✦",  label: L("Auto", "Tự động") },
  ];

  return (
    <div style={{
      borderRadius: "var(--r-md)",
      background: "rgba(var(--surface-rgb), 0.65)",
      backdropFilter: "blur(20px) saturate(140%)",
      border: "0.5px solid var(--border)",
      boxShadow: "0 4px 28px rgba(var(--shadow-rgb), .1), 0 1px 0 rgba(255,255,255,.22) inset",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Ambient gradient overlay */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 11%, transparent) 0%, transparent 52%, color-mix(in oklab, var(--gold, #c9a227) 6%, transparent) 100%)",
      }} />

      {/* Avatar + info row */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "22px 24px 20px", position: "relative" }}>
        <div className="sidebar-avatar-wrap"
          onClick={() => avatarInputRef.current?.click()}
          title={L("Change photo", "Đổi ảnh đại diện")}
          style={{ width: 56, height: 56, flexShrink: 0, position: "relative", cursor: "pointer" }}
        >
          <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onAvatarChange} />
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" style={{
              width: 56, height: 56, borderRadius: "50%", objectFit: "cover",
              border: "2.5px solid rgba(var(--surface-rgb), 0.55)",
              display: "block",
            }} />
          ) : (
            <div className="sidebar-avatar" style={{
              fontSize: 21, fontWeight: 700,
              background: "linear-gradient(145deg, var(--primary), color-mix(in oklab, var(--primary) 60%, var(--gold, #c9a227)))",
              color: "white",
              border: "2.5px solid rgba(var(--surface-rgb), 0.55)",
            }}>{initial}</div>
          )}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: 0, transition: "opacity .15s",
            fontSize: 18,
          }} onMouseEnter={e => e.currentTarget.style.opacity = 1}
             onMouseLeave={e => e.currentTarget.style.opacity = 0}>
            📷
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            {editingName ? (
              <input ref={nameInputRef} value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={handleNameKeyDown} onBlur={saveName}
                style={{
                  fontSize: 17, fontWeight: 700, color: "var(--ink)", lineHeight: 1.2,
                  background: "transparent", border: "none",
                  borderBottom: "1.5px solid var(--primary)",
                  outline: "none", fontFamily: "inherit", minWidth: 80, width: "auto",
                }} />
            ) : (
              <>
                <span style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", lineHeight: 1.2 }}>{dispName}</span>
                <button onClick={editName} title={L("Edit name", "Sửa tên")} style={{
                  background: "none", border: "none", padding: "2px 8px", borderRadius: 6, cursor: "pointer",
                  fontSize: 11, color: "var(--ink-3)",
                }}>✎</button>
              </>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 3 }}>{account}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
            {L("Member since", "Thành viên từ")} {memberSince}
          </div>
        </div>

        <span style={{
          background: "color-mix(in oklab, var(--primary) 13%, transparent)",
          color: "var(--primary)", border: "0.5px solid color-mix(in oklab, var(--primary) 28%, transparent)",
          padding: "3px 11px", borderRadius: 99, fontSize: 11.5, fontWeight: 600,
          flexShrink: 0, alignSelf: "flex-start",
        }}>Sovereign</span>
      </div>

      {/* Dark mode toggle row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "9px 24px", borderTop: "0.5px solid var(--border)", position: "relative",
      }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          {L("Appearance mode", "Chế độ hiển thị")}
        </span>
        <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 9, background: "rgba(var(--shadow-rgb), .07)" }}>
          {MODES.map(({ key, icon, label }) => (
            <button key={key} onClick={() => applyMode(key)} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 11px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: colorMode === key ? 500 : 400,
              background: colorMode === key ? "rgba(var(--surface-rgb), .95)" : "transparent",
              boxShadow: colorMode === key ? "0 1px 3px rgba(var(--shadow-rgb), .15)" : "none",
              color: colorMode === key ? "var(--ink)" : "var(--ink-3)",
              transition: "background .15s, color .15s", fontFamily: "inherit",
            }}>
              <span style={{ fontSize: 13 }}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: "flex", borderTop: "0.5px solid var(--border)", position: "relative" }}>
        {heroStats.map((s, i) => (
          <div key={i} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "11px 6px",
            borderRight: i < heroStats.length - 1 ? "0.5px solid var(--border)" : "none",
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{s.v}</span>
            <span style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1, textAlign: "center" }}>{s.lb}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Settings: Profile card ---------- */
const ROLE_OPTIONS_EN = ["Engineering", "Software Development", "Data Science / AI", "Design", "Product Management", "Marketing", "Research", "Business", "Education", "Automation / Robotics", "Mechanical Engineering", "Other"];
const ROLE_OPTIONS_VI = ["Kỹ thuật", "Phát triển phần mềm", "Khoa học dữ liệu / AI", "Thiết kế", "Quản lý sản phẩm", "Marketing", "Nghiên cứu", "Kinh doanh", "Giáo dục", "Tự động hóa / Robotics", "Cơ khí", "Khác"];

function ProfileCard({ lang }) {
  const ROLE_OPTIONS = lang === "Tiếng Việt" ? ROLE_OPTIONS_VI : ROLE_OPTIONS_EN;
  const [role, setRole] = React.useState(() => localStorage.getItem("yana.profile.role") || "");
  const [instr, setInstr] = React.useState(() => localStorage.getItem("yana.profile.instructions") || "");
  const [savedInstr, setSavedInstr] = React.useState(false);
  const timer = React.useRef(null);

  function onRoleChange(e) {
    const v = e.target.value;
    setRole(v);
    localStorage.setItem("yana.profile.role", v);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key: "yana.profile.role", value: v } }));
  }

  function onInstrChange(e) {
    const v = e.target.value;
    setInstr(v);
    localStorage.setItem("yana.profile.instructions", v);
    setSavedInstr(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSavedInstr(true), 800);
  }

  return (
    <Card title={L("Profile", "Hồ sơ cá nhân")}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Profession / Role", "Lĩnh vực hoạt động")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Shapes how Yana frames context", "Định hình cách Yana xử lý ngữ cảnh")}</div>
        </div>
        <select value={role} onChange={onRoleChange} style={{
          border: "1px solid var(--border)", borderRadius: 99, padding: "5px 10px",
          background: "transparent", color: "var(--primary)", fontSize: 12,
          fontWeight: 500, fontFamily: "inherit", cursor: "pointer", maxWidth: 190,
        }}>
          <option value="">{L("— select —", "— chọn —")}</option>
          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: "calc(11px * var(--sp))" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Yana Instructions", "Chỉ thị cho Yana")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
              {L("Rules Yana follows in every conversation", "Quy tắc Yana tuân theo trong mọi cuộc trò chuyện")}
            </div>
          </div>
          <span style={{ fontSize: 11, color: "var(--good)", opacity: savedInstr ? 1 : 0, transition: "opacity .3s", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {Icons.check(11)} {L("Saved", "Đã lưu")}
          </span>
        </div>
        <textarea value={instr} onChange={onInstrChange} rows={5}
          placeholder={L(
            "e.g. Always explain briefly. Prefer optimised code for Mac M4. Reply in Vietnamese for casual notes.",
            "e.g. Luôn giải thích ngắn gọn. Ưu tiên code tối ưu cho Mac M4. Trả lời tiếng Việt cho ghi chú thường ngày."
          )}
          style={{
            width: "100%", resize: "vertical", padding: "10px 13px",
            borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
            background: "rgba(var(--surface-rgb), .6)", color: "var(--ink)",
            fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.55, outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={e => e.target.style.borderColor = "var(--primary)"}
          onBlur={e => e.target.style.borderColor = "var(--border)"}
        />
      </div>
    </Card>
  );
}

/* ---------- Settings: Voice & Speech card ---------- */
const VOICE_LANGS = [
  { code: "vi-VN", label: "Tiếng Việt" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "ja-JP", label: "日本語" },
  { code: "zh-CN", label: "中文 (简体)" },
  { code: "ko-KR", label: "한국어" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
];

function VoiceCard({ lang }) {
  const isVI = lang === "Tiếng Việt";
  const speedOpts = isVI
    ? ["Chậm", "Bình thường", "Nhanh"]
    : ["Slow", "Normal", "Fast"];
  const speedRate = { [speedOpts[0]]: 0.7, [speedOpts[1]]: 1.0, [speedOpts[2]]: 1.4 };

  const [voiceLang, setVoiceLang] = React.useState(
    () => localStorage.getItem("yana.voice.lang") || (isVI ? "vi-VN" : "en-US")
  );
  const [speed, setSpeed] = React.useState(
    () => localStorage.getItem("yana.voice.speed") || speedOpts[1]
  );
  const [voices, setVoices] = React.useState([]);
  const [selected, setSelected] = React.useState(
    () => localStorage.getItem("yana.voice.name") || ""
  );
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => {
    function loadVoices() {
      const all = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      const prefix = voiceLang.split("-")[0];
      const filtered = all.filter(v => v.lang.startsWith(prefix));
      setVoices(filtered);
      if (filtered.length > 0 && !filtered.find(v => v.name === selected)) {
        setSelected(filtered[0].name);
        localStorage.setItem("yana.voice.name", filtered[0].name);
      }
    }
    loadVoices();
    if (window.speechSynthesis) window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => { if (window.speechSynthesis) window.speechSynthesis.removeEventListener("voiceschanged", loadVoices); };
  }, [voiceLang]);

  function persist(key, val) {
    localStorage.setItem(key, val);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key, value: val } }));
  }

  function testVoice() {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      isVI ? "Xin chào, tôi là Yana AI. Bạn nghe rõ không?" : "Hello, I am Yana AI. Can you hear me clearly?"
    );
    utter.lang = voiceLang;
    utter.rate = speedRate[speed] || 1.0;
    const v = voices.find(v => v.name === selected);
    if (v) utter.voice = v;
    setTesting(true);
    utter.onend = () => setTesting(false);
    utter.onerror = () => setTesting(false);
    window.speechSynthesis.speak(utter);
  }

  const hasTTS = !!window.speechSynthesis;

  return (
    <Card title={L("Voice & Speech", "Giọng nói & Phản hồi")}>
      {!hasTTS && (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", padding: "8px 0 4px" }}>
          {L("Text-to-speech is not available in this browser.", "Trình duyệt này chưa hỗ trợ đọc văn bản.")}
        </div>
      )}

      {/* Language */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Language", "Ngôn ngữ giọng nói")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Language for text-to-speech output", "Ngôn ngữ cho đầu ra giọng nói")}</div>
        </div>
        <select value={voiceLang} onChange={e => { setVoiceLang(e.target.value); persist("yana.voice.lang", e.target.value); }}
          style={{ border: "1px solid var(--border)", borderRadius: 99, padding: "5px 10px", background: "transparent", color: "var(--primary)", fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}>
          {VOICE_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      {/* Voice */}
      {voices.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ lineHeight: 1.35 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Voice", "Giọng đọc")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{voices.length + L(" voices available", " giọng khả dụng")}</div>
          </div>
          <select value={selected} onChange={e => { setSelected(e.target.value); persist("yana.voice.name", e.target.value); }}
            style={{ border: "1px solid var(--border)", borderRadius: 99, padding: "5px 10px", background: "transparent", color: "var(--primary)", fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", maxWidth: 200 }}>
            {voices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </div>
      )}

      {/* Speed */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Speed", "Tốc độ")}</div>
        <YSeg options={speedOpts} value={speed} onChange={v => { setSpeed(v); persist("yana.voice.speed", v); }} />
      </div>

      {/* Test */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "calc(10px * var(--sp))" }}>
        <button onClick={testVoice} disabled={testing || !hasTTS} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "7px 16px",
          borderRadius: 99, border: "1px solid var(--border)", cursor: testing || !hasTTS ? "default" : "pointer",
          background: testing ? "var(--primary-soft)" : "transparent",
          color: "var(--primary)", fontSize: 12.5, fontWeight: 500, fontFamily: "inherit",
          opacity: !hasTTS ? 0.4 : 1, transition: "background .15s",
        }}>
          {testing ? "🔊 " + L("Speaking…", "Đang đọc…") : "▶ " + L("Test voice", "Thử giọng")}
        </button>
      </div>
    </Card>
  );
}

/* ---------- Settings: Data Management card ---------- */
function DataManagementCard() {
  const [exporting, setExporting] = React.useState(false);
  const [confirm, setConfirm] = React.useState(null); // "clear-chat" | "reset"
  const [done, setDone] = React.useState(null);

  async function exportData() {
    setExporting(true);
    try {
      const [memRes, usageRes] = await Promise.all([
        fetch("/api/memories").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/usage").then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      // Collect all yana.* localStorage keys
      const settings = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("yana.")) settings[k] = localStorage.getItem(k);
      }

      const payload = {
        exported_at: new Date().toISOString(),
        version: window.YANA.version || "unknown",
        settings,
        memories: memRes ? memRes.memories : [],
        usage: usageRes ? usageRes.usage : {},
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "yana-ai-export-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(url);
      setDone("export");
      setTimeout(() => setDone(null), 2500);
    } catch (_) {}
    setExporting(false);
  }

  function clearChat() {
    window.YANA.chat = [];
    window.dispatchEvent(new Event("yana:data"));
    setConfirm(null);
    setDone("clear");
    setTimeout(() => setDone(null), 2000);
  }

  function resetAll() {
    // Remove all yana.* keys except member-since
    const keep = ["yana.member-since"];
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("yana.") && !keep.includes(k)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    setConfirm(null);
    setDone("reset");
    setTimeout(() => window.location.reload(), 1200);
  }

  const btnBase = {
    display: "flex", alignItems: "center", gap: 7, padding: "8px 16px",
    borderRadius: 99, fontSize: 12.5, fontWeight: 500, fontFamily: "inherit",
    cursor: "pointer", border: "1px solid var(--border)", transition: "background .15s",
  };

  return (
    <Card title={L("Data Management", "Quản lý dữ liệu")}>
      {/* Export */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Export data", "Xuất dữ liệu")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {L("Download all settings, memories and usage as JSON", "Tải về cài đặt, ký ức và lịch sử dùng dạng JSON")}
          </div>
        </div>
        <button onClick={exportData} disabled={exporting} style={{ ...btnBase, background: "transparent", color: "var(--primary)" }}>
          {done === "export" ? "✓ " + L("Downloaded", "Đã tải") : exporting ? L("Exporting…", "Đang xuất…") : "↓ " + L("Export", "Xuất")}
        </button>
      </div>

      {/* Clear chat */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Clear chat history", "Xóa lịch sử trò chuyện")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {L("Remove all messages from the current session", "Xóa tất cả tin nhắn trong phiên hiện tại")}
          </div>
        </div>
        {confirm === "clear-chat" ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={clearChat} style={{ ...btnBase, background: "var(--destructive, #e84040)", color: "#fff", border: "none" }}>
              {L("Confirm", "Xác nhận")}
            </button>
            <button onClick={() => setConfirm(null)} style={{ ...btnBase, background: "transparent", color: "var(--ink-3)" }}>
              {L("Cancel", "Huỷ")}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirm("clear-chat")} style={{ ...btnBase, background: "transparent", color: done === "clear" ? "var(--good)" : "var(--ink-2)" }}>
            {done === "clear" ? "✓ " + L("Cleared", "Đã xóa") : L("Clear", "Xóa")}
          </button>
        )}
      </div>

      {/* Reset all */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingTop: "calc(11px * var(--sp))" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Reset to defaults", "Khôi phục mặc định")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {L("Wipe all settings and reload — API keys are preserved", "Xóa toàn bộ cài đặt và tải lại — API key vẫn giữ nguyên")}
          </div>
        </div>
        {confirm === "reset" ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={resetAll} style={{ ...btnBase, background: "var(--destructive, #e84040)", color: "#fff", border: "none" }}>
              {done === "reset" ? L("Resetting…", "Đang khôi phục…") : L("Confirm reset", "Xác nhận")}
            </button>
            <button onClick={() => setConfirm(null)} style={{ ...btnBase, background: "transparent", color: "var(--ink-3)" }}>
              {L("Cancel", "Huỷ")}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirm("reset")} style={{ ...btnBase, background: "transparent", color: "var(--ink-2)" }}>
            {L("Reset", "Khôi phục")}
          </button>
        )}
      </div>
    </Card>
  );
}

/* ---------- Settings: Model Hyperparameters card ---------- */
function ModelParamsCard({ lang }) {
  const isVI = lang === "Tiếng Việt";

  const [temp, setTemp] = React.useState(() => {
    const s = localStorage.getItem("yana.model.temperature");
    return s !== null ? parseFloat(s) : 0.7;
  });
  const [maxTok, setMaxTok] = React.useState(
    () => localStorage.getItem("yana.model.max-tokens") || "4K"
  );

  function onTempChange(e) {
    const v = parseFloat(e.target.value);
    setTemp(v);
    localStorage.setItem("yana.model.temperature", v);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key: "yana.model.temperature", value: v } }));
  }

  function onMaxTokChange(v) {
    setMaxTok(v);
    localStorage.setItem("yana.model.max-tokens", v);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key: "yana.model.max-tokens", value: v } }));
  }

  // Temperature zone label
  function tempZone(t) {
    if (t <= 0.2) return isVI ? ["Chính xác", "Code, phân tích, sửa lỗi"] : ["Precise", "Code, analysis, bug fixes"];
    if (t <= 0.5) return isVI ? ["Cân bằng", "Giải thích, tóm tắt, Q&A"] : ["Balanced", "Explanations, summaries, Q&A"];
    if (t <= 0.79) return isVI ? ["Sáng tạo", "Viết lách, brainstorm, ý tưởng"] : ["Creative", "Writing, brainstorm, ideas"];
    return isVI ? ["Rất sáng tạo", "Thơ, kịch bản, thử nghiệm"] : ["Very creative", "Poetry, scripts, experiments"];
  }

  function tempColor(t) {
    if (t <= 0.2) return "#3a7ca5";
    if (t <= 0.5) return "#2f7e6e";
    if (t <= 0.79) return "#b07a4f";
    return "#b96b80";
  }

  const [zoneName, zoneDesc] = tempZone(temp);
  const color = tempColor(temp);

  const TOKEN_OPTS = ["1K", "2K", "4K", "8K", "16K", "32K"];
  const TOKEN_MAP = { "1K": 1024, "2K": 2048, "4K": 4096, "8K": 8192, "16K": 16384, "32K": 32768 };

  return (
    <Card title={L("Model Parameters", "Tham số mô hình")}>

      {/* Temperature */}
      <div style={{ paddingBottom: "calc(14px * var(--sp))", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Temperature", "Nhiệt độ")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Controls creativity vs precision", "Điều chỉnh sáng tạo so với chính xác")}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color }}>{temp.toFixed(2)}</span>
            <div style={{ fontSize: 11, color, fontWeight: 500 }}>{zoneName}</div>
          </div>
        </div>

        <input type="range" min="0" max="1" step="0.01" value={temp} onChange={onTempChange}
          style={{ width: "100%", accentColor: color, height: 4, marginBottom: 6 }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)" }}>
          <span>0.0 — {isVI ? "Chính xác" : "Precise"}</span>
          <span style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "center" }}>{zoneDesc}</span>
          <span>1.0 — {isVI ? "Sáng tạo" : "Creative"}</span>
        </div>
      </div>

      {/* Max tokens */}
      <div style={{ paddingTop: "calc(12px * var(--sp))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Max response tokens", "Giới hạn token phản hồi")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {"≈ " + Math.round(TOKEN_MAP[maxTok] * 0.75).toLocaleString() + L(" words", " từ")}
            </div>
          </div>
          <YSeg options={TOKEN_OPTS} value={maxTok} onChange={onMaxTokChange} />
        </div>
      </div>
    </Card>
  );
}

/* ---------- Settings main ---------- */
function AdvancedCard({ lang }) {
  const isVI = lang === "Tiếng Việt";
  return (
    <Card title={isVI ? "Nâng cao / Nhà phát triển" : "Advanced / Developer"}>
      <ToggleRow
        label={isVI ? "Chế độ nhà phát triển" : "Developer mode"}
        desc={isVI ? "Hiển thị thời gian phản hồi và ước lượng token dưới mỗi câu trả lời" : "Show response time and estimated token count under each reply"}
        storeKey="yana.dev.mode"
        defaultVal={false} />
      <ToggleRow
        label={isVI ? "Luôn mở rộng suy nghĩ" : "Always expand thinking"}
        desc={isVI ? "Tự động mở khối <think> thay vì thu gọn" : "Auto-open <think> blocks instead of collapsing them"}
        storeKey="yana.dev.expand-thinking"
        defaultVal={false} />
    </Card>
  );
}

function Settings({ t, setTweak }) {
  const D = window.YANA;

  const [dash, setDash] = React.useState(null);
  React.useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setDash(d); })
      .catch(() => {});
  }, []);

  const [defProvider, setDefProvider] = React.useState(() => localStorage.getItem("yana.chat.provider") || "");
  function pickProvider(v) {
    setDefProvider(v);
    localStorage.setItem("yana.chat.provider", v);
  }
  const available = D.providers.filter((p) => providerAvailable(p.id));
  const chain = available.map((p) => p.name).join(" → ") || L("None — add a key in Providers", "Chưa có — thêm key ở Nhà cung cấp");

  function toggleLang() {
    setTweak("language", t.language === "Tiếng Việt" ? "English" : "Tiếng Việt");
  }
  const langDisplay = t.language === "Tiếng Việt"
    ? L("English / Tiếng Việt ✓", "Tiếng Việt ✓ / English")
    : L("English ✓ / Tiếng Việt", "English ✓ / Tiếng Việt");

  const GAP = "var(--gap)";
  return (
    <div data-screen-label="Settings">
      <PageHeader
        title={L("Settings", "Cài đặt")}
        sub={L("Quiet defaults. Everything supervised by Yana AI Core.", "Cài đặt mặc định. Mọi thứ được Yana AI Core giám sát.")} />

      <div style={{ display: "flex", flexDirection: "column", gap: GAP, maxWidth: 900 }}>

        {/* Profile hero */}
        <ProfileHero t={t} setTweak={setTweak} dash={dash} />

        {/* Profile card — profession + custom instructions */}
        <ProfileCard lang={t.language} />

        {/* Appearance — full width */}
        <AppearanceCard t={t} setTweak={setTweak} />

        {/* Workspace + Orchestration side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: GAP }}>
          <Card title={L("Workspace", "Không gian làm việc")}>
            <EditableRow label={L("Workspace name", "Tên không gian")} storeKey="yana.workspace.name"
              fallback={L("Yana's Lake", "Mặt hồ của Yana")} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ lineHeight: 1.35 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Language", "Ngôn ngữ")}</div>
              </div>
              <button onClick={toggleLang} style={{
                background: "none", border: "1px solid var(--border)", padding: "4px 12px",
                borderRadius: 99, cursor: "pointer", fontSize: 12, color: "var(--primary)",
                fontWeight: 500, fontFamily: "inherit",
              }}>{langDisplay}</button>
            </div>
            <SettingRow label={L("Timezone", "Múi giờ")}
              desc={L("Detected from this browser", "Phát hiện từ trình duyệt này")}
              value={detectTimezone()} />
          </Card>

          <Card title={L("Orchestration", "Điều phối")}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ lineHeight: 1.35 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Default provider", "Nhà cung cấp mặc định")}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Used by Chat unless overridden", "Chat dùng mặc định này trừ khi chọn khác")}</div>
              </div>
              <select value={defProvider} onChange={(e) => pickProvider(e.target.value)} style={{
                border: "1px solid var(--border)", borderRadius: 99, padding: "5px 10px",
                background: "transparent", color: "var(--primary)", fontSize: 12,
                fontWeight: 500, fontFamily: "inherit", cursor: "pointer", maxWidth: 150,
              }}>
                <option value="">{L("Auto (first connected)", "Tự động (kết nối đầu tiên)")}</option>
                {D.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!providerAvailable(p.id)}>
                    {p.name}{p.desktopOnly ? " 🖥" : ""}{providerAvailable(p.id) ? "" : " 🔒"}
                  </option>
                ))}
              </select>
            </div>
            <SettingRow
              label={L("Task routing", "Định tuyến tác vụ")}
              desc={L("yana-rt classifier — local, before any provider call", "yana-rt classifier — chạy local, trước mọi lệnh gọi provider")}
              value={L("simple · complex · external", "simple · complex · external")} />
            <SettingRow label={L("Fallback chain", "Chuỗi dự phòng")}
              desc={L("Connected providers, in order", "Các nhà cung cấp đã kết nối, theo thứ tự")}
              value={chain} />
          </Card>
        </div>

        {/* Model Parameters — full width */}
        <ModelParamsCard lang={t.language} />

        {/* About you — full width */}
        <AboutYouCard />

        {/* Safety + Memory side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: GAP }}>
          <Card title={L("Safety", "Bảo mật")}>
            <SettingRow
              label={L("Gate mode", "Chế độ cổng")}
              desc={L("Every agent action is reviewed", "Mọi hành động của tác nhân đều được xem xét")}
              value={L("Strict · deny by default", "Nghiêm ngặt · từ chối mặc định")} />
            <SettingRow
              label={L("Audit events today", "Sự kiện audit hôm nay")}
              desc={L("From the L0 hash-chained audit log", "Từ audit log băm chuỗi L0")}
              value={dash ? String(dash.safety.events_today) : "…"} />
            <SettingRow
              label={L("Blocked today", "Đã chặn hôm nay")}
              desc={dash && dash.safety.last_incident
                ? L("Last incident: ", "Sự cố gần nhất: ") + dash.safety.last_incident
                : L("No incidents on record", "Chưa ghi nhận sự cố")}
              value={dash ? String(dash.safety.blocked_today) : "…"} />
          </Card>
          <Card title={L("Memory", "Bộ nhớ")}>
            <SettingRow
              label={L("L1 atomic facts", "Fact L1")}
              desc={L("Persisted in memory/L1_atomic", "Lưu tại memory/L1_atomic")}
              value={dash ? String(dash.memories.total) : "…"} />
            <SettingRow label={L("Fresh today", "Mới hôm nay")} value={dash ? String(dash.memories.today) : "…"} />
            <SettingRow label={L("Storage", "Lưu trữ")}
              desc={L("API keys AES-256-GCM encrypted at rest (rule 66)", "API key mã hóa AES-256-GCM khi lưu (rule 66)")}
              value={L("Local · encrypted", "Cục bộ · mã hóa")} />
          </Card>
        </div>

        {/* Chat + Notifications side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: GAP }}>
          <Card title={L("Chat", "Trò chuyện")}>
            <ToggleRow
              label={L("Send on Enter", "Gửi bằng Enter")}
              desc={L("Shift+Enter to add a new line", "Shift+Enter để xuống dòng")}
              storeKey="yana.chat.send-on-enter" defaultVal={true} />
            <ToggleRow
              label={L("Show timestamps", "Hiện thời gian")}
              desc={L("Display time beside each message", "Hiện giờ cạnh mỗi tin nhắn")}
              storeKey="yana.chat.show-timestamps" defaultVal={false} />
            <ToggleRow
              label={L("Compact messages", "Tin nhắn gọn")}
              desc={L("Reduce spacing between bubbles", "Giảm khoảng cách giữa bong bóng")}
              storeKey="yana.chat.compact" defaultVal={false} />
            <ToggleRow
              label={L("Auto-scroll to new messages", "Tự cuộn xuống tin mới")}
              storeKey="yana.chat.auto-scroll" defaultVal={true} />
            <ToggleRow
              label={L("Show model name in header", "Hiện tên model ở đầu trang")}
              desc={L("Display active model above the chat", "Hiện model đang dùng phía trên chat")}
              storeKey="yana.chat.show-model" defaultVal={false} />
          </Card>

          <Card title={L("Notifications", "Thông báo")}>
            <ToggleRow
              label={L("Sound on reply", "Âm báo khi có trả lời")}
              desc={L("Soft chime when Yana finishes replying", "Tiếng chuông nhẹ khi Yana trả lời xong")}
              storeKey="yana.notify.sound" defaultVal={true} />
            <ToggleRow
              label={L("Desktop notifications", "Thông báo màn hình")}
              desc={L("OS notification when window is in background", "Thông báo hệ thống khi cửa sổ thu nhỏ")}
              storeKey="yana.notify.desktop" defaultVal={false} />
            <ToggleRow
              label={L("Agent alerts", "Cảnh báo tác nhân")}
              desc={L("Notify when an agent finishes a long task", "Thông báo khi tác nhân hoàn tất tác vụ dài")}
              storeKey="yana.notify.agents" defaultVal={true} />
            <ToggleRow
              label={L("Error alerts", "Cảnh báo lỗi")}
              desc={L("Notify when a gate or safety rule blocks an action", "Thông báo khi cổng hoặc quy tắc bảo mật chặn hành động")}
              storeKey="yana.notify.errors" defaultVal={true} />
          </Card>
        </div>

        {/* Voice & Data side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: GAP }}>
          <VoiceCard lang={t.language} />
          <DataManagementCard />
        </div>

        {/* Advanced / Developer */}
        <AdvancedCard lang={t.language} />

        {/* About — full width */}
        <Card title={L("About Yana AI", "Về Yana AI")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0 32px" }}>
            <div>
              <SettingRow
                label={L("Version", "Phiên bản")}
                desc={L("Current release", "Phiên bản hiện tại")}
                value={"v" + (D.version || "0.43.0")} />
              <SettingRow
                label={L("Skills", "Kỹ năng")}
                desc={L("On-demand workflow modules", "Module quy trình theo yêu cầu")}
                value={D.stats.skills > 0 ? String(D.stats.skills) : "1988"} />
              <SettingRow
                label={L("Agents", "Tác nhân")}
                desc={L("Specialist parallel workers", "Công nhân song song chuyên biệt")}
                value={D.stats.agents > 0 ? String(D.stats.agents) : "101"} />
            </div>
            <div>
              <SettingRow
                label={L("License", "Giấy phép")}
                value="Apache-2.0" />
              <SettingRow
                label={L("Storage encryption", "Mã hóa lưu trữ")}
                desc={L("AES-256-GCM, non-extractable key", "AES-256-GCM, khóa không thể xuất")}
                value={L("Rule 66 · active", "Rule 66 · đang hoạt động")} />
              <SettingRow
                label={L("Safety rules", "Quy tắc bảo mật")}
                desc={L("Enforcement policies loaded", "Chính sách thực thi đã tải")}
                value="70 rules" />
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}

Object.assign(window, { Providers, Settings });
