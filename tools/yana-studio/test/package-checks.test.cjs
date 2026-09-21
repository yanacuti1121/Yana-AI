"use strict";
// Tests for the packaged-app checks used by scripts/verify-package.cjs.
//
// Regression being locked in: the Windows and Linux CI legs ran
// electron-builder without building the frontend first, so dist/ (gitignored)
// was absent and the packaged app had no dist/index.html. The window opened
// with a black, empty page. verifyWindows/verifyLinux must fail on such a
// package, and on wrong-architecture executables.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  peMachine,
  elfMachine,
  readAsarHeader,
  readAsarFile,
  asarHasFile,
  verifyWindows,
  verifyLinux,
} = require("../scripts/lib/package-checks.cjs");

function peBuffer(machine) {
  const buffer = Buffer.alloc(0x200);
  buffer.writeUInt16LE(0x5a4d, 0); // "MZ"
  buffer.writeUInt32LE(0x80, 0x3c); // e_lfanew
  buffer.writeUInt32LE(0x00004550, 0x80); // "PE\0\0"
  buffer.writeUInt16LE(machine, 0x84);
  return buffer;
}

function elfBuffer(machine) {
  const buffer = Buffer.alloc(64);
  buffer.writeUInt32BE(0x7f454c46, 0);
  buffer.writeUInt16LE(machine, 18);
  return buffer;
}

// Minimal asar: [4][headerPickleSize][payloadSize][jsonLength][json][file data]
function asarBuffer(tree, contents = {}) {
  const chunks = [];
  let offset = 0;
  const walk = (node, prefix) => {
    for (const [name, child] of Object.entries(node)) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (child && child.files) {
        walk(child.files, rel);
      } else {
        const data = Buffer.from(contents[rel] ?? "x");
        child.size = data.length;
        child.offset = String(offset);
        offset += data.length;
        chunks.push(data);
      }
    }
  };
  const header = { files: tree };
  walk(header.files, "");
  const json = Buffer.from(JSON.stringify(header));
  const padded = (json.length + 3) & ~3;
  const headerPickleSize = 8 + padded;
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(headerPickleSize, 4);
  prefix.writeUInt32LE(headerPickleSize - 4, 8);
  prefix.writeUInt32LE(json.length, 12);
  return Buffer.concat([
    prefix,
    json,
    Buffer.alloc(padded - json.length),
    ...chunks,
  ]);
}

const GOOD_INDEX_HTML =
  '<!doctype html><html><head><script type="module" src="./assets/app.js"></script>' +
  '<link rel="stylesheet" href="./assets/app.css"></head><body><div id="root"></div></body></html>';

function goodTree() {
  return {
    "package.json": {},
    host: { files: { "main.cjs": {}, "preload.cjs": {} } },
    dist: {
      files: {
        "index.html": {},
        assets: { files: { "app.js": {}, "app.css": {} } },
      },
    },
  };
}

function writeAsar(file, tree, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, asarBuffer(tree, contents));
}

function makeWindowsPackage(root, arch, options = {}) {
  const machine = arch === "arm64" ? 0xaa64 : 0x8664;
  const wrong = arch === "arm64" ? 0x8664 : 0xaa64;
  fs.mkdirSync(path.join(root, "resources", "runtime"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "Yana Studio.exe"),
    peBuffer(options.exeMachine ?? machine),
  );
  const tree = options.tree ?? goodTree();
  writeAsar(path.join(root, "resources", "app.asar"), tree, {
    "dist/index.html": options.indexHtml ?? GOOD_INDEX_HTML,
  });
  fs.writeFileSync(
    path.join(root, "resources", "runtime", "yana-rt.exe"),
    peBuffer(options.runtimeMachine ?? machine),
  );
  fs.writeFileSync(
    path.join(root, "resources", "runtime", "manifest.json"),
    "{}",
  );
  if (options.pty !== false) {
    const ptyDir = path.join(
      root,
      "resources",
      "app.asar.unpacked",
      "node_modules",
      "node-pty",
      "prebuilds",
      `win32-${arch}`,
    );
    fs.mkdirSync(ptyDir, { recursive: true });
    fs.writeFileSync(
      path.join(ptyDir, "pty.node"),
      peBuffer(options.ptyMachine ?? machine),
    );
    // A prebuild for the other arch may legitimately ship alongside it.
    const otherDir = path.join(ptyDir, "..", `win32-${arch === "arm64" ? "x64" : "arm64"}`);
    fs.mkdirSync(otherDir, { recursive: true });
    fs.writeFileSync(path.join(otherDir, "pty.node"), peBuffer(wrong));
  }
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yana-pkg-"));
}

