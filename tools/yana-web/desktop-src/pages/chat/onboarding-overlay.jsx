// Yana AI — Chat: first-run onboarding overlay (connect a provider)
import React from 'react';
import { L, YanaMark } from '../../components.jsx';

export function OnboardingOverlay({ onDone }) {
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
