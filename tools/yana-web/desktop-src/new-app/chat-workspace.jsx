// New app shell's Chat workspace — reuses the EXACT SAME chat hooks the
// legacy Chat page (pages/chat.jsx) uses (useChatSend, useChatModels,
// etc. — Category A), wired the same way, so "existing Yana chat still
// works" carries zero new risk. Presentation is now FULLY new-app-owned
// (visual parity pass): Conversation/UserMessage/YanaMessage/Composer/
// EmptyState under ./chat/ replace every legacy chat presentation
// component (MessageLog, ComposerBar, its EmptyState) — the only legacy
// import left is MarkdownBubble (pure markdown+DOMPurify+syntax-highlight
// rendering, Category B, reused by yana-message.jsx directly, not by
// this file).
//
// Dropped for this step (chrome, not core behavior — no UI entry point
// yet, not deleted from the hooks): HTML template picker, OCR attach,
// vision attach, confidential-mode toggle. useVisionAttach() is still
// called because useChatSend()'s API takes visionImage/setVisionImage as
// params; confMode is a real, honest `false` (no toggle exists yet, so it
// truthfully never activates) rather than removed from the call.
import React from 'react';
import { useChatHistory } from '../pages/chat/use-chat-history.js';
import { useVisionAttach } from '../pages/chat/use-vision-attach.js';
import { useChatSend } from '../pages/chat/use-chat-send.js';
import { Conversation, ScrollToBottomButton } from './chat/conversation.jsx';
import { Composer } from './chat/composer.jsx';
import { EmptyState } from './chat/empty-state.jsx';
import { ConversationTabs, useConversationTabs } from './chat/conversation-tabs.jsx';
import { emitChatCompleted, emitChatError, emitCanonicalRuntimeEvent } from './activity-source.mjs';
import { useNewAppChatModels } from './use-chat-models.jsx';
import { useNewAppLocalStatus } from './use-local-status.jsx';
import { customLocalProviderDescriptor } from './custom-local-model.mjs';
import { useProject } from './project-context.jsx';
import {
  getActiveSessionSnapshot,
  isAttachmentEnabled,
  setAttachmentEnabled,
  subscribe as subscribeTerminalContext,
} from '../lib/terminal-context.mjs';
import { clearAttachments, invalidateAttachmentOperations } from '../lib/file-attachments.mjs';

const CONF_MODE = false; // no toggle in the new composer yet — real, not faked

