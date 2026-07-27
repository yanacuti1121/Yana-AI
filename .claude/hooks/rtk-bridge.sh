#!/usr/bin/env bash
# PreToolUse: Bash
# Optional bridge to the external rtk CLI (github.com/rtk-ai/rtk, Apache-2.0)
# for token-compact command output. rtk is not vendored or bundled here —
# this is a thin, inert pass-through unless BOTH of the following are true:
#   1. YANA_RTK_BRIDGE=1 is set (opt-in, not wired into any default hook chain)
#   2. the `rtk` and `jq` binaries are present on PATH (or YANA_RTK_BIN points
#      at an explicit absolute path — see below)
# Any other case: exit 0 immediately, unmodified command, no side effects.
#
# Not auto-installed into .claude/settings.json's PreToolUse chain — see
# docs/reference/token-optimization.md for how to wire this in yourself.
#
# Data exposure: once enabled, the literal text of every Bash command this
# hook sees is passed to the `rtk` process, an unaudited, non-vendored
# third-party binary. If a command embeds a secret, token, or sensitive
# path, that content now transits that process. See 68-principal-
# confidentiality-law.md and docs/reference/token-optimization.md.
#
# INCIDENT (2026-07-26): this hook was briefly wired into the live
# PreToolUse|Bash chain by default, then unwired the same session after a
# concrete failure was observed: with the bridge active, an agent's own
# `git log --oneline | wc -l` silently returned 50 instead of the true
# 1,478 (rtk's compact `git log` format truncates). "Never emits more
# tokens than the raw command" (rtk's own guard) is a token-count
# guarantee, not a completeness guarantee — for anything read for
# verification/counting/fact-checking rather than casual glancing, a
# compacted result can be quietly wrong. Do not wire this into a default
# hook chain an agent relies on for evidence-based claims (see
# verification.md's Iron Law) without that agent knowing to bypass it, or
# double-check counts/facts against an uncompressed source, first.
#
# Security review findings this file was rewritten to address (2026-07-26,
# security-auditor + code-auditor per 54-bft-consensus-law.md):
#   1. The exit-0 path used to grant an explicit `permissionDecision: allow`
#      based purely on rtk's own exit code, with no check that the rewrite
#      preserved the original command's semantics. Fixed: this hook no
#      longer emits permissionDecision at all — it only ever supplies
#      updatedInput, so Yana AI's own destructive-command guards and the
#      harness's normal permission flow decide allow/deny/ask on whatever
#      command actually ends up running, exactly as they would for a
#      command this hook never touched.
#   2. Nothing verified that a rewrite from `rtk` was actually related to
#      the input command. Fixed: `looks_like_a_rewrite_of()` below requires
#      the original command to appear verbatim inside the candidate
#      rewrite; anything else falls back to the original, untouched command.
#   3. `rtk` was resolved via bare PATH lookup with no pinning, notable
#      given this repo's own PATH-hijack lesson in 71-entry-point-verify-
#      law.md. Mitigated, not fully solved: YANA_RTK_BIN lets a user pin an
#      absolute path explicitly; PATH lookup remains the default fallback
#      since full binary-hash verification (44-supply-chain-vetting.md
#      level) is out of scope for a single opt-in bridge hook — this
#      tradeoff is deliberate, not an oversight, and is stated here for
#      the next reviewer.
set -uo pipefail

[[ "${YANA_RTK_BRIDGE:-0}" == "1" ]] || exit 0

RTK_BIN="${YANA_RTK_BIN:-}"
if [[ -z "$RTK_BIN" ]]; then
  RTK_BIN=$(command -v rtk 2>/dev/null) || exit 0
fi
[[ -x "$RTK_BIN" ]] || exit 0
command -v jq &>/dev/null || exit 0

INPUT=$(cat)
CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null)
[[ -z "$CMD" ]] && exit 0

# A rewrite is only trusted if the original command appears verbatim inside
# it (rtk's own contract: `git status` -> `rtk git status`, i.e. the input
# is a literal suffix of the output). Anything else — truncation, an
# unrelated string, a confused or compromised rtk build — falls back to the
# untouched original command rather than being trusted blindly.
looks_like_a_rewrite_of() {
  local original="$1" candidate="$2"
  [[ "$candidate" == *"$original"* ]]
}

# rtk rewrite exit-code contract (documented upstream):
#   0 + stdout  rewrite found, no deny/ask rule matched -> safe to auto-allow
#   1           no rtk equivalent -> pass through unchanged
#   2           rtk's own deny rule matched -> pass through unchanged
#               (Yana AI's own guards still evaluate the original command)
#   3 + stdout  ask rule matched -> rewrite but let the harness prompt
#
# 5s timeout: rtk is a third-party binary this hook does not control. A
# hang here would hang the entire tool call (and the whole turn) with it —
# `timeout` returns 124 on expiry, which the wildcard case below already
# treats as a safe pass-through. macOS ships neither `timeout` nor
# `gtimeout` by default (see this repo's own README "Known limitations" —
# hook-timeout-guard.sh hit this exact landmine before): degrade to running
# without a hard cap rather than silently no-op'ing when neither exists.
TIMEOUT_BIN=$(command -v timeout 2>/dev/null || command -v gtimeout 2>/dev/null || true)
if [[ -n "$TIMEOUT_BIN" ]]; then
  REWRITTEN=$("$TIMEOUT_BIN" 5 "$RTK_BIN" rewrite "$CMD" 2>/dev/null)
else
  REWRITTEN=$("$RTK_BIN" rewrite "$CMD" 2>/dev/null)
fi
EXIT_CODE=$?

case "$EXIT_CODE" in
  1|2)
    exit 0
    ;;
  0)
    [[ "$CMD" == "$REWRITTEN" ]] && exit 0
    looks_like_a_rewrite_of "$CMD" "$REWRITTEN" || exit 0
    jq -c --arg cmd "$REWRITTEN" \
      '.tool_input.command = $cmd | {
        "hookSpecificOutput": {
          "hookEventName": "PreToolUse",
          "updatedInput": .tool_input
        }
      }' <<<"$INPUT"
    ;;
  3)
    looks_like_a_rewrite_of "$CMD" "$REWRITTEN" || exit 0
    jq -c --arg cmd "$REWRITTEN" \
      '.tool_input.command = $cmd | {
        "hookSpecificOutput": {
          "hookEventName": "PreToolUse",
          "updatedInput": .tool_input
        }
      }' <<<"$INPUT"
    ;;
  *)
    exit 0
    ;;
esac
