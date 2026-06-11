'use strict';
// Tests for missions.js — create/list/update/delete, task sanitization,
// status auto-transitions, persistence. Run: node _test_missions.js
//
// Uses a throwaway YANA_DATA_DIR so the real .yana/ is never touched.
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-missions-test-'));
process.env.YANA_DATA_DIR = DATA_DIR;
const missions = require('./missions.js');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else      { fail++; console.log('FAIL  ' + name); }
}

function mockRes() {
  return {
    status: 0, body: null,
    writeHead(s) { this.status = s; },
    end(b) { this.body = b ? JSON.parse(b) : null; },
  };
}
const req = {}; // handlers don't read the request

const routeOk   = async () => ({ route: 'complex', suggested_skill: 'tdd' });
const routeBoom = async () => { throw new Error('router down'); };

(async () => {
  // ── empty list ──────────────────────────────────────────────────────────────
  let res = mockRes();
  missions.handleList(req, res);
  t('list starts empty', res.status === 200 && res.body.missions.length === 0);

  // ── create validation ───────────────────────────────────────────────────────
  res = mockRes();
  await missions.handleCreate(req, res, {}, routeOk);
  t('create without name → 400', res.status === 400);

  res = mockRes();
  await missions.handleCreate(req, res, { name: '   ' }, routeOk);
  t('create whitespace name → 400', res.status === 400);

  // ── create ok ───────────────────────────────────────────────────────────────
  res = mockRes();
  await missions.handleCreate(req, res, { name: 'implement auth' }, routeOk);
  const m1 = res.body.mission;
  t('create → 200 with id', res.status === 200 && !!m1.id);
  t('create stores route from classifier', m1.route === 'complex' && m1.skill === 'tdd');
  t('create seeds 2 starter tasks', m1.tasks.length === 2);
  t('progress computed, never stored blindly (1/2 done = 50)', m1.progress === 50);

  // ── classifier failure must not block creation ─────────────────────────────
  res = mockRes();
  await missions.handleCreate(req, res, { name: 'second mission' }, routeBoom);
  t('create survives routeFn throw (route=null)', res.status === 200 && res.body.mission.route === null);

  // ── name cap ────────────────────────────────────────────────────────────────
  res = mockRes();
  await missions.handleCreate(req, res, { name: 'x'.repeat(500) }, routeOk);
  t('create caps name at 200 chars', res.body.mission.name.length === 200);

  // ── update: rename + task sanitization ─────────────────────────────────────
  res = mockRes();
  missions.handleUpdate(req, res, {
    id: m1.id,
    name: 'renamed',
    tasks: [
      { name: 'design', agent: 'database-expert', state: 'done' },
      { name: 'build',  agent: 'backend-developer', state: 'INVALID' },
      { name: '', state: 'queued' },                       // nameless → dropped
      { name: 'y'.repeat(500), state: 'queued' },          // long name → capped
    ],
  });
  const m2 = res.body.mission;
  t('update renames', m2.name === 'renamed');
  t('update drops nameless task (3 kept)', m2.tasks.length === 3);
  t('update coerces invalid state → queued', m2.tasks[1].state === 'queued');
  t('update caps task name at 200', m2.tasks[2].name.length === 200);

  // ── status auto-transitions ─────────────────────────────────────────────────
  res = mockRes();
  missions.handleUpdate(req, res, {
    id: m1.id,
    tasks: [{ name: 'a', state: 'done' }, { name: 'b', state: 'done' }],
  });
  t('all tasks done → status auto-done, progress 100',
    res.body.mission.status === 'done' && res.body.mission.progress === 100);

  res = mockRes();
  missions.handleUpdate(req, res, {
    id: m1.id,
    tasks: [{ name: 'a', state: 'done' }, { name: 'b', state: 'active' }],
  });
  t('active task on done mission → status flips active', res.body.mission.status === 'active');

  // ── task cap ────────────────────────────────────────────────────────────────
  const many = Array.from({ length: 35 }, (_, i) => ({ name: 'task ' + i, state: 'queued' }));
  res = mockRes();
  missions.handleUpdate(req, res, { id: m1.id, tasks: many });
  t('update caps tasks at 30', res.body.mission.tasks.length === 30);

  // ── update/delete errors ────────────────────────────────────────────────────
  res = mockRes();
  missions.handleUpdate(req, res, { id: 'nope' });
  t('update unknown id → 404', res.status === 404);

  res = mockRes();
  missions.handleDelete(req, res, {});
  t('delete without id → 400', res.status === 400);

  res = mockRes();
  missions.handleDelete(req, res, { id: 'nope' });
  t('delete unknown id → 404', res.status === 404);

  // ── delete + persistence ────────────────────────────────────────────────────
  res = mockRes();
  missions.handleDelete(req, res, { id: m1.id });
  t('delete → ok', res.status === 200 && res.body.ok === true);

  res = mockRes();
  missions.handleList(req, res);
  t('list reflects delete (2 left)', res.body.missions.length === 2);

  const onDisk = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'missions.json'), 'utf8'));
  t('missions persisted to YANA_DATA_DIR', Array.isArray(onDisk) && onDisk.length === 2);
  t('progress is computed, not persisted', !('progress' in onDisk[0]));

  // ── result ──────────────────────────────────────────────────────────────────
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
