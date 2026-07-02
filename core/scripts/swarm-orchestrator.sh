#!/usr/bin/env bash
# swarm-orchestrator.sh — Coordinate work across multiple Yana AI agents
#
# Consensus model:
#   - Simple majority quorum (> 50%) for general decisions
#   - Super-majority (> 66%) for irreversible actions (push, deploy, merge)
#   - Veto power: security-team can block ANY core-development action
#   - Hierarchy: security > core-development > qa-team > docs-team
#
# Usage:
#   bash swarm-orchestrator.sh request <subject> <payload_json>   # broadcast work request
#   bash swarm-orchestrator.sh vote    <agent> <msg_id> yes|no    # cast a vote
#   bash swarm-orchestrator.sh tally  <subject>                   # tally votes + enforce veto
#   bash swarm-orchestrator.sh roster                             # show active agents
#
# Gate: L1 (excessive agency — swarm cannot exceed individual agent permissions)
# Sources: hashicorp/raft, maelstrom-systems, automerge/automerge
set -uo pipefail

BUS="bash core/bus/agent-message-bus.sh"
AGENTS_DIR="core/agents"
VOTES_DIR="${YANA_VOTES_DIR:-core/bus/votes}"
LOG_FILE="${YANA_SWARM_LOG:-releases/logs/swarm.log}"
CONSENSUS_TIMEOUT="${YANA_CONSENSUS_TIMEOUT:-60}"  # seconds to wait for votes

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# ─── Agent Tier Definitions ──────────────────────────────────────────────────
# Tier 1 = highest authority (veto power). Tier 4 = advisory only.
# A lookup function, not `declare -A` — macOS ships bash 3.2 by default (no
# Homebrew bash on PATH), which predates bash 4.0's associative arrays.
# `declare -A` there fails with "invalid option" and every tier lookup below
# silently returns the unset/default fallback instead of the real tier.
agent_tier() {
  case "$1" in
    security-team)    echo 1 ;;
    core-development) echo 2 ;;
    qa-team)          echo 3 ;;
    docs-team)        echo 4 ;;
    design-team)      echo 4 ;;
    *)                echo "${2:-?}" ;;
  esac
}

# Actions requiring super-majority (> 66%)
SUPERMAJORITY_ACTIONS="push|deploy|merge|release|publish"

# Agents with veto power (can block any action regardless of vote count)
VETO_AGENTS=("security-team")

log_swarm() {
  local level="$1" msg="$2" extra="${3:-}"
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
  echo "{\"ts\":\"${ts}\",\"level\":\"${level}\",\"msg\":\"${msg}\"${extra:+,${extra}}}" >> "$LOG_FILE" 2>/dev/null || true
}

