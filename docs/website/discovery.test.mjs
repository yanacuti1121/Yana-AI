import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = readFileSync(new URL('../assets/yana-discovery.js', import.meta.url), 'utf8');
const { createDiscoveryState, transitionDiscovery } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);
const next = state => transitionDiscovery(state, { type: 'next' });
const permissionStep = () => next(next(createDiscoveryState()));
const decide = (state, value) => transitionDiscovery(state, { type: 'decision', value });

test('A new visitor must review the request and proposal before deciding', () => {
  const start = createDiscoveryState();
  assert.equal(transitionDiscovery(start, { type: 'visit', step: 4 }), start);
  assert.equal(decide(start, 'allow'), start);
  assert.deepEqual(permissionStep(), { step: 2, decision: null, humanApproved: false });
});

test('A permission choice is required before the result can be opened', () => {
  const state = permissionStep();
  assert.equal(next(state), state);
  assert.equal(decide(state, 'unknown'), state);
  assert.equal(transitionDiscovery(state, { type: 'confirm' }), state);
});

test('Allow once reaches the result and receipt without implying a second approval', () => {
  const allowed = decide(permissionStep(), 'allow');
  assert.deepEqual(next(next(allowed)), { step: 4, decision: 'allow', humanApproved: false });
});

test('Ask remains pending until the visitor explicitly confirms the scope', () => {
  const pending = decide(permissionStep(), 'ask');
  assert.equal(next(pending), pending);
  const approved = transitionDiscovery(pending, { type: 'confirm' });
  assert.deepEqual(next(next(approved)), { step: 4, decision: 'allow', humanApproved: true });
});

test('Deny reaches the receipt while preserving the denied outcome', () => {
  const denied = decide(permissionStep(), 'deny');
  assert.deepEqual(next(next(denied)), { step: 4, decision: 'deny', humanApproved: false });
});

test('Returning to the permission step invalidates the old approval', () => {
  const receipt = next(next(decide(permissionStep(), 'allow')));
  const revisited = transitionDiscovery(receipt, { type: 'visit', step: 2 });
  assert.deepEqual(revisited, permissionStep());
  assert.equal(next(revisited), revisited);
  const result = transitionDiscovery(receipt, { type: 'back' });
  assert.equal(result.decision, 'allow');
  assert.deepEqual(transitionDiscovery(result, { type: 'back' }), permissionStep());
});

test('Switching away from a human approval clears its confirmation', () => {
  const approved = transitionDiscovery(decide(permissionStep(), 'ask'), { type: 'confirm' });
  assert.deepEqual(decide(approved, 'deny'), { step: 2, decision: 'deny', humanApproved: false });
});

test('Replay clears all state and repeated navigation stays within the five steps', () => {
  let state = next(next(decide(permissionStep(), 'deny')));
  assert.equal(next(state), state);
  state = transitionDiscovery(state, { type: 'reset' });
  assert.deepEqual(state, createDiscoveryState());
  assert.equal(transitionDiscovery(state, { type: 'back' }), state);
  assert.equal(transitionDiscovery(state, { type: 'visit', step: -1 }), state);
});

const pages = ['index.html', 'en.html', 'ko.html'];
test('VI, EN and KO expose the same five steps, controls and localized receipt data', () => {
  let expectedKeys;
  for (const page of pages) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.equal((html.match(/data-guided-discovery/g) || []).length, 1, page);
    assert.deepEqual([...html.matchAll(/data-discovery-panel="(\d)"/g)].map(m => m[1]), ['0', '1', '2', '3', '4'], page);
    assert.deepEqual([...html.matchAll(/data-decision="(\w+)"/g)].map(m => m[1]), ['allow', 'ask', 'deny'], page);
    for (const control of ['next', 'back', 'reset', 'confirm', 'live']) {
      assert.ok(html.includes(`data-discovery-${control}`), `${page}: ${control}`);
    }
    const copy = JSON.parse(html.match(/<script type="application\/json" data-discovery-copy>([\s\S]*?)<\/script>/)[1]);
    assert.equal(copy.next.length, 4, page);
    const keys = Object.keys(copy).concat(Object.keys(copy.status), Object.keys(copy.detail));
    if (expectedKeys) assert.deepEqual(keys, expectedKeys, page);
    else expectedKeys = keys;
    assert.ok(Object.values(copy.detail).every(value => value.length > 0), page);
    if (page === 'ko.html') assert.match(copy.status.ready, /[가-힣]/);
  }
});

test('Each localized tour preserves its anchor, fallback and real product links', () => {
  for (const page of pages) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.equal((html.match(/id="live-demo"/g) || []).length, 1, page);
    assert.match(html, /class="discovery-entry" href="#live-demo"/);
    const tour = html.slice(html.indexOf('<section class="chapter execution-lab"'), html.indexOf('</section>', html.indexOf('<section class="chapter execution-lab"')));
    assert.match(tour, /<noscript>/);
    assert.match(tour, /data-result-allowed/);
    assert.match(tour, /data-result-denied/);
    for (const match of tour.matchAll(/<a href="([^"]+)"/g)) {
      assert.ok(existsSync(new URL(`../${match[1]}`, import.meta.url)), `${page}: ${match[1]}`);
    }
    assert.match(html, /type="module" src="assets\/yana-discovery\.js/);
    assert.match(html, /href="assets\/yana-discovery\.css/);
  }
});

test('The tour is immediately after the hero in all three languages', () => {
  for (const page of pages) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const hero = html.indexOf('<section class="yana-intro"');
    const heroEnd = html.indexOf('</section>', hero) + '</section>'.length;
    const tour = html.indexOf('<section class="chapter execution-lab"');
    assert.equal(html.slice(heroEnd, tour).trim(), '', page);
    assert.ok(html.slice(hero, heroEnd).includes('class="discovery-hero-actions"'), page);
  }
});
