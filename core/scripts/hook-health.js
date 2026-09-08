#!/usr/bin/env node
/* Static hook health checks: existence, executable bit, syntax where possible, and budget coverage. */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const root = process.cwd();
const hookDir = path.join(root, '.claude/hooks');
const budgetFile = path.join(root, '.claude/hook-budget.json');
const budget = fs.existsSync(budgetFile) ? JSON.parse(fs.readFileSync(budgetFile, 'utf8')).budgets_ms || {} : {};
let failures = 0;
let warnings = 0;
function run(cmd, args) { try { cp.execFileSync(cmd, args, { cwd: root, stdio: 'pipe' }); return true; } catch { return false; } }
for (const file of fs.readdirSync(hookDir).sort()) {
  const p = path.join(hookDir, file);
  const stat = fs.statSync(p);
  const executable = Boolean(stat.mode & 0o111);
  if (!executable) { console.log(`WARN ${file}: not executable`); warnings++; }
  if (budget[file] === undefined) { console.log(`WARN ${file}: no performance budget`); warnings++; }
  if (file.endsWith('.sh') && !run('bash', ['-n', p])) { console.log(`FAIL ${file}: bash syntax failed`); failures++; }
  if (file.endsWith('.js') && !run('node', ['--check', p])) { console.log(`FAIL ${file}: node syntax failed`); failures++; }
}
console.log(`${failures} failure(s), ${warnings} warning(s)`);
process.exit(failures ? 1 : 0);
