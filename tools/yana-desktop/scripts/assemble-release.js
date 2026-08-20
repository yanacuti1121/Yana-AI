'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function scalar(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseUpdateMetadata(text, source) {
  const result = { files: [] };
  let currentFile = null;
  let inFiles = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^files:\s*$/.test(line)) {
      inFiles = true;
      continue;
    }
    const fileStart = line.match(/^\s{2}-\s+url:\s*(.+)$/);
    if (fileStart) {
      currentFile = { url: scalar(fileStart[1]) };
      result.files.push(currentFile);
      continue;
    }
    const fileField = line.match(/^\s{4}([A-Za-z0-9_]+):\s*(.+)$/);
    if (inFiles && currentFile && fileField) {
      currentFile[fileField[1]] = scalar(fileField[2]);
      continue;
    }
    const topLevel = line.match(/^([A-Za-z0-9_]+):\s*(.+)$/);
    if (topLevel) {
      inFiles = false;
      currentFile = null;
      result[topLevel[1]] = scalar(topLevel[2]);
    }
  }
  if (!result.version || result.files.length === 0) {
    throw new Error(`${source} is not valid electron-builder update metadata`);
  }
  return result;
}

function quote(value) {
  return JSON.stringify(String(value));
}

function serializeUpdateMetadata(metadata) {
  const lines = [`version: ${quote(metadata.version)}`, 'files:'];
  for (const file of metadata.files) {
    lines.push(`  - url: ${quote(file.url)}`);
    if (file.sha512) lines.push(`    sha512: ${quote(file.sha512)}`);
    if (file.size !== undefined) lines.push(`    size: ${file.size}`);
  }
  if (metadata.path) lines.push(`path: ${quote(metadata.path)}`);
  if (metadata.sha512) lines.push(`sha512: ${quote(metadata.sha512)}`);
  if (metadata.releaseDate) lines.push(`releaseDate: ${quote(metadata.releaseDate)}`);
  return `${lines.join('\n')}\n`;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function filesRecursively(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(target) : [target];
  });
}

function artifactNameFromUrl(value) {
  const parsed = new URL(value, 'https://release.invalid/');
  return decodeURIComponent(path.basename(parsed.pathname));
}

function assembleRelease(inputRoot, outputRoot, expectedVersion) {
  const bundles = fs.readdirSync(inputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(inputRoot, entry.name));
  if (bundles.length !== 5) throw new Error(`expected 5 desktop artifact bundles, found ${bundles.length}`);

  fs.mkdirSync(outputRoot, { recursive: true });
  const macMetadata = [];
  const copied = new Map();
  for (const file of bundles.flatMap(filesRecursively)) {
    const name = path.basename(file);
    if (name === 'latest-mac.yml') {
      macMetadata.push(parseUpdateMetadata(fs.readFileSync(file, 'utf8'), file));
      continue;
    }
    const destination = path.join(outputRoot, name);
    if (copied.has(name)) {
      if (sha256(copied.get(name)) !== sha256(file)) throw new Error(`conflicting release artifact: ${name}`);
      continue;
    }
    fs.copyFileSync(file, destination);
    copied.set(name, file);
  }

  if (macMetadata.length !== 2) {
    throw new Error(`expected 2 latest-mac.yml files, found ${macMetadata.length}`);
  }
  if (macMetadata.some((metadata) => metadata.version !== expectedVersion)) {
    throw new Error('macOS update metadata version does not match package version');
  }
  const macFiles = new Map();
  for (const metadata of macMetadata) {
    for (const file of metadata.files) macFiles.set(file.url, file);
  }
  const primary = macMetadata.find((metadata) => /(?:^|-)x64(?:-|\.)/.test(metadata.path || ''))
    || macMetadata[0];
  const mergedMac = {
    version: expectedVersion,
    files: [...macFiles.values()].sort((left, right) => left.url.localeCompare(right.url)),
    path: primary.path,
    sha512: primary.sha512,
    releaseDate: macMetadata.map((metadata) => metadata.releaseDate).filter(Boolean).sort().at(-1),
  };
  fs.writeFileSync(path.join(outputRoot, 'latest-mac.yml'), serializeUpdateMetadata(mergedMac));

  const escapedVersion = expectedVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const required = [
    ['Linux x64 AppImage', new RegExp(`^Yana-AI-${escapedVersion}-x64\\.AppImage$`)],
    ['Linux arm64 AppImage', new RegExp(`^Yana-AI-${escapedVersion}-arm64\\.AppImage$`)],
    ['Linux x64 deb', new RegExp(`^Yana-AI-${escapedVersion}-x64\\.deb$`)],
    ['Linux arm64 deb', new RegExp(`^Yana-AI-${escapedVersion}-arm64\\.deb$`)],
    ['macOS x64 dmg', new RegExp(`^Yana-AI-${escapedVersion}-x64\\.dmg$`)],
    ['macOS arm64 dmg', new RegExp(`^Yana-AI-${escapedVersion}-arm64\\.dmg$`)],
    ['macOS x64 zip', new RegExp(`^Yana-AI-${escapedVersion}-x64\\.zip$`)],
    ['macOS arm64 zip', new RegExp(`^Yana-AI-${escapedVersion}-arm64\\.zip$`)],
    ['Windows x64 installer', new RegExp(`^Yana-AI-${escapedVersion}-x64\\.exe$`)],
  ];
  const names = fs.readdirSync(outputRoot);
  for (const [label, pattern] of required) {
    if (!names.some((name) => pattern.test(name))) throw new Error(`missing ${label}`);
  }

  for (const metadataName of ['latest.yml', 'latest-linux.yml', 'latest-linux-arm64.yml', 'latest-mac.yml']) {
    const metadataPath = path.join(outputRoot, metadataName);
    if (!fs.existsSync(metadataPath)) throw new Error(`missing ${metadataName}`);
    const metadata = parseUpdateMetadata(fs.readFileSync(metadataPath, 'utf8'), metadataPath);
    if (metadata.version !== expectedVersion) throw new Error(`${metadataName} version does not match ${expectedVersion}`);
    for (const entry of metadata.files) {
      const artifact = artifactNameFromUrl(entry.url);
      if (!fs.existsSync(path.join(outputRoot, artifact))) {
        throw new Error(`${metadataName} references missing artifact ${artifact}`);
      }
    }
  }

  const mergedMacNames = mergedMac.files.map((file) => file.url);
  if (!mergedMacNames.some((name) => name.includes('-x64.'))
      || !mergedMacNames.some((name) => name.includes('-arm64.'))) {
    throw new Error('latest-mac.yml must contain both x64 and arm64 update payloads');
  }

  const checksumNames = fs.readdirSync(outputRoot).filter((name) => name !== 'SHA256SUMS').sort();
  const checksums = checksumNames.map((name) => `${sha256(path.join(outputRoot, name))}  ${name}`).join('\n');
  fs.writeFileSync(path.join(outputRoot, 'SHA256SUMS'), `${checksums}\n`);
  return { artifactCount: checksumNames.length, bundleCount: bundles.length };
}

if (require.main === module) {
  const [inputRoot, outputRoot, expectedVersion] = process.argv.slice(2);
  if (!inputRoot || !outputRoot || !expectedVersion) {
    console.error('usage: node assemble-release.js <artifact-root> <output-root> <version>');
    process.exit(2);
  }
  const result = assembleRelease(path.resolve(inputRoot), path.resolve(outputRoot), expectedVersion);
  console.log(`Desktop release verified: ${result.bundleCount} bundles, ${result.artifactCount} assets`);
}

module.exports = { assembleRelease, parseUpdateMetadata, serializeUpdateMetadata };
