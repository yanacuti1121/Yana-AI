'use strict';
// Tests for the yamtam-core router — binary missing → JS classifier fallback.
// Run: node _test_router.js
const { createRouter }     = require('yamtam-core/src/router.js');
const { createClassifier } = require('yamtam-core/src/classifier.js');

const { classify } = createClassifier({});
// No wrapperPath → the native yamtam-rt spawn always fails → fallback path
const { route } = createRouter({ classify });

route('deploy to prod').then(r => {
  console.log('source:', r.source, '| route:', r.route, '| sensitivity:', r.sensitivity);
  console.assert(r.source === 'fallback', 'Expected fallback, got: ' + r.source);
  console.assert(r.route === 'external', 'Expected external, got: ' + r.route);
  console.assert(r.sensitivity === 'internal', 'Expected internal tier, got: ' + r.sensitivity);
  if (r.source !== 'fallback' || r.route !== 'external' || r.sensitivity !== 'internal') process.exit(1);
  console.log('Router test passed');
}).catch(err => {
  console.error('FAIL - unexpected rejection:', err.message);
  process.exit(1);
});
