// Yana AI — Chat: page header (title + history/search/new-conversation buttons)
import React from 'react';
import { L, PageHeader, Icons } from '../../components.jsx';

export function ChatHeader({ sidebarOpen, toggleSidebar, msgSearch, setMsgSearch, newConversation }) {
  return (
    <PageHeader title={L("Conversation", "Trò chuyện", "대화", "对话")} sub={L("One conversation, many hands — Yana routes each request to the right agent.", "Một cuộc trò chuyện, nhiều bàn tay — Yana chuyển mỗi yêu cầu đến đúng tác nhân.", "하나의 대화, 여러 손 — Yana가 각 요청을 알맞은 에이전트로 전달합니다.", "一场对话，多方协作 — Yana 将每个请求路由给合适的智能体。")}>
      <button
        onClick={toggleSidebar}
        title={L("Conversation history", "Lịch sử trò chuyện", "대화 기록", "对话历史")}
        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 10, border: "1px solid var(--border)", background: sidebarOpen ? "var(--primary-soft)" : "transparent", color: sidebarOpen ? "var(--primary)" : "var(--ink-3)", cursor: "pointer", fontSize: 14, fontFamily: "inherit", flex: "none" }}>
        ☰
      </button>
      <button
        onClick={() => setMsgSearch(s => s === null ? "" : null)}
        title={L("Search conversation", "Tìm trong cuộc trò chuyện", "대화 검색", "搜索对话")}
        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 10, border: "1px solid var(--border)", background: msgSearch !== null ? "var(--primary-soft)" : "transparent", color: msgSearch !== null ? "var(--primary)" : "var(--ink-3)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", flex: "none" }}>
        🔍
      </button>
      <button
        onClick={newConversation}
        title={L("New conversation", "Cuộc trò chuyện mới", "새 대화", "新建对话")}
        style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", flex: "none" }}>
        {Icons.pencil(14)} {L("New", "Mới", "새로 만들기", "新建")}
      </button>
    </PageHeader>
  );
}
