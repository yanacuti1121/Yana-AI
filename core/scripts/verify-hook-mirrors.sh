#!/usr/bin/env bash
# core/scripts/verify-hook-mirrors.sh — ADR-008 "Still open" follow-up
# (docs/adr/ADR-008-shared-locking-infrastructure.md finding #1, 2026-07-23).
#
# core/hooks/*.sh is the canonical source. Claude Code and Codex actually
# execute from .claude/hooks/ and .codex/hooks/ respectively, and nothing
# previously kept those mirrors in sync automatically — every ADR-008 fix
# made to core/hooks/ silently stayed unpatched in both mirrors for a full
# session before that gap was caught by an independent review, not by any
# check. This script is that check.
#
# Detect-and-report only, matching this repo's verify-core-lock.sh /
# verify-skills-lock.sh convention — does not auto-fix. See
# sync-hook-mirrors.sh for the fix command.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CORE_DIR="$PROJECT_DIR/core/hooks"
MIRRORS=(".claude/hooks" ".codex/hooks")

if [[ ! -d "$CORE_DIR" ]]; then
    echo "[hook-mirror] core/hooks/ not found at $CORE_DIR — nothing to verify" >&2
    exit 2
fi

drift=0
missing=0
extra=0

for mirror in "${MIRRORS[@]}"; do
    mirror_dir="$PROJECT_DIR/$mirror"
    if [[ ! -d "$mirror_dir" ]]; then
        echo "✗ MISSING-DIR  $mirror (entire mirror directory absent)"
        missing=$((missing + 1))
        continue
    fi

    for f in "$CORE_DIR"/*.sh; do
        [[ -f "$f" ]] || continue
        name=$(basename "$f")
        target="$mirror_dir/$name"
        if [[ ! -f "$target" ]]; then
            echo "✗ MISSING      $mirror/$name"
            missing=$((missing + 1))
        elif ! cmp -s "$f" "$target"; then
            echo "✗ DRIFT        $mirror/$name (differs from core/hooks/$name)"
            drift=$((drift + 1))
        fi
    done

    # Informational only — a mirror-only file isn't itself a safety gap
    # (nothing silently stayed unpatched), so it doesn't fail the check.
    for f in "$mirror_dir"/*.sh; do
        [[ -f "$f" ]] || continue
        name=$(basename "$f")
        if [[ ! -f "$CORE_DIR/$name" ]]; then
            echo "⚠ EXTRA        $mirror/$name (no core/hooks/$name counterpart)"
            extra=$((extra + 1))
        fi
    done
done

blocking=$((drift + missing))
echo ""
echo "Summary: $drift drift · $missing missing · $extra extra (informational, not blocking)"

if [[ $blocking -gt 0 ]]; then
    echo ""
    echo "[hook-mirror] INTEGRITY VIOLATION — mirrors out of sync with core/hooks/"
    echo "Fix: bash core/scripts/sync-hook-mirrors.sh"
    exit 1
fi

echo "[hook-mirror] OK — .claude/hooks/ and .codex/hooks/ match core/hooks/ byte-for-byte"
exit 0
