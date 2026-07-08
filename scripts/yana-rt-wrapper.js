#!/usr/bin/env node
/**
 * yana-rt wrapper — finds and runs the yana-rt binary.
 * Resolution order:
 *   1. $YANA_RT_BIN env var (explicit override)
 *   2. yana-rt on $PATH (system install) — but NEVER this wrapper itself
 *   3. Prebuilt binary shipped with this package (bin/yana-rt-<platform>)
 *   4. Locally built: target/release/yana-rt (cargo build --release)
 *
 * BUG FIX (2026-07-07): npm's `bin` linking makes `yana-rt` on $PATH resolve
 * back to THIS SAME FILE when no compiled binary exists anywhere. The old
 * code exec'd the bare string "yana-rt" and let the OS search $PATH, which
 * found this wrapper again — spawning an identical child that did the same
 * PATH lookup, recursing without limit. Each level blocks on its child
 * (execFileSync is synchronous), so the process count and memory usage grow
 * without bound until the machine runs out of resources. Confirmed as the
 * root cause of a real incident: 100% CPU, 116°C, hard hang requiring a
 * forced shutdown. Fixed by resolving $PATH ourselves, comparing the real
 * path of anything found to our own real path, and refusing to exec a
 * self-match — plus a recursion-guard env var as a second line of defense.
 */
const { execFileSync } = require("child_process");
const path = require("path");
const fs   = require("fs");

const PKG = path.join(__dirname, "..");
const ARGS = process.argv.slice(2);
const RECURSION_GUARD = "YANA_RT_WRAPPER_ACTIVE";

function exists(p) { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } }

function realpathOrNull(p) { try { return fs.realpathSync(p); } catch { return null; } }

function platformBin() {
  const plat = process.platform;        // linux, darwin, win32
  const arch = process.arch === "x64" ? "x86_64" : process.arch;
  const ext  = plat === "win32" ? ".exe" : "";
  return path.join(PKG, "bin", `yana-rt-${plat}-${arch}${ext}`);
}

// Manually resolve "yana-rt" on $PATH so we can detect (and refuse) a
// self-reference BEFORE exec'ing anything — never delegate this lookup to
// the OS/child_process, since that is exactly what recursed last time.
function resolveOnPath(name) {
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

function runAndExit(bin) {
  try {
    execFileSync(bin, ARGS, {
      stdio: "inherit",
      env: { ...process.env, [RECURSION_GUARD]: "1" },
    });
    process.exit(0);
  } catch (e) {
    process.exit(e.status ?? 1);
  }
}

const selfRealpath = realpathOrNull(__filename);

const candidates = [
  process.env.YANA_RT_BIN,
  platformBin(),                                     // pre-built for platform
  path.join(PKG, "target", "release", "yana-rt"),   // cargo build --release
].filter(Boolean);

// Only attempt the $PATH candidate if we are not already inside a wrapper
// invocation — this is the second, independent guard against recursion.
if (!process.env[RECURSION_GUARD]) {
  const onPath = resolveOnPath("yana-rt");
  if (onPath) {
    const onPathReal = realpathOrNull(onPath);
    if (onPathReal && onPathReal !== selfRealpath) {
      candidates.unshift(onPath);
    }
    // else: "yana-rt" on $PATH is this same wrapper (or unresolvable) —
    // skip it silently and fall through to the prebuilt/cargo candidates.
  }
}

for (const bin of candidates) {
  if (exists(bin)) runAndExit(bin);
}

console.error([
  "yana-rt: binary not found.",
  "",
  "To install, run one of:",
  "  cargo install --path " + PKG + "  # build from source (requires Rust)",
  "  export YANA_RT_BIN=/path/to/yana-rt  # point to existing binary",
].join("\n"));
process.exit(1);
