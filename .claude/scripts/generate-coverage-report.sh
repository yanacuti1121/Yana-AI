#!/usr/bin/env bash
# YAMTAM ENGINE v1.2 coverage wrapper
# Runs a real configured coverage script if present. No simulated coverage.

set -euo pipefail

if node -e 'const p=require("./package.json"); process.exit(p.scripts && p.scripts["test:coverage"] ? 0 : 1)' 2>/dev/null; then
  exec npm run test:coverage -- "$@"
fi

cat >&2 <<'MSG'
No real test:coverage script is configured in package.json.
Add a real coverage tool first, for example Vitest/Jest/Playwright coverage.
No report was generated because fake coverage is forbidden.
MSG
exit 2
