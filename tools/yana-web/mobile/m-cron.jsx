// Yana Mobile — Cron: scheduled AI jobs
const { useState: useStateMC, useEffect: useEffectMC } = React;

const MC_SCHEDULE_PRESETS = [
  { label: L("Every hour", "Mỗi giờ"),       value: "0 * * * *"   },
  { label: L("Every 6 hours", "Mỗi 6 giờ"),  value: "0 */6 * * *" },
  { label: L("Every day", "Mỗi ngày"),        value: "0 9 * * *"   },
  { label: L("Every Monday", "Mỗi thứ Hai"), value: "0 9 * * 1"   },
  { label: L("Every week", "Mỗi tuần"),       value: "0 9 * * 0"   },
  { label: L("Custom", "Tùy chỉnh"),          value: "custom"      },
];

const MC_PROVIDERS = ["anthropic", "openai", "gemini", "groq", "openrouter", "9router",
  "xai", "novita", "nvidia", "kimi", "minimax", "glm", "huggingface"];

function mcFmtTs(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function mcHumanSchedule(cron) {
  const preset = MC_SCHEDULE_PRESETS.find(p => p.value === cron && p.value !== "custom");
  if (preset) return preset.label;
  return cron;
}

function MCJobForm({ onSave, onCancel }) {
  const [name, setName]         = useStateMC("");
  const [schedulePreset, setSP] = useStateMC(MC_SCHEDULE_PRESETS[2].value);
  const [customCron, setCC]     = useStateMC("0 9 * * *");
  const [prompt, setPrompt]     = useStateMC("");
  const [provider, setProvider] = useStateMC("anthropic");
  const [saving, setSaving]     = useStateMC(false);
  const [err, setErr]           = useStateMC("");

  const schedule = schedulePreset === "custom" ? customCron : schedulePreset;

  function submit() {
    if (!name.trim() || !prompt.trim()) { setErr(L("Name and prompt are required.", "Tên và prompt là bắt buộc.")); return; }
    setSaving(true); setErr("");
    fetch("/api/cron", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), schedule, prompt: prompt.trim(), provider }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setSaving(false); onSave(d); })
      .catch(() => { setSaving(false); setErr(L("Failed to save.", "Lưu thất bại.")); });
  }

  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{L("New scheduled job", "Tạo công việc mới")}</div>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>{L("Job name", "Tên công việc")}</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={L("Daily summary", "Tóm tắt hàng ngày")}
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--glass-border)", background: "rgba(var(--shadow-rgb),.05)", fontSize: 14, color: "var(--ink)", outline: "none" }} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>{L("Schedule", "Lịch chạy")}</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MC_SCHEDULE_PRESETS.map(p => (
            <button key={p.value} onClick={() => setSP(p.value)} style={{
              padding: "6px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12,
              background: schedulePreset === p.value ? "var(--primary)" : "rgba(var(--shadow-rgb),.08)",
              color: schedulePreset === p.value ? "white" : "var(--ink-2)",
            }}>{p.label}</button>
          ))}
        </div>
        {schedulePreset === "custom" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input value={customCron} onChange={e => setCC(e.target.value)} placeholder="0 9 * * *"
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--glass-border)", background: "rgba(var(--shadow-rgb),.05)", fontSize: 14, color: "var(--ink)", outline: "none", fontFamily: "var(--font-mono, monospace)" }} />
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>min hour day month weekday</span>
          </div>
        )}
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>{L("Provider", "Nhà cung cấp")}</span>
        <select value={provider} onChange={e => setProvider(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--glass-border)", background: "rgba(var(--shadow-rgb),.05)", fontSize: 14, color: "var(--ink)", outline: "none" }}>
          {MC_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>{L("Prompt", "Prompt")}</span>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
          placeholder={L("Summarize today's project activity and highlight any blockers.", "Tóm tắt hoạt động dự án hôm nay và nêu bật các vướng mắc.")}
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--glass-border)", background: "rgba(var(--shadow-rgb),.05)", fontSize: 14, color: "var(--ink)", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
      </label>

      {err && <div style={{ fontSize: 12.5, color: "var(--warn, #e53)" }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{
          padding: "8px 16px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13,
          background: "rgba(var(--shadow-rgb),.08)", color: "var(--ink-2)",
        }}>{L("Cancel", "Hủy")}</button>
        <button onClick={submit} disabled={saving} style={{
          padding: "8px 18px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13,
          background: "var(--primary)", color: "white", opacity: saving ? 0.6 : 1,
        }}>{saving ? L("Saving…", "Đang lưu…") : L("Save", "Lưu")}</button>
      </div>
    </div>
  );
}

