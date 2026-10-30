// Kiểm tra phần biến trạng thái `yana-rt status --json` thành dòng cho view Status.
// Dùng: node tests/status-model.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const path = require('node:path');

const ext = process.argv[2] || path.resolve(__dirname, '../extensions/yana-agent');
const { toRows, failureRows, clean, engineLabel, expiresIn } = require(path.join(ext, 'features/status-model.js'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

const NOW = new Date('2026-10-30T10:00:00Z');
const snap = (extra = {}) => ({ schema: 1, state: 'idle', attention: [], engines: [], approvals: [], audit: [], halted: false, unavailable: [], ...extra });
const text = value => JSON.stringify(value);

// Mỗi trạng thái có nhãn và biểu tượng riêng; trạng thái lạ thành unknown.
for (const state of ['halted', 'ask', 'deny', 'run', 'idle', 'unknown']) {
	const out = toRows(snap({ state }), NOW);
	check(`state ${state} gets its own headline`, out.state === state && out.rows[0].label.length > 0 && out.rows[0].icon.length > 0);
}
check('an unknown state name falls back to unknown', toRows(snap({ state: 'bogus' }), NOW).state === 'unknown');

// Yêu cầu chờ duyệt: chỉ hiện khả năng, lý do, hạn; không bao giờ hiện lệnh hay hội thoại.
const waiting = toRows(snap({
	state: 'ask',
	attention: ['approval_pending'],
	approvals: [{ id: 'a1', capability: 'run_command', reason: 'needs a person', expires_at: '2026-10-30T10:20:00Z', pending_call: { arguments_json: 'curl -H "Authorization: Bearer SECRET-TOKEN-123"' }, messages: ['SECRET-CHAT'] }],
}), NOW);
const group = waiting.rows.find(row => row.label === 'Waiting for you');
check('a pending approval is listed with its capability and time left', group && group.children[0].label === 'run_command' && group.children[0].description === '20 min left', text(group));
check('the badge counts what needs a person', waiting.attention === 1);
check('no raw command or conversation reaches the view', !text(waiting).includes('SECRET'), text(waiting));
check('the tooltip tells the person where to decide', group.children[0].tooltip.includes('terminal'));
check('an expired approval says so', expiresIn('2026-10-30T09:00:00Z', NOW) === 'expired');
check('a bad date shows nothing instead of NaN', expiresIn('not a date', NOW) === '');

// Engine và audit.
const running = toRows(snap({ state: 'run', engines: [{ name: 'Claude Code', count: 4 }, { name: 'Antigravity', count: 3 }], audit: [{ ts: 't', tool: 'Bash', decision: 'allow' }, { ts: 't', tool: 'Edit', decision: 'deny' }] }), NOW);
const engines = running.rows.find(row => row.label === 'Running');
check('Claude Code shows a count, other engines do not', engines.children[0].label === 'Claude Code ×4' && engines.children[1].label === 'Antigravity');
const recent = running.rows.find(row => row.label === 'Recent activity');
check('audit rows carry tool, decision and an icon', recent.children[0].label === 'Bash' && recent.children[0].icon === 'pass' && recent.children[1].icon === 'error');
check('empty sections add no rows', toRows(snap(), NOW).rows.length === 1);

// Nguồn không đọc được: không được trông yên ổn.
const partial = toRows(snap({ state: 'unknown', approvals: null, engines: null, audit: null, unavailable: ['approvals', 'engines'] }), NOW);
check('null sections do not crash and are named', partial.rows.some(row => row.label === 'Could not read: approvals, engines'), text(partial));
check('an unreadable source keeps the headline at unknown', partial.state === 'unknown');

// Định dạng lạ và lỗi lệnh.
check('a different schema is refused with a clear row', toRows({ schema: 2 }, NOW).rows[0].label.includes('schema 2'));
check('a missing snapshot is refused, not a crash', toRows(null, NOW).rows[0].label.includes('Unsupported') && toRows(undefined, NOW).state === 'unknown');
check('an old yana-rt without the command is explained', failureRows(new Error('yana-rt status --json: error: unrecognized subcommand \'status\''))?.[0].label.includes('no "status" command'));
check('other failures are not swallowed', failureRows(new Error('disk on fire')) === null);

// Ca biên: chuỗi rỗng, rất dài, ký tự điều khiển, null byte.
check('control characters become spaces', clean('a\u0000b\nc\td') === 'a b c d');
check('a 65536 character value is cut', clean('x'.repeat(65536)).length <= 120);
check('empty and nullish text is empty', clean('') === '' && clean(null) === '' && clean(undefined) === '');
check('a hostile engine name is cleaned', !engineLabel({ name: 'bad\u0000name', count: 9 }).includes('\u0000'));
const hostile = toRows(snap({ state: 'ask', approvals: [{ capability: 'x\u0000'.repeat(1000), reason: 'y'.repeat(65536), expires_at: 'z' }, null, 'junk'] }), NOW);
check('hostile approval entries do not crash or flood the view', text(hostile).length < 5000, String(text(hostile).length));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
