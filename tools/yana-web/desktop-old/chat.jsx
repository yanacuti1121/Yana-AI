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
  if (id === "auto") return true;
  return KEYLESS_PROVIDERS.has(id) || YanaVault.hasKey(id);
}

// Smart provider routing — picks best provider based on task classification.
// localStatus: { ollama: { running, models }, ... } from /api/local-status.
// routeType: 'complex' | 'simple'  from /api/route decision field.
// taskText: raw user message (used for keyword signals).
function smartPickProvider(taskText, routeType, localStatus) {
  const lower = (taskText || "").toLowerCase();
  const running = (id) => localStatus && localStatus[id] && localStatus[id].running;
  const keyed   = (id) => YanaVault.hasKey(id);

  // Code tasks → local first (private, free), then cost-efficient cloud
  const isCode = /\b(code|fix|bug|function|class|import|error|implement|refactor|debug|typescript|python|javascript|rust|bash)\b/.test(lower);
  // Reasoning / long analysis → strongest model
  const isDeep = routeType === "complex" || /\b(explain|analyze|compare|design|architect|why|how does|strategy|plan)\b/.test(lower);
  // Fast/simple tasks → Groq (sub-300ms)
  const isFast = routeType === "simple" && !isCode && !isDeep;

  const localOrder  = ["ollama", "lmstudio", "9router"];
  const firstLocal  = localOrder.find(id => running(id));

  if (isCode) {
    // Code: local (private) > DeepSeek (cheap code model) > Claude > rest
    if (firstLocal)       return { provider: firstLocal, reason: "code · local · free" };
    if (keyed("deepseek")) return { provider: "deepseek", reason: "code · cost-efficient" };
    if (keyed("claude"))   return { provider: "claude",   reason: "code · best quality" };
    if (keyed("openai"))   return { provider: "openai",   reason: "code · GPT-4o" };
  } else if (isFast) {
    // Simple / fast: Groq (sub-300ms) > local > Claude
    if (keyed("groq"))    return { provider: "groq",   reason: "simple · sub-300ms" };
    if (firstLocal)       return { provider: firstLocal, reason: "simple · local" };
    if (keyed("claude"))  return { provider: "claude", reason: "simple · reliable" };
  } else {
    // Deep reasoning: Claude > DeepSeek R1 > local > Groq
    if (keyed("claude"))    return { provider: "claude",    reason: "reasoning · best" };
    if (keyed("deepseek"))  return { provider: "deepseek",  reason: "reasoning · R1" };
    if (firstLocal)         return { provider: firstLocal,  reason: "reasoning · local" };
    if (keyed("groq"))      return { provider: "groq",      reason: "reasoning · fast" };
  }

  // Final fallback: any available
  if (firstLocal)           return { provider: firstLocal, reason: "local · free" };
  const cloudOrder = ["claude", "openai", "gemini", "groq", "deepseek", "openrouter"];
  const firstCloud = cloudOrder.find(id => keyed(id));
  if (firstCloud)           return { provider: firstCloud, reason: "available" };
  return { provider: "claude", reason: "fallback" };
}
window.providerAvailable = providerAvailable;
window.KEYLESS_PROVIDERS = KEYLESS_PROVIDERS;

function ConfidentialBadge({ tier }) {
  return (
    <span className="chip neutral" style={{ fontSize: 10.5, marginTop: 5, display: "inline-flex", alignItems: "center", gap: 4 }}
      title={L("Rule 68 — this message is never saved to history, memory, or missions.",
               "Rule 68 — tin nhắn này không bao giờ được lưu vào lịch sử, ký ức hay mission.",
               "Rule 68 — 이 메시지는 기록, 메모리, 미션에 저장되지 않습니다.",
               "规则 68 — 此消息永远不会被保存到历史记录、记忆或任务中。")}>
      🔒 {tier === "sovereign"
        ? L("Sovereign · local only · not saved", "Sovereign · chỉ local · không lưu", "Sovereign · 로컬 전용 · 저장 안 함", "Sovereign · 仅本地 · 不保存")
        : L("Confidential · not saved", "Mật · không lưu", "기밀 · 저장 안 함", "机密 · 不保存")}
    </span>
  );
}

// Approximate output token cost per 1K tokens (USD) — mid-tier models
const PROVIDER_PRICE = {
  claude: 0.003, openai: 0.0006, gemini: 0.0004, groq: 0.00008,
  deepseek: 0.00028, openrouter: 0.001,
  ollama: 0, lmstudio: 0, "9router": 0,
};

function RouteChip({ route }) {
  const local = ["ollama", "lmstudio", "9router"].includes(route.agent) ||
                (route.agent && route.agent.startsWith("Auto →") &&
                 ["ollama", "lmstudio", "9router"].some(p => route.agent.includes(p)));
  const priceKey = route.agent && route.agent.startsWith("Auto →")
    ? (["ollama","lmstudio","9router"].find(p => route.agent.includes(p)) || route.agent.split("→")[1]?.trim() || "claude")
    : route.agent;
  const pricePer1k = PROVIDER_PRICE[priceKey] ?? 0.003;

  const [meta, setMeta] = React.useState(null); // { secs, chars }
  React.useEffect(() => {
    if (route._streamDone) setMeta(route._streamDone);
  }, [route._streamDone]);

  const costStr = meta
    ? (pricePer1k === 0
        ? L("$0.00 · free", "$0.00 · miễn phí", "$0.00 · 무료", "$0.00 · 免费")
        : "$" + ((meta.chars / 4 / 1000) * pricePer1k).toFixed(4))
    : null;
  const speedStr = meta ? (meta.secs < 60 ? meta.secs.toFixed(1) + "s" : Math.round(meta.secs) + "s") : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, flexWrap: "wrap" }}>
      <YanaMark size={20} />
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
        via <b style={{ fontWeight: 500, color: "var(--ink-2)" }}>{route.agent}</b> · {route.model}
      </span>
      {speedStr && (
        <span style={{ fontSize: 11, color: local ? "#16a34a" : "var(--ink-3)", background: local ? "color-mix(in srgb,#22c55e 10%,transparent)" : "color-mix(in srgb,var(--ink) 6%,transparent)", border: "1px solid color-mix(in srgb," + (local ? "#22c55e" : "var(--ink)") + " 15%,transparent)", borderRadius: 99, padding: "2px 7px", fontWeight: 500 }}>
          {speedStr} · {costStr}
        </span>
      )}
    </div>
  );
}

