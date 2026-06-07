'use strict';
const {classify} = require('./classifier.js');

// Test 1: external route
const t1 = classify('git push origin main');
console.assert(t1.route === 'external', 'T1 FAIL: got ' + t1.route);
console.log('T1 route:', t1.route);

// Test 2: Vietnamese complex
const t2 = classify('sửa bug auth middleware');
console.assert(t2.route === 'complex', 'T2 FAIL: got ' + t2.route);
console.log('T2 route:', t2.route);

// Test 3: simple
const t3 = classify('what time is it');
console.assert(t3.route === 'simple', 'T3 FAIL: got ' + t3.route);
console.log('T3 route:', t3.route);

// Test 4: 6 keys
const keys = Object.keys(t3).sort().join(',');
const expected = 'confidence,gate,matched_signals,reason,route,suggested_agents';
console.assert(keys === expected, '6-key FAIL: ' + keys);
console.log('T4 keys:', keys === expected ? 'OK' : 'FAIL');

console.log('All classifier tests passed');
