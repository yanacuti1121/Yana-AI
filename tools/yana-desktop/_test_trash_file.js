'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { trashFile } = require('./trash-file');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yana-desktop-trash-'));
const nested = path.join(root, 'notes');
fs.mkdirSync(nested);
fs.writeFileSync(path.join(nested, 'draft.txt'), 'keep this reversible');
fs.mkdirSync(path.join(root, '.git'));
fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');

function regularFile() {
  return { isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false };
}

async function run() {
  try {
    const moved = [];
    const valid = await trashFile({
      repoRoot: root,
      relPath: 'notes/draft.txt',
      trashItem: async (target) => { moved.push(target); },
    });
    assert.deepStrictEqual(valid, { ok: true, relPath: 'notes/draft.txt' });
    assert.deepStrictEqual(moved, [fs.realpathSync(path.join(nested, 'draft.txt'))]);

    const traversal = await trashFile({ repoRoot: root, relPath: '../outside.txt', trashItem: async () => assert.fail('must not trash') });
    assert.match(traversal.error, /outside/);

    const absolute = await trashFile({ repoRoot: root, relPath: '/tmp/outside.txt', trashItem: async () => assert.fail('must not trash') });
    assert.match(absolute.error, /relative/);

    const protectedFile = await trashFile({ repoRoot: root, relPath: '.git/HEAD', trashItem: async () => assert.fail('must not trash') });
    assert.match(protectedFile.error, /\.git/);

    const directory = await trashFile({ repoRoot: root, relPath: 'notes', trashItem: async () => assert.fail('must not trash') });
    assert.match(directory.error, /regular files/);

    const symlink = await trashFile({
      repoRoot: '/repo', relPath: 'link', trashItem: async () => assert.fail('must not trash'),
      realpathSync: (candidate) => candidate,
      lstatSync: () => ({ isDirectory: () => false, isFile: () => false, isSymbolicLink: () => true }),
    });
    assert.match(symlink.error, /symbolic links/);

    const escaped = await trashFile({
      repoRoot: '/repo', relPath: 'linked/file.txt', trashItem: async () => assert.fail('must not trash'),
      realpathSync: (candidate) => candidate === '/repo' ? '/repo' : '/outside/file.txt',
      lstatSync: regularFile,
    });
    assert.match(escaped.error, /resolves outside/);

    const trashFailure = await trashFile({
      repoRoot: root,
      relPath: 'notes/draft.txt',
      trashItem: async () => { throw new Error('Trash is unavailable'); },
    });
    assert.match(trashFailure.error, /Trash is unavailable/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().then(() => console.log('trash-file tests passed: 8')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
