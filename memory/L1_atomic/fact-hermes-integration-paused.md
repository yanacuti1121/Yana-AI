---
id: fact-hermes-integration-paused
type: decision
statement: hermes_adapted integration is scoped to a 6-phase plan; Phase 0 (foundation fixes) and Phase 1 (context_scrubber wiring into session-bootstrap.sh) are done — Phases 2-5 (tool_guardrails, system_prompt, context_compressor, memory_manager into live hooks) are designed but not started.
source: file:/home/codespace/.claude/plans/squishy-stirring-cookie.md (unavailable on this machine — Phase 1 done by re-deriving from context_scrubber.py directly, plan file not found locally)
confidence: high
scope: Yana AI
tags: [hermes, hooks, dormant-code, session-bootstrap, in-progress]
forbidden_assumptions:
  - Do not assume core/lib/hermes_adapted/{tool_guardrails,system_prompt,context_compressor,memory_manager}.py are wired into anything yet — only context_scrubber.py (sanitize_context/build_memory_context_block) is live, via session-bootstrap.sh
  - The plan file at the source path above does not exist on this machine (checked 2026-07-02) — if picking up Phase 2+, re-derive from the module docstrings/tests in core/lib/hermes_adapted/, do not assume its reasoning without re-reading what's actually there
evidence: core/lib/hermes_adapted/*.py, .claude/hooks/session-bootstrap.sh + core/hooks/session-bootstrap.sh (identical, both wired), core/tests/hooks/run-hook-tests.sh (91/95 passing, 4 pre-existing unrelated failures in tool-validator.sh SSRF checks + supply-chain-guard.sh typosquat check)
---

Phase 0 completed 2026-06-19 (commits 2a71ef8a, cb2aa8ac):
1. Fixed truth-gate-guard.sh — its jq transcript filter assumed a JSON array
   and a top-level .role key; real transcripts are JSONL with
   {"type":"assistant","message":{"role":...,"content":...}}. The hook had
   been silently no-op since 2026-05-19. Now fixed in both core/hooks/ and
   .claude/hooks/, with new test cases in run-hook-tests.sh.
2. Registered session-bootstrap.sh (UserPromptSubmit) and
   per-tool-circuit-breaker.sh (PreToolUse .*) in .claude/settings.json —
   both were fully built/tested since 2026-05-19/05-24 but never wired in
   (confirmed via git log -S, not a deliberate removal).

Also flagged (not fixed, out of scope): core/hooks/ and .claude/hooks/ have
already drifted (no sync mechanism exists); HOOK_WIRING.md is a downstream
consumer template, not a description of this repo's own settings.json.
(Verified 2026-07-02: the two session-bootstrap.sh copies are still
identical — no drift on this specific file yet.)

Phase 1 completed 2026-07-02: session-bootstrap.sh's "L1 facts" injection
(step 1 of its output) now pipes the matched-fact string through
build_memory_context_block() (core/lib/hermes_adapted/context_scrubber.py,
invoked via `python3 -c` from bash, stdin-piped — no shell string
interpolation of untrusted content) before adding it to OUTPUT_PARTS. The
result is wrapped in `<memory-context>...</memory-context>` with a system
note marking it as recalled memory, not new user input — closes the gap
where injected L1 facts looked identical to real user instructions to the
model. Falls back to the old plain "L1 facts: ..." line if python3 or the
import fails (fail-open, non-blocking, matches the hook's existing
fail-open posture on missing jq). Verified end-to-end with a throwaway
test fact file (created and deleted, not committed) — output contained
the correct wrapped block. Applied identically to both core/hooks/ and
.claude/hooks/ copies (confirmed byte-identical after edit).

Separately discovered, NOT fixed (out of scope for Phase 1): the L1 fact
matching logic in session-bootstrap.sh greps fact files for a line
starting with `^value:`, but memory/L1_atomic/SCHEMA.md's actual required
field is `statement:` — no current fact file has a `value:` line, so
MATCHED_FACTS is silently empty for every real fact today (confirmed:
`grep -l "^value:" memory/L1_atomic/*.md` returns nothing). The L1
fact-injection feature has likely been a no-op since it was written. Not
fixed here — flagging for a human decision on whether to grep `statement:`
instead (needs to check nothing downstream still relies on `value:`).

Next session: Phase 2 (system_prompt tiers). Re-read the module docstrings
in core/lib/hermes_adapted/system_prompt.py first — the original plan file
referenced above no longer exists on this machine.
