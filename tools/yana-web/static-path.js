'use strict';
// Maps a request path to a file under staticDir, or null when the file must not be served.
//
// Refused: a path that climbs out with `..`, any dotfile or node_modules
// segment, and a symlink whose real target lies outside staticDir (or whose real
// path passes through a hidden segment). Checking the lexical path alone is not
// enough: `path.resolve` does not follow symlinks, so a link inside staticDir
// pointing at /etc/hosts passed the old check and was served.

const fs = require('fs');
const path = require('path');

function escapes(rel) {
  return rel.startsWith('..') || path.isAbsolute(rel);
}

function hidden(rel) {
  return rel.split(path.sep).some(seg => seg.startsWith('.') || seg === 'node_modules');
}

function resolveStaticFile(staticDir, reqPath) {
  const filePath = path.resolve(staticDir, '.' + reqPath);
  const rel = path.relative(staticDir, filePath);
  if (escapes(rel) || hidden(rel)) return null;
  let root;
  let real;
  try {
    root = fs.realpathSync(staticDir);
    real = fs.realpathSync(filePath);
  } catch (_) {
    return null;
  }
  const realRel = path.relative(root, real);
  if (escapes(realRel) || hidden(realRel)) return null;
  return real;
}

module.exports = { resolveStaticFile };
