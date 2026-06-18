// Yana Mobile — Conversation. Calls /api/chat with SSE streaming — mirrors chat.jsx.

/* ── Mobile-local helpers (chat.jsx not loaded on mobile) ─────────────────── */
const M_CHAT_MODELS = {
  claude: "claude-sonnet-4-6", openai: "gpt-4o-mini", gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile", deepseek: "deepseek-chat",
  openrouter: "google/gemma-3-27b-it", xai: "grok-3-mini",
  novita: "meta-llama/llama-3.1-70b-instruct",
  nvidia: "nvidia/llama-3.1-nemotron-70b-instruct",
  kimi: "moonshot-v1-8k", minimax: "abab6.5s-chat",
  glm: "glm-4-flash", huggingface: "meta-llama/Llama-3.3-70B-Instruct",
  "9router": "kr/claude-sonnet-4.5", ollama: "llama3.2",
};
const M_KEYLESS = new Set(["ollama", "9router"]);

const M_MODEL_CATALOG = [
  // Claude
  { id: "claude-sonnet-4-6",              provider: "claude",     tag: "Mạnh",      label: "Sonnet 4.6",           desc: "Lý luận sâu, code phức tạp" },
  { id: "claude-opus-4-8",                provider: "claude",     tag: "Mạnh nhất", label: "Opus 4.8",             desc: "Tốt nhất, chậm hơn" },
  { id: "claude-haiku-4-5-20251001",      provider: "claude",     tag: "Nhanh",     label: "Haiku 4.5",            desc: "Phản hồi tức thì" },
  // OpenAI
  { id: "gpt-4o-mini",                    provider: "openai",     tag: "Nhanh",     label: "GPT-4o mini",          desc: "Đa năng, tiết kiệm" },
  { id: "gpt-4o",                         provider: "openai",     tag: "Vision",    label: "GPT-4o",               desc: "Xem ảnh + phân tích" },
  // Gemini
  { id: "gemini-2.0-flash",               provider: "gemini",     tag: "Nhanh",     label: "Gemini 2.0 Flash",     desc: "Nhanh, multimodal" },
  { id: "gemini-2.0-flash-lite",          provider: "gemini",     tag: "Siêu nhanh",label: "Gemini 2.0 Lite",      desc: "Nhỏ hơn, tiết kiệm hơn" },
  { id: "gemini-1.5-pro",                 provider: "gemini",     tag: "Mạnh",      label: "Gemini 1.5 Pro",       desc: "Context 1M token" },
  // Groq
  { id: "llama-3.3-70b-versatile",                        provider: "groq", tag: "Nhanh",  label: "Llama 3.3 70B",       desc: "Văn bản, đa năng, rất nhanh" },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct",    provider: "groq", tag: "Vision", label: "Llama 4 Scout Vision", desc: "Nhận dạng ảnh, multimodal" },
  // Deepseek
  { id: "deepseek-chat",                  provider: "deepseek",   tag: "Code",      label: "DeepSeek Chat",        desc: "Code + lý luận" },
  { id: "deepseek-reasoner",              provider: "deepseek",   tag: "Mạnh",      label: "DeepSeek Reasoner",    desc: "Suy luận chuỗi dài" },
  // xAI (Grok)
  { id: "grok-3-mini",                    provider: "xai",        tag: "Nhanh",     label: "Grok 3 Mini",          desc: "Nhanh, đa năng" },
  { id: "grok-3",                         provider: "xai",        tag: "Mạnh",      label: "Grok 3",               desc: "Mạnh nhất của xAI" },
  { id: "grok-2-vision-1212",             provider: "xai",        tag: "Vision",    label: "Grok 2 Vision",        desc: "Nhận dạng ảnh" },
  // Novita
  { id: "meta-llama/llama-3.1-70b-instruct", provider: "novita", tag: "Mạnh",      label: "Llama 3.1 70B",        desc: "Open source, mạnh" },
  { id: "meta-llama/llama-3.1-8b-instruct",  provider: "novita", tag: "Nhanh",     label: "Llama 3.1 8B",         desc: "Nhẹ, miễn phí" },
  // NVIDIA NIM
  { id: "nvidia/llama-3.1-nemotron-70b-instruct", provider: "nvidia", tag: "Mạnh", label: "Nemotron 70B",         desc: "NVIDIA, hiệu năng cao" },
  { id: "meta/llama-3.3-70b-instruct",            provider: "nvidia", tag: "Nhanh",label: "Llama 3.3 70B (NIM)",  desc: "Llama trên NIM" },
  // Kimi (Moonshot)
  { id: "moonshot-v1-8k",   provider: "kimi", tag: "Nhanh", label: "Kimi 8K",    desc: "Context 8K, nhanh" },
  { id: "moonshot-v1-32k",  provider: "kimi", tag: "Mạnh",  label: "Kimi 32K",   desc: "Context dài 32K" },
  { id: "moonshot-v1-128k", provider: "kimi", tag: "Dài",   label: "Kimi 128K",  desc: "Context cực dài" },
  // MiniMax
  { id: "abab6.5s-chat",    provider: "minimax", tag: "Nhanh", label: "MiniMax 6.5s", desc: "Nhanh, đa năng" },
  { id: "abab6.5g-chat",    provider: "minimax", tag: "Mạnh",  label: "MiniMax 6.5g", desc: "Mạnh hơn" },
  // GLM (Zhipu)
  { id: "glm-4-flash",      provider: "glm", tag: "Nhanh",  label: "GLM-4 Flash",  desc: "Miễn phí, nhanh" },
  { id: "glm-4",            provider: "glm", tag: "Mạnh",   label: "GLM-4",        desc: "Mạnh nhất Zhipu" },
  { id: "glm-4v",           provider: "glm", tag: "Vision", label: "GLM-4V",       desc: "Nhận dạng ảnh" },
  // HuggingFace
  { id: "meta-llama/Llama-3.3-70B-Instruct",  provider: "huggingface", tag: "Mạnh",  label: "Llama 3.3 70B (HF)", desc: "Open source" },
  { id: "Qwen/Qwen2.5-72B-Instruct",          provider: "huggingface", tag: "Mạnh",  label: "Qwen 2.5 72B",       desc: "Alibaba, đa năng" },
  { id: "mistralai/Mistral-7B-Instruct-v0.3", provider: "huggingface", tag: "Nhanh", label: "Mistral 7B",         desc: "Nhẹ, nhanh" },
  // Ollama
  { id: "llama3.2",                       provider: "ollama",     tag: "Local",     label: "Llama 3.2 (local)",    desc: "On-device, không cần key" },
];

