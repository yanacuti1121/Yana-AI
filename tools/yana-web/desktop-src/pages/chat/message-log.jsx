// Yana AI — Chat: the scrollable message log — empty-state banner (local AI
// status + Ollama manager), the message list itself, thinking indicator,
// and the scroll-to-bottom button.
import React from 'react';
import { L, YanaMark } from '../../components.jsx';
import { getProviderConfig } from '../../lib/provider-config.js';
import { OllamaManager } from './ollama-manager.jsx';
import { Message } from './message.jsx';

function LocalAiStatusBanner({ localStatus }) {
  const running = ["ollama", "9router", "lmstudio", "turbofieldfare"].filter(id => localStatus[id]?.running);
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
    const names = { ollama: "Ollama", "9router": "9router", lmstudio: "LM Studio", turbofieldfare: "TurboFieldfare" };
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
}

function EmptyState({ localStatus }) {
  return (
    <div style={{ margin: "auto", textAlign: "center", color: "var(--ink-3)", maxWidth: 400 }}>
      <YanaMark size={34} />
      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-2)", marginTop: 12 }}>
        {L("Start a conversation", "Bắt đầu trò chuyện", "대화 시작하기", "开始对话")}
      </div>

      {localStatus && <LocalAiStatusBanner localStatus={localStatus} />}

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
          : localStatus && ["ollama","9router","lmstudio","turbofieldfare"].some(id => localStatus[id]?.running)
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
  );
}

// `emptyState` is optional: a caller-supplied replacement for the default
// legacy EmptyState above (added for the new app shell's own empty-state
// design — pages/chat.jsx doesn't pass it, so its behavior is unchanged).
export function MessageLog({ logRef, msgs, thinking, streaming, localStatus, msgSearch, regenerate, onEdit, emptyState }) {
  const visible = msgSearch
    ? msgs.filter(m => m.text && m.text.toLowerCase().includes(msgSearch.toLowerCase()))
    : msgs;

  return (
    <div ref={logRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "calc(16px * var(--sp))", padding: "4px 4px 16px", minHeight: 0 }}>
      {msgs.length === 0 && !thinking && (emptyState ?? <EmptyState localStatus={localStatus} />)}

      {visible.map((m, i, arr) => (
        <Message key={m._id || i} msg={m}
          msgIndex={msgs.indexOf(m)}
          isLastYana={!streaming && i === arr.length - 1 && m.who === "yana"}
          onRegenerate={regenerate}
          onEdit={onEdit}
        />
      ))}

      {msgSearch !== null && msgSearch && visible.length === 0 && (
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
  );
}

export function ScrollToBottomButton({ show, onClick }) {
  if (!show) return null;
  return (
    <button onClick={onClick}
      style={{
        position: "absolute", bottom: 110, right: 24, width: 32, height: 32, borderRadius: 99,
        border: "1px solid var(--color-border)", background: "var(--color-bg)",
        cursor: "pointer", fontSize: 14, display: "grid", placeItems: "center",
        color: "var(--color-text-muted)", boxShadow: "0 2px 10px rgba(var(--shadow-rgb), .12)",
      }}>↓</button>
  );
}
