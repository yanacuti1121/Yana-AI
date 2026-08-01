#!/usr/bin/env bash
# core/scripts/sync-hook-mirrors.sh — copies core/hooks/*.sh (canonical)
# onto .claude/hooks/ and .codex/hooks/, overwriting any drifted or
# missing copy. Companion to verify-hook-mirrors.sh — run this when that
# script reports DRIFT or MISSING.
#
# Deliberately one-directional (core/hooks/ -> mirrors only): a mirror
# should never be the source of truth, since that's exactly how a hand-
# edited mirror copy could silently diverge and never get reconciled back.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CORE_DIR="$PROJECT_DIR/core/hooks"
MIRRORS=(".claude/hooks" ".codex/hooks")

if [[ ! -d "$CORE_DIR" ]]; then
    echo "[hook-mirror] core/hooks/ not found at $CORE_DIR — nothing to sync" >&2
    exit 2
fi

synced=0
for mirror in "${MIRRORS[@]}"; do
    mirror_dir="$PROJECT_DIR/$mirror"
    mkdir -p "$mirror_dir"
    for f in "$CORE_DIR"/*.sh; do
        [[ -f "$f" ]] || continue
        name=$(basename "$f")
        target="$mirror_dir/$name"
        if [[ ! -f "$target" ]] || ! cmp -s "$f" "$target"; then
            cp "$f" "$target"
            echo "synced $mirror/$name"
            synced=$((synced + 1))
        fi
    done
done

echo ""
echo "[hook-mirror] synced $synced file(s)"