test("peMachine reads x64, arm64 and rejects non-PE input", () => {
  assert.equal(peMachine(peBuffer(0x8664)), "x64");
  assert.equal(peMachine(peBuffer(0xaa64)), "arm64");
  assert.equal(peMachine(peBuffer(0x014c)), "x86");
  assert.equal(peMachine(Buffer.alloc(0)), null);
  assert.equal(peMachine(Buffer.from("not an executable")), null);
  assert.equal(peMachine(Buffer.alloc(0x200)), null);
});

test("peMachine does not crash on a truncated or hostile header", () => {
  const truncated = peBuffer(0x8664).subarray(0, 0x82);
  assert.equal(peMachine(truncated), null);
  const hostile = peBuffer(0x8664);
  hostile.writeUInt32LE(0xffffffff, 0x3c); // e_lfanew far out of range
  assert.equal(peMachine(hostile), null);
});

test("elfMachine reads x64 and arm64 and rejects non-ELF input", () => {
  assert.equal(elfMachine(elfBuffer(62)), "x64");
  assert.equal(elfMachine(elfBuffer(183)), "arm64");
  assert.equal(elfMachine(Buffer.alloc(0)), null);
  assert.equal(elfMachine(peBuffer(0x8664)), null);
});

test("asar helpers list files and read their contents", () => {
  const dir = tmp();
  const file = path.join(dir, "app.asar");
  writeAsar(file, goodTree(), { "dist/index.html": GOOD_INDEX_HTML });
  const header = readAsarHeader(file);
  assert.equal(asarHasFile(header, "dist/index.html"), true);
  assert.equal(asarHasFile(header, "dist/assets/app.js"), true);
  assert.equal(asarHasFile(header, "dist"), false, "a directory is not a file");
  assert.equal(asarHasFile(header, "dist/missing.html"), false);
  assert.equal(
    readAsarFile(file, header, "dist/index.html").toString("utf8"),
    GOOD_INDEX_HTML,
  );
});

test("readAsarHeader rejects a file that is not an asar archive", () => {
  const dir = tmp();
  const file = path.join(dir, "junk.asar");
  fs.writeFileSync(file, Buffer.from("this is not an asar archive at all"));
  assert.throws(() => readAsarHeader(file), /not an asar/i);
  fs.writeFileSync(file, Buffer.alloc(0));
  assert.throws(() => readAsarHeader(file));
});

for (const arch of ["x64", "arm64"]) {
  test(`verifyWindows accepts a complete ${arch} package`, () => {
    const dir = tmp();
    makeWindowsPackage(dir, arch);
    const { errors } = verifyWindows(dir, arch);
    assert.deepEqual(errors, []);
  });
}

test("verifyWindows fails a package with no dist/index.html (the black-window bug)", () => {
  const dir = tmp();
  const tree = goodTree();
  delete tree.dist;
  makeWindowsPackage(dir, "x64", { tree });
  const { errors } = verifyWindows(dir, "x64");
  assert.ok(errors.some((e) => /dist\/index\.html/.test(e)), errors.join("\n"));
});

