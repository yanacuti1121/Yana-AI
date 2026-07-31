// Yana AI — Chat sensitivity detection + smart provider routing (rule 68).
// KEYLESS_PROVIDERS / providerAvailable / getProviderConfig now live in
// ../../lib/provider-config.js (extracted there in Phase 2 since spaces.jsx
// and html-maker.jsx needed them ahead of chat.jsx's own conversion).

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

export function detectSensitivity(text) {
  const lower = (text || "").toLowerCase();
  if (SENS_SOVEREIGN.some((m) => lower.includes(m))) return "sovereign";
  if (SENS_CONFIDENTIAL.some((m) => lower.includes(m))) return "confidential";
  if (SENS_SMELLS.some((m) => lower.includes(m))) return "confidential";
  return null;
}

// Smart provider routing — picks best provider based on task classification.
// localStatus: { ollama: { running, models }, ... } from /api/local-status.
// routeType: 'complex' | 'simple'  from /api/route decision field.
// taskText: raw user message (used for keyword signals).
export function smartPickProvider(taskText, routeType, localStatus) {
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
