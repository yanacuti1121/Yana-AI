'use strict';

const path       = require('path');
const { execFile } = require('child_process');

/**
 * createRouter({ classify, wrapperPath }) → { route }
 *
 * Tries the yana-rt native binary first; falls back to JS classifier.
 */
function createRouter({ classify, wrapperPath, binaryPath } = {}) {
  const WRAPPER = wrapperPath || null;
  const BINARY = binaryPath || null;

  function spawnRouter(task) {
    return new Promise((resolve, reject) => {
      if (!BINARY && !WRAPPER) { reject(new Error('no yana-rt command')); return; }
      const command = BINARY || process.execPath;
      const args = BINARY
        ? ['route', 'classify', task]
        : [WRAPPER, 'route', 'classify', task];
      execFile(
        command,
        args,
        { env: process.env, timeout: 5000 },
        (err, stdout) => {
          if (err) { reject(err); return; }
          let parsed;
          try { parsed = JSON.parse(stdout); } catch (e) { reject(e); return; }
          if (!parsed || typeof parsed.route !== 'string') {
            reject(new Error('unexpected output shape'));
            return;
          }
          resolve(parsed);
        }
      );
    });
  }

  function route(task) {
    return new Promise(resolve => {
      spawnRouter(task)
        .then(decision => resolve({ ...decision, source: 'yana-router' }))
        .catch(() => resolve({ ...classify(task), source: 'fallback' }));
    });
  }

  return { route };
}

module.exports = { createRouter };
