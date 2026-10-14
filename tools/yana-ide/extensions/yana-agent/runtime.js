'use strict';
// Cầu nối NDJSON tới `yana-rt chat --headless` / `--resume-approval`.
// Origin: rút gọn từ tools/yana-studio/host/runtime.cjs (cùng repo, cùng tác giả).
// Giao thức: src/chat/headless.rs (HeadlessTurnInput, HeadlessResumeInput, write_event).

const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_LINE_BYTES = 1024 * 1024; // giới hạn 1 dòng giao thức, khớp bản Studio cũ
const TURN_TIMEOUT_MS = 10 * 60 * 1000; // 10 phút mỗi turn, khớp bản Studio cũ
const KILL_GRACE_MS = 1500; // chờ SIGTERM trước khi SIGKILL
const TERMINAL_TYPES = ['completed', 'awaiting_approval', 'cancelled', 'error'];
const SEARCH_DIRS = [path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];

function resolveBinary(configured) {
	const candidates = configured ? [configured] : SEARCH_DIRS.map(dir => path.join(dir, 'yana-rt'));
	for (const candidate of candidates) {
		try {
			fs.accessSync(candidate, fs.constants.X_OK);
			return candidate;
		} catch {
			// thử ứng viên tiếp theo
		}
	}
	return '';
}

function runtimeVersion(binary) {
	return new Promise(resolve => {
		if (!binary) {
			resolve('');
			return;
		}
		execFile(binary, ['--version'], { timeout: 5000 }, (error, stdout) => {
			resolve(error ? '' : String(stdout).trim().replace(/^yana-rt\s+/, ''));
		});
	});
}

function redactor(secret) {
	return text => (secret ? text.split(secret).join('[redacted]') : text);
}

// options: { binary, cwd, provider, model, resume, payload }
function startTurn(options, onEvent, onFinish) {
	const args = ['chat', options.resume ? '--resume-approval' : '--headless', '--provider', options.provider];
	if (!options.resume && options.model) {
		args.push('--model', options.model);
	}
	const child = spawn(options.binary, args, {
		cwd: options.cwd,
		stdio: ['pipe', 'pipe', 'pipe'],
		detached: process.platform !== 'win32',
		env: process.env,
	});
	const redact = redactor(options.payload.api_key);
	const state = { buffer: '', stderr: '', stopped: false, failure: '', sawTerminal: false, killTimer: undefined };

	const publish = event => {
		if (TERMINAL_TYPES.includes(event.type)) {
			state.sawTerminal = true;
		}
		onEvent(JSON.parse(redact(JSON.stringify(event))));
	};
	const acceptLine = line => {
		if (!line.trim()) {
			return;
		}
		if (line.length > MAX_LINE_BYTES) {
			throw new Error('Runtime protocol line exceeds 1 MiB');
		}
		const event = JSON.parse(line);
		if (typeof event?.type !== 'string') {
			throw new Error('Runtime emitted an invalid event');
		}
		publish(event);
	};
	const signal = name => {
		try {
			process.kill(-child.pid, name);
		} catch {
			child.kill(name);
		}
	};
	const kill = () => {
		signal('SIGTERM');
		clearTimeout(state.killTimer);
		state.killTimer = setTimeout(() => signal('SIGKILL'), KILL_GRACE_MS);
	};
	const watchdog = setTimeout(() => {
		state.failure = 'Runtime exceeded the 10-minute turn limit';
		kill();
	}, TURN_TIMEOUT_MS);

	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', chunk => {
		if (state.failure || state.stopped) {
			return;
		}
		try {
			state.buffer += chunk;
			let boundary;
			while ((boundary = state.buffer.indexOf('\n')) !== -1) {
				acceptLine(state.buffer.slice(0, boundary));
				state.buffer = state.buffer.slice(boundary + 1);
			}
		} catch (error) {
			state.failure = error.message;
			kill();
		}
	});
	child.stderr.on('data', chunk => {
		state.stderr = (state.stderr + chunk).slice(-4000);
	});
	child.on('error', error => {
		state.failure = error.message;
	});
	child.on('close', code => {
		clearTimeout(watchdog);
		clearTimeout(state.killTimer);
		if (!state.stopped && !state.failure) {
			try {
				acceptLine(state.buffer);
			} catch (error) {
				state.failure = error.message;
			}
		}
		if (state.stopped) {
			publish({ type: 'cancelled', partial: '' });
		} else if (state.failure || !state.sawTerminal) {
			const message = state.failure || state.stderr || `Runtime exited without completion (${code})`;
			publish({ type: 'error', message: redact(message).slice(0, 1500) });
		}
		onFinish(code);
	});
	child.stdin.on('error', error => {
		if (!state.stopped) {
			state.failure = state.failure || error.message;
		}
	});
	child.stdin.end(JSON.stringify(options.payload));

	return {
		stop() {
			if (!state.stopped) {
				state.stopped = true;
				kill();
			}
		},
	};
}

const PROBE_TIMEOUT_MS = 5000; // yana-rt trả lời lời thăm dò ngay, không chạm mạng
const probeCache = new Map();

// Bản yana-rt cũ từ chối trường lạ bằng "invalid headless turn JSON"; bản mới kiểm tra giá trị `mode` và từ chối
// giá trị thăm dò bằng chính câu "mode must be ...". Không đọc số phiên bản vì bản build tự tay cũng có số cũ.
function supportsTurnControls(binary) {
	if (!binary) return Promise.resolve(false);
	if (!probeCache.has(binary)) {
		probeCache.set(binary, new Promise(resolve => {
			let out = '';
			let child;
			try {
				child = spawn(binary, ['chat', '--headless', '--provider', 'ollama'], { stdio: ['pipe', 'pipe', 'ignore'] });
			} catch {
				resolve(false);
				return;
			}
			const timer = setTimeout(() => { child.kill(); resolve(false); }, PROBE_TIMEOUT_MS);
			child.stdout.on('data', chunk => { out = (out + chunk).slice(-2000); });
			child.on('error', () => { clearTimeout(timer); resolve(false); });
			child.on('close', () => { clearTimeout(timer); resolve(out.includes('mode must be')); });
			child.stdin.on('error', () => {});
			child.stdin.end(JSON.stringify({ task: 'probe', mode: '__probe__' }));
		}));
	}
	return probeCache.get(binary);
}

function forgetProbe() {
	probeCache.clear();
}

module.exports = { resolveBinary, runtimeVersion, startTurn, supportsTurnControls, forgetProbe };
