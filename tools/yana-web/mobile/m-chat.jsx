// Yana Mobile — Conversation. Calls /api/chat with SSE streaming — mirrors chat.jsx.

/* ── Mobile-local helpers (chat.jsx not loaded on mobile) ─────────────────── */
const M_CHAT_MODELS = {
  claude: "claude-sonnet-4-6", openai: "gpt-4o-mini", gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile", deepseek: "deepseek-chat",
  openrouter: "google/gemma-3-27b-it", "9router": "kr/claude-sonnet-4.5", ollama: "llama3.2",
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
  { id: "gemini-1.5-pro",                 provider: "gemini",     tag: "Mạnh",      label: "Gemini 1.5 Pro",       desc: "Context 1M token" },
  // Groq
  { id: "llama-3.3-70b-versatile",        provider: "groq",       tag: "Nhanh",     label: "Llama 3.3 70B",        desc: "Văn bản, đa năng, rất nhanh" },
  { id: "llama-3.2-11b-vision-preview",   provider: "groq",       tag: "Vision",    label: "Llama 3.2 11B Vision", desc: "Nhận dạng ảnh (nhẹ)" },
  { id: "llama-3.2-90b-vision-preview",   provider: "groq",       tag: "Vision",    label: "Llama 3.2 90B Vision", desc: "Nhận dạng ảnh (chất lượng cao)" },
  // Deepseek
  { id: "deepseek-chat",                  provider: "deepseek",   tag: "Code",      label: "DeepSeek Chat",        desc: "Code + lý luận" },
  { id: "deepseek-reasoner",              provider: "deepseek",   tag: "Mạnh",      label: "DeepSeek Reasoner",    desc: "Suy luận chuỗi dài" },
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

function MMessage({ msg }) {
  if (msg.who === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{
          maxWidth: "84%", padding: "10px 14px", borderRadius: "16px 16px 4px 16px",
          background: "var(--primary)", color: "rgba(255,255,255,.96)",
          fontSize: 14, lineHeight: 1.55,
          boxShadow: "0 4px 14px color-mix(in oklab, var(--primary) 25%, transparent)",
        }}>{msg.text}</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div style={{ maxWidth: "90%" }}>
        {msg.route && <MRouteChip route={msg.route} />}
        <div className="glass" style={{ padding: "12px 15px", borderRadius: "4px 16px 16px 16px", fontSize: 14, lineHeight: 1.6, color: "var(--ink)" }}>
          {msg.text}
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
      </div>
    </div>
  );
}

const M_ALL_PROVIDERS = Object.keys(M_CHAT_MODELS);

function MModelPickerSheet({ open, onClose, activeProvider, activeModel, onModelChange }) {
  const models = M_MODEL_CATALOG.filter(m => m.provider === activeProvider);

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
  const logRef  = React.useRef(null);
  const readerRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const [ocrBusy, setOcrBusy] = React.useState(false);

  const [overrideProvider, setOverrideProvider] = React.useState(
    () => localStorage.getItem("yana.chat.provider") || ""
  );
  const [overrideModel, setOverrideModel] = React.useState(
    () => localStorage.getItem("yana.chat.model") || ""
  );
  const [visionImage, setVisionImage] = React.useState(null);
  const visionRef = React.useRef(null);

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
  const isVisionModel = (m) => m && m.includes("vision");

  React.useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, thinking]);

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

  function handleVisionAttach(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      const [header, data] = dataUrl.split(",");
      const mimeType = header.replace("data:", "").replace(";base64", "");
      setVisionImage({ data, mimeType, name: file.name });
    };
    reader.readAsDataURL(file);
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

  async function send() {
    const text = draft.trim();
    if (!text || thinking) return;

    const tier = mDetectSensitivity(text);
    setMsgs((m) => [...m, { who: "user", text, confidential: !!tier, tier }]);
    setDraft("");
    setThinking(true);

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
      setMsgs((m) => [...m, {
        who: "yana",
        route: { agent: provider, model },
        confidential: !!tier, tier,
        text: tier === "sovereign"
          ? L("Cannot reach local model. SOVEREIGN content only goes to Ollama (127.0.0.1:11434) — run `ollama serve`.",
              "Không kết nối được model local. Nội dung SOVEREIGN chỉ đến Ollama (127.0.0.1:11434) — chạy `ollama serve`.")
          : L("Server error. Check Yana is running and an API key is set in Providers.",
              "Lỗi kết nối. Kiểm tra Yana đang chạy và đã thêm API key trong Providers."),
      }]);
    }
  }

  return (
    <div data-screen-label="Chat" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* slim context bar — two chips: provider/context + model picker */}
      <div style={{ flex: "none", display: "flex", gap: 8, margin: "12px 16px 8px" }}>
        {/* Provider / context chip — opens routing + context sheet */}
        <button onClick={() => setCtx(true)} style={{
          flex: 1, display: "flex", alignItems: "center", gap: 8,
          padding: "9px 13px", borderRadius: 99, border: "1px solid var(--border)", cursor: "pointer",
          background: "rgba(var(--surface-rgb), .5)", color: "var(--ink-2)", textAlign: "left",
        }}>
          <span style={{ color: "var(--primary)", display: "inline-flex" }}>{Icons.safety(15)}</span>
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>{_activeProvider}</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ink-3)" }}>
            {L("Context", "Ngữ cảnh")} {Icons.chevron(13)}
          </span>
        </button>

        {/* Model chip — opens model picker sheet */}
        <button onClick={() => setModelPicker(true)} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "9px 13px", borderRadius: 99, border: "1px solid var(--border)", cursor: "pointer",
          background: "rgba(var(--surface-rgb), .5)", color: "var(--ink-2)", whiteSpace: "nowrap",
        }}>
          {isVisionModel(_activeModel) && <span style={{ fontSize: 12 }}>📷</span>}
          <span style={{ fontSize: 12, fontWeight: 500, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>
            {(M_MODEL_CATALOG.find(m => m.id === _activeModel) || {}).label || _activeModel.split("-").slice(0, 3).join("-")}
          </span>
          {Icons.chevron(13)}
        </button>
      </div>

      <div ref={logRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "calc(15px * var(--sp))", padding: "6px 16px 14px", minHeight: 0 }}>
        {msgs.map((m, i) => <MMessage key={i} msg={m} />)}
        {thinking && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--ink-3)", fontSize: 12.5 }}>
            <YanaMark size={18} /> {L("Navigator is thinking…", "Navigator đang suy nghĩ…")}
          </div>
        )}
      </div>

      <div style={{ flex: "none", padding: "8px 12px calc(12px + env(safe-area-inset-bottom, 0px))" }}>
        <input type="file" ref={fileRef} accept="image/*,.pdf" style={{ display: "none" }} onChange={handleOcr} />
        <input type="file" ref={visionRef} accept="image/*" style={{ display: "none" }} onChange={handleVisionAttach} />
        <div className="glass-strong" style={{ borderRadius: 18, padding: "7px 7px 7px 15px", display: "flex", alignItems: "center", gap: 9 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder={L("Give Yana a direction…", "Giao cho Yana một hướng đi…")}
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", color: "var(--ink)" }}
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
          <button onClick={send} aria-label="Send" style={{
            width: 38, height: 38, borderRadius: 12, border: "none", cursor: "pointer", flex: "none",
            background: "var(--primary)", color: "white", display: "grid", placeItems: "center",
            boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
          }}>{Icons.send(17)}</button>
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
      />
    </div>
  );
}

window.MChat = MChat;
