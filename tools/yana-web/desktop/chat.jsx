// Yana AI — Chat (orchestration-centric, not a chatbot clone)

// ── Rule 68 — Confidential Mode ───────────────────────────────────────────────
// Mirror of the canonical marker tables in src/route.rs / yana-ai-core.
// confidential → never persisted, no about-context attached
// sovereign    → additionally: local model (Ollama) only — text never
//                leaves the machine
const SENS_SOVEREIGN = [
  "chỉ mình anh biết", "chỉ anh biết", "chỉ riêng anh", "không ai được biết",
  "sovereign only", "for my eyes only", "local model only", "chỉ model local",
  "#sovereign",
];
const SENS_CONFIDENTIAL = [
  "bí mật", "tuyệt mật", "confidential", "đừng ghi lại", "đừng lưu",
  "không lưu lại", "không ghi lại", "không được lưu", "giữ kín",
  "off the record", "do not log", "don't log", "do not save", "don't save",
  "do not persist", "#mật", "#confidential", "#private",
];
const SENS_SMELLS = [
  "mua công ty", "bán công ty", "thương vụ", "sáp nhập", "đàm phán",
  "acquisition", "merger", "negotiation position", "lương của", "salary of",
  "chẩn đoán", "diagnosis", "bệnh án", "health record", "kiện tụng", "lawsuit",
  "chưa công bố", "chưa công khai", "unannounced",
];

function detectSensitivity(text) {
  const lower = (text || "").toLowerCase();
  if (SENS_SOVEREIGN.some((m) => lower.includes(m))) return "sovereign";
  if (SENS_CONFIDENTIAL.some((m) => lower.includes(m))) return "confidential";
  if (SENS_SMELLS.some((m) => lower.includes(m))) return "confidential";
  return null;
}

// Providers usable without an API key (loopback/on-device)
const KEYLESS_PROVIDERS = new Set(["ollama", "lmstudio", "9router"]);
function providerAvailable(id) {
  return KEYLESS_PROVIDERS.has(id) || YanaVault.hasKey(id);
}
window.providerAvailable = providerAvailable;
window.KEYLESS_PROVIDERS = KEYLESS_PROVIDERS;

function ConfidentialBadge({ tier }) {
  return (
    <span className="chip neutral" style={{ fontSize: 10.5, marginTop: 5, display: "inline-flex", alignItems: "center", gap: 4 }}
      title={L("Rule 68 — this message is never saved to history, memory, or missions.",
               "Rule 68 — tin nhắn này không bao giờ được lưu vào lịch sử, ký ức hay mission.")}>
      🔒 {tier === "sovereign"
        ? L("Sovereign · local only · not saved", "Sovereign · chỉ local · không lưu")
        : L("Confidential · not saved", "Mật · không lưu")}
    </span>
  );
}

function RouteChip({ route }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
      <YanaMark size={20} />
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
        via <b style={{ fontWeight: 500, color: "var(--ink-2)" }}>{route.agent}</b> · {route.model}
      </span>
    </div>
  );
}

// Parse <think>...</think> blocks out of model output.
// Returns { display: string, reasoning: string|null }
function parseThink(text) {
  if (!text) return { display: text, reasoning: null };
  const thinkRe = /<think>([\s\S]*?)<\/think>/gi;
  const blocks = [];
  let display = text.replace(thinkRe, (_, inner) => { blocks.push(inner.trim()); return ""; }).trim();
  // Also catch unclosed <think> at the start (streaming mid-thought)
  if (!blocks.length) {
    const unclosed = text.match(/^<think>([\s\S]*)$/i);
    if (unclosed) return { display: "", reasoning: unclosed[1].trim() };
  }
  return { display, reasoning: blocks.length ? blocks.join("\n\n---\n\n") : null };
}

function ThinkToggle({ reasoning }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ marginBottom: 6 }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "none", border: "1px solid var(--border)", borderRadius: 99,
        padding: "3px 10px", fontSize: 11.5, color: "var(--ink-3)", cursor: "pointer",
        fontFamily: "inherit",
      }}>
        <span style={{ fontSize: 13 }}>🧠</span>
        {open ? L("Hide reasoning", "Ẩn suy nghĩ") : L("Show reasoning", "Xem suy nghĩ")}
        <span style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", display: "inline-block" }}>▾</span>
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: "10px 12px", borderRadius: "var(--r-md)",
          background: "rgba(var(--shadow-rgb), 0.04)", border: "1px solid var(--border)",
          fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-3)",
          whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto",
        }}>{reasoning}</div>
      )}
    </div>
  );
}

// ── Markdown rendering ─────────────────────────────────────────────────────────
function safeHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/ on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/ on\w+\s*=\s*[^\s>]*/gi, "");
}
function renderMd(text) {
  if (!text) return "";
  if (typeof marked === "undefined") return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/\n/g,"<br>");
  try {
    marked.use({ gfm: true, breaks: true });
    return safeHtml(marked.parse(text));
  } catch (_) { return text.replace(/\n/g,"<br>"); }
}
function MarkdownBubble({ text }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof hljs === "undefined") return;
    el.querySelectorAll("pre code:not([data-highlighted])").forEach(b => hljs.highlightElement(b));
  });
  return <div ref={ref} className="yana-md" dangerouslySetInnerHTML={{ __html: renderMd(text) }} />;
}
function CopyBtn({ text }) {
  const [copied, setCopied] = React.useState(false);
  function doCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }
  return (
    <button onClick={doCopy} className="copy-btn" title={L("Copy", "Sao chép")} style={{
      width: 24, height: 24, borderRadius: 6,
      border: "1px solid var(--border)", background: "rgba(var(--surface-rgb,255,255,255),.7)",
      cursor: "pointer", fontSize: 11, display: "grid", placeItems: "center",
      color: copied ? "var(--primary)" : "var(--ink-3)", flexShrink: 0,
    }}>
      {copied ? "✓" : "⧉"}
    </button>
  );
}