// ── Ollama Model Manager ──────────────────────────────────────────────────────
function OllamaManager() {
  const [models, setModels]       = React.useState(null);   // null=loading, []=loaded
  const [pullName, setPullName]   = React.useState("");
  const [pulling, setPulling]     = React.useState(false);
  const [pullLog, setPullLog]     = React.useState("");
  const [open, setOpen]           = React.useState(false);
  const [deleting, setDeleting]   = React.useState(null);

  function reload() {
    fetch("/api/ollama/models")
      .then(r => r.ok ? r.json() : null)
      .then(d => setModels(d ? d.models : []))
      .catch(() => setModels([]));
  }

  React.useEffect(() => { if (open) reload(); }, [open]);

  function formatSize(bytes) {
    if (!bytes) return "";
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
    return (bytes / 1e6).toFixed(0) + " MB";
  }

  async function doPull() {
    const name = pullName.trim();
    if (!name || pulling) return;
    setPulling(true);
    setPullLog("");
    try {
      const res = await fetch("/api/ollama/pull", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop();
        for (const line of lines) {
          const data = line.replace(/^data: /, "").trim();
          if (!data) continue;
          try {
            const j = JSON.parse(data);
            if (j.status === "done") { setPullLog("✓ " + L("Done", "Xong", "완료", "完成")); reload(); setPullName(""); }
            else if (j.error)        { setPullLog("✗ " + j.error); }
            else if (j.status)       { setPullLog(j.status + (j.completed && j.total ? ` ${Math.round(j.completed/j.total*100)}%` : "")); }
          } catch (_) {}
        }
      }
    } catch (e) { setPullLog("✗ " + e.message); }
    setPulling(false);
  }

  async function doDelete(name) {
    if (!confirm(L("Delete " + name + "?", "Xoá " + name + "?", name + " 삭제할까요?", "删除 " + name + "？"))) return;
    setDeleting(name);
    try {
      await fetch("/api/ollama/models", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      reload();
    } catch (_) {}
    setDeleting(null);
  }

  return (
    <div style={{ marginTop: 8, textAlign: "left" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        fontSize: 12, color: "var(--ink-3)", background: "transparent", border: "1px solid var(--border)",
        borderRadius: 8, padding: "4px 10px", cursor: "pointer",
      }}>
        {open ? "▾" : "▸"} {L("Ollama models", "Quản lý model Ollama", "Ollama 모델", "Ollama 模型")}
      </button>

      {open && (
        <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--ink) 4%, transparent)", border: "1px solid var(--border)", fontSize: 12 }}>
          {/* installed models list */}
          {models === null
            ? <div style={{ color: "var(--ink-3)" }}>{L("Loading…", "Đang tải…", "불러오는 중…", "加载中…")}</div>
            : models.length === 0
              ? <div style={{ color: "var(--ink-3)" }}>{L("No models installed yet.", "Chưa cài model nào.", "설치된 모델이 없습니다.", "尚未安装任何模型。")}</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  {models.map(m => (
                    <div key={m.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                      <div>
                        <span style={{ fontWeight: 500, color: "var(--ink-2)" }}>{m.name}</span>
                        {m.size && <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>{formatSize(m.size)}</span>}
                        {m.details && m.details.parameter_size && <span style={{ color: "var(--ink-3)", marginLeft: 6 }}>{m.details.parameter_size}</span>}
                      </div>
                      <button onClick={() => doDelete(m.name)} disabled={deleting === m.name} style={{
                        fontSize: 11, color: "var(--ink-3)", background: "transparent",
                        border: "none", cursor: "pointer", padding: "2px 4px",
                      }}>
                        {deleting === m.name ? "…" : "✕"}
                      </button>
                    </div>
                  ))}
                </div>
              )
          }

          {/* pull new model */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
            <input value={pullName} onChange={e => setPullName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doPull()}
              placeholder={L("e.g. qwen2.5-coder:7b", "vd. qwen2.5-coder:7b", "예: qwen2.5-coder:7b", "例：qwen2.5-coder:7b")}
              style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", outline: "none" }}
            />
            <button onClick={doPull} disabled={pulling || !pullName.trim()} style={{
              fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "none",
              background: "var(--primary)", color: "#fff", cursor: pulling ? "default" : "pointer", opacity: pulling ? 0.6 : 1,
            }}>
              {pulling ? L("Pulling…", "Đang tải…", "다운로드 중…", "拉取中…") : L("Pull", "Tải", "다운로드", "拉取")}
            </button>
          </div>
          {pullLog && <div style={{ marginTop: 5, fontSize: 11.5, color: pullLog.startsWith("✓") ? "#16a34a" : pullLog.startsWith("✗") ? "#dc2626" : "var(--ink-3)", fontFamily: "monospace" }}>{pullLog}</div>}
        </div>
      )}
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
  const [open, setOpen] = React.useState(() => localStorage.getItem("yana.dev.expand-thinking") === "true");
  return (
    <div style={{ marginBottom: 6 }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: "none", border: "1px solid var(--border)", borderRadius: 99,
        padding: "3px 10px", fontSize: 11.5, color: "var(--ink-3)", cursor: "pointer",
        fontFamily: "inherit",
      }}>
        <span style={{ fontSize: 13 }}>🧠</span>
        {open ? L("Hide reasoning", "Ẩn suy nghĩ", "추론 숨기기", "隐藏推理过程") : L("Show reasoning", "Xem suy nghĩ", "추론 보기", "显示推理过程")}
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
    <button onClick={doCopy} className="copy-btn" title={L("Copy", "Sao chép", "복사", "复制")} style={{
      width: 24, height: 24, borderRadius: 6,
      border: "1px solid var(--border)", background: "rgba(var(--surface-rgb,255,255,255),.7)",
      cursor: "pointer", fontSize: 11, display: "grid", placeItems: "center",
      color: copied ? "var(--primary)" : "var(--ink-3)", flexShrink: 0,
    }}>
      {copied ? "✓" : "⧉"}
    </button>
  );
}

