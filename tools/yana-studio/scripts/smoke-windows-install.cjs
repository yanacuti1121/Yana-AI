#!/usr/bin/env node
"use strict";
// Install-and-launch smoke test for a Windows NSIS installer, meant for the
// GitHub-hosted Windows runners (windows-latest for x64, windows-11-arm for
// arm64) so each architecture is tested natively.
//
// It follows the path a user takes and reports, with evidence, where it breaks:
// install -> executable exists -> shortcut targets exist -> first launch ->
// renderer loaded -> uninstall. The renderer is inspected over the Chrome
// DevTools protocol, so a black window shows up as a concrete finding (the page
// URL, an error page, no #root children, a missing preload bridge) together
// with the tail of Chromium's own log, instead of a screenshot.
//
//   node scripts/smoke-windows-install.cjs --installer <path> --arch x64|arm64
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync, execFileSync } = require("node:child_process");

const PRODUCT = "Yana Studio";
const DEBUG_PORT = 9333;
const INSTALL_TIMEOUT_MS = 180_000;
const TARGET_WAIT_MS = 60_000;
const SETTLE_MS = 8_000;
const UNINSTALL_WAIT_MS = 60_000;
const LOG_TAIL_LINES = 60;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const findings = [];
const fail = (message) => {
  findings.push(message);
  console.log(`  FAIL  ${message}`);
  console.log(`::error title=Windows install smoke::${message}`);
};
const ok = (message) => console.log(`  ok    ${message}`);

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function shortcutTarget(lnk) {
  const script = `(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}').TargetPath`;
  return execFileSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8" },
  ).trim();
}

function shortcutLocations() {
  const userProfile = process.env.USERPROFILE ?? os.homedir();
  return [
    path.join(
      process.env.APPDATA ?? "",
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      `${PRODUCT}.lnk`,
    ),
    path.join(userProfile, "Desktop", `${PRODUCT}.lnk`),
    path.join(process.env.PUBLIC ?? "C:\\Users\\Public", "Desktop", `${PRODUCT}.lnk`),
  ];
}

function checkShortcuts(installedExe) {
  const present = shortcutLocations().filter((lnk) => fs.existsSync(lnk));
  if (!present.length) {
    fail(`no ${PRODUCT} shortcut was created (looked in Start Menu and Desktop)`);
    return;
  }
  for (const lnk of present) {
    const target = shortcutTarget(lnk);
    if (!target || !fs.existsSync(target))
      fail(`shortcut ${lnk} points at "${target}", which does not exist ("Missing Shortcut")`);
    else if (path.resolve(target).toLowerCase() !== path.resolve(installedExe).toLowerCase())
      fail(`shortcut ${lnk} points at ${target}, not at the installed ${installedExe}`);
    else ok(`shortcut ${path.basename(lnk)} -> ${target}`);
  }
}

async function jsonList() {
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  return response.json();
}

async function waitForPage() {
  const deadline = Date.now() + TARGET_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const page = (await jsonList()).find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // DevTools port not open yet.
    }
    await sleep(1000);
  }
  return null;
}

