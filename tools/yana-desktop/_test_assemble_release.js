'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assembleRelease, parseUpdateMetadata } = require('./scripts/assemble-release');

const { version } = require('./package.json');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-desktop-release-'));
const input = path.join(root, 'input');
const output = path.join(root, 'output');

function bundle(name, files) {
  const directory = path.join(input, name);
  fs.mkdirSync(directory, { recursive: true });
  for (const [filename, contents = filename] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, filename), contents);
  }
}

function metadata(url) {
  return `version: ${version}\nfiles:\n  - url: ${url}\n    sha512: test\n    size: 1\npath: ${url}\nsha512: test\nreleaseDate: '2026-08-20T00:00:00.000Z'\n`;
}

bundle('yana-desktop-linux-x64', {
  [`Yana-AI-${version}-x86_64.AppImage`]: 'linux-x64',
  [`Yana-AI-${version}-x86_64.AppImage.blockmap`]: 'blockmap',
  [`Yana-AI-${version}-amd64.deb`]: 'deb-x64',
  'latest-linux.yml': metadata(`Yana-AI-${version}-x86_64.AppImage`),
});
bundle('yana-desktop-linux-arm64', {
  [`Yana-AI-${version}-arm64.AppImage`]: 'linux-arm64',
  [`Yana-AI-${version}-arm64.AppImage.blockmap`]: 'blockmap',
  [`Yana-AI-${version}-arm64.deb`]: 'deb-arm64',
  'latest-linux-arm64.yml': metadata(`Yana-AI-${version}-arm64.AppImage`),
});
bundle('yana-desktop-mac-x64', {
  [`Yana-AI-${version}-x64.dmg`]: 'dmg-x64',
  [`Yana-AI-${version}-x64.zip`]: 'zip-x64',
  [`Yana-AI-${version}-x64.zip.blockmap`]: 'blockmap',
  'latest-mac.yml': metadata(`Yana-AI-${version}-x64.zip`),
});
bundle('yana-desktop-mac-arm64', {
  [`Yana-AI-${version}-arm64.dmg`]: 'dmg-arm64',
  [`Yana-AI-${version}-arm64.zip`]: 'zip-arm64',
  [`Yana-AI-${version}-arm64.zip.blockmap`]: 'blockmap',
  'latest-mac.yml': metadata(`Yana-AI-${version}-arm64.zip`),
});
bundle('yana-desktop-win-x64', {
  [`Yana-AI-${version}-x64.exe`]: 'win-x64',
  [`Yana-AI-${version}-x64.exe.blockmap`]: 'blockmap',
  'latest.yml': metadata(`Yana-AI-${version}-x64.exe`),
});

const result = assembleRelease(input, output, version);
assert.strictEqual(result.bundleCount, 5);
assert.ok(result.artifactCount >= 17);
assert.ok(fs.existsSync(path.join(output, 'SHA256SUMS')));
const mac = parseUpdateMetadata(fs.readFileSync(path.join(output, 'latest-mac.yml'), 'utf8'), 'latest-mac.yml');
assert.strictEqual(mac.files.length, 2);
assert.ok(mac.files.some((file) => file.url.includes('-x64.zip')));
assert.ok(mac.files.some((file) => file.url.includes('-arm64.zip')));

fs.rmSync(root, { recursive: true, force: true });
console.log('Desktop release assembly tests passed: 7');
