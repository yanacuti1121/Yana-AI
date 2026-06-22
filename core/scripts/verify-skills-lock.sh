#!/usr/bin/env bash
# Verify that the skills on disk match the hashes recorded in skills-lock.json.
#
# By default this is a PURE CHECK — it never writes to the lockfile. A gate
# that mutates the thing it is gating cannot be trusted as evidence, and the
# old always-on auto-add silently re-registered thousands of entries during
# routine pre-push verification (2026-06-11 incident).
#
# Exit codes:
#   0 — all skills verified (with --prune: after stale entries were removed)
#   1 — drift detected (skill content differs from lock) or missing files
#   2 — cannot read lockfile or missing dependency (jq)
#
# Flags:
#   --auto-add      Register skills found on disk that are NOT yet in the
#                   lockfile (opt-in; use after intentionally adding skills)
#   --prune         Remove lockfile entries whose skill no longer exists on
#                   disk (opt-in; missing entries then do not fail the run)
#   --no-auto-add   Deprecated no-op — verify-only is the default now
#
# Intended usage:
#   - Run manually before trusting a shipped template.
#   - Run with --auto-add after adding a new skill to register it.
#   - Wire into CI to detect accidental skill edits that should have bumped the lock.

set -uo pipefail

AUTO_ADD=false
PRUNE=false
for arg in "$@"; do
  case "$arg" in
    --auto-add)    AUTO_ADD=true ;;
    --prune)       PRUNE=true ;;
    --no-auto-add) ;; # deprecated: verify-only is already the default
  esac
done

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Support multiple layout conventions (repo scaffold vs unzipped into .claude/)
LOCKFILE=""
for candidate in \
  "$PROJECT_ROOT/skills-lock.json" \
  "$PROJECT_ROOT/core/config/skills-lock.json" \
  "$PROJECT_ROOT/config/skills-lock.json"; do
  if [[ -f "$candidate" ]]; then
    LOCKFILE="$candidate"
    break
  fi
done

if ! command -v jq >/dev/null 2>&1; then
  echo "✗ verify-skills-lock: jq is required but not installed. Install jq and retry." >&2
  exit 2
fi

# macOS ships neither sha256sum nor an alias for it; `shasum -a 256` is the
# native equivalent and emits the same "<hash>  filename" output format.
if command -v sha256sum >/dev/null 2>&1; then
  SHA256=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  SHA256=(shasum -a 256)
else
  echo "✗ verify-skills-lock: sha256sum or shasum required" >&2
  exit 2
fi

if [[ -z "$LOCKFILE" ]]; then
  echo "✗ verify-skills-lock: skills-lock.json not found in expected locations" >&2
  exit 2
fi

# Detect the skills root directory (repo scaffold vs installed layout)
SKILLS_ROOT=""
for candidate in \
  "$PROJECT_ROOT/core/skills" \
  "$PROJECT_ROOT/skills" \
  "$PROJECT_ROOT/.claude/skills"; do
  [[ -d "$candidate" ]] && SKILLS_ROOT="$candidate" && break
done

