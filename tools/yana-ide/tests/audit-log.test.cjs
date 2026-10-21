// Kiểm tra phần đọc nhật ký kiểm toán (.claude/state/audit-chain.log) cho cửa sổ Audit Chain Log.
// Dùng: node tests/audit-log.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const path = require('node:path');
const Module = require('node:module');

const ext = process.argv[2] || path.resolve(__dirname, "../extensions/yana-agent");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'vscode' ? 'vscode' : origResolve.call(this, request, ...rest); };
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: {} };

const { summarizeAuditLog, MAX_ENTRIES } = require(path.join(ext, 'features/audit-log.js'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

const line = (n, decision, prev, tool = 'Bash') => JSON.stringify({ ts: `2026-10-14T06:00:${String(n).padStart(2, '0')}Z`, hook: 'audit-log', tool, agent: 'manual', input: 'SECRET-INPUT-DO-NOT-SHOW', decision, prev_hash: prev, hash: `h${n}`, degraded: false });
const chain = [line(1, 'allow', 'GENESIS'), line(2, 'deny', 'h1', 'Write'), line(3, 'warn', 'h2'), line(4, 'allow', 'h3', 'Read')].join('\n');

const ok = summarizeAuditLog(chain);
check('counts every entry and each decision', ok.total === 4 && ok.counts.allow === 2 && ok.counts.deny === 1 && ok.counts.warn === 1, JSON.stringify(ok.counts));
check('newest entries come first', ok.entries[0].tool === 'Read' && ok.entries[3].tool === 'Bash');
check('entries carry time, tool, hook and decision', ['ts', 'tool', 'hook', 'decision'].every(key => typeof ok.entries[0][key] === 'string'));
check('the logged input is never sent to the view', !JSON.stringify(ok).includes('SECRET-INPUT-DO-NOT-SHOW'));
check('an intact chain is reported as linked', ok.chain.linked === true && ok.chain.brokenAt === null, JSON.stringify(ok.chain));

const tampered = [line(1, 'allow', 'GENESIS'), line(3, 'warn', 'h2'), line(4, 'allow', 'h3')].join('\n');
const broken = summarizeAuditLog(tampered);
check('a removed line breaks the link and says where', broken.chain.linked === false && broken.chain.brokenAt === 2, JSON.stringify(broken.chain));

const withJunk = summarizeAuditLog(`${line(1, 'allow', 'GENESIS')}\nnot json at all\n\n${line(2, 'deny', 'h1')}\n{"half":`);
check('lines that are not valid entries are counted, not fatal', withJunk.total === 2 && withJunk.unreadable === 2, JSON.stringify({ total: withJunk.total, unreadable: withJunk.unreadable }));

const empty = summarizeAuditLog('');
check('an empty log is an empty summary', empty.total === 0 && empty.entries.length === 0 && empty.chain.linked === true);

const many = summarizeAuditLog(Array.from({ length: MAX_ENTRIES + 25 }, (_, i) => line(i % 60, 'allow', i === 0 ? 'GENESIS' : `h${(i - 1) % 60}`)).join('\n'));
check('only the newest entries are returned but all are counted', many.entries.length === MAX_ENTRIES && many.total === MAX_ENTRIES + 25);

const odd = summarizeAuditLog(JSON.stringify({ ts: 5, tool: { x: 1 }, decision: ['allow'], hook: null, prev_hash: 'GENESIS', hash: 'h1' }));
check('entries with wrong field types are shown as unknown, not crashes', odd.total === 1 && odd.entries[0].decision === 'unknown' && typeof odd.entries[0].tool === 'string');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
