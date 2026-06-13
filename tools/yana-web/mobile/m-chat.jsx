// Yana Mobile — Conversation. Calls /api/chat with SSE streaming — mirrors chat.jsx.

/* ── Mobile-local helpers (chat.jsx not loaded on mobile) ─────────────────── */
const M_CHAT_MODELS = {
  claude: "claude-sonnet-4-6", openai: "gpt-4o-mini", gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile", deepseek: "deepseek-chat",
  openrouter: "google/gemma-3-27b-it", "9router": "kr/claude-sonnet-4.5", ollama: "llama3.2",
};
const M_KEYLESS = new Set(["ollama"]);

function mGetProviderConfig() {
  if (typeof YanaVault === "undefined") return { provider: "claude", apiKey: "" };
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

function MContextSheet({ open, onClose }) {
  const D = window.YANA;
  return (
    <Sheet open={open} title={L("Routing & context", "Định tuyến & ngữ cảnh")} onClose={onClose}>
      <MCard title={L("Routing", "Định tuyến")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {[[L("Orchestrator", "Điều phối"), "Navigator"], [L("Model", "Mô hình"), "Claude Opus 4.5"], [L("Fallback", "Dự phòng"), "GPT 5.2"], [L("Router", "Bộ định tuyến"), "Groq · 0.2s"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--ink-3)" }}>{k}</span>
              <span style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
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
  const logRef = React.useRef(null);
  const readerRef = React.useRef(null);
  // active provider for context bar — reflects the first key the user has set
  const { provider: _activeProvider } = mGetProviderConfig();
  const _activeModel = M_CHAT_MODELS[_activeProvider] || _activeProvider;

  React.useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, thinking]);

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

  async function send() {
    const text = draft.trim();
    if (!text || thinking) return;

    const tier = mDetectSensitivity(text);
    setMsgs((m) => [...m, { who: "user", text, confidential: !!tier, tier }]);
    setDraft("");
    setThinking(true);

    let { provider, apiKey } = mGetProviderConfig();
    if (tier === "sovereign") { provider = "ollama"; apiKey = ""; }
    const model = M_CHAT_MODELS[provider] || "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tier
          ? { task: text, apiKey, provider, model, sensitivity: tier }
          : { task: text, apiKey, provider, model, about: mAboutContext() }),
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
      {/* slim context bar replaces the desktop right rail */}
      <button onClick={() => setCtx(true)} style={{
        flex: "none", display: "flex", alignItems: "center", gap: 9, margin: "12px 16px 8px",
        padding: "9px 13px", borderRadius: 99, border: "1px solid var(--border)", cursor: "pointer",
        background: "rgba(var(--surface-rgb), .5)", color: "var(--ink-2)", textAlign: "left",
      }}>
        <span style={{ color: "var(--primary)", display: "inline-flex" }}>{Icons.safety(15)}</span>
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{_activeProvider} · {_activeModel}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--ink-3)" }}>
          <span className="dot on" style={{ width: 6, height: 6, boxShadow: "none" }}></span>{L("Context", "Ngữ cảnh")} {Icons.chevron(13)}
        </span>
      </button>

      <div ref={logRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "calc(15px * var(--sp))", padding: "6px 16px 14px", minHeight: 0 }}>
        {msgs.map((m, i) => <MMessage key={i} msg={m} />)}
        {thinking && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--ink-3)", fontSize: 12.5 }}>
            <YanaMark size={18} /> {L("Navigator is thinking…", "Navigator đang suy nghĩ…")}
          </div>
        )}
      </div>

      <div style={{ flex: "none", padding: "8px 12px calc(12px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="glass-strong" style={{ borderRadius: 18, padding: "7px 7px 7px 15px", display: "flex", alignItems: "center", gap: 9 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder={L("Give Yana a direction…", "Giao cho Yana một hướng đi…")}
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 14.5, fontFamily: "inherit", color: "var(--ink)" }}
          />
          <button onClick={send} aria-label="Send" style={{
            width: 38, height: 38, borderRadius: 12, border: "none", cursor: "pointer", flex: "none",
            background: "var(--primary)", color: "white", display: "grid", placeItems: "center",
            boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
          }}>{Icons.send(17)}</button>
        </div>
      </div>

      <MContextSheet open={ctx} onClose={() => setCtx(false)} />
    </div>
  );
}

window.MChat = MChat;
