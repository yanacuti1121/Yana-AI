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

# Escape a literal path for safe embedding in a POSIX-ERE pattern (bash's
# `=~`) — every ERE metacharacter, backslash first so it doesn't double-
# escape characters inserted by the later substitutions.
escape_for_regex() {
  printf '%s' "$1" | sed -e 's/[][\.\*^$()+?{|\\]/\\&/g'
}

# True if the argument contains an unescaped ERE metacharacter — the
# signal for "caller wrote this as a regex on purpose," used instead of
# filesystem existence (see the Safety-fix comment at the call site for
# why existence was the wrong signal). An ordinary repo-relative path
# segment (letters, digits, ., -, _, /) never trips this; a deliberate
# pattern like "^core/hooks/.*\.sh$" always does.
looks_like_regex() {
  case "$1" in
    *[\^\$\*\+\?\|\(\)\[\]\{\}]*) return 0 ;;
    *) return 1 ;;
  esac
}

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
STATE_FILE="$STATE_DIR/FREEZE_SCOPE"
ACTION="${1:-status}"

case "$ACTION" in
  set)
    if [[ $# -lt 2 ]]; then
      echo "Usage: $0 set <path-or-pattern> [path-or-pattern...]" >&2
      echo "  A real directory  -> restricted to everything under it (legacy /freeze behavior)" >&2
      echo "  A real file       -> restricted to exactly that file" >&2
      echo "  Anything else     -> treated as a literal POSIX-ERE regex pattern" >&2
      exit 2
    fi
    PATTERNS=()
    for ARG in "${@:2}"; do
      case "$ARG" in
        /*)
          echo "Error: \"$ARG\" is an absolute path — /freeze takes project-relative paths/patterns, not absolute paths." >&2
          exit 2
          ;;
      esac
      ARG_TRIMMED="${ARG%/}"
      FOLDED=$(lexical_fold "$ARG_TRIMMED")
      case "$FOLDED" in
        ''|.|..|../*)
          echo "Error: \"$ARG\" resolves outside (or to) the project root after normalizing \"..\"/\".\" segments — refusing to freeze to a boundary that isn't actually inside this project." >&2
          exit 2
          ;;
      esac

      # Safety fix, round 1 (2026-07-19, security-auditor): the original
      # loop used filesystem EXISTENCE (-d/-f) as the literal-vs-regex
      # signal, but a not-yet-existing "FILES I WILL CREATE" file fell
      # into the unescaped/unanchored regex branch — reproduced live,
      # fixed by switching the signal to looks_like_regex() instead.
      #
      # Safety fix, round 2 (2026-07-19, code-auditor, same review cycle):
      # looks_like_regex() alone isn't enough either — a real EXISTING
      # file whose name happens to contain a metacharacter that still
      # forms a syntactically VALID regex (e.g. "core/hooks/(balanced).sh")
      # was misclassified as caller-authored, so the validator's exit-2
      # check never fires (it isn't malformed, just not what the filename
      # means) and the resulting pattern matches neither its own source
      # file nor stays anchored — reproduced live. Fix: check existence
      # FIRST as a priority override (an existing file/dir is unambiguous
      # ground truth about what the caller meant), and only fall through
      # to looks_like_regex() for arguments that don't exist on disk yet
      # — narrowing the residual "CREATE a file whose planned name also
      # looks like a regex" case rather than leaving it silently wrong.
      if [[ -d "$PROJECT_DIR/$FOLDED" ]]; then
        ESCAPED=$(escape_for_regex "$FOLDED")
        PATTERNS+=("^${ESCAPED}(/.*)?\$")
      elif [[ -e "$PROJECT_DIR/$FOLDED" ]]; then
        ESCAPED=$(escape_for_regex "$FOLDED")
        PATTERNS+=("^${ESCAPED}\$")
      elif looks_like_regex "$ARG"; then
        # Validate it compiles NOW so a typo (e.g. unbalanced parens)
        # fails loudly here, not silently on every subsequent hook
        # invocation for the rest of the session. Isolated in a separate
        # `bash -c` subprocess so a malformed pattern's failure is
        # contained to that probe process rather than this script's own
        # execution. bash's documented `[[ ]]` exit convention is 0=true,
        # 1=false, 2=evaluation/syntax error — confirmed empirically here
        # (unbalanced paren/bracket -> exit 2; any well-formed pattern,
        # matching or not -> exit 0 or 1) — so checking for exit code 2
        # specifically (not "any nonzero", which would also reject a
        # well-formed non-matching pattern) is what distinguishes
        # malformed from merely non-matching.
        bash -c '[[ "freeze-scope-regex-probe" =~ $1 ]]' _ "$ARG" >/dev/null 2>&1
        REGEX_EXIT=$?
        if [[ "$REGEX_EXIT" == "2" ]]; then
          echo "Error: \"$ARG\" is not a valid regex pattern." >&2
          exit 2
        fi
        PATTERNS+=("$ARG")
      else
        # Not-yet-existing, plain-looking path (the common "FILES I WILL
        # CREATE" case with no metacharacters in the planned name) — the
        # safe default is the narrower exact-match interpretation.
        ESCAPED=$(escape_for_regex "$FOLDED")
        PATTERNS+=("^${ESCAPED}\$")
      fi
    done

    mkdir -p "$STATE_DIR"
    jq -cn --args '$ARGS.positional' -- "${PATTERNS[@]}" > "$STATE_FILE"

    echo "🧊 FREEZE SCOPE: restricted to ${#PATTERNS[@]} pattern(s):"
    for P in "${PATTERNS[@]}"; do
      echo "  - $P"
    done
    echo ""
    echo "Write/Edit/MultiEdit outside all of these will be blocked for the"
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
      RAW=$(tr -d '\n\r' < "$STATE_FILE" 2>/dev/null || echo "")
      if [[ -z "${RAW//[[:space:]]/}" ]]; then
        echo "Freeze Scope: file exists but empty — treated as unrestricted"
      elif printf '%s' "$RAW" | jq -e 'type == "array"' >/dev/null 2>&1; then
        echo "🧊 FREEZE SCOPE: restricted to $(printf '%s' "$RAW" | jq 'length') pattern(s):"
        printf '%s' "$RAW" | jq -r '.[]' | while IFS= read -r p; do echo "  - $p"; done
      else
        scope=$(printf '%s' "$RAW" | tr -d '[:space:]')
        echo "🧊 FREEZE SCOPE (legacy format): restricted to \"$scope\""
      fi
    else
      echo "Freeze Scope: unrestricted"
    fi
    ;;
  *)
    echo "Usage: $0 {set <path-or-pattern> [path-or-pattern...]|clear|status}" >&2
    exit 2
    ;;
esac
exit 0
