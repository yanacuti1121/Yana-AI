// Sinh Yana Dark, Yana Light và hai bản High Contrast từ MỘT nguồn: theme-source/yana-dark.source.json
// (Yana Dark viết tay, đóng băng, không bao giờ bị ghi đè). Nguồn giữ nguyên toàn bộ khóa màu; script chỉ đổi
// BẢNG ÁNH XẠ VAI TRÒ: mỗi mã hex cũ của nguồn (nền, viền, chữ, nhấn, trạng thái) ứng với một màu 2026 sinh trong
// OKLCH cho Dark, và lấy từ bảng màu của giao diện mới (theme-source/light-palette.json) cho Light. Ít đường kẻ, thanh bên lùi lại.
// Chạy: node tools/yana-ide/scripts/build-themes.mjs   (sửa bảng ROLES hoặc ACCENT_HUE rồi chạy lại; kết quả lặp lại được)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { oklchToHex } from './oklch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceFile = path.join(here, '..', 'theme-source', 'yana-dark.source.json');
const themesDir = path.join(here, '..', 'extensions', 'yana-theme', 'themes');

// Màu nhấn của bản sắc. 265 giữ đúng hệ xanh dương hiện tại của Yana; đổi một số này là đổi cả hai theme.
// Gợi ý đã cài để xem: Iris (tím) = 285, Tide (xanh ngọc) = 190, Ember (cam hổ phách) = 45.
export const ACCENT_HUE = 265;
const BASE_HUE = 70; // xám ấm
const BASE_CHROMA = 0.006; // rất thấp: gần trung tính
const HUE = { magenta: 300, green: 160, mint: 165, teal: 190, red: 25, amber: 75, yellow: 95, orange: 45 };

// Bảng màu sáng của giao diện mới. Chữ và viền là mực xanh đen với độ trong suốt; theme của VS Code cần màu đặc,
// nên trộn mực lên nền trắng (đúng cách mắt thấy chúng trên thẻ trắng của trang web thử).
const PALETTE = JSON.parse(fs.readFileSync(path.join(here, '..', 'theme-source', 'light-palette.json'), 'utf8'));
const { alpha: ALPHA, surface: SURFACE, status: STATUS, syntax: SYNTAX } = PALETTE;
const inkOverWhite = (alpha) => {
	const channel = (value) => Math.round(255 - (255 - value) * alpha).toString(16).padStart(2, '0');
	return `#${PALETTE.inkRgb.map(channel).join('')}`;
};

const n = (L, C = BASE_CHROMA) => oklchToHex(L, C, BASE_HUE); // bề mặt trung tính của bản tối
const c = (L, C, h) => oklchToHex(L, C, h); // màu có sắc
const A = ACCENT_HUE;

// hex cũ của Yana Dark -> { dark, light }. Cùng vai trò, độ sáng L đảo chiều giữa hai theme.
const ROLES = {
	// Bề mặt và viền, từ tối sâu đến sáng dần (theo Dark).
	// Cột light lấy từ bảng màu của giao diện mới (theme-source/light-palette.json), không sinh bằng OKLCH.
	'#0c0e12': { dark: n(0.15), light: SURFACE.inset }, // chrome: thanh tiêu đề, thanh trạng thái, ô nhập
	'#12151c': { dark: n(0.17), light: SURFACE.card }, // nền trình soạn thảo
	'#161a22': { dark: n(0.195), light: SURFACE.canvas }, // thanh bên, panel
	'#1a1e27': { dark: n(0.225), light: inkOverWhite(ALPHA.hover) }, // hover
	'#1c212c': { dark: n(0.24), light: SURFACE.control }, // widget nổi, mục chọn
	'#1e222b': { dark: n(0.25), light: inkOverWhite(ALPHA.borderHairline) }, // viền rất nhẹ
	'#252a36': { dark: n(0.29), light: inkOverWhite(ALPHA.border) }, // viền
	'#3a3f4c': { dark: n(0.38), light: inkOverWhite(ALPHA.guide) },
	// Chữ và biểu tượng, từ mờ đến rõ.
	'#5c6270': { dark: n(0.52), light: inkOverWhite(ALPHA.disabled) }, // vô hiệu hóa
	'#64748b': { dark: n(0.65), light: inkOverWhite(ALPHA.tertiary) }, // chú thích, biểu tượng không hoạt động
	'#7c8698': { dark: n(0.7), light: inkOverWhite(ALPHA.tertiary) }, // số dòng, gợi ý trong ô nhập
	'#94a3b8': { dark: n(0.76), light: inkOverWhite(ALPHA.secondary) }, // chữ phụ
	'#c3c6d7': { dark: n(0.87, 0.004), light: inkOverWhite(ALPHA.strong) },
	'#e2e2e8': { dark: n(0.93, 0.004), light: PALETTE.ink.primary }, // chữ chính
	'#f8fafc': { dark: n(0.97, 0.003), light: PALETTE.ink.primary }, // chữ nhấn mạnh
	'#ffffff': { dark: '#ffffff', light: '#ffffff' },
	'#000000': { dark: '#000000', light: '#000000' },
	// Màu nhấn.
	'#4f80ff': { dark: c(0.72, 0.15, A), light: STATUS.runFg }, // màu nhấn tạm của bản sáng cho đến khi chọn bản sắc
	'#3461d6': { dark: c(0.53, 0.17, A), light: STATUS.runFg }, // nền nút
	'#3d6ae0': { dark: c(0.56, 0.17, A), light: SYNTAX.runHover }, // nút khi hover
	'#7aa0ff': { dark: c(0.8, 0.12, A), light: SYNTAX.runHover }, // liên kết khi hover
	'#b4c5ff': { dark: c(0.87, 0.06, A), light: STATUS.runFg },
	'#b4a5ff': { dark: c(0.78, 0.1, HUE.magenta), light: c(0.52, 0.15, HUE.magenta) },
	'#d4c8ff': { dark: c(0.86, 0.06, HUE.magenta), light: c(0.46, 0.15, HUE.magenta) },
	// Trạng thái và cú pháp.
	'#10b981': { dark: c(0.72, 0.15, HUE.green), light: STATUS.allowDot },
	'#4edea3': { dark: c(0.8, 0.15, HUE.mint), light: STATUS.allowFg },
	'#00d2c4': { dark: c(0.78, 0.12, HUE.teal), light: SYNTAX.teal },
	'#46eee0': { dark: c(0.87, 0.12, HUE.teal), light: SYNTAX.cyan },
	'#ef4444': { dark: c(0.66, 0.19, HUE.red), light: STATUS.denyDot },
	'#ffb4ab': { dark: c(0.83, 0.08, HUE.red), light: STATUS.denyFg },
	'#f59e0b': { dark: c(0.78, 0.15, HUE.amber), light: STATUS.askFg },
	'#fcd34d': { dark: c(0.88, 0.14, HUE.yellow), light: SYNTAX.yellow },
	'#ff8a65': { dark: c(0.75, 0.13, HUE.orange), light: SYNTAX.orange },
};

