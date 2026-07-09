
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
 * back to THIS SAME FILE. The old code exec'd the bare string "yana-rt",
 * which found this wrapper again — unbounded synchronous recursion.
 * Confirmed root cause of a real incident: 100% CPU, 116°C, hard hang.
 *
 * HARDENING (2026-07-09): the first fix only self-checked the $PATH
 * candidate. $YANA_RT_BIN was trusted blindly — and the error message
 * below tells users to set it, so `which yana-rt` (the npm symlink)
 * pasted into YANA_RT_BIN re-armed the same infinite recursion, with
 * the guard env var powerless because it only disabled the PATH lookup.
 * Two changes:
 *   (a) The guard is now a hard fail: this wrapper being re-entered is
 *       never legitimate, so if the guard var is set we abort immediately.
 *   (b) The realpath self-check applies to EVERY candidate, including
 *       YANA_RT_BIN and any symlinked target/release path.
 */
const { execFileSync } = require("child_process");
const path = require("path");
const fs   = require("fs");
 
const PKG = path.join(__dirname, "..");
const ARGS = process.argv.slice(2);
const RECURSION_GUARD = "YANA_RT_WRAPPER_ACTIVE";
 
// (a) Hard re-entry guard. If we are here twice, some candidate led back
// to this wrapper. Abort — do not "continue to the next candidate", since
// the parent already made its choice and exec'ing anything else now would
// desync parent/child behavior.
if (process.env[RECURSION_GUARD]) {
  console.error(
    "yana-rt: recursion detected — the wrapper was re-entered by a child it spawned.\n" +
    "A candidate (likely $YANA_RT_BIN or a $PATH shim) resolves back to this wrapper.\n" +
    "Unset YANA_RT_BIN, or point it at a real compiled binary (e.g. ~/.cargo/bin/yana-rt)."
  );
  process.exit(1);
}
 
function exists(p) { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } }
function realpathOrNull(p) { try { return fs.realpathSync(p); } catch { return null; } }
 
const selfRealpath = realpathOrNull(__filename);
 
// (b) A candidate is usable only if it exists AND does not resolve back
// to this file. Unresolvable realpath => reject (fail closed, not open).
function usable(p) {
  if (!p || !exists(p)) return false;
  const real = realpathOrNull(p);
  return real !== null && real !== selfRealpath;
}
 
function platformBin() {
  const plat = process.platform;        // linux, darwin, win32
  const arch = process.arch === "x64" ? "x86_64" : process.arch;
  const ext  = plat === "win32" ? ".exe" : "";
  return path.join(PKG, "bin", `yana-rt-${plat}-${arch}${ext}`);
}
 
// Manually resolve "yana-rt" on $PATH so the self-check above can run
// BEFORE exec'ing anything — never delegate this lookup to the OS.
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
 
const candidates = [
  process.env.YANA_RT_BIN,
  resolveOnPath("yana-rt"),
  platformBin(),
  path.join(PKG, "target", "release", "yana-rt"),
];
 
for (const bin of candidates) {
  if (usable(bin)) runAndExit(bin);
}
 
console.error([
  "yana-rt: binary not found.",
  "",
  "To install, run one of:",
  "  cargo install yana-rt                # real binary from crates.io (recommended)",
  "  cargo build --release                # build from source inside the repo",
  "",
  "Do NOT set YANA_RT_BIN to the output of `which yana-rt` — on an npm",
  "install that path is this wrapper itself, not a compiled binary.",
].join("\n"));
process.exit(1);
 
