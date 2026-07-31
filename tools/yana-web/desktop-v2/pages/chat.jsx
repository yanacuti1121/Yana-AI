// Yana AI — Chat (orchestration-centric, not a chatbot clone).
// State/logic is split into hooks under ./chat/ (use-chat-models,
// use-chat-history, use-local-status, use-vision-attach, use-ocr,
// use-chat-send); render is split into ./chat/ sub-components (chat-header,
// html-template-picker, message-log, composer-bar) — see
// .claude/plans/functional-shimmying-boole.md section 3 for why.
import React from 'react';
import { L } from '../components.jsx';
import { ConvSidebar } from './chat/conv-sidebar.jsx';
import { OnboardingOverlay } from './chat/onboarding-overlay.jsx';
import { ContextPanel } from './chat/context-panel.jsx';
import { ArtifactPanel } from './chat/artifact-panel.jsx';
import { ChatHeader } from './chat/chat-header.jsx';
import { HtmlTemplatePicker } from './chat/html-template-picker.jsx';
import { MessageLog, ScrollToBottomButton } from './chat/message-log.jsx';
import { ComposerBar, ModelCapabilityHint } from './chat/composer-bar.jsx';
import { KEYLESS_PROVIDERS } from '../lib/provider-config.js';
import { useChatModels } from './chat/use-chat-models.js';
import { useChatHistory } from './chat/use-chat-history.js';
import { useLocalStatus } from './chat/use-local-status.js';
import { useVisionAttach } from './chat/use-vision-attach.js';
import { useOcr } from './chat/use-ocr.js';
import { useChatSend } from './chat/use-chat-send.js';

const ONBOARDED_KEY = "yana.onboarded";

export function Chat({ t }) {
  const D = window.YANA;

  const [draft, setDraft] = React.useState("");
  const [providerSel, setProviderSel] = React.useState(() => localStorage.getItem("yana.chat.provider") || "");
  // Rule 68 — manual Confidential Mode: everything sent while on is treated
  // as confidential even without a marker. Never persisted itself.
  const [confMode, setConfMode] = React.useState(false);
  const [artifact, setArtifact] = React.useState(null); // { html } — live HTML preview panel
  const [htmlPicker, setHtmlPicker] = React.useState(false);
  const [htmlSkills, setHtmlSkills] = React.useState([]);
  const [htmlSearch, setHtmlSearch] = React.useState("");
  const [msgSearch, setMsgSearch]   = React.useState(null); // null=closed, ""=open
  const [atBottom, setAtBottom]   = React.useState(true);
  const [showOnboarding, setShowOnboarding] = React.useState(() => {
    if (localStorage.getItem(ONBOARDED_KEY)) return false;
    return !D.providers.some(p => !KEYLESS_PROVIDERS.has(p.id) && p.id !== "auto" && YanaVault.hasKey(p.id));
  });
  const logRef    = React.useRef(null);
  const fileRef   = React.useRef(null);
  const visionRef = React.useRef(null);
  const inputRef  = React.useRef(null);

  const { msgs, setMsgs, convList, sidebarOpen, toggleSidebar, newConversation, loadConversation, deleteConversation } = useChatHistory();
  const localStatus = useLocalStatus(setProviderSel);
  const { modelSel, liveModels, activeProvider, modelOptions, activeModel, isVisionModel, pickModel } = useChatModels(providerSel);
  const { visionImage, setVisionImage, handleVisionAttach } = useVisionAttach();
  const { ocrBusy, handleOcr } = useOcr(setDraft, setMsgs);
  const { thinking, streaming, send, stopStream, regenerate } = useChatSend({
    msgs, setMsgs, draft, setDraft, providerSel, confMode, modelSel, liveModels,
    visionImage, setVisionImage, localStatus, inputRef, setAtBottom, setArtifact,
  });

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }

  // auto-scroll to bottom only when already at bottom
  React.useEffect(() => {
    const el = logRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [msgs, thinking, atBottom]);

  // track whether user has scrolled up
  React.useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    function onScroll() {
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div data-screen-label="Chat" style={{ display: "flex", gap: "var(--gap)", height: "100%", minHeight: 0 }}>
      {sidebarOpen && (
        <ConvSidebar list={convList} onLoad={loadConversation} onDelete={deleteConversation} onClose={toggleSidebar} />
      )}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
        <ChatHeader sidebarOpen={sidebarOpen} toggleSidebar={toggleSidebar} msgSearch={msgSearch} setMsgSearch={setMsgSearch} newConversation={newConversation} />

        {msgSearch !== null && (
          <div style={{ padding: "0 0 8px 0", flex: "none" }}>
            <input autoFocus value={msgSearch} onChange={e => setMsgSearch(e.target.value)}
              onKeyDown={e => e.key === "Escape" && setMsgSearch(null)}
              placeholder={L("Search messages…", "Tìm tin nhắn…", "메시지 검색…", "搜索消息…")}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 9, padding: "7px 12px", fontSize: 13, fontFamily: "inherit", background: "var(--surface)", color: "var(--ink)", outline: "none" }}
            />
          </div>
        )}

        {htmlPicker && (
          <HtmlTemplatePicker htmlSkills={htmlSkills} htmlSearch={htmlSearch} setHtmlSearch={setHtmlSearch} setHtmlPicker={setHtmlPicker} setDraft={setDraft} />
        )}

        <MessageLog logRef={logRef} msgs={msgs} thinking={thinking} streaming={streaming} localStatus={localStatus} msgSearch={msgSearch} regenerate={regenerate} />

        <ScrollToBottomButton show={!atBottom} onClick={() => { const el = logRef.current; if (el) { el.scrollTop = el.scrollHeight; setAtBottom(true); } }} />

        <ComposerBar
          fileRef={fileRef} visionRef={visionRef} inputRef={inputRef}
          handleOcr={handleOcr} handleVisionAttach={handleVisionAttach} ocrBusy={ocrBusy}
          htmlPicker={htmlPicker} setHtmlPicker={setHtmlPicker} htmlSkills={htmlSkills} setHtmlSkills={setHtmlSkills} setHtmlSearch={setHtmlSearch}
          draft={draft} setDraft={setDraft} autoResize={autoResize} send={send} stopStream={stopStream} streaming={streaming} thinking={thinking}
          isVisionModel={isVisionModel} activeModel={activeModel} visionImage={visionImage} setVisionImage={setVisionImage}
          confMode={confMode} setConfMode={setConfMode}
          providers={D.providers} providerSel={providerSel} setProviderSel={setProviderSel}
          activeProvider={activeProvider} pickModel={pickModel} modelOptions={modelOptions}
          localStatus={localStatus}
        />

        <ModelCapabilityHint activeModel={activeModel} />
      </div>

      {artifact
        ? <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} />
        : <ContextPanel />
      }

      {showOnboarding && (
        <OnboardingOverlay onDone={() => {
          localStorage.setItem(ONBOARDED_KEY, "1");
          setShowOnboarding(false);
        }} />
      )}
    </div>
  );
}
