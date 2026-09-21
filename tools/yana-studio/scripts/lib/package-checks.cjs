"use strict";
// Checks for a packaged (electron-builder "unpacked") Yana Studio app.
//
// Built after the Windows and Linux CI legs shipped an app with no
// dist/index.html: CI ran electron-builder without building the frontend,
// dist/ is gitignored, so nothing was packaged and the window opened black.
// A green build proved nothing. These checks read the finished package
// itself, with no dependencies, so they run on any OS.
const fs = require("node:fs");
const path = require("node:path");

const HEADER_BYTES = 64 * 1024;
const MAX_ASAR_HEADER_BYTES = 64 * 1024 * 1024;
const PE_MACHINES = { 0x8664: "x64", 0xaa64: "arm64", 0x014c: "x86" };
const ELF_MACHINES = { 62: "x64", 183: "arm64", 3: "x86" };
const REQUIRED_ASAR_FILES = [
  "dist/index.html",
  "host/main.cjs",
  "host/preload.cjs",
  "package.json",
];

// Windows PE: "MZ", e_lfanew at 0x3c, "PE\0\0", then IMAGE_FILE_HEADER.Machine.
function peMachine(buffer) {
  if (buffer.length < 0x40 || buffer.readUInt16LE(0) !== 0x5a4d) return null;
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 6 > buffer.length) return null;
  if (buffer.readUInt32LE(peOffset) !== 0x00004550) return null;
  return PE_MACHINES[buffer.readUInt16LE(peOffset + 4)] ?? "unknown";
}

// Linux ELF: e_machine at offset 18 (x86-64 and aarch64 are little-endian).
function elfMachine(buffer) {
  if (buffer.length < 20 || buffer.readUInt32BE(0) !== 0x7f454c46) return null;
  return ELF_MACHINES[buffer.readUInt16LE(18)] ?? "unknown";
}

function readPrefix(file, bytes) {
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buffer, 0, bytes, 0);
    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

// asar layout: [4][headerPickleSize][payloadSize][jsonLength][json][file data]
// (Chromium pickle framing), file offsets are relative to the data start.
function readAsarHeader(file) {
  const fd = fs.openSync(file, "r");
  try {
    const prefix = Buffer.alloc(16);
    const read = fs.readSync(fd, prefix, 0, 16, 0);
    if (read < 16 || prefix.readUInt32LE(0) !== 4)
      throw new Error(`${file} is not an asar archive`);
    const jsonLength = prefix.readUInt32LE(12);
    if (jsonLength <= 0 || jsonLength > MAX_ASAR_HEADER_BYTES)
      throw new Error(`${file} is not an asar archive (implausible header)`);
    const json = Buffer.alloc(jsonLength);
    fs.readSync(fd, json, 0, jsonLength, 16);
    const header = JSON.parse(json.toString("utf8"));
    Object.defineProperty(header, "dataStart", {
      value: 8 + prefix.readUInt32LE(4),
      enumerable: false,
    });
    return header;
  } finally {
    fs.closeSync(fd);
  }
}

function asarNode(header, relativePath) {
  let node = header;
  for (const part of relativePath.split("/")) {
    node = node && node.files && node.files[part];
    if (!node) return null;
  }
  return node;
}

function asarHasFile(header, relativePath) {
  const node = asarNode(header, relativePath);
  return Boolean(node) && !node.files;
}

function readAsarFile(file, header, relativePath) {
  const node = asarNode(header, relativePath);
  if (!node || node.files) throw new Error(`${relativePath} is not in ${file}`);
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(node.size);
    fs.readSync(fd, buffer, 0, node.size, header.dataStart + Number(node.offset));
    return buffer;
  } finally {
    fs.closeSync(fd);
  }
}

function checkExecutable(file, arch, label, machineOf, errors, notes) {
  if (!fs.existsSync(file)) {
    errors.push(`${label} is missing: ${file}`);
    return;
  }
  const actual = machineOf(readPrefix(file, HEADER_BYTES));
  if (actual !== arch)
    errors.push(
      `${label} ${path.basename(file)} is ${actual ?? "not a valid executable"}, expected ${arch}`,
    );
  else notes.push(`${label} ${path.basename(file)}: ${actual}`);
}

