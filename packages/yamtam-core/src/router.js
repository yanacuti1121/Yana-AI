'use strict';

const path       = require('path');
const { execFile } = require('child_process');

/**
 * createRouter({ classify, wrapperPath }) → { route }
 *
 * Tries the yamtam-rt native binary first; falls back to JS classifier.
 */
function createRouter({ classify, wrapperPath } = {}) {
  const WRAPPER = wrapperPath || null;

  function spawnRouter(task) {
    return new Promise((resolve, reject) => {
      if (!WRAPPER) { reject(new Error('no wrapper')); return; }
      execFile(
        'node',
        [WRAPPER, 'route', 'classify', task],
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
