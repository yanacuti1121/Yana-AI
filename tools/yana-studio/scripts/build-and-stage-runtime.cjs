#!/usr/bin/env node
"use strict";
// A `npm run dist:*` build previously left `runtime/` unstaged unless the
// caller ran `npm run stage:runtime -- <path>` by hand first: electron-builder
// then logged "file source doesn't exist" for extraResources' runtime entry
// and quietly packaged an app with no bundled yana-rt at all (confirmed on a
// studio-v1.6.1 build, 2026-09-24 -- host/integrations/secrets.local.cjs and
// tools/yana-studio/runtime/ were both missing from a real `npm run dist:mac`
// run). This builds the same Rust binary CI builds and stages it the same
// way, so every `dist:*` script bundles a working runtime by default.
//
//   node scripts/build-and-stage-runtime.cjs
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "../../..");
const studioDir = path.resolve(__dirname, "..");
const binName = process.platform === "win32" ? "yana-rt.exe" : "yana-rt";
const binPath = path.join(repoRoot, "target", "release", binName);

console.log("[build-and-stage-runtime] cargo build --release --features cli --bin yana-rt");
execFileSync(
  "cargo",
  ["build", "--release", "--features", "cli", "--bin", "yana-rt"],
  { cwd: repoRoot, stdio: "inherit" },
);

console.log(`[build-and-stage-runtime] staging ${binPath}`);
execFileSync(
  process.execPath,
  [path.join(studioDir, "scripts", "stage-runtime.cjs"), binPath],
  { cwd: studioDir, stdio: "inherit" },
);
