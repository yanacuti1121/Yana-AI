// Kiểm tra bản kê khai của tiện ích (package.json) khớp với mã: mọi lệnh khai báo đều có nơi đăng ký, mọi mục menu trỏ tới
// lệnh có thật, giá trị `viewItem` trong menu khớp với `contextValue` mà các cây gán cho mục. Đây là lỗi hay gặp khi viết
// lại một tính năng (một lệnh hay nhãn menu đổi tên làm nút biến mất hoặc báo "command not found").
// Dùng: node tests/manifest.test.cjs <đường dẫn tuyệt đối tới extensions/yana-agent>
const fs = require('node:fs');
const path = require('node:path');

const ext = process.argv[2] || path.resolve(__dirname, "../extensions/yana-agent");
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'package.json'), 'utf8'));
const files = [...fs.readdirSync(path.join(ext, 'features')).filter(name => name.endsWith('.js')).map(name => path.join('features', name)), 'extension.js'];
const source = files.map(file => fs.readFileSync(path.join(ext, file), 'utf8')).join('\n');

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

const registered = new Set([...source.matchAll(/registerCommand\(\s*['"`]([^'"`]+)['"`]/g)].map(match => match[1]));
// Các lệnh yana.tool.<id> được đăng ký trong vòng lặp từ danh sách công cụ.
for (const match of source.matchAll(/id: '([a-z]+)', label: /g)) registered.add(`yana.tool.${match[1]}`);

const declared = manifest.contributes.commands.map(command => command.command);
const missing = declared.filter(id => !registered.has(id));
check('every declared command is registered somewhere', missing.length === 0, `not registered: ${missing.join(', ')}`);

const menus = manifest.contributes.menus || {};
const menuCommands = Object.entries(menus).flatMap(([, entries]) => entries.map(entry => entry.command));
const unknownInMenus = menuCommands.filter(id => !declared.includes(id));
check('every menu entry points to a declared command', unknownInMenus.length === 0, unknownInMenus.join(', '));

// Mọi `viewItem == X` hoặc `viewItem =~ /regex/` trong menu phải khớp ít nhất một contextValue có trong mã.
const contextValues = new Set([...source.matchAll(/contextValue\s*=\s*['"`]([^'"`]+)['"`]/g)].map(match => match[1]));
for (const match of source.matchAll(/contextValue\s*=\s*[^;]*\?\s*\(?[^;]*['"`]([\w.]+)['"`]/g)) contextValues.add(match[1]);
for (const match of source.matchAll(/['"`](yana\.[\w.]+)['"`]/g)) contextValues.add(match[1]);
for (const [group, entries] of Object.entries(menus)) {
	for (const entry of entries) {
		const when = entry.when || '';
		const exact = /viewItem == ([\w.]+)/.exec(when);
		const pattern = /viewItem =~ \/(.+?)\//.exec(when);
		if (exact) check(`${group}: ${entry.command} viewItem ${exact[1]} is assigned by the code`, contextValues.has(exact[1]), `no contextValue "${exact[1]}" in the code, so this button never shows`);
		if (pattern) {
			const regex = new RegExp(pattern[1].replace(/\\\\/g, '\\'));
			check(`${group}: ${entry.command} viewItem pattern /${pattern[1]}/ matches a value in the code`, [...contextValues].some(value => regex.test(value)), 'the pattern matches no contextValue, so this button never shows');
		}
	}
}

const views = Object.values(manifest.contributes.views || {}).flat().map(view => view.id);
for (const id of views.filter(id => id !== 'yana.panel')) check(`view ${id} has a provider`, source.includes(`'${id}'`), 'declared view but nothing creates it');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
