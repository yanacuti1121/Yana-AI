'use strict';
// Atomic JSON persistence for private, local Yana metadata.
//
// Readers always see either the previous complete file or the next complete
// file: data is written to a uniquely named sibling and then renamed into
// place. A crash can leave a harmless `.tmp` sibling, but never a truncated
// canonical JSON file. Callers must not use this for create-only semantics;
// auth setup deliberately retains its `wx` write to reject concurrent setup.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function writeJsonAtomic(filePath, value, { mode = 0o600, space = 2 } = {}) {
  const encoded = JSON.stringify(value, null, space);
  if (typeof encoded !== 'string') {
    throw new TypeError('Atomic JSON writes require a JSON-serializable value');
  }

  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  let fileDescriptor = null;

  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    fileDescriptor = fs.openSync(temporaryPath, 'wx', mode);
    fs.writeFileSync(fileDescriptor, encoded, 'utf8');
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = null;
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (fileDescriptor !== null) {
      try { fs.closeSync(fileDescriptor); } catch (_) {}
    }
    try { fs.unlinkSync(temporaryPath); } catch (_) {}
    throw error;
  }
}

module.exports = { writeJsonAtomic };
