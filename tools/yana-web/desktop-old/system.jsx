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
  const usageDisplay   = u ? "~" + fmtTokens(u.est_tokens) + L(" tokens", " tokens", " 토큰", " tokens") : L("Not used yet", "Chưa dùng", "아직 사용 안 함", "尚未使用");
  const latencyDisplay = u && u.avg_latency_ms ? (u.avg_latency_ms / 1000).toFixed(1) + "s" : "—";

  const displayModels = liveModels || p.models;
  const modelLabel = liveModels
    ? L("Live models", "Model thực tế", "실시간 모델", "实时模型")
    : L("Models", "Mô hình", "모델", "模型");

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
                       "Chỉ dùng được trên máy tính — cần server local chạy trên máy này",
                       "데스크톱에서만 사용 가능 — 이 기기에서 로컬 서버가 실행 중이어야 함",
                       "仅限桌面端使用 — 需要在本机运行本地服务器")}>
              🖥 {L("Desktop", "Máy tính", "데스크톱", "桌面端")}
            </span>
          )}
          <span className={"chip " + (connected ? "" : "gold")} style={{ fontSize: 11.5 }}>
            <span className={"dot " + (connected ? "on" : "idle")} style={{ width: 6, height: 6, boxShadow: "none" }}></span>
            {keyless ? L("On-device", "Trên máy", "온디바이스", "本机运行") : connected ? L("Connected", "Kết nối", "연결됨", "已连接") : L("Standby", "Dự phòng", "대기", "待机")}
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
          {checking ? L("Fetching live models…", "Đang tải model thực tế…", "실시간 모델 불러오는 중…", "正在获取实时模型…") : modelLabel}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {displayModels.map((m) => <span key={m} className="chip neutral" style={{ fontSize: 11 }}>{m}</span>)}
        </div>
      </div>

      <div className="grid-3" style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        {[[L("Usage", "Sử dụng", "사용량", "使用量"), usageDisplay], [L("Latency", "Độ trễ", "지연 시간", "延迟"), latencyDisplay]].map(([k, v]) => (
          <div key={k} style={{ lineHeight: 1.35, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{k}</div>
            <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
          </div>
        ))}
        <div style={{ lineHeight: 1.35, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{L("Key", "Khóa", "키", "密钥")}</div>
          {keyless ? (
            <span title={L("On-device provider — no API key needed", "Provider trên máy — không cần API key", "온디바이스 프로바이더 — API 키 불필요", "本机提供商 — 无需 API 密钥")}
              style={{ fontSize: 12, fontWeight: 500, color: "var(--good)" }}>
              {L("keyless", "không cần", "키 불필요", "无需密钥")}
            </span>
          ) : (
            <button onClick={openEdit} title={L("Click to set API key", "Nhấn để đặt API key", "클릭하여 API 키 설정", "点击设置 API 密钥")} style={{
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
            placeholder={L("Paste API key here…", "Dán API key vào đây…", "여기에 API 키를 붙여넣으세요…", "在此粘贴 API 密钥…")}
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
            {saved ? "✓" : L("Save", "Lưu", "저장", "保存")}
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
    if (!next) { alert(L("All providers are connected.", "Tất cả nhà cung cấp đã kết nối.", "모든 프로바이더가 연결되었습니다.", "所有提供商均已连接。")); return; }
    setOpenId(next.id);
    setTimeout(() => {
      const el = document.getElementById("provider-card-" + next.id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  return (
    <div data-screen-label="Providers">
      <PageHeader
        title={L("Providers", "Nhà cung cấp", "프로바이더", "提供商")}
        sub={connected + L(" of ", " trong ", " / ", " / ") + D.providers.length + L(" providers connected · Groq routes, Yana AI supervises every call", " nhà cung cấp đã kết nối · Groq định tuyến, Yana AI giám sát mọi lệnh gọi", " 프로바이더 연결됨 · Groq가 라우팅, Yana AI가 모든 호출을 감독", " 个提供商已连接 · 由 Groq 路由，Yana AI 监督每次调用")}>
        <button onClick={connectNext} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 99,
          border: "none", cursor: "pointer", background: "var(--primary)", color: "white",
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
        }}>{Icons.plus(15)} {L("Connect provider", "Kết nối nhà cung cấp", "프로바이더 연결", "连接提供商")}</button>
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
    [L("Show agents on Lake", "Hiện tác nhân trên Mặt hồ", "호수에 에이전트 표시", "在湖面显示智能体"), "showAgents"],
    [L("Show missions on Lake", "Hiện nhiệm vụ trên Mặt hồ", "호수에 미션 표시", "在湖面显示任务"), "showMissions"],
    [L("Show Memory Garden", "Hiện Vườn ký ức", "메모리 가든 표시", "显示记忆花园"), "showMemory"],
    [L("Show system status", "Hiện trạng thái hệ thống", "시스템 상태 표시", "显示系统状态"), "showSystem"],
    [L("Reduce motion", "Giảm chuyển động", "모션 줄이기", "减少动效"), "reduceMotion"],
  ];
  return (
    <Card title={L("Appearance", "Giao diện", "외관", "外观")} style={{ gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
        {THEME_PREVIEWS.map((p) => (
          <ThemeCard key={p.label} p={p} active={t.theme === p.label} onPick={() => setTweak("theme", p.label)} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, width: 110, flex: "none" }}>{L("Accent colour", "Màu nhấn", "강조 색상", "强调色")}</span>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <button onClick={() => setTweak("accent", "")} title={L("Theme default", "Màu mặc định theme", "테마 기본값", "主题默认色")} style={{
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
          {t.accent ? t.accent : L("Theme default", "Màu mặc định", "테마 기본값", "主题默认色")}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, width: 110, flex: "none" }}>{L("Density", "Mật độ", "밀도", "密度")}</span>
        <YSeg options={["Compact", "Regular", "Spacious"]} value={t.layout} onChange={(v) => setTweak("layout", v)} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, width: 110, flex: "none" }}>{L("Chat font", "Font trò chuyện", "채팅 글꼴", "聊天字体")}</span>
        <YSeg
          options={["System", "Be Vietnam", "Mono"]}
          value={t.chatFont || "System"}
          onChange={(v) => setTweak("chatFont", v)}
        />
        <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: "auto" }}>
          {(t.chatFont || "System") === "System"    && L("ui-sans-serif — fastest", "ui-sans-serif — nhanh nhất", "ui-sans-serif — 가장 빠름", "ui-sans-serif — 最快")}
          {(t.chatFont || "System") === "Be Vietnam" && L("Be Vietnam Pro — elegant", "Be Vietnam Pro — thanh lịch", "Be Vietnam Pro — 우아함", "Be Vietnam Pro — 优雅")}
          {(t.chatFont || "System") === "Mono"       && L("ui-monospace — code-ready", "ui-monospace — thân thiện code", "ui-monospace — 코드에 적합", "ui-monospace — 适合代码")}
        </span>
      </div>

      <div style={{ padding: "8px 0 0", borderTop: "1px solid var(--border)" }}>
        <SliderRow label={L("Blur", "Mờ", "블러", "模糊")} value={t.blur} onChange={(v) => setTweak("blur", v)} />
        <SliderRow label={L("Transparency", "Trong suốt", "투명도", "透明度")} value={t.transparency} onChange={(v) => setTweak("transparency", v)} />
        <SliderRow label={L("Reflection", "Phản chiếu", "반사", "反光")} value={t.reflection} onChange={(v) => setTweak("reflection", v)} />
        <SliderRow label={L("Depth", "Độ sâu", "깊이", "深度")} value={t.depth} onChange={(v) => setTweak("depth", v)} />
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
          {Icons.check(11)} {L("Planted in Memory Garden", "Đã lưu vào Vườn ký ức", "메모리 가든에 저장됨", "已存入记忆花园")}
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
    <Card title={L("About you", "Về bạn", "당신에 대하여", "关于你")} style={{ gridColumn: "1 / -1" }}
      aside={<span className="chip pink" style={{ fontSize: 11 }}>{Icons.memory(12)} {L("Pinned · never pruned", "Đã ghim · không bao giờ xóa", "고정됨 · 삭제되지 않음", "已固定 · 永不清除")}</span>}>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
        {L(
          "Yana reads this before every mission. The more honestly you describe yourself, the better she routes, plans, and phrases things for you.",
          "Yana đọc phần này trước mỗi nhiệm vụ. Bạn mô tả bản thân càng thực tế, cô ấy càng định tuyến, lên kế hoạch và diễn đạt tốt hơn cho bạn.",
          "Yana는 모든 미션 전에 이 내용을 읽습니다. 자신을 솔직하게 설명할수록 라우팅, 계획, 표현이 더 잘 맞춰집니다.",
          "Yana 会在每次任务前阅读这些内容。你对自己的描述越真实，她的路由、规划和表达就越贴合你。"
        )}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <AboutField id="who" label={L("Who you are", "Bạn là ai", "당신은 누구인가요", "你是谁")}
          hint={L("Role, what you're building, how you work", "Vai trò, bạn đang xây dựng gì, cách bạn làm việc", "역할, 만들고 있는 것, 일하는 방식", "角色、你在构建什么、你的工作方式")}
          placeholder={L("e.g. I'm a system builder. I think in workflows, not code.", "e.g. Tôi xây hệ thống. Tôi nghĩ theo luồng công việc, không phải code.", "예: 저는 시스템을 만듭니다. 코드보다 워크플로우로 생각해요.", "例：我是系统构建者，习惯以工作流而非代码来思考。")} rows={4} />
        <AboutField id="strengths" label={L("Strengths", "Điểm mạnh", "강점", "优势")}
          hint={L("What Yana should lean on", "Điều Yana nên dựa vào", "Yana가 의지해야 할 부분", "Yana 应该依靠的方面")}
          placeholder={L("e.g. Big-picture architecture, fast decisions.", "e.g. Kiến trúc tổng thể, ra quyết định nhanh.", "예: 큰 그림의 아키텍처, 빠른 의사결정.", "例：把握整体架构，决策迅速。")} rows={4} />
        <AboutField id="weaknesses" label={L("Weak spots", "Điểm yếu", "약점", "弱项")}
          hint={L("Where Yana should quietly cover for you", "Nơi Yana nên lặng lẽ hỗ trợ bạn", "Yana가 조용히 보완해줘야 할 부분", "Yana 应默默为你弥补的地方")}
          placeholder={L("e.g. I lose patience with long documents.", "e.g. Tôi mất kiên nhẫn với tài liệu dài.", "예: 긴 문서를 보면 인내심을 잃어요.", "例：面对长文档容易失去耐心。")} rows={4} />
        <AboutField id="style" label={L("How Yana should respond", "Yana nên trả lời thế nào", "Yana가 응답하는 방식", "Yana 应如何回应")}
          hint={L("Tone, length, language", "Giọng điệu, độ dài, ngôn ngữ", "어조, 길이, 언어", "语气、长度、语言")}
          placeholder={L("e.g. Calm and brief. Vietnamese is fine for casual notes.", "e.g. Bình tĩnh và ngắn gọn. Tiếng Việt được cho ghi chú thường ngày.", "예: 차분하고 간결하게. 편한 메모는 한국어도 괜찮아요.", "例：冷静简短。日常笔记用中文也可以。")} rows={4} />
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
        <button onClick={startEdit} title={L("Click to edit", "Nhấn để sửa", "클릭하여 수정", "点击编辑")} style={{
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
        { "Tiếng Việt": "vi-VN", "한국어": "ko-KR", "中文": "zh-CN" }[t.language] || "en-US",
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
    { v: D.stats.agents,                  lb: L("agents", "tác nhân", "에이전트", "智能体") },
    { v: dash ? dash.memories.total : "…", lb: L("memories", "ký ức", "메모리", "记忆") },
    { v: connectedCount + "/" + D.providers.length, lb: L("providers", "kết nối", "프로바이더", "提供商") },
    { v: L("Strict", "Nghiêm", "엄격", "严格"),            lb: L("gate mode", "chế độ cổng", "게이트 모드", "门控模式") },
  ];

  const MODES = [
    { key: "light", icon: "☀️", label: L("Light", "Sáng", "라이트", "浅色") },
    { key: "dark",  icon: "🌙", label: L("Dark", "Tối", "다크", "深色") },
    { key: "auto",  icon: "✦",  label: L("Auto", "Tự động", "자동", "自动") },
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
          title={L("Change photo", "Đổi ảnh đại diện", "사진 변경", "更换照片")}
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
                <button onClick={editName} title={L("Edit name", "Sửa tên", "이름 수정", "编辑名称")} style={{
                  background: "none", border: "none", padding: "2px 8px", borderRadius: 6, cursor: "pointer",
                  fontSize: 11, color: "var(--ink-3)",
                }}>✎</button>
              </>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 3 }}>{account}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
            {L("Member since", "Thành viên từ", "가입일", "加入于")} {memberSince}
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
          {L("Appearance mode", "Chế độ hiển thị", "화면 모드", "外观模式")}
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
const ROLE_OPTIONS_KO = ["엔지니어링", "소프트웨어 개발", "데이터 사이언스 / AI", "디자인", "제품 관리", "마케팅", "연구", "비즈니스", "교육", "자동화 / 로보틱스", "기계공학", "기타"];
const ROLE_OPTIONS_ZH = ["工程", "软件开发", "数据科学 / AI", "设计", "产品管理", "市场营销", "研究", "商业", "教育", "自动化 / 机器人", "机械工程", "其他"];
const ROLE_OPTIONS_MAP = { "Tiếng Việt": ROLE_OPTIONS_VI, "한국어": ROLE_OPTIONS_KO, "中文": ROLE_OPTIONS_ZH };

function ProfileCard({ lang }) {
  const ROLE_OPTIONS = ROLE_OPTIONS_MAP[lang] || ROLE_OPTIONS_EN;
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
    <Card title={L("Profile", "Hồ sơ cá nhân", "프로필", "个人资料")}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Profession / Role", "Lĩnh vực hoạt động", "직업 / 역할", "职业 / 角色")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Shapes how Yana frames context", "Định hình cách Yana xử lý ngữ cảnh", "Yana가 맥락을 구성하는 방식에 영향", "影响 Yana 组织上下文的方式")}</div>
        </div>
        <select value={role} onChange={onRoleChange} style={{
          border: "1px solid var(--border)", borderRadius: 99, padding: "5px 10px",
          background: "transparent", color: "var(--primary)", fontSize: 12,
          fontWeight: 500, fontFamily: "inherit", cursor: "pointer", maxWidth: 190,
        }}>
          <option value="">{L("— select —", "— chọn —", "— 선택 —", "— 选择 —")}</option>
          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: "calc(11px * var(--sp))" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Yana Instructions", "Chỉ thị cho Yana", "Yana 지시사항", "Yana 指令")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
              {L("Rules Yana follows in every conversation", "Quy tắc Yana tuân theo trong mọi cuộc trò chuyện", "모든 대화에서 Yana가 따르는 규칙", "Yana 在每次对话中遵循的规则")}
            </div>
          </div>
          <span style={{ fontSize: 11, color: "var(--good)", opacity: savedInstr ? 1 : 0, transition: "opacity .3s", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {Icons.check(11)} {L("Saved", "Đã lưu", "저장됨", "已保存")}
          </span>
        </div>
        <textarea value={instr} onChange={onInstrChange} rows={5}
          placeholder={L(
            "e.g. Always explain briefly. Prefer optimised code for Mac M4. Reply in Vietnamese for casual notes.",
            "e.g. Luôn giải thích ngắn gọn. Ưu tiên code tối ưu cho Mac M4. Trả lời tiếng Việt cho ghi chú thường ngày.",
            "예: 항상 간단히 설명. Mac M4에 최적화된 코드 선호. 편한 메모는 한국어로 답변.",
            "例：始终简明扼要。优先使用针对 Mac M4 优化的代码。日常笔记用中文回复。"
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

const SPEED_OPTS_MAP = {
  "Tiếng Việt": ["Chậm", "Bình thường", "Nhanh"],
  "한국어": ["느림", "보통", "빠름"],
  "中文": ["慢", "正常", "快"],
};

function VoiceCard({ lang }) {
  const isVI = lang === "Tiếng Việt";
  const speedOpts = SPEED_OPTS_MAP[lang] || ["Slow", "Normal", "Fast"];
  const speedRate = { [speedOpts[0]]: 0.7, [speedOpts[1]]: 1.0, [speedOpts[2]]: 1.4 };

  const defaultVoiceLang = { "Tiếng Việt": "vi-VN", "한국어": "ko-KR", "中文": "zh-CN" }[lang] || "en-US";
  const [voiceLang, setVoiceLang] = React.useState(
    () => localStorage.getItem("yana.voice.lang") || defaultVoiceLang
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
      { "Tiếng Việt": "Xin chào, tôi là Yana AI. Bạn nghe rõ không?", "한국어": "안녕하세요, 저는 Yana AI입니다. 잘 들리나요?", "中文": "你好，我是 Yana AI。你能听清楚吗？" }[lang] || "Hello, I am Yana AI. Can you hear me clearly?"
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
    <Card title={L("Voice & Speech", "Giọng nói & Phản hồi", "음성 및 스피치", "语音与语音输出")}>
      {!hasTTS && (
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", padding: "8px 0 4px" }}>
          {L("Text-to-speech is not available in this browser.", "Trình duyệt này chưa hỗ trợ đọc văn bản.", "이 브라우저에서는 텍스트 음성 변환을 사용할 수 없습니다.", "此浏览器不支持文字转语音。")}
        </div>
      )}

      {/* Language */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Language", "Ngôn ngữ giọng nói", "음성 언어", "语音语言")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Language for text-to-speech output", "Ngôn ngữ cho đầu ra giọng nói", "텍스트 음성 변환에 사용할 언어", "文字转语音输出所用的语言")}</div>
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
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Voice", "Giọng đọc", "음성", "语音")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{voices.length + L(" voices available", " giọng khả dụng", "개 음성 사용 가능", " 个可用语音")}</div>
          </div>
          <select value={selected} onChange={e => { setSelected(e.target.value); persist("yana.voice.name", e.target.value); }}
            style={{ border: "1px solid var(--border)", borderRadius: 99, padding: "5px 10px", background: "transparent", color: "var(--primary)", fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", maxWidth: 200 }}>
            {voices.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </div>
      )}

      {/* Speed */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Speed", "Tốc độ", "속도", "速度")}</div>
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
          {testing ? "🔊 " + L("Speaking…", "Đang đọc…", "말하는 중…", "朗读中…") : "▶ " + L("Test voice", "Thử giọng", "음성 테스트", "试听语音")}
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
    <Card title={L("Data Management", "Quản lý dữ liệu", "데이터 관리", "数据管理")}>
      {/* Export */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Export data", "Xuất dữ liệu", "데이터 내보내기", "导出数据")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {L("Download all settings, memories and usage as JSON", "Tải về cài đặt, ký ức và lịch sử dùng dạng JSON", "모든 설정, 메모리, 사용량을 JSON으로 다운로드", "以 JSON 格式下载所有设置、记忆和使用记录")}
          </div>
        </div>
        <button onClick={exportData} disabled={exporting} style={{ ...btnBase, background: "transparent", color: "var(--primary)" }}>
          {done === "export" ? "✓ " + L("Downloaded", "Đã tải", "다운로드됨", "已下载") : exporting ? L("Exporting…", "Đang xuất…", "내보내는 중…", "导出中…") : "↓ " + L("Export", "Xuất", "내보내기", "导出")}
        </button>
      </div>

      {/* Clear chat */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Clear chat history", "Xóa lịch sử trò chuyện", "채팅 기록 지우기", "清除聊天记录")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {L("Remove all messages from the current session", "Xóa tất cả tin nhắn trong phiên hiện tại", "현재 세션의 모든 메시지 삭제", "删除当前会话中的所有消息")}
          </div>
        </div>
        {confirm === "clear-chat" ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={clearChat} style={{ ...btnBase, background: "var(--destructive, #e84040)", color: "#fff", border: "none" }}>
              {L("Confirm", "Xác nhận", "확인", "确认")}
            </button>
            <button onClick={() => setConfirm(null)} style={{ ...btnBase, background: "transparent", color: "var(--ink-3)" }}>
              {L("Cancel", "Huỷ", "취소", "取消")}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirm("clear-chat")} style={{ ...btnBase, background: "transparent", color: done === "clear" ? "var(--good)" : "var(--ink-2)" }}>
            {done === "clear" ? "✓ " + L("Cleared", "Đã xóa", "삭제됨", "已清除") : L("Clear", "Xóa", "지우기", "清除")}
          </button>
        )}
      </div>

      {/* Reset all */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingTop: "calc(11px * var(--sp))" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Reset to defaults", "Khôi phục mặc định", "기본값으로 재설정", "恢复默认设置")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {L("Wipe all settings and reload — API keys are preserved", "Xóa toàn bộ cài đặt và tải lại — API key vẫn giữ nguyên", "모든 설정을 초기화 후 새로고침 — API 키는 유지됨", "清除所有设置并重新加载 — API 密钥保留")}
          </div>
        </div>
        {confirm === "reset" ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={resetAll} style={{ ...btnBase, background: "var(--destructive, #e84040)", color: "#fff", border: "none" }}>
              {done === "reset" ? L("Resetting…", "Đang khôi phục…", "재설정 중…", "重置中…") : L("Confirm reset", "Xác nhận", "재설정 확인", "确认重置")}
            </button>
            <button onClick={() => setConfirm(null)} style={{ ...btnBase, background: "transparent", color: "var(--ink-3)" }}>
              {L("Cancel", "Huỷ", "취소", "取消")}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirm("reset")} style={{ ...btnBase, background: "transparent", color: "var(--ink-2)" }}>
            {L("Reset", "Khôi phục", "재설정", "重置")}
          </button>
        )}
      </div>
    </Card>
  );
}

/* ---------- Settings: Model Hyperparameters card ---------- */
function ModelParamsCard({ lang }) {
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
  const TEMP_ZONE_MAP = {
    "Tiếng Việt": { precise: ["Chính xác", "Code, phân tích, sửa lỗi"], balanced: ["Cân bằng", "Giải thích, tóm tắt, Q&A"], creative: ["Sáng tạo", "Viết lách, brainstorm, ý tưởng"], veryCreative: ["Rất sáng tạo", "Thơ, kịch bản, thử nghiệm"] },
    "한국어": { precise: ["정밀", "코드, 분석, 버그 수정"], balanced: ["균형", "설명, 요약, Q&A"], creative: ["창의적", "글쓰기, 브레인스토밍, 아이디어"], veryCreative: ["매우 창의적", "시, 대본, 실험"] },
    "中文": { precise: ["精确", "代码、分析、修复错误"], balanced: ["均衡", "解释、总结、问答"], creative: ["有创意", "写作、头脑风暴、创意"], veryCreative: ["非常有创意", "诗歌、剧本、实验"] },
  };
  const tempZoneDict = TEMP_ZONE_MAP[lang] || { precise: ["Precise", "Code, analysis, bug fixes"], balanced: ["Balanced", "Explanations, summaries, Q&A"], creative: ["Creative", "Writing, brainstorm, ideas"], veryCreative: ["Very creative", "Poetry, scripts, experiments"] };
  function tempZone(t) {
    if (t <= 0.2) return tempZoneDict.precise;
    if (t <= 0.5) return tempZoneDict.balanced;
    if (t <= 0.79) return tempZoneDict.creative;
    return tempZoneDict.veryCreative;
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
    <Card title={L("Model Parameters", "Tham số mô hình", "모델 파라미터", "模型参数")}>

      {/* Temperature */}
      <div style={{ paddingBottom: "calc(14px * var(--sp))", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Temperature", "Nhiệt độ", "온도", "温度")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Controls creativity vs precision", "Điều chỉnh sáng tạo so với chính xác", "창의성과 정확성의 균형 조절", "调节创意与精确度")}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color }}>{temp.toFixed(2)}</span>
            <div style={{ fontSize: 11, color, fontWeight: 500 }}>{zoneName}</div>
          </div>
        </div>

        <input type="range" min="0" max="1" step="0.01" value={temp} onChange={onTempChange}
          style={{ width: "100%", accentColor: color, height: 4, marginBottom: 6 }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)" }}>
          <span>0.0 — {tempZoneDict.precise[0]}</span>
          <span style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "center" }}>{zoneDesc}</span>
          <span>1.0 — {tempZoneDict.creative[0]}</span>
        </div>
      </div>

      {/* Max tokens */}
      <div style={{ paddingTop: "calc(12px * var(--sp))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Max response tokens", "Giới hạn token phản hồi", "최대 응답 토큰", "最大回复 token 数")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {"≈ " + Math.round(TOKEN_MAP[maxTok] * 0.75).toLocaleString() + L(" words", " từ", "단어", " 词")}
            </div>
          </div>
          <YSeg options={TOKEN_OPTS} value={maxTok} onChange={onMaxTokChange} />
        </div>
      </div>
    </Card>
  );
}

/* ---------- Settings main ---------- */
const ADVANCED_CARD_STR = {
  "Tiếng Việt": { title: "Nâng cao / Nhà phát triển", devMode: "Chế độ nhà phát triển", devModeDesc: "Hiển thị thời gian phản hồi và ước lượng token dưới mỗi câu trả lời", expandThink: "Luôn mở rộng suy nghĩ", expandThinkDesc: "Tự động mở khối <think> thay vì thu gọn" },
  "한국어": { title: "고급 / 개발자", devMode: "개발자 모드", devModeDesc: "각 답변 아래에 응답 시간과 예상 토큰 수를 표시", expandThink: "항상 생각 과정 펼치기", expandThinkDesc: "<think> 블록을 접지 않고 자동으로 펼침" },
  "中文": { title: "高级 / 开发者", devMode: "开发者模式", devModeDesc: "在每条回复下方显示响应时间和预估 token 数", expandThink: "始终展开思考过程", expandThinkDesc: "自动展开 <think> 块，而不是折叠" },
};

function AdvancedCard({ lang }) {
  const S = ADVANCED_CARD_STR[lang] || { title: "Advanced / Developer", devMode: "Developer mode", devModeDesc: "Show response time and estimated token count under each reply", expandThink: "Always expand thinking", expandThinkDesc: "Auto-open <think> blocks instead of collapsing them" };
  return (
    <Card title={S.title}>
      <ToggleRow
        label={S.devMode}
        desc={S.devModeDesc}
        storeKey="yana.dev.mode"
        defaultVal={false} />
      <ToggleRow
        label={S.expandThink}
        desc={S.expandThinkDesc}
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
  const chain = available.map((p) => p.name).join(" → ") || L("None — add a key in Providers", "Chưa có — thêm key ở Nhà cung cấp", "없음 — 프로바이더에서 키 추가", "无 — 请在提供商中添加密钥");

  const LANG_CYCLE = ["English", "Tiếng Việt", "한국어", "中文"];
  function toggleLang() {
    const idx = LANG_CYCLE.indexOf(t.language);
    setTweak("language", LANG_CYCLE[(idx + 1) % LANG_CYCLE.length]);
  }
  const langDisplay = LANG_CYCLE.map((l) => l === t.language ? l + " ✓" : l).join(" / ");

  const GAP = "var(--gap)";
  return (
    <div data-screen-label="Settings">
      <PageHeader
        title={L("Settings", "Cài đặt", "설정", "设置")}
        sub={L("Quiet defaults. Everything supervised by Yana AI Core.", "Cài đặt mặc định. Mọi thứ được Yana AI Core giám sát.", "조용한 기본값. 모든 것이 Yana AI Core의 감독 아래 있습니다.", "低调的默认设置。一切均由 Yana AI Core 监督。")} />

      <div style={{ display: "flex", flexDirection: "column", gap: GAP, maxWidth: 900 }}>

        {/* Profile hero */}
        <ProfileHero t={t} setTweak={setTweak} dash={dash} />

        {/* Profile card — profession + custom instructions */}
        <ProfileCard lang={t.language} />

        {/* Appearance — full width */}
        <AppearanceCard t={t} setTweak={setTweak} />

        {/* Workspace + Orchestration side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: GAP }}>
          <Card title={L("Workspace", "Không gian làm việc", "워크스페이스", "工作区")}>
            <EditableRow label={L("Workspace name", "Tên không gian", "워크스페이스 이름", "工作区名称")} storeKey="yana.workspace.name"
              fallback={L("Yana's Lake", "Mặt hồ của Yana", "Yana의 호수", "Yana 的湖")} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ lineHeight: 1.35 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Language", "Ngôn ngữ", "언어", "语言")}</div>
              </div>
              <button onClick={toggleLang} style={{
                background: "none", border: "1px solid var(--border)", padding: "4px 12px",
                borderRadius: 99, cursor: "pointer", fontSize: 12, color: "var(--primary)",
                fontWeight: 500, fontFamily: "inherit",
              }}>{langDisplay}</button>
            </div>
            <SettingRow label={L("Timezone", "Múi giờ", "시간대", "时区")}
              desc={L("Detected from this browser", "Phát hiện từ trình duyệt này", "이 브라우저에서 감지됨", "从此浏览器检测")}
              value={detectTimezone()} />
          </Card>

          <Card title={L("Orchestration", "Điều phối", "오케스트레이션", "编排")}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ lineHeight: 1.35 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Default provider", "Nhà cung cấp mặc định", "기본 프로바이더", "默认提供商")}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Used by Chat unless overridden", "Chat dùng mặc định này trừ khi chọn khác", "따로 지정하지 않으면 채팅에서 사용", "除非另行指定，否则聊天将使用此项")}</div>
              </div>
              <select value={defProvider} onChange={(e) => pickProvider(e.target.value)} style={{
                border: "1px solid var(--border)", borderRadius: 99, padding: "5px 10px",
                background: "transparent", color: "var(--primary)", fontSize: 12,
                fontWeight: 500, fontFamily: "inherit", cursor: "pointer", maxWidth: 150,
              }}>
                <option value="">{L("Auto (first connected)", "Tự động (kết nối đầu tiên)", "자동 (첫 연결)", "自动（首个已连接）")}</option>
                {D.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!providerAvailable(p.id)}>
                    {p.name}{p.desktopOnly ? " 🖥" : ""}{providerAvailable(p.id) ? "" : " 🔒"}
                  </option>
                ))}
              </select>
            </div>
            <SettingRow
              label={L("Task routing", "Định tuyến tác vụ", "작업 라우팅", "任务路由")}
              desc={L("yana-rt classifier — local, before any provider call", "yana-rt classifier — chạy local, trước mọi lệnh gọi provider", "yana-rt 분류기 — 프로바이더 호출 전 로컬에서 실행", "yana-rt 分类器 — 在调用任何提供商之前于本地运行")}
              value={L("simple · complex · external", "simple · complex · external", "simple · complex · external", "simple · complex · external")} />
            <SettingRow label={L("Fallback chain", "Chuỗi dự phòng", "폴백 체인", "回退链")}
              desc={L("Connected providers, in order", "Các nhà cung cấp đã kết nối, theo thứ tự", "연결된 프로바이더, 순서대로", "已连接的提供商，按顺序")}
              value={chain} />
          </Card>
        </div>

        {/* Model Parameters — full width */}
        <ModelParamsCard lang={t.language} />

        {/* About you — full width */}
        <AboutYouCard />

        {/* Safety + Memory side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: GAP }}>
          <Card title={L("Safety", "Bảo mật", "안전", "安全")}>
            <SettingRow
              label={L("Gate mode", "Chế độ cổng", "게이트 모드", "门控模式")}
              desc={L("Every agent action is reviewed", "Mọi hành động của tác nhân đều được xem xét", "모든 에이전트 동작이 검토됨", "所有智能体操作均经过审查")}
              value={L("Strict · deny by default", "Nghiêm ngặt · từ chối mặc định", "엄격 · 기본 거부", "严格 · 默认拒绝")} />
            <SettingRow
              label={L("Audit events today", "Sự kiện audit hôm nay", "오늘의 감사 이벤트", "今日审计事件")}
              desc={L("From the L0 hash-chained audit log", "Từ audit log băm chuỗi L0", "L0 해시체인 감사 로그 기준", "来自 L0 哈希链审计日志")}
              value={dash ? String(dash.safety.events_today) : "…"} />
            <SettingRow
              label={L("Blocked today", "Đã chặn hôm nay", "오늘 차단됨", "今日已拦截")}
              desc={dash && dash.safety.last_incident
                ? L("Last incident: ", "Sự cố gần nhất: ", "최근 사건: ", "最近事件：") + dash.safety.last_incident
                : L("No incidents on record", "Chưa ghi nhận sự cố", "기록된 사건 없음", "暂无记录事件")}
              value={dash ? String(dash.safety.blocked_today) : "…"} />
          </Card>
          <Card title={L("Memory", "Bộ nhớ", "메모리", "记忆")}>
            <SettingRow
              label={L("L1 atomic facts", "Fact L1", "L1 원자적 사실", "L1 原子事实")}
              desc={L("Persisted in memory/L1_atomic", "Lưu tại memory/L1_atomic", "memory/L1_atomic에 저장됨", "持久化存储于 memory/L1_atomic")}
              value={dash ? String(dash.memories.total) : "…"} />
            <SettingRow label={L("Fresh today", "Mới hôm nay", "오늘 추가됨", "今日新增")} value={dash ? String(dash.memories.today) : "…"} />
            <SettingRow label={L("Storage", "Lưu trữ", "저장소", "存储")}
              desc={L("API keys AES-256-GCM encrypted at rest (rule 66)", "API key mã hóa AES-256-GCM khi lưu (rule 66)", "API 키는 저장 시 AES-256-GCM으로 암호화됨 (rule 66)", "API 密钥静态存储时使用 AES-256-GCM 加密（规则 66）")}
              value={L("Local · encrypted", "Cục bộ · mã hóa", "로컬 · 암호화됨", "本地 · 已加密")} />
          </Card>
        </div>

        {/* Chat + Notifications side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: GAP }}>
          <Card title={L("Chat", "Trò chuyện", "채팅", "聊天")}>
            <ToggleRow
              label={L("Send on Enter", "Gửi bằng Enter", "Enter로 전송", "按 Enter 发送")}
              desc={L("Shift+Enter to add a new line", "Shift+Enter để xuống dòng", "Shift+Enter로 줄바꿈", "Shift+Enter 换行")}
              storeKey="yana.chat.send-on-enter" defaultVal={true} />
            <ToggleRow
              label={L("Show timestamps", "Hiện thời gian", "타임스탬프 표시", "显示时间戳")}
              desc={L("Display time beside each message", "Hiện giờ cạnh mỗi tin nhắn", "각 메시지 옆에 시간 표시", "在每条消息旁显示时间")}
              storeKey="yana.chat.show-timestamps" defaultVal={false} />
            <ToggleRow
              label={L("Compact messages", "Tin nhắn gọn", "간결한 메시지", "紧凑消息")}
              desc={L("Reduce spacing between bubbles", "Giảm khoảng cách giữa bong bóng", "말풍선 간격 줄이기", "减少消息气泡间距")}
              storeKey="yana.chat.compact" defaultVal={false} />
            <ToggleRow
              label={L("Auto-scroll to new messages", "Tự cuộn xuống tin mới", "새 메시지로 자동 스크롤", "自动滚动到新消息")}
              storeKey="yana.chat.auto-scroll" defaultVal={true} />
            <ToggleRow
              label={L("Show model name in header", "Hiện tên model ở đầu trang", "헤더에 모델 이름 표시", "在页眉显示模型名称")}
              desc={L("Display active model above the chat", "Hiện model đang dùng phía trên chat", "채팅 위에 사용 중인 모델 표시", "在聊天上方显示当前使用的模型")}
              storeKey="yana.chat.show-model" defaultVal={false} />
          </Card>

          <Card title={L("Notifications", "Thông báo", "알림", "通知")}>
            <ToggleRow
              label={L("Sound on reply", "Âm báo khi có trả lời", "답변 시 알림음", "回复时提示音")}
              desc={L("Soft chime when Yana finishes replying", "Tiếng chuông nhẹ khi Yana trả lời xong", "Yana의 답변이 끝나면 은은한 차임벨", "Yana 回复完成时的轻柔提示音")}
              storeKey="yana.notify.sound" defaultVal={true} />
            <ToggleRow
              label={L("Desktop notifications", "Thông báo màn hình", "데스크톱 알림", "桌面通知")}
              desc={L("OS notification when window is in background", "Thông báo hệ thống khi cửa sổ thu nhỏ", "창이 백그라운드에 있을 때 OS 알림", "窗口处于后台时显示系统通知")}
              storeKey="yana.notify.desktop" defaultVal={false} />
            <ToggleRow
              label={L("Agent alerts", "Cảnh báo tác nhân", "에이전트 알림", "智能体提醒")}
              desc={L("Notify when an agent finishes a long task", "Thông báo khi tác nhân hoàn tất tác vụ dài", "에이전트가 긴 작업을 마치면 알림", "智能体完成长时间任务时通知")}
              storeKey="yana.notify.agents" defaultVal={true} />
            <ToggleRow
              label={L("Error alerts", "Cảnh báo lỗi", "오류 알림", "错误提醒")}
              desc={L("Notify when a gate or safety rule blocks an action", "Thông báo khi cổng hoặc quy tắc bảo mật chặn hành động", "게이트나 안전 규칙이 작업을 차단하면 알림", "门控或安全规则阻止操作时通知")}
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
        <Card title={L("About Yana AI", "Về Yana AI", "Yana AI 소개", "关于 Yana AI")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0 32px" }}>
            <div>
              <SettingRow
                label={L("Version", "Phiên bản", "버전", "版本")}
                desc={L("Current release", "Phiên bản hiện tại", "현재 릴리스", "当前版本")}
                value={"v" + (D.version || "0.43.0")} />
              <SettingRow
                label={L("Skills", "Kỹ năng", "스킬", "技能")}
                desc={L("On-demand workflow modules", "Module quy trình theo yêu cầu", "필요 시 사용하는 워크플로우 모듈", "按需调用的工作流模块")}
                value={D.stats.skills > 0 ? String(D.stats.skills) : "1988"} />
              <SettingRow
                label={L("Agents", "Tác nhân", "에이전트", "智能体")}
                desc={L("Specialist parallel workers", "Công nhân song song chuyên biệt", "병렬로 작동하는 전문 워커", "并行工作的专业执行体")}
                value={D.stats.agents > 0 ? String(D.stats.agents) : "101"} />
            </div>
            <div>
              <SettingRow
                label={L("License", "Giấy phép", "라이선스", "许可证")}
                value="Apache-2.0" />
              <SettingRow
                label={L("Storage encryption", "Mã hóa lưu trữ", "저장소 암호화", "存储加密")}
                desc={L("AES-256-GCM, non-extractable key", "AES-256-GCM, khóa không thể xuất", "AES-256-GCM, 추출 불가능한 키", "AES-256-GCM，密钥不可导出")}
                value={L("Rule 66 · active", "Rule 66 · đang hoạt động", "Rule 66 · 활성", "Rule 66 · 已启用")} />
              <SettingRow
                label={L("Safety rules", "Quy tắc bảo mật", "안전 규칙", "安全规则")}
                desc={L("Enforcement policies loaded", "Chính sách thực thi đã tải", "실행 정책 로드됨", "已加载执行策略")}
                value="70 rules" />
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}

Object.assign(window, { Providers, Settings });
