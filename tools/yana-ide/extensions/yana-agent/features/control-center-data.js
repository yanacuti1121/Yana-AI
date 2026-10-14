'use strict';
// Dữ liệu cho Yana Control Center: trạng thái THẬT của các phần Yana AI trong thư mục đang mở. Mỗi dòng đọc từ một nguồn
// cụ thể (file, hoặc một lệnh chỉ đọc), không viết cứng. Nguồn nào không đọc được thì dòng đó hiện "unknown", không bao giờ
// hiện "ok". Hàm nhận `deps` để test thay lệnh và đường dẫn bằng bản giả.

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const EXEC_TIMEOUT_MS = 8000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const SANDBOX_IMAGE = 'yana-ai-sandbox:latest'; // cùng mặc định với core/scripts/sandbox-exec.sh
const GUARD_PROBE = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }); // chỉ đưa cho cổng chấm, không chạy

// Hai chỗ có thể chứa bản Yana: repo Yana AI (core/) hoặc dự án đã cài (.claude/).
const LAYOUTS = [
	{ hooks: 'core/hooks', scripts: 'core/scripts', skills: 'core/skills', agents: 'core/agents', commands: 'core/commands', rules: 'core/rules' },
	{ hooks: '.claude/hooks', scripts: '.claude/scripts', skills: '.claude/skills', agents: '.claude/agents', commands: '.claude/commands', rules: '.claude/rules' },
];

const item = (label, state, value, detail = '') => ({ label, state, value, detail });

function run(file, args, options = {}) {
	return new Promise(resolve => {
		const child = execFile(file, args, { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, cwd: options.cwd }, (error, stdout, stderr) => {
			const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
			resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || ''), missing: error?.code === 'ENOENT', timedOut: Boolean(error?.killed) });
		});
		if (options.input !== undefined) {
			child.stdin.on('error', () => {});
			child.stdin.end(options.input);
		}
	});
}

const realDeps = () => ({ run, exists: fs.existsSync, readText: file => fs.readFileSync(file, 'utf8'), list: dir => fs.readdirSync(dir) });

function firstExisting(root, rels, deps) {
	return rels.map(rel => path.join(root, rel)).find(candidate => deps.exists(candidate)) || '';
}

function countDirs(dir, marker, deps) {
	try {
		return deps.list(dir).filter(name => deps.exists(path.join(dir, name, marker))).length;
	} catch {
		return 0;
	}
}

// Đếm file theo đuôi, vào cả thư mục con (agent và lệnh nằm trong các thư mục nhóm).
function countFiles(dir, deps, suffix) {
	let total = 0;
	let names = [];
	try {
		names = deps.list(dir);
	} catch {
		return 0;
	}
	for (const name of names) {
		if (!name.includes('.')) total += countFiles(path.join(dir, name), deps, suffix);
		else if (!suffix || name.endsWith(suffix)) total += 1;
	}
	return total;
}

// ---- Runtime và capability
async function runtimeSection(root, ctx, deps) {
	const items = [];
	if (!ctx.binary) return { id: 'runtime', title: 'Runtime (yana-rt)', items: [item('yana-rt', 'bad', 'not found', 'Set yana.runtimePath or install yana-rt.')] };
	items.push(item('yana-rt', 'ok', ctx.version || 'found', ctx.binary));
	const result = await deps.run(ctx.binary, ['capability', 'list', '--root', root]);
	try {
		const list = JSON.parse(result.stdout).capabilities;
		const off = list.filter(entry => !entry.available);
		const needApproval = list.filter(entry => entry.approval !== 'none').length;
		items.push(item('Capabilities', 'ok', `${list.length - off.length} available of ${list.length}`, `${needApproval} need a human approval every time`));
		if (off.length) items.push(item('Not available in this build', 'warn', off.map(entry => entry.name).join(', '), 'These are compiled out or not configured.'));
	} catch {
		items.push(item('Capabilities', 'unknown', 'could not read', result.stderr.slice(0, 200)));
	}
	return { id: 'runtime', title: 'Runtime (yana-rt)', items };
}

// ---- Cổng chặn lệnh nguy hiểm: tự kiểm bằng một lệnh đáng chặn, không chạy gì cả
async function guardSection(ctx, deps) {
	if (!ctx.binary) return { id: 'guards', title: 'Built-in guards', items: [item('Dangerous-command guard', 'unknown', 'no runtime')] };
	const probe = await deps.run(ctx.binary, ['guard', 'destructive'], { input: GUARD_PROBE });
	const blocked = probe.code === 2 && probe.stdout.includes('"deny"');
	return {
		id: 'guards',
		title: 'Built-in guards',
		items: [
			item('Dangerous-command guard', blocked ? 'ok' : 'bad', blocked ? 'blocks `rm -rf /` (live test)' : 'did not block the test command', 'Sends a test command to the guard; nothing is executed.'),
		],
	};
}

