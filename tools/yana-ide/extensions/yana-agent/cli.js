'use strict';
// Gọi một lệnh con của yana-rt và đọc kết quả JSON. Không qua shell: execFile + mảng argv.

const vscode = require('vscode');
const { execFile } = require('node:child_process');
const { resolveBinary } = require('./runtime');

const CLI_TIMEOUT_MS = 15000; // lệnh đọc dữ liệu của yana-rt chạy dưới 1 giây; 15 giây là trần an toàn
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024; // giới hạn stdout để tránh treo vì output quá lớn

class YanaCliError extends Error {
	constructor(message, kind) {
		super(message);
		this.kind = kind; // 'no-binary' | 'untrusted' | 'no-folder' | 'failed' | 'bad-json'
	}
}

function workspaceRoot() {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
}

function binary() {
	return resolveBinary(vscode.workspace.getConfiguration('yana').get('runtimePath', ''));
}

// Chạy yana-rt <args>. Từ chối khi thư mục chưa trust, vì yana-rt đọc và ghi trạng thái trong thư mục đó.
function run(args) {
	return new Promise((resolve, reject) => {
		const bin = binary();
		const cwd = workspaceRoot();
		if (!bin) return reject(new YanaCliError('yana-rt not found', 'no-binary'));
		if (!cwd) return reject(new YanaCliError('No folder open', 'no-folder'));
		if (!vscode.workspace.isTrusted) return reject(new YanaCliError('Folder is not trusted', 'untrusted'));
		execFile(bin, args, { cwd, timeout: CLI_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES }, (error, stdout, stderr) => {
			if (error) {
				const detail = String(stderr || error.message).trim().split('\n').slice(-3).join(' ');
				return reject(new YanaCliError(`yana-rt ${args.slice(0, 2).join(' ')}: ${detail}`, 'failed'));
			}
			resolve(String(stdout));
		});
	});
}

async function runJson(args) {
	const text = await run(args);
	try {
		return JSON.parse(text);
	} catch {
		throw new YanaCliError(`yana-rt ${args.slice(0, 2).join(' ')} did not return valid JSON`, 'bad-json');
	}
}

module.exports = { run, runJson, YanaCliError, workspaceRoot, binary };
