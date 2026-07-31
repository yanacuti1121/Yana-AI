// Yana AI — Providers page
import React from 'react';
import { L, PageHeader, Icons } from '../../components.jsx';
import { KEYLESS_PROVIDERS, providerAvailable } from '../../lib/provider-config.js';

function fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

const LIVE_MODEL_PROVIDERS = new Set(["openrouter", "groq", "9router", "ollama", "lmstudio"]);

const PROVIDER_SETUP = {
  claude:     { url: "https://console.anthropic.com/settings/keys",   label: "Get key → console.anthropic.com" },
  openai:     { url: "https://platform.openai.com/api-keys",          label: "Get key → platform.openai.com" },
  gemini:     { url: "https://aistudio.google.com/app/apikey",        label: "Get key → aistudio.google.com" },
  groq:       { url: "https://console.groq.com/keys",                 label: "Get key → console.groq.com" },
  deepseek:   { url: "https://platform.deepseek.com/api_keys",        label: "Get key → platform.deepseek.com" },
  openrouter: { url: "https://openrouter.ai/settings/keys",           label: "Get key → openrouter.ai" },
  "9router":  { cmd: "npm install -g 9router",  cmd2: "9router",      label: "Local gateway — run on port 20128" },
  ollama:     { url: "https://ollama.com/download", cmd: "ollama serve", cmd2: "ollama pull llama3.2", label: "On-device — ollama.com/download" },
  lmstudio:   { url: "https://lmstudio.ai/download", cmd: "Open LM Studio → Developer tab", cmd2: "Start server (port 1234), load a model", label: "On-device — lmstudio.ai/download" },
};

