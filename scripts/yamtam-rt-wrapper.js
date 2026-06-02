#!/usr/bin/env node
/**
 * yamtam-rt wrapper — finds and runs the yamtam-rt binary.
 * Resolution order:
 *   1. $YAMTAM_RT_BIN env var (explicit override)
 *   2. yamtam-rt on $PATH (system install)
 *   3. Prebuilt binary shipped with this package (bin/yamtam-rt-<platform>)
 *   4. Locally built: target/release/yamtam-rt (cargo build --release)
 */
const { execFileSync } = require("child_process");
const path = require("path");
const fs   = require("fs");

const PKG = path.join(__dirname, "..");
const ARGS = process.argv.slice(2);

function exists(p) { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } }

function platformBin() {
  const plat = process.platform;        // linux, darwin, win32
  const arch = process.arch === "x64" ? "x86_64" : process.arch;
  const ext  = plat === "win32" ? ".exe" : "";
  return path.join(PKG, "bin", `yamtam-rt-${plat}-${arch}${ext}`);
}

const candidates = [
  process.env.YAMTAM_RT_BIN,
  "yamtam-rt",                                        // system PATH
  platformBin(),                                       // pre-built for platform
  path.join(PKG, "target", "release", "yamtam-rt"),   // cargo build --release
].filter(Boolean);

for (const bin of candidates) {
  if (bin === "yamtam-rt") {
    // Try PATH resolution
    try {
      execFileSync(bin, ARGS, { stdio: "inherit" });
      process.exit(0);
    } catch (e) {
      if (e.status !== undefined && e.status !== null) process.exit(e.status);
      // Not found on PATH — continue to next candidate
    }
    continue;
  }
  if (exists(bin)) {
    try {
      execFileSync(bin, ARGS, { stdio: "inherit" });
      process.exit(0);
    } catch (e) {
      process.exit(e.status ?? 1);
    }
  }
}

console.error([
  "yamtam-rt: binary not found.",
  "",
  "To install, run one of:",
  "  cargo install --path " + PKG + "  # build from source (requires Rust)",
  "  export YAMTAM_RT_BIN=/path/to/yamtam-rt  # point to existing binary",
].join("\n"));
process.exit(1);