// Kiểu "mềm": bỏ đường kẻ cấu trúc, để các mảng nền tự phân vùng. Viền của widget tương tác (ô nhập, menu) giữ lại.
const NO_LINE = '#00000000';
const SOFT_STRUCTURAL_BORDERS = [
	'titleBar.border', 'activityBar.border', 'sideBar.border', 'sideBarSectionHeader.border', 'editorGroupHeader.tabsBorder',
	'tab.border', 'tab.activeBorderTop', 'statusBar.border', 'panel.border', 'panelSection.border', 'editorStickyScroll.border',
	'editorOverviewRuler.border',
];

function mapHex(value, kind) {
	if (typeof value !== 'string' || !value.startsWith('#')) return value;
	const base = value.slice(0, 7).toLowerCase();
	if (!(base in ROLES)) throw new Error(`Thiếu vai trò màu cho ${value}`);
	return ROLES[base][kind] + value.slice(7); // phần alpha (#rrggbbAA) giữ nguyên
}

const mapColors = (colors, kind) => Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, mapHex(value, kind)]));
const mapTokens = (tokens, kind) => tokens.map((token) => ({ ...token, settings: mapColors(token.settings, kind) }));

/** Một theme đầy đủ cho `kind` ('dark' | 'light') từ nguồn đóng băng. */
function buildTheme(source, kind) {
	const colors = mapColors(source.colors, kind);
	const role = (old) => ROLES[old][kind];
	for (const key of SOFT_STRUCTURAL_BORDERS) if (key in colors) colors[key] = NO_LINE;
	// Thanh bên lùi lại: chữ phụ thay cho chữ chính, mục đang chọn vẫn rõ nhờ nền.
	colors['sideBar.foreground'] = role('#94a3b8');
	colors['sideBarTitle.foreground'] = role('#7c8698');
	if (kind === 'dark') {
		// Chữ trên nền nhấn sáng phải tối, không phải trắng, để đạt tương phản AA.
		const ink = c(0.2, 0.03, A);
		for (const key of ['button.foreground', 'badge.foreground', 'activityBarBadge.foreground', 'statusBarItem.remoteForeground', 'extensionButton.prominentForeground']) {
			if (key in colors) colors[key] = key.startsWith('button') || key.startsWith('extension') ? '#ffffff' : ink;
		}
	} else {
		Object.assign(colors, { 'widget.shadow': '#1b1f2724' });
	}
	return {
		$schema: source.$schema,
		name: kind === 'dark' ? 'Yana Dark' : 'Yana Light',
		type: kind,
		semanticHighlighting: true,
		colors,
		tokenColors: mapTokens(source.tokenColors, kind),
	};
}

// High Contrast: để VS Code tự dựng phần lớn màu tương phản cao; chỉ đặt accent và viền focus theo Yana.
function highContrast(name, type, accent, border, tokenColors) {
	return {
		$schema: 'vscode://schemas/color-theme',
		name,
		type,
		colors: { focusBorder: accent, contrastActiveBorder: accent, contrastBorder: border, 'activityBar.activeBorder': accent, 'tab.activeBorderTop': accent, 'button.background': accent, 'textLink.foreground': accent },
		tokenColors,
	};
}

/** Trả về { tên file: theme } mà không ghi gì ra đĩa (test dùng hàm này). */
export function buildAll() {
	const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
	const dark = buildTheme(source, 'dark');
	const light = buildTheme(source, 'light');
	return {
		'yana-dark-color-theme.json': dark,
		'yana-light-color-theme.json': light,
		'yana-hc-dark-color-theme.json': highContrast('Yana High Contrast', 'hc', ROLES['#7aa0ff'].dark, ROLES['#4f80ff'].dark, dark.tokenColors),
		'yana-hc-light-color-theme.json': highContrast('Yana High Contrast Light', 'hcLight', ROLES['#7aa0ff'].light, ROLES['#7aa0ff'].light, light.tokenColors),
	};
}

export { ROLES };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	for (const [file, theme] of Object.entries(buildAll())) {
		fs.writeFileSync(path.join(themesDir, file), JSON.stringify(theme, null, '\t') + '\n');
		console.log('wrote', file, Object.keys(theme.colors).length, 'colors');
	}
}