// Read-aloud button — POSTs to the local VieNeu-TTS sidecar via /api/tts and
// plays the returned WAV. States: idle (🔊) / loading (spinner) / playing
// (⏹, click to stop) / error (⚠, reverts to idle after a beat). The sidecar
// is an opt-in local process (tools/yana-web/tts-sidecar/), so "not running"
// is an expected, common state, not a bug — the error tooltip says so.
function SpeakBtn({ text }) {
  const [state, setState] = React.useState("idle"); // idle | loading | playing | error
  const audioRef = React.useRef(null);

  React.useEffect(() => () => { audioRef.current?.pause(); }, []);

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    setState("idle");
  }

  async function speak() {
    if (state === "playing") { stop(); return; }
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "TTS failed"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); setState("idle"); };
      audio.onerror = () => { URL.revokeObjectURL(url); setState("error"); setTimeout(() => setState("idle"), 2200); };
      await audio.play();
      setState("playing");
    } catch (_) {
      setState("error");
      setTimeout(() => setState("idle"), 2200);
    }
  }

  const glyph = state === "loading" ? "…" : state === "playing" ? "⏹" : state === "error" ? "⚠" : "🔊";
  const title = state === "error"
    ? L("TTS sidecar not running", "Sidecar TTS chưa chạy", "TTS 사이드카 미실행", "TTS 边车未运行")
    : L("Read aloud", "Đọc", "읽어주기", "朗读");

  return (
    <button onClick={speak} className="copy-btn" title={title} disabled={state === "loading"} style={{
      width: 24, height: 24, borderRadius: 6,
      border: "1px solid var(--border)", background: "rgba(var(--surface-rgb,255,255,255),.7)",
      cursor: state === "loading" ? "wait" : "pointer", fontSize: 11, display: "grid", placeItems: "center",
      color: state === "playing" ? "var(--primary)" : state === "error" ? "#d14343" : "var(--ink-3)",
      flexShrink: 0, opacity: state === "loading" ? .6 : 1,
    }}>
      {glyph}
    </button>
  );
}