function mGetProviderConfig(overrideProvider) {
  if (typeof YanaVault === "undefined") return { provider: overrideProvider || "claude", apiKey: "" };
  if (overrideProvider) {
    const apiKey = M_KEYLESS.has(overrideProvider) ? "" : (YanaVault.getKey(overrideProvider) || "");
    return { provider: overrideProvider, apiKey };
  }
  const order = ["claude", "openai", "gemini", "groq", "deepseek", "openrouter", "9router"];
  for (const id of order) {
    if (M_KEYLESS.has(id)) continue;
    const key = YanaVault.getKey(id);
    if (key) return { provider: id, apiKey: key };
  }
  return { provider: "claude", apiKey: "" };
}

function mAboutContext() {
  const parts = [];
  for (const [id, label] of [["who","Who"],["strengths","Strengths"],["style","Response style"]]) {
    const v = localStorage.getItem("yana.about." + id);
    if (v && v.trim()) parts.push(label + ": " + v.trim());
  }
  return parts.join("\n");
}

const M_CONFIDENTIAL = ["bí mật","confidential","đừng lưu","don't save","#mật","#private","off the record"];
const M_SOVEREIGN    = ["chỉ mình anh biết","sovereign only","#sovereign","local model only"];
function mDetectSensitivity(text) {
  const lo = (text || "").toLowerCase();
  if (M_SOVEREIGN.some((m) => lo.includes(m)))    return "sovereign";
  if (M_CONFIDENTIAL.some((m) => lo.includes(m))) return "confidential";
  return null;
}


