#!/usr/bin/env bash
# YAMTAM ENGINE v1.2 E2E runner wrapper
# Runs real Playwright commands only. Never writes simulated pass reports.

set -euo pipefail
MODE="${1:-list}"
shift || true

case "$MODE" in
  list)
    exec npx playwright test --list "$@"
    ;;
  smoke)
    exec npx playwright test --project=smoke "$@"
    ;;
  grep)
    pattern="${1:-}"
    [[ -n "$pattern" ]] || { echo "Usage: run-e2e-tests.sh grep <pattern>" >&2; exit 2; }
    shift
    exec npx playwright test --grep "$pattern" "$@"
    ;;
  spec)
    spec="${1:-}"
    [[ -n "$spec" ]] || { echo "Usage: run-e2e-tests.sh spec tests/e2e/name.spec.ts" >&2; exit 2; }
    shift
    exec npx playwright test "$spec" "$@"
    ;;
  full)
    if [[ -n "${CODESPACE_NAME:-}" && "${YAMTAM_ALLOW_FULL_E2E:-}" != "1" ]]; then
      echo "Full E2E blocked in Codespaces. Use CI or set YAMTAM_ALLOW_FULL_E2E=1 intentionally." >&2
      exit 3
    fi
    exec npm run test:e2e -- "$@"
    ;;
  *)
    echo "Usage: run-e2e-tests.sh {list|smoke|grep <pattern>|spec <file>|full}" >&2
    exit 2
    ;;
esac
