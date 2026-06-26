#!/usr/bin/env node
// Chạy tự động sau npm install -g yana-ai
// Download đúng yana-rt binary cho platform hiện tại từ GitHub Releases

const { execSync } = require('child_process');
const { existsSync, mkdirSync, chmodSync, createWriteStream } = require('fs');
const { join } = require('path');
const https = require('https');

const REPO = 'yanacuti1121/Yana-AI';
const VERSION = require('./package.json').version;
const BIN_DIR = join(__dirname, 'bin');

function getPlatformAsset() {
  const { platform, arch } = process;
  if (platform === 'linux' && arch === 'x64')   return 'yana-rt-linux-x64';
  if (platform === 'darwin' && arch === 'arm64') return 'yana-rt-macos-arm64';
  if (platform === 'darwin' && arch === 'x64')  return 'yana-rt-macos-x64';
  if (platform === 'win32'  && arch === 'x64')  return 'yana-rt-windows-x64.exe';
  throw new Error(`Unsupported platform: ${platform}/${arch}`);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const get = (u) => https.get(u, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return get(res.headers.location);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
    get(url);
  });
}

async function main() {
  const asset = getPlatformAsset();
  const url = `https://github.com/${REPO}/releases/download/v${VERSION}/${asset}`;
  const binaryName = process.platform === 'win32' ? 'yana-rt.exe' : 'yana-rt';
  const dest = join(BIN_DIR, binaryName);

  if (!existsSync(BIN_DIR)) mkdirSync(BIN_DIR, { recursive: true });

  console.log(`\nYana AI — downloading ${asset}...`);
  try {
    await download(url, dest);
    if (process.platform !== 'win32') chmodSync(dest, 0o755);
    console.log('✓ yana-rt installed');
  } catch (e) {
    // Fallback: nếu không có prebuilt binary, thử cargo install
    console.log(`Binary download failed (${e.message})`);
    try {
      console.log('Trying cargo install as fallback...');
      execSync('cargo install --git https://github.com/yanacuti1121/Yana-AI yana-rt', {
        stdio: 'inherit'
      });
      console.log('✓ yana-rt installed via cargo');
    } catch {
      console.error(
        '\n✗ Could not install yana-rt.\n' +
        'Either install Rust (https://rustup.rs) and run: cargo install yana-rt\n' +
        `Or download manually from: https://github.com/${REPO}/releases`
      );
      process.exit(1);
    }
  }

  // Sau khi có binary, chạy yana-rt init để pull skills/rules về ~/.yana/
  try {
    execSync(`"${dest}" init run --yes`, { stdio: 'inherit' });
  } catch {
    // init lỗi không phải fatal — user có thể chạy `yana init` sau
  }

  console.log('\n✓ Yana AI ready. Run: yana\n');
}

main();
