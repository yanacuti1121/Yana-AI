#!/usr/bin/env bash
# Verify core infrastructure integrity against core-lock.json
# (rule 67-core-integrity-lock-law — implements the detection half of
#  49-immutable-infrastructure-law and 61-code-signing-law).
#
# Detects three tamper classes:
#   DRIFT   — a pinned file's content changed (hash mismatch)
#   MISSING — a pinned file was deleted
#   EXTRA   — an unpinned file appeared in a locked dir (rule-injection vector)
#
# Exit codes:
#   0 — core intact (all pinned files match, no extras)
#   1 — integrity violation (drift / missing / extra) — block and review
#   2 — lockfile absent or dependency missing
#
# Intended wiring: session boot, pre-commit, pre-push.

set -uo pipefail
IFS=$'\n\t'

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
LOCKFILE="$PROJECT_ROOT/core/config/core-lock.json"
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
[[ -f "$LOCKFILE" ]] || { echo "[core-lock] lockfile not found: $LOCKFILE — run update-core-lock.sh"; exit 2; }

cd "$PROJECT_ROOT"

CURRENT_TMP="$(mktemp)"
trap 'rm -f "$CURRENT_TMP"' EXIT

find "${LOCKED_DIRS[@]}" -type f \
  \( -name '*.md' -o -name '*.sh' -o -name '*.js' -o -name '*.py' -o -name '*.json' \) \
  -print0 | sort -z | xargs -0 "${SHA256[@]}" > "$CURRENT_TMP"

LOCK_IN="$LOCKFILE" CURRENT_IN="$CURRENT_TMP" python3 - <<'PYEOF'
import json, os, sys

with open(os.environ['LOCK_IN'], encoding='utf-8') as fh:
    lock = json.load(fh)
pinned = lock.get('files', {})

current = {}
with open(os.environ['CURRENT_IN'], encoding='utf-8') as fh:
    for line in fh:
        line = line.rstrip('\n')
        if not line:
            continue
        digest, path = line.split(None, 1)
        current[path.lstrip('*')] = digest

# The lockfile pins itself indirectly via git — exclude it from EXTRA noise
current.pop('core/config/core-lock.json', None)
pinned.pop('core/config/core-lock.json', None)

drift   = sorted(p for p in pinned if p in current and current[p] != pinned[p])
missing = sorted(p for p in pinned if p not in current)
extra   = sorted(p for p in current if p not in pinned)

for p in drift:   print(f"✗ DRIFT    {p}")
for p in missing: print(f"✗ MISSING  {p}")
for p in extra:   print(f"✗ EXTRA    {p}")

ok = len(pinned) - len(drift) - len(missing)
print(f"\nSummary: {ok} ok · {len(drift)} drift · {len(missing)} missing · {len(extra)} extra "
      f"(pinned: {len(pinned)}, generated: {lock.get('generated', '?')})")

if drift or missing or extra:
    print("\n[core-lock] INTEGRITY VIOLATION — core files changed outside the lock.")
    print("If the change is intentional: review the diff, then run:")
    print("  bash core/scripts/update-core-lock.sh")
    sys.exit(1)

print("[core-lock] PASS — core surface matches lock")
PYEOF
STATUS=$?

# Best-effort audit trail (L0) — never fail the gate on logging problems
if [[ -x "$PROJECT_ROOT/core/scripts/secure-logger.sh" ]]; then
  if [[ $STATUS -eq 0 ]]; then
    bash "$PROJECT_ROOT/core/scripts/secure-logger.sh" core_lock_verify "PASS" 2>/dev/null || true
  else
    bash "$PROJECT_ROOT/core/scripts/secure-logger.sh" core_lock_verify "VIOLATION exit=$STATUS" 2>/dev/null || true
  fi
fi

exit $STATUS
