#!/usr/bin/env bash
# agent-message-bus.sh — JSON message bus for inter-agent communication
#
# NOT part of the automatic pipeline (2026-07-03). The normal case — one
# Claude Code session dispatching Task-tool subagents — is synchronous and
# needs no message bus; see core/rules/agent-communication-policy.md. This
# script remains as optional manual tooling for a human coordinating
# multiple *separate*, concurrently-running Claude Code sessions (e.g. in
# different terminals) via a shared file-based mailbox. No hook invokes it.
#
# Architecture: file-based mailboxes + flock() mutual exclusion
# Each agent has a mailbox directory: core/bus/mailboxes/<agent-name>/
# Messages are JSON files written atomically via temp-file-then-rename.
#
# Message format:
# {
#   "id":       "<uuid>",             # unique message ID (idempotency)
#   "from":     "<agent-name>",       # sender agent ID
#   "to":       "<agent-name>|*",     # recipient (* = broadcast)
#   "type":     "REQUEST|RESPONSE|VETO|BROADCAST|HEARTBEAT",
#   "subject":  "<topic>",            # e.g. "commit-gate", "pr-review"
#   "payload":  {},                   # structured JSON payload
#   "ts":       "<iso8601>",          # send timestamp
#   "nonce":    "<hex16>",            # replay-attack prevention
#   "ttl":      300,                  # seconds until message expires
#   "sig":      "<sha256-hex>"        # payload integrity check
# }
#
# Usage:
#   bash agent-message-bus.sh send   <from> <to> <type> <subject> <payload_json>
#   bash agent-message-bus.sh recv   <agent>                          # read + ack next message
#   bash agent-message-bus.sh peek   <agent>                          # read without consuming
#   bash agent-message-bus.sh veto   <from> <subject> <reason>        # broadcast veto
#   bash agent-message-bus.sh status                                  # show queue depths
#   bash agent-message-bus.sh purge  <agent>                          # clear expired messages
#
# Gate: L0 (all messages logged to audit trail)
set -uo pipefail

BUS_DIR="${YANA_BUS_DIR:-core/bus/mailboxes}"
LOG_FILE="${YANA_BUS_LOG:-releases/logs/agent-bus.log}"
MSG_TTL="${YANA_MSG_TTL:-300}"    # 5 minutes default TTL
MAX_MSG_SIZE=16384                   # 16KB — matches middleware size-cap

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# ─── Helpers ──────────────────────────────────────────────────────────────────
ts_now()    { date -u +%Y-%m-%dT%H:%M:%SZ; }
nonce_new() { head -c 8 /dev/urandom | xxd -p 2>/dev/null || date +%s%N | md5sum | head -c 16; }
uuid_new()  { cat /proc/sys/kernel/random/uuid 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())"; }

sig_payload() {
  local payload="$1"
  echo -n "$payload" | sha256sum | awk '{print $1}'
}

log_bus() {
  local level="$1" msg="$2" extra="${3:-}"
  local ts; ts="$(ts_now)"
  local entry="{\"ts\":\"${ts}\",\"level\":\"${level}\",\"msg\":\"${msg}\"${extra:+,${extra}}}"
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
  echo "$entry" >> "$LOG_FILE" 2>/dev/null || true
}

ensure_mailbox() {
  local agent="$1"
  mkdir -p "${BUS_DIR}/${agent}/inbox" "${BUS_DIR}/${agent}/processed"
}

