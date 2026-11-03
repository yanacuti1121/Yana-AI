// Kiểm tra bộ theme Yana sinh từ nguồn: giữ nguyên khóa màu, tên, không sót mã hex cũ, file trên đĩa khớp bộ sinh,
// và các cặp chữ/nền chính đạt tương phản WCAG AA (4.5, riêng chú thích và số dòng 3).
// Dùng: node tests/theme.test.cjs
const fs = require('node:fs');
const path = require('node:path');

const ide = path.resolve(__dirname, '..');
const themesDir = path.join(ide, 'extensions', 'yana-theme', 'themes');
const AA_TEXT = 4.5;
const AA_DIM = 3;

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };

(async () => {
	const { buildAll, ROLES } = await import(path.join(ide, 'scripts', 'build-themes.mjs'));
	const { contrast } = await import(path.join(ide, 'scripts', 'contrast.mjs'));
	const source = JSON.parse(fs.readFileSync(path.join(ide, 'theme-source', 'yana-dark.source.json'), 'utf8'));
	const built = buildAll();
	const dark = built['yana-dark-color-theme.json'];
	const light = built['yana-light-color-theme.json'];

	check('Dark giữ đúng tên "Yana Dark"', dark.name === 'Yana Dark');
	check('Light giữ đúng tên "Yana Light"', light.name === 'Yana Light');
	const sourceKeys = Object.keys(source.colors).sort().join();
	check('Dark giữ nguyên toàn bộ khóa màu của nguồn', Object.keys(dark.colors).sort().join() === sourceKeys);
	check('Light giữ nguyên toàn bộ khóa màu của nguồn', Object.keys(light.colors).sort().join() === sourceKeys);

	for (const [file, theme] of Object.entries(built)) {
		const onDisk = JSON.parse(fs.readFileSync(path.join(themesDir, file), 'utf8'));
		check(`${file} trên đĩa khớp bộ sinh (chạy lại build-themes.mjs nếu lỗi)`, JSON.stringify(onDisk) === JSON.stringify(theme));
	}

	// Mã hex cũ của nguồn không còn xuất hiện (trừ trắng và đen). Nhận ra bằng 6 chữ số đầu, bỏ qua alpha.
	const keepers = new Set(['#ffffff', '#000000']);
	const oldHex = Object.keys(ROLES).filter((hex) => !keepers.has(hex));
	for (const theme of [dark, light]) {
		const text = JSON.stringify(theme).toLowerCase();
		const left = oldHex.filter((hex) => text.includes(hex));
		check(`${theme.name} không còn mã hex cũ`, left.length === 0, left.join(' '));
	}

	// Kiểu mềm: đường kẻ cấu trúc đã bỏ nhưng viền focus và ô nhập còn.
	check('Dark bỏ đường kẻ thanh bên', dark.colors['sideBar.border'] === '#00000000');
	check('Dark vẫn có viền ô nhập', dark.colors['input.border'] !== '#00000000');

	const pairs = (theme) => {
		const c = theme.colors;
		const list = [
			['chữ chính trên editor', c.foreground, c['editor.background'], AA_TEXT],
			['chữ phụ trên thanh bên', c['descriptionForeground'], c['sideBar.background'], AA_TEXT],
			['chữ thanh bên', c['sideBar.foreground'], c['sideBar.background'], AA_TEXT],
			['tab đang mở', c['tab.activeForeground'], c['tab.activeBackground'], AA_TEXT],
			['tab không mở', c['tab.inactiveForeground'], c['tab.inactiveBackground'], AA_TEXT],
			['nút', c['button.foreground'], c['button.background'], AA_TEXT],
			['nút hover', c['button.foreground'], c['button.hoverBackground'], AA_TEXT],
			['huy hiệu', c['badge.foreground'], c['badge.background'], AA_TEXT],
			['huy hiệu thanh hoạt động', c['activityBarBadge.foreground'], c['activityBarBadge.background'], AA_TEXT],
			['thanh trạng thái', c['statusBar.foreground'], c['statusBar.background'], AA_TEXT],
			['chữ trong ô nhập', c['input.foreground'], c['input.background'], AA_TEXT],
			['gợi ý trong ô nhập', c['input.placeholderForeground'], c['input.background'], AA_DIM],
			['số dòng', c['editorLineNumber.foreground'], c['editor.background'], AA_DIM],
			['panel đang mở', c['panelTitle.activeForeground'], c['panel.background'], AA_TEXT],
		];
		for (const token of theme.tokenColors) {
			const fg = token.settings.foreground;
			const dim = token.scope.includes('comment');
			list.push([`cú pháp ${token.scope[0]}`, fg, c['editor.background'], dim ? AA_DIM : AA_TEXT]);
		}
		return list;
	};
	for (const theme of [dark, light]) {
		for (const [label, fg, bg, min] of pairs(theme)) {
			const ratio = contrast(fg, bg);
			check(`${theme.name}: ${label} >= ${min}`, ratio >= min, `${ratio.toFixed(2)} (${fg} trên ${bg})`);
		}
	}

	console.log(`\n${pass} pass, ${fail} fail`);
	process.exit(fail === 0 ? 0 : 1);
})();
