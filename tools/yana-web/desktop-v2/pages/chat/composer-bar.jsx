// Yana AI — Chat: the message composer bar (attach/OCR/vision/confidential
// toggle, provider+model selects, send/stop button) and the small model-
// capability hint row shown underneath it.
import React from 'react';
import { L, Icons } from '../../components.jsx';
import { KEYLESS_PROVIDERS, providerAvailable, getProviderConfig } from '../../lib/provider-config.js';
import { modelCaps, capsLabel } from './model-select.js';

export function ComposerBar({
  fileRef, visionRef, inputRef, handleOcr, handleVisionAttach, ocrBusy,
  htmlPicker, setHtmlPicker, htmlSkills, setHtmlSkills, setHtmlSearch,
  draft, setDraft, autoResize, send, stopStream, streaming, thinking,
  isVisionModel, activeModel, visionImage, setVisionImage,
  confMode, setConfMode,
  providers, providerSel, setProviderSel, activeProvider, pickModel, modelOptions,
  localStatus,
}) {
  return (
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
          {providers
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
  );
}

export function ModelCapabilityHint({ activeModel }) {
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
}
