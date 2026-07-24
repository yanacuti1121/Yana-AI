# ADR-010: MCP Server Replaces Translator-per-Engine Pattern (Program J)

## Status

Draft — Phase 6 of ADS v1 for Program J (Universal Capability Runtime).
Program J's own Readiness Matrix (`docs/programs/PROGRAM-J-SKELETON.md`)
scores 70%, below ADS v1's 80% implementation bar — this ADR records the
decision already made by anh Tâm through Phases 1-5, it does not itself
authorize Phase 10 Implementation. Phase 7 (Research) and Phase 8 (Design
Review) still need to happen first.

Template per `docs/programs/ADS-v1.md`'s Phase 6 definition: Decision /
Problem / Alternatives / Tradeoffs / Reason / Consequence — not the
freeform Status/Context/Decision shape earlier ADRs (006-009) used,
since ADS v1 (2026-07-24) is now this repo's standing process for
Program-scoped decisions.

## Decision

Yana AI's per-engine hook translator pattern (`core/adapters/cursor/
before-shell-execution.js`, and the Windsurf/Kiro/OpenCode/Codex
translators that pattern's own comments say are planned to follow it) is
replaced by a single MCP Server, built as a new long-running mode of the
existing `yana-rt` Rust binary. All 5 clients in Program J's scope —
Claude Code, Cursor, Gemini, Codex, and the new `yana-ai chat --provider
ollama` local-model client — connect to this one server instead of each
having (or needing) their own translator. The server calls
`src/guard/mod.rs::check_command()` directly, in-process — the same pure
judgment function `guard-destructive.sh` (bash) already mirrors, not a
reimplementation.

Claude Code's own PreToolUse/PostToolUse interception mechanism
(`.claude/settings.json`) is explicitly NOT replaced — it stays exactly
as mandatory and model-independent as it is today. Only the *content* of
the hook script it invokes changes, from calling `guard-destructive.sh`
directly to calling the new MCP Server.

## Problem

Each AI coding tool Yana AI supports needs its own translator to bridge
that tool's native hook format to Yana AI's shared guard logic — Cursor's
`beforeShellExecution` JSON shape is not Codex's, is not Gemini's.
`core/adapters/` currently has exactly one such translator (Cursor).
Adding each new engine means hand-writing a new translator script, and
adding each new *hook type* (beyond destructive-command checking) means
touching every existing translator. This is the M×N problem `docs/
VISION-2.4.md`'s roadmap names directly: M engines × N capabilities,
each pairing wired by hand. `core/skills/9router-gateway/SKILL.md`
independently confirms the shape of the problem (though for a different
axis — provider fallback, not hook translation).

Separately, and discovered mid-session (2026-07-24): `yana-ai chat`'s
local-Ollama mode is pure conversation by design (`src/chat/mod.rs`'s
own module doc: "zero tool-calling, zero ability to execute anything")
specifically because nothing it does needs to go through Yana AI's hook
system. anh Tâm wants it to actually read the repo, Claude-Code-like —
which means it now needs the same guard-logic access every other client
needs, making it a 5th consumer of whatever solves the M×N problem
above.

## Alternatives

1. **Extend the translator pattern to 5 clients, unchanged in kind**
   (write Windsurf/Kiro/OpenCode/Codex/yana-ai-chat translators as more
   hand-written scripts, same shape as Cursor's). Doesn't solve M×N, just
   grows M. Rejected implicitly by choosing MCP at all — recorded here so
   the option isn't silently missing from the ADR.
2. **MCP Server as an additional discovery layer, translator kept for
   enforcement** (presented to anh Tâm as the lower-risk, recommended
   option via `AskUserQuestion`, 2026-07-24): MCP only answers "what
   capabilities exist," the existing translator-per-engine path stays the
   one enforcing real-time hook decisions. Lower implementation risk —
   doesn't touch a live, 4-rounds-of-adversarial-review security path —
   at the cost of running two mechanisms long-term.
3. **MCP Server fully replaces the translator pattern** (chosen). One
   mechanism, all 5 clients, both capability discovery and real-time
   enforcement.

## Tradeoffs

**Chosen (full replacement) gains:** one code path instead of two
long-term; `check_command()`'s own comment already anticipated this
("extracted...so it can be called once per MCP candidate... this is the
whole point of the design") — the pure-function boundary needed for this
was already deliberately prepared, unused, before this ADR; measured
evidence favors it on performance (see Consequence).

**Chosen (full replacement) costs:** the translator-per-engine path is
live, working, security-critical code (`core/adapters/cursor/
before-shell-execution.js`'s own header cites "4 rounds of adversarial
review"). Replacing it — rather than leaving it running alongside a new
discovery-only MCP layer — means that proven fail-closed behavior has to
be reproduced correctly in a new transport (MCP's JSON-RPC, not a
synchronous `spawnSync` call) before anything currently protected by it
can rely on the replacement. `dispatch()` in `src/guard/mod.rs` calls
`std::process::exit()` directly and cannot be called as-is from a
long-running server process — a concrete implementation dependency, not
a detail to gloss over at Phase 9.

## Reason

anh Tâm's direct decision, given both options with their tradeoffs
stated (not silently picked by this agent — see `docs/programs/
PROGRAM-J-SKELETON.md`'s Capability List section for the exact exchange):
"Thay thế hoàn toàn" (full replacement), over the lower-risk incremental
option this agent had recommended. For the separate Claude Code scope
question, anh Tâm's answer ("nếu chuyển được thì cứ, không thì nếu vẫn hỗ
trợ thì dùng như cũ là được") was resolved as "yes, convertible" only
after confirming the conversion doesn't weaken Claude Code's mandatory
interception into a voluntary MCP tool call — a real safety distinction
worked through explicitly before answering, not assumed.

## Consequence

**What must be true before Phase 10 Implementation can start** (this
ADR's own scope ends here — it records the decision, it does not clear
the Readiness gate):

- `check_command()` in `src/guard/mod.rs` needs `pub` visibility (currently
  private) and a caller that isn't `dispatch()`/`cmd_destructive()`,
  since both terminate the process — the correct integration point, not
  yet built.
- The fail-closed mapping documented in Program J's Interfaces section
  (both MCP error channels — Protocol Error and `isError:true` — must
  resolve to `deny` on the client side, no exception) is a hard
  requirement, not a nice-to-have, given what replacing this path means
  for the commands it currently blocks.
- Real performance data exists for the *old* path (178-310ms/call,
  measured directly 2026-07-24, `core/adapters/cursor/
  before-shell-execution.js` against a benign command, 5 runs) and
  strongly suggests the new path will be faster by at least an order of
  magnitude (in-process pure function vs. process spawn), but the new
  path's own number does not exist yet and must be measured once built —
  Phase 12 Benchmark, not assumed here.
- Claude Code, Cursor, Codex, Gemini, and `yana-ai chat` all become
  dependents of one server process instead of independent translators —
  a single point of failure that didn't exist before. Program J's
  Workflow section already specifies client-side timeout-as-deny as the
  mitigation; the exact timeout value is still undecided (Phase 9).

## References

- `docs/programs/PROGRAM-J-SKELETON.md` — full Phase 0-5 record this ADR
  distills; the authoritative source for anything summarized above
- `docs/programs/ADS-v1.md` — the process this ADR follows
- `core/adapters/cursor/before-shell-execution.js` — the pattern being
  replaced, read directly (not assumed) before any of the above was
  written
- `src/guard/mod.rs` — `check_command()` (line 691) and `dispatch()`
  (line 99), read directly for the implementation-dependency note above
- `memory/L1_atomic/fact-20260724-233122.md` — the same decision,
  persisted as an L1 fact the same day
- MCP specification, `modelcontextprotocol.io/specification/2025-06-18/
  server/tools` — fetched directly 2026-07-24 for the real `tools/list`/
  `tools/call` message shapes Program J's Interfaces section uses
