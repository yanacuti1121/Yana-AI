// Yana AI — Settings: Data Management card
import React from 'react';
import { L, Card } from '../../../components.jsx';

export function DataManagementCard() {
  const [exporting, setExporting] = React.useState(false);
  const [confirm, setConfirm] = React.useState(null); // "clear-chat" | "reset"
  const [done, setDone] = React.useState(null);

  async function exportData() {
    setExporting(true);
    try {
      const [memRes, usageRes] = await Promise.all([
        fetch("/api/memories").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/usage").then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      // Collect all yana.* localStorage keys
      const settings = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("yana.")) settings[k] = localStorage.getItem(k);
      }

      const payload = {
        exported_at: new Date().toISOString(),
        version: window.YANA.version || "unknown",
        settings,
        memories: memRes ? memRes.memories : [],
        usage: usageRes ? usageRes.usage : {},
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "yana-ai-export-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(url);
      setDone("export");
      setTimeout(() => setDone(null), 2500);
    } catch (_) {}
    setExporting(false);
  }

  function clearChat() {
    window.YANA.chat = [];
    window.dispatchEvent(new Event("yana:data"));
    setConfirm(null);
    setDone("clear");
    setTimeout(() => setDone(null), 2000);
  }

  function resetAll() {
    // Remove all yana.* keys except member-since
    const keep = ["yana.member-since"];
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("yana.") && !keep.includes(k)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    setConfirm(null);
    setDone("reset");
    setTimeout(() => window.location.reload(), 1200);
  }

  const btnBase = {
    display: "flex", alignItems: "center", gap: 7, padding: "8px 16px",
    borderRadius: 99, fontSize: 12.5, fontWeight: 500, fontFamily: "inherit",
    cursor: "pointer", border: "1px solid var(--border)", transition: "background .15s",
  };

  return (
    <Card title={L("Data Management", "Quản lý dữ liệu", "데이터 관리", "数据管理")}>
      {/* Export */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Export data", "Xuất dữ liệu", "데이터 내보내기", "导出数据")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {L("Download all settings, memories and usage as JSON", "Tải về cài đặt, ký ức và lịch sử dùng dạng JSON", "모든 설정, 메모리, 사용량을 JSON으로 다운로드", "以 JSON 格式下载所有设置、记忆和使用记录")}
          </div>
        </div>
        <button onClick={exportData} disabled={exporting} style={{ ...btnBase, background: "transparent", color: "var(--primary)" }}>
          {done === "export" ? "✓ " + L("Downloaded", "Đã tải", "다운로드됨", "已下载") : exporting ? L("Exporting…", "Đang xuất…", "내보내는 중…", "导出中…") : "↓ " + L("Export", "Xuất", "내보내기", "导出")}
        </button>
      </div>

      {/* Clear chat */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Clear chat history", "Xóa lịch sử trò chuyện", "채팅 기록 지우기", "清除聊天记录")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {L("Remove all messages from the current session", "Xóa tất cả tin nhắn trong phiên hiện tại", "현재 세션의 모든 메시지 삭제", "删除当前会话中的所有消息")}
          </div>
        </div>
        {confirm === "clear-chat" ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={clearChat} style={{ ...btnBase, background: "var(--color-destructive)", color: "#fff", border: "none" }}>
              {L("Confirm", "Xác nhận", "확인", "确认")}
            </button>
            <button onClick={() => setConfirm(null)} style={{ ...btnBase, background: "transparent", color: "var(--ink-3)" }}>
              {L("Cancel", "Huỷ", "취소", "取消")}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirm("clear-chat")} style={{ ...btnBase, background: "transparent", color: done === "clear" ? "var(--good)" : "var(--ink-2)" }}>
            {done === "clear" ? "✓ " + L("Cleared", "Đã xóa", "삭제됨", "已清除") : L("Clear", "Xóa", "지우기", "清除")}
          </button>
        )}
      </div>

      {/* Reset all */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, paddingTop: "calc(11px * var(--sp))" }}>
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Reset to defaults", "Khôi phục mặc định", "기본값으로 재설정", "恢复默认设置")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {L("Wipe all settings and reload — API keys are preserved", "Xóa toàn bộ cài đặt và tải lại — API key vẫn giữ nguyên", "모든 설정을 초기화 후 새로고침 — API 키는 유지됨", "清除所有设置并重新加载 — API 密钥保留")}
          </div>
        </div>
        {confirm === "reset" ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={resetAll} style={{ ...btnBase, background: "var(--color-destructive)", color: "#fff", border: "none" }}>
              {done === "reset" ? L("Resetting…", "Đang khôi phục…", "재설정 중…", "重置中…") : L("Confirm reset", "Xác nhận", "재설정 확인", "确认重置")}
            </button>
            <button onClick={() => setConfirm(null)} style={{ ...btnBase, background: "transparent", color: "var(--ink-3)" }}>
              {L("Cancel", "Huỷ", "취소", "取消")}
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirm("reset")} style={{ ...btnBase, background: "transparent", color: "var(--ink-2)" }}>
            {L("Reset", "Khôi phục", "재설정", "重置")}
          </button>
        )}
      </div>
    </Card>
  );
}
