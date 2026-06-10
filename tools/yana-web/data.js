// Yana AI — demo data (plain JS, no JSX)
window.YANA = {
  stats: {
    agents: 97,
    agentsActive: 14,
    skills: 3507,
    skillsUsedToday: 212,
    missionsActive: 5,
    memories: 12840,
    memoriesToday: 47,
    uptimeDays: 31,
  },

  providers: [
    { id: "claude",     name: "Claude",     company: "Anthropic",  status: "connected", models: ["Opus 4.8", "Sonnet 4.6", "Haiku 4.5"], usage: "1.2M tokens today", latency: "1.1s", role: "Primary — reasoning & orchestration", key: "sk-ant-····7f2a" },
    { id: "openai",     name: "OpenAI",     company: "OpenAI",     status: "connected", models: ["GPT-4o", "GPT-4o mini"],              usage: "640K tokens today", latency: "0.9s", role: "Drafting & vision",                key: "sk-····k91x" },
    { id: "gemini",     name: "Gemini",     company: "Google",     status: "connected", models: ["2.0 Flash", "1.5 Pro"],               usage: "410K tokens today", latency: "0.8s", role: "Long context & search",            key: "AIza····m3q8" },
    { id: "groq",       name: "Groq",       company: "Groq",       status: "connected", models: ["Llama 4 70B"],                        usage: "95K tokens today",  latency: "0.2s", role: "Router — sub-300ms decisions",     key: "gsk-····t5w2" },
    { id: "deepseek",   name: "DeepSeek",   company: "DeepSeek",   status: "connected", models: ["V3", "R1"],                           usage: "180K tokens today", latency: "1.4s", role: "Deep reasoning — cost-efficient",  key: "sk-ds-····a7e1" },
    { id: "openrouter", name: "OpenRouter", company: "OpenRouter", status: "standby",   models: ["Fallback pool · 40+ models"],         usage: "Not used today",    latency: "—",    role: "Overflow & fallback routing",      key: "sk-or-····9d4c" },
  ],

  models: [
    { id: "claude", name: "Claude", model: "Sonnet 4.6", status: "active", load: 62, latency: "1.1s", role: "Reasoning · Orchestration" },
    { id: "gpt",    name: "GPT",    model: "4o",         status: "active", load: 38, latency: "0.9s", role: "Drafting · Vision" },
    { id: "gemini", name: "Gemini", model: "2.0 Flash",  status: "active", load: 21, latency: "0.8s", role: "Long context · Search" },
    { id: "groq",   name: "Groq",   model: "Llama 4",    status: "idle",   load: 4,  latency: "0.2s", role: "Fast inference · Routing" },
  ],

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

  missions: [
    {
      id: "m1", name: "Ship YAMTAM Engine v0.9", owner: "Navigator", progress: 72, due: "Jun 14", status: "on-track",
      tasks: [
        { name: "Skill registry migration", agent: "Forge",    state: "done" },
        { name: "Safety layer regression suite", agent: "Sentinel", state: "active" },
        { name: "Memory snapshot format v2", agent: "Curator",  state: "active" },
        { name: "Release notes draft", agent: "Scribe",   state: "queued" },
      ],
    },
    {
      id: "m2", name: "Yana onboarding flow", owner: "Scribe", progress: 45, due: "Jun 18", status: "on-track",
      tasks: [
        { name: "First-run script", agent: "Scribe", state: "active" },
        { name: "Provider connect UX copy", agent: "Scribe", state: "queued" },
        { name: "Safety disclosure review", agent: "Sentinel", state: "queued" },
      ],
    },
    {
      id: "m3", name: "Agent eval harness research", owner: "Scout", progress: 58, due: "Jun 20", status: "on-track",
      tasks: [
        { name: "Survey 12 eval frameworks", agent: "Scout", state: "done" },
        { name: "Synthesis memo", agent: "Scout", state: "active" },
        { name: "Benchmark plan", agent: "Ledger", state: "queued" },
      ],
    },
    {
      id: "m4", name: "Nightly repo audit", owner: "Warden", progress: 100, due: "Daily", status: "recurring",
      tasks: [
        { name: "Dependency scan", agent: "Warden", state: "done" },
        { name: "Secrets check", agent: "Sentinel", state: "done" },
      ],
    },
    {
      id: "m5", name: "Memory Garden spring cleaning", owner: "Gardener", progress: 12, due: "Jun 30", status: "scheduled",
      tasks: [
        { name: "Stale context decay pass", agent: "Gardener", state: "queued" },
        { name: "Duplicate fact merge", agent: "Curator", state: "queued" },
      ],
    },
  ],

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

  safety: {
    engine: "YAMTAM ENGINE",
    status: "All guardrails active",
    checksToday: 1284,
    blocked: 3,
    pendingReview: 2,
    lastIncident: "27 days ago",
  },

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