function Message({ msg, isLastYana, onRegenerate }) {
  const devMode = localStorage.getItem("yana.dev.mode") === "true";
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
              <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }}>{L("HTML generated", "Đã tạo HTML", "HTML 생성됨", "已生成 HTML")}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{L("Preview visible on the right →", "Xem preview bên phải →", "오른쪽에서 미리보기 →", "预览显示在右侧 →")}</div>
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
              ? <span style={{ color: "var(--ink-3)", fontStyle: "italic" }}>{L("Reasoning…", "Đang suy nghĩ…", "추론 중…", "推理中…")}</span>
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
          {displayText && <SpeakBtn text={displayText} />}
          {isLastYana && onRegenerate && (
            <button onClick={onRegenerate} className="copy-btn" title={L("Regenerate", "Thử lại", "다시 생성", "重新生成")} style={{
              height: 24, padding: "0 8px", borderRadius: 6,
              border: "1px solid var(--border)", background: "rgba(var(--surface-rgb,255,255,255),.7)",
              cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4,
              color: "var(--ink-3)", flexShrink: 0,
            }}>↺ {L("Retry", "Thử lại", "재시도", "重试")}</button>
          )}
        </div>
        {/* dev stats bar — visible only in Developer Mode */}
        {devMode && msg.route?._streamDone && (() => {
          const { secs, chars } = msg.route._streamDone;
          return (
            <div style={{
              display: "flex", alignItems: "center", gap: 7, marginTop: 4,
              fontSize: 10.5, color: "var(--ink-3)", fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
            }}>
              <span title={L("Response time", "Thời gian phản hồi", "응답 시간", "响应时间")}>⏱ {secs.toFixed(1)}s</span>
              <span style={{ opacity: .4 }}>·</span>
              <span title={L("Estimated tokens (1 tok ≈ 4 chars)", "Ước lượng token (1 tok ≈ 4 ký tự)", "예상 토큰 수 (1 tok ≈ 4자)", "预估 token 数（1 tok ≈ 4 字符）")}>~{Math.round(chars / 4)} tok</span>
              <span style={{ opacity: .4 }}>·</span>
              <span title={L("Characters per second", "Ký tự/giây", "초당 문자 수", "每秒字符数")}>{Math.round(chars / Math.max(secs, 0.1))} ch/s</span>
              {msg.route.agent && (
                <>
                  <span style={{ opacity: .4 }}>·</span>
                  <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg.route.agent}</span>
                </>
              )}
            </div>
          );
        })()}
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

  // display/flex-direction/gap/overflow live in themes.css's .yana-chat-aside
  // rule, not inline — an inline style here would beat the ≤860px media
  // query's `display: none`, since inline styles always win over external
  // stylesheet rules regardless of specificity (this was the actual bug:
  // the panel stayed visible and overlapped the chat at narrow widths).
  return (
    <aside className="yana-chat-aside">
      <Card title={L("Routing", "Định tuyến", "라우팅", "路由")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {[
            [L("Provider", "Nhà cung cấp", "프로바이더", "提供商"), primary ? primary.name : L("None — add a key", "Chưa có key", "없음 — 키 추가", "无 — 请添加密钥")],
            [L("Model", "Mô hình", "모델", "模型"), primary ? (loadModelChoices()[primary.id] || CHAT_MODELS[primary.id] || "—") : "—"],
            [L("Fallback", "Dự phòng", "폴백", "回退"), fallback ? fallback.name : "—"],
            [L("Connected", "Đã kết nối", "연결됨", "已连接"), keyed.length + " / " + D.providers.length],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
              <span style={{ color: "var(--ink-3)", flex: "none" }}>{k}</span>
              <span style={{ fontWeight: 500, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title={L("Context in use", "Ngữ cảnh đang dùng", "사용 중인 컨텍스트", "正在使用的上下文")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {facts && facts.length
            ? facts.map((m, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45, display: "flex", gap: 7 }}>
                  <span style={{ color: "var(--pink)", flex: "none", marginTop: 1 }}>{Icons.memory(13)}</span>
                  {m.text}
                </div>
              ))
            : <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("No memories yet.", "Chưa có ký ức nào.", "아직 메모리가 없습니다.", "暂无记忆。")}</span>}
        </div>
      </Card>
      <Card title={L("Safety", "An toàn", "안전", "安全")}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="dot on"></span>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{L("Sentinel reviewing all actions", "Sentinel đang giám sát mọi hành động", "Sentinel이 모든 작업을 검토 중", "Sentinel 正在审查所有操作")}</span>
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
        <button style={tabStyle(tab === "preview")} onClick={() => setTab("preview")}>{L("Preview", "Xem trước", "미리보기", "预览")}</button>
        <button style={tabStyle(tab === "code")} onClick={() => setTab("code")}>{L("Code", "Code", "코드", "代码")}</button>
        <button style={btnStyle} onClick={copyHtml}>{copied ? L("Copied!", "Đã chép!", "복사됨!", "已复制！") : L("Copy", "Chép", "복사", "复制")}</button>
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

// Find the first provider that has a stored API key in the encrypted vault.
// "auto" is a virtual selection — returns a placeholder; sendText() overrides it.
function getProviderConfig(preferred) {
  const order = ["claude", "openai", "gemini", "groq", "deepseek", "openrouter"];
  if (preferred === "auto") {
    // Real provider is resolved at send time by smartPickProvider()
    for (const id of order) {
      const key = YanaVault.getKey(id);
      if (key) return { provider: id, apiKey: key };
    }
    return { provider: "claude", apiKey: "" };
  }
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

const CHAT_STORE    = "yana.chat";
const CONV_LIST_KEY = "yana.convlist";
const ONBOARDED_KEY = "yana.onboarded";

function loadConvList() {
  try { return JSON.parse(localStorage.getItem(CONV_LIST_KEY)) || []; }
  catch (_) { return []; }
}

function convFromMsgs(msgs) {
  const firstUser = msgs.find(m => m.role === "user");
  const title = firstUser
    ? firstUser.text.slice(0, 60).replace(/\n/g, " ")
    : L("Chat", "Trò chuyện", "채팅", "聊天");
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    title,
    ts: Date.now(),
    msgs: msgs.filter(m => !m.confidential).slice(-40).map(m => ({
      _id: m._id || m.id, role: m.role, text: m.text, ts: m.ts,
    })),
  };
}

/* ── Conversation history sidebar ────────────────────────────────────── */
function ConvSidebar({ list, onLoad, onDelete, onClose }) {
  return (
    <div className="glass" style={{
      width: 220, flex: "none", borderRadius: "var(--r-lg)", padding: 10,
      display: "flex", flexDirection: "column", gap: 2,
      overflowY: "auto", minHeight: 0,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: "var(--ink-3)",
        letterSpacing: ".07em", textTransform: "uppercase",
        padding: "4px 7px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        {L("History", "Lịch sử", "기록", "历史记录")}
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 17, lineHeight: 1, padding: "0 3px" }}>×</button>
      </div>
      {list.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", padding: "20px 8px", lineHeight: 1.6 }}>
          {L("Past conversations appear here after you start a new chat.", "Các cuộc trò chuyện cũ xuất hiện ở đây sau khi bạn tạo chat mới.", "새 채팅을 시작하면 지난 대화가 여기에 표시됩니다.", "开始新对话后，历史对话会显示在这里。")}
        </div>
      )}
      {list.map(conv => (
        <div key={conv.id} style={{ position: "relative", borderRadius: 9 }}>
          <button onClick={() => onLoad(conv)} style={{
            width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer",
            padding: "8px 30px 8px 9px", borderRadius: 9, color: "var(--ink)", fontFamily: "inherit",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--primary-soft)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
          >
            <div style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.35 }}>
              {conv.title}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>
              {new Date(conv.ts).toLocaleDateString()} · {conv.msgs.length} {L("msgs", "tin", "개 메시지", "条消息")}
            </div>
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
            title={L("Delete", "Xóa", "삭제", "删除")}
            style={{
              position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)",
              fontSize: 14, padding: "3px 5px", lineHeight: 1, borderRadius: 5,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,.1)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-3)"; e.currentTarget.style.background = "none"; }}
          >×</button>
        </div>
      ))}
    </div>
  );
}

/* ── First-run onboarding overlay ────────────────────────────────────── */
function OnboardingOverlay({ onDone }) {
  const [step, setStep] = React.useState(0);
  const back = (
    <button onClick={() => setStep(0)} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "transparent", color: "var(--ink-3)", fontSize: 14, cursor: "pointer" }}>←</button>
  );
  const doneBtn = (label) => (
    <button onClick={onDone} style={{ flex: 1, padding: "10px 16px", borderRadius: 12, border: "none", background: "var(--primary)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
      {label}
    </button>
  );
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => { if (e.target === e.currentTarget) onDone(); }}>
      <div className="glass-strong" style={{ borderRadius: 20, padding: "28px 28px 24px", maxWidth: 420, width: "90vw", display: "flex", flexDirection: "column", gap: 18 }}>
        {step === 0 && <>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <YanaMark size={38} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.025em" }}>{L("Welcome to Yana AI", "Chào mừng đến Yana AI", "Yana AI에 오신 것을 환영합니다", "欢迎使用 Yana AI")}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>{L("Smart chat · Local & Cloud AI", "Chat thông minh · AI Local & Cloud", "스마트 채팅 · 로컬 & 클라우드 AI", "智能聊天 · 本地与云端 AI")}</div>
            </div>
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.65 }}>
            {L("To start chatting, connect a provider. Takes about 30 seconds.", "Để bắt đầu chat, kết nối một nhà cung cấp. Chỉ mất khoảng 30 giây.", "채팅을 시작하려면 프로바이더를 연결하세요. 약 30초 소요됩니다.", "开始聊天前，请先连接一个提供商，大约需要 30 秒。")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <button onClick={() => setStep(1)} style={{ padding: "12px 16px", borderRadius: 12, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13.5, fontWeight: 500, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>🖥 {L("Local AI — free & private (Ollama)", "Local AI — miễn phí & riêng tư (Ollama)", "로컬 AI — 무료 & 프라이빗 (Ollama)", "本地 AI — 免费且私密（Ollama）")}</span>
              <span style={{ opacity: .7 }}>→</span>
            </button>
            <button onClick={() => setStep(2)} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13.5, fontWeight: 500, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>☁ {L("Cloud provider — API key required", "Cloud provider — cần API key", "클라우드 프로바이더 — API 키 필요", "云端提供商 — 需要 API 密钥")}</span>
              <span style={{ opacity: .4 }}>→</span>
            </button>
          </div>
          <button onClick={onDone} style={{ fontSize: 12, color: "var(--ink-3)", background: "none", border: "none", cursor: "pointer", alignSelf: "flex-end" }}>
            {L("Skip for now", "Bỏ qua", "나중에 하기", "暂时跳过")}
          </button>
        </>}
        {step === 1 && <>
          <div style={{ fontSize: 18, fontWeight: 700 }}>🖥 {L("Run AI locally — Ollama", "Chạy AI local — Ollama", "로컬에서 AI 실행 — Ollama", "本地运行 AI — Ollama")}</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.65 }}>
            {L("No API key needed. Model runs entirely on your machine — data never leaves.", "Không cần API key. Model chạy hoàn toàn trên máy của bạn — dữ liệu không rời đi.", "API 키가 필요 없습니다. 모델이 이 기기에서만 실행되어 데이터가 외부로 나가지 않습니다.", "无需 API 密钥。模型完全在本机运行 — 数据永不外传。")}
          </div>
          {[
            { n: "1", cmd: "ollama pull qwen2.5-coder:7b", note: L("download a model (~4 GB)", "tải model (~4 GB)", "모델 다운로드 (~4 GB)", "下载模型（约 4 GB）") },
            { n: "2", cmd: "ollama serve",                  note: L("start the local server", "khởi động server local", "로컬 서버 시작", "启动本地服务器") },
          ].map(({ n, cmd, note }) => (
            <div key={n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 10, fontWeight: 700, background: "var(--primary)", color: "#fff", borderRadius: 99, width: 18, height: 18, display: "grid", placeItems: "center", flex: "none", marginTop: 3 }}>{n}</span>
              <div>
                <code style={{ display: "block", padding: "4px 9px", borderRadius: 7, background: "color-mix(in srgb, var(--ink) 8%, transparent)", fontSize: 11.5, fontFamily: "monospace", color: "var(--ink-2)" }}>{cmd}</code>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{note}</div>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>{doneBtn(L("Done — I'll start Ollama", "Xong — tôi sẽ khởi động Ollama", "완료 — Ollama를 실행하겠습니다", "完成 — 我会启动 Ollama"))}{back}</div>
        </>}
        {step === 2 && <>
          <div style={{ fontSize: 18, fontWeight: 700 }}>☁ {L("Cloud Providers", "Cloud Providers", "클라우드 프로바이더", "云端提供商")}</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.65 }}>
            {L("Add an API key in the Providers page. Groq has a generous free tier.", "Thêm API key ở trang Providers. Groq có free tier rộng rãi.", "Providers 페이지에서 API 키를 추가하세요. Groq는 넉넉한 무료 티어를 제공합니다.", "在提供商页面添加 API 密钥。Groq 提供慷慨的免费额度。")}
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {[["Groq", L("free tier", "miễn phí", "무료 티어", "免费额度")], ["Claude", "Anthropic"], ["OpenAI", "GPT-4o"], ["Gemini", "Google"]].map(([n, note]) => (
              <div key={n} className="chip neutral" style={{ fontSize: 12 }}>{n} <span style={{ opacity: .55 }}>· {note}</span></div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", background: "var(--primary-soft)", borderRadius: 9, padding: "9px 12px", lineHeight: 1.6 }}>
            💡 {L("Providers page → click the ✎ icon on any provider card to paste your key.", "Trang Providers → nhấn biểu tượng ✎ trên thẻ nhà cung cấp để dán key.", "Providers 페이지 → 프로바이더 카드의 ✎ 아이콘을 눌러 키를 붙여넣으세요.", "提供商页面 → 点击提供商卡片上的 ✎ 图标粘贴密钥。")}
          </div>
          <div style={{ display: "flex", gap: 8 }}>{doneBtn(L("Got it — go to Providers", "Hiểu rồi — vào Providers", "알겠습니다 — Providers로 이동", "明白了 — 前往提供商"))}{back}</div>
        </>}
      </div>
    </div>
  );
}

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
  const [msgSearch, setMsgSearch]   = React.useState(null); // null=closed, ""=open
  const [convList, setConvList]     = React.useState(loadConvList);
  const [sidebarOpen, setSidebarOpen] = React.useState(() => localStorage.getItem("yana.sidebar") === "1");
  const [showOnboarding, setShowOnboarding] = React.useState(() => {
    if (localStorage.getItem(ONBOARDED_KEY)) return false;
    return !D.providers.some(p => !KEYLESS_PROVIDERS.has(p.id) && p.id !== "auto" && YanaVault.hasKey(p.id));
  });
  const [streaming, setStreaming] = React.useState(false);
  const [atBottom, setAtBottom]   = React.useState(true);
  const [localStatus, setLocalStatus] = React.useState(null); // null=unknown, {}=probed
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
  // Prefer the live-fetched first model over the static default when no
  // explicit user pick exists yet — the static CHAT_MODELS default (e.g.
  // "llama3.2" for Ollama) may not actually be installed, which caused a
  // 404 even though the dropdown showed the real installed models.
  const activeModel = modelSel[activeProvider] || (liveModels[activeProvider] && liveModels[activeProvider][0]) || CHAT_MODELS[activeProvider] || (modelOptions[0] || "");

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

  // Probe local providers on mount — auto-select Ollama if running and no provider chosen
  React.useEffect(() => {
    fetch("/api/local-status")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setLocalStatus(data);
        // If user hasn't picked a provider yet, auto-select the first running local one
        if (!localStorage.getItem("yana.chat.provider")) {
          const first = ["ollama", "9router", "lmstudio"].find(id => data[id]?.running);
          if (first) setProviderSel(first);
        }
      })
      .catch(() => {});
  }, []);

  // Cancel any in-flight stream on unmount
  React.useEffect(() => {
    return () => { if (readerRef.current) readerRef.current.cancel(); };
  }, []);

  function toggleSidebar() {
    setSidebarOpen(v => {
      const next = !v;
      localStorage.setItem("yana.sidebar", next ? "1" : "0");
      return next;
    });
  }

  function newConversation() {
    if (msgs.length > 0) {
      const entry = convFromMsgs(msgs);
      const updated = [entry, ...convList].slice(0, 30);
      setConvList(updated);
      try { localStorage.setItem(CONV_LIST_KEY, JSON.stringify(updated)); } catch (_) {}
    }
    setMsgs([]);
    D.chat = [];
    try { localStorage.removeItem(CHAT_STORE); } catch (_) {}
  }

  function loadConversation(conv) {
    if (msgs.length > 0) {
      const entry = convFromMsgs(msgs);
      const updated = [entry, ...convList.filter(c => c.id !== conv.id)].slice(0, 30);
      setConvList(updated);
      try { localStorage.setItem(CONV_LIST_KEY, JSON.stringify(updated)); } catch (_) {}
    } else {
      const updated = convList.filter(c => c.id !== conv.id);
      setConvList(updated);
      try { localStorage.setItem(CONV_LIST_KEY, JSON.stringify(updated)); } catch (_) {}
    }
    setMsgs(conv.msgs || []);
    D.chat = conv.msgs || [];
  }

  function deleteConversation(id) {
    const updated = convList.filter(c => c.id !== id);
    setConvList(updated);
    try { localStorage.setItem(CONV_LIST_KEY, JSON.stringify(updated)); } catch (_) {}
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

    // Real routing: classify the task so complex requests pick up a skill.
    // Skipped for confidential turns — need-to-know, no extra processing.
    let skill = null;
    let routeDecision = null;
    let autoReason = null;
    if (!tier) {
      try {
        const rr = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: text }),
        });
        if (rr.ok) {
          routeDecision = await rr.json();
          skill = routeDecision.suggested_skill || null;
        }
      } catch (_) {}
    }

    // Smart auto-routing: when user picks "Auto", resolve to the best provider
    if (providerSel === "auto" && !tier) {
      const picked = smartPickProvider(text, routeDecision && routeDecision.route, localStatus);
      provider = picked.provider;
      autoReason = picked.reason;
      apiKey = KEYLESS_PROVIDERS.has(provider) ? "" : (YanaVault.getKey(provider) || "");
    }

    // Same fallback fix as activeModel above: prefer the live-fetched model
    // list over the static default, which may not actually be installed.
    const model = modelSel[provider] || (liveModels[provider] && liveModels[provider][0]) || CHAT_MODELS[provider] || "";

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
      const streamStart = Date.now();

      // Insert placeholder Yana message — route shows the real provider/model/skill
      setMsgs((m) => [...m, {
        who: "yana",
        route: {
          agent: autoReason ? `Auto → ${provider}` : provider,
          model: (model || provider)
            + (skill ? " · " + skill : "")
            + (autoReason ? ` · ${autoReason}` : "")
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

      // Attach timing + cost metadata so RouteChip can display speed/cost badge
      const streamDone = { secs: (Date.now() - streamStart) / 1000, chars: accumulated.length };
      setMsgs((m) => m.map((msg) =>
        msg._id === msgId ? { ...msg, route: { ...msg.route, _streamDone: streamDone } } : msg
      ));

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
              ? { ...msg, text: shown || msg.text, refs: [...(msg.refs || []), L("🌱 Remembered: ", "🌱 Đã nhớ: ", "🌱 기억함: ", "🌱 已记住：") + fact] }
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
              "Không kết nối được model local. Nội dung SOVEREIGN chỉ đi đến Ollama (127.0.0.1:11434) — chạy `ollama serve` trước.",
              "로컬 모델에 연결할 수 없습니다. SOVEREIGN 콘텐츠는 Ollama (127.0.0.1:11434)로만 전송됩니다 — `ollama serve`로 먼저 실행하세요.",
              "无法连接本地模型。SOVEREIGN 内容仅发送至 Ollama（127.0.0.1:11434）— 请先运行 `ollama serve`。")
          : L("Could not reach the server (" + err.message + "). Check that Yana is running and a provider key is set.",
              "Không kết nối được máy chủ (" + err.message + "). Kiểm tra Yana đang chạy và đã đặt API key.",
              "서버에 연결할 수 없습니다 (" + err.message + "). Yana가 실행 중인지, 프로바이더 키가 설정되었는지 확인하세요.",
              "无法连接服务器（" + err.message + "）。请检查 Yana 是否正在运行，以及是否已设置提供商密钥。"),
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
      {sidebarOpen && (
        <ConvSidebar
          list={convList}
          onLoad={loadConversation}
          onDelete={deleteConversation}
          onClose={toggleSidebar}
        />
      )}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
        <PageHeader title={L("Conversation", "Trò chuyện", "대화", "对话")} sub={L("One conversation, many hands — Yana routes each request to the right agent.", "Một cuộc trò chuyện, nhiều bàn tay — Yana chuyển mỗi yêu cầu đến đúng tác nhân.", "하나의 대화, 여러 손 — Yana가 각 요청을 알맞은 에이전트로 전달합니다.", "一场对话，多方协作 — Yana 将每个请求路由给合适的智能体。")}>
          <button
            onClick={toggleSidebar}
            title={L("Conversation history", "Lịch sử trò chuyện", "대화 기록", "对话历史")}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 10, border: "1px solid var(--border)", background: sidebarOpen ? "var(--primary-soft)" : "transparent", color: sidebarOpen ? "var(--primary)" : "var(--ink-3)", cursor: "pointer", fontSize: 14, fontFamily: "inherit", flex: "none" }}>
            ☰
          </button>
          <button
            onClick={() => setMsgSearch(s => s === null ? "" : null)}
            title={L("Search conversation", "Tìm trong cuộc trò chuyện", "대화 검색", "搜索对话")}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 10, border: "1px solid var(--border)", background: msgSearch !== null ? "var(--primary-soft)" : "transparent", color: msgSearch !== null ? "var(--primary)" : "var(--ink-3)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", flex: "none" }}>
            🔍
          </button>
          <button
            onClick={newConversation}
            title={L("New conversation", "Cuộc trò chuyện mới", "새 대화", "新建对话")}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", flex: "none" }}>
            {Icons.pencil(14)} {L("New", "Mới", "새로 만들기", "新建")}
          </button>
        </PageHeader>
        {msgSearch !== null && (
          <div style={{ padding: "0 0 8px 0", flex: "none" }}>
            <input autoFocus value={msgSearch} onChange={e => setMsgSearch(e.target.value)}
              onKeyDown={e => e.key === "Escape" && setMsgSearch(null)}
              placeholder={L("Search messages…", "Tìm tin nhắn…", "메시지 검색…", "搜索消息…")}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 9, padding: "7px 12px", fontSize: 13, fontFamily: "inherit", background: "var(--surface)", color: "var(--ink)", outline: "none" }}
            />
          </div>
        )}
        {htmlPicker && (
          <div className="glass-strong" style={{ borderRadius: "var(--r-lg)", padding: 10, display: "flex", flexDirection: "column", gap: 8, flex: "none", maxHeight: 260 }}>
            <input
              autoFocus
              value={htmlSearch}
              onChange={(e) => setHtmlSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setHtmlPicker(false); setHtmlSearch(""); } }}
              placeholder={L("Search templates…", "Tìm template…", "템플릿 검색…", "搜索模板…")}
              style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontFamily: "inherit", background: "transparent", color: "var(--ink)", outline: "none", flex: "none" }}
            />
            <div style={{ overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 5 }}>
              {htmlSkills.length === 0
                ? <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Loading…", "Đang tải…", "불러오는 중…", "加载中…")}</span>
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
            <div style={{ margin: "auto", textAlign: "center", color: "var(--ink-3)", maxWidth: 400 }}>
              <YanaMark size={34} />
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-2)", marginTop: 12 }}>
                {L("Start a conversation", "Bắt đầu trò chuyện", "대화 시작하기", "开始对话")}
              </div>

              {/* Local AI status banner */}
              {localStatus && (() => {
                const running = ["ollama", "9router", "lmstudio"].filter(id => localStatus[id]?.running);
                const allOffline = running.length === 0;
                const hasCloud = getProviderConfig().apiKey;
                if (allOffline && !hasCloud) {
                  return (
                    <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)", fontSize: 12.5, lineHeight: 1.6, textAlign: "left" }}>
                      <div style={{ fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>
                        🖥 {L("Run AI locally for free", "Chạy AI miễn phí trên máy", "무료로 로컬에서 AI 실행", "免费在本地运行 AI")}
                      </div>
                      <div style={{ color: "var(--ink-2)" }}>
                        {L("No API key needed. Install Ollama then:", "Không cần API key. Cài Ollama rồi:", "API 키가 필요 없습니다. Ollama 설치 후:", "无需 API 密钥。安装 Ollama 后：")}
                      </div>
                      <code style={{ display: "block", marginTop: 6, padding: "4px 8px", borderRadius: 6, background: "color-mix(in srgb, var(--ink) 8%, transparent)", fontSize: 12, color: "var(--ink-2)", fontFamily: "monospace" }}>
                        ollama pull qwen2.5-coder:7b
                      </code>
                      <code style={{ display: "block", marginTop: 4, padding: "4px 8px", borderRadius: 6, background: "color-mix(in srgb, var(--ink) 8%, transparent)", fontSize: 12, color: "var(--ink-2)", fontFamily: "monospace" }}>
                        ollama serve
                      </code>
                    </div>
                  );
                }
                if (running.length > 0) {
                  const names = { ollama: "Ollama", "9router": "9router", lmstudio: "LM Studio" };
                  const modelList = running.flatMap(id => localStatus[id].models.slice(0, 2));
                  return (
                    <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 99, background: "color-mix(in srgb, #22c55e 10%, transparent)", border: "1px solid color-mix(in srgb, #22c55e 25%, transparent)", fontSize: 12 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flex: "none" }} />
                      <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>
                        {running.map(id => names[id]).join(" · ")} {L("ready", "sẵn sàng", "준비됨", "已就绪")}
                        {modelList.length > 0 && <span style={{ color: "var(--ink-3)", fontWeight: 400 }}> · {modelList[0]}</span>}
                      </span>
                      <span style={{ color: "var(--ink-3)" }}>{L("· free · private", "· miễn phí · riêng tư", "· 무료 · 프라이빗", "· 免费 · 私密")}</span>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Ollama model manager — only shown when Ollama is running */}
              {localStatus && localStatus.ollama && localStatus.ollama.running && (
                <OllamaManager />
              )}

              <div style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 10 }}>
                {getProviderConfig().apiKey
                  ? L("Yana routes your request to the connected provider and streams the answer here.",
                      "Yana chuyển yêu cầu của bạn đến nhà cung cấp đã kết nối và trả lời tại đây.",
                      "Yana가 요청을 연결된 프로바이더로 전달하고 여기에 답변을 스트리밍합니다.",
                      "Yana 会将你的请求路由到已连接的提供商，并在此处流式显示回答。")
                  : localStatus && ["ollama","9router","lmstudio"].some(id => localStatus[id]?.running)
                    ? L("Local AI detected — select it in the provider bar below to start chatting for free.",
                        "Đã phát hiện Local AI — chọn nó ở thanh bên dưới để chat miễn phí.",
                        "로컬 AI가 감지되었습니다 — 아래 프로바이더 바에서 선택하면 무료로 채팅을 시작할 수 있습니다.",
                        "检测到本地 AI — 在下方提供商栏选择即可免费开始聊天。")
                    : L("No provider key set — add one in Providers, or run Ollama locally for free.",
                        "Chưa có API key — thêm key ở mục Nhà cung cấp, hoặc chạy Ollama miễn phí.",
                        "설정된 프로바이더 키가 없습니다 — Providers에서 추가하거나 Ollama를 무료로 로컬 실행하세요.",
                        "尚未设置提供商密钥 — 请在提供商中添加，或免费在本地运行 Ollama。")}
              </div>
            </div>
          )}
          {(msgSearch
              ? msgs.filter(m => m.text && m.text.toLowerCase().includes(msgSearch.toLowerCase()))
              : msgs
            ).map((m, i, arr) => (
            <Message key={m._id || i} msg={m}
              isLastYana={!streaming && i === arr.length - 1 && m.who === "yana"}
              onRegenerate={regenerate}
            />
          ))}
          {msgSearch !== null && msgSearch && msgs.filter(m => m.text && m.text.toLowerCase().includes(msgSearch.toLowerCase())).length === 0 && (
            <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 12.5, marginTop: 20 }}>
              {L("No messages match your search.", "Không tìm thấy tin nhắn.", "검색과 일치하는 메시지가 없습니다.", "没有匹配的消息。")}
            </div>
          )}
          {thinking && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--ink-3)", fontSize: 12.5 }}>
              <YanaMark size={20} /> {L("Navigator is thinking…", "Navigator đang suy nghĩ…", "Navigator가 생각 중…", "Navigator 正在思考…")}
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
            title={L("HTML templates", "Template HTML", "HTML 템플릿", "HTML 模板")}
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
            placeholder={L("Ask Yana… (Shift+Enter for new line)", "Hỏi Yana… (Shift+Enter xuống dòng)", "Yana에게 물어보기… (Shift+Enter로 줄바꿈)", "问 Yana…（Shift+Enter 换行）")}
            className="chat-input"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", color: "var(--ink)", lineHeight: 1.5, maxHeight: 180, overflowY: "auto" }}
          />
          <button
            onClick={() => fileRef.current && fileRef.current.click()}
            aria-label={L("Attach file for OCR", "Đính kèm file để nhận dạng văn bản", "OCR용 파일 첨부", "附加文件以进行 OCR 识别")}
            title={L("Attach image or PDF — extract text with Surya OCR", "Đính kèm ảnh hoặc PDF — trích xuất văn bản bằng Surya OCR", "이미지 또는 PDF 첨부 — Surya OCR로 텍스트 추출", "附加图片或 PDF — 使用 Surya OCR 提取文字")}
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
              aria-label={L("Attach image for vision", "Đính kèm ảnh để nhận dạng", "비전용 이미지 첨부", "附加图片以进行视觉识别")}
              title={L("Send image to Llama Vision", "Gửi ảnh tới Llama Vision", "Llama Vision으로 이미지 전송", "将图片发送给 Llama Vision")}
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
              title={L("Remove image", "Xóa ảnh", "이미지 제거", "移除图片")}>
              {visionImage.name} ✕
            </span>
          )}
          <button
            onClick={() => setConfMode((v) => !v)}
            aria-pressed={confMode}
            title={confMode
              ? L("Confidential Mode ON — messages are not saved and carry no personal context (rule 68). Click to turn off.",
                  "Chế độ Mật BẬT — tin nhắn không được lưu, không kèm ngữ cảnh cá nhân (rule 68). Bấm để tắt.",
                  "기밀 모드 켜짐 — 메시지가 저장되지 않고 개인 컨텍스트도 포함되지 않습니다 (rule 68). 클릭하여 끄기.",
                  "机密模式已开启 — 消息不会被保存，也不携带个人上下文（规则 68）。点击关闭。")
              : L("Turn on Confidential Mode — nothing you send is saved to history, memory, or missions.",
                  "Bật chế độ Mật — mọi thứ anh gửi sẽ không được lưu vào lịch sử, ký ức hay mission.",
                  "기밀 모드 켜기 — 보내는 내용이 기록, 메모리, 미션에 저장되지 않습니다.",
                  "开启机密模式 — 你发送的内容不会被保存到历史记录、记忆或任务中。")}
            style={{
              border: "1px solid " + (confMode ? "var(--primary)" : "var(--border)"),
              borderRadius: 99, padding: "5px 10px", cursor: "pointer", fontSize: 11.5,
              fontFamily: "inherit",
              background: confMode ? "var(--primary-soft)" : "transparent",
              color: confMode ? "var(--primary)" : "var(--ink-3)",
            }}>
            🔒{confMode ? " " + L("Confidential", "Mật", "기밀", "机密") : ""}
          </button>
          <div className="chat-bar-selects">
            <select value={providerSel || getProviderConfig().provider}
              onChange={(e) => setProviderSel(e.target.value)}
              title={L("Provider for this conversation", "Nhà cung cấp cho cuộc trò chuyện", "이 대화의 프로바이더", "此对话使用的提供商")}>
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
            {activeProvider !== "auto" && (
              <select value={activeModel} onChange={(e) => pickModel(e.target.value)}
                title={L("Model for this provider — choice is remembered", "Model cho nhà cung cấp này — lựa chọn được ghi nhớ", "이 프로바이더의 모델 — 선택이 기억됩니다", "此提供商使用的模型 — 会记住你的选择")}>
                {(modelOptions.includes(activeModel) ? modelOptions : [activeModel, ...modelOptions]).map((m) => (
                  <option key={m} value={m}>{m}{capsLabel(m)}</option>
                ))}
              </select>
            )}
            {localStatus && activeProvider === "auto" && ["ollama", "lmstudio", "9router"].some(id => localStatus[id]?.running) && (
              <span style={{ fontSize: 11, color: "#7c3aed", background: "color-mix(in srgb,#7c3aed 12%,transparent)", border: "1px solid color-mix(in srgb,#7c3aed 22%,transparent)", borderRadius: 99, padding: "3px 8px", flexShrink: 0, fontWeight: 500 }}>
                🤖 {L("Smart route", "Định tuyến thông minh", "스마트 라우팅", "智能路由")}
              </span>
            )}
            {localStatus && KEYLESS_PROVIDERS.has(activeProvider) && localStatus[activeProvider]?.running && (
              <span style={{ fontSize: 11, color: "#16a34a", background: "color-mix(in srgb,#22c55e 12%,transparent)", border: "1px solid color-mix(in srgb,#22c55e 22%,transparent)", borderRadius: 99, padding: "3px 8px", flexShrink: 0, fontWeight: 500 }}>
                ● {L("Local · free", "Local · miễn phí", "로컬 · 무료", "本地 · 免费")}
              </span>
            )}
            <span className="chip neutral sentinel-chip" style={{ fontSize: 11.5, flexShrink: 0 }}>{Icons.safety(12)} {L("Sentinel on", "Sentinel bật", "Sentinel 활성", "Sentinel 已启用")}</span>
          </div>
          {streaming || thinking
            ? <button onClick={stopStream} aria-label="Stop" title={L("Stop generation", "Dừng phản hồi", "생성 중지", "停止生成")} style={{
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
          if (caps.v) hints.push({ label: L("Vision ✓", "Nhận ảnh ✓", "비전 ✓", "视觉 ✓"), ok: true });
          else hints.push({ label: L("No vision", "Không nhận ảnh", "비전 미지원", "不支持视觉"), ok: false });
          if (caps.r) hints.push({ label: L("Reasoning", "Suy luận", "추론", "推理"), ok: true });
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
      {showOnboarding && (
        <OnboardingOverlay onDone={() => {
          localStorage.setItem(ONBOARDED_KEY, "1");
          setShowOnboarding(false);
        }} />
      )}
    </div>
  );
}

window.Chat = Chat;