// ---- Giám Thị
async function giamthiSection(root, deps) {
	const script = firstExisting(root, ['core/scripts/giamthi_service.py', '.claude/scripts/giamthi_service.py'], deps);
	const items = [];
	const halt = path.join(root, '.claude/state/GIAMTHI_HALT.lock');
	items.push(item('HALT lock', deps.exists(halt) ? 'bad' : 'ok', deps.exists(halt) ? 'present: everything is halted' : 'clear', halt));
	if (!script) {
		items.push(item('Giám Thị service', 'off', 'not in this project', 'The watcher script is part of the Yana AI pack.'));
		return { id: 'giamthi', title: 'Giám Thị (root safety authority)', items };
	}
	const result = await deps.run('python3', [script, 'status'], { cwd: root });
	if (result.missing) {
		items.push(item('Giám Thị service', 'unknown', 'python3 not found'));
		return { id: 'giamthi', title: 'Giám Thị (root safety authority)', items };
	}
	const fields = new Map(result.stdout.split('\n').map(line => /^([A-Za-z ]+):\s*(.*)$/.exec(line)).filter(Boolean).map(match => [match[1], match[2]]));
	const supervisor = fields.get('Supervisor') || 'unknown';
	items.push(item('Supervisor (runs outside the IDE)', /not installed/i.test(supervisor) ? 'warn' : 'ok', supervisor, 'Installing it changes the system, so it is never done automatically.'));
	items.push(item('Supervisor process', /not-loaded/i.test(fields.get('Runtime') || '') ? 'warn' : 'info', fields.get('Runtime') || 'unknown'));
	items.push(item('Watcher script', /present/i.test(fields.get('Watcher') || '') ? 'ok' : 'warn', fields.get('Watcher') || 'unknown'));
	if (fields.get('Warning')) items.push(item('Warning', 'warn', fields.get('Warning')));
	return { id: 'giamthi', title: 'Giám Thị (root safety authority)', items };
}

// ---- Sandbox
async function sandboxSection(root, deps) {
	const items = [];
	// yana-rt tìm đúng đường dẫn này (src/capability/command.rs), nên chỉ tính script ở đây.
	const rustScript = path.join(root, 'core/scripts/sandbox-exec.sh');
	const installedScript = path.join(root, '.claude/scripts/sandbox-exec.sh');
	const scriptOk = deps.exists(rustScript);
	items.push(item('Sandbox script', scriptOk ? 'ok' : 'bad', scriptOk ? 'core/scripts/sandbox-exec.sh' : 'missing',
		!scriptOk && deps.exists(installedScript) ? 'Found only at .claude/scripts: yana-rt looks in core/scripts, so commands run from the chat will not find it.' : 'yana-rt runs approved commands through this script.'));
	const docker = await deps.run('docker', ['info', '--format', '{{.ServerVersion}}']);
	const dockerUp = docker.code === 0 && docker.stdout.trim() !== '';
	items.push(item('Docker daemon', dockerUp ? 'ok' : 'warn', dockerUp ? `running ${docker.stdout.trim()}` : (docker.missing ? 'docker not installed' : 'not running'), 'Docker gives real isolation: no network, read-only root.'));
	let imageOk = false;
	if (dockerUp) {
		imageOk = (await deps.run('docker', ['image', 'inspect', SANDBOX_IMAGE])).code === 0;
		items.push(item('Sandbox image', imageOk ? 'ok' : 'warn', imageOk ? SANDBOX_IMAGE : `${SANDBOX_IMAGE} not built`));
	}
	let mode = 'ulimit fallback: resource limits only, NO file or network isolation';
	let state = 'warn';
	if (!scriptOk) { mode = 'unavailable'; state = 'bad'; }
	else if (dockerUp && imageOk) { mode = 'docker'; state = 'ok'; }
	items.push(item('Effective mode right now', state, mode));
	return { id: 'sandbox', title: 'Sandbox (where approved commands run)', items };
}

// ---- Gói Yana AI trong dự án: hook, thư viện, khóa lõi, chuỗi audit
function readWiredHooks(root, deps) {
	const file = path.join(root, '.claude/settings.json');
	if (!deps.exists(file)) return null;
	try {
		const hooks = JSON.parse(deps.readText(file)).hooks || {};
		const entries = [];
		for (const [event, groups] of Object.entries(hooks)) {
			for (const group of groups) {
				for (const hook of group.hooks || []) {
					const script = /([A-Za-z0-9_.-]+\.(?:sh|js|py))/.exec(hook.command || '');
					entries.push({ event, script: script ? script[1] : '' });
				}
			}
		}
		return entries;
	} catch {
		return undefined; // file có nhưng hỏng
	}
}

