# YAMTAM ENGINE — Memory Persistence Law
# Source: discourse/AI-AGENTS.md pattern + yamtam L1/L2 memory system

**Status:** Active  
**Enforced by:** All agents, session wrap, pre-compact-backup  
**Companion skills:** `pre-compact-backup`, `session-context`, `strategic-compact`  
**Related rules:** `subagent-policy.md`, `agents-v2.md`

---

## Core Law

> **Critical information MUST be written to persistent storage before it can be relied upon in future sessions. Conversational context is ephemeral. L1 atomic memory is permanent.**

---

## What MUST Be Persisted (L1 Atomic)

Before ending a session or before context compaction, agents MUST write to L1 if:

```
□ A decision was made that affects future work (architecture choice, API contract)
□ A non-obvious constraint was discovered (rate limit, auth requirement, platform quirk)
□ A bug was fixed — root cause + fix documented
□ A configuration or environment value was verified as correct
□ A task was completed that a future agent needs to know about
□ An external dependency version was pinned for a specific reason
```

**Command:** `bash core/scripts/add-fact.sh "<tag>" "<fact>" "<confidence>"`

---

## What MUST NOT Stay in Chat Only

```
❌ Never leave in chat: API keys, tokens, credentials (even temporary)
❌ Never leave in chat: decisions that took >30 min to reach
❌ Never leave in chat: environment discoveries ("the staging DB is at X")
❌ Never leave in chat: list of completed tasks for a multi-session project
❌ Never leave in chat: architectural diagrams described in words
```

---

## Subagent Spawn Threshold

**Discourse rule adapted:** When a task requires context > 50% of available window, or spans > 3 distinct domains, the main agent MUST spawn subagents rather than handling everything in one context.

```
Trigger spawn when:
  □ Task requires reading > 20 files
  □ Task spans > 3 unrelated domains (UI + infra + security + data)
  □ Estimated output > 5 files changed
  □ Current context > 60% of window (risk of truncation mid-task)

Spawn pattern:
  1. Break task into independent subtasks (no shared mutable state)
  2. Each subagent gets a focused brief + relevant context snapshot
  3. Each subagent writes its output to a signal file
  4. Orchestrator assembles outputs and writes final state to L1
```

---

## Session End Protocol

Before any session ends (or `/session-wrap` is called):

```bash
# 1. Dump session context to L2 (auto-expires after session)
bash core/scripts/add-session-fact.sh "session_summary" "$(cat <<EOF
Tasks completed: <list>
Open items:      <list>
Decisions made:  <list>
EOF
)"

# 2. Promote important facts to L1
#    Use: bash core/scripts/add-fact.sh "tag" "fact" "high"

# 3. Verify nothing critical is stranded in chat
#    Ask: "Is there any decision or discovery from this session that
#          future-me won't know without L1?"
```

---

## Context Compaction Guard

When Claude Code triggers automatic context compression:

```
BEFORE compaction fires:
  □ Run: bash core/scripts/pre-compact-backup.sh (if available)
  □ Verify L1 has current project state
  □ Write "session in progress" fact to L1 with task list

AFTER compaction:
  □ Read L1 INDEX.md to restore context
  □ Re-read MANIFEST.json to confirm current version/counts
  □ Verify last git commit matches expected state
```

---

## L1 vs L2 Decision Matrix

| Fact type | L1 (permanent) | L2 (session) |
|---|---|---|
| Architecture decisions | ✅ | |
| Bug root causes | ✅ | |
| Environment config | ✅ | |
| In-progress task list | | ✅ |
| Temporary file paths | | ✅ |
| Current context state | | ✅ |
| Version numbers / counts | ✅ | |
| Credentials/keys | ❌ neither | |
