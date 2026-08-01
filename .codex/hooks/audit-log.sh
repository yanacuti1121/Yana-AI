#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Hash-chain audit log — tamper-evident JSONL of every tool call
# Last Reviewed: 2026-05-19
# PostToolUse hook — Yana AI Hash-Chain Audit Log
# Each JSONL entry includes a SHA-256 hash of its content + previous entry hash.
# If any entry is tampered, all subsequent hashes break — independently verifiable
# by core/scripts/verify-audit-chain.sh.

set -uo pipefail
command -v jq >/dev/null 2>&1 || exit 0

# macOS ships neither sha256sum nor an alias for it; `shasum -a 256` is the
# native equivalent and emits the same "<hash>  -" output format. Without
# this, the hook used to silently no-op (exit 0) on every macOS host —
# the audit chain would just never get written, with no warning.
if command -v sha256sum >/dev/null 2>&1; then
  SHA256=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  SHA256=(shasum -a 256)
else
  exit 0
fi

GENESIS_HASH=$(printf 'YANA_GENESIS' | "${SHA256[@]}" | awk '{print $1}')

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
AGENT_NAME=$(printf '%s' "$INPUT" | jq -r '.agent_name // "manual"' 2>/dev/null || true)
TOOL_INPUT=$(printf '%s' "$INPUT" | jq -c '.tool_input // {}' 2>/dev/null || echo '{}')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

STATE_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state"
mkdir -p "$STATE_DIR" 2>/dev/null || true
LOG_FILE="$STATE_DIR/audit-chain.log"

# ── Secret masking ────────────────────────────────────────────────────────────
INPUT_SAFE="${TOOL_INPUT:0:300}"
FILE_PATH=$(printf '%s' "$TOOL_INPUT" | jq -r '.file_path // .path // ""' 2>/dev/null || true)
if [[ "$FILE_PATH" =~ \.(env|pem|key|secret|cred) ]] || \
   printf '%s' "$INPUT_SAFE" | grep -qiE '(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|BEARER)'; then
  INPUT_SAFE="[REDACTED]"
fi

# ── Hash-chain lock ───────────────────────────────────────────────────────────
# BUG FIX (2026-07-16, found live in production by giamthi-watch.sh's
# audit-chain check — the independent watcher described in
# .claude/scripts/giamthi-watch.sh and core/tests/hooks/run-hook-tests.sh's
# "giamthi-halt-check.sh" section; giamthi-watch.sh calls
# core/scripts/verify-audit-chain.sh directly, which is what surfaced this):
# reading "tail -1" and appending were two unsynchronized steps. Claude Code
# routinely fires several tool calls in parallel within one turn, so two
# concurrent invocations of this hook could both read the SAME prev hash
# before either had appended — producing two entries with an identical
# prev_hash (a forked, non-linear chain) instead of a true unbroken sequence.
# Confirmed in production: entries at 2026-07-09T15:06:47Z both point at the
# same parent. A `mkdir`-based lock is used (not `flock`, which macOS does
# not ship) — mkdir is atomic on every POSIX filesystem this hook runs on.
#
# KNOWN LIMITATION (2026-07-16, security-auditor + code-auditor review):
# this only serializes audit-log.sh against itself. core/scripts/
# session-rollback.sh and rotate-audit-log.sh also append to this same log
# with a different, non-chained entry format and no lock — a separate,
# pre-existing bug this fix does not touch.
LOCK_DIR="$STATE_DIR/.audit-log.lockdir"
_audit_lock_acquired=0

_release_audit_lock() {
  [[ "$_audit_lock_acquired" == "1" ]] && rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap _release_audit_lock EXIT

# Staleness recovery: SIGKILL (e.g. hook-timeout-guard.sh's 30s kill) cannot
# be trapped, so a holder killed mid-critical-section would otherwise orphan
# this directory forever — every future call would then spin out the ~1s
# wait below and log unlocked, permanently, with nothing surfacing it. A
# lock directory older than 5s is contention that has already run far past
# the ~1s max wait every honest holder uses, so it's dead, not busy.
if [[ -d "$LOCK_DIR" ]]; then
  LOCK_MTIME=$(stat -f '%m' "$LOCK_DIR" 2>/dev/null || stat -c '%Y' "$LOCK_DIR" 2>/dev/null || echo "")
  if [[ -n "$LOCK_MTIME" ]]; then
    LOCK_AGE=$(( $(date +%s) - LOCK_MTIME ))
    [[ $LOCK_AGE -ge 5 ]] && rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
fi

_tries=0
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  _tries=$((_tries + 1))
  # Heavy contention (or a lock that just became stale mid-check above) —
  # after ~1s, proceed unlocked rather than hang this tool call forever.
  # This narrows the original race to this one degraded entry; it is
  # marked below so it stays distinguishable from a normally-serialized
  # one, per this directory's own "fail/warn loudly" rule.
  if [[ $_tries -ge 50 ]]; then
    break
  fi
  sleep 0.02
done

DEGRADED="false"
if [[ $_tries -lt 50 ]]; then
  _audit_lock_acquired=1
else
  DEGRADED="true"
  echo "[audit-log] WARN: lock contention timeout after ~1s — this entry is logged unlocked (degraded chain-linearity guarantee for this one append only)" >&2
fi

# ── Hash chaining ─────────────────────────────────────────────────────────────
PREV_HASH=$(tail -1 "$LOG_FILE" 2>/dev/null | jq -r '.hash // ""' 2>/dev/null || true)
[[ -z "$PREV_HASH" ]] && PREV_HASH="$GENESIS_HASH"

CONTENT="${TIMESTAMP}|audit-log|${TOOL_NAME}|${AGENT_NAME}|${INPUT_SAFE}|allow"
HASH=$(printf '%s|%s' "$CONTENT" "$PREV_HASH" | "${SHA256[@]}" | awk '{print $1}')

# ── Write JSONL entry ─────────────────────────────────────────────────────────
# "degraded" is informational only — deliberately excluded from CONTENT/HASH
# so it doesn't change the verified hash-chain contract; verify-audit-chain.sh
# reconstructs CONTENT from named fields and ignores unknown keys.
jq -cn \
  --arg ts        "$TIMESTAMP" \
  --arg hook      "audit-log" \
  --arg tool      "$TOOL_NAME" \
  --arg agent     "$AGENT_NAME" \
  --arg input     "$INPUT_SAFE" \
  --arg decision  "allow" \
  --arg prev_hash "$PREV_HASH" \
  --arg hash      "$HASH" \
  --argjson degraded "$DEGRADED" \
  '{ts:$ts,hook:$hook,tool:$tool,agent:$agent,input:$input,decision:$decision,prev_hash:$prev_hash,hash:$hash,degraded:$degraded}' \
  >> "$LOG_FILE"

exit 0
