// Yana AI — Chat (orchestration-centric, not a chatbot clone)

// ── Rule 68 — Confidential Mode ───────────────────────────────────────────────
// Mirror of the canonical marker tables in src/route.rs / yamtam-core.
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
const KEYLESS_PROVIDERS = new Set(["ollama"]);
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

function Message({ msg }) {
  if (msg.who === "user") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <div style={{
          maxWidth: "72%", padding: "10px 15px", borderRadius: "16px 16px 4px 16px",
          background: "var(--primary)", color: "rgba(255,255,255,.96)",
          fontSize: 13.8, lineHeight: 1.55,
          boxShadow: "0 4px 14px color-mix(in oklab, var(--primary) 25%, transparent)",
          ...(msg.confidential ? { border: "1px dashed rgba(255,255,255,.55)" } : {}),
        }}>{msg.text}</div>
        {msg.confidential && <ConfidentialBadge tier={msg.tier} />}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div style={{ maxWidth: "82%" }}>
        {msg.route && <RouteChip route={msg.route} />}
        <div className="glass" style={{ padding: "12px 16px", borderRadius: "4px 16px 16px 16px", fontSize: 13.8, lineHeight: 1.6, color: "var(--ink)" }}>
          {msg.text}
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
  "9router":  "kr/claude-sonnet-4.5",
  ollama:     "llama3.2",
};

// Curated model choices per provider — providers in CHAT_LIVE_MODELS get the
// real list fetched from /api/models when a key is available.
const MODEL_CHOICES = {
  claude:     ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"],
  openai:     ["gpt-4o-mini", "gpt-4o"],
  gemini:     ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  deepseek:   ["deepseek-chat", "deepseek-reasoner"],
  groq:       ["llama-3.3-70b-versatile"],
  openrouter: ["google/gemma-3-27b-it"],
  "9router":  ["kr/claude-sonnet-4.5"],
  ollama:     ["llama3.2"],
};
const CHAT_LIVE_MODELS = new Set(["groq", "openrouter", "9router", "ollama"]);

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
  const logRef = React.useRef(null);
  const readerRef = React.useRef(null);

  const activeProvider = providerSel || getProviderConfig().provider;
  const modelOptions = liveModels[activeProvider] || MODEL_CHOICES[activeProvider] || [];
  const activeModel = modelSel[activeProvider] || CHAT_MODELS[activeProvider] || (modelOptions[0] || "");

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

  React.useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, thinking]);

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

  async function send() {
    const text = draft.trim();
    if (!text || thinking) return;

    // Rule 68 — classify before the first byte leaves this page
    const detected = detectSensitivity(text);
    const tier = detected === "sovereign" ? "sovereign"
               : (detected || confMode)   ? "confidential"
               : null;

    setMsgs((m) => [...m, { who: "user", text, confidential: !!tier, tier }]);
    setDraft("");
    setThinking(true);

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
          : { task: text, apiKey, provider, model, skill, about: aboutContext() }),
      });

      if (!res.ok || !res.body) {
        throw new Error("HTTP " + res.status);
      }

      const reader = res.body.getReader();
      readerRef.current = reader;
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
          } catch (_) {}
        }
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
          : L("Could not reach the server. Check that Yana is running and a provider key is set.",
              "Không kết nối được máy chủ. Kiểm tra Yana đang chạy và đã đặt API key."),
      }]);
    }
  }

  return (
    <div data-screen-label="Chat" style={{ display: "flex", gap: "var(--gap)", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <PageHeader title={L("Conversation", "Trò chuyện")} sub={L("One conversation, many hands — Yana routes each request to the right agent.", "Một cuộc trò chuyện, nhiều bàn tay — Yana chuyển mỗi yêu cầu đến đúng tác nhân.")} />
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
          {msgs.map((m, i) => <Message key={m._id || i} msg={m} />)}
          {thinking && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--ink-3)", fontSize: 12.5 }}>
              <YanaMark size={20} /> {L("Navigator is thinking…", "Navigator đang suy nghĩ…")}
            </div>
          )}
        </div>
        <div className="glass-strong" style={{ borderRadius: "var(--r-lg)", padding: "10px 10px 10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder={L("Ask Yana, or give the system a direction…", "Hỏi Yana, hoặc giao cho hệ thống một hướng đi…")}
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", color: "var(--ink)" }}
          />
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
          <select value={providerSel || getProviderConfig().provider}
            onChange={(e) => setProviderSel(e.target.value)}
            title={L("Provider for this conversation", "Nhà cung cấp cho cuộc trò chuyện")}
            style={{
              border: "1px solid var(--border)", borderRadius: 99, padding: "5px 9px",
              background: "transparent", color: "var(--ink-2)", fontSize: 11.5,
              fontFamily: "inherit", cursor: "pointer", maxWidth: 120,
            }}>
            {D.providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!providerAvailable(p.id)}>
                {p.name}{providerAvailable(p.id) ? "" : " 🔒"}
              </option>
            ))}
          </select>
          <select value={activeModel} onChange={(e) => pickModel(e.target.value)}
            title={L("Model for this provider — choice is remembered", "Model cho nhà cung cấp này — lựa chọn được ghi nhớ")}
            style={{
              border: "1px solid var(--border)", borderRadius: 99, padding: "5px 9px",
              background: "transparent", color: "var(--ink-2)", fontSize: 11.5,
              fontFamily: "inherit", cursor: "pointer", maxWidth: 150,
            }}>
            {(modelOptions.includes(activeModel) ? modelOptions : [activeModel, ...modelOptions]).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <span className="chip neutral" style={{ fontSize: 11.5 }}>{Icons.safety(12)} {L("Sentinel on", "Sentinel bật")}</span>
          <button onClick={send} aria-label="Send" style={{
            width: 36, height: 36, borderRadius: 11, border: "none", cursor: "pointer",
            background: "var(--primary)", color: "white", display: "grid", placeItems: "center",
            boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
          }}>{Icons.send(16)}</button>
        </div>
      </div>
      <ContextPanel />
    </div>
  );
}

window.Chat = Chat;
