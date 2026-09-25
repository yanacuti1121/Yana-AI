#!/usr/bin/env node
"use strict";
// Verifies the electron-builder "unpacked" app directory before it is trusted
// as a release: right executables for the architecture, the frontend is inside
// app.asar, and every asset index.html loads resolves under file://.
//
//   node scripts/verify-package.cjs --platform win --arch x64
//   node scripts/verify-package.cjs --platform linux --arch x64 --dir release/linux-unpacked
//
// Exit 0 when the package passes, 1 when it does not, 2 on a usage error.
const path = require("node:path");
const { verifyWindows, verifyLinux } = require("./lib/package-checks.cjs");

const DEFAULT_DIRS = {
  "win:x64": "release/win-unpacked",
  "win:arm64": "release/win-arm64-unpacked",
  "linux:x64": "release/linux-unpacked",
  "linux:arm64": "release/linux-arm64-unpacked",
};

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const platform = option("platform");
const arch = option("arch");
const key = `${platform}:${arch}`;
if (!DEFAULT_DIRS[key]) {
  console.error(
    `usage: verify-package.cjs --platform win|linux --arch x64|arm64 [--dir <dir>]\n` +
      `got platform=${platform} arch=${arch}`,
  );
  process.exit(2);
}

const dir = path.resolve(option("dir") ?? DEFAULT_DIRS[key]);
const { errors, notes } = (platform === "win" ? verifyWindows : verifyLinux)(
  dir,
  arch,
);

console.log(`Package check: ${platform}-${arch} in ${dir}`);
for (const note of notes) console.log(`  ok    ${note}`);
for (const error of errors) {
  console.log(`  FAIL  ${error}`);
  console.log(`::error title=Package check (${key})::${error}`);
}
if (errors.length) {
  console.log(`\n${errors.length} problem(s). This package must not be released.`);
  process.exit(1);
}
console.log("\nPackage check passed.");
