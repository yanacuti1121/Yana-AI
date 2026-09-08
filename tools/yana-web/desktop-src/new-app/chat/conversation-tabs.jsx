import React from 'react';
import { L, Icons } from '../../components.jsx';
import {
  CONVERSATION_TABS_STORAGE_KEY,
  MAX_CONVERSATION_TABS,
  createConversationTab,
  duplicateConversationTab,
  normalizeConversationTabs,
  serializeConversationTabs,
  withConversationTabTitle,
  withActiveTabSettings,
  withActiveTabMessages,
} from './conversation-tabs.mjs';

function tabId() {
  if (globalThis.crypto?.randomUUID) return `chat-${globalThis.crypto.randomUUID()}`;
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadTabs(messages) {
  try {
    return normalizeConversationTabs(JSON.parse(localStorage.getItem(CONVERSATION_TABS_STORAGE_KEY) || '{}'), messages);
  } catch (_) {
    return normalizeConversationTabs(null, messages);
  }
}

function persistTabs(state) {
  try {
    localStorage.setItem(CONVERSATION_TABS_STORAGE_KEY, JSON.stringify(serializeConversationTabs(state)));
  } catch (_) {}
}

// This is deliberately a presentation-layer session workspace. It keeps
// multiple visible conversations while the existing `useChatHistory` hook
// remains the single compatibility bridge for the active legacy chat and
// its server-side session capture. Confidential turns stay available only in
// memory and are omitted by serializeConversationTabs() before persistence.
export function useConversationTabs({ messages, setMessages }) {
  const [state, setState] = React.useState(() => loadTabs(messages));
  const hydratingRef = React.useRef(true);

  React.useEffect(() => {
    if (hydratingRef.current) {
      hydratingRef.current = false;
      const activeTab = state.tabs.find((tab) => tab.id === state.activeId);
      if (activeTab && activeTab.messages !== messages) {
        setMessages(activeTab.messages);
        return;
      }
    }
    setState((current) => withActiveTabMessages(current, messages));
  }, [messages, setMessages, state.activeId]);

  React.useEffect(() => { persistTabs(state); }, [state]);

  const selectTab = React.useCallback((id) => {
    if (id === state.activeId) return;
    const selected = state.tabs.find((tab) => tab.id === id);
    if (!selected) return;
    setState((current) => ({ ...current, activeId: id }));
    setMessages(selected.messages);
  }, [setMessages, state]);

  const createTab = React.useCallback(() => {
    if (state.tabs.length >= MAX_CONVERSATION_TABS) return;
    const next = createConversationTab(tabId());
    setState((current) => ({ tabs: [...current.tabs, next], activeId: next.id }));
    setMessages([]);
  }, [setMessages, state.tabs.length]);

  const closeTab = React.useCallback((id) => {
    if (state.tabs.length <= 1) return;
    const closingIndex = state.tabs.findIndex((tab) => tab.id === id);
    if (closingIndex < 0) return;
    const remaining = state.tabs.filter((tab) => tab.id !== id);
    const nextActiveId = id === state.activeId
      ? (remaining[Math.max(0, closingIndex - 1)] || remaining[0]).id
      : state.activeId;
    const nextActive = remaining.find((tab) => tab.id === nextActiveId) || remaining[0];
    setState({ tabs: remaining, activeId: nextActiveId });
    if (id === state.activeId) setMessages(nextActive.messages);
  }, [setMessages, state]);

  const updateActiveTabSettings = React.useCallback((settings) => {
    setState((current) => withActiveTabSettings(current, settings));
  }, []);

  const renameTab = React.useCallback((id, nextTitle) => {
    setState((current) => withConversationTabTitle(current, id, nextTitle));
  }, []);

  const duplicateTab = React.useCallback((id) => {
    const nextId = tabId();
    setState((current) => duplicateConversationTab(current, id, nextId));
  }, []);

  const activeTab = state.tabs.find((tab) => tab.id === state.activeId) || state.tabs[0];
  return {
    ...state, activeTab, selectTab, createTab, closeTab, renameTab, duplicateTab,
    updateActiveTabSettings, tabLimitReached: state.tabs.length >= MAX_CONVERSATION_TABS,
  };
}

export function ConversationTabs({ tabs, activeId, onSelect, onCreate, onClose, onRename, onDuplicate, disabled, tabLimitReached }) {
  const [menuTabId, setMenuTabId] = React.useState(null);
  const [renameDraft, setRenameDraft] = React.useState('');

  React.useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') setMenuTabId(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Same missing dismiss path as the composer's "add context" menu had —
  // the "•••" tab-actions menu stayed open when clicking anywhere else.
  React.useEffect(() => {
    if (!menuTabId) return;
    const onPointerDown = (event) => {
      if (!event.target.closest('.na-conversation-tab-menu-wrap')) setMenuTabId(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuTabId]);

  return (
    <div className="na-conversation-tabs" role="tablist" aria-label={L('Conversation tabs', 'Các tab hội thoại', '대화 탭', '会话标签')}>
      <div className="na-conversation-tab-list">
        {tabs.map((tab) => (
          <div key={tab.id} className={`na-conversation-tab${tab.id === activeId ? ' is-active' : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={tab.id === activeId}
              disabled={disabled}
              title={tab.title}
              onClick={() => onSelect(tab.id)}
            >
              {tab.title}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                className="na-conversation-tab-close"
                aria-label={L('Close conversation', 'Đóng hội thoại', '대화 닫기', '关闭会话')}
                title={L('Close conversation', 'Đóng hội thoại', '대화 닫기', '关闭会话')}
                disabled={disabled}
                onClick={(event) => { event.stopPropagation(); onClose(tab.id); }}
              >×</button>
            )}
            <div className="na-conversation-tab-menu-wrap">
              <button
                type="button"
                className="na-conversation-tab-menu-button"
                aria-label={L('Conversation actions', 'Thao tác hội thoại', '대화 작업', '对话操作')}
                aria-haspopup="menu"
                aria-expanded={menuTabId === tab.id}
                disabled={disabled}
                onClick={() => {
                  setRenameDraft('');
                  setMenuTabId((current) => current === tab.id ? null : tab.id);
                }}
              >•••</button>
              {menuTabId === tab.id && (
                <div className="na-conversation-tab-menu" role="menu">
                  {renameDraft ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        onRename(tab.id, renameDraft);
                        setRenameDraft('');
                        setMenuTabId(null);
                      }}
                    >
                      <input
                        autoFocus
                        value={renameDraft}
                        maxLength={96}
                        aria-label={L('Conversation title', 'Tên hội thoại', '대화 제목', '对话标题')}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') { setRenameDraft(''); setMenuTabId(null); }
                        }}
                      />
                      <div className="na-conversation-tab-menu-actions">
                        <button type="button" onClick={() => { setRenameDraft(''); setMenuTabId(null); }}>{L('Cancel', 'Hủy', '취소', '取消')}</button>
                        <button type="submit">{L('Save', 'Lưu', '저장', '保存')}</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <button type="button" role="menuitem" onClick={() => setRenameDraft(tab.title)}>
                        {L('Rename', 'Đổi tên', '이름 바꾸기', '重命名')}
                      </button>
                      <button type="button" role="menuitem" disabled={tabLimitReached} onClick={() => { setMenuTabId(null); onDuplicate(tab.id); }}>
                        {L('Duplicate', 'Nhân bản', '복제', '复制')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="na-conversation-tab-new"
        onClick={onCreate}
        disabled={disabled || tabLimitReached}
        title={tabLimitReached
          ? L('Maximum of eight open conversations', 'Tối đa tám hội thoại đang mở', '열린 대화는 최대 8개입니다', '最多打开八个会话')
          : L('New conversation', 'Hội thoại mới', '새 대화', '新建会话')}
        aria-label={L('New conversation', 'Hội thoại mới', '새 대화', '新建会话')}
      >
        {Icons.plus(15)}
      </button>
    </div>
  );
}
