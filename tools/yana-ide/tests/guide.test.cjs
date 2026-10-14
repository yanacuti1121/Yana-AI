// Kiểm tra sách hướng dẫn (media/guide.vi.md) không nói sai về app: mọi "Yana: <lệnh>" nhắc trong sách phải là lệnh có thật,
// các chuỗi lỗi được trích dẫn phải còn trong mã, lời khẳng định "chưa có" (giọng nói) còn đúng, và Markdown dựng được.
// Dùng: node tests/guide.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const fs = require('node:fs');
const path = require('node:path');

const ext = process.argv[2];
const read = rel => fs.readFileSync(path.join(ext, rel), 'utf8');
const manifest = JSON.parse(read('package.json'));
const markdown = read('media/guide.vi.md');
const guide = require(path.join(ext, 'media', 'guide.js'));

const sources = [
	'extension.js',
	...fs.readdirSync(path.join(ext, 'features')).filter(name => name.endsWith('.js')).map(name => path.join('features', name)),
	...fs.readdirSync(path.join(ext, 'media')).filter(name => name.endsWith('.js')).map(name => path.join('media', name)),
].map(read).join('\n');

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

const blocks = guide.parse(markdown);
const headings = blocks.filter(block => block.type === 'h2');
check('sách có 15 mục ##', headings.length === 15, String(headings.length));
check('id các mục không trùng nhau', new Set(headings.map(h => h.id)).size === headings.length);
check('có đúng một tiêu đề #', blocks.filter(block => block.type === 'h1').length === 1);
check('mọi khối code được đóng', blocks.filter(block => block.type === 'code').every(block => block.closed));
check('mọi bảng có đủ cột ở từng hàng', blocks.filter(block => block.type === 'table').every(table => table.rows.every(row => row.length === table.header.length)));
check('không dùng dấu gạch dài (em dash)', !markdown.includes('—'));

// "Yana: X" trong sách phải bắt đầu bằng tên đầy đủ của một lệnh hiện trên bảng lệnh.
const titles = manifest.contributes.commands
	.filter(command => command.category === 'Yana')
	.map(command => command.title);
const mentions = [...new Set([...markdown.matchAll(/Yana: ([^`|\n]+)/g)].map(match => match[1].trim()))];
for (const mention of mentions) {
	const known = titles.some(title => mention === title || mention.startsWith(`${title} `) || mention.startsWith(title));
	check(`lệnh được nhắc có thật: Yana: ${mention}`, known);
}

// Các lệnh người dùng nhìn thấy mà sách cần giới thiệu.
for (const command of ['yana.guide.open', 'yana.welcome.open', 'yana.settings.open']) {
	check(`lệnh ${command} đã khai báo`, manifest.contributes.commands.some(entry => entry.command === command));
}

// Chuỗi lỗi/nhãn được trích dẫn trong sách phải còn nguyên trong mã (đổi chữ trong app mà quên sửa sách sẽ bị bắt ở đây).
const QUOTED = [
	'yana-rt not found', 'Open a folder before giving Yana a task', 'Restricted Mode', 'No API key for',
	'is not in the yana-rt catalog', 'Turn on approvals in this project', 'cannot persist pending approval',
	'Needs key', 'Isolated design sandbox', 'Voice runtime not configured', 'Approval needed', 'Expired (30m)',
	'cannot be applied', 'Plan Mode - Do not edit', 'Careful Reviewer', 'Fast Coder', 'Design model', 'Build this screen',
];
for (const phrase of QUOTED) {
	if (markdown.includes(phrase)) check(`trích dẫn còn có trong mã: ${phrase}`, sources.includes(phrase));
}

// Sách nói giọng nói chưa chạy được; nếu mã đổi thì phải sửa sách.
check('lời "giọng nói chưa cấu hình" còn đúng', sources.includes('Voice runtime not configured') && /Voice runtime not configured/.test(markdown));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
