#!/usr/bin/env bash
# Prepare an isolated, immutable release candidate from a local Git mirror.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash core/scripts/prepare-self-hosted-release-candidate.sh \
  --source-repo PATH --revision FULL_COMMIT --checkout PATH [--dry-run]

SOURCE_REPO must be a local Git repository. The script never fetches from a
network remote and never overwrites CHECKOUT. It creates a standalone clone,
checks out the exact commit in detached-HEAD state, verifies it is clean, then
moves it into place.
EOF
}

fail() {
  printf 'self-hosted candidate preparation: %s\n' "$*" >&2
  exit 2
}

canonical_directory() {
  local directory=$1
  (
    cd "$directory"
    pwd -P
  )
}

SOURCE_REPO=''
REVISION=''
CHECKOUT=''
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-repo)
      [[ $# -ge 2 ]] || fail '--source-repo requires a path'
      SOURCE_REPO=$2
      shift 2
      ;;
    --revision)
      [[ $# -ge 2 ]] || fail '--revision requires a full commit ID'
      REVISION=$2
      shift 2
      ;;
    --checkout)
      [[ $# -ge 2 ]] || fail '--checkout requires a path'
      CHECKOUT=$2
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

[[ -n "$SOURCE_REPO" ]] || fail '--source-repo is required'
[[ -n "$REVISION" ]] || fail '--revision is required'
[[ -n "$CHECKOUT" ]] || fail '--checkout is required'
[[ -d "$SOURCE_REPO" ]] || fail "source repository must be a local directory: $SOURCE_REPO"
[[ "$REVISION" =~ ^[0-9a-f]{40}([0-9a-f]{24})?$ ]] || fail "revision must be a full 40- or 64-character lowercase commit ID"

SOURCE_REPO=$(canonical_directory "$SOURCE_REPO")
if ! git -C "$SOURCE_REPO" rev-parse --git-dir >/dev/null 2>&1; then
  fail "source repository is not a Git repository: $SOURCE_REPO"
fi
if ! git -C "$SOURCE_REPO" cat-file -e "${REVISION}^{commit}" 2>/dev/null; then
  fail "source repository does not contain commit: $REVISION"
fi
if [[ $(git -C "$SOURCE_REPO" rev-parse "${REVISION}^{commit}") != "$REVISION" ]]; then
  fail "revision must resolve to the exact requested commit: $REVISION"
fi
if [[ -e "$CHECKOUT" ]]; then
  fail "refusing to overwrite existing checkout: $CHECKOUT"
fi

CHECKOUT_PARENT=$(dirname "$CHECKOUT")
CHECKOUT_NAME=$(basename "$CHECKOUT")
[[ "$CHECKOUT_NAME" != '.' && "$CHECKOUT_NAME" != '/' ]] || fail "checkout must name a new directory: $CHECKOUT"

printf 'source repository: %s\n' "$SOURCE_REPO"
printf 'candidate revision: %s\n' "$REVISION"
printf 'candidate checkout: %s\n' "$CHECKOUT"

if [[ "$DRY_RUN" == true ]]; then
  printf 'command: git clone --no-local --no-checkout %q <staging>\n' "$SOURCE_REPO"
  exit 0
fi

mkdir -p "$CHECKOUT_PARENT"
CHECKOUT_PARENT=$(canonical_directory "$CHECKOUT_PARENT")
CHECKOUT="$CHECKOUT_PARENT/$CHECKOUT_NAME"
[[ ! -e "$CHECKOUT" ]] || fail "refusing to overwrite existing checkout: $CHECKOUT"
STAGING=$(mktemp -d "$CHECKOUT_PARENT/.yana-release-candidate.XXXXXX")

if ! git clone --no-local --no-checkout "$SOURCE_REPO" "$STAGING"; then
  fail "clone failed; staging directory retained for inspection: $STAGING"
fi
if ! git -C "$STAGING" switch --detach --quiet "$REVISION"; then
  fail "checkout failed; staging directory retained for inspection: $STAGING"
fi
if [[ $(git -C "$STAGING" rev-parse HEAD) != "$REVISION" ]]; then
  fail "candidate revision mismatch; staging directory retained for inspection: $STAGING"
fi
if git -C "$STAGING" symbolic-ref -q HEAD >/dev/null; then
  fail "candidate checkout unexpectedly has a branch; staging directory retained for inspection: $STAGING"
fi
if [[ -n $(git -C "$STAGING" status --porcelain) ]]; then
  fail "candidate checkout is not clean; staging directory retained for inspection: $STAGING"
fi

if ! mv "$STAGING" "$CHECKOUT"; then
  fail "could not move prepared candidate into place; staging directory retained: $STAGING"
fi
printf 'prepared candidate checkout: %s\n' "$CHECKOUT"
