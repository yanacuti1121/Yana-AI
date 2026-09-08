'use strict';
// Tests for oauth-pending-store.js — the generic nonce->data store shared
// by connector-oauth.js (and reusable by anything else with the same
// cross-browser-callback problem auth.js's own comment documents).
// Run: node _test_oauth_pending_store.js   (exit 0 = pass, 1 = fail)

const { createPendingStore } = require('./oauth-pending-store');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else      { fail++; console.log('FAIL  ' + name); }
}

const store = createPendingStore(50); // 50ms TTL for fast expiry tests

const nonce = store.create({ status: 'pending' });
t('create returns a 48-char hex nonce', /^[0-9a-f]{48}$/.test(nonce));
t('peek returns the data without consuming', store.peek(nonce)?.status === 'pending');
t('peek again still finds it (not consumed)', store.peek(nonce)?.status === 'pending');

store.update(nonce, { status: 'ready', value: 42 });
t('update replaces the stored data', store.peek(nonce)?.value === 42);

const consumed = store.consume(nonce);
t('consume returns the data', consumed?.value === 42);
t('consume deletes the entry', store.peek(nonce) === null);
t('consuming again returns null', store.consume(nonce) === null);

t('peek on an unknown nonce returns null', store.peek('deadbeef') === null);

// Expiry
const shortLived = store.create({ status: 'pending' });
t('short-lived entry readable immediately', store.peek(shortLived) !== null);

function afterExpiry() {
  t('entry gone after its TTL elapses', store.peek(shortLived) === null);

  console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}
setTimeout(afterExpiry, 80);
