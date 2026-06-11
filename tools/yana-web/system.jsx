// Yana AI — Providers + Settings
function fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function ProviderCard({ p, usage, onKeyChange }) {
  const [hasKey, setHasKey] = React.useState(() => YanaVault.hasKey(p.id));
  const connected = hasKey; // real: a stored API key means connected
  const [liveModels, setLiveModels] = React.useState(null);
  const [checking, setChecking] = React.useState(false);

  async function fetchLiveModels(key) {
    if (p.id !== "openrouter" && p.id !== "groq") return;
    setChecking(true);
    try {
      const r = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p.id, key }),
      });
      if (r.ok) {
        const { models } = await r.json();
        setLiveModels(models.slice(0, 6).map((m) => m.name || m.id));
      }
    } catch (_) {}
    setChecking(false);
  }

  async function promptKey() {
    const current = YanaVault.getKey(p.id) || "";
    const raw = window.prompt(L("API key for ", "API key cho ") + p.name + L(" (leave blank to clear):", " (để trống để xóa):"), current);
    if (raw === null) return;
    const trimmed = raw.trim();
    if (trimmed) {
      await YanaVault.setKey(p.id, trimmed);
      setHasKey(true);
      fetchLiveModels(trimmed);
    } else {
      YanaVault.removeKey(p.id);
      setHasKey(false);
      setLiveModels(null);
    }
    if (onKeyChange) onKeyChange();
  }

  const keyDisplay = hasKey
    ? YanaVault.getKey(p.id).slice(0, 8) + "····"
    : "—";

  const u = usage && usage[p.id];
  const usageDisplay   = u ? "~" + fmtTokens(u.est_tokens) + L(" tokens", " tokens") : L("Not used yet", "Chưa dùng");
  const latencyDisplay = u && u.avg_latency_ms ? (u.avg_latency_ms / 1000).toFixed(1) + "s" : "—";

  const displayModels = liveModels || p.models;
  const modelLabel = liveModels
    ? L("Live models", "Model thực tế")
    : L("Models", "Mô hình");

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
          {connected ? L("Connected", "Kết nối") : L("Standby", "Dự phòng")}
        </span>
      </div>

      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{p.role}</div>

      <div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 5 }}>
          {checking ? L("Fetching live models…", "Đang tải model thực tế…") : modelLabel}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {displayModels.map((m) => <span key={m} className="chip neutral" style={{ fontSize: 11 }}>{m}</span>)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        {[[L("Usage", "Sử dụng"), usageDisplay], [L("Latency", "Độ trễ"), latencyDisplay]].map(([k, v]) => (
          <div key={k} style={{ lineHeight: 1.35, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{k}</div>
            <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
          </div>
        ))}
        <div style={{ lineHeight: 1.35, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{L("Key", "Khóa")}</div>
          <button onClick={promptKey} title={L("Click to set API key", "Nhấn để đặt API key")} style={{
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
  const [usage, setUsage] = React.useState(null);
  const [, bump] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setUsage(d.usage); })
      .catch(() => {});
  }, []);

  const connected = D.providers.filter((p) => YanaVault.hasKey(p.id)).length;

  // Connect provider: open the key prompt for the first provider without a key
  async function connectNext() {
    const next = D.providers.find((p) => !YanaVault.hasKey(p.id));
    if (!next) { alert(L("All providers are connected.", "Tất cả nhà cung cấp đã kết nối.")); return; }
    const raw = window.prompt(L("API key for ", "API key cho ") + next.name + ":");
    if (raw === null || !raw.trim()) return;
    await YanaVault.setKey(next.id, raw.trim());
    bump();
  }

  return (
    <div data-screen-label="Providers">
      <PageHeader
        title={L("Providers", "Nhà cung cấp")}
        sub={connected + L(" of ", " trong ") + D.providers.length + L(" providers connected · Groq routes, YAMTAM supervises every call", " nhà cung cấp đã kết nối · Groq định tuyến, YAMTAM giám sát mọi lệnh gọi")}>
        <button onClick={connectNext} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 99,
          border: "none", cursor: "pointer", background: "var(--primary)", color: "white",
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
        }}>{Icons.plus(15)} {L("Connect provider", "Kết nối nhà cung cấp")}</button>
      </PageHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--gap)" }}>
        {D.providers.map((p) => (
          <ProviderCard key={p.id + (YanaVault.hasKey(p.id) ? ":on" : ":off")} p={p} usage={usage} onKeyChange={bump} />
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
  const toggleLabels = [
    [L("Show agents on Lake", "Hiện tác nhân trên Mặt hồ"), "showAgents"],
    [L("Show missions on Lake", "Hiện nhiệm vụ trên Mặt hồ"), "showMissions"],
    [L("Show Memory Garden", "Hiện Vườn ký ức"), "showMemory"],
    [L("Show system status", "Hiện trạng thái hệ thống"), "showSystem"],
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

function Settings({ t, setTweak }) {
  const langDisplay = t.language === "Tiếng Việt"
    ? L("English / Tiếng Việt ✓", "Tiếng Việt ✓ / English")
    : L("English ✓ / Tiếng Việt", "English ✓ / Tiếng Việt");
  function toggleLang() {
    setTweak("language", t.language === "Tiếng Việt" ? "English" : "Tiếng Việt");
  }
  return (
    <div data-screen-label="Settings">
      <PageHeader
        title={L("Settings", "Cài đặt")}
        sub={L("Quiet defaults. Everything supervised by YAMTAM Core.", "Cài đặt mặc định. Mọi thứ được YAMTAM Core giám sát.")} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "var(--gap)", maxWidth: 900 }}>
        <AppearanceCard t={t} setTweak={setTweak} />
        <AboutYouCard />
        <Card title={L("Workspace", "Không gian làm việc")}>
          <SettingRow label={L("Workspace name", "Tên không gian")} value={L("Tâm's Lake", "Mặt hồ của Tâm")} />
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
          <SettingRow label={L("Timezone", "Múi giờ")} value="GMT+7 · Hà Nội" />
        </Card>
        <Card title={L("Orchestration", "Điều phối")}>
          <SettingRow
            label={L("Default orchestrator", "Bộ điều phối mặc định")}
            desc={L("Plans and delegates missions", "Lên kế hoạch và phân công nhiệm vụ")}
            value="Navigator · Claude" />
          <SettingRow
            label={L("Router budget", "Ngân sách định tuyến")}
            desc={L("Max time for routing decisions", "Thời gian tối đa cho quyết định định tuyến")}
            value="300 ms · Groq" />
          <SettingRow label={L("Fallback chain", "Chuỗi dự phòng")} value="GPT → Gemini → OpenRouter" />
        </Card>
        <Card title={L("Safety", "Bảo mật")}>
          <SettingRow
            label={L("Gate mode", "Chế độ cổng")}
            desc={L("Every agent action is reviewed", "Mọi hành động của tác nhân đều được xem xét")}
            value={L("Strict · deny by default", "Nghiêm ngặt · từ chối mặc định")} />
          <SettingRow
            label={L("Merge protection", "Bảo vệ merge")}
            desc={L("Sentinel sign-off before main", "Sentinel xét duyệt trước khi vào main")}
            value={L("On", "Bật")} />
          <SettingRow label={L("Incident retention", "Lưu trữ sự cố")} value={L("90 days", "90 ngày")} />
        </Card>
        <Card title={L("Memory", "Bộ nhớ")}>
          <SettingRow
            label={L("Garden pruning", "Cắt tỉa Vườn ký ức")}
            desc={L("Gardener's nightly decay pass", "Gardener chạy mỗi đêm để dọn ký ức cũ")}
            value={L("02:00 daily", "02:00 hằng ngày")} />
          <SettingRow
            label={L("Pinned memories", "Ký ức đã ghim")}
            desc={L("Never pruned", "Không bao giờ xóa")}
            value={L("2 pinned", "2 đã ghim")} />
          <SettingRow label={L("Storage", "Lưu trữ")} value={L("Local · encrypted", "Cục bộ · mã hóa")} />
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { Providers, Settings });
