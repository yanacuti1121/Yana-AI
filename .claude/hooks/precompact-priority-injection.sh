#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: PreCompact advisory — injects fidelity requirements into the
#   auto-generated compaction summary prompt (does not touch files, does not
#   block compaction — plain stdout text only, per core/hooks/CLAUDE.md's
#   hook anatomy for non-blocking advisory hooks).
# Last Reviewed: 2026-08-10
#
# Complements, does not replace, core/skills/pre-compact-backup/SKILL.md
# (that skill copies the raw transcript to logs/transcript_backups/ before
# compaction — an out-of-band safety net). This hook targets a different
# failure mode: even when the raw transcript is safely backed up, the
# in-context *summary* Claude Code produces is what future turns actually
# read, and Claude Code's default compaction prompt does not ask the
# summarizer to distinguish "answered" from "unanswered", preserve
# file:line citations, or keep exact numbers unrounded. A perfectly backed
# up transcript does not help if the live summary already dropped that
# detail.
#
# Idea credit: adapted from fcakyon/claude-codex-settings's
# intelligent-compact plugin (Apache-2.0), which pioneered "PreCompact
# hook injects priority instructions into the compact prompt" as a cheaper
# alternative to backup-based context preservation. Rewritten here in
# Yana AI's own voice, mapped onto this repo's own standards instead of
# copied verbatim: file:line citations mirror golden-principles.md #12
# (Surgical Changes) and verification.md's citation habits, evidence
# labeling mirrors 69-cognitive-reliability-law.md's Known/Unknown/Assumed
# triad, and the subagent-report clause mirrors
# agent-communication-policy.md's dispatch/report contract.
#
# Bypass: YANA_PRECOMPACT_INJECT_BYPASS=1 skips injection entirely (exit 0,
# no stdout) — e.g. for a deliberately short/casual session where the
# extra prompt weight isn't worth it.

set -uo pipefail

if [[ "${YANA_PRECOMPACT_INJECT_BYPASS:-0}" == "1" ]]; then
  exit 0
fi

cat << 'PRIORITY_BLOCK'
<yana-ai-priority-preservation>
These requirements augment Claude Code's default compaction sections —
they do not replace any of them, they raise the fidelity bar on
categories the default prompt leaves under-specified.

A. UNANSWERED QUESTIONS
   For every user message that asked something, mark it answered,
   partially answered, or unanswered. List every unanswered or
   partially-answered question verbatim in its own subsection — do not
   let it get folded into a general "what happened" narrative.

B. FILE:LINE CITATIONS, NOT PROSE DESCRIPTIONS
   Whenever a specific file location mattered (root cause, fix,
   reference read for context), cite it as `path/to/file.ext:42`, the
   same convention this repo's own responses already use. A
   description like "the guard function" without a path:line is not
   sufficient — the next session cannot re-locate it from prose alone.

C. EXACT NUMBERS, NEVER ROUNDED OR PARAPHRASED
   Preserve verbatim: benchmark results, test pass/fail counts, PR/
   issue numbers, commit SHAs, token counts, costs, error codes, and
   exact error message text. Per this repo's own Iron Law
   (core/rules/verification.md): a claim without the number that backs
   it is not evidence, it is a guess restated with confidence.

D. KNOWN / UNKNOWN / ASSUMED — DO NOT COLLAPSE INTO ONE NARRATIVE
   Separate what was verified with fresh evidence (Known), what was
   never checked (Unknown — an unknown is information, not a gap to
   silently paper over), and what was inferred or guessed (Assumed).
   Converting an assumption into a stated fact when compacting is
   exactly the failure 69-cognitive-reliability-law.md exists to catch
   — do not let compaction reintroduce it.

E. SUBAGENT REPORTS ARE PRIMARY EVIDENCE, NOT COMPRESSIBLE CHATTER
   Any Task/Agent tool result in this transcript was expensive to
   produce and often cannot be cheaply re-run. Preserve its Findings
   and Evidence & Reasoning sections in full (per
   agent-communication-policy.md's report contract), not summarized
   into one sentence.

F. ROOT CAUSES CONFIRMED VS. HYPOTHESES RULED OUT
   Keep both lists separate and both intact. A hypothesis that was
   tried and ruled out is exactly the information that prevents a
   future session from re-trying it — dropping it as "resolved, no
   longer relevant" throws away the thing that made it not relevant.

Priority when cutting for length: drop conversational filler and
repeated tool output before dropping anything in A-F.
</yana-ai-priority-preservation>
PRIORITY_BLOCK