export function ChatWorkspace({ onContextChange, onFocusTerminal }) {
  const { repoRoot } = useProject();
  const [draft, setDraft] = React.useState('');
  const [providerSel, setProviderSel] = React.useState(() => localStorage.getItem('yana.chat.provider') || '');
  const [atBottom, setAtBottom] = React.useState(true);
  const [terminalContextState, setTerminalContextState] = React.useState(() => ({
    hasTerminalSession: getActiveSessionSnapshot() !== null,
    terminalAttached: isAttachmentEnabled(),
  }));
  const logRef = React.useRef(null);
  const inputRef = React.useRef(null);

  const { msgs, setMsgs } = useChatHistory();
  const conversationTabs = useConversationTabs({ messages: msgs, setMessages: setMsgs });
  const setActiveTabProvider = React.useCallback((provider) => {
    conversationTabs.updateActiveTabSettings({ provider, model: null });
    setProviderSel(provider);
  }, [conversationTabs.updateActiveTabSettings]);
  const localStatus = useNewAppLocalStatus(setActiveTabProvider);
  const { modelSel, liveModels, activeProvider, modelOptions, activeModel, isVisionModel, pickModel, customLocalModel } = useNewAppChatModels(providerSel, conversationTabs.activeTab?.model || '');
  const { visionImage, setVisionImage, attachVisionFile } = useVisionAttach();
  const { thinking, streaming, sendError, lastUsage, runtimeEvents, sendText, send, stopStream } = useChatSend({
    msgs, setMsgs, draft, setDraft, providerSel, confMode: CONF_MODE, modelSel, liveModels,
    visionImage, setVisionImage, localStatus, inputRef, setAtBottom, setArtifact: () => {}, customLocalModel,
  });
  const providers = React.useMemo(() => {
    const known = window.YANA?.providers || [];
    const custom = customLocalProviderDescriptor(customLocalModel);
    return custom && !known.some((provider) => provider.id === custom.id) ? [...known, custom] : known;
  }, [customLocalModel]);

  const setActiveTabModel = React.useCallback((model) => {
    pickModel(model);
    conversationTabs.updateActiveTabSettings({ model });
  }, [pickModel, conversationTabs.updateActiveTabSettings]);

  // Older persisted tabs do not carry settings. Capture the current live
  // selection once, then restore each tab's selection after a switch.
  React.useEffect(() => {
    const activeTab = conversationTabs.activeTab;
    if (!activeTab) return;
    if (activeTab.provider && activeTab.provider !== providerSel) {
      setProviderSel(activeTab.provider);
      return;
    }
    const settings = {
      ...(activeTab.provider || !(providerSel || activeProvider) ? {} : { provider: providerSel || activeProvider }),
      ...(activeTab.model || !activeModel ? {} : { model: activeModel }),
    };
    if (Object.keys(settings).length) conversationTabs.updateActiveTabSettings(settings);
  }, [conversationTabs.activeId, conversationTabs.activeTab, conversationTabs.updateActiveTabSettings, providerSel, activeProvider, activeModel]);

  // A composer image/file attachment is a one-turn, in-memory-only draft
  // (useVisionAttach/file-attachments.mjs are not per-tab state) — without
  // this, switching conversation tabs left a still-attached image or file
  // sitting in the composer and it could get sent into an unrelated
  // conversation. Skips the mount render so an attachment picked before
  // the first tab finishes hydrating isn't wiped out from under the user.
  const mountedTabIdRef = React.useRef(null);
  React.useEffect(() => {
    if (mountedTabIdRef.current === null) { mountedTabIdRef.current = conversationTabs.activeId; return; }
    if (mountedTabIdRef.current === conversationTabs.activeId) return;
    mountedTabIdRef.current = conversationTabs.activeId;
    invalidateAttachmentOperations();
    setVisionImage(null);
    clearAttachments();
  }, [conversationTabs.activeId]);

  // Attachments are scoped to the current project, not just the visible
  // conversation tab. The attachment module intentionally keeps one
  // in-memory draft for the composer, so clear it whenever the workspace
  // root changes to prevent a file or screenshot from crossing projects.
  // Keep typed draft text intact: only explicit attachment context is unsafe
  // to carry into the new project.
  const attachmentProjectRootRef = React.useRef(repoRoot);
  React.useEffect(() => {
    if (attachmentProjectRootRef.current === repoRoot) return;
    attachmentProjectRootRef.current = repoRoot;
    invalidateAttachmentOperations();
    setVisionImage(null);
    clearAttachments();
  }, [repoRoot, setVisionImage]);

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }

  // scrollTop we last set ourselves, so the onScroll tracker below can
  // reject the scroll event our own snap produces instead of misreading
  // it as the user scrolling up (the classic stick-to-bottom race).
  const lastProgrammaticScrollTop = React.useRef(null);
  React.useEffect(() => {
    const el = logRef.current;
    if (el && atBottom) {
      el.scrollTop = el.scrollHeight;
      lastProgrammaticScrollTop.current = el.scrollTop;
    }
  }, [msgs, thinking, atBottom]);

  // Track whether the user has scrolled up — this was present on the
  // legacy chat page (pages/chat.jsx) but missing here, so streaming
  // replies kept yanking the view back to the bottom even after the user
  // scrolled up to read earlier messages.
  React.useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    function onScroll() {
      const last = lastProgrammaticScrollTop.current;
      if (last !== null && Math.abs(el.scrollTop - last) <= 2) return;
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // The terminal module owns this state. Subscribe to its real session events
  // rather than polling or assuming a displayed Terminal panel is running.
  React.useEffect(() => {
    return subscribeTerminalContext(() => setTerminalContextState({
      hasTerminalSession: getActiveSessionSnapshot() !== null,
      terminalAttached: isAttachmentEnabled(),
    }));
  }, []);

  function toggleTerminalAttachment() {
    if (!terminalContextState.hasTerminalSession) {
      onFocusTerminal?.();
      return;
    }
    setAttachmentEnabled(!terminalContextState.terminalAttached);
  }

  // Reports real, current model/usage/selector state up to the shell so
  // the Context Panel (a sibling, not a child, of this workspace) can
  // render AND control it — the single primary model selector lives
  // there, not duplicated in the composer. `runtimeEvents` is exposed
  // here too (STEP 3: kept plumbed through for whenever chat progress
  // cards are wired to it).
  React.useEffect(() => {
    onContextChange?.({
      provider: activeProvider, model: activeModel, lastUsage, runtimeEvents,
      providerSel, setProviderSel: setActiveTabProvider, pickModel: setActiveTabModel, modelOptions,
      providers,
    });
  }, [activeProvider, activeModel, lastUsage, runtimeEvents, providerSel, modelOptions, onContextChange, setActiveTabProvider, setActiveTabModel, providers]);

  // STEP 3 canonical RuntimeEvent -> Activity (unchanged from before this
  // visual pass — see activity-source.mjs's own translation).
  const seenRuntimeEventCount = React.useRef(0);
  const hadCanonicalThisTurnRef = React.useRef(false);
  React.useEffect(() => {
    if (runtimeEvents.length > seenRuntimeEventCount.current) {
      for (const ev of runtimeEvents.slice(seenRuntimeEventCount.current)) {
        emitCanonicalRuntimeEvent(ev);
        hadCanonicalThisTurnRef.current = true;
      }
      seenRuntimeEventCount.current = runtimeEvents.length;
    }
  }, [runtimeEvents]);

  const prevThinkingRef = React.useRef(false);
  React.useEffect(() => {
    if (thinking && !prevThinkingRef.current) {
      hadCanonicalThisTurnRef.current = false;
    }
    if (prevThinkingRef.current && !thinking && !streaming) {
      if (!hadCanonicalThisTurnRef.current) {
        const last = msgs[msgs.length - 1];
        if (last?.who === 'yana' && last?.text?.startsWith('[Error:')) emitChatError(last.text);
        else if (last?.who === 'yana') emitChatCompleted();
      }
    }
    prevThinkingRef.current = thinking;
  }, [thinking, streaming, msgs]);

  if (!window.YANA) return null;

  // Roadmap Phase 4 item 16 — Context-aware Composer. While the current
  // turn is actively running a command, show which one — same per-turn
  // `steps` ProgressCard renders (see use-chat-send.js), just read off
  // the in-flight assistant message instead of a finished one. Null the
  // instant nothing is running, so plain text-only replies never show a
  // stale "Running: ..." line.
  const lastMsg = msgs[msgs.length - 1];
  const liveSteps = streaming && lastMsg?.who === 'yana' ? lastMsg.steps : null;
  const activeStep = liveSteps?.length
    ? ([...liveSteps].reverse().find((s) => s.status === 'active') || null)
    : null;

  return (
    <div className="na-chat-workspace" style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, padding: '0 var(--gap)', gap: 10, position: 'relative' }}>
      <ConversationTabs
        tabs={conversationTabs.tabs}
        activeId={conversationTabs.activeId}
        onSelect={conversationTabs.selectTab}
        onCreate={conversationTabs.createTab}
        onClose={conversationTabs.closeTab}
        onRename={conversationTabs.renameTab}
        onDuplicate={conversationTabs.duplicateTab}
        disabled={thinking || streaming}
        tabLimitReached={conversationTabs.tabLimitReached}
      />
      <Conversation
        logRef={logRef} msgs={msgs} thinking={thinking}
        emptyState={<EmptyState onPick={sendText} />}
      />
      <ScrollToBottomButton show={!atBottom} onClick={() => {
        const el = logRef.current;
        if (el) { el.scrollTop = el.scrollHeight; lastProgrammaticScrollTop.current = el.scrollTop; setAtBottom(true); }
      }} />
      <Composer
        draft={draft} setDraft={setDraft} autoResize={autoResize} send={send} stopStream={stopStream}
        streaming={streaming} thinking={thinking} inputRef={inputRef} activeModel={activeModel}
        hasTerminalSession={terminalContextState.hasTerminalSession}
        terminalAttached={terminalContextState.terminalAttached}
        onToggleTerminalContext={toggleTerminalAttachment}
        visionImage={visionImage}
        setVisionImage={setVisionImage}
        attachVisionFile={attachVisionFile}
        activeStep={activeStep}
        canAttachVision={isVisionModel(activeModel)}
        sendError={sendError}
      />
    </div>
  );
}
