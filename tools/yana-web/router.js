'use strict';

const path = require('path');
const { execFile } = require('child_process');
const { classify } = require('./classifier.js');

// Resolve wrapper path relative to this file (no hardcoded /home/user)
const WRAPPER = path.resolve(__dirname, '..', '..', 'scripts', 'yamtam-rt-wrapper.js');

/**
 * Spawn the yana-router wrapper; on any failure fall back to JS classifier.
 * Never throws — always resolves.
 * @param {string} task
 * @returns {Promise<object>} decision with a `source` field added
 */
function route(task) {
  return new Promise(resolve => {
    spawnRouter(task)
      .then(decision => resolve({ ...decision, source: 'yana-router' }))
      .catch(() => resolve({ ...classify(task), source: 'fallback' }));
  });
}

function spawnRouter(task) {
  return new Promise((resolve, reject) => {
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

module.exports = { route };
