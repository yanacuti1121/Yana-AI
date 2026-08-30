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
import { emitChatCompleted, emitChatError, emitCanonicalRuntimeEvent } from './activity-source.mjs';
import { useNewAppChatModels } from './use-chat-models.jsx';
import { useNewAppLocalStatus } from './use-local-status.jsx';
import {
  getActiveSessionSnapshot,
  isAttachmentEnabled,
  setAttachmentEnabled,
  subscribe as subscribeTerminalContext,
} from '../lib/terminal-context.mjs';

const CONF_MODE = false; // no toggle in the new composer yet — real, not faked

export function ChatWorkspace({ onContextChange, onFocusTerminal }) {
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
  const localStatus = useNewAppLocalStatus(setProviderSel);
  const { modelSel, liveModels, activeProvider, modelOptions, activeModel, pickModel } = useNewAppChatModels(providerSel);
  const { visionImage, setVisionImage } = useVisionAttach();
  const { thinking, streaming, lastUsage, runtimeEvents, sendText, send, stopStream } = useChatSend({
    msgs, setMsgs, draft, setDraft, providerSel, confMode: CONF_MODE, modelSel, liveModels,
    visionImage, setVisionImage, localStatus, inputRef, setAtBottom, setArtifact: () => {},
  });

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }

  React.useEffect(() => {
    const el = logRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [msgs, thinking, atBottom]);

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
      providerSel, setProviderSel, pickModel, modelOptions,
      providers: window.YANA?.providers || [],
    });
  }, [activeProvider, activeModel, lastUsage, runtimeEvents, providerSel, modelOptions, onContextChange, pickModel]);

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, padding: '0 var(--gap)', gap: 10, position: 'relative' }}>
      <Conversation
        logRef={logRef} msgs={msgs} thinking={thinking}
        emptyState={<EmptyState onPick={sendText} />}
      />
      <ScrollToBottomButton show={!atBottom} onClick={() => { const el = logRef.current; if (el) { el.scrollTop = el.scrollHeight; setAtBottom(true); } }} />
      <Composer
        draft={draft} setDraft={setDraft} autoResize={autoResize} send={send} stopStream={stopStream}
        streaming={streaming} thinking={thinking} inputRef={inputRef} activeModel={activeModel}
        hasTerminalSession={terminalContextState.hasTerminalSession}
        terminalAttached={terminalContextState.terminalAttached}
        onToggleTerminalContext={toggleTerminalAttachment}
        activeStep={activeStep}
      />
    </div>
  );
}
