// Kiểm tra trang "Third-Party Components": ghi công đúng tác giả, giấy phép, và không tin dữ liệu thô khi dựng Markdown.
// Dùng: node tests/credits.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const path = require('node:path');
const Module = require('node:module');

const ext = process.argv[2];
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return request === 'vscode' ? 'vscode' : origResolve.call(this, request, ...rest); };
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: {} };

const { buildCreditsMarkdown } = require(path.join(ext, 'features/credits.js'));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

const cua = {
	name: 'cua-driver',
	version: '0.35.2',
	author: 'Cua AI, Inc.',
	repo: 'https://github.com/trycua/cua',
	license: 'MIT',
	description: 'Lets the assistant see and operate apps on this computer, only after you turn it on.',
};
const present = new Set(['/app/bundledTools/cua-driver/LICENSE', '/app/bundledTools/cua-driver/THIRD_PARTY_NOTICES.md']);
const options = { bundledDir: '/app/bundledTools', exists: file => present.has(file), toLink: file => `file://${file}` };
const page = buildCreditsMarkdown({ nameLong: 'Yana Studio', bundledTools: [cua] }, options);

check('names the tool, version, author and license', ['cua-driver', '0.35.2', 'Cua AI, Inc.', 'MIT'].every(text => page.includes(text)), page);
check('links to the upstream project', page.includes('https://github.com/trycua/cua'));
check('says what the tool does', page.includes(cua.description));
check('states the author signature is kept unmodified', /unmodified|nguyên vẹn|không sửa/i.test(page));
check('credits Code - OSS and points to ThirdPartyNotices.txt', page.includes('Code - OSS') && page.includes('ThirdPartyNotices.txt'));
check('links the license and notices files that exist', page.includes('file:///app/bundledTools/cua-driver/LICENSE') && page.includes('file:///app/bundledTools/cua-driver/THIRD_PARTY_NOTICES.md'));

const missing = buildCreditsMarkdown({ nameLong: 'Yana Studio', bundledTools: [cua] }, { ...options, exists: () => false });
check('does not invent links to files that are not there', !missing.includes('file:///app/bundledTools') && /not included|chưa có/i.test(missing), missing);

const none = buildCreditsMarkdown({ nameLong: 'Yana Studio' }, options);
check('no bundled tools is a normal page, not a crash', none.includes('Code - OSS') && !none.includes('undefined'), none);

const hostile = buildCreditsMarkdown({ nameLong: 'Yana Studio', bundledTools: [{ ...cua, name: 'evil`\n# injected', author: 'A\r\n## B', repo: 'javascript:alert(1)', description: 'x\n---\ny' }] }, options);
check('a value cannot start a new heading or break the layout', !/^# injected$/m.test(hostile) && !/^## B$/m.test(hostile) && !/^---$/m.test(hostile), hostile);
check('only https links are produced', !hostile.includes('javascript:'), hostile);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