function ProviderCard({ p, usage, onKeyChange, forceOpen }) {
  const keyless = KEYLESS_PROVIDERS.has(p.id);
  const [hasKey, setHasKey] = React.useState(() => YanaVault.hasKey(p.id));
  const connected = hasKey || keyless;
  const [liveModels, setLiveModels] = React.useState(null);
  const [checking, setChecking] = React.useState(false);
  const [editing, setEditing]   = React.useState(false);
  const [draft, setDraft]       = React.useState("");
  const [saved, setSaved]       = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (forceOpen && !keyless) {
      setDraft(YanaVault.getKey(p.id) || "");
      setEditing(true);
      setSaved(false);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
    }
  }, [forceOpen]);

  async function fetchLiveModels(key) {
    if (!LIVE_MODEL_PROVIDERS.has(p.id)) return;
    setChecking(true);
    try {
      const r = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p.id, key: key || "" }),
      });
      if (r.ok) {
        const { models } = await r.json();
        setLiveModels(models.slice(0, 6).map((m) => m.name || m.id));
      }
    } catch (_) {}
    setChecking(false);
  }

  React.useEffect(() => { if (keyless) fetchLiveModels(""); }, []);

  function openEdit() {
    setDraft(YanaVault.getKey(p.id) || "");
    setEditing(true);
    setSaved(false);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
  }

  async function saveKey() {
    const trimmed = draft.trim();
    if (trimmed) {
      await YanaVault.setKey(p.id, trimmed);
      setHasKey(true);
      fetchLiveModels(trimmed);
    } else {
      YanaVault.removeKey(p.id);
      setHasKey(false);
      setLiveModels(null);
    }
    setSaved(true);
    setTimeout(() => { setEditing(false); setSaved(false); }, 800);
    if (onKeyChange) onKeyChange();
  }

  function handleKeyDown(e) {
    if (e.key === "Enter")  { e.preventDefault(); saveKey(); }
    if (e.key === "Escape") { setEditing(false); }
  }

  const keyDisplay = hasKey ? YanaVault.getKey(p.id).slice(0, 10) + "····" : "—";

  const u = usage && usage[p.id];
  const usageDisplay   = u ? "~" + fmtTokens(u.est_tokens) + L(" tokens", " tokens", " 토큰", " tokens") : L("Not used yet", "Chưa dùng", "아직 사용 안 함", "尚未使用");
  const latencyDisplay = u && u.avg_latency_ms ? (u.avg_latency_ms / 1000).toFixed(1) + "s" : "—";

  const displayModels = liveModels || p.models;
  const modelLabel = liveModels
    ? L("Live models", "Model thực tế", "실시간 모델", "实时模型")
    : L("Models", "Mô hình", "모델", "模型");

  return (
    <div id={"provider-card-" + p.id} className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 13, flex: "none", display: "grid", placeItems: "center",
          fontSize: 15, fontWeight: 500, color: "var(--primary)",
          background: "var(--primary-soft)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5)",
        }}>{p.name[0]}</div>
        <div style={{ lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 500 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.company}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
          {p.desktopOnly && (
            <span className="chip neutral" style={{ fontSize: 10.5 }}
              title={L("Only available on desktop — requires a local server running on this machine",
                       "Chỉ dùng được trên máy tính — cần server local chạy trên máy này",
                       "데스크톱에서만 사용 가능 — 이 기기에서 로컬 서버가 실행 중이어야 함",
                       "仅限桌面端使用 — 需要在本机运行本地服务器")}>
              🖥 {L("Desktop", "Máy tính", "데스크톱", "桌面端")}
            </span>
          )}
          <span className={"chip " + (connected ? "" : "gold")} style={{ fontSize: 11.5 }}>
            <span className={"dot " + (connected ? "on" : "idle")} style={{ width: 6, height: 6, boxShadow: "none" }}></span>
            {keyless ? L("On-device", "Trên máy", "온디바이스", "本机运行") : connected ? L("Connected", "Kết nối", "연결됨", "已连接") : L("Standby", "Dự phòng", "대기", "待机")}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{p.role}</div>

      {(() => {
        const s = PROVIDER_SETUP[p.id];
        if (!s) return null;
        const isLocal = p.id === "9router" || p.id === "ollama" || p.id === "lmstudio";
        if (!isLocal && connected) return null;
        return (
          <div style={{
            fontSize: 11.5, borderRadius: 8, padding: "8px 11px", lineHeight: 1.6,
            background: "var(--primary-soft)", color: "var(--ink-2)",
          }}>
            {isLocal ? (
              <>
                <div style={{ fontWeight: 500, marginBottom: 3, color: "var(--primary)" }}>{s.label}</div>
                {s.url && <div><a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>{s.url}</a></div>}
                {s.cmd  && <div style={{ fontFamily: "monospace", marginTop: 2 }}>$ {s.cmd}</div>}
                {s.cmd2 && <div style={{ fontFamily: "monospace" }}>$ {s.cmd2}</div>}
              </>
            ) : (
              <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--primary)", fontWeight: 500 }}>
                {s.label} ↗
              </a>
            )}
          </div>
        );
      })()}

      <div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 5 }}>
          {checking ? L("Fetching live models…", "Đang tải model thực tế…", "실시간 모델 불러오는 중…", "正在获取实时模型…") : modelLabel}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {displayModels.map((m) => <span key={m} className="chip neutral" style={{ fontSize: 11 }}>{m}</span>)}
        </div>
      </div>

      <div className="grid-3" style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        {[[L("Usage", "Sử dụng", "사용량", "使用量"), usageDisplay], [L("Latency", "Độ trễ", "지연 시간", "延迟"), latencyDisplay]].map(([k, v]) => (
          <div key={k} style={{ lineHeight: 1.35, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{k}</div>
            <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
          </div>
        ))}
        <div style={{ lineHeight: 1.35, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{L("Key", "Khóa", "키", "密钥")}</div>
          {keyless ? (
            <span title={L("On-device provider — no API key needed", "Provider trên máy — không cần API key", "온디바이스 프로바이더 — API 키 불필요", "本机提供商 — 无需 API 密钥")}
              style={{ fontSize: 12, fontWeight: 500, color: "var(--good)" }}>
              {L("keyless", "không cần", "키 불필요", "无需密钥")}
            </span>
          ) : (
            <button onClick={openEdit} title={L("Click to set API key", "Nhấn để đặt API key", "클릭하여 API 키 설정", "点击设置 API 密钥")} style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontSize: 12, fontWeight: 500, color: hasKey ? "var(--good)" : "var(--primary)",
              display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit",
            }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 }}>
                {keyDisplay}
              </span>
              <span style={{ fontSize: 10, opacity: .6 }}>✎</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline key editor — replaces window.prompt() */}
      {editing && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", paddingTop: 4 }}>
          <input
            ref={inputRef}
            type="password"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={L("Paste API key here…", "Dán API key vào đây…", "여기에 API 키를 붙여넣으세요…", "在此粘贴 API 密钥…")}
            style={{
              flex: 1, fontSize: 13, padding: "6px 10px", borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--ink)", outline: "none", fontFamily: "monospace",
            }}
          />
          <button onClick={saveKey} style={{
            padding: "6px 12px", borderRadius: 8, border: "none",
            background: saved ? "var(--good)" : "var(--primary)", color: "#fff",
            cursor: "pointer", fontSize: 12, fontWeight: 500, flex: "none",
          }}>
            {saved ? "✓" : L("Save", "Lưu", "저장", "保存")}
          </button>
          <button onClick={() => setEditing(false)} style={{
            padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)",
            background: "transparent", color: "var(--ink-3)", cursor: "pointer", fontSize: 12,
          }}>✕</button>
        </div>
      )}
    </div>
  );
}

