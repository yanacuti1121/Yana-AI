'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sdk = require('./index');

const yanaRtBin = sdk.resolveYanaRtBin();
if (!fs.existsSync(yanaRtBin)) {
  console.log('SKIP: compiled yana-rt binary not found');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-sdk-test-'));
fs.mkdirSync(path.join(tmp, 'src'));
fs.writeFileSync(path.join(tmp, 'src', 'app.rs'), 'pub fn v1() {}\n');

// 1. Workspace refresh
const ws = sdk.workspaceRefresh(tmp, [], { yanaRtBin });
assert.strictEqual(ws.capability, 'workspace.refresh');
assert.ok(ws.entries.some((e) => e.path === 'src/app.rs'));

// 2. Checkpoint + dryRun rewind + real rewind
const cp = sdk.createCheckpoint(tmp, 'sdk-v1', { yanaRtBin });
assert.strictEqual(cp.id, 1);

fs.writeFileSync(path.join(tmp, 'src', 'app.rs'), 'pub fn v2() {}\n');
const dry = sdk.rewindFiles(tmp, 1, { dryRun: true, yanaRtBin });
assert.strictEqual(dry.dry_run, true);
assert.strictEqual(fs.readFileSync(path.join(tmp, 'src', 'app.rs'), 'utf8'), 'pub fn v2() {}\n');

const restored = sdk.rewindFiles(tmp, 1, { dryRun: false, yanaRtBin });
assert.strictEqual(restored.dry_run, false);
assert.strictEqual(fs.readFileSync(path.join(tmp, 'src', 'app.rs'), 'utf8'), 'pub fn v1() {}\n');

// 3. SOP Compiler + Blind Rubric
const sopFile = path.join(tmp, 'deploy.sop.md');
fs.writeFileSync(
  sopFile,
  '# Deploy {{ENV}}\n\n## Goal\nDeploy safely to {{ENV}}\n\n## Steps\n- Run smoke tests\n\n## Scope\n- `src/`\n\n## Allowed Commands\n- `cargo test`\n',
);
const outDir = path.join(tmp, 'compiled-sop');
const compiled = sdk.compileSop(sopFile, {
  vars: ['ENV=staging'],
  outDir,
  yanaRtBin,
});
assert.strictEqual(compiled.spec.id, 'deploy-staging');
assert.strictEqual(compiled.spec.goal, 'Deploy safely to staging');
assert.ok(fs.existsSync(path.join(outDir, 'SKILL.md')));
assert.ok(fs.existsSync(path.join(outDir, 'spec.json')));

const rubric = sdk.blindRubric(path.join(outDir, 'spec.json'), {
  dir: tmp,
  yanaRtBin,
});
assert.strictEqual(rubric.agent_self_report_included, false);
assert.strictEqual(rubric.deterministic_gate_passed, true);

// 4. Doctor Harness + RepoWiki + Memory Dream
const wiki = sdk.graphWiki(tmp, path.join(tmp, '.yana-ai', 'repowiki'), { yanaRtBin });
assert.strictEqual(wiki.cards.length, 3);

const harness = sdk.doctorHarness(tmp, { yanaRtBin });
assert.strictEqual(harness.repowiki_present, true);

const dream = sdk.memoryDream({ cwd: tmp, apply: false, yanaRtBin });
assert.strictEqual(dream.applied, false);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('yana-sdk tests passed: 10');
