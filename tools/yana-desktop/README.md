<p align="center">
  <h1 align="center">🖥️ Yana AI — Desktop</h1>
</p>

<p align="center">
  <strong>Unified Yana workspace — native shell, Cyber-Sakura UI, and a real yana-rt console.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/shell-Electron-47848f?style=flat-square&logo=electron" />
  <img src="https://img.shields.io/badge/ui-yana--web_(no_duplication)-2f7e6e?style=flat-square" />
  <img src="https://img.shields.io/badge/targets-Linux_·_macOS_·_Windows-7d6aa8?style=flat-square" />
</p>

---

Minimal wrapper: spawns the `yana-web` Node server on an available loopback port,
waits for `/health`, then opens it in a `BrowserWindow`. No duplicated UI code —
the web app **is** the desktop app.

The Local Workspace has two persistent views:

- **Yana Core** embeds the real `yana-rt chat` process through the Rust
  `pty_bridge`. Provider calls, tools, approvals, history and cost tracking stay
  inside `yana-rt`; the renderer only displays and forwards terminal bytes.
- **Studio** embeds an optional loopback-only code-server at
  `http://127.0.0.1:8092`. It loads only after the user opens the Studio tab.

## Run

```bash
cd ../yana-web && npm ci && npm run build:desktop
cd ../.. && cargo build --release --features cli,pty-bridge --bin yana-rt --bin pty_bridge
cd tools/yana-desktop && npm ci
npm start
```

To use the optional Studio tab, start code-server separately and keep it bound
to loopback only:

```bash
code-server --bind-addr 127.0.0.1:8092
```

For the terminal-only experience, no Node or Electron process is required:

```bash
cargo run --features cli --bin yana-rt -- chat
```

## Build

```bash
npm run stage:runtime
npm run build:linux    # AppImage + deb
npm run build:mac      # dmg + zip
npm run build:win      # nsis installer
```

The release workflow builds the web UI and both Rust binaries before packaging.
Each architecture runs on a matching GitHub-hosted runner, so the Electron shell,
`yana-rt`, and `pty_bridge` always have the same architecture.

**Known gap — not code-signed.** `package.json`'s `build` config has no
`mac.hardenedRuntime`/notarization or `win.certificateFile` set, since
that requires a paid Apple Developer ID / Windows code-signing certificate
this project doesn't currently hold. Unsigned builds trigger Gatekeeper
("unidentified developer") on macOS and SmartScreen warnings on Windows.
This can't be fixed in code — it needs a certificate to be purchased and
wired into the build pipeline (`CSC_LINK`/`CSC_KEY_PASSWORD` env vars for
electron-builder) before it's resolved.

## Auto-update

Wired via `electron-updater`, checking GitHub Releases (this repo,
`build.publish` in `package.json`) on launch and every 4 hours after.
Ask-before-download and ask-before-install — never silent.

CI (`.github/workflows/desktop.yml`) builds with
`electron-builder --publish never`, then explicitly uploads installers, update
archives, blockmaps, and the `latest.yml`/`latest-mac.yml`/`latest-linux*.yml`
feed files electron-updater reads to know a newer version exists.

Because of the code-signing gap above: on macOS, electron-updater verifies
a downloaded update's signature before installing it, so today the app
will correctly detect and offer a macOS update but `quitAndInstall()` will
fail with a signature error until this project has a certificate. Windows
(NSIS) and Linux (AppImage) are not signature-gated the same way and the
full download → install flow works on those today, at the same reduced
trust level any unsigned Windows/Linux binary already carries.

## Behavior

- 🚀 Spawns `server.js` on a free loopback port → polls `/health` → opens window
- 🧠 Embeds `yana-rt chat` through a local PTY; no mock chat engine in the UI
- 🌸 Ships Cyber-Sakura/Lotus presentation controls without exposing safety
  policy or runtime authority to browser storage
- 🧰 Keeps the real local Studio available as a persistent, lazy-loaded tab
- 🧭 System tray: Open · Open in browser · Quit
- 🔗 External links open in the OS browser, never embedded
- 🧹 `before-quit` kills the server child process cleanly
- 🔐 Server stays loopback-only (`127.0.0.1`) — nothing exposed to the network
- 🔄 Checks for updates on launch + every 4h — see **Auto-update** above

---

Part of [Yana AI](../../README.md) · Apache 2.0
