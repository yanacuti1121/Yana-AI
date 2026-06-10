// Yana AI — Chat (orchestration-centric, not a chatbot clone)
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
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{
          maxWidth: "72%", padding: "10px 15px", borderRadius: "16px 16px 4px 16px",
          background: "var(--primary)", color: "rgba(255,255,255,.96)",
          fontSize: 13.8, lineHeight: 1.55,
          boxShadow: "0 4px 14px color-mix(in oklab, var(--primary) 25%, transparent)",
        }}>{msg.text}</div>
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

function ContextPanel() {
  const D = window.YANA;
  return (
    <aside style={{ width: 240, flex: "none", display: "flex", flexDirection: "column", gap: "var(--gap)", overflowY: "auto" }}>
      <Card title={L("Routing", "Định tuyến")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {[[L("Orchestrator", "Điều phối"), "Navigator"], [L("Model", "Mô hình"), "Claude Sonnet 4.6"], [L("Fallback", "Dự phòng"), "GPT-4o"], [L("Router", "Bộ định tuyến"), "Groq · 0.2s"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ color: "var(--ink-3)" }}>{k}</span>
              <span style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title={L("Context in use", "Ngữ cảnh đang dùng")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {D.memories.filter((m) => m.pinned || m.fresh).slice(0, 3).map((m) => (
            <div key={m.id} style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45, display: "flex", gap: 7 }}>
              <span style={{ color: m.pinned ? "var(--gold)" : "var(--pink)", flex: "none", marginTop: 1 }}>
                {m.pinned ? Icons.pin(13) : Icons.memory(13)}
              </span>
              {m.text}
            </div>
          ))}
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
function getProviderConfig() {
  const order = ["claude", "openai", "gemini", "groq", "deepseek", "openrouter"];
  for (const id of order) {
    const key = YanaVault.getKey(id);
    if (key) return { provider: id, apiKey: key };
  }
  return { provider: "claude", apiKey: "" };
}

function Chat({ t }) {
  const D = window.YANA;
  const [msgs, setMsgs] = React.useState(D.chat);
  const [draft, setDraft] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const logRef = React.useRef(null);
  const readerRef = React.useRef(null);

  React.useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, thinking]);

  // Cancel any in-flight stream on unmount
  React.useEffect(() => {
    return () => { if (readerRef.current) readerRef.current.cancel(); };
  }, []);

  async function send() {
    const text = draft.trim();
    if (!text || thinking) return;
    setMsgs((m) => [...m, { who: "user", text }]);
    setDraft("");
    setThinking(true);

    const { provider, apiKey } = getProviderConfig();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: text, apiKey, provider }),
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

      // Insert placeholder Yana message
      setMsgs((m) => [...m, {
        who: "yana",
        route: { agent: "Navigator", model: provider === "claude" ? "Claude Sonnet 4.6" : provider },
        text: "",
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
    } catch (err) {
      setThinking(false);
      setMsgs((m) => [...m, {
        who: "yana",
        route: { agent: "Navigator", model: provider },
        text: "Could not reach the server. Check that Yana is running and a provider key is set.",
      }]);
    }
  }

  return (
    <div data-screen-label="Chat" style={{ display: "flex", gap: "var(--gap)", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <PageHeader title={L("Conversation", "Trò chuyện")} sub={L("One conversation, many hands — Yana routes each request to the right agent.", "Một cuộc trò chuyện, nhiều bàn tay — Yana chuyển mỗi yêu cầu đến đúng tác nhân.")} />
        <div ref={logRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "calc(16px * var(--sp))", padding: "4px 4px 16px", minHeight: 0 }}>
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
