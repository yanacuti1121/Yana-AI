#!/usr/bin/env node
/**
 * yamtam-engine npm installer
 * Copies plugin files to .claude/ in the current project.
 * Run: npx yamtam-engine  OR  yarn yamtam-engine
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
  console.log("\n  🛡️  yamtam-engine installer\n");

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
  console.log("  Next: yamtam doctor .\n");
}

main();
