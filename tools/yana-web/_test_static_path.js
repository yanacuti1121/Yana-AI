'use strict';
// Tests for static-path.js: what the static file server may and may not serve.
// Uses only temp directories (no network, no npm packages).
// Run: node _test_static_path.js   (exit 0 = pass, 1 = fail)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveStaticFile } = require('./static-path');

let failed = 0;
function t(name, ok) {
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-static-'));
const root = path.join(base, 'public');
const outside = path.join(base, 'outside');
fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
fs.mkdirSync(path.join(root, '.git'), { recursive: true });
fs.mkdirSync(path.join(root, 'node_modules', 'x'), { recursive: true });
fs.mkdirSync(outside);
fs.writeFileSync(path.join(root, 'index.html'), 'home');
fs.writeFileSync(path.join(root, 'sub', 'a.js'), 'a');
fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
fs.writeFileSync(path.join(root, '.git', 'config'), 'git');
fs.writeFileSync(path.join(root, 'node_modules', 'x', 'i.js'), 'dep');
fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside secret');
fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'link-to-file'));
fs.symlinkSync(outside, path.join(root, 'link-to-dir'));
fs.symlinkSync(path.join(root, '.git'), path.join(root, 'link-to-hidden'));
fs.symlinkSync(path.join(root, 'sub', 'a.js'), path.join(root, 'inner-link'));
const realRoot = fs.realpathSync(root);

t('serves a normal file', resolveStaticFile(root, '/index.html') === path.join(realRoot, 'index.html'));
t('serves a nested file', resolveStaticFile(root, '/sub/a.js') === path.join(realRoot, 'sub', 'a.js'));
t('a missing file is refused', resolveStaticFile(root, '/nope.html') === null);

t('parent traversal is refused', resolveStaticFile(root, '/../outside/secret.txt') === null);
t('deep parent traversal is refused', resolveStaticFile(root, '/sub/../../outside/secret.txt') === null);
t('an absolute-looking path stays inside the root', resolveStaticFile(root, '//etc/hosts') === null);

t('dotfiles are refused', resolveStaticFile(root, '/.env') === null);
t('a file inside a dot directory is refused', resolveStaticFile(root, '/.git/config') === null);
t('node_modules is refused', resolveStaticFile(root, '/node_modules/x/i.js') === null);

t('a symlink to a file outside the root is refused', resolveStaticFile(root, '/link-to-file') === null);
t('a path through a symlinked directory outside the root is refused', resolveStaticFile(root, '/link-to-dir/secret.txt') === null);
t('a symlink into a hidden directory is refused', resolveStaticFile(root, '/link-to-hidden/config') === null);
t('a symlink to a file inside the root is still served', resolveStaticFile(root, '/inner-link') === path.join(realRoot, 'sub', 'a.js'));

fs.rmSync(base, { recursive: true, force: true });
console.log(failed === 0 ? '\nall passed' : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