function packSection(root, deps) {
	const layout = LAYOUTS.find(candidate => deps.exists(path.join(root, candidate.hooks)));
	const items = [];
	const wired = readWiredHooks(root, deps);
	if (!layout) {
		items.push(item('Yana AI pack', 'off', 'not applied to this folder', 'No hooks directory (core/hooks or .claude/hooks).'));
		return { id: 'pack', title: 'Yana AI pack in this folder', items };
	}
	const scripts = deps.list(path.join(root, layout.hooks)).filter(name => /\.(sh|js|py)$/.test(name));
	const wiredScripts = new Set((wired || []).map(entry => entry.script).filter(Boolean));
	const unwired = scripts.filter(name => !wiredScripts.has(name));
	items.push(item('Hook scripts', 'info', String(scripts.length), layout.hooks));
	if (wired === null) items.push(item('Hooks wired in .claude/settings.json', 'bad', 'no settings.json', 'Scripts exist but nothing calls them.'));
	else if (wired === undefined) items.push(item('Hooks wired in .claude/settings.json', 'bad', 'settings.json is not valid JSON'));
	else items.push(item('Hooks wired in .claude/settings.json', 'ok', `${wired.length} entries, ${wiredScripts.size} different scripts`, 'These fire when Claude Code or Codex works in this folder, not in the IDE chat.'));
	if (wired && unwired.length) items.push(item('Hook scripts not wired', 'warn', String(unwired.length), unwired.join(', ')));
	items.push(item('Skills', 'info', String(countDirs(path.join(root, layout.skills), 'SKILL.md', deps))));
	items.push(item('Agents', 'info', String(countFiles(path.join(root, layout.agents), deps, '.md'))));
	items.push(item('Slash commands', 'info', String(countFiles(path.join(root, layout.commands), deps, '.md'))));
	items.push(item('Rules', 'info', String(countFiles(path.join(root, layout.rules), deps, '.md'))));
	items.push(...integrityItems(root, deps));
	return { id: 'pack', title: 'Yana AI pack in this folder', items };
}

function integrityItems(root, deps) {
	const items = [];
	const lock = path.join(root, 'core/config/core-lock.json');
	if (deps.exists(lock)) {
		let detail = '';
		try {
			const data = JSON.parse(deps.readText(lock));
			const count = data.files ? Object.keys(data.files).length : 0;
			detail = `${count} files pinned${data.generated_at ? `, generated ${data.generated_at}` : ''}`;
		} catch { detail = 'unreadable'; }
		items.push(item('Core lock', 'ok', 'present', detail));
	} else {
		items.push(item('Core lock', 'off', 'absent', 'core/config/core-lock.json is not in this folder.'));
	}
	const chain = path.join(root, '.claude/state/audit-chain.log');
	if (deps.exists(chain)) {
		let lines = 0;
		try { lines = deps.readText(chain).split('\n').filter(Boolean).length; } catch { lines = 0; }
		items.push(item('Audit chain', 'ok', `${lines} entries`, '.claude/state/audit-chain.log'));
	} else {
		items.push(item('Audit chain', 'off', 'no log yet', 'Written by the audit hook when Claude Code works here.'));
	}
	return items;
}

// ---- Cấu hình repo cần xác nhận
async function trustSection(root, ctx, deps) {
	if (!ctx.binary) return { id: 'trust', title: 'Repo configuration you must confirm', items: [item('Trust', 'unknown', 'no runtime')] };
	const result = await deps.run(ctx.binary, ['trust', 'status'], { cwd: root });
	const items = result.stdout.split('\n').filter(Boolean).map(line => {
		const [name, ...rest] = line.trim().split(/\s{2,}|\s+/);
		const status = rest.join(' ');
		const state = /confirmed|trusted/i.test(status) ? 'ok' : /changed/i.test(status) ? 'bad' : 'off';
		return item(name, state, status || 'unknown');
	});
	return { id: 'trust', title: 'Repo configuration you must confirm', items: items.length ? items : [item('Trust', 'unknown', 'could not read', result.stderr.slice(0, 200))] };
}

async function collect(root, ctx, deps = realDeps()) {
	const [runtime, guards, giamthi, sandbox, trust] = await Promise.all([
		runtimeSection(root, ctx, deps), guardSection(ctx, deps), giamthiSection(root, deps), sandboxSection(root, deps), trustSection(root, ctx, deps),
	]);
	return { generatedAt: new Date().toISOString(), root, sections: [giamthi, runtime, guards, sandbox, packSection(root, deps), trust] };
}

// Việc kiểm tra đầy đủ chạy theo yêu cầu (có thể ghi vào nhật ký audit), không chạy tự động khi mở màn.
const VERIFIERS = {
	coreLock: { label: 'Core lock', script: 'verify-core-lock.sh' },
	auditChain: { label: 'Audit chain', script: 'verify-audit-chain.sh' },
};

async function verify(root, kind, deps = realDeps()) {
	const verifier = VERIFIERS[kind];
	if (!verifier) throw new Error('Unknown check');
	const script = firstExisting(root, [`core/scripts/${verifier.script}`, `.claude/scripts/${verifier.script}`], deps);
	if (!script) return { label: verifier.label, ok: false, message: `${verifier.script} is not in this folder.` };
	const result = await deps.run('bash', [script], { cwd: root });
	const text = (result.stdout + result.stderr).trim().split('\n').slice(-6).join('\n');
	return { label: verifier.label, ok: result.code === 0, message: text || (result.code === 0 ? 'No problems found.' : `Exit code ${result.code}`) };
}

module.exports = { collect, verify, VERIFIERS, LAYOUTS };
