#!/usr/bin/env bash
# Run the release gate from a prepared, immutable self-hosted checkout.
#
# This wrapper deliberately does not fetch, switch branches, publish, deploy, or
# upload artifacts. An operator prepares a detached candidate checkout first.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash core/scripts/run-self-hosted-release-gate.sh \
  --checkout PATH --artifact-root PATH [--dry-run]

Requires a clean Git checkout in detached-HEAD state. The wrapper creates a
unique output directory below ARTIFACT_ROOT and invokes that checkout's
core/scripts/release-gate.py without diagnostic flags.

Environment:
  YANA_RELEASE_PYTHON  Python interpreter for release-gate.py (default: python3)
EOF
}

fail() {
  printf 'self-hosted release runner: %s\n' "$*" >&2
  exit 2
}

canonical_directory() {
  local directory=$1
  (
    cd "$directory"
    pwd -P
  )
}

CHECKOUT=''
ARTIFACT_ROOT=''
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --checkout)
      [[ $# -ge 2 ]] || fail '--checkout requires a path'
      CHECKOUT=$2
      shift 2
      ;;
    --artifact-root)
      [[ $# -ge 2 ]] || fail '--artifact-root requires a path'
      ARTIFACT_ROOT=$2
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[[ -n "$CHECKOUT" ]] || fail '--checkout is required'
[[ -n "$ARTIFACT_ROOT" ]] || fail '--artifact-root is required'
[[ -d "$CHECKOUT" ]] || fail "checkout directory does not exist: $CHECKOUT"

CHECKOUT=$(canonical_directory "$CHECKOUT")
if ! git -C "$CHECKOUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "checkout is not a Git worktree: $CHECKOUT"
fi

if git -C "$CHECKOUT" symbolic-ref -q HEAD >/dev/null; then
  fail "checkout must use detached HEAD, not a moving branch: $CHECKOUT"
fi

if [[ -n $(git -C "$CHECKOUT" status --porcelain) ]]; then
  fail "checkout must be clean: $CHECKOUT"
fi

GATE_SCRIPT="$CHECKOUT/core/scripts/release-gate.py"
[[ -f "$GATE_SCRIPT" ]] || fail "release gate script is missing: $GATE_SCRIPT"
[[ -d "$ARTIFACT_ROOT" ]] || fail "artifact root directory does not exist: $ARTIFACT_ROOT"

ARTIFACT_ROOT=$(canonical_directory "$ARTIFACT_ROOT")
case "$ARTIFACT_ROOT/" in
  "$CHECKOUT/"*) fail "artifact root must not be inside the candidate checkout: $ARTIFACT_ROOT" ;;
esac

REVISION=$(git -C "$CHECKOUT" rev-parse HEAD)
PYTHON=${YANA_RELEASE_PYTHON:-python3}
RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)-$$
OUTPUT="$ARTIFACT_ROOT/$REVISION/$RUN_ID"

if [[ -e "$OUTPUT" ]]; then
  fail "refusing to reuse existing artifact directory: $OUTPUT"
fi

printf 'candidate revision: %s\n' "$REVISION"
printf 'candidate checkout: %s\n' "$CHECKOUT"
printf 'artifact output: %s\n' "$OUTPUT"

if [[ "$DRY_RUN" == true ]]; then
  printf 'command: %q %q --output %q\n' "$PYTHON" "$GATE_SCRIPT" "$OUTPUT"
  exit 0
fi

umask 077
mkdir -p "$(dirname "$OUTPUT")"
exec "$PYTHON" "$GATE_SCRIPT" --output "$OUTPUT"