async function inspectRenderer(page) {
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("DevTools connection failed"));
  });
  let nextId = 0;
  const waiting = new Map();
  const events = [];
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && waiting.has(data.id)) {
      waiting.get(data.id)(data);
      waiting.delete(data.id);
    } else if (data.method) events.push(data);
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      waiting.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await sleep(SETTLE_MS);
  const evaluated = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const root = document.getElementById("root");
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        rootChildren: root ? root.children.length : -1,
        bodyTextLength: document.body ? document.body.innerText.length : -1,
        bodyTextSample: document.body ? document.body.innerText.slice(0, 120) : "",
        hasStudioBridge: typeof window.studio === "object",
        background: document.body ? getComputedStyle(document.body).backgroundColor : "",
      };
    })()`,
  });
  socket.close();
  const problems = events
    .filter((event) =>
      ["Runtime.exceptionThrown", "Log.entryAdded"].includes(event.method),
    )
    .map((event) => JSON.stringify(event.params).slice(0, 400));
  return { state: evaluated.result?.result?.value ?? null, problems };
}

function tailOf(file) {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/).slice(-LOG_TAIL_LINES).join("\n");
  } catch {
    return "(no Chromium log was written)";
  }
}

async function main() {
  const installer = option("installer");
  const arch = option("arch");
  if (!installer || !["x64", "arm64"].includes(arch)) {
    console.error("usage: smoke-windows-install.cjs --installer <path> --arch x64|arm64");
    process.exit(2);
  }
  const installDir = option("dir") ?? "C:\\yana-smoke\\app";
  const exe = path.join(installDir, `${PRODUCT}.exe`);
  const logFile = path.join(os.tmpdir(), "yana-studio-chromium.log");
  console.log(
    `Windows install smoke: ${arch} installer ${installer}\nrunner: ${os.type()} ${os.release()} process.arch=${process.arch}`,
  );

  console.log("\n[1/6] install");
  const install = spawnSync(installer, ["/S", `/D=${installDir}`], {
    windowsHide: true,
    timeout: INSTALL_TIMEOUT_MS,
  });
  if (install.status !== 0)
    fail(`installer exited with ${install.status ?? install.signal ?? install.error}`);
  else ok("installer exited 0");

  console.log("\n[2/6] executable");
  if (!fs.existsSync(exe)) {
    fail(`${exe} does not exist after a successful install`);
    const listing = fs.existsSync(installDir) ? fs.readdirSync(installDir) : ["(directory missing)"];
    console.log(`  install dir contents: ${listing.join(", ")}`);
  } else ok(`${exe} exists (${fs.statSync(exe).size} bytes)`);

  console.log("\n[3/6] shortcuts");
  checkShortcuts(exe);

  console.log("\n[4/6] first launch");
  let child = null;
  if (fs.existsSync(exe)) {
    child = spawn(
      exe,
      [`--remote-debugging-port=${DEBUG_PORT}`, "--enable-logging", `--log-file=${logFile}`],
      { detached: true, stdio: "ignore", windowsHide: false },
    );
    child.unref();
    const page = await waitForPage();
    if (!page) fail(`no renderer page appeared within ${TARGET_WAIT_MS / 1000}s`);
    else {
      console.log("\n[5/6] renderer");
      const { state, problems } = await inspectRenderer(page);
      console.log(`  renderer state: ${JSON.stringify(state)}`);
      if (!state) fail("could not read the renderer state");
      else {
        const findingsBefore = findings.length;
        if (!state.href.startsWith("file:") || !state.href.endsWith("dist/index.html"))
          fail(`renderer is on ${state.href}, not the packaged dist/index.html`);
        if (state.rootChildren < 1)
          fail(`#root has ${state.rootChildren} children: the UI never mounted (black window)`);
        if (!state.hasStudioBridge)
          fail("window.studio is missing: the preload script did not run");
        if (findings.length === findingsBefore)
          ok("UI mounted and preload bridge present");
      }
      for (const problem of problems) console.log(`  renderer problem: ${problem}`);
    }
    try {
      execFileSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
    } catch {
      // Already exited.
    }
  }
  console.log(`\nChromium log (last ${LOG_TAIL_LINES} lines):\n${tailOf(logFile)}`);

  console.log("\n[6/6] uninstall");
  const uninstaller = path.join(installDir, `Uninstall ${PRODUCT}.exe`);
  if (!fs.existsSync(uninstaller)) fail(`${uninstaller} does not exist`);
  else {
    spawnSync(uninstaller, ["/S"], { windowsHide: true, timeout: INSTALL_TIMEOUT_MS });
    const deadline = Date.now() + UNINSTALL_WAIT_MS;
    while (fs.existsSync(exe) && Date.now() < deadline) await sleep(1000);
    if (fs.existsSync(exe)) fail(`${exe} still exists after uninstall`);
    else ok("executable removed");
    for (const lnk of shortcutLocations())
      if (fs.existsSync(lnk)) fail(`shortcut left behind after uninstall: ${lnk}`);
  }

  console.log(findings.length ? `\n${findings.length} finding(s).` : "\nSmoke test passed.");
  process.exit(findings.length ? 1 : 0);
}

main().catch((error) => {
  fail(`smoke test crashed: ${error.stack ?? error}`);
  process.exit(1);
});
