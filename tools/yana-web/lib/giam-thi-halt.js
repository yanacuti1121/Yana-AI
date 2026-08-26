'use strict';

// Mirrors src/os/supervisor.rs's halt_is_active fail-closed semantics for
// the one chat path Giám Thị's Rust-side check never reaches: a browser
// deployment with no configured yana-rt binary (see server.js's
// handleApiChat). Any stat error other than "file does not exist" also
// counts as halted, matching the Rust side's conservative default.

const fs = require('fs');
const path = require('path');

const HALT_RELATIVE_PATH = path.join('.claude', 'state', 'GIAMTHI_HALT.lock');

function haltActive(repoRoot) {
  try {
    fs.lstatSync(path.join(repoRoot, HALT_RELATIVE_PATH));
    return true;
  } catch (error) {
    return error.code !== 'ENOENT';
  }
}

module.exports = { haltActive, HALT_RELATIVE_PATH };