function Message({ msg, isLastYana, onRegenerate }) {
  if (msg.who === "user") {
    const userName  = localStorage.getItem("yana.about.who") || "You";
    const avatarUrl = localStorage.getItem("yana.avatar-url");
    const initial   = (userName[0] || "?").toUpperCase();
    return (
      <div className="msg-in msg-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, justifyContent: "flex-end" }}>
          <div style={{
            maxWidth: "72%", padding: "10px 15px", borderRadius: "16px 16px 4px 16px",
            background: "var(--primary)", color: "rgba(255,255,255,.96)",
            fontSize: 13.8, lineHeight: 1.55,
            boxShadow: "0 4px 14px color-mix(in oklab, var(--primary) 25%, transparent)",
            ...(msg.confidential ? { border: "1px dashed rgba(255,255,255,.55)" } : {}),
          }}>{msg.text}</div>
          {avatarUrl
            ? <img src={avatarUrl} alt={userName} style={{ width: 28, height: 28, borderRadius: 99, objectFit: "cover", flex: "none", boxShadow: "0 2px 8px rgba(0,0,0,.15)" }} />
            : <div style={{ width: 28, height: 28, borderRadius: 99, flex: "none", background: "var(--primary)", color: "white", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center", boxShadow: "0 2px 8px color-mix(in oklab, var(--primary) 35%, transparent)" }}>{initial}</div>
          }
        </div>
        {msg.confidential && <ConfidentialBadge tier={msg.tier} />}
      </div>
    );
  }
  if (msg.isHtml) {
    return (
      <div className="msg-in" style={{ display: "flex", justifyContent: "flex-start" }}>
        <div style={{ maxWidth: "82%" }}>
          {msg.route && <RouteChip route={msg.route} />}
          <div className="glass" style={{ padding: "12px 16px", borderRadius: "4px 16px 16px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20, flex: "none" }}>🎨</span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }}>{L("HTML generated", "Đã tạo HTML")}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{L("Preview visible on the right →", "Xem preview bên phải →")}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const parsed = parseThink(msg.text);
  const displayText = parsed.display || "";
  return (
    <div className="msg-in msg-wrap" style={{ display: "flex", justifyContent: "flex-start" }}>
      <div style={{ maxWidth: "82%" }}>
        {msg.route && <RouteChip route={msg.route} />}
        {parsed.reasoning && <ThinkToggle reasoning={parsed.reasoning} />}
        <div className="glass" style={{ padding: "12px 16px", borderRadius: "4px 16px 16px 16px", fontSize: 13.8, lineHeight: 1.6, color: "var(--ink)" }}>
          {displayText
            ? <MarkdownBubble text={displayText} />
            : parsed.reasoning
              ? <span style={{ color: "var(--ink-3)", fontStyle: "italic" }}>{L("Reasoning…", "Đang suy nghĩ…")}</span>
              : ""}
          {msg.action && (
            <div style={{
              marginTop: 11, padding: "9px 12px", borderRadius: "var(--r-sm)",
              background: "var(--primary-soft)", display: "flex", alignItems: "center", gap: 9,
            }}>
              <span style={{ color: "var(--primary)" }}>{Icons.safety(15)}</span>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--primary)" }}>{msg.action.label}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{msg.action.state}</div>
              </div>
            </div>
          )}
        </div>
        {msg.refs && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
            {msg.refs.map((r) => <span key={r} className="chip neutral" style={{ fontSize: 11 }}>{r}</span>)}
          </div>
        )}
        {/* copy + regenerate row */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
          {displayText && <CopyBtn text={displayText} />}
          {isLastYana && onRegenerate && (
            <button onClick={onRegenerate} className="copy-btn" title={L("Regenerate", "Thử lại")} style={{
              height: 24, padding: "0 8px", borderRadius: 6,
              border: "1px solid var(--border)", background: "rgba(var(--surface-rgb,255,255,255),.7)",
              cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4,
              color: "var(--ink-3)", flexShrink: 0,
            }}>↺ {L("Retry", "Thử lại")}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Default model per provider — mirrors PROVIDERS defaults in server.js
const CHAT_MODELS = {
  claude:     "claude-sonnet-4-6",
  openai:     "gpt-4o-mini",
  gemini:     "gemini-2.0-flash",
  groq:       "llama-3.3-70b-versatile",
  deepseek:   "deepseek-chat",
  openrouter: "google/gemma-3-27b-it",
  xai:        "grok-3-mini",
  novita:     "meta-llama/llama-3.1-70b-instruct",
  nvidia:     "nvidia/llama-3.1-nemotron-70b-instruct",
  kimi:       "moonshot-v1-8k",
  minimax:    "abab6.5s-chat",
  glm:        "glm-4-flash",
  huggingface: "meta-llama/Llama-3.3-70B-Instruct",
  "9router":  "kr/claude-sonnet-4.5",
  ollama:     "llama3.2",
  lmstudio:   "local-model",
};

// Curated model choices per provider — providers in CHAT_LIVE_MODELS get the
// real list fetched from /api/models when a key is available.
const MODEL_CHOICES = {
  claude:     ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
  openai:     ["gpt-4o-mini", "gpt-4o"],
  gemini:     ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
  deepseek:   ["deepseek-chat", "deepseek-reasoner"],
  groq:       ["llama-3.3-70b-versatile", "meta-llama/llama-4-scout-17b-16e-instruct"],
  openrouter: ["google/gemma-3-27b-it"],
  xai:        ["grok-3-mini", "grok-3", "grok-2-vision-1212"],
  novita:     ["meta-llama/llama-3.1-70b-instruct", "meta-llama/llama-3.1-8b-instruct"],
  nvidia:     ["nvidia/llama-3.1-nemotron-70b-instruct", "meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1"],
  kimi:       ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  minimax:    ["abab6.5s-chat", "abab6.5g-chat"],
  glm:        ["glm-4-flash", "glm-4", "glm-4v", "glm-z1-flash"],
  huggingface: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "mistralai/Mistral-7B-Instruct-v0.3"],
  "9router":  ["kr/claude-sonnet-4.5"],
  ollama:     ["llama3.2"],
  lmstudio:   ["local-model"],
};
const CHAT_LIVE_MODELS = new Set(["groq", "openrouter", "xai", "novita", "nvidia", "kimi", "minimax", "glm", "huggingface", "9router", "ollama", "lmstudio"]);

// Capability flags per model (or substring match for dynamic model lists).
// v = vision  r = reasoning  t = text-only (explicit no-vision)
const MODEL_CAPS = {
  // Claude
  "claude-sonnet-4-6":           { v: true },
  "claude-opus-4-8":             { v: true },
  "claude-haiku-4-5-20251001":   { v: true },
  // OpenAI
  "gpt-4o":                      { v: true },
  "gpt-4o-mini":                 { v: true },
  // Gemini
  "gemini-2.0-flash":            { v: true },
  "gemini-2.0-flash-lite":       { v: true },
  "gemini-1.5-pro":              { v: true },
  // DeepSeek
  "deepseek-chat":               { t: true },
  "deepseek-reasoner":           { r: true, t: true },
  // Groq (text-only defaults)
  "llama-3.3-70b-versatile":     { t: true },
  // xAI
  "grok-3-mini":                 { r: true, t: true },
  "grok-3":                      { t: true },
  "grok-2-vision-1212":          { v: true },
  // GLM
  "glm-4v":                      { v: true },
  "glm-4-flash":                 { t: true },
  "glm-4":                       { t: true },
  "glm-z1-flash":                { r: true, t: true },
  // Kimi
  "moonshot-v1-8k":              { t: true },
  "moonshot-v1-32k":             { t: true },
  "moonshot-v1-128k":            { t: true },
};

// Return capability flags for a model name (partial substring match as fallback)
function modelCaps(model) {
  if (!model) return {};
  if (MODEL_CAPS[model]) return MODEL_CAPS[model];
  const lower = model.toLowerCase();
  // Substring heuristics for dynamic model lists
  if (lower.includes("vision") || lower.includes("4v") || lower.includes("-v-")) return { v: true };
  if (lower.includes("reasoner") || lower.includes("thinking") || lower.includes("qwq") || lower.includes("r1")) return { r: true, t: true };
  return {};
}

// Short label string for an option
function capsLabel(model) {
  const c = modelCaps(model);
  const tags = [];
  if (c.v) tags.push("👁 vision");
  if (c.r) tags.push("🧠 reasoning");
  if (c.t && !c.v) tags.push("✏ text");
  return tags.length ? " · " + tags.join(" · ") : "";
}

const MODEL_STORE = "yana.chat.models"; // { providerId: modelId } — persisted

function loadModelChoices() {
  try {
    const saved = JSON.parse(localStorage.getItem(MODEL_STORE));
    if (saved && typeof saved === "object") return saved;
  } catch (_) {}
  return {};
}

function ContextPanel() {
  const D = window.YANA;
  const [facts, setFacts] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setFacts(d.memories.recent); })
      .catch(() => {});
  }, []);

  // Real routing: providers that actually have a key, in send order
  const keyed = D.providers.filter((p) => YanaVault.hasKey(p.id));
  const primary  = keyed[0];
  const fallback = keyed[1];

  return (
    <aside className="yana-chat-aside" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)", overflowY: "auto" }}>
      <Card title={L("Routing", "Định tuyến")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {[
            [L("Provider", "Nhà cung cấp"), primary ? primary.name : L("None — add a key", "Chưa có key")],
            [L("Model", "Mô hình"), primary ? (loadModelChoices()[primary.id] || CHAT_MODELS[primary.id] || "—") : "—"],
            [L("Fallback", "Dự phòng"), fallback ? fallback.name : "—"],
            [L("Connected", "Đã kết nối"), keyed.length + " / " + D.providers.length],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
              <span style={{ color: "var(--ink-3)", flex: "none" }}>{k}</span>
              <span style={{ fontWeight: 500, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title={L("Context in use", "Ngữ cảnh đang dùng")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {facts && facts.length
            ? facts.map((m, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45, display: "flex", gap: 7 }}>
                  <span style={{ color: "var(--pink)", flex: "none", marginTop: 1 }}>{Icons.memory(13)}</span>
                  {m.text}
                </div>
              ))
            : <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("No memories yet.", "Chưa có ký ức nào.")}</span>}
        </div>
      </Card>
      <Card title={L("Safety", "An toàn")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="dot on"></span>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{L("Sentinel reviewing all actions", "Sentinel đang giám sát mọi hành động")}</span>
        </div>
      </Card>
    </aside>
  );
}

// ── Artifact Panel — Claude-style inline HTML preview ─────────────────────────
function ArtifactPanel({ artifact, onClose }) {
  const [tab, setTab] = React.useState("preview");
  const [copied, setCopied] = React.useState(false);
  const iframeRef = React.useRef(null);

  React.useEffect(() => {
    if (tab === "preview" && iframeRef.current) {
      iframeRef.current.srcdoc = artifact.html || "";
    }
  }, [artifact.html, tab]);

  function copyHtml() {
    navigator.clipboard.writeText(artifact.html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function downloadHtml() {
    const blob = new Blob([artifact.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "output.html" });
    a.click();
    URL.revokeObjectURL(url);
  }

  const btnStyle = {
    padding: "4px 10px", borderRadius: 8, border: "1px solid var(--border)",
    cursor: "pointer", fontSize: 11.5, fontFamily: "inherit",
    background: "transparent", color: "var(--ink-2)",
  };
  const tabStyle = (active) => ({
    padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer",
    fontSize: 11.5, fontFamily: "inherit", fontWeight: active ? 500 : 400,
    background: active ? "var(--primary-soft)" : "transparent",
    color: active ? "var(--primary)" : "var(--ink-3)",
  });

  return (
    <aside style={{ width: 460, flex: "none", display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flex: "none" }}>
        <span style={{ color: "var(--ink-3)", display: "flex", alignItems: "center" }}>{Icons.code(14)}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>HTML</span>
        <button style={tabStyle(tab === "preview")} onClick={() => setTab("preview")}>{L("Preview", "Xem trước")}</button>
        <button style={tabStyle(tab === "code")} onClick={() => setTab("code")}>{L("Code", "Code")}</button>
        <button style={btnStyle} onClick={copyHtml}>{copied ? L("Copied!", "Đã chép!") : L("Copy", "Chép")}</button>
        <button style={btnStyle} onClick={downloadHtml}>↓</button>
        <button style={{ ...btnStyle, borderColor: "transparent" }} onClick={onClose}>✕</button>
      </div>
      <div className="glass" style={{ flex: 1, borderRadius: "var(--r-lg)", overflow: "hidden", minHeight: 0 }}>
        {tab === "preview"
          ? <iframe ref={iframeRef} sandbox="allow-scripts allow-same-origin" style={{ width: "100%", height: "100%", border: "none", display: "block" }} />
          : <pre style={{ margin: 0, padding: "14px 16px", overflowY: "auto", fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.5, color: "var(--ink-2)", height: "100%", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{artifact.html}</pre>
        }
      </div>
    </aside>
  );
}

// Find the first provider that has a stored API key in the encrypted vault
function getProviderConfig(preferred) {
  const order = ["claude", "openai", "gemini", "groq", "deepseek", "openrouter"];
  if (preferred && KEYLESS_PROVIDERS.has(preferred)) {
    return { provider: preferred, apiKey: "" };
  }
  if (preferred && YanaVault.hasKey(preferred)) {
    return { provider: preferred, apiKey: YanaVault.getKey(preferred) };
  }
  for (const id of order) {
    const key = YanaVault.getKey(id);
    if (key) return { provider: id, apiKey: key };
  }
  return { provider: "claude", apiKey: "" };
}
window.getProviderConfig = getProviderConfig;

// "About you" from Settings — sent with every chat so Yana knows the user
function aboutContext() {
  const parts = [];
  for (const [id, label] of [["who", "Who"], ["strengths", "Strengths"], ["weaknesses", "Weak spots"], ["style", "Response style"]]) {
    const v = localStorage.getItem("yana.about." + id);
    if (v && v.trim()) parts.push(label + ": " + v.trim());
  }
  return parts.join("\n");
}

const CHAT_STORE = "yana.chat";

function loadChatHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_STORE));
    if (Array.isArray(saved)) return saved;
  } catch (_) {}
  return window.YANA.chat;
}

function Chat({ t }) {
  const D = window.YANA;
  const [msgs, setMsgs] = React.useState(loadChatHistory);
  const [draft, setDraft] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [providerSel, setProviderSel] = React.useState(() => localStorage.getItem("yana.chat.provider") || "");
  // Rule 68 — manual Confidential Mode: everything sent while on is treated
  // as confidential even without a marker. Never persisted itself.
  const [confMode, setConfMode] = React.useState(false);
  // Model per provider — persisted; live lists fetched for CHAT_LIVE_MODELS
  const [modelSel, setModelSel] = React.useState(loadModelChoices);
  const [liveModels, setLiveModels] = React.useState({});  // providerId -> [ids]
  const [visionImage, setVisionImage] = React.useState(null); // {data, mimeType, name}
  const [artifact, setArtifact] = React.useState(null); // { html } — live HTML preview panel
  const [htmlPicker, setHtmlPicker] = React.useState(false);
  const [htmlSkills, setHtmlSkills] = React.useState([]);
  const [htmlSearch, setHtmlSearch] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [atBottom, setAtBottom]   = React.useState(true);
  const logRef    = React.useRef(null);
  const readerRef = React.useRef(null);
  const fileRef   = React.useRef(null);
  const visionRef = React.useRef(null);
  const inputRef  = React.useRef(null);
  const [ocrBusy, setOcrBusy] = React.useState(false);

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  const activeProvider = providerSel || getProviderConfig().provider;
  const modelOptions = liveModels[activeProvider] || MODEL_CHOICES[activeProvider] || [];
  const activeModel = modelSel[activeProvider] || CHAT_MODELS[activeProvider] || (modelOptions[0] || "");

  const isVisionModel = (_model) => ["claude", "openai", "gemini", "groq", "openrouter", "xai", "glm"].includes(activeProvider);

  function pickModel(v) {
    setModelSel((prev) => {
      const next = { ...prev, [activeProvider]: v };
      try { localStorage.setItem(MODEL_STORE, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }

  // Fetch the real model list when the provider supports it and is usable
  React.useEffect(() => {
    const id = activeProvider;
    if (!CHAT_LIVE_MODELS.has(id) || !providerAvailable(id) || liveModels[id]) return;
    fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: id, key: YanaVault.getKey(id) || "" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.models) && d.models.length) {
          setLiveModels((m) => ({ ...m, [id]: d.models.slice(0, 60).map((x) => x.id) }));
        }
      })
      .catch(() => {});
  }, [activeProvider]);

  // auto-scroll to bottom only when already at bottom
  React.useEffect(() => {
    const el = logRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [msgs, thinking, atBottom]);

  // track whether user has scrolled up
  React.useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    function onScroll() {
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Persist the real conversation: across navigation AND reloads (last 60 turns).
  // Confidential turns live in memory only (rule 68) — they survive navigation
  // within this session via D.chat but are never written to localStorage.
  React.useEffect(() => {
    D.chat = msgs;
    try {
      localStorage.setItem(CHAT_STORE, JSON.stringify(msgs.filter((m) => !m.confidential).slice(-60)));
    } catch (_) {}
  }, [msgs]);
  React.useEffect(() => { localStorage.setItem("yana.chat.provider", providerSel); }, [providerSel]);

  // Cancel any in-flight stream on unmount
  React.useEffect(() => {
    return () => { if (readerRef.current) readerRef.current.cancel(); };
  }, []);

  async function handleOcr(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setOcrBusy(true);
    try {
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const resp = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: b64, filename: file.name }),
      });
      const data = await resp.json();
      if (data.ok && data.text) {
        setDraft((prev) => (prev ? prev + "\n\n" : "") + data.text);
      } else {
        setMsgs((m) => [...m, { who: "yana", text: "OCR failed: " + (data.error || "Unknown error") }]);
      }
    } catch (err) {
      setMsgs((m) => [...m, { who: "yana", text: "OCR error: " + String(err) }]);
    } finally {
      setOcrBusy(false);
    }
  }

  function compressImageForVision(file) {
    return new Promise(resolve => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX = 1920;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = MAX / Math.max(width, height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          const reader = new FileReader();
          reader.onload = ev => {
            const [header, data] = ev.target.result.split(",");
            resolve({ data, mimeType: header.replace("data:", "").replace(";base64", ""), name: file.name });
          };
          reader.readAsDataURL(blob);
        }, "image/jpeg", 0.85);
      };
      img.src = objectUrl;
    });
  }

  async function handleVisionAttach(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setVisionImage(await compressImageForVision(file));
  }

  function regenerate() {
    const lastUser = [...msgs].reverse().find((m) => m.who === "user");
    if (!lastUser || thinking || streaming) return;
    setMsgs((m) => {
      const lastYanaIdx = [...m].reverse().findIndex((x) => x.who === "yana");
      if (lastYanaIdx === -1) return m;
      return m.slice(0, m.length - 1 - lastYanaIdx);
    });
    setTimeout(() => sendText(lastUser.text), 0);
  }

  async function sendText(text) {
    if (!text || thinking || streaming) return;

    // Ensure vault has finished decrypting keys from IndexedDB before reading
    if (typeof YanaVault !== "undefined") await YanaVault.ready;

    // Rule 68 — classify before the first byte leaves this page
    const detected = detectSensitivity(text);
    const tier = detected === "sovereign" ? "sovereign"
               : (detected || confMode)   ? "confidential"
               : null;

    setMsgs((m) => [...m, { who: "user", text, confidential: !!tier, tier }]);
    setDraft("");
    if (inputRef.current) { inputRef.current.style.height = "auto"; }
    setVisionImage(null);
    setThinking(true);
    setAtBottom(true);

    // VTuber companion — notify so it can count messages and show hints
    if (!tier) window.dispatchEvent(new CustomEvent("yana-chat-message"));

    // Sovereign: local model only — never a cloud provider
    let { provider, apiKey } = getProviderConfig(providerSel);
    if (tier === "sovereign") { provider = "ollama"; apiKey = ""; }
    const model = modelSel[provider] || CHAT_MODELS[provider] || "";

    // Real routing: classify the task so complex requests pick up a skill.
    // Skipped for confidential turns — need-to-know, no extra processing.
    let skill = null;
    if (!tier) {
      try {
        const rr = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: text }),
        });
        if (rr.ok) { const d = await rr.json(); skill = d.suggested_skill || null; }
      } catch (_) {}
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tier
          ? { task: text, apiKey, provider, model, sensitivity: tier }
          : { task: text, apiKey, provider, model, skill, about: aboutContext(),
              images: visionImage ? [visionImage] : undefined }),
      });

      if (!res.ok || !res.body) {
        throw new Error("HTTP " + res.status);
      }

      const reader = res.body.getReader();
      readerRef.current = reader;
      setStreaming(true);
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";
      const msgId = Date.now();

      // Insert placeholder Yana message — route shows the real provider/model/skill
      setMsgs((m) => [...m, {
        who: "yana",
        route: {
          agent: provider,
          model: (model || provider)
            + (skill ? " · " + skill : "")
            + (tier ? " · 🔒 " + (tier === "sovereign" ? "local-only" : "no-persist") : ""),
        },
        text: "",
        confidential: !!tier,
        tier,
        _id: msgId,
      }]);
      setThinking(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const obj = JSON.parse(payload);
            if (obj.error) {
              accumulated += "\n[Error: " + obj.error + "]";
            } else if (obj.text) {
              accumulated += obj.text;
            }
            const snap = accumulated;
            setMsgs((m) => m.map((msg) =>
              msg._id === msgId ? { ...msg, text: snap } : msg
            ));
            // Live artifact preview: stream HTML into the panel as it arrives
            if (/^\s*(?:<!DOCTYPE|<html)/i.test(accumulated)) {
              setArtifact({ html: accumulated });
            }
          } catch (_) {}
        }
      }

      setStreaming(false);

      // After stream: if response is HTML, mark message as artifact
      if (/^\s*(?:<!DOCTYPE|<html)/i.test(accumulated)) {
        setMsgs((m) => m.map((msg) =>
          msg._id === msgId ? { ...msg, isHtml: true } : msg
        ));
      }

      // ChatGPT-style memory: the model nominates a durable fact with a
      // trailing "MEMORY: …" line — strip it from the display and persist
      // it server-side. Confidential turns never reach this branch with a
      // marker (the server attaches no memory instruction), but gate anyway.
      if (!tier) {
        const mm = accumulated.match(/(?:^|\n)\s*MEMORY:\s*(.+?)\s*$/);
        if (mm && mm[1]) {
          const fact  = mm[1];
          const shown = accumulated.slice(0, mm.index).trimEnd();
          setMsgs((m) => m.map((msg) =>
            msg._id === msgId
              ? { ...msg, text: shown || msg.text, refs: [...(msg.refs || []), L("🌱 Remembered: ", "🌱 Đã nhớ: ") + fact] }
              : msg
          ));
          fetch("/api/memory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: fact }),
          }).catch(() => {});
        }

        // Auto-save to Sessions history (rule 68: confidential turns excluded)
        const sessionTitle = text.length > 70 ? text.slice(0, 70) + "…" : text;
        fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: sessionTitle,
            provider, model: model || provider,
            messages: [
              { role: "user",      content: text,        ts: Date.now() },
              { role: "assistant", content: accumulated, ts: Date.now() },
            ],
          }),
        }).catch(() => {});
      }
    } catch (err) {
      setThinking(false);
      setMsgs((m) => [...m, {
        who: "yana",
        route: { agent: provider, model: model || provider },
        confidential: !!tier,
        tier,
        text: tier === "sovereign"
          ? L("Could not reach the local model. SOVEREIGN content only goes to Ollama (127.0.0.1:11434) — start it with `ollama serve`.",
              "Không kết nối được model local. Nội dung SOVEREIGN chỉ đi đến Ollama (127.0.0.1:11434) — chạy `ollama serve` trước.")
          : L("Could not reach the server (" + err.message + "). Check that Yana is running and a provider key is set.",
              "Không kết nối được máy chủ (" + err.message + "). Kiểm tra Yana đang chạy và đã đặt API key."),
      }]);
      setStreaming(false);
    }
  }

  function send() {
    const text = draft.trim();
    if (text) sendText(text);
  }

  function stopStream() {
    if (readerRef.current) { readerRef.current.cancel(); readerRef.current = null; }
    setStreaming(false);
    setThinking(false);
  }

  return (
    <div data-screen-label="Chat" style={{ display: "flex", gap: "var(--gap)", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
        <PageHeader title={L("Conversation", "Trò chuyện")} sub={L("One conversation, many hands — Yana routes each request to the right agent.", "Một cuộc trò chuyện, nhiều bàn tay — Yana chuyển mỗi yêu cầu đến đúng tác nhân.")}>
          <button
            onClick={() => { setMsgs([]); D.chat = []; try { localStorage.removeItem("yana.chat"); } catch (_) {} }}
            title={L("New conversation", "Cuộc trò chuyện mới")}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", flex: "none" }}>
            {Icons.pencil(14)} {L("New", "Mới")}
          </button>
        </PageHeader>
        {htmlPicker && (
          <div className="glass-strong" style={{ borderRadius: "var(--r-lg)", padding: 10, display: "flex", flexDirection: "column", gap: 8, flex: "none", maxHeight: 260 }}>
            <input
              autoFocus
              value={htmlSearch}
              onChange={(e) => setHtmlSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setHtmlPicker(false); setHtmlSearch(""); } }}
              placeholder={L("Search templates…", "Tìm template…")}
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontFamily: "inherit", background: "transparent", color: "var(--ink)", outline: "none", flex: "none" }}
            />
            <div style={{ overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 5 }}>
              {htmlSkills.length === 0
                ? <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Loading…", "Đang tải…")}</span>
                : htmlSkills
                    .filter((s) => {
                      if (!htmlSearch) return true;
                      const q = htmlSearch.toLowerCase();
                      return (s.enName || s.id).toLowerCase().includes(q) || (s.category || "").toLowerCase().includes(q);
                    })
                    .map((s) => (
                      <button key={s.id}
                        onClick={() => {
                          setDraft((d) => (d ? d + " " : "") + (s.enName || s.id) + ": ");
                          setHtmlPicker(false);
                          setHtmlSearch("");
                        }}
                        style={{ padding: "4px 11px", borderRadius: 99, border: "1px solid var(--border)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                        {s.enName || s.id}
                      </button>
                    ))
              }
            </div>
          </div>
        )}
        <div ref={logRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "calc(16px * var(--sp))", padding: "4px 4px 16px", minHeight: 0 }}>
          {msgs.length === 0 && !thinking && (
            <div style={{ margin: "auto", textAlign: "center", color: "var(--ink-3)", maxWidth: 380 }}>
              <YanaMark size={34} />
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-2)", marginTop: 12 }}>
                {L("Start a conversation", "Bắt đầu trò chuyện")}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 6 }}>
                {getProviderConfig().apiKey
                  ? L("Yana routes your request to the connected provider and streams the answer here.",
                      "Yana chuyển yêu cầu của bạn đến nhà cung cấp đã kết nối và trả lời tại đây.")
                  : L("No provider key set — add one in Providers first.",
                      "Chưa có API key — thêm key ở mục Nhà cung cấp trước.")}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <Message key={m._id || i} msg={m}
              isLastYana={!streaming && i === msgs.length - 1 && m.who === "yana"}
              onRegenerate={regenerate}
            />
          ))}
          {thinking && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--ink-3)", fontSize: 12.5 }}>
              <YanaMark size={20} /> {L("Navigator is thinking…", "Navigator đang suy nghĩ…")}
            </div>
          )}
        </div>
        {/* scroll-to-bottom button */}
        {!atBottom && (
          <button onClick={() => { const el = logRef.current; if (el) { el.scrollTop = el.scrollHeight; setAtBottom(true); } }}
            style={{
              position: "absolute", bottom: 110, right: 24, width: 32, height: 32, borderRadius: 99,
              border: "1px solid var(--border)", background: "var(--glass-bg, rgba(255,255,255,.85))",
              cursor: "pointer", fontSize: 14, display: "grid", placeItems: "center",
              color: "var(--ink-2)", boxShadow: "0 2px 10px rgba(0,0,0,.12)",
              backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            }}>↓</button>
        )}
        <div className="glass-strong chat-bar" style={{ borderRadius: "var(--r-lg)", padding: "10px 10px 10px 16px" }}>
          <input type="file" ref={fileRef} accept="image/*,.pdf" style={{ display: "none" }} onChange={handleOcr} />
          <input type="file" ref={visionRef} accept="image/*" style={{ display: "none" }} onChange={handleVisionAttach} />
          <button
            onClick={() => {
              if (!htmlPicker && !htmlSkills.length) {
                fetch("/api/html/skills").then((r) => r.ok ? r.json() : null).then((d) => { if (d && d.skills) setHtmlSkills(d.skills); }).catch(() => {});
              }
              setHtmlPicker((v) => !v);
              setHtmlSearch("");
            }}
            aria-pressed={htmlPicker}
            title={L("HTML templates", "Template HTML")}
            style={{
              width: 32, height: 32, borderRadius: 9, flex: "none",
              border: "1px solid " + (htmlPicker ? "var(--primary)" : "var(--border)"),
              background: htmlPicker ? "var(--primary-soft)" : "transparent",
              color: htmlPicker ? "var(--primary)" : "var(--ink-2)",
              cursor: "pointer", fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              display: "grid", placeItems: "center",
            }}>
            &lt;/&gt;
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); autoResize(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={L("Ask Yana… (Shift+Enter for new line)", "Hỏi Yana… (Shift+Enter xuống dòng)")}
            className="chat-input"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", color: "var(--ink)", lineHeight: 1.5, maxHeight: 180, overflowY: "auto" }}
          />
          <button
            onClick={() => fileRef.current && fileRef.current.click()}
            aria-label={L("Attach file for OCR", "Đính kèm file để nhận dạng văn bản")}
            title={L("Attach image or PDF — extract text with Surya OCR", "Đính kèm ảnh hoặc PDF — trích xuất văn bản bằng Surya OCR")}
            disabled={ocrBusy}
            style={{
              width: 32, height: 32, borderRadius: 9, border: "1px solid var(--border)", cursor: ocrBusy ? "not-allowed" : "pointer",
              background: "transparent", color: ocrBusy ? "var(--ink-3)" : "var(--ink-2)",
              display: "grid", placeItems: "center", flex: "none",
            }}>
            {ocrBusy ? "…" : Icons.attach(15)}
          </button>
          {isVisionModel(activeModel) && (
            <button
              onClick={() => visionRef.current && visionRef.current.click()}
              aria-label={L("Attach image for vision", "Đính kèm ảnh để nhận dạng")}
              title={L("Send image to Llama Vision", "Gửi ảnh tới Llama Vision")}
              style={{
                width: 32, height: 32, borderRadius: 9, border: "1px solid var(--border)", cursor: "pointer",
                background: visionImage ? "var(--primary-soft)" : "transparent",
                color: visionImage ? "var(--primary)" : "var(--ink-2)",
                display: "grid", placeItems: "center", flex: "none",
                opacity: visionImage ? 1 : 0.6,
              }}>
              {visionImage ? "🖼️" : Icons.attach(15)}
            </button>
          )}
          {visionImage && (
            <span
              style={{ fontSize: 11, color: "var(--ink-2)", cursor: "pointer", flex: "none", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              onClick={() => setVisionImage(null)}
              title={L("Remove image", "Xóa ảnh")}>
              {visionImage.name} ✕
            </span>
          )}
          <button
            onClick={() => setConfMode((v) => !v)}
            aria-pressed={confMode}
            title={confMode
              ? L("Confidential Mode ON — messages are not saved and carry no personal context (rule 68). Click to turn off.",
                  "Chế độ Mật BẬT — tin nhắn không được lưu, không kèm ngữ cảnh cá nhân (rule 68). Bấm để tắt.")
              : L("Turn on Confidential Mode — nothing you send is saved to history, memory, or missions.",
                  "Bật chế độ Mật — mọi thứ anh gửi sẽ không được lưu vào lịch sử, ký ức hay mission.")}
            style={{
              border: "1px solid " + (confMode ? "var(--primary)" : "var(--border)"),
              borderRadius: 99, padding: "5px 10px", cursor: "pointer", fontSize: 11.5,
              fontFamily: "inherit",
              background: confMode ? "var(--primary-soft)" : "transparent",
              color: confMode ? "var(--primary)" : "var(--ink-3)",
            }}>
            🔒{confMode ? " " + L("Confidential", "Mật") : ""}
          </button>
          <div className="chat-bar-selects">
            <select value={providerSel || getProviderConfig().provider}
              onChange={(e) => setProviderSel(e.target.value)}
              title={L("Provider for this conversation", "Nhà cung cấp cho cuộc trò chuyện")}>
              {D.providers
                .filter((p) => !p.desktopOnly || window.innerWidth >= 860)
                .map((p) => (
                  <option key={p.id} value={p.id} disabled={!providerAvailable(p.id)}>
                    {p.name}
                    {p.desktopOnly ? " 🖥" : ""}
                    {providerAvailable(p.id) ? "" : " 🔒"}
                  </option>
                ))}
            </select>
            <select value={activeModel} onChange={(e) => pickModel(e.target.value)}
              title={L("Model for this provider — choice is remembered", "Model cho nhà cung cấp này — lựa chọn được ghi nhớ")}>
              {(modelOptions.includes(activeModel) ? modelOptions : [activeModel, ...modelOptions]).map((m) => (
                <option key={m} value={m}>{m}{capsLabel(m)}</option>
              ))}
            </select>
            <span className="chip neutral sentinel-chip" style={{ fontSize: 11.5, flexShrink: 0 }}>{Icons.safety(12)} {L("Sentinel on", "Sentinel bật")}</span>
          </div>
          {streaming || thinking
            ? <button onClick={stopStream} aria-label="Stop" title={L("Stop generation", "Dừng phản hồi")} style={{
                width: 36, height: 36, borderRadius: 11, border: "none", cursor: "pointer",
                background: "var(--primary)", color: "white", display: "grid", placeItems: "center",
                flexShrink: 0, fontSize: 14,
              }}>■</button>
            : <button onClick={send} aria-label="Send" className={draft.trim() ? "send-btn-active" : ""} style={{
                width: 36, height: 36, borderRadius: 11, border: "none", cursor: "pointer",
                background: "var(--primary)", color: "white", display: "grid", placeItems: "center",
                flexShrink: 0,
              }}>{Icons.send(16)}</button>
          }
        </div>
        {/* Model capability hint — shown below input bar */}
        {(() => {
          const caps = modelCaps(activeModel);
          const hints = [];
          if (caps.v) hints.push({ label: L("Vision ✓", "Nhận ảnh ✓"), ok: true });
          else hints.push({ label: L("No vision", "Không nhận ảnh"), ok: false });
          if (caps.r) hints.push({ label: L("Reasoning", "Suy luận"), ok: true });
          return (
            <div style={{ display: "flex", gap: 6, paddingTop: 5, paddingLeft: 4 }}>
              {hints.map((h) => (
                <span key={h.label} style={{
                  fontSize: 10.5, padding: "1px 7px", borderRadius: 99,
                  background: h.ok ? "var(--primary-soft)" : "rgba(var(--shadow-rgb), 0.06)",
                  color: h.ok ? "var(--primary)" : "var(--ink-3)",
                  border: "1px solid " + (h.ok ? "transparent" : "var(--border)"),
                }}>{h.label}</span>
              ))}
              <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{activeModel}</span>
            </div>
          );
        })()}
      </div>
      {artifact
        ? <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} />
        : <ContextPanel />
      }
    </div>
  );
}

window.Chat = Chat;
