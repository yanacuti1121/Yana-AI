#!/usr/bin/env node
/**
 * yana-ai npm installer
 * Copies plugin files to .claude/ in the current project.
 * Run: npx yana-ai  OR  yarn yana-ai
 */

const fs   = require("fs");
const path = require("path");

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

function main() {
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
  console.log("  Next: yana-ai doctor .\n");
}

main();
