// Yana AI — demo data (plain JS, no JSX)
window.YANA = {
  stats: {
    // agents/skills filled from /api/status (MANIFEST) at runtime — see bottom.
    // Nothing tracks live agent runs or per-day skill calls yet, so these stay
    // at an honest 0 instead of a demo number.
    agents: 0,
    agentsActive: 0,
    skills: 0,
    skillsUsedToday: 0,
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
  ],

  // models card on the dashboard is now derived from providers + /api/usage

  agents: [
    { id: "sentinel",  name: "Sentinel",  role: "Safety Layer",        status: "active",  specialty: "Guardrails · Policy checks · Sandboxing", load: "Reviewing 3 actions", core: true },
    { id: "navigator", name: "Navigator", role: "Mission Orchestrator", status: "active",  specialty: "Planning · Task graphs · Delegation",     load: "Coordinating 6 missions", core: true },
    { id: "curator",   name: "Curator",   role: "Memory Keeper",        status: "active",  specialty: "Memory Garden · Context retrieval",       load: "Indexing 47 new entries", core: true },
    { id: "forge",     name: "Forge",     role: "Code Builder",         status: "active",  specialty: "Repos · Refactors · CI",                  load: "yamtam-engine #482" },
    { id: "scribe",    name: "Scribe",    role: "Writer",               status: "active",  specialty: "Docs · Summaries · Release notes",        load: "Drafting changelog" },
    { id: "scout",     name: "Scout",     role: "Researcher",           status: "active",  specialty: "Web research · Synthesis",                load: "Agent eval survey" },
    { id: "warden",    name: "Warden",    role: "System Monitor",       status: "active",  specialty: "Health · Logs · Alerts",                  load: "All systems nominal" },
    { id: "ledger",    name: "Ledger",    role: "Data Analyst",         status: "idle",    specialty: "Metrics · Reports · SQL",                 load: "Standby" },
    { id: "echo",      name: "Echo",      role: "Voice Interface",      status: "idle",    specialty: "Speech · Transcription",                  load: "Standby" },
    { id: "gardener",  name: "Gardener",  role: "Memory Pruner",        status: "idle",    specialty: "Dedup · Decay · Compression",             load: "Next run 02:00" },
  ],

  // missions are created at runtime by the Mission Composer — none preloaded
  missions: [],

  memories: [
    { id: 1, kind: "Fact",       text: "Tâm prefers terse commit messages — imperative mood, no emoji.", source: "Chat · Jun 9", fresh: true },
    { id: 2, kind: "Knowledge",  text: "YAMTAM skill manifests are YAML with a `permissions` block; deny-by-default.", source: "yamtam-engine/docs", fresh: true },
    { id: 3, kind: "Experience", text: "Mission 'v0.8 release' slipped 3 days — root cause: untested skill migrations. Added regression gate.", source: "Mission log · May 28", fresh: false },
    { id: 4, kind: "Context",    text: "Current focus: shipping v0.9 before demo day on Jun 15.", source: "Pinned by Tâm", fresh: true, pinned: true },
    { id: 5, kind: "Fact",       text: "Primary dev machine runs Arch Linux; scripts must avoid macOS-only flags.", source: "Chat · Jun 2", fresh: false },
    { id: 6, kind: "Knowledge",  text: "Groq endpoint is reserved for router decisions under 300ms budget.", source: "System config", fresh: false },
    { id: 7, kind: "Experience", text: "Letting Forge auto-merge without Sentinel review caused a rollback on May 14. Policy updated.", source: "Incident #12", fresh: false },
    { id: 8, kind: "Context",    text: "Yana's voice stays calm and brief — no exclamation marks, no hype.", source: "Pinned by Tâm", fresh: false, pinned: true },
  ],

  skillCategories: [
    { name: "Code & Repos",   count: 842, top: "git.smart-rebase",    usage: 34 },
    { name: "Research",       count: 617, top: "web.deep-survey",     usage: 22 },
    { name: "Writing",        count: 538, top: "doc.changelog",       usage: 18 },
    { name: "Data & Metrics", count: 469, top: "sql.explain-plan",    usage: 9 },
    { name: "Ops & System",   count: 651, top: "sys.health-probe",    usage: 11 },
    { name: "Safety",         count: 390, top: "guard.action-review", usage: 6 },
  ],

  // safety stats now come from GET /api/dashboard (real audit log)

  chat: [
    { who: "user", text: "Where are we on the v0.9 release? Anything blocking?" },
    { who: "yana", route: { agent: "Navigator", model: "Claude Sonnet 4.6" },
      text: "v0.9 is at 72% and on track for Jun 14. Two threads are live: Sentinel is running the safety regression suite (no failures so far, 41 of 58 cases done), and Curator is finalizing the memory snapshot v2 format. Nothing is blocked — but the release notes draft hasn't started, so I've queued Scribe to begin once the snapshot format freezes.",
      refs: ["Mission: Ship YAMTAM Engine v0.9", "Memory: v0.8 slip → regression gate"] },
    { who: "user", text: "Good. Have Forge hold any merges to main until the suite finishes." },
    { who: "yana", route: { agent: "Sentinel", model: "Claude Sonnet 4.6" },
      text: "Done. I've placed a merge freeze on yamtam-engine/main until the regression suite completes. Forge has 1 open PR (#482) — it will stay in review. I'll lift the freeze automatically and notify you when Sentinel signs off.",
      action: { label: "Merge freeze · yamtam-engine/main", state: "Active — auto-lifts on suite pass" },
      refs: ["Policy: Sentinel review required", "PR #482"] },
  ],
};

// Pull live stats from MANIFEST.json via server
fetch("/api/status").then(function(r) { return r.json(); }).then(function(d) {
  if (d.skills) window.YANA.stats.skills = d.skills;
  if (d.agents) window.YANA.stats.agents = d.agents;
  if (d.hooks)  window.YANA.stats.hooks  = d.hooks;
}).catch(function() {});
