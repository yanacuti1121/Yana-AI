#!/usr/bin/env bash
# multi-agent-launch.sh — Bật nhiều agents song song có kiểm soát
#
# Usage:
#   bash multi-agent-launch.sh start  --agents "scanner,auditor,qa" --concurrency 4
#   bash multi-agent-launch.sh status
#   bash multi-agent-launch.sh kill   [agent_name|all]
#   bash multi-agent-launch.sh log    [agent_name]
#
# Concurrency model:
#   - Tối đa N agents chạy đồng thời (default: 4, max: 16)
#   - Queue tự động: agent thứ N+1 chờ slot trống
#   - Kill switch: dừng tất cả ngay lập tức
#   - Mỗi agent có log riêng + exit code tracking
#
# Safety gates inherited from YAMTAM:
#   - Mỗi agent vẫn đi qua L1-L9 safety gates
#   - security-team agent có veto power
#   - Budget sentinel: cảnh báo nếu tổng cost vượt ngưỡng

set -uo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
MAX_CONCURRENCY=16
DEFAULT_CONCURRENCY=4
STATE_DIR="${YAMTAM_AGENT_STATE:-/tmp/yamtam-agents}"
LOG_DIR="${YAMTAM_AGENT_LOGS:-/tmp/yamtam-agent-logs}"
PID_DIR="${STATE_DIR}/pids"
REGISTRY="${STATE_DIR}/registry.json"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

# ─── Init ─────────────────────────────────────────────────────────────────────
init_dirs() {
  mkdir -p "$STATE_DIR" "$LOG_DIR" "$PID_DIR"
  [[ -f "$REGISTRY" ]] || echo '{"agents":{}}' > "$REGISTRY"
}

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# ─── Registry helpers ─────────────────────────────────────────────────────────
reg_set() {
  local name="$1" field="$2" val="$3"
  local tmp; tmp="$(mktemp)"
  # dùng sed đơn giản để tránh phụ thuộc jq
  python3 -c "
import json,sys
d=json.load(open('$REGISTRY'))
d['agents'].setdefault('$name',{})['$field']='$val'
json.dump(d,open('$REGISTRY','w'),indent=2)
" 2>/dev/null || true
}

reg_get() {
  local name="$1" field="$2"
  python3 -c "
import json
d=json.load(open('$REGISTRY'))
print(d.get('agents',{}).get('$name',{}).get('$field',''))
" 2>/dev/null
}

reg_all() {
  python3 -c "
import json
d=json.load(open('$REGISTRY'))
for name,info in d.get('agents',{}).items():
    status=info.get('status','?')
    pid=info.get('pid','')
    started=info.get('started','')
    task=info.get('task','')
    print(f'{name}|{status}|{pid}|{started}|{task}')
" 2>/dev/null
}

running_count() {
  local count=0
  while IFS='|' read -r name status pid _ _; do
    [[ "$status" == "running" ]] && kill -0 "$pid" 2>/dev/null && ((count++)) || true
  done < <(reg_all)
  echo "$count"
}

# ─── Spawn một agent ──────────────────────────────────────────────────────────
spawn_agent() {
  local name="$1" task="${2:-$name}" log="$LOG_DIR/${name}.log"

  echo -e "${CYAN}[LAUNCH]${NC} ${BOLD}${name}${NC} → ${DIM}${task}${NC}"

  # Script thực thi của agent (nếu có file riêng trong core/agents/)
  local agent_script="core/agents/${name}/run.sh"
  local cmd
  if [[ -f "$agent_script" ]]; then
    cmd="bash $agent_script"
  else
    # Fallback: chạy qua safe-run.sh với task description
    cmd="bash core/scripts/safe-run.sh echo '[${name}] running: ${task}'"
  fi

  # Chạy nền, redirect output ra log
  eval "$cmd" >> "$log" 2>&1 &
  local pid=$!

  reg_set "$name" "pid"     "$pid"
  reg_set "$name" "status"  "running"
  reg_set "$name" "started" "$(ts)"
  reg_set "$name" "task"    "$task"
  reg_set "$name" "log"     "$log"

  echo "$pid" > "$PID_DIR/${name}.pid"
  echo -e "  ${DIM}PID ${pid} · log: ${log}${NC}"
}

