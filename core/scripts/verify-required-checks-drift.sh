#!/usr/bin/env bash
# Authority Hardening item #10: release.yml and publish.yml each used to
# hard-code their own, byte-for-byte-identical REQUIRED=(...) array of
# check-run names to verify before building/publishing from a tagged
# commit. Both now read the same .github/required-checks.json instead
# (one file, two consumers) -- this script is the drift guard that keeps
# that file honest: every name in it must match a real job `name:` in
# ci.yml (after matrix expansion), so a rename/removal in ci.yml can't
# silently leave the manifest pointing at a check-run that will never
# exist again (release/publish's verify-provenance job would then find
# "no check found" and treat it as an unverified commit -- not a security
# hole, but a confusing, avoidable false block that this catches earlier
# and with a clearer message).
#
# Honest limit (documented in required-checks.json itself too): this
# cannot verify the manifest matches GitHub's actual branch-protection
# required_status_checks.contexts setting -- reading that needs repo-admin
# scope a standard GITHUB_TOKEN doesn't have. This only proves internal
# consistency between the manifest and ci.yml's own job names.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="$REPO_ROOT/.github/required-checks.json"
CI_YML="$REPO_ROOT/.github/workflows/ci.yml"

if [[ ! -f "$MANIFEST" ]]; then
  echo "[required-checks-drift] MISSING $MANIFEST"
  exit 2
fi
if [[ ! -f "$CI_YML" ]]; then
  echo "[required-checks-drift] MISSING $CI_YML"
  exit 2
fi

command -v python3 >/dev/null || { echo "[required-checks-drift] python3 required"; exit 2; }

# system-health-monitor is the only job whose `name:` field is templated
# on a matrix value today (`${{ matrix.os }}`). Expanding it here mirrors
# what GitHub Actions itself does when generating check-run names, using
# the matrix values ci.yml actually declares for that job, not a
# hard-coded guess.
#
# Portability note: this repo's own required checks run macOS jobs, and
# a maintainer's local macOS shell defaults to bash 3.2 (no `mapfile`/
# `readarray`, added in bash 4) -- verified directly against this
# machine's `/bin/bash --version`. Using `while read` loops instead keeps
# this script runnable both there and on ubuntu-latest's bash >=4.
MATRIX_OS=()
matrix_line=$(grep -oE '^\s*os: \[[^]]*\]' "$CI_YML" | head -1)
if [[ -n "$matrix_line" ]]; then
  inner="${matrix_line#*\[}"
  inner="${inner%\]*}"
  IFS=',' read -ra raw_values <<< "$inner"
  for value in "${raw_values[@]}"; do
    trimmed="$(echo "$value" | tr -d '[:space:]')"
    [[ -n "$trimmed" ]] && MATRIX_OS+=("$trimmed")
  done
fi
if [[ "${#MATRIX_OS[@]}" -eq 0 ]]; then
  echo "[required-checks-drift] could not read system-health-monitor's matrix.os values from ci.yml"
  exit 2
fi

JOB_NAMES=()
while IFS= read -r name; do
  JOB_NAMES+=("$name")
done < <(grep -oE '^    name: .*' "$CI_YML" | sed -E 's/^    name: //')

EXPANDED_NAMES=()
for name in "${JOB_NAMES[@]}"; do
  if [[ "$name" == *'${{ matrix.os }}'* ]]; then
    for os in "${MATRIX_OS[@]}"; do
      EXPANDED_NAMES+=("${name//\$\{\{ matrix.os \}\}/$os}")
    done
  else
    EXPANDED_NAMES+=("$name")
  fi
done

MANIFEST_NAMES=()
while IFS= read -r name; do
  MANIFEST_NAMES+=("$name")
done < <(python3 -c "
import json
with open('$MANIFEST') as f:
    data = json.load(f)
for name in data['required_checks']:
    print(name)
")

MISSING=0
for required in "${MANIFEST_NAMES[@]}"; do
  found=0
  for actual in "${EXPANDED_NAMES[@]}"; do
    if [[ "$actual" == "$required" ]]; then
      found=1
      break
    fi
  done
  if [[ "$found" -eq 0 ]]; then
    echo "[required-checks-drift] manifest entry does not match any current ci.yml job name: '$required'"
    MISSING=1
  fi
done

if [[ "$MISSING" -eq 1 ]]; then
  echo ""
  echo "$MANIFEST references a check name ci.yml no longer produces."
  echo "Update the manifest to match ci.yml's real job names (or restore"
  echo "the job in ci.yml if the rename/removal was accidental)."
  exit 1
fi

echo "[required-checks-drift] OK — every manifest entry matches a real ci.yml job name"
