<p align="center">
  <h1 align="center">🖥️ Yana AI — Desktop</h1>
</p>

<p align="center">
  <strong>Electron shell for Yana AI — same UI, native window, bundled yana-rt.</strong>
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

## Run

```bash
node --version            # Node.js 24+
cd ../yana-web && npm ci && npm run build:desktop
cd ../.. && cargo build --release --features cli,pty-bridge --bin yana-rt --bin pty_bridge
cd tools/yana-desktop && npm ci
npm start
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
Build jobs have read-only repository permissions. They upload isolated CI
artifacts, then one final job verifies all five platform/architecture bundles,
merges the two macOS updater manifests, generates `SHA256SUMS`, and publishes the
complete desktop asset set. A failed matrix leg cannot publish a partial desktop
release.

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

CI (`.github/workflows/desktop.yml`) builds with `electron-builder --publish
never`, then explicitly uploads installers, update archives, blockmaps, and the
`latest.yml`/`latest-mac.yml`/`latest-linux*.yml` feed files electron-updater
reads to know a newer version exists. The final publish job refuses a tag that
does not match this package's version or metadata that references a missing
artifact.

Because of the code-signing gap above: on macOS, electron-updater verifies
a downloaded update's signature before installing it, so today the app
will correctly detect and offer a macOS update but `quitAndInstall()` will
fail with a signature error until this project has a certificate. Windows
(NSIS) and Linux (AppImage) are not signature-gated the same way and the
full download → install flow works on those today, at the same reduced
trust level any unsigned Windows/Linux binary already carries.

## Behavior

- 🚀 Spawns `server.js` on a free loopback port → polls `/health` → opens window
- 🔗 External links open in the OS browser, never embedded
- 🧱 Navigation and privileged IPC are restricted to the exact loopback origin
- 1️⃣ A single-instance lock prevents concurrent desktop processes sharing state
- 🧹 Shutdown waits for server/PTY children and force-stops a stuck child
- 🔐 Server stays loopback-only (`127.0.0.1`) — nothing exposed to the network
- 🔄 Checks for updates on launch + every 4h — see **Auto-update** above

## Test

```bash
npm test
```

The unit suite covers runtime paths, URL/IPC trust boundaries, PTY input
validation, child shutdown, capability response handling, release assembly, and
the desktop workflow contract. The capability integration test uses a real
compiled `yana-rt`; CI sets `YANA_REQUIRE_RUNTIME_TEST=1` so a missing binary is
a failure rather than a silent skip.

---

Part of [Yana AI](../../README.md) · Apache 2.0
