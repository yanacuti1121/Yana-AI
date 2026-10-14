// Chạy tay với model local thật (Ollama) và bản yana-rt chỉ định: model dùng patch_file, sự kiện duyệt có bản xem trước
// và mức khớp, rồi duyệt hoặc từ chối và kiểm tra file. Không đưa vào CI.
//   YANA_RT_BIN=/đường/dẫn/yana-rt node tests/e2e-patch-approval.cjs <extensions/yana-agent> <model> approve|deny
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const ext = process.argv[2];
const model = process.argv[3] || 'llama3.2:latest';
const decision = (process.argv[4] || 'approve') === 'approve';
const { resolveBinary, startTurn } = require(path.join(ext, 'runtime.js'));
const binary = resolveBinary(process.env.YANA_RT_BIN || '');
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'yana-patch-e2e-')));
const file = path.join(work, 'notes.txt');
const original = 'alpha\nbeta\ngamma\n';
fs.writeFileSync(file, original);
fs.mkdirSync(path.join(work, '.claude/state'), { recursive: true });
fs.writeFileSync(path.join(work, '.claude/state/locking-protocol-version'), 'flock-v1\n');

function turn(label, options) {
	return new Promise(resolve => {
		const seen = [];
		const result = { approval: undefined, preview: undefined, completed: undefined, text: '' };
		startTurn({ binary, cwd: work, provider: 'ollama', model, ...options }, event => {
			seen.push(event.type === 'runtime_event' ? `${event.kind}:${event.tool || ''}` : event.type);
			if (event.type === 'text_delta') result.text += event.text || '';
			if (event.type === 'awaiting_approval') result.approval = event;
			if (event.type === 'runtime_event' && event.kind === 'human_approval_required') result.preview = event;
			if (event.type === 'runtime_event' && event.kind === 'tool_completed') result.completed = event;
		}, () => { console.log(`\n== ${label}\nevents: ${[...new Set(seen)].join(', ')}`); resolve(result); });
	});
}

(async () => {
	console.log('binary', binary, '| model', model, '| decision', decision ? 'approve' : 'deny');
	const task = 'Use the patch_file tool now with path "notes.txt" and one edit: old "beta", new "BETA". Do not use any other tool.';
	const first = await turn('turn 1: ask for a patch', { resume: false, payload: { task, session_id: crypto.randomUUID(), history: [] } });
	if (!first.preview) {
		console.log('RESULT no approval request (the model did not call a write tool); text:', first.text.slice(0, 200));
		return fs.rmSync(work, { recursive: true, force: true });
	}
	console.log('tool:', first.preview.tool, '| summary:', first.preview.summary);
	console.log('preview:', JSON.stringify(first.preview.preview, null, 1).slice(0, 800));
	console.log('file untouched before the decision:', fs.readFileSync(file, 'utf8') === original);
	const second = await turn(`turn 2: ${decision ? 'approve' : 'deny'}`, { resume: true, payload: { approval_id: first.approval.approval_id, decision, decided_by: 'human:e2e-test' } });
	console.log('tool_completed:', JSON.stringify(second.completed));
	console.log('file after:', JSON.stringify(fs.readFileSync(file, 'utf8')));
	fs.rmSync(work, { recursive: true, force: true });
})();
