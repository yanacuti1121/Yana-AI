#!/usr/bin/env bash
# Regenerate core-lock.json — SHA-256 manifest of every core infrastructure file.
# Companion to verify-core-lock.sh (rule 67-core-integrity-lock-law).
#
# Run this ONLY when a core change is intentional. The lockfile is committed,
# so any silent re-generation still shows up in git history.
#
# Exit codes:
#   0 — lockfile written
#   2 — missing dependency (python3 / sha256sum)

set -euo pipefail
IFS=$'\n\t'

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
LOCKFILE="$PROJECT_ROOT/core/config/core-lock.json"

# The protected write surface — keep in sync with 49-immutable-infrastructure-law
LOCKED_DIRS=(core/rules core/gates core/hooks core/scripts)

command -v python3 >/dev/null || { echo "[core-lock] python3 required"; exit 2; }

# macOS ships neither sha256sum nor an alias for it; `shasum -a 256` is the
# native equivalent and emits the same "<hash>  filename" output format.
if command -v sha256sum >/dev/null 2>&1; then
  SHA256=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  SHA256=(shasum -a 256)
else
  echo "[core-lock] sha256sum or shasum required"; exit 2
fi

cd "$PROJECT_ROOT"

HASHES_TMP="$(mktemp)"
trap 'rm -f "$HASHES_TMP"' EXIT

find "${LOCKED_DIRS[@]}" -type f \
  \( -name '*.md' -o -name '*.sh' -o -name '*.js' -o -name '*.py' -o -name '*.json' \) \
  -print0 | sort -z | xargs -0 "${SHA256[@]}" > "$HASHES_TMP"

LOCK_OUT="$LOCKFILE" HASHES_IN="$HASHES_TMP" python3 - <<'PYEOF'
import json, os, sys, datetime

entries = {}
with open(os.environ['HASHES_IN'], encoding='utf-8') as fh:
    for line in fh:
        line = line.rstrip('\n')
        if not line:
            continue
        digest, path = line.split(None, 1)
        # sha256sum prefixes '*' for binary mode reads on some platforms
        entries[path.lstrip('*')] = digest

lock = {
    'algo':      'sha256',
    'generated': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
    'count':     len(entries),
    'files':     dict(sorted(entries.items())),
}

with open(os.environ['LOCK_OUT'], 'w', encoding='utf-8') as fh:
    json.dump(lock, fh, indent=2, ensure_ascii=False)
    fh.write('\n')

print(f"[core-lock] wrote {os.environ['LOCK_OUT']} — {len(entries)} files pinned")
PYEOF