# Resolve a skill localPath to an actual directory on disk.
# Tries 3 fallback locations to support repo scaffold + installed pack layouts.
resolve_skill_path() {
  local local_path="$1"

  # 1. Try as-is (works when installed: .claude/skills/foo)
  local p="$PROJECT_ROOT/$local_path"
  [[ -d "$p" ]] && echo "$p" && return 0

  # 2. Map .claude/skills/<rel> → core/skills/<rel> (repo scaffold layout)
  if [[ "$local_path" == .claude/skills/* ]]; then
    local rel="${local_path#.claude/skills/}"
    p="$PROJECT_ROOT/core/skills/$rel"
    [[ -d "$p" ]] && echo "$p" && return 0

    # 3. Map .claude/skills/<rel> → skills/<rel> (minimal install layout)
    p="$PROJECT_ROOT/skills/$rel"
    [[ -d "$p" ]] && echo "$p" && return 0
  fi

  echo ""
  return 1
}

# Compute the canonical hash for a skill directory.
compute_hash() {
  local dir="$1"
  cd "$dir" && \
    find . -type f -not -name "mcp.json" -exec "${SHA256[@]}" {} \; \
      | sort \
      | "${SHA256[@]}" \
      | cut -d' ' -f1
}

# ── Phase 1: Verify skills already in the lockfile ───────────────────────────
drift=0
missing=0
ok=0
prune_list=()

while IFS=$'\t' read -r name local_path expected_hash; do
  full_path=$(resolve_skill_path "$local_path")

  if [[ -z "$full_path" ]]; then
    if [[ "$PRUNE" == "true" ]]; then
      echo "− PRUNE    $name  (gone from disk: $local_path)"
      prune_list+=("$name")
    else
      echo "✗ MISSING  $name  (looked: $local_path | core/skills/... | skills/...)"
    fi
    missing=$((missing + 1))
    continue
  fi

  actual_hash=$(compute_hash "$full_path")

  if [[ -z "$expected_hash" || "$expected_hash" == "null" ]]; then
    echo "~ SKIPPED  $name  (no hash in lockfile — run update-skills-lock.sh to populate)"
    ok=$((ok + 1))
  elif [[ "$actual_hash" == "$expected_hash" ]]; then
    echo "✓ OK       $name"
    ok=$((ok + 1))
  else
    echo "⚠ DRIFT    $name"
    echo "           expected $expected_hash"
    echo "           actual   $actual_hash"
    drift=$((drift + 1))
  fi
done < <(jq -r '.skills | to_entries[] | [.key, .value.localPath, .value.computedHash] | @tsv' "$LOCKFILE")

# ── Phase 2: Auto-add skills on disk not yet in the lockfile ─────────────────
added=0

if [[ "$AUTO_ADD" == "true" && -n "$SKILLS_ROOT" ]]; then
  # Build a set of skill names AND localPaths already in the lockfile
  existing_names=$(jq -r '.skills | keys[]' "$LOCKFILE" 2>/dev/null || echo "")
  existing_paths=$(jq -r '.skills[].localPath' "$LOCKFILE" 2>/dev/null || echo "")

  # Walk disk: every directory that contains a SKILL.md is a skill
  while IFS= read -r skill_md; do
    skill_dir=$(dirname "$skill_md")
    skill_name=$(basename "$skill_dir")

    # Skip if name already in lockfile
    if echo "$existing_names" | grep -qx "$skill_name"; then
      continue
    fi

    # Skip if the directory path is already registered under a different key
    rel_path="${skill_dir#$PROJECT_ROOT/}"
    if [[ "$rel_path" == core/skills/* ]]; then
      canonical_lp=".claude/skills/${rel_path#core/skills/}"
    else
      canonical_lp=".claude/skills/${rel_path#skills/}"
    fi
    if echo "$existing_paths" | grep -qF "$canonical_lp"; then
      continue
    fi

    local_path="$canonical_lp"

    hash=$(compute_hash "$skill_dir")

    # Inject new entry into lockfile via jq
    tmp=$(mktemp)
    jq --arg name "$skill_name" \
       --arg lp "$local_path" \
       --arg h "$hash" \
       '.skills[$name] = {"computedHash": $h, "localPath": $lp, "addedAt": (now | todate)}' \
       "$LOCKFILE" > "$tmp" && mv "$tmp" "$LOCKFILE"

    echo "+ ADDED    $skill_name  ($local_path)"
    added=$((added + 1))
  done < <(find "$SKILLS_ROOT" -name "SKILL.md" | sort)
fi

# ── Phase 3: Prune stale entries (opt-in) ────────────────────────────────────
pruned=0

if [[ "$PRUNE" == "true" && ${#prune_list[@]} -gt 0 ]]; then
  names_json=$(printf '%s\n' "${prune_list[@]}" | jq -R . | jq -s .)
  tmp=$(mktemp)
  if jq --argjson names "$names_json" '.skills |= with_entries(select(.key as $k | $names | index($k) | not))' \
       "$LOCKFILE" > "$tmp" && jq -e '.skills | length > 0' "$tmp" > /dev/null; then
    # write guard: never replace the lock with empty/invalid output
    mv "$tmp" "$LOCKFILE"
    pruned=${#prune_list[@]}
  else
    rm -f "$tmp"
    echo "✗ prune aborted — jq produced invalid or empty output, lockfile untouched" >&2
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Summary: $ok ok · $drift drift · $missing missing · $added auto-added · $pruned pruned"

if [[ $added -gt 0 ]]; then
  echo ""
  echo "$added new skill(s) added to $(basename "$LOCKFILE")."
  echo "Run update-skills-lock.sh to refresh all hashes if needed."
fi

if [[ $pruned -gt 0 ]]; then
  echo ""
  echo "$pruned stale entr(y/ies) removed from $(basename "$LOCKFILE"). Remember to commit it."
fi

# Pruned entries are resolved, not failures; anything still missing fails.
unresolved_missing=$((missing - pruned))

if [[ $drift -gt 0 || $unresolved_missing -gt 0 ]]; then
  echo ""
  echo "If drift is intentional, regenerate with:"
  echo "  bash core/scripts/update-skills-lock.sh"
  echo "If skills were deleted on purpose, remove their entries with:"
  echo "  bash core/scripts/verify-skills-lock.sh --prune"
  exit 1
fi

exit 0