# ─── ROSTER ──────────────────────────────────────────────────────────────────
cmd_roster() {
  echo -e "${CYAN}═══ Yana AI Agent Swarm Roster ═══${NC}"
  for agent_dir in "${AGENTS_DIR}"/*/; do
    local agent; agent="$(basename "$agent_dir")"
    local tier; tier="$(agent_tier "$agent" "?")"
    local count; count="$(ls -1 "${agent_dir}"*.md 2>/dev/null | wc -l || echo 0)"
    local veto_marker=""
    for va in "${VETO_AGENTS[@]}"; do [[ "$va" == "$agent" ]] && veto_marker=" [VETO]"; done
    printf "  Tier %s  %-28s  %d agents%s\n" "$tier" "$agent" "$count" "$veto_marker"
  done
}

# ─── REQUEST ─────────────────────────────────────────────────────────────────
# Broadcast a work request to all agents and open a voting round
cmd_request() {
  local subject="$1"
  local payload="$2"
  # /proc/sys/kernel/random/uuid is Linux-only; `date +%N` and `md5sum` are
  # GNU-only, so the old fallback chain broke on macOS. `uuidgen` is native
  # on both Linux and macOS — try it before the hash-based last resort.
  local request_id
  request_id="$(cat /proc/sys/kernel/random/uuid 2>/dev/null \
    || uuidgen 2>/dev/null | tr 'A-Z' 'a-z' \
    || printf '%s' "$$-${RANDOM:-0}-$(date +%s)" | sha256sum 2>/dev/null | cut -c1-32 \
    || printf '%s' "$$-${RANDOM:-0}-$(date +%s)" | shasum -a 256 2>/dev/null | cut -c1-32)"

  mkdir -p "${VOTES_DIR}/${request_id}"
  echo "{\"subject\":\"${subject}\",\"payload\":${payload},\"opened\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
    > "${VOTES_DIR}/${request_id}/meta.json"

  # Broadcast REQUEST to all agent mailboxes
  local voted_payload; voted_payload=$(printf '{"request_id":"%s","subject":"%s","payload":%s}' "$request_id" "$subject" "$payload")
  $BUS send "swarm-orchestrator" "*" "REQUEST" "$subject" "$voted_payload"

  log_swarm "INFO" "request-opened" "\"id\":\"${request_id}\",\"subject\":\"${subject}\""
  echo -e "${CYAN}[swarm] Request opened: ${request_id}${NC}"
  echo "$request_id"
}

# ─── VOTE ────────────────────────────────────────────────────────────────────
cmd_vote() {
  local agent="$1" request_id="$2" decision="$3"  # decision: yes | no | abstain

  if ! [[ "$decision" =~ ^(yes|no|abstain)$ ]]; then
    echo "[swarm] ERROR: vote must be yes|no|abstain" >&2; exit 1
  fi

  local tier; tier="$(agent_tier "$agent" "4")"
  mkdir -p "${VOTES_DIR}/${request_id}"

  echo "{\"agent\":\"${agent}\",\"tier\":${tier},\"vote\":\"${decision}\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
    > "${VOTES_DIR}/${request_id}/${agent}.vote"

  log_swarm "INFO" "vote-cast" "\"agent\":\"${agent}\",\"decision\":\"${decision}\",\"request\":\"${request_id}\""
  echo "[swarm] Vote recorded: ${agent} → ${decision} (tier ${tier})"
}

# ─── TALLY ───────────────────────────────────────────────────────────────────
cmd_tally() {
  local subject="$1"
  local request_id=""

  # Find the open request by subject
  for meta_file in "${VOTES_DIR}"/*/meta.json; do
    local meta_subject; meta_subject="$(python3 -c "import sys,json; print(json.load(open('${meta_file}'))['subject'])" 2>/dev/null || echo "")"
    if [[ "$meta_subject" == "$subject" ]]; then
      request_id="$(basename "$(dirname "$meta_file")")"
      break
    fi
  done

  if [[ -z "$request_id" ]]; then
    echo "[swarm] ERROR: no open request for subject '${subject}'" >&2; exit 1
  fi

  echo -e "${CYAN}═══ Tally: ${subject} (${request_id}) ═══${NC}"

  local yes_count=0 no_count=0 abstain_count=0 total=0
  local veto_issued="" veto_agent=""

  for vote_file in "${VOTES_DIR}/${request_id}/"*.vote; do
    [[ -f "$vote_file" ]] || continue
    local agent; agent="$(python3 -c "import sys,json; print(json.load(open('${vote_file}'))['agent'])" 2>/dev/null || echo "unknown")"
    local vote;  vote="$(python3 -c "import sys,json; print(json.load(open('${vote_file}'))['vote'])" 2>/dev/null || echo "abstain")"
    local tier;  tier="$(python3 -c "import sys,json; print(json.load(open('${vote_file}'))['tier'])" 2>/dev/null || echo "4")"

    # Check for veto from privileged agents
    if [[ "$vote" == "no" ]]; then
      for va in "${VETO_AGENTS[@]}"; do
        if [[ "$va" == "$agent" ]]; then
          veto_issued="true"; veto_agent="$agent"
        fi
      done
    fi

    case "$vote" in
      yes)     yes_count=$(( yes_count + 1 )) ;;
      no)      no_count=$(( no_count + 1 )) ;;
      abstain) abstain_count=$(( abstain_count + 1 )) ;;
    esac
    total=$(( total + 1 ))

    printf "  %-25s Tier %s  → %s\n" "$agent" "$tier" "$vote"
  done

  echo ""
  echo "  Total: ${total}  YES: ${yes_count}  NO: ${no_count}  ABSTAIN: ${abstain_count}"

  # ── Veto check (overrides majority) ──────────────────────────────────────
  if [[ -n "$veto_issued" ]]; then
    echo -e "\n${RED}  ✗ VETO by ${veto_agent} — action BLOCKED regardless of vote count${NC}"
    $BUS veto "$veto_agent" "$subject" "security-team veto on request ${request_id}" > /dev/null
    log_swarm "VETO" "veto-enforced" "\"agent\":\"${veto_agent}\",\"subject\":\"${subject}\""
    exit 2
  fi

  if [[ $total -eq 0 ]]; then
    echo -e "${YELLOW}  ⚠ No votes cast — request pending${NC}"
    exit 1
  fi

  # ── Quorum threshold ──────────────────────────────────────────────────────
  local threshold=50
  if echo "$subject" | grep -qiE "$SUPERMAJORITY_ACTIONS"; then
    threshold=66
    echo "  (Super-majority required: ${threshold}%)"
  fi

  local pct=$(( yes_count * 100 / total ))
  echo "  Approval: ${pct}% (threshold: ${threshold}%)"

  if [[ $pct -gt $threshold ]]; then
    echo -e "\n${GREEN}  ✓ CONSENSUS REACHED — action approved${NC}"
    log_swarm "INFO" "consensus-approved" "\"subject\":\"${subject}\",\"pct\":${pct},\"threshold\":${threshold}"
    exit 0
  else
    echo -e "\n${RED}  ✗ CONSENSUS FAILED — insufficient approval${NC}"
    log_swarm "INFO" "consensus-failed" "\"subject\":\"${subject}\",\"pct\":${pct},\"threshold\":${threshold}"
    exit 1
  fi
}

# ─── DISPATCH ────────────────────────────────────────────────────────────────
CMD="${1:-help}"; shift || true

case "$CMD" in
  request) cmd_request "$@" ;;
  vote)    cmd_vote    "$@" ;;
  tally)   cmd_tally   "$@" ;;
  roster)  cmd_roster ;;
  *)
    echo "Usage: $0 request|vote|tally|roster [args...]"
    echo "  request <subject> <payload_json>          — open voting round"
    echo "  vote    <agent> <request_id> yes|no       — cast vote"
    echo "  tally   <subject>                         — count votes + enforce veto"
    echo "  roster                                    — list active agents + tiers"
    exit 1
    ;;
esac
