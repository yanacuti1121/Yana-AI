#!/usr/bin/env node
/**
 * yana-ai npm installer
 * Copies plugin files to .claude/ in the current project.
 * Run: npx yana-ai  OR  yarn yana-ai
 */

const fs        = require("fs");
const path      = require("path");
const os        = require("os");
const crypto    = require("crypto");
const readline  = require("readline");
const { execFileSync } = require("child_process");

const PKG_ROOT  = path.join(__dirname, "..");
const AUTO_MODE = process.argv.includes("--auto");
const TARGET    = process.env.INIT_CWD || process.cwd();   // project root

const COPY_DIRS = [
  ["core/hooks",    ".claude/hooks"],
  ["core/commands", ".claude/commands"],
  ["core/agents",   ".claude/agents"],
  ["core/rules",    ".claude/rules"],
  // ── core/scripts + core/gates ──────────────────────────────────────────────
  // FIX (audit 2026-06-21): these two were missing from COPY_DIRS even though
  // they're listed in package.json "files" (so they DO ship inside the npm
  // tarball) — they just never landed in the target project's .claude/.
  // Several installed hooks reference them by relative path:
  //   .claude/hooks/truth-gate-guard.sh      → ../scripts/session-trust.sh
  //   .claude/hooks/session-checkpoint-hook.sh → ../scripts/session-checkpoint.sh
  //   .claude/scripts/safe-run.sh            → ../gates/identity-gate.sh
  // Without this fix those calls silently no-op (file not found, hook still
  // exits 0) — real npm users got a quieter, weaker install than the repo's
  // own dogfooded .claude/ copy, with no error or warning at install time.
  ["core/scripts",  ".claude/scripts"],
  ["core/gates",    ".claude/gates"],
  ["gates",         ".claude/gates"],
];

const COPY_FILES = [
  [".claude-plugin/plugin.json",      ".claude-plugin/plugin.json"],
  [".claude-plugin/marketplace.json", ".claude-plugin/marketplace.json"],
];

// ── Giám thị watcher — opt-in background LaunchAgent (macOS only) ──────────
// Not part of COPY_DIRS/COPY_FILES: this registers a persistent process
// outside the project directory (~/Library/LaunchAgents/), so it must never
// be silent-by-default. Ask, default No, only on macOS with an interactive
// TTY. See core/rules/71-entry-point-verify-law.md — this file is a
// registered entry point; any change here needs a real exec() verification
// pass, not just a lint/compile check.

function askYesNo(question) {
  if (!process.stdin.isTTY || AUTO_MODE) return Promise.resolve(false); // safe default: no prompt possible → decline
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function watcherLabel(targetPath) {
  const hash = crypto.createHash("sha256").update(targetPath).digest("hex").slice(0, 8);
  return `com.yanaai.giamthi-watch.${hash}`;
}

function installGiamthiWatcher(targetPath) {
  const watchScript = path.join(targetPath, ".claude", "scripts", "giamthi-watch.sh");
  if (!fs.existsSync(watchScript)) {
    console.log("  ✗ giamthi-watch.sh not found in .claude/scripts — skipping watcher setup.");
    return;
  }

  const label     = watcherLabel(targetPath);
  const stateDir  = path.join(targetPath, ".claude", "state");
  const logPath   = path.join(stateDir, "giamthi-runner.log");
  const plistDir  = path.join(os.homedir(), "Library", "LaunchAgents");
  const plistPath = path.join(plistDir, `${label}.plist`);

  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(plistDir, { recursive: true });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${watchScript}</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>StartInterval</key>
    <integer>21600</integer>

    <key>StandardOutPath</key>
    <string>${logPath}</string>

    <key>StandardErrorPath</key>
    <string>${logPath}</string>

    <key>WorkingDirectory</key>
    <string>${targetPath}</string>
</dict>
</plist>
`;

  fs.writeFileSync(plistPath, plist);

  // Best-effort unload first: on a re-install (e.g. upgrading the package)
  // the LaunchAgent from a previous run may already be loaded, and
  // `launchctl load` on an already-loaded job can exit non-zero — tripping
  // the catch below with a false "load failed" message even though the
  // watcher is running fine. Unloading first makes every load a fresh one.
  try {
    execFileSync("launchctl", ["unload", plistPath], { stdio: "ignore" });
  } catch {
    // Nothing was loaded yet — expected on a first install, ignore.
  }

  try {
    execFileSync("launchctl", ["load", plistPath], { stdio: "ignore" });
  } catch (e) {
    console.log(`  ✗ launchctl load failed: ${e.message}`);
    console.log(`    Plist written to ${plistPath} — try loading it manually: launchctl load "${plistPath}"`);
    return;
  }

  console.log(`  ✓ Giám thị watcher installed: ${plistPath}`);
  console.log(`    Runs every 6h + on login. Logs: ${logPath}`);
  console.log(`    To remove: launchctl unload "${plistPath}" && rm "${plistPath}"`);
  console.log(`    Tip: brew install terminal-notifier — makes halt alerts clickable (optional).`);
}

async function maybeInstallGiamthiWatcher(targetPath) {
  if (process.platform !== "darwin") {
    return; // launchd is macOS-only; no equivalent wired for Linux/Windows yet
  }
  const yes = await askYesNo(
    "  Install background watcher (scans hooks/rules for tampering every 6h)? (y/N) "
  );
  if (yes) installGiamthiWatcher(targetPath);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
      count++;
    }
  }
  return count;
}

async function main() {
  console.log("\n  🛡️  yana-ai installer\n");

  if (AUTO_MODE && TARGET === PKG_ROOT) {
    // postinstall fired inside node_modules — skip
    return;
  }

  let total = 0;
  for (const [srcRel, destRel] of COPY_DIRS) {
    const src  = path.join(PKG_ROOT, srcRel);
    const dest = path.join(TARGET,   destRel);
    const n = copyDir(src, dest);
    if (n > 0) console.log(`  ✓ ${destRel} (${n} files)`);
    total += n;
  }

  for (const [srcRel, destRel] of COPY_FILES) {
    const src  = path.join(PKG_ROOT, srcRel);
    const dest = path.join(TARGET,   destRel);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log(`  ✓ ${destRel}`);
      total++;
    }
  }

  if (total === 0) {
    console.log("  ✗ Nothing copied — run from your project root.");
    process.exit(1);
  }

  console.log(`\n  ✓ ${total} files installed to .claude/`);

  await maybeInstallGiamthiWatcher(TARGET);

  console.log("  Next: yana-ai doctor .\n");
}

main().catch((e) => {
  console.error(`  ✗ Install failed: ${e.message}`);
  process.exit(1);
});
