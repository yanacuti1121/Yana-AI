#!/usr/bin/env bash
# Yana AI — shared hash-chain append helper
# Status: active
# Description: One correct, lockable way to append an entry to
#   .claude/state/audit-chain.log, for the writers that are NOT
#   .claude/hooks/audit-log.sh's own PostToolUse invocation.
# Last Reviewed: 2026-07-16
#
# BUG FIX CONTEXT: core/scripts/session-rollback.sh and rotate-audit-log.sh
# both used to hand-roll their own audit-chain.log entries via inline
# python3 — with no `prev_hash` field (session-rollback.sh) or no `hash`
# field at all (rotate-audit-log.sh's rotation marker), and neither took
# any lock. core/scripts/verify-audit-chain.sh could never verify either
# entry shape, so every rollback/rotation permanently broke the chain,
# independent of the separate concurrent-write race audit-log.sh itself had
# (see that file's 2026-07-16 fix and core/config/audit-chain-known-breaks.json).
# This helper produces the exact same entry shape audit-log.sh writes and
# takes the exact same $STATE_DIR/.audit-log.lockdir lock, so all writers
# to this file are now mutually exclusive and mutually verifiable.
#
# Usage (source this file, then call the function):
#   source ".../lib/audit-chain-append.sh"
#   audit_chain_append "<hook>" "<tool>" "<agent>" "<input-as-one-line-json-or-text>" "<decision>"
#
# Best-effort only, matching audit-log.sh's own posture: returns 1 (does
# NOT write anything) if jq or a sha256 tool is unavailable. Never treat a
# failure to log as a reason to fail the caller's actual operation —
# callers should tolerate a nonzero return the same way audit-log.sh
# tolerates a missing dependency (log, don't block).

audit_chain_append() {
  # Argument-count guard (code-auditor review, 2026-07-16): under the
  # set -u callers use, referencing $5 with fewer than 5 args would abort
  # the whole calling script via nounset. No caller does that today, but a
  # future one could — fail this one log entry, not the caller's operation.
  if [[ $# -ne 5 ]]; then
    echo "[audit-chain-append] WARN: expected 5 args (hook tool agent input decision), got $#" >&2
    return 1
  fi
  local hook="$1" tool="$2" agent="$3" input="$4" decision="$5"

  local state_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state"
  local log_file="$state_dir/audit-chain.log"
  local lock_dir="$state_dir/.audit-log.lockdir"
  mkdir -p "$state_dir" 2>/dev/null || true

  local sha256=()
  if command -v sha256sum >/dev/null 2>&1; then
    sha256=(sha256sum)
  elif command -v shasum >/dev/null 2>&1; then
    sha256=(shasum -a 256)
  else
    return 1
  fi
  command -v jq >/dev/null 2>&1 || return 1

  local genesis
  genesis=$(printf 'YANA_GENESIS' | "${sha256[@]}" | awk '{print $1}')

  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Same mkdir-lock + staleness-recovery convention as
  # .claude/hooks/audit-log.sh's 2026-07-16 fix, same LOCK_DIR path — this
  # is what makes the two writers mutually exclusive on the same file.
  #
  # Deliberately NOT using a `trap ... EXIT` here (unlike audit-log.sh,
  # which is a whole standalone script): this is a function inside a
  # sourced library, called from within a larger caller script. A trap set
  # here would hijack the CALLER's process-wide EXIT trap, not just this
  # function's own cleanup — a real bug, not a stylistic choice. There is
  # no early-return between a successful mkdir and the plain rmdir call
  # below, so the only way this leaks the lock is a SIGKILL mid-function,
  # which a trap can't catch either way — the staleness/TTL check above is
  # what recovers from that, same as in audit-log.sh.
  local acquired=0 tries=0
  if [[ -d "$lock_dir" ]]; then
    local mtime age
    mtime=$(stat -f '%m' "$lock_dir" 2>/dev/null || stat -c '%Y' "$lock_dir" 2>/dev/null || echo "")
    if [[ -n "$mtime" ]]; then
      age=$(( $(date +%s) - mtime ))
      if [[ $age -ge 5 ]]; then
        rmdir "$lock_dir" 2>/dev/null || true
      fi
    fi
  fi
  while ! mkdir "$lock_dir" 2>/dev/null; do
    tries=$((tries + 1))
    if [[ $tries -ge 50 ]]; then
      break
    fi
    sleep 0.02
  done

  local degraded="false"
  if [[ $tries -lt 50 ]]; then
    acquired=1
  else
    degraded="true"
    echo "[audit-chain-append] WARN: lock contention timeout after ~1s — this entry ($hook) is logged unlocked" >&2
  fi

  local prev_hash
  prev_hash=$(tail -1 "$log_file" 2>/dev/null | jq -r '.hash // ""' 2>/dev/null || true)
  [[ -z "$prev_hash" ]] && prev_hash="$genesis"

  local content hash
  content="${ts}|${hook}|${tool}|${agent}|${input}|${decision}"
  hash=$(printf '%s|%s' "$content" "$prev_hash" | "${sha256[@]}" | awk '{print $1}')

  jq -cn \
    --arg ts        "$ts" \
    --arg hook      "$hook" \
    --arg tool      "$tool" \
    --arg agent     "$agent" \
    --arg input     "$input" \
    --arg decision  "$decision" \
    --arg prev_hash "$prev_hash" \
    --arg hash      "$hash" \
    --argjson degraded "$degraded" \
    '{ts:$ts,hook:$hook,tool:$tool,agent:$agent,input:$input,decision:$decision,prev_hash:$prev_hash,hash:$hash,degraded:$degraded}' \
    >> "$log_file"

  [[ "$acquired" == "1" ]] && rmdir "$lock_dir" 2>/dev/null || true
  return 0
}
