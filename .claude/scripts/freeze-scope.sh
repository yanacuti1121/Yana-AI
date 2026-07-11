#!/usr/bin/env bash
# Freeze Scope toggle — Yana AI
# Session-scoped directory allow-list for Write/Edit/MultiEdit.
# Opposite semantics from code-freeze.sh (whole-project block-all): this
# restricts edits to ONLY the given directory, for a task that should never
# touch anything outside its declared area.

# Lexically fold "." and ".." segments in a slash-separated path, without
# touching the filesystem. Kept identical in intent to the same-named
# function in core/hooks/freeze-scope.sh — a scope that itself resolves
# outside the project (via a typo'd "../" or an absolute path) would
# defeat that hook's boundary check before the hook ever runs.
lexical_fold() {
  local input="$1"
  local -a out=()
  local IFS='/'
  local seg
  local n
  for seg in $input; do
    case "$seg" in
      ''|'.') continue ;;
      '..')
        # Two separate [[ ]] commands, not one "A && B" — see the same
        # fix's comment in core/hooks/freeze-scope.sh's lexical_fold()
        # for why the combined form throws under set -u on an empty array.
        n=${#out[@]}
        if [[ $n -gt 0 ]] && [[ "${out[$((n-1))]}" != '..' ]]; then
          unset "out[$((n-1))]"
        else
          out+=('..')
        fi
        ;;
      *) out+=("$seg") ;;
    esac
  done
  local IFS='/'
  echo "${out[*]}"
}

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
STATE_FILE="$STATE_DIR/FREEZE_SCOPE"
ACTION="${1:-status}"

case "$ACTION" in
  set)
    SCOPE="${2:-}"
    if [[ -z "$SCOPE" ]]; then
      echo "Usage: $0 set <directory>" >&2
      exit 2
    fi
    # Strip a trailing slash so state-file comparisons stay exact-prefix,
    # not accidentally double-slashed.
    SCOPE="${SCOPE%/}"
    case "$SCOPE" in
      /*)
        echo "Error: \"$SCOPE\" is an absolute path — /freeze takes a project-relative directory (e.g. core/rules), not an absolute path." >&2
        exit 2
        ;;
    esac
    SCOPE_FOLDED=$(lexical_fold "$SCOPE")
    case "$SCOPE_FOLDED" in
      ''|.|..|../*)
        echo "Error: \"$SCOPE\" resolves outside (or to) the project root after normalizing \"..\"/\".\" segments — refusing to freeze to a boundary that isn't actually inside this project." >&2
        exit 2
        ;;
    esac
    SCOPE="$SCOPE_FOLDED"
    if [[ ! -d "$PROJECT_DIR/$SCOPE" ]]; then
      echo "Error: \"$SCOPE\" is not a directory under $PROJECT_DIR — refusing to freeze to a path that doesn't exist (a typo here would silently block every edit)." >&2
      exit 2
    fi
    mkdir -p "$STATE_DIR"
    printf '%s' "$SCOPE" > "$STATE_FILE"
    echo "🧊 FREEZE SCOPE: restricted to \"$SCOPE\""
    echo ""
    echo "Write/Edit/MultiEdit outside this directory will be blocked for the"
    echo "rest of this session. Bash commands are not path-checked by this"
    echo "hook (see core/hooks/freeze-scope.sh's own comment on why)."
    echo ""
    echo "To lift the restriction: $0 clear"
    ;;
  clear)
    rm -f "$STATE_FILE"
    echo "✅ FREEZE SCOPE: cleared — edits allowed everywhere again"
    ;;
  status)
    if [[ -f "$STATE_FILE" ]]; then
      scope=$(tr -d '[:space:]' < "$STATE_FILE" 2>/dev/null || echo "")
      if [[ -n "$scope" ]]; then
        echo "🧊 FREEZE SCOPE: restricted to \"$scope\""
      else
        echo "Freeze Scope: file exists but empty — treated as unrestricted"
      fi
    else
      echo "Freeze Scope: unrestricted"
    fi
    ;;
  *)
    echo "Usage: $0 {set <directory>|clear|status}" >&2
    exit 2
    ;;
esac
exit 0
