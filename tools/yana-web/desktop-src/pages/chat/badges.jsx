// Yana AI — Chat message badges: confidential-mode tag + provider/speed/cost chip
import React from 'react';
import { L, YanaMark } from '../../components.jsx';

export function ConfidentialBadge({ tier }) {
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

export function RouteChip({ route }) {
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
