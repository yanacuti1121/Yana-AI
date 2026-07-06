---
id: fact-hermes-integration-paused
type: decision
statement: hermes_adapted integration is scoped to a 6-phase plan; Phase 0 (foundation fixes), Phase 1 (context_scrubber wiring into session-bootstrap.sh), and Phase 3 (tool_guardrails wiring into tool-guardrails-detector.sh) are done — Phase 2 (system_prompt) and Phases 4-5 (context_compressor, memory_manager into live hooks) are designed but not started.
source: file:/home/codespace/.claude/plans/squishy-stirring-cookie.md (unavailable on this machine — Phase 1 done by re-deriving from context_scrubber.py directly, plan file not found locally)
confidence: high
scope: Yana AI
tags: [hermes, hooks, dormant-code, session-bootstrap, in-progress]
forbidden_assumptions:
  - Do not assume core/lib/hermes_adapted/{system_prompt,context_compressor,memory_manager}.py are wired into anything yet — only context_scrubber.py (via session-bootstrap.sh) and tool_guardrails.py (via tool-guardrails-detector.sh, through the new tool_guardrails_io.py adapter) are live
  - The plan file at the source path above does not exist on this machine (checked 2026-07-02) — if picking up Phase 2/4/5, re-derive from the module docstrings/tests in core/lib/hermes_adapted/, do not assume its reasoning without re-reading what's actually there
  - tool-guardrails-detector.sh is warn-only (hard_stop_enabled is off in tool_guardrails_io.build_config()) — it never blocks a tool call, only prints an advisory line on PostToolUse
evidence: core/lib/hermes_adapted/*.py, core/lib/hermes_adapted/tool_guardrails_io.py (new adapter, Phase 3, security-auditor + code-auditor reviewed), .claude/hooks/session-bootstrap.sh + core/hooks/session-bootstrap.sh (identical, both wired), core/hooks/tool-guardrails-detector.sh + .claude/hooks/ mirror (identical, both wired to PostToolUse record / Stop reset), core/tests/hooks/run-hook-tests.sh (148/148 passing as of Phase 3 post-review fixes), .claude-plugin/plugin.json hooks count 56 (was stale at 55, caught by drift-check.sh during review)
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

Phase 3 completed 2026-07-06 (done before Phase 2 — see reasoning below):
wired tool_guardrails.py's per-turn tool-call loop detector (exact-failure,
same-tool-failure, idempotent-no-progress) into a new hook,
core/hooks/tool-guardrails-detector.sh (+ byte-identical .claude/hooks/
mirror), registered under both PostToolUse ("record" arg) and Stop ("reset"
arg) in .claude/settings.json — the same dual-event-with-distinguishing-arg
pattern agent-pixel-notify.sh already uses for start/stop. tool_guardrails.py
itself was NOT modified (stays a near-verbatim MIT port); a new adapter,
core/lib/hermes_adapted/tool_guardrails_io.py, maps Claude Code's actual
tool names (Read/Bash/Edit/... — not hermes-agent's read_file/terminal/...)
onto the module's idempotent/mutating config, derives `failed` from Claude
Code's real PostToolUse payload shape, and serializes/deserializes a
ToolCallGuardrailController's per-session state to/from
.claude/state/tool-guardrail-state.json (JSON, gitignored), since each hook
invocation is a fresh process with no persistent controller instance.
Warn-only: hard_stop_enabled is off, so no tool call is ever blocked, only
an advisory line printed. Found and fixed one real bug during testing: the
hook's `cd "$PROJECT_DIR"` before the Python import broke when a test
sandboxes CLAUDE_PROJECT_DIR to a throwaway dir (matches
verify-evidence-track.sh's own test convention) — the Python import needs
the script's own real repo root, not the (possibly fake) project dir used
for state-file placement. Fixed by resolving REPO_ROOT from
`${BASH_SOURCE[0]}` separately from PROJECT_DIR.

Per 54-bft-consensus-law.md, dispatched security-auditor + code-auditor
before commit (this touches core/hooks/**). No Safety-severity findings —
confirmed clean on shell/Python injection, path traversal via session_id,
and secret leakage. Real Correctness findings fixed in the same pass: (1)
the 8000-char truncation cap could misclassify a large genuinely-failing
command's output as succeeded, silently defeating the detector on exactly
the noisy repeatedly-failing commands it's meant to catch — fixed by
extracting exit_code/is_error via a separate, always-tiny jq query BEFORE
truncation; (2) truncated tool_input collapsing to the same empty `{}`
could cause a false-positive loop warning across distinct large calls —
fixed by keeping the truncated fragment as part of the signature instead;
(3) an unlocked read-modify-write on the state file could race under
concurrent invocations — fixed with Python's fcntl.flock (not the `flock`
CLI, unavailable on macOS); (4) the state file could grow unbounded across
a repo's lifetime for sessions that never fire Stop (crash, bypass) — fixed
with a `_last_touched` timestamp + prune_stale_sessions() (6h window); (5) a
symlinked invocation would silently resolve REPO_ROOT wrong — fixed with a
readlink -f fallback; (6) added a schema-drift guard
(_assert_controller_shape) so a future upstream change to tool_guardrails.py
fails loudly instead of silently losing loop-detection state; (7) also
caught and fixed a stale .claude-plugin/plugin.json hooks count (55, disk
had 56) via drift-check.sh. 14 unit tests (tests/test_hermes_tool_guardrails_io.py,
up from 9) + 8 new hook tests (up from 5, including same_tool_failure_warning
and a large-truncated-failure regression test) all passing; full hook suite
148/148 (up from an earlier stale 91/95 note above — those 4 pre-existing
failures no longer reproduce, unrelated to this change).

Phase 3 was done before Phase 2 on purpose: investigated system_prompt.py
first (next in the original numbering) and found no compelling wiring
target — session-bootstrap.sh's current fields are all cheap, volatile/
context-tier bash string-building, so the 3-tier stable/context/volatile
caching design would save no real work there. tool_guardrails.py had a
concrete, unaddressed gap instead (per-turn args-aware loop detection, which
per-tool-circuit-breaker.sh/token-budget-guard.sh don't do), so it went
first.

Next session: Phase 2 (system_prompt tiers) still has no confirmed home —
re-derive from core/lib/hermes_adapted/system_prompt.py's docstrings/tests
and look for a genuine caching win before wiring it in, rather than wiring
it in just because it's next in the original numbering. Otherwise, Phase 4
(context_compressor) or Phase 5 (memory_manager).
