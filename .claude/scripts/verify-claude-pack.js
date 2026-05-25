#!/usr/bin/env node
/*
  GitNexus Claude Code Pack Verifier v10
  Real checks only: file existence, frontmatter, hook references, command shape,
  duplicate agent names, lock file coverage, and risky placeholder wording.
*/
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const rel = (p) => path.join(root, p);
const exists = (p) => fs.existsSync(rel(p));
const read = (p) => fs.readFileSync(rel(p), 'utf8');
const list = (dir, ext) => exists(dir)
  ? fs.readdirSync(rel(dir)).filter((f) => !ext || f.endsWith(ext)).sort()
  : [];

let failures = [];
let warnings = [];
let info = [];

function fail(msg) { failures.push(msg); }
function warn(msg) { warnings.push(msg); }
function ok(msg) { info.push(msg); }

function frontmatter(file) {
  const txt = read(file);
  if (!txt.startsWith('---\n')) return null;
  const end = txt.indexOf('\n---', 4);
  if (end === -1) return null;
  const body = txt.slice(4, end).trim();
  const out = {};
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function executableBit(file) {
  const stat = fs.statSync(rel(file));
  return Boolean(stat.mode & 0o111);
}

// Required top-level docs
for (const file of ['CLAUDE.md', 'README.md', 'MEMORY.md', 'PRD.md']) {
  exists(file) ? ok(`found ${file}`) : fail(`missing ${file}`);
}
// START_HERE.md is deleted after onboarding — absence is expected

// Agents
const agentFiles = list('.claude/agents', '.md');
if (agentFiles.length === 0) fail('no agents found in .claude/agents');
const names = new Map();
for (const f of agentFiles) {
  const file = `.claude/agents/${f}`;
  const fm = frontmatter(file);
  if (!fm) { fail(`${file}: missing YAML frontmatter`); continue; }
  for (const key of ['name', 'description', 'tools', 'memory']) {
    if (!fm[key]) fail(`${file}: missing frontmatter field: ${key}`);
  }
  if (fm.name) {
    if (names.has(fm.name)) fail(`duplicate agent name: ${fm.name} in ${file} and ${names.get(fm.name)}`);
    names.set(fm.name, file);
    if (fm.name !== f.replace(/\.md$/, '')) warn(`${file}: filename and agent name differ (${fm.name})`);
  }
  if (fm.memory && !['user', 'project'].includes(fm.memory)) warn(`${file}: unusual memory value: ${fm.memory}`);
  const body = read(file).slice(read(file).indexOf('\n---') + 4);
  const risky = body.match(/\b(TODO: implement|coming soon|lorem ipsum|dummy implementation)\b/i);
  if (risky) fail(`${file}: contains unimplemented placeholder marker: ${risky[0]}`);
}
ok(`agents checked: ${agentFiles.length}`);

// Commands
const commandFiles = list('.claude/commands', '.md');
for (const f of commandFiles) {
  const file = `.claude/commands/${f}`;
  const fm = frontmatter(file);
  if (!fm) fail(`${file}: missing YAML frontmatter`);
  else if (!fm.description) fail(`${file}: missing description`);
}
ok(`commands checked: ${commandFiles.length}`);

// Hooks referenced by settings.json
if (exists('.claude/settings.json')) {
  let settings;
  try { settings = JSON.parse(read('.claude/settings.json')); }
  catch (err) { fail(`.claude/settings.json is invalid JSON: ${err.message}`); }
  if (settings && settings.hooks) {
    const json = JSON.stringify(settings.hooks);
    const matches = [...json.matchAll(/\.claude\/hooks\/([^\"\s]+)/g)].map((m) => m[1]);
    for (const hook of matches) {
      const clean = hook.replace(/\\?".*$/, '');
      const file = `.claude/hooks/${clean}`;
      if (!exists(file)) fail(`settings references missing hook: ${file}`);
      else if ((clean.endsWith('.sh') || clean.endsWith('.js')) && !executableBit(file)) warn(`${file}: not executable`);
    }
    ok(`settings hook references checked: ${matches.length}`);
  }
} else fail('missing .claude/settings.json');

// Routing map points to real agents
if (exists('.claude/agent-routing-map.json')) {
  const routing = JSON.parse(read('.claude/agent-routing-map.json'));
  for (const rule of routing.rules || []) {
    for (const key of ['primary', 'verify_with']) {
      const val = rule[key];
      if (val && val !== 'release' && !names.has(val)) fail(`routing map references missing agent: ${val}`);
    }
  }
  ok('agent-routing-map.json checked');
} else warn('missing .claude/agent-routing-map.json');

// Skills lock coverage — check multiple layout conventions
const lockCandidates = ['skills-lock.json', 'core/config/skills-lock.json', 'config/skills-lock.json'];
const lockPath = lockCandidates.find(p => exists(p));
if (lockPath) {
  try {
    const lock = JSON.parse(read(lockPath));
    const lockText = JSON.stringify(lock);
    for (const skill of list('.claude/skills')) {
      if (!lockText.includes(skill)) warn(`${lockPath} may not mention skill: ${skill}`);
    }
    ok(`${lockPath} parsed`);
  } catch (err) { fail(`${lockPath} invalid JSON: ${err.message}`); }
} else warn('missing skills-lock.json (checked: ' + lockCandidates.join(', ') + ')');

// Hook budget coverage
if (exists('.claude/hook-budget.json')) {
  const budget = JSON.parse(read('.claude/hook-budget.json'));
  for (const hook of list('.claude/hooks')) {
    if (!budget.budgets_ms || budget.budgets_ms[hook] === undefined) warn(`hook-budget missing budget for ${hook}`);
  }
  ok('hook-budget.json checked');
}

console.log('\nGitNexus Claude Code Pack Verification v10');
console.log('='.repeat(48));
for (const line of info) console.log(`OK   ${line}`);
for (const line of warnings) console.log(`WARN ${line}`);
for (const line of failures) console.log(`FAIL ${line}`);
console.log('='.repeat(48));
console.log(`${failures.length} failure(s), ${warnings.length} warning(s)`);
process.exit(failures.length ? 1 : 0);
