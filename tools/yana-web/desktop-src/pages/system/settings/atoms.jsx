// Yana AI — small reusable Settings-page form atoms.
// Grouped here (rather than inside one specific card file) because each of
// these is used by 2+ places: SettingRow and ToggleRow are used directly by
// the Settings shell AND by individual cards; YSwitch/YSeg are used across
// AppearanceCard, VoiceCard, ModelParamsCard, and ToggleRow itself.
import React from 'react';
import { L } from '../../../components.jsx';

export function SettingRow({ label, desc, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{desc}</div>}
      </div>
      <span className="chip neutral" style={{ flex: "none" }}>{value}</span>
    </div>
  );
}

export function YSwitch({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} aria-pressed={value} style={{
      width: 40, height: 24, borderRadius: 99, border: "none", cursor: "pointer", flex: "none",
      background: value ? "var(--primary)" : "rgba(var(--shadow-rgb), .15)",
      position: "relative", transition: "background .18s",
    }}>
      <span style={{
        position: "absolute", top: 2, left: value ? 18 : 2, width: 20, height: 20, borderRadius: "50%",
        background: "white", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left .18s",
      }}></span>
    </button>
  );
}

export function YSeg({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "rgba(var(--shadow-rgb), .07)" }}>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} style={{
          padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5,
          fontWeight: value === o ? 500 : 400,
          background: value === o ? "rgba(var(--surface-rgb), .95)" : "transparent",
          boxShadow: value === o ? "0 1px 3px rgba(var(--shadow-rgb), .15)" : "none",
          color: "var(--ink)", transition: "background .15s",
        }}>{o}</button>
      ))}
    </div>
  );
}

// localStorage-persisted toggle row
export function ToggleRow({ label, desc, storeKey, defaultVal }) {
  const [v, setV] = React.useState(() => {
    const s = localStorage.getItem(storeKey);
    return s !== null ? s !== "false" : defaultVal;
  });
  function toggle(next) {
    setV(next);
    localStorage.setItem(storeKey, next);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key: storeKey, value: next } }));
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{desc}</div>}
      </div>
      <YSwitch value={v} onChange={toggle} />
    </div>
  );
}

// Editable text row — click ✎ to rename, persisted in localStorage
export function EditableRow({ label, desc, storeKey, fallback }) {
  const [v, setV] = React.useState(() => localStorage.getItem(storeKey) || fallback);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(v);
  const inputRef = React.useRef(null);

  function startEdit() {
    setDraft(v);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 20);
  }
  function save() {
    const next = draft.trim() || fallback;
    setV(next);
    localStorage.setItem(storeKey, next);
    window.dispatchEvent(new CustomEvent("yana-setting", { detail: { key: storeKey, value: next } }));
    setEditing(false);
  }
  function handleKeyDown(e) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{desc}</div>}
      </div>
      {editing ? (
        <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown} onBlur={save}
          style={{
            fontSize: 12, padding: "4px 10px", borderRadius: 8, fontFamily: "inherit",
            border: "1.5px solid var(--primary)", background: "var(--surface)",
            color: "var(--ink)", outline: "none", width: 160,
          }} />
      ) : (
        <button onClick={startEdit} title={L("Click to edit", "Nhấn để sửa", "클릭하여 수정", "点击编辑")} style={{
          background: "none", border: "1px solid var(--border)", padding: "4px 12px",
          borderRadius: 99, cursor: "pointer", fontSize: 12, color: "var(--primary)",
          fontWeight: 500, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
        }}>{v} <span style={{ fontSize: 10, opacity: .6 }}>✎</span></button>
      )}
    </div>
  );
}

export function detectTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const offMin = -new Date().getTimezoneOffset();
    const sign = offMin >= 0 ? "+" : "−";
    const hours = Math.floor(Math.abs(offMin) / 60);
    const mins = Math.abs(offMin) % 60;
    return "GMT" + sign + hours + (mins ? ":" + String(mins).padStart(2, "0") : "") + " · " + tz.split("/").pop().replace(/_/g, " ");
  } catch (_) { return "UTC"; }
}
