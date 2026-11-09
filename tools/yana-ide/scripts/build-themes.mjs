// Sinh Yana Light và hai bản High Contrast từ Yana Dark, để 4 theme dùng chung một bảng màu Cockpit
// (docs/stitch_yana_studio_ide_evolution/autonomous_runtime_cockpit/DESIGN.md).
// Chạy: node tools/yana-ide/scripts/build-themes.mjs   (sửa màu ở Yana Dark hoặc bảng LIGHT bên dưới, rồi chạy lại)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const themesDir = path.join(here, '..', 'extensions', 'yana-theme', 'themes');
const dark = JSON.parse(fs.readFileSync(path.join(themesDir, 'yana-dark-color-theme.json'), 'utf8'));

// Mỗi màu của Yana Dark có một màu Light tương ứng cùng vai trò (nền, viền, chữ, accent). Accent được
// làm đậm hơn để đạt tương phản WCAG AA trên nền sáng. Phần alpha (#rrggbbAA) giữ nguyên.
const LIGHT = {
	// Neutrals and blues follow the Fluent Blue light theme (MIT, github.com/danieldev23/fluent-blue), the same
	// values as studio-web/vendor/cline-ui/theme/palette.css: grays #f5f5f5 / #d9d9d9 / #595959 / #141414 and the
	// primary blue #1470f0 (the lightest blue that keeps white text at 4.5:1).
	'#0c0e12': '#f0f0f0', '#12151c': '#ffffff', '#161a22': '#f5f5f5', '#1a1e27': '#f0f0f0', '#1c212c': '#e8e8e8',
	'#1e222b': '#e0e0e0', '#252a36': '#d9d9d9', '#3a3f4c': '#bfbfbf', '#4b5160': '#a6a6a6', '#5c6270': '#8c8c8c',
	'#64748b': '#6e6e6e', '#94a3b8': '#595959', '#c3c6d7': '#3a3a3a', '#e2e2e8': '#141414', '#f8fafc': '#141414',
	'#ffffff': '#ffffff', '#000000': '#000000',
	'#7c8698': '#595959', '#3461d6': '#1470f0', '#3d6ae0': '#0f62dc',
	'#4f80ff': '#1470f0', '#6690ff': '#4096ff', '#7aa0ff': '#0958d9', '#b4c5ff': '#0958d9',
	'#00d2c4': '#00857c', '#46eee0': '#00756d', '#4edea3': '#0f7a52', '#10b981': '#0f8a5f',
	'#f59e0b': '#a35f00', '#fcd34d': '#8a5a00', '#ff8a65': '#c2410c', '#ef4444': '#c62828', '#ffb4ab': '#b3261e',
	'#d4c8ff': '#5b3fc4', '#b4a5ff': '#6a4fd1',
};

function toLight(value) {
	if (typeof value !== 'string' || !value.startsWith('#')) return value;
	const base = value.slice(0, 7).toLowerCase();
	const alpha = value.slice(7);
	if (!(base in LIGHT)) throw new Error('Thiếu màu Light cho ' + value);
	return LIGHT[base] + alpha;
}

function mapColors(colors, fn) {
	return Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, fn(value)]));
}

function mapTokens(tokens, fn) {
	return tokens.map(token => ({ ...token, settings: mapColors(token.settings, fn) }));
}

const light = {
	$schema: dark.$schema,
	name: 'Yana Light',
	type: 'light',
	semanticHighlighting: true,
	colors: { ...mapColors(dark.colors, toLight), 'widget.shadow': '#1b1f2724', 'button.foreground': '#ffffff', 'activityBarBadge.foreground': '#ffffff' },
	tokenColors: mapTokens(dark.tokenColors, toLight),
};

// High Contrast: để VS Code tự dựng phần lớn màu tương phản cao; chỉ đặt accent và viền focus theo Yana.
function highContrast(name, type, accent, border) {
	return {
		$schema: dark.$schema,
		name,
		type,
		colors: { focusBorder: accent, contrastActiveBorder: accent, contrastBorder: border, 'activityBar.activeBorder': accent, 'tab.activeBorderTop': accent, 'button.background': accent, 'textLink.foreground': accent },
		tokenColors: type === 'hc' ? dark.tokenColors : light.tokenColors,
	};
}

const outputs = {
	'yana-light-color-theme.json': light,
	'yana-hc-dark-color-theme.json': highContrast('Yana High Contrast', 'hc', '#7aa0ff', '#6690ff'),
	'yana-hc-light-color-theme.json': highContrast('Yana High Contrast Light', 'hcLight', '#1f47b0', '#1f47b0'),
};
for (const [file, theme] of Object.entries(outputs)) {
	fs.writeFileSync(path.join(themesDir, file), JSON.stringify(theme, null, '\t') + '\n');
	console.log('wrote', file, Object.keys(theme.colors).length, 'colors');
}
