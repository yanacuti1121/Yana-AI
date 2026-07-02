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

Fixed 2026-07-02 (same day, follow-up): the `^value:` vs `statement:` schema
mismatch above. Checked before changing — `grep -rn "value:" core/ .claude/`
showed only these two session-bootstrap.sh copies referenced the old field;
core/scripts/add-fact.sh (the canonical fact writer) has only ever written
`statement:`; all 5 real fact files use `statement:`, none ever had
`value:`. Changed the grep from `-A2 '^value:' | tail -1` (a multi-line
pattern that never matched anything) to `-m1 '^statement:'` + strip the
prefix. Verified against all 5 real facts — each now produces its actual
sentence. Re-tested end-to-end: prompts mentioning "truth gate" or "hermes"
now correctly inject the matching fact(s), properly wrapped by the Phase 1
change above. Hook test suite still 91/95 (same 4 pre-existing unrelated
failures). L1 fact injection is now genuinely live, not just wired.

Next session: Phase 2 (system_prompt tiers). Re-read the module docstrings
in core/lib/hermes_adapted/system_prompt.py first — the original plan file
referenced above no longer exists on this machine.