export function Providers() {
  const D = window.YANA;
  const [usage, setUsage] = React.useState(null);
  const [, bump] = React.useReducer((x) => x + 1, 0);
  const [openId, setOpenId] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setUsage(d.usage); })
      .catch(() => {});
  }, []);

  const connected = D.providers.filter((p) => providerAvailable(p.id)).length;

  function connectNext() {
    const next = D.providers.find((p) => !KEYLESS_PROVIDERS.has(p.id) && !YanaVault.hasKey(p.id));
    if (!next) { alert(L("All providers are connected.", "Tất cả nhà cung cấp đã kết nối.", "모든 프로바이더가 연결되었습니다.", "所有提供商均已连接。")); return; }
    setOpenId(next.id);
    setTimeout(() => {
      const el = document.getElementById("provider-card-" + next.id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  return (
    <div data-screen-label="Providers">
      <PageHeader
        title={L("Providers", "Nhà cung cấp", "프로바이더", "提供商")}
        sub={connected + L(" of ", " trong ", " / ", " / ") + D.providers.length + L(" providers connected · Groq routes, Yana AI supervises every call", " nhà cung cấp đã kết nối · Groq định tuyến, Yana AI giám sát mọi lệnh gọi", " 프로바이더 연결됨 · Groq가 라우팅, Yana AI가 모든 호출을 감독", " 个提供商已连接 · 由 Groq 路由，Yana AI 监督每次调用")}>
        <button onClick={connectNext} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 99,
          border: "none", cursor: "pointer", background: "var(--primary)", color: "white",
          fontSize: 13, fontWeight: 500, boxShadow: "0 4px 12px color-mix(in oklab, var(--primary) 30%, transparent)",
        }}>{Icons.plus(15)} {L("Connect provider", "Kết nối nhà cung cấp", "프로바이더 연결", "连接提供商")}</button>
      </PageHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--gap)" }}>
        {D.providers.map((p) => (
          <ProviderCard
            key={p.id + (YanaVault.hasKey(p.id) ? ":on" : ":off")}
            p={p}
            usage={usage}
            forceOpen={openId === p.id}
            onKeyChange={() => { bump(); setOpenId(null); }}
          />
        ))}
      </div>
    </div>
  );
}
