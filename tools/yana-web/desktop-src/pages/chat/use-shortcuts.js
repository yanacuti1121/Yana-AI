// Yana AI — Chat: keyboard shortcuts. Scoped to Chat only (Cmd/Ctrl+K,
// Cmd/Ctrl+N) — Claude/ChatGPT put these on the chat surface, not
// app-wide, so this hook is only mounted by pages/chat.jsx.
import React from 'react';

export function useChatShortcuts({ toggleSearch, newConversation }) {
  React.useEffect(() => {
    function onKeyDown(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Don't hijack the browser's own Cmd/Ctrl+K/N inside an editable
      // field that isn't the chat's own search/composer (e.g. a text
      // input in a settings modal stacked on top) — chat shortcuts should
      // still fire from the composer itself, so only bail on other inputs.
      const tag = document.activeElement?.tagName;
      const inForeignField = (tag === "INPUT" || tag === "TEXTAREA")
        && !document.activeElement.closest('[data-screen-label="Chat"]');
      if (inForeignField) return;

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        toggleSearch();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        newConversation();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSearch, newConversation]);
}
