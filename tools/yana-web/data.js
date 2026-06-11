// Yana AI — runtime data shell (no demo numbers)
// Every screen reads real sources: /api/status (MANIFEST), /api/dashboard
// (L1 memory + audit log), /api/agents, /api/memories, /api/skills,
// /api/usage, and YanaVault for provider keys.
window.YANA = {
  stats: {
    // filled from /api/status below — 0 until the server answers
    agents: 0,
    skills: 0,
  },

  // Static catalog only — connection status, usage, latency, and keys are
  // real values resolved at runtime (YanaVault + GET /api/usage)
  providers: [
    { id: "claude",     name: "Claude",     company: "Anthropic",  models: ["Opus 4.8", "Sonnet 4.6", "Haiku 4.5"], role: "Primary — reasoning & orchestration" },
    { id: "openai",     name: "OpenAI",     company: "OpenAI",     models: ["GPT-4o", "GPT-4o mini"],               role: "Drafting & vision" },
    { id: "gemini",     name: "Gemini",     company: "Google",     models: ["2.0 Flash", "1.5 Pro"],                role: "Long context & search" },
    { id: "groq",       name: "Groq",       company: "Groq",       models: ["Llama 4 70B"],                         role: "Router — sub-300ms decisions" },
    { id: "deepseek",   name: "DeepSeek",   company: "DeepSeek",   models: ["V3", "R1"],                            role: "Deep reasoning — cost-efficient" },
    { id: "openrouter", name: "OpenRouter", company: "OpenRouter", models: ["Fallback pool · 40+ models"],          role: "Overflow & fallback routing" },
    { id: "9router",    name: "9Router",    company: "Local gateway", models: ["40+ providers · auto-fallback"],    role: "Quota armor — localhost:20128, never hit limits" },
    { id: "ollama",     name: "Ollama",     company: "On-device",  models: ["llama3.2", "qwen3", "gemma3"],         role: "Sovereign tier — rule 68, text never leaves the machine" },
  ],

  // missions are created at runtime by the Mission Composer — none preloaded
  missions: [],

  // real conversation only — starts empty, persists across page navigation
  chat: [],
};

// Pull live stats from MANIFEST.json via server
fetch("/api/status").then(function(r) { return r.json(); }).then(function(d) {
  if (d.skills) window.YANA.stats.skills = d.skills;
  if (d.agents) window.YANA.stats.agents = d.agents;
}).catch(function() {});
