#!/usr/bin/env bash
# multi-agent-launch.sh, Bật nhiều agents song song có kiểm soát
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
# Safety gates inherited from Yana AI:
#   - Mỗi agent vẫn đi qua L1-L9 safety gates
#   - security-team agent có veto power
#   - Budget sentinel: cảnh báo nếu tổng cost vượt ngưỡng

set -uo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
MAX_CONCURRENCY=16
DEFAULT_CONCURRENCY=4
STATE_DIR="${YANA_AGENT_STATE:-/tmp/yana-ai-agents}"
LOG_DIR="${YANA_AGENT_LOGS:-/tmp/yana-ai-agent-logs}"
PID_DIR="${STATE_DIR}/pids"
REGISTRY="${STATE_DIR}/registry.json"
EXIT_DIR="${STATE_DIR}/exitcodes"
STALE_SECONDS="${YANA_AGENT_STALE_SECONDS:-30}"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

# ─── Init ─────────────────────────────────────────────────────────────────────
init_dirs() {
  mkdir -p "$STATE_DIR" "$LOG_DIR" "$PID_DIR" "$EXIT_DIR"
  [[ -f "$REGISTRY" ]] || echo '{"agents":{}}' > "$REGISTRY"
}

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# mtime của 1 file, giây kể từ epoch, portable Linux (GNU stat) + macOS (BSD stat)
file_mtime() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null
}

# code-auditor 2026-07-06: validate_name() dùng chung cho mọi lệnh xây
# đường dẫn từ 1 tên agent (start/kill/log). Trước đây chỉ cmd_start tự
# kiểm tra riêng, nên cmd_log vẫn nhận thẳng "../../../etc/passwd" kiểu
# tên rồi đọc file bất kỳ trên máy ra màn hình (đã tái hiện thật). Gọi
# hàm này ở đầu mọi lệnh nhận tên agent làm tham số, không lặp lại logic.
validate_name() {
  [[ "$1" =~ ^[A-Za-z0-9_-]+$ ]]
}

# ─── Registry helpers ─────────────────────────────────────────────────────────
# security-auditor 2026-07-06: name/val trước đây bị nhét thẳng vào chuỗi mã
# nguồn Python rồi eval qua `python3 -c "..."`, một dấu nháy đơn trong val
# (task mô tả tự do, không bị allowlist chặn) thoát ra khỏi chuỗi Python và
# chạy os.system(...) tuỳ ý. Giờ truyền qua sys.argv, không còn ghép chuỗi
# mã nguồn từ dữ liệu chưa kiểm soát nữa.
reg_set() {
  local name="$1" field="$2" val="$3"
  python3 -c "
import json,sys
name, field, val = sys.argv[1], sys.argv[2], sys.argv[3]
d=json.load(open('$REGISTRY'))
d['agents'].setdefault(name,{})[field]=val
json.dump(d,open('$REGISTRY','w'),indent=2)
" "$name" "$field" "$val" 2>/dev/null || true
}

