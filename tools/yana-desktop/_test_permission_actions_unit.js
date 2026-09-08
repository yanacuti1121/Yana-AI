'use strict';
const assert = require('assert');
const { listCapabilities, listPendingApprovals, listLeases, revokeLease } = require('./permission-actions');

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('FAIL:', name); }
}

const missingBin = { yanaRtBin: '/does/not/exist', existsSync: () => false };

check('listCapabilities: missing binary', listCapabilities({ repoRoot: '/r', ...missingBin }).ok === false);
check('listPendingApprovals: missing binary', listPendingApprovals({ repoRoot: '/r', ...missingBin }).ok === false);
check('listLeases: missing binary', listLeases({ repoRoot: '/r', ...missingBin }).ok === false);
check('revokeLease: missing binary', revokeLease({ repoRoot: '/r', id: 'x', ...missingBin }).ok === false);

const capabilitiesSuccess = listCapabilities({
  repoRoot: '/r', yanaRtBin: '/fake', existsSync: () => true,
  exec: (bin, args, opts) => {
    assert.deepStrictEqual(args, ['capability', 'list', '--root', '/r']);
    assert.strictEqual(opts.cwd, undefined); // --root, not cwd, for the capability:: family
    return JSON.stringify({ capabilities: [{ name: 'repo.read', approval: 'none' }] });
  },
});
check(
  'listCapabilities: success uses --root (not cwd) and maps capabilities',
  capabilitiesSuccess.ok === true && capabilitiesSuccess.capabilities.length === 1 && capabilitiesSuccess.capabilities[0].name === 'repo.read',
);

const approvalsSuccess = listPendingApprovals({
  repoRoot: '/r', yanaRtBin: '/fake', existsSync: () => true,
  exec: (bin, args, opts) => {
    assert.deepStrictEqual(args, ['authority', 'pending-approvals', '--json']);
    assert.strictEqual(opts.cwd, '/r'); // CWD-relative, like lease/task — no --root arg
    return JSON.stringify([{ id: 'a1' }]);
  },
});
check(
  'listPendingApprovals: success passes cwd (not --root) and maps approvals',
  approvalsSuccess.ok === true && approvalsSuccess.approvals.length === 1 && approvalsSuccess.approvals[0].id === 'a1',
);

const leasesSuccess = listLeases({
  repoRoot: '/r', yanaRtBin: '/fake', existsSync: () => true,
  exec: (bin, args, opts) => {
    assert.deepStrictEqual(args, ['lease', 'list', '--json']);
    assert.strictEqual(opts.cwd, '/r');
    return JSON.stringify([{ id: 'l1', revoked: false }]);
  },
});
check(
  'listLeases: success passes cwd and maps leases',
  leasesSuccess.ok === true && leasesSuccess.leases.length === 1 && leasesSuccess.leases[0].id === 'l1',
);

const revokeSuccess = revokeLease({
  repoRoot: '/r', id: 'l1', yanaRtBin: '/fake', existsSync: () => true,
  exec: (bin, args, opts) => {
    assert.deepStrictEqual(args, ['lease', 'revoke', 'l1', '--json']);
    assert.strictEqual(opts.cwd, '/r');
    return JSON.stringify({ revoked: 'l1' });
  },
});
check('revokeLease: success maps revoked id', revokeSuccess.ok === true && revokeSuccess.id === 'l1');

const capabilitiesBadShape = listCapabilities({
  repoRoot: '/r', yanaRtBin: '/fake', existsSync: () => true,
  exec: () => JSON.stringify({ notCapabilities: [] }),
});
check('listCapabilities: malformed response reports ok:false', capabilitiesBadShape.ok === false);

const approvalsBadShape = listPendingApprovals({
  repoRoot: '/r', yanaRtBin: '/fake', existsSync: () => true,
  exec: () => JSON.stringify({ notAnArray: true }),
});
check('listPendingApprovals: malformed response reports ok:false', approvalsBadShape.ok === false);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('permission-actions unit tests passed: 9');
