import Foundation

// The fixed script that installs or upgrades Yana's two command-line parts in the app's own terminal
// panel, so the app keeps running while it works. Order matters: yana-ai (PyPI) first, then yana-rt
// (crates.io), then the real yana-rt binary is copied over ~/.local/bin/yana-rt, because the yana-ai
// package also declares a text launcher named yana-rt that once called itself forever (2026-09-17).
// Same steps as Yana Studio's features/app-bridge.js, plus `yana-ai install` after the PyPI step.

enum RuntimeInstallScript {
	static let text = #"""
	#!/bin/bash
	set -e
	export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
	step() { printf '\n\033[1;34m== Yana: %s\033[0m\n' "$1"; }

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
	  source_of_yana_ai() {
	    pipx list --json 2>/dev/null | python3 -c 'import json,sys; v=json.load(sys.stdin)["venvs"].get("yana-ai", {}); print(v.get("metadata", {}).get("main_package", {}).get("package_or_url", ""))'
	  }
	  case "$(source_of_yana_ai)" in /*|.*|~*) from_folder=1 ;; *) from_folder=0 ;; esac
	  if [ "$from_folder" = 1 ] || ! pipx upgrade yana-ai; then
	    echo "yana-ai không cài từ PyPI ở máy này; cài lại từ PyPI."
	    pipx uninstall yana-ai
	    pipx install yana-ai
	  fi
	else
	  pipx install yana-ai
	fi

	step "yana-ai install"
	yana-ai install

	step "yana-rt (crates.io)"
	if ! command -v cargo >/dev/null 2>&1; then
	  if command -v brew >/dev/null 2>&1; then
	    brew install rust
	  else
	    echo "Không có cargo và Homebrew. Cài Rust tại https://rustup.rs rồi bấm Cài lại."
	    exit 1
	  fi
	fi
	# No --force: cargo skips the build when the newest yana-rt is already installed.
	cargo install yana-rt
	mkdir -p "$HOME/.local/bin"
	if [ -L "$HOME/.local/bin/yana-rt" ]; then unlink "$HOME/.local/bin/yana-rt"; fi
	cp "$HOME/.cargo/bin/yana-rt" "$HOME/.local/bin/yana-rt"

	step "Kiểm tra"
	file "$HOME/.local/bin/yana-rt"
	yana-rt --version
	yana-ai --version || true
	echo
	echo "Xong. App Yana đang kiểm tra lại phiên bản."
	# Tells the app the install part is over (the chat below keeps this tab open).
	touch "$HOME/Library/Application Support/YanaApp/install-runtime.done"

	step "yana-rt chat --provider ollama"
	if curl -s -m 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
	  exec yana-rt chat --provider ollama
	else
	  echo "Ollama chưa chạy trên máy này. Mở Ollama rồi chạy: yana-rt chat --provider ollama"
	fi
	"""#

	static var doneMarker: URL {
		FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
			.appendingPathComponent("YanaApp/install-runtime.done")
	}

	// Writes the script into the app's own folder (not a shared temp dir), readable only by this user.
	static func write() throws -> URL {
		let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
			.appendingPathComponent("YanaApp", isDirectory: true)
		try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
		let url = folder.appendingPathComponent("install-runtime.sh")
		try text.write(to: url, atomically: true, encoding: .utf8)
		try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: url.path)
		return url
	}
}
