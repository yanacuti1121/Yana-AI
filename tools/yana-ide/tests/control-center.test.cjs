// Kiểm tra dữ liệu của Yana Control Center (features/control-center-data.js) bằng lệnh và thư mục giả, rồi một lượt chạy thật
// trên repo hiện tại (chỉ đọc). Điều cần chứng minh: không có dòng nào báo "ok" khi nguồn không đọc được.
// Dùng: node tests/control-center.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ext = process.argv[2];
const dataModule = require(path.join(ext, 'features/control-center-data.js'));
const { collect, verify } = dataModule;

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

const make = files => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-cc-'));
	for (const [rel, content] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		fs.writeFileSync(path.join(root, rel), content);
	}
	return root;
};
const find = (snapshot, sectionId, label) => snapshot.sections.find(section => section.id === sectionId).items.find(entry => entry.label === label);
const realFs = { exists: fs.existsSync, readText: file => fs.readFileSync(file, 'utf8'), list: dir => fs.readdirSync(dir) };
const fakeRun = table => async (file, args, options = {}) => {
	const key = [file, ...args].join(' ');
	for (const [pattern, result] of Object.entries(table)) {
		if (key.includes(pattern)) return { code: 0, stdout: '', stderr: '', missing: false, ...(typeof result === 'function' ? result(options) : result) };
	}
	return { code: 1, stdout: '', stderr: 'not faked', missing: false };
};
const GUARD_DENY = { code: 2, stdout: '{"hookSpecificOutput":{"permissionDecision":"deny"}}' };
const CAPS = JSON.stringify({ capabilities: [{ name: 'repo.read', available: true, approval: 'none' }, { name: 'file.write', available: true, approval: 'human_approval_per_call' }, { name: 'mcp.call', available: false, approval: 'human_approval_per_call' }] });

