'use strict';
// Cầu nối từ app chat Yana (SwiftUI) sang IDE: app ghi một file yêu cầu, IDE chạy việc đó trong terminal
// của chính Yana Studio. File chỉ được chọn một tên việc trong danh sách cố định dưới đây; mọi lệnh shell
// đều nằm sẵn trong file này, không bao giờ lấy từ nội dung file yêu cầu.

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STATE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'YanaApp');
const REQUEST_FILE = path.join(STATE_DIR, 'ide-request.json');
const MAX_REQUEST_BYTES = 1024;
const DEBOUNCE_MS = 300;

// Cài/cập nhật yana-ai (PyPI) trước, yana-rt (crates.io) sau cùng. Thứ tự này có chủ đích: gói yana-ai
// cũng khai báo một lệnh tên `yana-rt` (một launcher dạng chữ). Nếu launcher đó nằm ở ~/.local/bin/yana-rt
// thì từng gây đệ quy tự gọi chính nó (sự cố 2026-09-17). Bước cuối luôn đặt lại binary Mach-O thật vào đó.
const INSTALL_RUNTIME_SCRIPT = `#!/bin/bash
set -e
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
step() { printf '\\n\\033[1;34m== Yana: %s\\033[0m\\n' "$1"; }

step "yana-ai (PyPI)"
if ! command -v pipx >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install pipx
  else
    echo "Không có pipx và Homebrew. Cài bằng pip trong môi trường Python của anh: pip install yana-ai"
    echo "(Python của Homebrew chặn 'pip install' ngoài venv theo PEP 668, nên Yana dùng pipx.)"
    exit 1
  fi
fi
if pipx list --short 2>/dev/null | grep -q '^yana-ai '; then
  # A yana-ai installed from a local folder (e.g. a deleted checkout) cannot be upgraded from PyPI:
  # pipx re-reads the old path. Reinstall it from PyPI instead. No --force: pipx then leaves the real
  # ~/.local/bin/yana-rt binary alone instead of replacing it with its launcher.
  source_of_yana_ai() {
    pipx list --json 2>/dev/null | python3 -c 'import json,sys; v=json.load(sys.stdin)["venvs"].get("yana-ai", {}); print(v.get("metadata", {}).get("main_package", {}).get("package_or_url", ""))'
  }
  case "$(source_of_yana_ai)" in /*|.*|~*) from_folder=1 ;; *) from_folder=0 ;; esac
  if [ "$from_folder" = 1 ] || ! pipx upgrade yana-ai; then
    echo "yana-ai is not installed from PyPI here; reinstalling it from PyPI."
    pipx uninstall yana-ai
    pipx install yana-ai
  fi
else
  pipx install yana-ai
fi

step "yana-rt (crates.io)"
if ! command -v cargo >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install rust
  else
    echo "Không có cargo và Homebrew. Cài Rust tại https://rustup.rs rồi bấm Cài lại."
    exit 1
  fi
fi
cargo install yana-rt --force
mkdir -p "$HOME/.local/bin"
# Nếu ~/.local/bin/yana-rt là symlink (launcher của pipx), gỡ link trước để cp không ghi đè vào venv.
if [ -L "$HOME/.local/bin/yana-rt" ]; then unlink "$HOME/.local/bin/yana-rt"; fi
cp "$HOME/.cargo/bin/yana-rt" "$HOME/.local/bin/yana-rt"

step "Kiểm tra"
file "$HOME/.local/bin/yana-rt"
yana-rt --version
yana-ai --version || true
pipx list --short | grep '^yana-ai ' || true
echo
echo "Xong. Quay lại app Yana và bấm Kiểm tra lại."
`;

const ACTIONS = {
	'install-runtime': runInstallRuntime,
};

function runInstallRuntime() {
	const script = path.join(os.tmpdir(), 'yana-install-runtime.sh');
	fs.writeFileSync(script, INSTALL_RUNTIME_SCRIPT, { mode: 0o700 });
	const term = vscode.window.createTerminal({ name: 'Yana: cài yana-ai + yana-rt' });
	term.show(false);
	term.sendText(`bash '${script}'`);
}

function readRequest(output) {
	let raw;
	try {
		const stat = fs.statSync(REQUEST_FILE);
		if (!stat.isFile() || stat.size > MAX_REQUEST_BYTES) return null;
		raw = fs.readFileSync(REQUEST_FILE, 'utf8');
	} catch (error) {
		if (error.code !== 'ENOENT') output.warn(`app-bridge: cannot read request: ${error.message}`);
		return null;
	}
	// Xoá trước khi chạy để một yêu cầu không bao giờ chạy hai lần.
	try { fs.unlinkSync(REQUEST_FILE); } catch (error) { output.warn(`app-bridge: cannot remove request: ${error.message}`); }
	try {
		const action = JSON.parse(raw).action;
		return typeof action === 'string' ? action : null;
	} catch (error) {
		output.warn(`app-bridge: request is not JSON: ${error.message}`);
		return null;
	}
}

function handle(output) {
	const action = readRequest(output);
	if (!action) return;
	const run = ACTIONS[action];
	if (!run) { output.warn(`app-bridge: unknown action ${JSON.stringify(action)} ignored`); return; }
	try {
		run();
		output.info(`app-bridge: ran ${action}`);
	} catch (error) {
		output.error(`app-bridge: ${action} failed: ${error.stack || error.message}`);
		vscode.window.showErrorMessage(`Yana: ${error.message}`);
	}
}

function activate(context) {
	const output = vscode.window.createOutputChannel('Yana app bridge', { log: true });
	context.subscriptions.push(output);
	try {
		fs.mkdirSync(STATE_DIR, { recursive: true });
	} catch (error) {
		output.error(`app-bridge: cannot create ${STATE_DIR}: ${error.message}`);
		return;
	}
	// Yêu cầu ghi trước khi IDE kịp mở.
	handle(output);
	let timer;
	const watcher = fs.watch(STATE_DIR, (_event, name) => {
		if (name && name !== path.basename(REQUEST_FILE)) return;
		clearTimeout(timer);
		timer = setTimeout(() => handle(output), DEBOUNCE_MS);
	});
	context.subscriptions.push({ dispose: () => { clearTimeout(timer); watcher.close(); } });
}

module.exports = { id: 'app-bridge', activate };