reg_get() {
  local name="$1" field="$2"
  python3 -c "
import json,sys
name, field = sys.argv[1], sys.argv[2]
d=json.load(open('$REGISTRY'))
print(d.get('agents',{}).get(name,{}).get(field,''))
" "$name" "$field" 2>/dev/null
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
  # security-auditor 2026-07-06: khai báo gộp "local name=$1 task=${2:-$name}"
  # tra $name TRƯỚC KHI chính local statement này gán nó xong, dưới `set -u`
  # không có biến `name` sẵn có ngoài scope thì lỗi "unbound variable" ngay.
  # Tách riêng từng dòng để task luôn tham chiếu đúng giá trị đã gán.
  local name="$1"
  local task="${2:-$name}"
  local log="$LOG_DIR/${name}.log"

  echo -e "${CYAN}[LAUNCH]${NC} ${BOLD}${name}${NC} → ${DIM}${task}${NC}"

  # security-auditor 2026-07-06 (2 vòng review): chuỗi + eval là kiến trúc
  # không thể vá hết bằng escape, dù escape đúng cho 1 lần eval thì:
  # (a) task chảy qua safe-run.sh, mà chính safe-run.sh cũng tự làm
  #     COMMAND="$*"; eval "$COMMAND" bên trong nó, một lần eval thứ 2,
  #     tách token lại từ đầu, escape cho lần 1 không sống sót qua lần 2,
  #     backtick/$(...) chạy được (tái hiện thật, 2 lần, có marker file).
  # (b) cùng $task đó còn bị ghi nguyên văn (không escape) vào registry
  #     qua reg_set, và reg_set cũ nhét thẳng vào mã nguồn Python rồi
  #     python3 -c "...", dấu nháy đơn thoát khỏi chuỗi Python, chạy
  #     os.system(...) tuỳ ý, không cần qua eval/safe-run.sh gì cả.
  # Fix thật: không dựng chuỗi lệnh rồi eval nữa. Mảng argv + exec trực
  # tiếp, không có bước "ghép lại thành 1 chuỗi rồi phân tách lại" nào để
  # ký tự đặc biệt sống sót qua. Nhánh fallback cũng bỏ luôn safe-run.sh
  # (nó chỉ in 1 dòng trạng thái, không cần đi qua danh sách chặn lệnh
  # phá hoại của safe-run.sh, và route qua đó chính là chỗ bị khai thác).
  local agent_script="core/agents/${name}/run.sh"
  local -a cmd_array
  if [[ -f "$agent_script" ]]; then
    cmd_array=(bash "$agent_script")
  else
    cmd_array=(echo "[${name}] running: ${task}")
  fi

  # security-auditor 2026-07-06: xóa exit file cũ của lần chạy trước cùng
  # tên trước khi background lệnh mới. Không xóa thì nếu lần chạy này chết
  # theo cách không kịp tự ghi exit code (SIGKILL, OOM), cmd_status sẽ đọc
  # nhầm exit file CŨ và báo sai trạng thái của lần chạy MỚI.
  rm -f "$EXIT_DIR/${name}.exit"

  # Chạy nền trong 1 subshell wrapper: lệnh thật là con trực tiếp của subshell
  # này (để `wait` bên trong hoạt động đúng), và subshell forward SIGTERM
  # xuống lệnh thật khi cmd_kill gửi tín hiệu tới $pid (PID trả về là của
  # subshell, không phải của lệnh thật, nếu không forward, kill sẽ chỉ dừng
  # wrapper mà để lệnh thật chạy mồ côi, làm hỏng kill switch hiện có).
  (
    trap 'kill -TERM "$child_pid" 2>/dev/null' TERM
    "${cmd_array[@]}" >> "$log" 2>&1 &
    child_pid=$!
    wait "$child_pid"
    echo $? > "$EXIT_DIR/${name}.exit"
  ) &
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
  echo -e "${BOLD}═══ Yana AI Multi-Agent Launcher ═══${NC}"
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

    # security-auditor 2026-07-06: $name đi thẳng vào đường dẫn file
    # (log/pid/exit), không chặn ở đây thì "../escaped" ghi file ra ngoài
    # STATE_DIR/LOG_DIR. Chặn cứng trước khi name chạm vào bất kỳ đường
    # dẫn nào phía sau, dùng chung validate_name() với kill/log.
    if ! validate_name "$name"; then
      echo -e "  ${RED}[REJECT]${NC} '${name}' không hợp lệ (chỉ cho phép chữ/số/_/-), bỏ qua entry này" >&2
      continue
    fi

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
        # Còn sống, phân biệt "working" (log vừa cập nhật) với "blocked"
        # (log đứng im quá STALE_SECONDS dù process vẫn chạy, nghi kẹt/chờ).
        local log="$LOG_DIR/${name}.log" now mtime age
        now="$(date +%s)"
        mtime="$(file_mtime "$log" 2>/dev/null || echo "$now")"
        age=$((now - mtime))
        if [[ $age -gt $STALE_SECONDS ]]; then
          real_status="${YELLOW}blocked${NC}"
        else
          real_status="${GREEN}working${NC}"
        fi
        ((running++))
      else
        # Vừa chết, đọc exit code thật để phân biệt done (0) / failed (khác 0).
        # security-auditor 2026-07-06: file exit KHÔNG tồn tại (SIGKILL, OOM,
        # crash trước khi wrapper kịp tự ghi) trước đây bị mặc định coi là
        # "done", báo sai một agent bị giết chết thành công. Giờ tách riêng
        # thành "unknown" thay vì âm thầm báo thành công.
        local exit_file="$EXIT_DIR/${name}.exit"
        if [[ ! -f "$exit_file" ]]; then
          real_status="${RED}unknown${NC}"
          reg_set "$name" "status" "unknown"
          ((failed++))
        else
          local exitcode; exitcode="$(cat "$exit_file" 2>/dev/null || echo "")"
          if [[ -n "$exitcode" && "$exitcode" != "0" ]]; then
            real_status="${RED}failed${NC}"
            reg_set "$name" "status" "failed"
            ((failed++))
          else
            real_status="${DIM}done${NC}"
            reg_set "$name" "status" "done"
            ((done_count++))
          fi
        fi
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
    # code-auditor 2026-07-06: $target xây đường dẫn "$PID_DIR/${target}.pid"
    # phía dưới. Không exploit độc lập được hôm nay (reg_get trả rỗng nếu
    # registry chưa có target đó), nhưng vẫn chặn cứng cho chắc, phòng khi
    # registry.json bị sửa tay/hỏng dữ liệu sau này.
    if ! validate_name "$target"; then
      echo -e "${RED}[REJECT]${NC} '${target}' không hợp lệ (chỉ cho phép chữ/số/_/-)" >&2
      return 1
    fi
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
  # code-auditor 2026-07-06: real, precondition-free arbitrary-file-read
  # found here in review: "log ../../../../etc/passwd"-shaped names read
  # any file on disk ending in ".log" straight to stdout, no registry
  # entry required first (unlike kill's target, this runs unconditionally).
  if ! validate_name "$name"; then
    echo -e "${RED}[REJECT]${NC} '${name}' không hợp lệ (chỉ cho phép chữ/số/_/-)" >&2
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
  echo -e "${BOLD}multi-agent-launch.sh${NC}, Yana AI parallel agent launcher"
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
