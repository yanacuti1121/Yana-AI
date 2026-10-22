'use strict';
// Quản lý ngôn ngữ hiển thị đa ngữ (vi, en, ko) đồng bộ giữa Yana config, argv.json và webviews.

const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SUPPORTED_LANGS = ['vi', 'en', 'ko'];

function getActiveLanguage() {
	try {
		const cfg = vscode.workspace.getConfiguration('yana');
		const inspect = cfg.inspect('language');
		if (inspect?.globalValue && SUPPORTED_LANGS.includes(inspect.globalValue)) {
			return inspect.globalValue;
		}
		if (inspect?.workspaceValue && SUPPORTED_LANGS.includes(inspect.workspaceValue)) {
			return inspect.workspaceValue;
		}
	} catch {}
	try {
		const envLang = (vscode.env.language || '').toLowerCase().split('-')[0];
		if (SUPPORTED_LANGS.includes(envLang)) return envLang;
	} catch {}
	try {
		const configured = vscode.workspace.getConfiguration('yana').get('language');
		if (configured && SUPPORTED_LANGS.includes(configured)) return configured;
	} catch {}
	return 'en';
}

async function applyLanguage(lang) {
	if (!SUPPORTED_LANGS.includes(lang)) return;

	try {
		await vscode.workspace.getConfiguration('yana').update('language', lang, vscode.ConfigurationTarget.Global);
	} catch (e) {
		console.warn('Unable to write yana.language to config:', e);
	}

	const candidateDirs = ['.yana-studio', '.yana-studio-dev', '.vscode-oss-dev', '.vscode'];
	for (const dir of candidateDirs) {
		try {
			const argvPath = path.join(os.homedir(), dir, 'argv.json');
			let argv = {};
			if (fs.existsSync(argvPath)) {
				try { argv = JSON.parse(fs.readFileSync(argvPath, 'utf8')); } catch {}
			}
			argv.locale = lang;
			fs.mkdirSync(path.dirname(argvPath), { recursive: true });
			fs.writeFileSync(argvPath, JSON.stringify(argv, null, '\t'), 'utf8');
		} catch (e) {
			console.warn(`Unable to write locale to ${dir}/argv.json:`, e);
		}
	}

	const promptMap = {
		vi: {
			msg: 'Đã chuyển sang Tiếng Việt. Khởi động lại Yana Studio để áp dụng toàn bộ ứng dụng?',
			btn: 'Khởi động lại ngay'
		},
		ko: {
			msg: '한국어로 전환되었습니다. 전체 앱에 적용하려면 Yana Studio를 다시 로드하시겠습니까?',
			btn: '지금 다시 로드'
		},
		en: {
			msg: 'Switched to English. Reload Yana Studio to apply across the entire app?',
			btn: 'Reload Now'
		}
	};
	const t = promptMap[lang] || promptMap.en;
	vscode.window.showInformationMessage(t.msg, t.btn).then(selection => {
		if (selection === t.btn) {
			vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	});
}

module.exports = {
	SUPPORTED_LANGS,
	getActiveLanguage,
	applyLanguage,
};

