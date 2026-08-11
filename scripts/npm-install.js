#!/usr/bin/env node
/**
 * Legacy Node compatibility installer for local repository tooling.
 * Public distribution uses PyPI: `pip install yana-ai && yana-ai install`.
 */

const fs        = require("fs");
const path      = require("path");
const readline  = require("readline");
const { execFileSync } = require("child_process");
const { syncCodex } = require("../core/scripts/sync-codex.js");

const PKG_ROOT  = path.join(__dirname, "..");
const AUTO_MODE = process.argv.includes("--auto");
const TARGET    = process.env.INIT_CWD || process.cwd();   // project root

const COPY_DIRS = [
  ["core/hooks",    ".claude/hooks"],
  ["core/lib",      ".claude/lib"],
  ["core/commands", ".claude/commands"],
  ["core/agents",   ".claude/agents"],
  ["core/skills",   ".claude/skills"],
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
  [".codex/config.toml",               ".codex/config.toml"],
  [".codex/hooks.json",                ".codex/hooks.json"],
];

// ── Giám thị watcher — opt-in cross-platform OS supervisor ─────────────────
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

function installGiamthiWatcher(targetPath) {
  const manager = path.join(targetPath, ".claude", "scripts", "giamthi_service.py");
  if (!fs.existsSync(manager)) {
    console.log("  ✗ giamthi_service.py not found in .claude/scripts — skipping supervisor setup.");
    return;
  }
  const candidates = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];
  for (const python of candidates) {
    try {
      execFileSync(python, [manager, "install", targetPath], { stdio: "inherit" });
      return;
    } catch (error) {
      if (error.code === "ENOENT") continue;
      console.log(`  ✗ Giám thị supervisor setup failed: ${error.message}`);
      console.log(`    Retry: yana-ai giamthi repair "${targetPath}"`);
      return;
    }
  }
  console.log("  ✗ Python 3 not found — OS supervisor was not installed.");
  console.log(`    After installing Python 3, run: yana-ai giamthi install "${targetPath}"`);
}

async function maybeInstallGiamthiWatcher(targetPath) {
  const yes = await askYesNo(
    "  Install OS-level Giám thị supervisor (launchd/systemd/Task Scheduler)? (y/N) "
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

  syncCodex(PKG_ROOT, TARGET);

  const agentsPath = path.join(TARGET, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    fs.copyFileSync(path.join(PKG_ROOT, "adapters/codex.md"), agentsPath);
    console.log("  ✓ AGENTS.md (Yana AI Codex guidance)");
    total++;
  } else {
    console.log("  ↪ AGENTS.md preserved (existing project guidance)");
  }

  if (total === 0) {
    console.log("  ✗ Nothing copied — run from your project root.");
    process.exit(1);
  }

  console.log(`\n  ✓ ${total} base files installed; Codex agents, skills, commands, and hooks synchronized`);

  await maybeInstallGiamthiWatcher(TARGET);

  console.log("  Next: yana-ai doctor .\n");
}

main().catch((e) => {
  console.error(`  ✗ Install failed: ${e.message}`);
  process.exit(1);
});