test("verifyWindows fails when index.html points at absolute or missing assets", () => {
  const absolute = tmp();
  makeWindowsPackage(absolute, "x64", {
    indexHtml: '<script type="module" src="/assets/app.js"></script>',
  });
  assert.ok(
    verifyWindows(absolute, "x64").errors.some((e) => /absolute/i.test(e)),
  );
  const missing = tmp();
  makeWindowsPackage(missing, "x64", {
    indexHtml: '<script type="module" src="./assets/gone.js"></script>',
  });
  assert.ok(
    verifyWindows(missing, "x64").errors.some((e) => /gone\.js/.test(e)),
  );
});

test("verifyWindows fails a wrong-architecture executable or runtime", () => {
  const exe = tmp();
  makeWindowsPackage(exe, "arm64", { exeMachine: 0x8664 });
  assert.ok(
    verifyWindows(exe, "arm64").errors.some((e) => /Yana Studio\.exe/.test(e)),
  );
  const runtime = tmp();
  makeWindowsPackage(runtime, "x64", { runtimeMachine: 0xaa64 });
  assert.ok(
    verifyWindows(runtime, "x64").errors.some((e) => /yana-rt\.exe/.test(e)),
  );
});

test("verifyWindows fails when the executable is missing", () => {
  const dir = tmp();
  makeWindowsPackage(dir, "x64");
  fs.rmSync(path.join(dir, "Yana Studio.exe"));
  assert.ok(
    verifyWindows(dir, "x64").errors.some((e) => /Yana Studio\.exe/.test(e)),
  );
});

test("verifyWindows fails when node-pty has no native module for the arch", () => {
  const none = tmp();
  makeWindowsPackage(none, "x64", { pty: false });
  assert.ok(verifyWindows(none, "x64").errors.some((e) => /node-pty/.test(e)));
  const wrongOnly = tmp();
  makeWindowsPackage(wrongOnly, "x64", { ptyMachine: 0xaa64 });
  // The x64 prebuild dir now holds an arm64 binary and the "other" dir also
  // holds arm64 (wrong for x64): no x64 native module remains.
  fs.writeFileSync(
    path.join(
      wrongOnly,
      "resources",
      "app.asar.unpacked",
      "node_modules",
      "node-pty",
      "prebuilds",
      "win32-arm64",
      "pty.node",
    ),
    peBuffer(0xaa64),
  );
  assert.ok(
    verifyWindows(wrongOnly, "x64").errors.some((e) => /node-pty/.test(e)),
  );
});

test("verifyWindows on an empty or missing directory reports errors, not a crash", () => {
  assert.ok(verifyWindows(tmp(), "x64").errors.length > 0);
  assert.ok(
    verifyWindows(path.join(tmp(), "does-not-exist"), "arm64").errors.length >
      0,
  );
});

test("verifyLinux accepts a complete package and fails one without dist", () => {
  const good = tmp();
  fs.mkdirSync(path.join(good, "resources", "runtime"), { recursive: true });
  writeAsar(path.join(good, "resources", "app.asar"), goodTree(), {
    "dist/index.html": GOOD_INDEX_HTML,
  });
  fs.writeFileSync(
    path.join(good, "resources", "runtime", "yana-rt"),
    elfBuffer(62),
  );
  fs.writeFileSync(
    path.join(good, "resources", "runtime", "manifest.json"),
    "{}",
  );
  assert.deepEqual(verifyLinux(good, "x64").errors, []);

  const bad = tmp();
  const tree = goodTree();
  delete tree.dist;
  fs.mkdirSync(path.join(bad, "resources", "runtime"), { recursive: true });
  writeAsar(path.join(bad, "resources", "app.asar"), tree);
  fs.writeFileSync(
    path.join(bad, "resources", "runtime", "yana-rt"),
    elfBuffer(62),
  );
  fs.writeFileSync(path.join(bad, "resources", "runtime", "manifest.json"), "{}");
  assert.ok(verifyLinux(bad, "x64").errors.some((e) => /dist\/index\.html/.test(e)));
});
