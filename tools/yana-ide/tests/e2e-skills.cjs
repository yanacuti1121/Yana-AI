// Chạy thật: kỹ năng trên đĩa, yana-rt thật, lớp tiện ích thật và một model Ollama local.
// Kiểm: chỉ mục kỹ năng, mở rộng /tên, và việc nội dung kỹ năng thật sự làm model đổi cách trả lời.
// Dùng: node tests/e2e-skills.cjs <đường dẫn extensions/yana-agent> <đường dẫn yana-rt> [model]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');

const [ext, binary, model = 'llama3.2:latest'] = process.argv.slice(2);
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-skills-e2e-project-'));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-skills-e2e-home-'));
process.env.YANA_HOME = home;

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'vscode' ? 'vscode' : origResolve.call(this, request, ...rest); };
require.cache.vscode = {
	id: 'vscode', filename: 'vscode', loaded: true,
	exports: {
		workspace: { getConfiguration: () => ({ get: (key, fallback) => (key === 'runtimePath' ? binary : fallback) }), workspaceFolders: [{ uri: { fsPath: project } }], isTrusted: true },
	},
};

const skills = require(path.join(ext, 'features/skills.js'));
const { startTurn } = require(path.join(ext, 'runtime.js'));

function write(root, dir, text) {
	fs.mkdirSync(path.join(root, dir), { recursive: true });
	fs.writeFileSync(path.join(root, dir, 'SKILL.md'), text);
}

function turn(label, task, system) {
	return new Promise(resolve => {
		let reply = '';
		startTurn({ binary, cwd: project, provider: 'ollama', model, resume: false, payload: { task, system, session_id: crypto.randomUUID(), history: [] } }, event => {
			if (event.type === 'text_delta') reply += event.text || '';
			if (event.type === 'completed' && event.message) reply = event.message;
			if (event.type === 'error') reply += `[error] ${event.message}`;
		}, () => { console.log(`\n== ${label}\n${reply.trim().slice(0, 300)}`); resolve(reply); });
	});
}

(async () => {
	write(home, 'skills/pirate', '---\nname: pirate\ndescription: Answer in the voice of a pirate. Use when: asked for a pirate reply\n---\nAnswer the request as a pirate would: say "Arr" and "matey" and "ahoy" at least once each.\n');
	write(project, '.yana-ai/skills/shout', '---\nname: shout\ndescription: Answer in capitals\n---\nAnswer in capital letters only.\n');
	// Without this marker yana-rt cannot store an approval, and a small model that decides to call a tool would fail the turn.
	fs.mkdirSync(path.join(project, '.claude/state'), { recursive: true });
	fs.writeFileSync(path.join(project, '.claude/state/locking-protocol-version'), 'flock-v1\n');
	write(home, 'skills/broken', '---\nname: other\ndescription: wrong folder name\n---\nx\n');

	const index = await skills.indexText();
	console.log('== index\n' + index);
	const expanded = await skills.expandFromWorkspace('/pirate say hello to the user');
	console.log('\n== expanded task (head)\n' + (expanded ? expanded.task.slice(0, 260) : 'null'));
	const control = await skills.expandFromWorkspace('say hello to the user');

	const plain = await turn('without the skill', 'Say hello to the user in one short sentence.', index);
	const withSkill = expanded ? await turn('with /pirate', expanded.task, index) : '';

	const pirate = /\b(arr+|ahoy|matey)\b/i;
	const result = {
		indexListsUserAndProjectSkills: index.includes('- pirate:') && index.includes('- shout:'),
		brokenSkillNotListed: !index.includes('broken'),
		plainTextNotExpanded: control === null,
		invocationExpanded: Boolean(expanded && expanded.task.includes('as a pirate would')),
		skillChangedTheAnswer: pirate.test(withSkill) && !pirate.test(plain),
	};
	console.log('\nRESULT', JSON.stringify(result));
	process.exit(Object.values(result).every(Boolean) ? 0 : 1);
})();
