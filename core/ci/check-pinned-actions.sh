#!/usr/bin/env bash
# check-pinned-actions.sh — CI self-test (Workstream B / A8 Release & Supply Chain)
#
# Fails if any `uses: owner/repo[/path]@REF` line in .github/workflows/*.yml
# or .github/actions/*/action.yml references a floating ref (branch name
# or version tag like `v4`) instead of a full 40-character commit SHA. A
# floating tag can be moved by the action's maintainer — or an attacker
# who compromises that maintainer's account — to point at different code,
# and the next CI run pulls it silently. This repo's own convention
# (ci.yml, publish.yml, sandbox.yml) is 100% SHA-pinned actions with a
# `# vX.Y.Z` comment; this script makes that convention enforced, not
# just followed by habit.
#
# Found by manual audit (2026-08-16, Workstream B / B0-B1): release.yml
# used `actions/checkout@v4` and `softprops/action-gh-release@v2` (floating
# tags) on the exact workflow that builds the CLI binaries end users
# download, and ci.yml + yana-audit.yml both used
# `github/codeql-action/upload-sarif@v4` (also floating). This script
# exists so that class of regression can't silently return.
#
# BUG FIX (found by independent fresh-context review, 2026-08-16): the
# first version of this script only scanned .github/workflows/*.yml. This
# repo also ships two composite actions under .github/actions/*/action.yml
# — the exact files end users copy into their own repos, since they're
# published, reusable building blocks, not this repo's own internal CI —
# and those had 4 live floating refs the script silently missed while
# printing PASS. Both roots are scanned now.
#
# Local action references (`uses: ./path`) are not pinnable to a commit —
# they run whatever is currently checked out — and are correctly excluded.
# Docker image references (`uses: docker://...`) are a separate concern
# (image digest pinning) not covered by this check.
#
# Exit 0 — every uses: line is either a full commit SHA or a local path.
# Exit 1 — at least one floating-ref action reference found; prints each.

set -euo pipefail

GITHUB_DIR="${1:-.github}"
WORKFLOW_DIR="$GITHUB_DIR/workflows"
ACTIONS_DIR="$GITHUB_DIR/actions"

if [[ ! -d "$WORKFLOW_DIR" ]]; then
  echo "[check-pinned-actions] ERROR: $WORKFLOW_DIR not found" >&2
  exit 1
fi

FAILURES=0

scan_file() {
  local file="$1"
  # Match `uses: owner/repo...@REF` (ignoring commented-out lines and
  # local/docker references). Captures the ref after the last @.
  while IFS= read -r line; do
    # Strip leading whitespace and a leading `- ` list marker for matching.
    trimmed="${line#"${line%%[![:space:]]*}"}"
    [[ "$trimmed" =~ ^#.*$ ]] && continue
    if [[ "$trimmed" =~ uses:[[:space:]]*([^[:space:]#]+)@([^[:space:]#]+) ]]; then
      target="${BASH_REMATCH[1]}"
      ref="${BASH_REMATCH[2]}"

      # BUG FIX (found by independent adversarial review, 2026-08-16): a
      # quoted `uses: 'owner/repo@<sha>'` value (valid YAML, not used by
      # any workflow in this repo today but valid syntax nonetheless) had
      # its trailing quote captured as part of $ref by the pattern above,
      # so an otherwise-correct 40-char SHA plus a stray `'` failed the
      # hex-length check and was false-flagged as unpinned. Confirmed live
      # by the reviewer with a synthetic fixture. Failed safe (over-flags
      # a valid pin rather than missing a real floating ref), but still a
      # real robustness gap now closed by stripping a matching pair of
      # surrounding quote characters from both captures before validating.
      target="${target#[\'\"]}"; target="${target%[\'\"]}"
      ref="${ref#[\'\"]}"; ref="${ref%[\'\"]}"

      # Local action references and Docker image references are not
      # commit-SHA-pinnable in the same sense; skip them.
      [[ "$target" == ./* ]] && continue
      [[ "$target" == docker://* ]] && continue

      # A full commit SHA is exactly 40 lowercase hex characters.
      if ! [[ "$ref" =~ ^[0-9a-f]{40}$ ]]; then
        echo "[check-pinned-actions] UNPINNED: $file: $target@$ref" >&2
        FAILURES=$((FAILURES + 1))
      fi
    fi
  done < "$file"
}

while IFS= read -r -d '' file; do
  scan_file "$file"
done < <(find "$WORKFLOW_DIR" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) -print0)

if [[ -d "$ACTIONS_DIR" ]]; then
  while IFS= read -r -d '' file; do
    scan_file "$file"
  done < <(find "$ACTIONS_DIR" -mindepth 2 -maxdepth 2 -type f \( -name 'action.yml' -o -name 'action.yaml' \) -print0)
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo "" >&2
  echo "[check-pinned-actions] FAIL — $FAILURES unpinned action reference(s) found." >&2
  echo "  Pin each to a full commit SHA with a # vX.Y.Z comment, e.g.:" >&2
  echo "    uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3" >&2
  exit 1
fi

echo "[check-pinned-actions] PASS — all workflow action references are commit-SHA-pinned."
exit 0