// ── Markdown (shared logic with desktop/chat.jsx) ─────────────────────────────
function mSafeHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/ on\w+\s*=\s*["'][^"']*["']/gi,"").replace(/ on\w+\s*=\s*[^\s>]*/gi,"");
}
function mRenderMd(text) {
  if (!text) return "";
  if (typeof marked === "undefined") return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/\n/g,"<br>");
  try { marked.use({ gfm: true, breaks: true }); return mSafeHtml(marked.parse(text)); }
  catch (_) { return text.replace(/\n/g,"<br>"); }
}
function MMarkdownBubble({ text }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof hljs === "undefined") return;
    el.querySelectorAll("pre code:not([data-highlighted])").forEach(b => hljs.highlightElement(b));
  });
  return <div ref={ref} className="yana-md" dangerouslySetInnerHTML={{ __html: mRenderMd(text) }} />;
}
function MCopyBtn({ text }) {
  const [copied, setCopied] = React.useState(false);
  function doCopy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  }
  return (
    <button onClick={doCopy} title="Copy" style={{
      width: 26, height: 26, borderRadius: 7, border: "1px solid var(--border)",
      background: "rgba(var(--surface-rgb,255,255,255),.65)", cursor: "pointer",
      fontSize: 11, display: "grid", placeItems: "center",
      color: copied ? "var(--primary)" : "var(--ink-3)",
    }}>{copied ? "✓" : "⧉"}</button>
  );
}

function MRouteChip({ route }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
      <YanaMark size={18} />
      <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
        via <b style={{ fontWeight: 500, color: "var(--ink-2)" }}>{route.agent}</b> · {route.model}
      </span>
    </div>
  );
}

function MMessage({ msg, isLastYana, onRegenerate }) {
  if (msg.who === "user") {
    const userName  = localStorage.getItem("yana.about.who") || "You";
    const avatarUrl = localStorage.getItem("yana.avatar-url");
    const initial   = (userName[0] || "?").toUpperCase();
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: 8 }}>
        <div style={{
          maxWidth: "82%", padding: "10px 14px", borderRadius: "16px 16px 4px 16px",
          background: "var(--primary)", color: "rgba(255,255,255,.96)",
          fontSize: 14, lineHeight: 1.55,
          boxShadow: "0 4px 14px color-mix(in oklab, var(--primary) 25%, transparent)",
        }}>{msg.text}</div>
        {avatarUrl
          ? <img src={avatarUrl} alt={userName} style={{ width: 28, height: 28, borderRadius: 99, objectFit: "cover", flex: "none", boxShadow: "0 2px 8px rgba(0,0,0,.15)" }} />
          : <div style={{ width: 28, height: 28, borderRadius: 99, flex: "none", background: "var(--primary)", color: "white", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center", boxShadow: "0 2px 8px color-mix(in oklab, var(--primary) 35%, transparent)" }}>{initial}</div>
        }
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div style={{ maxWidth: "90%" }}>
        {msg.route && <MRouteChip route={msg.route} />}
        <div className="glass" style={{ padding: "12px 15px", borderRadius: "4px 16px 16px 16px", fontSize: 14, lineHeight: 1.6, color: "var(--ink)" }}>
          {msg.text ? <MMarkdownBubble text={msg.text} /> : ""}
          {msg.action && (
            <div style={{
              marginTop: 11, padding: "9px 12px", borderRadius: "var(--r-sm)",
              background: "var(--primary-soft)", display: "flex", alignItems: "center", gap: 9,
            }}>
              <span style={{ color: "var(--primary)", flex: "none" }}>{Icons.safety(15)}</span>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--primary)" }}>{msg.action.label}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{msg.action.state}</div>
              </div>
            </div>
          )}
        </div>
        {msg.refs && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
            {msg.refs.map((r) => <span key={r} className="chip neutral" style={{ fontSize: 10.5 }}>{r}</span>)}
          </div>
        )}
        <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
          {msg.text && <MCopyBtn text={msg.text} />}
          {isLastYana && onRegenerate && (
            <button onClick={onRegenerate} title="Retry" style={{
              height: 26, padding: "0 9px", borderRadius: 7, border: "1px solid var(--border)",
              background: "rgba(var(--surface-rgb,255,255,255),.65)", cursor: "pointer",
              fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "var(--ink-3)",
            }}>↺</button>
          )}
        </div>
      </div>
    </div>
  );
}

const M_ALL_PROVIDERS = Object.keys(M_CHAT_MODELS);
const M_LIVE_PROVIDERS = new Set(["groq", "openrouter", "xai", "novita", "nvidia", "kimi", "minimax", "glm", "huggingface", "9router", "ollama"]);

