// Chạy thật qua đúng module mà extension dùng (runtime.js, features/canvas-ai.js) với model Ollama local.
// 1) chat thường, 2) lượt cần dùng công cụ → awaiting_approval → từ chối → resume, 3) Canvas sinh HTML.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const ext = process.argv[2] || path.resolve(__dirname, "../extensions/yana-agent");
const model = process.argv[3] || 'llama3.2:latest';
const { resolveBinary, startTurn } = require(path.join(ext, 'runtime.js'));
const canvasAi = require(path.join(ext, 'features/canvas-ai.js'));
const binary = resolveBinary('');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-e2e-'));
fs.writeFileSync(path.join(work, 'notes.txt'), 'The secret word is ORCHID.\n');
if (process.env.WITH_MARKER) {
	fs.mkdirSync(path.join(work, '.claude/state'), { recursive: true });
	fs.writeFileSync(path.join(work, '.claude/state/locking-protocol-version'), 'flock-v1\n');
}

function turn(label, options) {
	const started = Date.now();
	return new Promise(resolve => {
		const events = [];
		let text = '';
		startTurn({ binary, cwd: work, provider: 'ollama', model, ...options }, event => {
			events.push(event.type);
			if (event.type === 'text_delta') text += event.text || '';
			if (event.type === 'completed' && event.message) text = event.message;
			if (event.type === 'error') text += `[error] ${event.message}`;
			if (event.type === 'awaiting_approval') events.approval = event;
		}, () => {
			const types = [...new Set(events)].join(',');
			console.log(`\n== ${label} (${((Date.now() - started) / 1000).toFixed(1)}s) events: ${types}`);
			console.log(text.slice(0, 400));
			resolve({ events, text, approval: events.approval });
		});
	});
}

(async () => {
	console.log('binary', binary, 'model', model);
	const session = crypto.randomUUID();
	const a = await turn('chat', { resume: false, payload: { task: 'Reply with exactly one word: PONG', session_id: session, history: [] } });
	const b = await turn('tool turn', { resume: false, payload: { task: 'Use the run_command tool to run: ls', session_id: crypto.randomUUID(), history: [] } });
	let c = null;
	if (b.approval) {
		console.log('approval request:', JSON.stringify(b.approval).slice(0, 300));
		c = await turn('resume (deny)', { resume: true, payload: { approval_id: b.approval.approval_id || b.approval.id, decision: false, decided_by: 'human:e2e-test' } });
	}
	const task = canvasAi.buildTask({ mode: 'new', instruction: 'A login screen with email, password and a sign-in button', device: 'phone', currentHtml: '' });
	const d = await turn('canvas', { resume: false, payload: { task, session_id: crypto.randomUUID(), history: [], system: canvasAi.systemPrompt(null) } });
	const html = canvasAi.extractHtml(d.text);
	console.log('\ncanvas html chars:', html ? html.length : 0, '| has <script>:', /<script/i.test(html || ''));
	const ok = {
		chat: a.events.includes('completed') && /pong/i.test(a.text),
		approvalRequested: Boolean(b.approval),
		denyResumed: c ? c.events.includes('completed') || c.events.includes('cancelled') : false,
		canvasHtml: Boolean(html && html.length > 200),
	};
	console.log('\nRESULT', JSON.stringify(ok));
	fs.rmSync(work, { recursive: true, force: true });
})();
