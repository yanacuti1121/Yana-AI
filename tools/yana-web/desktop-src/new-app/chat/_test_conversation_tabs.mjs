import assert from 'node:assert/strict';
import {
  createConversationTab,
  duplicateConversationTab,
  normalizeConversationTabs,
  persistedMessages,
  serializeConversationTabs,
  tabTitleFromMessages,
  withConversationTabTitle,
  withActiveTabSettings,
  withActiveTabMessages,
} from './conversation-tabs.mjs';

const initial = [{ who: 'user', text: 'Explain the workspace architecture' }];
assert.equal(tabTitleFromMessages(initial), 'Explain the workspace architecture');
assert.equal(tabTitleFromMessages([]), 'New chat');
assert.equal(tabTitleFromMessages([{ who: 'user', text: 'x'.repeat(43) }]).endsWith('…'), true);

const fallback = normalizeConversationTabs(null, initial);
assert.equal(fallback.tabs.length, 1);
assert.equal(fallback.activeId, 'chat-current');
assert.deepEqual(fallback.tabs[0].messages, initial);

const restored = normalizeConversationTabs({
  activeId: 'second',
  tabs: [createConversationTab('first', initial, { provider: 'ollama', model: 'qwen3:8b' }), createConversationTab('second', [])],
});
assert.equal(restored.tabs.length, 2);
assert.equal(restored.activeId, 'second');

const updated = withActiveTabMessages(restored, [{ who: 'user', text: 'Investigate a flaky test' }]);
assert.equal(updated.tabs.find((tab) => tab.id === 'second').title, 'Investigate a flaky test');
const configured = withActiveTabSettings(updated, { provider: 'custom', model: 'my-local-model' });
assert.equal(configured.tabs.find((tab) => tab.id === 'first').provider, 'ollama');
assert.equal(configured.tabs.find((tab) => tab.id === 'second').provider, 'custom');
assert.equal(configured.tabs.find((tab) => tab.id === 'second').model, 'my-local-model');

const renamed = withConversationTabTitle(configured, 'second', '  Review   local model wiring  ');
assert.equal(renamed.tabs.find((tab) => tab.id === 'second').title, 'Review local model wiring');
const renamedAfterMessage = withActiveTabMessages(renamed, [{ who: 'user', text: 'This must not replace the manual title' }]);
assert.equal(renamedAfterMessage.tabs.find((tab) => tab.id === 'second').title, 'Review local model wiring');
assert.equal(serializeConversationTabs(renamedAfterMessage).tabs[1].titleSource, 'manual');
const duplicated = duplicateConversationTab(renamed, 'second', 'copy-of-second');
assert.equal(duplicated.activeId, 'copy-of-second');
assert.equal(duplicated.tabs.find((tab) => tab.id === 'copy-of-second').provider, 'custom');
assert.notEqual(duplicated.tabs.find((tab) => tab.id === 'copy-of-second').messages, renamed.tabs.find((tab) => tab.id === 'second').messages);

const persisted = persistedMessages([
  { who: 'user', text: 'safe' },
  { who: 'user', text: 'secret', confidential: true },
]);
assert.deepEqual(persisted, [{ who: 'user', text: 'safe' }]);
assert.deepEqual(serializeConversationTabs(configured).tabs[1].messages, [{ who: 'user', text: 'Investigate a flaky test' }]);
assert.equal(serializeConversationTabs(configured).tabs[1].model, 'my-local-model');
console.log('Conversation tab state tests passed: 18');
