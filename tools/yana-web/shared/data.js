// Yana AI — runtime data shell (no demo numbers)
// Every screen reads real sources: /api/status (MANIFEST), /api/dashboard
// (L1 memory + audit log), /api/agents, /api/memories, /api/skills,
// /api/usage, and YanaVault for provider keys.
window.YANA = {
  username: null, // filled from /api/auth/status
  version:  null, // filled from /api/status
  stats: {
    // filled from /api/status below — 0 until the server answers
    agents: 0,
    skills: 0,
    // the mobile shell reads these directly; hydrated from /api/dashboard,
    // /api/missions and /api/usage when window.YANA_MOBILE is set
    agentsActive: 0,
    missionsActive: 0,
    skillsUsedToday: 0,
    memories: 0,
    memoriesToday: 0,
    uptimeDays: 0,
  },

  // collections the mobile screens iterate — empty until hydrated
  agents: [],
  models: [],
  memories: [],
  skillCategories: [],
  safety: { checksToday: 0, blocked: 0, pendingReview: 0, lastIncident: "—" },

  // Static catalog only — connection status, usage, latency, and keys are
  // real values resolved at runtime (YanaVault + GET /api/usage)
  providers: [
    { id: "auto",       name: "🤖 Auto",    company: "Smart route", models: [],                                      role: "Auto-selects best provider based on task type" },
    { id: "claude",     name: "Claude",     company: "Anthropic",  models: ["Opus 4.8", "Sonnet 4.6", "Haiku 4.5"], role: "Primary — reasoning & orchestration" },
    { id: "openai",     name: "OpenAI",     company: "OpenAI",     models: ["GPT-4o", "GPT-4o mini"],               role: "Drafting & vision" },
    { id: "gemini",     name: "Gemini",     company: "Google",     models: ["2.0 Flash", "1.5 Pro"],                role: "Long context & search" },
    { id: "groq",       name: "Groq",       company: "Groq",       models: ["Llama 4 70B"],                         role: "Router — sub-300ms decisions" },
    { id: "deepseek",   name: "DeepSeek",   company: "DeepSeek",   models: ["V3", "R1"],                            role: "Deep reasoning — cost-efficient" },
    { id: "openrouter", name: "OpenRouter", company: "OpenRouter", models: ["Fallback pool · 40+ models"],          role: "Overflow & fallback routing" },
    { id: "9router",    name: "9Router",    company: "Local gateway", models: ["40+ providers · auto-fallback"],    role: "Quota armor — localhost:20128, never hit limits", desktopOnly: true },
    { id: "ollama",     name: "Ollama",     company: "On-device",  models: ["llama3.2", "qwen3", "gemma3"],         role: "Sovereign tier — rule 68, text never leaves the machine", desktopOnly: true },
    { id: "lmstudio",   name: "LM Studio",  company: "On-device",  models: ["local-model"],                         role: "Local server — port 1234, load any model in the app", desktopOnly: true },
  ],

  // missions are created at runtime by the Mission Composer — none preloaded
  missions: [],

  // real conversation only — starts empty, persists across page navigation
  chat: [],
};

// Components read window.YANA at render time, so every hydration step below
// announces itself — the mobile app shell listens and re-renders.
function yanaTouch() {
  try { window.dispatchEvent(new Event("yana:data")); } catch (_) {}
}

// Pull live stats from MANIFEST.json via server
fetch("/api/status").then(function(r) { return r.json(); }).then(function(d) {
  if (d.skills)   window.YANA.stats.skills = d.skills;
  if (d.agents)   window.YANA.stats.agents = d.agents;
  if (d.version)  window.YANA.version      = d.version;
  yanaTouch();
}).catch(function() {});

// Username for avatar + greeting
fetch("/api/auth/status").then(function(r) { return r.json(); }).then(function(d) {
  if (d.username) { window.YANA.username = d.username; yanaTouch(); }
}).catch(function() {});

// ── Mobile hydration ──────────────────────────────────────────────────────────
// Desktop screens fetch these APIs inside their own components; the mobile
// shell (yana-mobile/) reads window.YANA directly, so fill it here from the
// same real sources. mobile.html sets window.YANA_MOBILE before this file.
if (window.YANA_MOBILE) {
  (function() {
    var Y = window.YANA;
    var KIND = { fact: "Fact", knowledge: "Knowledge", experience: "Experience", context: "Context" };

    // L1 memory totals + audit-log safety counters + server uptime
    fetch("/api/dashboard").then(function(r) { return r.json(); }).then(function(d) {
      if (d.memories) {
        Y.stats.memories      = d.memories.total;
        Y.stats.memoriesToday = d.memories.today;
      }
      if (d.safety) {
        Y.safety.checksToday  = d.safety.events_today;
        Y.safety.blocked      = d.safety.blocked_today;
        Y.safety.lastIncident = d.safety.last_incident || "None";
      }
      if (d.uptime_s) Y.stats.uptimeDays = Math.floor(d.uptime_s / 86400);
      yanaTouch();
    }).catch(function() {});

    // Every L1 atomic fact — kinds normalized to the mobile card vocabulary
    fetch("/api/memories").then(function(r) { return r.json(); }).then(function(d) {
      if (!d.memories) return;
      Y.memories = d.memories.map(function(m) {
        return {
          id: m.id, text: m.text, source: m.source, fresh: m.fresh,
          kind: KIND[String(m.kind).toLowerCase()] || "Context",
        };
      });
      yanaTouch();
    }).catch(function() {});

    // Real agent catalog — no agent is "running" unless a mission says so
    fetch("/api/agents").then(function(r) { return r.json(); }).then(function(d) {
      if (!d.agents) return;
      Y.agents = d.agents.map(function(a) {
        return {
          id: a.category + "/" + a.name, name: a.name, role: a.category,
          specialty: a.description, status: "idle", load: "Standby",
        };
      });
      yanaTouch();
    }).catch(function() {});

    // Skill packs → category bars (usage = share of installed skills)
    fetch("/api/skills").then(function(r) { return r.json(); }).then(function(d) {
      if (!d.packs) return;
      var total = d.total || 1;
      Y.skillCategories = d.packs.map(function(p) {
        return { name: p.name, count: p.count, usage: Math.round((p.count / total) * 100), top: p.name };
      });
      yanaTouch();
    }).catch(function() {});

    // Real missions from the file-backed store
    fetch("/api/missions").then(function(r) { return r.json(); }).then(function(d) {
      if (!d.missions) return;
      Y.missions = d.missions.map(function(m) {
        return {
          id: m.id, name: m.name || m.goal || "Mission", owner: m.owner || "Navigator",
          status: m.status || "planning", progress: m.progress || 0,
          due: m.due || "—", tasks: m.tasks || [],
        };
      });
      Y.stats.missionsActive = Y.missions.filter(function(m) { return m.status !== "done"; }).length;
      yanaTouch();
    }).catch(function() {});

    // Per-provider session usage → "Active AI Models" rows (real latency/requests)
    fetch("/api/usage").then(function(r) { return r.json(); }).then(function(d) {
      var usage = d.usage || {};
      Y.models = Y.providers.map(function(p) {
        var u = usage[p.id];
        var active = !!(u && u.requests > 0);
        return {
          id: p.id, name: p.name, model: p.models[0] || "", role: p.role,
          status: active ? "active" : "idle",
          load: active ? Math.min(100, u.requests * 10) : 0,
          latency: active ? (u.avg_latency_ms / 1000).toFixed(1) + "s" : "—",
        };
      });
      yanaTouch();
    }).catch(function() {});
  })();
}