function MModelPickerSheet({ open, onClose, activeProvider, activeModel, onModelChange, liveModels }) {
  // Use live model list if available, fall back to curated catalog
  const liveIds = liveModels && liveModels[activeProvider];
  const models = liveIds
    ? liveIds.map(id => M_MODEL_CATALOG.find(m => m.id === id) || { id, provider: activeProvider, label: id, desc: "", tag: "" })
    : M_MODEL_CATALOG.filter(m => m.provider === activeProvider);

  const tagColor = (tag) => {
    if (tag === "Vision")    return { bg: "#6366f1", color: "#fff" };
    if (tag === "Nhanh")     return { bg: "var(--surface)", color: "var(--accent, #6366f1)", border: "1px solid var(--accent, #6366f1)" };
    if (tag === "Mạnh nhất") return { bg: "#f59e0b", color: "#fff" };
    if (tag === "Mạnh")      return { bg: "var(--surface)", color: "var(--ink-2)", border: "1px solid var(--border)" };
    if (tag === "Code")      return { bg: "#10b981", color: "#fff" };
    if (tag === "Local")     return { bg: "#6b7280", color: "#fff" };
    return { bg: "var(--surface)", color: "var(--ink-3)", border: "1px solid var(--border)" };
  };

  return (
    <Sheet open={open} title={L("Chọn model", "Chọn model")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 12 }}>
        {models.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center", padding: "16px 0" }}>
            {L("No models listed for this provider", "Chưa có model nào cho provider này")}
          </div>
        )}
        {models.map(m => {
          const isActive = activeModel === m.id;
          const tc = tagColor(m.tag);
          return (
            <button
              key={m.id}
              onClick={() => { onModelChange(m.id); onClose(); }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 14px", borderRadius: 12, cursor: "pointer",
                border: isActive ? "1.5px solid var(--accent, #6366f1)" : "1px solid var(--border)",
                background: isActive ? "rgba(99,102,241,.08)" : "var(--surface)",
                textAlign: "left",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>{m.desc}</div>
              </div>
              <span style={{
                fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                whiteSpace: "nowrap", flexShrink: 0,
                background: tc.bg, color: tc.color, border: tc.border || "none",
              }}>{m.tag}</span>
              {isActive && <span style={{ color: "var(--accent, #6366f1)", fontSize: 16, flexShrink: 0 }}>✓</span>}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function MContextSheet({ open, onClose, overrideProvider, overrideModel, onProviderChange, onModelChange }) {
  const D = window.YANA;
  const { provider: _p } = mGetProviderConfig(overrideProvider);
  const _m = overrideModel || M_CHAT_MODELS[_p] || _p;

  function handleProviderSelect(e) {
    const p = e.target.value;
    onProviderChange(p);
    onModelChange(M_CHAT_MODELS[p] || "");
  }

  const selectStyle = {
    border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px",
    fontSize: 12.5, fontWeight: 500, background: "var(--surface)", color: "var(--ink)",
    cursor: "pointer", fontFamily: "inherit", maxWidth: 160,
  };

  return (
    <Sheet open={open} title={L("Routing & context", "Định tuyến & ngữ cảnh")} onClose={onClose}>
      <MCard title={L("Routing", "Định tuyến")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
            <span style={{ color: "var(--ink-3)" }}>{L("Provider", "Nhà cung cấp")}</span>
            <select value={_p} onChange={handleProviderSelect} style={selectStyle}>
              {M_ALL_PROVIDERS.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
            <span style={{ color: "var(--ink-3)" }}>{L("Model", "Mô hình")}</span>
            <input
              value={_m}
              onChange={e => onModelChange(e.target.value)}
              onBlur={e => { if (!e.target.value.trim()) onModelChange(M_CHAT_MODELS[_p] || ""); }}
              style={{ ...selectStyle, textAlign: "right", width: 164, cursor: "text", fontFamily: "ui-monospace, monospace", fontSize: 11.5 }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "var(--ink-3)" }}>{L("Orchestrator", "Điều phối")}</span>
            <span style={{ fontWeight: 500 }}>Navigator</span>
          </div>
        </div>
      </MCard>
      <MCard title={L("Context in use", "Ngữ cảnh đang dùng")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {D.memories.filter((m) => m.pinned || m.fresh).slice(0, 3).map((m) => (
            <div key={m.id} style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45, display: "flex", gap: 8 }}>
              <span style={{ color: m.pinned ? "var(--gold)" : "var(--pink)", flex: "none", marginTop: 1 }}>
                {m.pinned ? Icons.pin(13) : Icons.memory(13)}
              </span>
              {m.text}
            </div>
          ))}
        </div>
      </MCard>
      <MCard title={L("Safety", "An toàn")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="dot on"></span>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{L("Sentinel reviewing all actions", "Sentinel đang giám sát mọi hành động")}</span>
        </div>
      </MCard>
    </Sheet>
  );
}

function MChat() {
  const D = window.YANA;
  const [msgs, setMsgs] = React.useState(D.chat);
  const [draft, setDraft] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [ctx, setCtx] = React.useState(false);
  const [modelPicker, setModelPicker] = React.useState(false);
  const [streaming, setStreaming] = React.useState(false);
  const [atBottom, setAtBottom]   = React.useState(true);
  const logRef    = React.useRef(null);
  const readerRef = React.useRef(null);
  const fileRef   = React.useRef(null);
  const inputRef  = React.useRef(null);
  const [ocrBusy, setOcrBusy] = React.useState(false);

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }

  const [overrideProvider, setOverrideProvider] = React.useState(
    () => localStorage.getItem("yana.chat.provider") || ""
  );
  const [overrideModel, setOverrideModel] = React.useState(
    () => localStorage.getItem("yana.chat.model") || ""
  );
  const [visionImage, setVisionImage] = React.useState(null);
  const visionRef = React.useRef(null);
  const [liveModels, setLiveModels] = React.useState({});

  function handleProviderChange(p) {
    setOverrideProvider(p);
    try { localStorage.setItem("yana.chat.provider", p); } catch (_) {}
  }
  function handleModelChange(m) {
    setOverrideModel(m);
    try { if (m) localStorage.setItem("yana.chat.model", m); else localStorage.removeItem("yana.chat.model"); } catch (_) {}
  }

  const { provider: _activeProvider } = mGetProviderConfig(overrideProvider);
  const _activeModel = overrideModel || M_CHAT_MODELS[_activeProvider] || _activeProvider;
  const isVisionModel = (_m) => ["claude", "openai", "gemini", "groq", "openrouter", "xai", "glm"].includes(_activeProvider);

  // Fetch real model list for live providers (groq, openrouter, etc.)
  React.useEffect(() => {
    const id = _activeProvider;
    if (!M_LIVE_PROVIDERS.has(id) || liveModels[id]) return;
    if (typeof YanaVault === "undefined") return;
    const key = YanaVault.getKey(id) || "";
    if (!key && id !== "ollama" && id !== "9router") return;
    fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: id, key }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && Array.isArray(d.models) && d.models.length) {
          setLiveModels(m => ({ ...m, [id]: d.models.slice(0, 60).map(x => x.id) }));
        }
      })
      .catch(() => {});
  }, [_activeProvider]);

  React.useEffect(() => {
    const el = logRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [msgs, thinking, atBottom]);

  React.useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    function onScroll() { setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80); }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // New-chat event from TopBar
  React.useEffect(() => {
    function onNew() { setMsgs([]); D.chat = []; }
    window.addEventListener("yana:newchat", onNew);
    return () => window.removeEventListener("yana:newchat", onNew);
  }, []);

  // Persist chat history (non-confidential only)
  React.useEffect(() => {
    D.chat = msgs;
    try {
      localStorage.setItem("yana.chat", JSON.stringify(
        msgs.filter((m) => !m.confidential).slice(-60)
      ));
    } catch (_) {}
  }, [msgs]);

  React.useEffect(() => { return () => { if (readerRef.current) readerRef.current.cancel(); }; }, []);

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
        setMsgs((m) => [...m, { who: "yana", text: "OCR: " + (data.error || "Failed") }]);
      }
    } catch (err) {
      setMsgs((m) => [...m, { who: "yana", text: "OCR error: " + String(err) }]);
    } finally {
      setOcrBusy(false);
    }
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

  function stopStream() {
    if (readerRef.current) { readerRef.current.cancel(); readerRef.current = null; }
    setStreaming(false); setThinking(false);
  }

  async function sendText(text) {
    if (!text || thinking || streaming) return;

    // Ensure vault has finished decrypting keys from IndexedDB before reading
    if (typeof YanaVault !== "undefined") await YanaVault.ready;

    const tier = mDetectSensitivity(text);
    setMsgs((m) => [...m, { who: "user", text, confidential: !!tier, tier }]);
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setThinking(true);
    setAtBottom(true);

    // VTuber companion
    if (!tier) window.dispatchEvent(new CustomEvent("yana-chat-message"));

    let { provider, apiKey } = mGetProviderConfig(overrideProvider);
    if (tier === "sovereign") { provider = "ollama"; apiKey = ""; }
    const model = overrideModel || M_CHAT_MODELS[provider] || "";

    try {
      const capturedVisionImage = visionImage;
      setVisionImage(null);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tier
          ? { task: text, apiKey, provider, model, sensitivity: tier, ...(capturedVisionImage ? { images: [capturedVisionImage] } : {}) }
          : { task: text, apiKey, provider, model, about: mAboutContext(), ...(capturedVisionImage ? { images: [capturedVisionImage] } : {}) }),
      });

      if (!res.ok || !res.body) throw new Error("HTTP " + res.status);

      const reader = res.body.getReader();
      readerRef.current = reader;
      setStreaming(true);
      const decoder = new TextDecoder();
      let buf = "";
      let accumulated = "";
      const msgId = Date.now();

      setMsgs((m) => [...m, {
        who: "yana",
        route: { agent: provider, model: model + (tier ? " · 🔒" : "") },
        text: "", confidential: !!tier, tier, _id: msgId,
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
            if (obj.error) accumulated += "\n[Error: " + obj.error + "]";
            else if (obj.text) accumulated += obj.text;
            const snap = accumulated;
            setMsgs((m) => m.map((msg) => msg._id === msgId ? { ...msg, text: snap } : msg));
          } catch (_) {}
        }
      }
      setStreaming(false);
      readerRef.current = null;

      // ChatGPT-style memory — strip MEMORY: line and persist it
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
      }
    } catch (err) {
      setThinking(false);
      setStreaming(false);
      readerRef.current = null;
      setMsgs((m) => [...m, {
        who: "yana",
        route: { agent: provider, model },
        confidential: !!tier, tier,
        text: tier === "sovereign"
          ? L("Cannot reach local model. SOVEREIGN content only goes to Ollama (127.0.0.1:11434) — run `ollama serve`.",
              "Không kết nối được model local. Nội dung SOVEREIGN chỉ đến Ollama (127.0.0.1:11434) — chạy `ollama serve`.")
          : L("Server error (" + err.message + "). Check Yana is running and an API key is set in Providers.",
              "Lỗi kết nối (" + err.message + "). Kiểm tra Yana đang chạy và đã thêm API key trong Providers."),
      }]);
    }
  }

  function send() {
    const text = draft.trim();
    if (text) sendText(text);
  }

  return (
    <div data-screen-label="Chat" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative" }}>
      {/* slim context bar — compact routing icon + model picker chip */}
      <div style={{ flex: "none", display: "flex", gap: 8, margin: "12px 16px 8px" }}>
        {/* Routing / context trigger — compact icon, expands the routing+context Sheet on tap */}
        <button onClick={() => setCtx(true)} aria-label={L("Routing & context", "Định tuyến & ngữ cảnh")} title={_activeProvider} style={{
          width: 40, height: 40, flex: "none", borderRadius: "var(--r-md)",
          border: "1px solid var(--border)", background: "rgba(var(--surface-rgb), .5)", cursor: "pointer",
          display: "grid", placeItems: "center", color: "var(--primary)",
        }}>
          {Icons.safety(17)}
        </button>

        {/* Model chip — opens model picker sheet, takes the freed-up width */}
        <button onClick={() => setModelPicker(true)} style={{
          flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6,
          padding: "9px 13px", borderRadius: 99, border: "1px solid var(--border)", cursor: "pointer",
          background: "rgba(var(--surface-rgb), .5)", color: "var(--ink-2)",
        }}>
          {isVisionModel(_activeModel) && <span style={{ fontSize: 12 }}>📷</span>}
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {(M_MODEL_CATALOG.find(m => m.id === _activeModel) || {}).label || _activeModel.split("-").slice(0, 3).join("-")}
          </span>
          {Icons.chevron(13)}
        </button>
      </div>

      <div ref={logRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "calc(15px * var(--sp))", padding: "6px 16px 14px", minHeight: 0 }}>
        {msgs.map((m, i) => (
          <MMessage key={i} msg={m}
            isLastYana={!streaming && i === msgs.length - 1 && m.who === "yana"}
            onRegenerate={regenerate}
          />
        ))}
        {thinking && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--ink-3)", fontSize: 12.5 }}>
            <YanaMark size={18} /> {L("Navigator is thinking…", "Navigator đang suy nghĩ…")}
          </div>
        )}
      </div>

      {!atBottom && (
        <button
          onClick={() => { const el = logRef.current; if (el) { el.scrollTop = el.scrollHeight; setAtBottom(true); } }}
          style={{
            position: "absolute", bottom: "calc(90px + env(safe-area-inset-bottom, 0px))", right: 16,
            width: 32, height: 32, borderRadius: 99, border: "1px solid var(--border)",
            background: "var(--surface)", color: "var(--ink-2)", cursor: "pointer",
            display: "grid", placeItems: "center", fontSize: 15,
            boxShadow: "0 2px 10px rgba(0,0,0,.15)", zIndex: 10,
          }}>↓</button>
      )}

      <div style={{ flex: "none", padding: "8px 12px calc(12px + env(safe-area-inset-bottom, 0px))" }}>
        <input type="file" ref={fileRef} accept="image/*,.pdf" style={{ display: "none" }} onChange={handleOcr} />
        <input type="file" ref={visionRef} accept="image/*" style={{ display: "none" }} onChange={handleVisionAttach} />
        <div className="glass-strong" style={{ borderRadius: 18, padding: "7px 7px 7px 15px", display: "flex", alignItems: "center", gap: 9 }}>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); autoResize(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={L("Give Yana a direction… (Shift+Enter for new line)", "Giao cho Yana một hướng đi… (Shift+Enter xuống dòng)")}
            className="chat-input"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", color: "var(--ink)", lineHeight: 1.5, maxHeight: 140, overflowY: "auto" }}
          />
          {isVisionModel(_activeModel) && (
            <button
              onClick={() => visionRef.current && visionRef.current.click()}
              style={{ background: "none", border: "none", padding: "0 4px", cursor: "pointer", opacity: visionImage ? 1 : 0.55 }}
              title={visionImage ? visionImage.name : "Attach image"}
            >
              {visionImage ? "🖼️" : "📷"}
            </button>
          )}
          {visionImage && (
            <span
              onClick={() => setVisionImage(null)}
              style={{ fontSize: 10, color: "var(--ink-3)", cursor: "pointer" }}
            >✕</span>
          )}
          <button
            onClick={() => fileRef.current && fileRef.current.click()}
            aria-label={L("Attach file", "Đính kèm file")}
            disabled={ocrBusy}
            style={{
              width: 36, height: 36, borderRadius: 11, border: "1px solid var(--border)", cursor: ocrBusy ? "not-allowed" : "pointer", flex: "none",
              background: "transparent", color: ocrBusy ? "var(--ink-3)" : "var(--ink-2)", display: "grid", placeItems: "center",
            }}>
            {ocrBusy ? "…" : Icons.attach(16)}
          </button>
          {streaming || thinking
            ? <button onClick={stopStream} aria-label="Stop" style={{
                width: 38, height: 38, borderRadius: 12, border: "none", cursor: "pointer", flex: "none",
                background: "var(--ink-3)", color: "white", display: "grid", placeItems: "center",
              }}>■</button>
            : <button onClick={send} aria-label="Send" style={{
                width: 38, height: 38, borderRadius: 12, border: "none", cursor: "pointer", flex: "none",
                background: "var(--primary)", color: "white", display: "grid", placeItems: "center",
                boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
              }}>{Icons.send(17)}</button>
          }
        </div>
      </div>

      <MContextSheet
        open={ctx} onClose={() => setCtx(false)}
        overrideProvider={overrideProvider} overrideModel={overrideModel}
        onProviderChange={handleProviderChange} onModelChange={handleModelChange}
      />
      <MModelPickerSheet
        open={modelPicker}
        onClose={() => setModelPicker(false)}
        activeProvider={_activeProvider}
        activeModel={_activeModel}
        onModelChange={m => { handleModelChange(m); }}
        liveModels={liveModels}
      />
    </div>
  );
}

window.MChat = MChat;
