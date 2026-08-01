// Yana AI — Chat: conversation-history sidebar + its localStorage-backed list
import React from 'react';
import { L } from '../../components.jsx';

const CONV_LIST_KEY = "yana.convlist";

export function loadConvList() {
  try { return JSON.parse(localStorage.getItem(CONV_LIST_KEY)) || []; }
  catch (_) { return []; }
}

export function saveConvList(list) {
  try { localStorage.setItem(CONV_LIST_KEY, JSON.stringify(list)); } catch (_) {}
}

export function convFromMsgs(msgs) {
  // Bug fix: messages use `.who` ("user"/"yana") everywhere else in the
  // app (use-chat-send.js, message.jsx) — this used to check `.role`,
  // which chat messages never set, so every saved title silently fell
  // back to the generic "Chat" placeholder and every restored message
  // lost its `.who`, breaking user/assistant bubble rendering on reload.
  const firstUser = msgs.find(m => m.who === "user");
  const title = firstUser
    ? firstUser.text.slice(0, 60).replace(/\n/g, " ")
    : L("Chat", "Trò chuyện", "채팅", "聊天");
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    title,
    ts: Date.now(),
    msgs: msgs.filter(m => !m.confidential).slice(-40).map(m => ({
      _id: m._id, who: m.who, text: m.text, route: m.route,
    })),
  };
}

// Cross-conversation search: full conversation content already lives in
// `list` (localStorage, see convFromMsgs above) — no server round-trip
// needed, unlike the in-conversation search in message-log.jsx which only
// ever searches the one open conversation.
function matchesQuery(conv, q) {
  if (conv.title.toLowerCase().includes(q)) return true;
  return (conv.msgs || []).some(m => m.text && m.text.toLowerCase().includes(q));
}

export function ConvSidebar({ list, onLoad, onDelete, onClose }) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const filtered = q ? list.filter(conv => matchesQuery(conv, q)) : list;

  return (
    <div className="glass" style={{
      width: 220, flex: "none", borderRadius: "var(--r-lg)", padding: 10,
      display: "flex", flexDirection: "column", gap: 2,
      overflowY: "auto", minHeight: 0,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: "var(--ink-3)",
        letterSpacing: ".07em", textTransform: "uppercase",
        padding: "4px 7px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        {L("History", "Lịch sử", "기록", "历史记录")}
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 17, lineHeight: 1, padding: "0 3px" }}>×</button>
      </div>
      {list.length > 0 && (
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={L("Search all conversations…", "Tìm trong mọi cuộc trò chuyện…", "모든 대화에서 검색…", "在所有对话中搜索…")}
          style={{
            width: "100%", boxSizing: "border-box", margin: "0 0 8px", padding: "6px 10px",
            borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-bg)",
            color: "var(--color-text)", fontSize: 12, fontFamily: "inherit", outline: "none",
          }} />
      )}
      {list.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", padding: "20px 8px", lineHeight: 1.6 }}>
          {L("Past conversations appear here after you start a new chat.", "Các cuộc trò chuyện cũ xuất hiện ở đây sau khi bạn tạo chat mới.", "새 채팅을 시작하면 지난 대화가 여기에 표시됩니다.", "开始新对话后，历史对话会显示在这里。")}
        </div>
      )}
      {list.length > 0 && filtered.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", padding: "20px 8px", lineHeight: 1.6 }}>
          {L("No conversations match your search.", "Không tìm thấy cuộc trò chuyện nào.", "검색과 일치하는 대화가 없습니다.", "没有匹配的对话。")}
        </div>
      )}
      {filtered.map(conv => (
        <div key={conv.id} style={{ position: "relative", borderRadius: 9 }}>
          <button onClick={() => onLoad(conv)} style={{
            width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer",
            padding: "8px 30px 8px 9px", borderRadius: 9, color: "var(--ink)", fontFamily: "inherit",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--primary-soft)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
          >
            <div style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.35 }}>
              {conv.title}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>
              {new Date(conv.ts).toLocaleDateString()} · {conv.msgs.length} {L("msgs", "tin", "개 메시지", "条消息")}
            </div>
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
            title={L("Delete", "Xóa", "삭제", "删除")}
            style={{
              position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)",
              fontSize: 14, padding: "3px 5px", lineHeight: 1, borderRadius: 5,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "rgba(239,68,68,.1)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--ink-3)"; e.currentTarget.style.background = "none"; }}
          >×</button>
        </div>
      ))}
    </div>
  );
}
