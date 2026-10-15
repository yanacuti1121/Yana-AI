// Chạy tay với model local thật (Ollama): model có viết được khối yana-edit hợp lệ không, và có áp dụng thử được không.
// Không đưa vào CI vì phụ thuộc model. Dùng:
//   WITH_MARKER=1 node tests/e2e-edit-proposal.cjs <extensions/yana-agent> <model>
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const ext = process.argv[2] || path.resolve(__dirname, "../extensions/yana-agent");
const model = process.argv[3] || 'llama3.2:latest';
const { resolveBinary, startTurn } = require(path.join(ext, 'runtime.js'));
const protocol = require(path.join(ext, 'features/edit-protocol.js'));
const binary = resolveBinary('');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-edit-e2e-'));
const source = 'function total(items) {\n  let sum = 0;\n  for (const item of items) sum += item.price;\n  return sum;\n}\n';
fs.writeFileSync(path.join(work, 'cart.js'), source);
if (process.env.WITH_MARKER) {
	fs.mkdirSync(path.join(work, '.claude/state'), { recursive: true });
	fs.writeFileSync(path.join(work, '.claude/state/locking-protocol-version'), 'flock-v1\n');
}
const task = `Here is cart.js:\n\n${source}\nChange total() so it multiplies each price by item.quantity.`;

const started = Date.now();
let reply = '';
const seen = [];
startTurn({ binary, cwd: work, provider: 'ollama', model, resume: false, payload: { task, session_id: crypto.randomUUID(), history: [], system: protocol.EDIT_INSTRUCTIONS } },
	event => {
		seen.push(event.type === 'runtime_event' ? `runtime:${event.kind}:${event.tool || ''}` : event.type);
		if (event.type === 'text_delta') reply += event.text || '';
		if (event.type === 'completed' && event.message) reply = event.message;
		if (event.type === 'error') reply += `[error] ${event.message}`;
	},
	() => {
		console.log(`model ${model}, ${((Date.now() - started) / 1000).toFixed(1)}s\nevents: ${[...new Set(seen)].join(', ')}\n--- reply:\n${reply.slice(0, 900)}\n---`);
		const edits = protocol.parseEdits(reply);
		console.log('fenced edits parsed:', edits.length);
		for (const edit of edits) {
			const resolved = protocol.resolveInside(work, edit.path);
			const result = resolved.error ? { error: resolved.error } : protocol.applyBlocks(fs.existsSync(resolved.file) ? fs.readFileSync(resolved.file, 'utf8') : null, edit.blocks);
			console.log(`${edit.path}:`, result.error ? `NOT APPLICABLE (${result.error})` : `applies cleanly, ${protocol.diffLines(edit.blocks).length} diff lines`);
		}
		fs.rmSync(work, { recursive: true, force: true });
	});
