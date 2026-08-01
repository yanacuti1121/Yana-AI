// Yana AI — Chat: message history + conversation-list persistence.
import React from 'react';
import { loadConvList, saveConvList, convFromMsgs } from './conv-sidebar.jsx';

const CHAT_STORE = "yana.chat";

function loadChatHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_STORE));
    if (Array.isArray(saved)) return saved;
  } catch (_) {}
  return window.YANA.chat;
}

export function useChatHistory() {
  const D = window.YANA;
  const [msgs, setMsgs] = React.useState(loadChatHistory);
  const [convList, setConvList] = React.useState(loadConvList);
  const [sidebarOpen, setSidebarOpen] = React.useState(() => localStorage.getItem("yana.sidebar") === "1");

  // Persist the real conversation: across navigation AND reloads (last 60 turns).
  // Confidential turns live in memory only (rule 68) — they survive navigation
  // within this session via D.chat but are never written to localStorage.
  React.useEffect(() => {
    D.chat = msgs;
    try {
      localStorage.setItem(CHAT_STORE, JSON.stringify(msgs.filter((m) => !m.confidential).slice(-60)));
    } catch (_) {}
  }, [msgs]);

  function toggleSidebar() {
    setSidebarOpen(v => {
      const next = !v;
      localStorage.setItem("yana.sidebar", next ? "1" : "0");
      return next;
    });
  }

  function newConversation() {
    if (msgs.length > 0) {
      const entry = convFromMsgs(msgs);
      const updated = [entry, ...convList].slice(0, 30);
      setConvList(updated);
      saveConvList(updated);
    }
    setMsgs([]);
    D.chat = [];
    try { localStorage.removeItem(CHAT_STORE); } catch (_) {}
  }

  function loadConversation(conv) {
    if (msgs.length > 0) {
      const entry = convFromMsgs(msgs);
      const updated = [entry, ...convList.filter(c => c.id !== conv.id)].slice(0, 30);
      setConvList(updated);
      saveConvList(updated);
    } else {
      const updated = convList.filter(c => c.id !== conv.id);
      setConvList(updated);
      saveConvList(updated);
    }
    setMsgs(conv.msgs || []);
    D.chat = conv.msgs || [];
  }

  function deleteConversation(id) {
    const updated = convList.filter(c => c.id !== id);
    setConvList(updated);
    saveConvList(updated);
  }

  return { msgs, setMsgs, convList, sidebarOpen, toggleSidebar, newConversation, loadConversation, deleteConversation };
}