// Every local asset index.html loads must exist inside the archive, and none
// may be an absolute path: under file:// "/assets/x.js" resolves to the drive
// root, not to dist/.
function checkIndexAssets(asarFile, header, errors, notes) {
  const html = readAsarFile(asarFile, header, "dist/index.html").toString("utf8");
  const refs = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((ref) => !/^(?:https?:|data:|#|mailto:)/i.test(ref));
  let checked = 0;
  for (const ref of refs) {
    if (ref.startsWith("/")) {
      errors.push(
        `dist/index.html uses the absolute path "${ref}", which breaks under file://`,
      );
      continue;
    }
    const target = path.posix.normalize(`dist/${ref.replace(/^\.\//, "")}`);
    if (!asarHasFile(header, target))
      errors.push(`dist/index.html references ${ref}, which is not in app.asar`);
    else checked += 1;
  }
  notes.push(`dist/index.html: ${checked} local asset reference(s) resolved`);
}

function checkAsar(asarFile, errors, notes) {
  if (!fs.existsSync(asarFile)) {
    errors.push(`app.asar is missing: ${asarFile}`);
    return;
  }
  let header;
  try {
    header = readAsarHeader(asarFile);
  } catch (error) {
    errors.push(`app.asar is unreadable: ${error.message}`);
    return;
  }
  const before = errors.length;
  for (const required of REQUIRED_ASAR_FILES)
    if (!asarHasFile(header, required))
      errors.push(`app.asar does not contain ${required}`);
  if (!errors.slice(before).some((e) => e.includes("dist/index.html")))
    checkIndexAssets(asarFile, header, errors, notes);
  if (errors.length === before) notes.push("app.asar: required files present");
}

function walk(dir, visit) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

// node-pty ships prebuilds for several architectures side by side, so require
// at least one native module of the expected architecture, not all of them.
function checkNativeModules(unpackedDir, arch, machineOf, errors, notes) {
  const ptyDir = path.join(
    unpackedDir,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "node-pty",
  );
  const matching = [];
  const other = [];
  walk(ptyDir, (file) => {
    if (!file.endsWith(".node")) return;
    const machine = machineOf(readPrefix(file, HEADER_BYTES));
    (machine === arch ? matching : other).push(path.relative(ptyDir, file));
  });
  if (!matching.length)
    errors.push(
      `node-pty has no native module for ${arch} under app.asar.unpacked` +
        (other.length ? ` (found only: ${other.join(", ")})` : ""),
    );
  else notes.push(`node-pty: ${matching.length} native module(s) for ${arch}`);
}

function checkFile(file, label, errors, notes) {
  if (!fs.existsSync(file)) errors.push(`${label} is missing: ${file}`);
  else notes.push(`${label}: present`);
}

function verifyWindows(unpackedDir, arch) {
  const errors = [];
  const notes = [];
  const resources = path.join(unpackedDir, "resources");
  checkExecutable(
    path.join(unpackedDir, "Yana Studio.exe"),
    arch,
    "app executable",
    peMachine,
    errors,
    notes,
  );
  checkAsar(path.join(resources, "app.asar"), errors, notes);
  checkExecutable(
    path.join(resources, "runtime", "yana-rt.exe"),
    arch,
    "bundled runtime",
    peMachine,
    errors,
    notes,
  );
  checkFile(
    path.join(resources, "runtime", "manifest.json"),
    "runtime manifest",
    errors,
    notes,
  );
  checkNativeModules(unpackedDir, arch, peMachine, errors, notes);
  return { errors, notes };
}

function verifyLinux(unpackedDir, arch) {
  const errors = [];
  const notes = [];
  const resources = path.join(unpackedDir, "resources");
  checkAsar(path.join(resources, "app.asar"), errors, notes);
  checkExecutable(
    path.join(resources, "runtime", "yana-rt"),
    arch,
    "bundled runtime",
    elfMachine,
    errors,
    notes,
  );
  checkFile(
    path.join(resources, "runtime", "manifest.json"),
    "runtime manifest",
    errors,
    notes,
  );
  return { errors, notes };
}

module.exports = {
  peMachine,
  elfMachine,
  readAsarHeader,
  readAsarFile,
  asarHasFile,
  verifyWindows,
  verifyLinux,
};