# ─── CMD: start ───────────────────────────────────────────────────────────────
cmd_start() {
  local agents_raw="" concurrency=$DEFAULT_CONCURRENCY tasks_file=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --agents)      agents_raw="$2";   shift 2 ;;
      --concurrency) concurrency="$2";  shift 2 ;;
      --tasks-file)  tasks_file="$2";   shift 2 ;;
      *) shift ;;
    esac
  done

  [[ $concurrency -gt $MAX_CONCURRENCY ]] && concurrency=$MAX_CONCURRENCY
  init_dirs

  # Build danh sách agents
  local -a agent_list=()
  if [[ -n "$tasks_file" && -f "$tasks_file" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && agent_list+=("$line")
    done < "$tasks_file"
  elif [[ -n "$agents_raw" ]]; then
    IFS=',' read -ra agent_list <<< "$agents_raw"
  else
    echo -e "${RED}[ERROR]${NC} Cần --agents hoặc --tasks-file" >&2
    return 1
  fi

  local total=${#agent_list[@]}
  echo -e "${BOLD}═══ YAMTAM Multi-Agent Launcher ═══${NC}"
  echo -e "  Agents     : ${BOLD}${total}${NC}"
  echo -e "  Concurrency: ${BOLD}${concurrency}${NC} (tối đa chạy song song)"
  echo -e "  Kill switch: ${DIM}bash multi-agent-launch.sh kill all${NC}"
  echo ""

  local launched=0
  for entry in "${agent_list[@]}"; do
    local name task
    name="$(echo "$entry" | cut -d: -f1 | tr -d ' ')"
    task="$(echo "$entry" | cut -d: -f2- | sed 's/^ *//')"
    [[ "$task" == "$name" ]] && task="$name"

    # Chờ nếu đang đủ concurrency
    while [[ $(running_count) -ge $concurrency ]]; do
      echo -e "  ${YELLOW}[QUEUE]${NC} ${name} chờ slot... (${concurrency} agents đang chạy)"
      sleep 2
    done

    spawn_agent "$name" "$task"
    ((launched++))
  done

  echo ""
  echo -e "${GREEN}[OK]${NC} Đã launch ${launched}/${total} agents"
  echo -e "     → Xem trạng thái: ${DIM}bash multi-agent-launch.sh status${NC}"
}

# ─── CMD: status ──────────────────────────────────────────────────────────────
cmd_status() {
  init_dirs
  echo -e "${BOLD}═══ Agent Status ═══${NC}"
  printf "  %-22s %-10s %-8s %s\n" "NAME" "STATUS" "PID" "STARTED"
  printf "  %-22s %-10s %-8s %s\n" "----" "------" "---" "-------"

  local running=0 done_count=0 failed=0

  while IFS='|' read -r name status pid started task; do
    # Kiểm tra PID còn sống không
    local real_status="$status"
    if [[ "$status" == "running" ]]; then
      if kill -0 "$pid" 2>/dev/null; then
        real_status="${GREEN}running${NC}"
        ((running++))
      else
        real_status="${DIM}done${NC}"
        reg_set "$name" "status" "done"
        ((done_count++))
      fi
    elif [[ "$status" == "killed" ]]; then
      real_status="${RED}killed${NC}"
    else
      real_status="${DIM}${status}${NC}"
      ((done_count++))
    fi

    printf "  %-22s " "$name"
    echo -ne "$real_status"
    printf "%-0s  %-8s %s\n" "" "$pid" "$started"
  done < <(reg_all)

  echo ""
  echo -e "  Running: ${GREEN}${running}${NC} · Done: ${DIM}${done_count}${NC} · Failed: ${RED}${failed}${NC}"
}

# ─── CMD: kill ────────────────────────────────────────────────────────────────
cmd_kill() {
  local target="${1:-all}"
  init_dirs

  if [[ "$target" == "all" ]]; then
    echo -e "${RED}[KILL ALL]${NC} Dừng tất cả agents..."
    while IFS='|' read -r name status pid _ _; do
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        kill -TERM "$pid" 2>/dev/null && echo -e "  ${RED}✗${NC} ${name} (PID ${pid}) killed"
        reg_set "$name" "status" "killed"
      fi
    done < <(reg_all)
    # Xóa toàn bộ state
    rm -f "$PID_DIR"/*.pid
    echo -e "${RED}[DONE]${NC} Đã dừng tất cả agents"
  else
    local pid; pid="$(reg_get "$target" "pid")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null
      reg_set "$target" "status" "killed"
      rm -f "$PID_DIR/${target}.pid"
      echo -e "${RED}[KILL]${NC} ${target} (PID ${pid}) stopped"
    else
      echo -e "${YELLOW}[WARN]${NC} ${target} không đang chạy"
    fi
  fi
}

# ─── CMD: log ─────────────────────────────────────────────────────────────────
cmd_log() {
  local name="${1:-}"
  init_dirs
  if [[ -z "$name" ]]; then
    echo "Usage: multi-agent-launch.sh log <agent_name>"
    return 1
  fi
  local log="$LOG_DIR/${name}.log"
  if [[ -f "$log" ]]; then
    echo -e "${CYAN}═══ Log: ${name} ═══${NC}"
    tail -50 "$log"
  else
    echo -e "${YELLOW}[WARN]${NC} Chưa có log cho ${name}"
  fi
}

# ─── CMD: help ────────────────────────────────────────────────────────────────
cmd_help() {
  echo -e "${BOLD}multi-agent-launch.sh${NC} — YAMTAM parallel agent launcher"
  echo ""
  echo "  start  --agents 'a,b,c' [--concurrency N]   Bật agents song song"
  echo "  start  --tasks-file tasks.txt               Đọc danh sách từ file"
  echo "  status                                       Xem trạng thái tất cả"
  echo "  kill   [agent_name|all]                      Dừng agent hoặc tất cả"
  echo "  log    <agent_name>                          Xem log của agent"
  echo ""
  echo "Ví dụ:"
  echo "  bash core/scripts/multi-agent-launch.sh start --agents 'scanner,auditor,qa-team' --concurrency 3"
  echo "  bash core/scripts/multi-agent-launch.sh status"
  echo "  bash core/scripts/multi-agent-launch.sh kill scanner"
  echo "  bash core/scripts/multi-agent-launch.sh kill all"
}

# ─── Router ──────────────────────────────────────────────────────────────────
CMD="${1:-help}"
shift 2>/dev/null || true

case "$CMD" in
  start)  cmd_start  "$@" ;;
  status) cmd_status "$@" ;;
  kill)   cmd_kill   "$@" ;;
  log)    cmd_log    "$@" ;;
  help|*) cmd_help       ;;
esac
