'use strict';
const assert = require('assert');
const { listTasks, createTask, completeTask, dropTask } = require('./task-actions');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('FAIL:', name); }
}

const missingBin = { yanaRtBin: '/does/not/exist', existsSync: () => false };

check('listTasks: missing binary', listTasks({ repoRoot: '/r', ...missingBin }).ok === false);
check('createTask: missing binary', createTask({ repoRoot: '/r', name: 'x', ...missingBin }).ok === false);
check('completeTask: missing binary', completeTask({ repoRoot: '/r', id: 'x', evidence: 'e', ...missingBin }).ok === false);
check('dropTask: missing binary', dropTask({ repoRoot: '/r', id: 'x', ...missingBin }).ok === false);

const listSuccess = listTasks({
  repoRoot: '/r', yanaRtBin: '/fake', existsSync: () => true,
  exec: (bin, args, opts) => {
    assert.deepStrictEqual(args, ['task', 'list', '--json']);
    assert.strictEqual(opts.cwd, '/r');
    return JSON.stringify({ tasks: [{ id: 't1', name: 'do thing', status: 'open' }] });
  },
});
check('listTasks: success maps tasks and passes cwd', listSuccess.ok === true && listSuccess.tasks.length === 1 && listSuccess.tasks[0].id === 't1');

const createSuccess = createTask({
  repoRoot: '/r', name: 'new task', scope: 'backend', yanaRtBin: '/fake', existsSync: () => true,
  exec: (bin, args) => {
    assert.deepStrictEqual(args, ['task', 'create', 'new task', '--json', '--scope', 'backend']);
    return JSON.stringify({ id: 't2', name: 'new task', status: 'open' });
  },
});
check('createTask: success includes scope arg and maps task', createSuccess.ok === true && createSuccess.task.id === 't2');

const createNoScope = createTask({
  repoRoot: '/r', name: 'new task', yanaRtBin: '/fake', existsSync: () => true,
  exec: (bin, args) => {
    assert.deepStrictEqual(args, ['task', 'create', 'new task', '--json']);
    return JSON.stringify({ id: 't3' });
  },
});
check('createTask: omits --scope when not given', createNoScope.ok === true);

const completeSuccess = completeTask({
  repoRoot: '/r', id: 't1', evidence: '12 tests passed', yanaRtBin: '/fake', existsSync: () => true,
  exec: () => JSON.stringify({ id: 't1', status: 'done' }),
});
check('completeTask: success maps task', completeSuccess.ok === true && completeSuccess.task.status === 'done');

const dropSuccess = dropTask({
  repoRoot: '/r', id: 't1', yanaRtBin: '/fake', existsSync: () => true,
  exec: () => JSON.stringify({ id: 't1', ok: true }),
});
check('dropTask: success maps id', dropSuccess.ok === true && dropSuccess.id === 't1');

const listBadShape = listTasks({
  repoRoot: '/r', yanaRtBin: '/fake', existsSync: () => true,
  exec: () => JSON.stringify({ notTasks: [] }),
});
check('listTasks: malformed response reports ok:false', listBadShape.ok === false);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('task-actions unit tests passed: 9');
