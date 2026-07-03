<p align="center">
  <h1 align="center">🖥️ Yana AI — Desktop</h1>
</p>

<p align="center">
  <strong>Electron shell for Yana AI — same UI, native window, system tray.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/shell-Electron-47848f?style=flat-square&logo=electron" />
  <img src="https://img.shields.io/badge/ui-yana--web_(no_duplication)-2f7e6e?style=flat-square" />
  <img src="https://img.shields.io/badge/targets-Linux_·_macOS_·_Windows-7d6aa8?style=flat-square" />
</p>

---

Minimal wrapper: spawns the `yana-web` Node server as a child process, waits for
`/api/status`, then opens it in a `BrowserWindow`. No duplicated UI code —
the web app **is** the desktop app.

## Run

```bash
npm install
npm start
```

## Build

```bash
npm run build:linux    # AppImage + deb
npm run build:mac      # dmg
npm run build:win      # nsis installer
```

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
`electron-builder --publish onTag`, which uploads the installers **and**
the `latest.yml`/`latest-mac.yml`/`latest-linux.yml` feed files
electron-updater reads to know a newer version exists.

Because of the code-signing gap above: on macOS, electron-updater verifies
a downloaded update's signature before installing it, so today the app
will correctly detect and offer a macOS update but `quitAndInstall()` will
fail with a signature error until this project has a certificate. Windows
(NSIS) and Linux (AppImage) are not signature-gated the same way and the
full download → install flow works on those today, at the same reduced
trust level any unsigned Windows/Linux binary already carries.

## Behavior

- 🚀 Spawns `server.js` → polls `/api/status` (30 × 400ms) → opens window
- 🧭 System tray: Open · Open in browser · Quit
- 🔗 External links open in the OS browser, never embedded
- 🧹 `before-quit` kills the server child process cleanly
- 🔐 Server stays loopback-only (`127.0.0.1`) — nothing exposed to the network
- 🔄 Checks for updates on launch + every 4h — see **Auto-update** above

---

Part of [Yana AI](../../README.md) · Apache 2.0