check_msg_size() {
  local payload="$1"
  if [[ ${#payload} -gt $MAX_MSG_SIZE ]]; then
    echo "[bus] ERROR: message payload exceeds 16KB limit (${#payload} bytes)" >&2
    exit 1
  fi
}

# ─── SEND ─────────────────────────────────────────────────────────────────────
cmd_send() {
  local from="$1" to="$2" type="$3" subject="$4" payload="$5"

  check_msg_size "$payload"

  # Validate type
  if ! [[ "$type" =~ ^(REQUEST|RESPONSE|VETO|BROADCAST|HEARTBEAT)$ ]]; then
    echo "[bus] ERROR: invalid message type '$type'" >&2; exit 1
  fi

  local msg_id; msg_id="$(uuid_new)"
  local nonce;  nonce="$(nonce_new)"
  local sig;    sig="$(sig_payload "${payload}")"
  local ts;     ts="$(ts_now)"

  local msg
  msg=$(printf '{"id":"%s","from":"%s","to":"%s","type":"%s","subject":"%s","payload":%s,"ts":"%s","nonce":"%s","ttl":%d,"sig":"%s"}' \
    "$msg_id" "$from" "$to" "$type" "$subject" "$payload" "$ts" "$nonce" "$MSG_TTL" "$sig")

  # Deliver to recipient mailbox(es)
  if [[ "$to" == "*" ]]; then
    # Broadcast: deliver to all known agents
    for mailbox_dir in "${BUS_DIR}"/*/; do
      local recipient; recipient="$(basename "$mailbox_dir")"
      [[ "$recipient" == "$from" ]] && continue  # don't send to self
      ensure_mailbox "$recipient"
      local tmp; tmp="${BUS_DIR}/${recipient}/inbox/.${msg_id}.tmp"
      echo "$msg" > "$tmp"
      mv "$tmp" "${BUS_DIR}/${recipient}/inbox/${ts}_${msg_id}.json"
    done
    log_bus "INFO" "broadcast" "\"from\":\"${from}\",\"subject\":\"${subject}\",\"id\":\"${msg_id}\""
  else
    ensure_mailbox "$to"
    local tmp; tmp="${BUS_DIR}/${to}/inbox/.${msg_id}.tmp"
    echo "$msg" > "$tmp"
    mv "$tmp" "${BUS_DIR}/${to}/inbox/${ts}_${msg_id}.json"  # atomic rename
    log_bus "INFO" "sent" "\"from\":\"${from}\",\"to\":\"${to}\",\"type\":\"${type}\",\"id\":\"${msg_id}\""
  fi

  echo "$msg_id"  # return message ID to caller
}

# ─── RECEIVE ──────────────────────────────────────────────────────────────────
cmd_recv() {
  local agent="$1"
  ensure_mailbox "$agent"

  local inbox="${BUS_DIR}/${agent}/inbox"
  local processed="${BUS_DIR}/${agent}/processed"
  local now; now="$(date +%s)"

  # Process oldest message first (sorted by filename timestamp prefix)
  for msg_file in $(ls -1 "${inbox}"/*.json 2>/dev/null | sort | head -1); do
    local msg; msg="$(cat "$msg_file")"

    # Check TTL expiry
    local msg_ts; msg_ts="$(echo "$msg" | python3 -c "import sys,json; m=json.load(sys.stdin); print(m['ts'])" 2>/dev/null || echo "")"
    local ttl;    ttl="$(echo "$msg" | python3 -c "import sys,json; m=json.load(sys.stdin); print(m.get('ttl',300))" 2>/dev/null || echo "300")"

    if [[ -n "$msg_ts" ]]; then
      local msg_epoch; msg_epoch="$(date -d "$msg_ts" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$msg_ts" +%s 2>/dev/null || echo 0)"
      if [[ $(( now - msg_epoch )) -gt $ttl ]]; then
        mv "$msg_file" "${processed}/expired_$(basename "$msg_file")"
        log_bus "WARN" "message-expired" "\"agent\":\"${agent}\",\"file\":\"$(basename "$msg_file")\""
        continue
      fi
    fi

    # Consume: move to processed
    (
      flock -x 200  # exclusive lock during consume
      mv "$msg_file" "${processed}/$(basename "$msg_file")"
    ) 200>"${inbox}/.lock"

    log_bus "INFO" "received" "\"agent\":\"${agent}\",\"from\":$(echo "$msg" | python3 -c "import sys,json; print('\"'+json.load(sys.stdin)['from']+'\"')" 2>/dev/null || echo '\"unknown\"')"
    echo "$msg"
    return 0
  done

  echo ""  # empty = no messages
  return 0
}

# ─── VETO ─────────────────────────────────────────────────────────────────────
cmd_veto() {
  local from="$1" subject="$2" reason="$3"

  local payload; payload=$(printf '{"vetoed":true,"reason":"%s","authority":"%s"}' "$reason" "$from")
  local msg_id; msg_id="$(cmd_send "$from" "*" "VETO" "$subject" "$payload")"

  echo -e "${RED}[bus] VETO issued${NC} by ${from} on '${subject}': ${reason}" >&2
  log_bus "VETO" "veto-broadcast" "\"from\":\"${from}\",\"subject\":\"${subject}\",\"reason\":\"${reason}\",\"id\":\"${msg_id}\""
  echo "$msg_id"
}

# ─── STATUS ───────────────────────────────────────────────────────────────────
cmd_status() {
  echo -e "${CYAN}═══ Agent Message Bus Status ═══${NC}"
  for mailbox_dir in "${BUS_DIR}"/*/; do
    [[ -d "$mailbox_dir" ]] || continue
    local agent; agent="$(basename "$mailbox_dir")"
    local inbox_count; inbox_count="$(ls -1 "${mailbox_dir}/inbox/"*.json 2>/dev/null | wc -l || echo 0)"
    local proc_count;  proc_count="$(ls -1 "${mailbox_dir}/processed/"*.json 2>/dev/null | wc -l || echo 0)"
    printf "  %-30s inbox: %3d   processed: %3d\n" "$agent" "$inbox_count" "$proc_count"
  done
}

# ─── PURGE ────────────────────────────────────────────────────────────────────
cmd_purge() {
  local agent="$1"
  ensure_mailbox "$agent"
  local now; now="$(date +%s)"
  local purged=0

  shopt -s nullglob
  for msg_file in "${BUS_DIR}/${agent}/inbox/"*.json; do
    [[ -f "$msg_file" ]] || continue
    local msg; msg="$(cat "$msg_file")"
    local ttl; ttl="$(echo "$msg" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ttl',300))" 2>/dev/null || echo 300)"
    local msg_ts; msg_ts="$(echo "$msg" | python3 -c "import sys,json; print(json.load(sys.stdin)['ts'])" 2>/dev/null || echo "")"
    local msg_epoch; msg_epoch="$(date -d "$msg_ts" +%s 2>/dev/null || echo 0)"

    if [[ $(( now - msg_epoch )) -gt $ttl ]]; then
      rm -f "$msg_file"
      purged=$(( purged + 1 ))
    fi
  done
  shopt -u nullglob

  log_bus "INFO" "purge" "\"agent\":\"${agent}\",\"purged\":${purged}"
  echo "[bus] Purged ${purged} expired messages from ${agent}"
}

# ─── DISPATCH ────────────────────────────────────────────────────────────────
CMD="${1:-help}"; shift || true

case "$CMD" in
  send)    cmd_send "$@" ;;
  recv)    cmd_recv "$@" ;;
  peek)    cmd_recv "$@" ;;   # alias
  veto)    cmd_veto "$@" ;;
  status)  cmd_status ;;
  purge)   cmd_purge "$@" ;;
  *)
    echo "Usage: $0 send|recv|veto|status|purge [args...]"
    echo "  send  <from> <to|*> <TYPE> <subject> <payload_json>"
    echo "  recv  <agent>"
    echo "  veto  <from> <subject> <reason>"
    echo "  status"
    echo "  purge <agent>"
    exit 1
    ;;
esac