function MCJobRow({ job, onToggle, onDelete }) {
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <button onClick={() => onToggle(job.id, !job.active)}
        title={job.active ? L("Disable", "Tắt") : L("Enable", "Bật")}
        style={{
          width: 34, height: 20, borderRadius: 10, border: "none", cursor: "pointer", flex: "none", marginTop: 2,
          background: job.active ? "var(--primary)" : "rgba(var(--shadow-rgb),.2)",
          position: "relative", transition: "background .2s",
        }}>
        <span style={{
          position: "absolute", top: 3, left: job.active ? 16 : 3,
          width: 14, height: 14, borderRadius: "50%", background: "white",
          transition: "left .2s",
        }} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 500, fontSize: 13.5 }}>{job.name}</span>
          <span className="chip neutral" style={{ fontSize: 10.5, fontFamily: "monospace" }}>{mcHumanSchedule(job.schedule)}</span>
          <span className="chip" style={{ fontSize: 10.5 }}>{job.provider}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {job.prompt}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span>{L("Runs:", "Đã chạy:")} {job.runCount || 0}</span>
          {job.lastRun && <span>{L("Last:", "Lần cuối:")} {mcFmtTs(job.lastRun)}</span>}
          {!job.active && <span style={{ color: "var(--warn, #e80)" }}>{L("Paused", "Đã tắt")}</span>}
        </div>
      </div>

      <button onClick={() => onDelete(job.id)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, flex: "none", fontSize: 16, lineHeight: 1 }}>✕</button>
    </div>
  );
}

function MCron() {
  const [jobs, setJobs]     = useStateMC(null);
  const [adding, setAdding] = useStateMC(false);

  function load() {
    fetch("/api/cron")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setJobs(d.jobs); })
      .catch(() => {});
  }
  useEffectMC(() => { load(); }, []);

  function toggle(id, active) {
    fetch("/api/cron/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    }).then(() => setJobs(prev => prev.map(j => j.id === id ? { ...j, active } : j)));
  }

  function del(id) {
    fetch("/api/cron/" + id, { method: "DELETE" })
      .then(() => setJobs(prev => prev.filter(j => j.id !== id)));
  }

  return (
    <div data-screen-label="Cron" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <MHead title={L("Scheduled Jobs", "Công việc tự động")} sub={L("Define prompts that run on a schedule via the Yana server", "Định nghĩa prompt chạy tự động theo lịch qua Yana server")}>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            padding: "7px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12.5, flex: "none",
            background: "var(--primary)", color: "white",
          }}>+ {L("New", "Tạo mới")}</button>
        )}
      </MHead>

      {adding && (
        <MCJobForm
          onSave={() => { setAdding(false); load(); }}
          onCancel={() => setAdding(false)} />
      )}

      <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "10px 14px", fontSize: 12, color: "var(--ink-2)", display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ flex: "none", marginTop: 1 }}>ℹ️</span>
        <span>
          {L(
            "Jobs are stored and displayed here. To execute them automatically, run the Yana cron runner: ",
            "Công việc được lưu và hiển thị tại đây. Để chạy tự động, khởi động Yana cron runner: "
          )}
          <code style={{ fontFamily: "monospace", background: "rgba(var(--shadow-rgb),.06)", padding: "1px 6px", borderRadius: 4 }}>
            node tools/yana-web/cron-runner.js
          </code>
        </span>
      </div>

      {jobs === null && (
        <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{L("Loading…", "Đang tải…")}</div>
      )}
      {jobs !== null && jobs.length === 0 && !adding && (
        <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
          {L("No jobs yet. Create one to get started.", "Chưa có công việc nào. Tạo mới để bắt đầu.")}
        </div>
      )}
      {(jobs || []).map(j => (
        <MCJobRow key={j.id} job={j} onToggle={toggle} onDelete={del} />
      ))}
    </div>
  );
}

Object.assign(window, { MCron });
