export const CONVERSATION_TABS_STORAGE_KEY = 'yana.new-app.conversation-tabs.v1';
export const MAX_CONVERSATION_TABS = 8;
const MESSAGE_LIMIT = 60;
const DEFAULT_TITLE = 'New chat';

function normalizedMessages(messages) {
  return Array.isArray(messages) ? messages.filter((message) => message && typeof message === 'object') : [];
}

function optionalSetting(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 256) : null;
}

function normalizedTitle(value, fallback = DEFAULT_TITLE) {
  if (typeof value !== 'string') return fallback;
  const title = value.trim().replace(/\s+/g, ' ').slice(0, 96);
  return title || fallback;
}

export function tabTitleFromMessages(messages) {
  const firstUserMessage = normalizedMessages(messages).find((message) => (
    message.who === 'user' && typeof message.text === 'string' && message.text.trim()
  ));
  if (!firstUserMessage) return DEFAULT_TITLE;
  const firstLine = firstUserMessage.text.trim().replace(/\s+/g, ' ');
  return firstLine.length > 42 ? `${firstLine.slice(0, 41)}…` : firstLine;
}

export function persistedMessages(messages) {
  return normalizedMessages(messages)
    .filter((message) => !message.confidential)
    .slice(-MESSAGE_LIMIT)
    .map((message) => ({ ...message }));
}

export function createConversationTab(id, messages = [], { provider = null, model = null } = {}) {
  const safeMessages = normalizedMessages(messages);
  return {
    id,
    title: tabTitleFromMessages(safeMessages),
    titleSource: 'derived',
    messages: safeMessages,
    provider: optionalSetting(provider),
    model: optionalSetting(model),
  };
}

function normalizeTab(tab, index) {
  if (!tab || typeof tab.id !== 'string' || !tab.id) return null;
  const messages = normalizedMessages(tab.messages);
  return {
    id: tab.id,
    title: typeof tab.title === 'string' && tab.title.trim() ? tab.title.slice(0, 96) : tabTitleFromMessages(messages),
    titleSource: tab.titleSource === 'manual' ? 'manual' : 'derived',
    messages,
    provider: optionalSetting(tab.provider),
    model: optionalSetting(tab.model),
    index,
  };
}

export function normalizeConversationTabs(value, legacyMessages = []) {
  const tabs = (Array.isArray(value?.tabs) ? value.tabs : [])
    .map(normalizeTab)
    .filter(Boolean)
    .slice(0, MAX_CONVERSATION_TABS)
    .map(({ index: _index, ...tab }) => tab);
  const fallback = createConversationTab('chat-current', legacyMessages);
  const safeTabs = tabs.length ? tabs : [fallback];
  const activeId = safeTabs.some((tab) => tab.id === value?.activeId)
    ? value.activeId
    : safeTabs[0].id;
  return { tabs: safeTabs, activeId };
}

export function withActiveTabMessages(state, messages) {
  const nextMessages = normalizedMessages(messages);
  return {
    ...state,
    tabs: state.tabs.map((tab) => tab.id === state.activeId
      ? {
          ...tab,
          title: tab.titleSource === 'manual' ? tab.title : tabTitleFromMessages(nextMessages),
          messages: nextMessages,
        }
      : tab),
  };
}

export function withActiveTabSettings(state, settings) {
  const nextProvider = Object.hasOwn(settings, 'provider') ? optionalSetting(settings.provider) : undefined;
  const nextModel = Object.hasOwn(settings, 'model') ? optionalSetting(settings.model) : undefined;
  return {
    ...state,
    tabs: state.tabs.map((tab) => tab.id === state.activeId
      ? {
          ...tab,
          ...(nextProvider === undefined ? {} : { provider: nextProvider }),
          ...(nextModel === undefined ? {} : { model: nextModel }),
        }
      : tab),
  };
}

// Keep title changes as a state transformation rather than a component-local
// mutation so renaming survives a reload through serializeConversationTabs().
export function withConversationTabTitle(state, id, title) {
  const tab = state.tabs.find((candidate) => candidate.id === id);
  if (!tab) return state;
  const nextTitle = normalizedTitle(title, tabTitleFromMessages(tab.messages));
  return {
    ...state,
    tabs: state.tabs.map((candidate) => candidate.id === id
      ? { ...candidate, title: nextTitle, titleSource: 'manual' }
      : candidate),
  };
}

// A duplicate has independent tab identity and future message/model state,
// while beginning with the source conversation as explicit user intent.
export function duplicateConversationTab(state, id, nextId) {
  if (state.tabs.length >= MAX_CONVERSATION_TABS
    || typeof nextId !== 'string'
    || !nextId
    || state.tabs.some((tab) => tab.id === nextId)) return state;
  const source = state.tabs.find((tab) => tab.id === id);
  if (!source) return state;
  const duplicate = {
    ...source,
    id: nextId,
    title: normalizedTitle(`${source.title} copy`),
    titleSource: 'manual',
    messages: normalizedMessages(source.messages).map((message) => ({ ...message })),
  };
  return { tabs: [...state.tabs, duplicate], activeId: duplicate.id };
}

export function serializeConversationTabs(state) {
  return {
    version: 2,
    activeId: state.activeId,
    tabs: state.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      titleSource: tab.titleSource,
      messages: persistedMessages(tab.messages),
      provider: tab.provider,
      model: tab.model,
    })),
  };
}
