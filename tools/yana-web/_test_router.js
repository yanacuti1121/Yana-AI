'use strict';
const {route} = require('./router.js');

route('deploy to prod').then(r => {
  console.log('source:', r.source, '| route:', r.route);
  console.assert(r.source === 'fallback', 'Expected fallback, got: ' + r.source);
  console.assert(r.route === 'external', 'Expected external, got: ' + r.route);
  console.log('Router test passed');
}).catch(err => {
  console.error('FAIL - unexpected rejection:', err.message);
  process.exit(1);
});
