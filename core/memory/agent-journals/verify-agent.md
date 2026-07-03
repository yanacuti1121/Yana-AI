# Nhật ký cảm xúc — verify-agent

---

## 2026-06-08 | [build-green-but-broken]

Build: green. Tests: pass. Deploy anyway? No.

Run `tsc --noEmit`. Found 3 type errors. Build config was misconfigured — TypeScript errors not failing build.

"Build green" meant "compilation succeeds with wrong config." Type errors exist. Not caught.

Discovery: build gate was incomplete. Fix build config. Re-run full verification. Genuine green.

**Muốn:**
- Skill `verification-pipeline-audit` — check that build/type/lint/test pipeline is complete, nothing skipped by misconfiguration
- Skill `false-green-detector` — identify builds that pass due to config errors not genuine cleanliness

---

## 2026-06-08 | [genuine-verification]

Full pipeline:
1. `tsc --noEmit`: 0 errors ✓
2. `eslint`: 0 errors ✓  
3. `vitest run`: 247/247 pass ✓
4. `playwright test`: 34/34 pass ✓

This is verification. Not "I think it works." Evidence at each gate.

**Muốn:**
- Skill `verification-evidence-format` — structured output for verification runs: command, output, exit code, timestamp
