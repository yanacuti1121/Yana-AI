// Yana AI — Chat: HTML template quick-picker (the "</>" button's popover)
import React from 'react';
import { L } from '../../components.jsx';

export function HtmlTemplatePicker({ htmlSkills, htmlSearch, setHtmlSearch, setHtmlPicker, setDraft }) {
  return (
    <div className="glass-strong" style={{ borderRadius: "var(--r-lg)", padding: 10, display: "flex", flexDirection: "column", gap: 8, flex: "none", maxHeight: 260 }}>
      <input
        autoFocus
        value={htmlSearch}
        onChange={(e) => setHtmlSearch(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { setHtmlPicker(false); setHtmlSearch(""); } }}
        placeholder={L("Search templates…", "Tìm template…", "템플릿 검색…", "搜索模板…")}
        style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontFamily: "inherit", background: "transparent", color: "var(--ink)", outline: "none", flex: "none" }}
      />
      <div style={{ overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 5 }}>
        {htmlSkills.length === 0
          ? <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Loading…", "Đang tải…", "불러오는 중…", "加载中…")}</span>
          : htmlSkills
              .filter((s) => {
                if (!htmlSearch) return true;
                const q = htmlSearch.toLowerCase();
                return (s.enName || s.id).toLowerCase().includes(q) || (s.category || "").toLowerCase().includes(q);
              })
              .map((s) => (
                <button key={s.id}
                  onClick={() => {
                    setDraft((d) => (d ? d + " " : "") + (s.enName || s.id) + ": ");
                    setHtmlPicker(false);
                    setHtmlSearch("");
                  }}
                  style={{ padding: "4px 11px", borderRadius: 99, border: "1px solid var(--border)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                  {s.enName || s.id}
                </button>
              ))
        }
      </div>
    </div>
  );
}
