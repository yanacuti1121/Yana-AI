'use strict';
// Kiểm tra features/onboarding.js với mock vscode
const Module = require('node:module');
const path = require('node:path');

const ext = path.resolve(process.cwd(), process.argv[2] || path.join(__dirname, '../extensions/yana-agent'));

const mockCommands = new Map();
const mockConfig = {
	yana: {
		mode: 'supervised',
		provider: 'ollama',
		model: 'llama3:8b'
	}
};
const mockGlobalState = new Map();

const fakeVscode = {
	commands: {
		registerCommand(id, handler) {
			mockCommands.set(id, handler);
			return { dispose: () => mockCommands.delete(id) };
		},
		async executeCommand(id, ...args) {
			const handler = mockCommands.get(id);
			if (handler) return handler(...args);
			return undefined;
		}
	},
	workspace: {
		getConfiguration(section) {
			return {
				get(key, fallback) {
					return mockConfig[section]?.[key] ?? fallback;
				},
				async update(key, value) {
					if (!mockConfig[section]) mockConfig[section] = {};
					mockConfig[section][key] = value;
				}
			};
		}
	},
	window: {
		createWebviewPanel(viewType, title, column, options) {
			return {
				viewType,
				title,
				column,
				options,
				webview: {
					asWebviewUri: uri => uri,
					postMessage: () => {},
					onDidReceiveMessage: () => {}
				},
				reveal: () => {},
				dispose: () => {},
				onDidDispose: () => {}
			};
		},
		showWarningMessage: () => {}
	},
	Uri: {
		file: p => ({ scheme: 'file', fsPath: p, path: p }),
		joinPath: (base, ...segments) => ({
			scheme: base.scheme || 'file',
			fsPath: path.join(base.fsPath || '', ...segments),
			path: path.join(base.path || '', ...segments)
		})
	},
	ViewColumn: { One: 1 },
	ConfigurationTarget: { Global: 1 }
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
	if (request === 'vscode') return 'vscode';
	return origResolve.call(this, request, ...rest);
};
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: fakeVscode };

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
	if (ok) {
		pass++;
		console.log('PASS', name);
	} else {
		fail++;
		console.log('FAIL', name, extra);
	}
};

const onboarding = require(path.join(ext, 'features/onboarding.js'));

check('onboarding feature exports metadata and functions',
	onboarding.id === 'onboarding' &&
	typeof onboarding.activate === 'function' &&
	typeof onboarding.open === 'function' &&
	onboarding.ONBOARDING_COMPLETED_KEY === 'yana.onboardingCompleted'
);

const subscriptions = [];
const context = {
	subscriptions,
	extensionUri: fakeVscode.Uri.file('/mock/extension'),
	globalState: {
		get(key, fallback) {
			return mockGlobalState.has(key) ? mockGlobalState.get(key) : fallback;
		},
		async update(key, val) {
			mockGlobalState.set(key, val);
		}
	}
};

onboarding.activate(context);
check('onboarding activate registers command yana.onboarding.open', mockCommands.has('yana.onboarding.open'));
check('onboarding state reflects current settings', mockConfig.yana.mode === 'supervised' && mockConfig.yana.provider === 'ollama');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
