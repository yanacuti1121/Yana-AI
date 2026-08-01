// Yana AI — Chat: the user message bubble, including edit-and-resend.
// Split out of message.jsx purely to keep that file under the 300-line
// limit — Message still owns the assistant-message branch.
import React from 'react';
import { L, Icons } from '../../components.jsx';
import { ConfidentialBadge } from './badges.jsx';

export function UserMessage({ msg, msgIndex, onEdit }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(msg.text);
  const taRef = React.useRef(null);

  React.useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      taRef.current.style.height = "auto";
      taRef.current.style.height = taRef.current.scrollHeight + "px";
    }
  }, [editing]);

  function startEdit() {
    setDraft(msg.text);
    setEditing(true);
  }

  function save() {
    const text = draft.trim();
    setEditing(false);
    // Editing invalidates everything after this turn — onEdit truncates
    // the conversation at msgIndex and resends, same as Regenerate does
    // for the last turn, just at an arbitrary earlier point.
    if (text && text !== msg.text) onEdit(msgIndex, text);
  }

  const userName  = localStorage.getItem("yana.about.who") || "You";
  const avatarUrl = localStorage.getItem("yana.avatar-url");
  const initial   = (userName[0] || "?").toUpperCase();

  return (
    <div className="msg-in msg-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <div className="msg-edit-row" style={{ display: "flex", alignItems: "flex-end", gap: 8, justifyContent: "flex-end" }}>
        {!editing && onEdit && (
          <button onClick={startEdit} className="msg-edit-btn" title={L("Edit", "Sửa", "수정", "编辑")} style={{
            width: 24, height: 24, borderRadius: 6, border: "1px solid var(--color-border)",
            background: "var(--color-bg)", color: "var(--color-text-muted)", cursor: "pointer",
            display: "grid", placeItems: "center", flexShrink: 0, alignSelf: "center",
          }}>{Icons.pencil(12)}</button>
        )}
        {editing ? (
          <div style={{ maxWidth: "72%", minWidth: 240, display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea ref={taRef} value={draft} rows={1}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
                if (e.key === "Escape") setEditing(false);
              }}
              style={{
                width: "100%", boxSizing: "border-box", resize: "none", maxHeight: 200, overflowY: "auto",
                padding: "10px 15px", borderRadius: "16px 16px 4px 16px", border: "1px solid var(--color-primary)",
                background: "var(--color-bg)", color: "var(--color-text)", fontSize: 13.8, lineHeight: 1.55,
                fontFamily: "inherit", outline: "none",
              }} />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(false)} style={{
                border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text-muted)",
                borderRadius: 99, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>{L("Cancel", "Huỷ", "취소", "取消")}</button>
              <button onClick={save} style={{
                border: "none", background: "var(--color-primary)", color: "#fff",
                borderRadius: 99, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>{L("Save & resend", "Lưu & gửi lại", "저장 후 재전송", "保存并重新发送")}</button>
            </div>
          </div>
        ) : (
          <div style={{
            maxWidth: "72%", padding: "10px 15px", borderRadius: "16px 16px 4px 16px",
            background: "var(--primary)", color: "rgba(255,255,255,.96)",
            fontSize: 13.8, lineHeight: 1.55,
            boxShadow: "0 4px 14px color-mix(in oklab, var(--primary) 25%, transparent)",
            ...(msg.confidential ? { border: "1px dashed rgba(255,255,255,.55)" } : {}),
          }}>{msg.text}</div>
        )}
        {avatarUrl
          ? <img src={avatarUrl} alt={userName} style={{ width: 28, height: 28, borderRadius: 99, objectFit: "cover", flex: "none", boxShadow: "0 2px 8px rgba(0,0,0,.15)" }} />
          : <div style={{ width: 28, height: 28, borderRadius: 99, flex: "none", background: "var(--primary)", color: "white", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center", boxShadow: "0 2px 8px color-mix(in oklab, var(--primary) 35%, transparent)" }}>{initial}</div>
        }
      </div>
      {msg.confidential && <ConfidentialBadge tier={msg.tier} />}
    </div>
  );
}
