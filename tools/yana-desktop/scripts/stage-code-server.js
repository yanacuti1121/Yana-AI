'use strict';
// Stages a real, pinned code-server release into target/desktop-runtime/
// code-server/ — same staging root stage-runtime.js already uses for
// yana-rt/pty_bridge — so package.json's extraResources can copy it into
// Resources/code-server at build time and main.js's startCodeServer() can
// spawn it directly (process.resourcesPath resolution), instead of the
// old `spawn('code-server', ...)` bare-command PATH lookup that produced
// ENOENT on every machine without code-server manually installed.
//
// Per 44-supply-chain-vetting.md / slsa-artifact-law.md: pinned exact
// version, downloaded bytes verified against a SHA-256 recorded here
// (from GitHub's own per-asset `digest` field, not a self-published
// checksum file — code-server does not publish one) BEFORE extraction.
// Never floats `latest`. Bumping the version means updating
// CODE_SERVER_VERSION and re-verifying+updating every hash below in the
// same change — see README.md's contributor notes for the two-line
// `gh api repos/coder/code-server/releases/tags/vX.Y.Z --jq ...` command
// that produces fresh values to paste in.
const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFileSync } = require('child_process');

const CODE_SERVER_VERSION = '4.135.0';

// platform/arch -> code-server's own release asset name + its GitHub-
// computed SHA-256. code-server has never shipped a native Windows
// build (project policy: WSL2 only) — win32 has no entry and is skipped,
// not treated as an error.
const ASSETS = {
  'darwin-arm64': {
    name: `code-server-${CODE_SERVER_VERSION}-macos-arm64.tar.gz`,
    sha256: '30e8c2fcf3cb7d125c06401ed7f24ff0609634b7ee01f259a52c7d462b90bd4e',
  },
  'darwin-x64': {
    name: `code-server-${CODE_SERVER_VERSION}-macos-amd64.tar.gz`,
    sha256: '71738fb5bd886bca3d792d819bfdaa4698b27569d69c494c538a9ec1c0d6bb5b',
  },
  'linux-x64': {
    name: `code-server-${CODE_SERVER_VERSION}-linux-amd64.tar.gz`,
    sha256: '300ef4e37e469e6368a4673c6a623e1c9ba8a34f42b394fb49c431a8900bc7d1',
  },
  'linux-arm64': {
    name: `code-server-${CODE_SERVER_VERSION}-linux-arm64.tar.gz`,
    sha256: 'fe6561798415e709109cb902dca2a57a687240af7d8220f6fa1d01cd2ae0541e',
  },
};

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const stageDir = path.join(repoRoot, 'target', 'desktop-runtime', 'code-server');
const downloadDir = path.join(repoRoot, 'target', 'code-server-download');

function platformKey() {
  return `${process.platform}-${process.arch}`;
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    const request = (currentUrl, redirectsLeft) => {
      https.get(currentUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          if (redirectsLeft <= 0) { reject(new Error('too many redirects fetching code-server')); return; }
          response.resume();
          request(response.headers.location, redirectsLeft - 1);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`code-server download failed: HTTP ${response.statusCode} for ${currentUrl}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', reject);
    };
    // GitHub release downloads redirect at least once (objects.githubusercontent.com).
    request(url, 5);
  });
}

function sha256Of(filePath) {
  return execFileSync('shasum', ['-a', '256', filePath], { encoding: 'utf8' }).trim().split(/\s+/)[0];
}

async function main() {
  const key = platformKey();
  const asset = ASSETS[key];
  if (!asset) {
    // Still create the (empty) staging directory so electron-builder's
    // extraResources entry — a single shared array, not per-platform —
    // has a real `from` path to copy on win32 too; main.js's own win32
    // check in startCodeServer() returns a friendly "not available on
    // Windows" result before ever looking inside this empty directory.
    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.mkdirSync(stageDir, { recursive: true });
    console.log(`stage-code-server: no code-server build for ${key} (expected on win32) — staged an empty placeholder`);
    return;
  }

  fs.mkdirSync(downloadDir, { recursive: true });
  const archivePath = path.join(downloadDir, asset.name);
  const url = `https://github.com/coder/code-server/releases/download/v${CODE_SERVER_VERSION}/${asset.name}`;

  if (!fs.existsSync(archivePath) || sha256Of(archivePath) !== asset.sha256) {
    console.log(`stage-code-server: downloading ${asset.name}...`);
    await download(url, archivePath);
  }

  const actualHash = sha256Of(archivePath);
  if (actualHash !== asset.sha256) {
    fs.unlinkSync(archivePath);
    throw new Error(
      `stage-code-server: checksum mismatch for ${asset.name}\n`
      + `  expected: ${asset.sha256}\n  got:      ${actualHash}\n`
      + `Refusing to extract unverified content.`,
    );
  }

  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  // --strip-components=1 drops the tarball's own
  // code-server-<version>-<platform>-<arch>/ wrapper directory, so the
  // staged path is always target/desktop-runtime/code-server/bin/code-server
  // regardless of which version is pinned — matching how package.json's
  // extraResources and runtime-paths.js reference a fixed "code-server"
  // directory name, the same pattern already used for bin/ and pty-bridge/.
  execFileSync('tar', ['xzf', archivePath, '-C', stageDir, '--strip-components=1']);

  const binPath = path.join(stageDir, 'bin', 'code-server');
  if (!fs.existsSync(binPath)) throw new Error(`stage-code-server: expected binary missing after extract: ${binPath}`);
  fs.chmodSync(binPath, 0o755);
  console.log(`staged ${binPath} (code-server v${CODE_SERVER_VERSION}, verified sha256)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
