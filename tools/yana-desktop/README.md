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

## Behavior

- 🚀 Spawns `server.js` → polls `/api/status` (30 × 400ms) → opens window
- 🧭 System tray: Open · Open in browser · Quit
- 🔗 External links open in the OS browser, never embedded
- 🧹 `before-quit` kills the server child process cleanly
- 🔐 Server stays loopback-only (`127.0.0.1`) — nothing exposed to the network

---

Part of [YAMTAM ENGINE](../../README.md) · Apache 2.0
