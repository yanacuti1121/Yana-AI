// Yana AI — Chat: send/stream/regenerate. The riskiest single extraction in
// the whole desktop-v2 migration (see .claude/plans/functional-shimmying-boole.md)
// — sendText's own body still runs long even after the two pure helpers
// below are factored out, because it is genuinely one workflow (classify →
// resolve provider → stream → post-process) rather than several unrelated
// ones. This is a documented COMPLEXITY-EXCEPTION per
// core/rules/agent-code-constraints.md rather than an artificial split that
// would only move lines around without reducing real complexity.
import React from 'react';
import { L } from '../../components.jsx';
import { KEYLESS_PROVIDERS, getProviderConfig } from '../../lib/provider-config.js';
import { detectSensitivity, smartPickProvider } from './routing.js';
import { CHAT_MODELS } from './model-select.js';

// "About you" from Settings — sent with every chat so Yana knows the user
function aboutContext() {
  const parts = [];
  for (const [id, label] of [["who", "Who"], ["strengths", "Strengths"], ["weaknesses", "Weak spots"], ["style", "Response style"]]) {
    const v = localStorage.getItem("yana.about." + id);
    if (v && v.trim()) parts.push(label + ": " + v.trim());
  }
  return parts.join("\n");
}

// Reads one SSE `data: ...` stream to completion, calling onChunk(parsed)
// for every JSON payload line. Pure aside from the reader itself — all
// accumulation/state lives in the caller's onChunk closure.
async function consumeChatStream(reader, onChunk) {
  const decoder = new TextDecoder();
  let buf = "";
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
      try { onChunk(JSON.parse(payload)); } catch (_) {}
    }
  }
}

// ChatGPT-style memory: the model nominates a durable fact with a trailing
// "MEMORY: …" line. Returns { shown, fact } if found, else null.
function extractMemoryMarker(accumulated) {
  const mm = accumulated.match(/(?:^|\n)\s*MEMORY:\s*(.+?)\s*$/);
  if (!mm || !mm[1]) return null;
  return { shown: accumulated.slice(0, mm.index).trimEnd(), fact: mm[1] };
}

export function useChatSend({
  msgs, setMsgs, draft, setDraft, providerSel, confMode, modelSel, liveModels,
  visionImage, setVisionImage, localStatus, inputRef, setAtBottom, setArtifact,
}) {
  const [thinking, setThinking] = React.useState(false);
  const [streaming, setStreaming] = React.useState(false);
  const readerRef = React.useRef(null);

  // Cancel any in-flight stream on unmount
  React.useEffect(() => {
    return () => { if (readerRef.current) readerRef.current.cancel(); };
  }, []);

  React.useEffect(() => { localStorage.setItem("yana.chat.provider", providerSel); }, [providerSel]);

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

    // Same fallback fix as activeModel in use-chat-models.js: prefer the
    // live-fetched model list over the static default, which may not
    // actually be installed.
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

      await consumeChatStream(reader, (obj) => {
        if (obj.error) accumulated += "\n[Error: " + obj.error + "]";
        else if (obj.text) accumulated += obj.text;
        const snap = accumulated;
        setMsgs((m) => m.map((msg) => msg._id === msgId ? { ...msg, text: snap } : msg));
        // Live artifact preview: stream HTML into the panel as it arrives
        if (/^\s*(?:<!DOCTYPE|<html)/i.test(accumulated)) setArtifact({ html: accumulated });
      });

      setStreaming(false);

      // Attach timing + cost metadata so RouteChip can display speed/cost badge
      const streamDone = { secs: (Date.now() - streamStart) / 1000, chars: accumulated.length };
      setMsgs((m) => m.map((msg) =>
        msg._id === msgId ? { ...msg, route: { ...msg.route, _streamDone: streamDone } } : msg
      ));

      // After stream: if response is HTML, mark message as artifact
      if (/^\s*(?:<!DOCTYPE|<html)/i.test(accumulated)) {
        setMsgs((m) => m.map((msg) => msg._id === msgId ? { ...msg, isHtml: true } : msg));
      }

      if (!tier) {
        const marker = extractMemoryMarker(accumulated);
        if (marker) {
          setMsgs((m) => m.map((msg) =>
            msg._id === msgId
              ? { ...msg, text: marker.shown || msg.text, refs: [...(msg.refs || []), L("🌱 Remembered: ", "🌱 Đã nhớ: ", "🌱 기억함: ", "🌱 已记住：") + marker.fact] }
              : msg
          ));
          fetch("/api/memory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: marker.fact }),
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

  return { thinking, streaming, sendText, send, stopStream, regenerate };
}