(async () => {
	// 1. Thư mục trống, không có runtime
	const empty = make({});
	let s = await collect(empty, { binary: '', version: '' }, { ...realFs, run: fakeRun({}) });
	check('no runtime is reported as a problem, not ok', find(s, 'runtime', 'yana-rt').state === 'bad');
	check('no runtime means the guard test is unknown, never ok', find(s, 'guards', 'Dangerous-command guard').state === 'unknown');
	check('an empty folder has no Yana pack', find(s, 'pack', 'Yana AI pack').state === 'off');
	check('an empty folder has no Giám Thị service', find(s, 'giamthi', 'Giám Thị service').state === 'off');
	check('an empty folder has no sandbox script', find(s, 'sandbox', 'Sandbox script').state === 'bad');
	check('no folder state claims ok for the effective sandbox mode', find(s, 'sandbox', 'Effective mode right now').state === 'bad');

	// 2. Runtime và cổng chặn
	const ctx = { binary: '/fake/yana-rt', version: '1.5.1' };
	s = await collect(empty, ctx, { ...realFs, run: fakeRun({ 'capability list': { stdout: CAPS }, 'guard destructive': GUARD_DENY, 'trust status': { stdout: 'web-search   not present\nmcp-servers  confirmed\nlsp-servers  changed\n' } }) });
	check('capabilities counted from the real JSON shape', find(s, 'runtime', 'Capabilities').value === '2 available of 3');
	check('unavailable capabilities are named', find(s, 'runtime', 'Not available in this build').value === 'mcp.call');
	check('guard that denies the test command is ok', find(s, 'guards', 'Dangerous-command guard').state === 'ok');
	check('trust: confirmed is ok, changed is a problem, not present is off',
		find(s, 'trust', 'mcp-servers').state === 'ok' && find(s, 'trust', 'lsp-servers').state === 'bad' && find(s, 'trust', 'web-search').state === 'off');
	s = await collect(empty, ctx, { ...realFs, run: fakeRun({ 'guard destructive': { code: 0, stdout: '' }, 'capability list': { stdout: 'not json' } }) });
	check('a guard that lets the test command through is a problem', find(s, 'guards', 'Dangerous-command guard').state === 'bad');
	check('unreadable capability output is unknown, never ok', find(s, 'runtime', 'Capabilities').state === 'unknown');

	// 3. Gói đã áp dụng
	const pack = make({
		'core/hooks/a.sh': '', 'core/hooks/b.sh': '', 'core/hooks/c.js': '', 'core/hooks/notes.txt': '',
		'.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ command: 'bash .claude/hooks/a.sh' }] }], Stop: [{ hooks: [{ command: 'bash b.sh' }, { command: 'echo hi' }] }] } }),
		'core/skills/one/SKILL.md': '', 'core/skills/two/SKILL.md': '', 'core/skills/not-a-skill/readme.md': '',
		'core/agents/x.md': '', 'core/agents/y.md': '', 'core/commands/z.md': '', 'core/rules/r1.md': '',
		'core/config/core-lock.json': JSON.stringify({ generated_at: '2026-10-01', files: { a: 'h', b: 'h' } }),
		'.claude/state/audit-chain.log': 'l1\nl2\nl3\n',
	});
	s = await collect(pack, { binary: '', version: '' }, { ...realFs, run: fakeRun({}) });
	check('hook scripts counted, non-scripts ignored', find(s, 'pack', 'Hook scripts').value === '3');
	check('wired entries counted (3 entries, 2 scripts)', /^3 entries, 2 different scripts/.test(find(s, 'pack', 'Hooks wired in .claude/settings.json').value));
	check('the unwired script is named', find(s, 'pack', 'Hook scripts not wired').detail === 'c.js');
	check('skills counted only when SKILL.md exists', find(s, 'pack', 'Skills').value === '2');
	check('agents, commands and rules counted', find(s, 'pack', 'Agents').value === '2' && find(s, 'pack', 'Slash commands').value === '1' && find(s, 'pack', 'Rules').value === '1');
	check('core lock is read with its pinned file count', find(s, 'pack', 'Core lock').detail.startsWith('2 files pinned'));
	check('audit chain entries counted', find(s, 'pack', 'Audit chain').value === '3 entries');

	// 4. settings.json hỏng, hoặc thiếu
	const broken = make({ 'core/hooks/a.sh': '', '.claude/settings.json': '{ nope' });
	s = await collect(broken, { binary: '', version: '' }, { ...realFs, run: fakeRun({}) });
	check('invalid settings.json is a problem, not ok', find(s, 'pack', 'Hooks wired in .claude/settings.json').state === 'bad');
	const noSettings = make({ 'core/hooks/a.sh': '' });
	s = await collect(noSettings, { binary: '', version: '' }, { ...realFs, run: fakeRun({}) });
	check('scripts without settings.json are flagged: nothing calls them', find(s, 'pack', 'Hooks wired in .claude/settings.json').state === 'bad');

	// 5. HALT
	const halted = make({ '.claude/state/GIAMTHI_HALT.lock': 'x' });
	s = await collect(halted, { binary: '', version: '' }, { ...realFs, run: fakeRun({}) });
	check('a HALT lock is shown as a problem', find(s, 'giamthi', 'HALT lock').state === 'bad');
	s = await collect(empty, { binary: '', version: '' }, { ...realFs, run: fakeRun({}) });
	check('no HALT lock is clear', find(s, 'giamthi', 'HALT lock').state === 'ok');

	// 6. Giám Thị đọc từ lệnh status
	const gt = make({ 'core/scripts/giamthi_service.py': '' });
	s = await collect(gt, { binary: '', version: '' }, { ...realFs, run: fakeRun({ 'giamthi_service.py status': { stdout: 'Target: /x\nSupervisor: not installed\nRuntime: not-loaded\nWatcher: present\nHALT: clear\nWarning: another service points elsewhere\n' } }) });
	check('uninstalled supervisor is a warning', find(s, 'giamthi', 'Supervisor (runs outside the IDE)').state === 'warn');
	check('watcher script present is ok', find(s, 'giamthi', 'Watcher script').state === 'ok');
	check('a warning line is passed through', find(s, 'giamthi', 'Warning').value.includes('elsewhere'));
	s = await collect(gt, { binary: '', version: '' }, { ...realFs, run: fakeRun({ 'giamthi_service.py status': { missing: true, code: -1 } }) });
	check('python3 missing is unknown', find(s, 'giamthi', 'Giám Thị service').state === 'unknown');

	// 7. Sandbox
	const sandboxed = make({ 'core/scripts/sandbox-exec.sh': '' });
	s = await collect(sandboxed, { binary: '', version: '' }, { ...realFs, run: fakeRun({ 'docker info': { stdout: '29.0\n' }, 'image inspect': { code: 0 } }) });
	check('script + docker + image means docker mode', find(s, 'sandbox', 'Effective mode right now').value === 'docker' && find(s, 'sandbox', 'Effective mode right now').state === 'ok');
	s = await collect(sandboxed, { binary: '', version: '' }, { ...realFs, run: fakeRun({ 'docker info': { stdout: '29.0\n' }, 'image inspect': { code: 1 } }) });
	check('docker up but no image falls back to ulimit and says so', /NO file or network isolation/.test(find(s, 'sandbox', 'Effective mode right now').value) && find(s, 'sandbox', 'Sandbox image').state === 'warn');
	s = await collect(sandboxed, { binary: '', version: '' }, { ...realFs, run: fakeRun({ 'docker info': { code: 1 } }) });
	check('docker down falls back to ulimit and says so', /ulimit/.test(find(s, 'sandbox', 'Effective mode right now').value) && find(s, 'sandbox', 'Docker daemon').state === 'warn');
	s = await collect(sandboxed, { binary: '', version: '' }, { ...realFs, run: fakeRun({ 'docker info': { missing: true, code: -1 } }) });
	check('docker not installed is reported as such', find(s, 'sandbox', 'Docker daemon').value === 'docker not installed');
	const installedOnly = make({ '.claude/scripts/sandbox-exec.sh': '' });
	s = await collect(installedOnly, { binary: '', version: '' }, { ...realFs, run: fakeRun({ 'docker info': { stdout: '29.0\n' }, 'image inspect': { code: 0 } }) });
	check('script only under .claude/scripts is flagged because yana-rt looks in core/scripts',
		find(s, 'sandbox', 'Sandbox script').state === 'bad' && /core\/scripts/.test(find(s, 'sandbox', 'Sandbox script').detail) && find(s, 'sandbox', 'Effective mode right now').value === 'unavailable');

	// 8. Phép kiểm theo yêu cầu
	let threw = false;
	try { await verify(empty, 'rm-rf', { ...realFs, run: fakeRun({}) }); } catch { threw = true; }
	check('an unknown check name is refused', threw);
	let r = await verify(empty, 'coreLock', { ...realFs, run: fakeRun({}) });
	check('a check whose script is missing reports failure, not success', r.ok === false && /not in this folder/.test(r.message));
	const withScripts = make({ 'core/scripts/verify-core-lock.sh': '', 'core/scripts/verify-audit-chain.sh': '' });
	r = await verify(withScripts, 'coreLock', { ...realFs, run: fakeRun({ 'verify-core-lock.sh': { code: 0, stdout: 'intact\n' } }) });
	check('exit 0 is a pass and shows the output', r.ok === true && r.message === 'intact');
	r = await verify(withScripts, 'auditChain', { ...realFs, run: fakeRun({ 'verify-audit-chain.sh': { code: 1, stdout: 'CHAIN BROKEN line 4\n' } }) });
	check('exit 1 is a failure and shows why', r.ok === false && /CHAIN BROKEN/.test(r.message));

	// 9. Một lượt thật trên repo hiện tại, chỉ đọc
	const repo = path.resolve(ext, '../../../..');
	const rt = path.join(repo, 'target/debug/yana-rt');
	const live = await collect(repo, { binary: fs.existsSync(rt) ? rt : '', version: 'live' });
	check('live: six sections come back', live.sections.length === 6, String(live.sections.length));
	check('live: every item has a state and a label', live.sections.every(section => section.items.every(entry => entry.label && entry.state)));
	if (fs.existsSync(rt)) {
		check('live: the real guard blocks the test command', find(live, 'guards', 'Dangerous-command guard').state === 'ok');
		check('live: the real runtime lists capabilities', /available of \d+/.test(find(live, 'runtime', 'Capabilities').value), find(live, 'runtime', 'Capabilities').value);
	}
	check('live: this repo has the pack (hook scripts counted)', Number(find(live, 'pack', 'Hook scripts').value) > 0);

	for (const dir of [empty, pack, broken, noSettings, halted, gt, sandboxed, installedOnly, withScripts]) fs.rmSync(dir, { recursive: true, force: true });
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
