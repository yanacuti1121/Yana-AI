// Yana — Cron page: scheduled AI jobs

const { useState, useEffect } = React;

const SCHEDULE_PRESETS = [
  { label: L("Every hour", "Mỗi giờ", "매시간", "每小时"),       value: "0 * * * *"   },
  { label: L("Every 6 hours", "Mỗi 6 giờ", "6시간마다", "每 6 小时"),  value: "0 */6 * * *" },
  { label: L("Every day", "Mỗi ngày", "매일", "每天"),        value: "0 9 * * *"   },
  { label: L("Every Monday", "Mỗi thứ Hai", "매주 월요일", "每周一"), value: "0 9 * * 1"   },
  { label: L("Every week", "Mỗi tuần", "매주", "每周"),       value: "0 9 * * 0"   },
  { label: L("Custom", "Tùy chỉnh", "사용자 지정", "自定义"),          value: "custom"      },
];

const PROVIDERS = ["anthropic", "openai", "gemini", "groq", "openrouter", "9router",
  "xai", "novita", "nvidia", "kimi", "minimax", "glm", "huggingface"];

function fmtTs(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function humanSchedule(cron) {
  const preset = SCHEDULE_PRESETS.find(p => p.value === cron && p.value !== "custom");
  if (preset) return preset.label;
  return cron;
}

function JobForm({ onSave, onCancel }) {
  const [name, setName]         = useState("");
  const [schedulePreset, setSP] = useState(SCHEDULE_PRESETS[2].value);
  const [customCron, setCC]     = useState("0 9 * * *");
  const [prompt, setPrompt]     = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  const schedule = schedulePreset === "custom" ? customCron : schedulePreset;

  function submit() {
    if (!name.trim() || !prompt.trim()) { setErr(L("Name and prompt are required.", "Tên và prompt là bắt buộc.", "이름과 프롬프트는 필수입니다.", "名称和提示词为必填项。")); return; }
    setSaving(true); setErr("");
    fetch("/api/cron", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), schedule, prompt: prompt.trim(), provider }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setSaving(false); onSave(d); })
      .catch(() => { setSaving(false); setErr(L("Failed to save.", "Lưu thất bại.", "저장에 실패했습니다.", "保存失败。")); });
  }

  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{L("New scheduled job", "Tạo công việc mới", "새 예약 작업", "新建计划任务")}</div>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>{L("Job name", "Tên công việc", "작업 이름", "任务名称")}</span>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={L("Daily summary", "Tóm tắt hàng ngày", "일일 요약", "每日摘要")}
          style={{ padding: "7px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--glass-border)", background: "rgba(var(--shadow-rgb),.05)", fontSize: 13, color: "var(--ink)", outline: "none" }} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>{L("Schedule", "Lịch chạy", "일정", "计划")}</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SCHEDULE_PRESETS.map(p => (
            <button key={p.value} onClick={() => setSP(p.value)} style={{
              padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12,
              background: schedulePreset === p.value ? "var(--primary)" : "rgba(var(--shadow-rgb),.08)",
              color: schedulePreset === p.value ? "white" : "var(--ink-2)",
            }}>{p.label}</button>
          ))}
        </div>
        {schedulePreset === "custom" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input value={customCron} onChange={e => setCC(e.target.value)} placeholder="0 9 * * *"
              style={{ padding: "7px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--glass-border)", background: "rgba(var(--shadow-rgb),.05)", fontSize: 13, color: "var(--ink)", outline: "none", fontFamily: "var(--font-mono, monospace)" }} />
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>min hour day month weekday</span>
          </div>
        )}
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>{L("Provider", "Nhà cung cấp", "프로바이더", "提供商")}</span>
        <select value={provider} onChange={e => setProvider(e.target.value)}
          style={{ padding: "7px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--glass-border)", background: "rgba(var(--shadow-rgb),.05)", fontSize: 13, color: "var(--ink)", outline: "none" }}>
          {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>{L("Prompt", "Prompt", "프롬프트", "提示词")}</span>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
          placeholder={L("Summarize today's project activity and highlight any blockers.", "Tóm tắt hoạt động dự án hôm nay và nêu bật các vướng mắc.", "오늘의 프로젝트 활동을 요약하고 막힌 부분을 강조하세요.", "总结今天的项目动态并标出任何阻碍。")}
          style={{ padding: "8px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--glass-border)", background: "rgba(var(--shadow-rgb),.05)", fontSize: 13, color: "var(--ink)", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
      </label>

      {err && <div style={{ fontSize: 12.5, color: "var(--warn, #e53)" }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{
          padding: "7px 16px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13,
          background: "rgba(var(--shadow-rgb),.08)", color: "var(--ink-2)",
        }}>{L("Cancel", "Hủy", "취소", "取消")}</button>
        <button onClick={submit} disabled={saving} style={{
          padding: "7px 18px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13,
          background: "var(--primary)", color: "white", opacity: saving ? 0.6 : 1,
        }}>{saving ? L("Saving…", "Đang lưu…", "저장 중…", "保存中…") : L("Save", "Lưu", "저장", "保存")}</button>
      </div>
    </div>
  );
}

function JobRow({ job, onToggle, onDelete }) {
  return (
    <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
      {/* Active toggle */}
      <button onClick={() => onToggle(job.id, !job.active)}
        title={job.active ? L("Disable", "Tắt", "비활성화", "禁用") : L("Enable", "Bật", "활성화", "启用")}
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
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontWeight: 500, fontSize: 13.5 }}>{job.name}</span>
          <span className="chip neutral" style={{ fontSize: 11, fontFamily: "monospace" }}>{humanSchedule(job.schedule)}</span>
          <span className="chip" style={{ fontSize: 11 }}>{job.provider}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {job.prompt}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 5, display: "flex", gap: 12 }}>
          <span>{L("Runs:", "Đã chạy:", "실행 횟수:", "运行次数：")} {job.runCount || 0}</span>
          {job.lastRun && <span>{L("Last:", "Lần cuối:", "마지막:", "上次：")} {fmtTs(job.lastRun)}</span>}
          {!job.active && <span style={{ color: "var(--warn, #e80)" }}>{L("Paused", "Đã tắt", "일시정지됨", "已暂停")}</span>}
        </div>
      </div>

      <button onClick={() => onDelete(job.id)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, flex: "none", fontSize: 16, lineHeight: 1 }}>✕</button>
    </div>
  );
}

function Cron() {
  const [jobs, setJobs]     = useState(null);
  const [adding, setAdding] = useState(false);

  function load() {
    fetch("/api/cron")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setJobs(d.jobs); })
      .catch(() => {});
  }
  useEffect(() => { load(); }, []);

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
    <div data-screen-label="Cron">
      <PageHeader
        title={L("Scheduled Jobs", "Công việc tự động", "예약된 작업", "计划任务")}
        sub={L("Define prompts that run on a schedule via the Yana server", "Định nghĩa prompt chạy tự động theo lịch qua Yana server", "Yana 서버를 통해 일정에 따라 실행되는 프롬프트를 정의하세요", "通过 Yana 服务器定义按计划运行的提示词")}>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            padding: "7px 16px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13,
            background: "var(--primary)", color: "white",
          }}>+ {L("New Job", "Tạo mới", "새 작업", "新建任务")}</button>
        )}
      </PageHeader>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)", maxWidth: 720 }}>
        {adding && (
          <JobForm
            onSave={() => { setAdding(false); load(); }}
            onCancel={() => setAdding(false)} />
        )}

        {/* Info banner */}
        <div className="glass" style={{ borderRadius: "var(--r-lg)", padding: "10px 14px", fontSize: 12.5, color: "var(--ink-2)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ flex: "none", marginTop: 1 }}>ℹ️</span>
          <span>
            {L(
              "Jobs are stored and displayed here. To execute them automatically, run the Yana cron runner: ",
              "Công việc được lưu và hiển thị tại đây. Để chạy tự động, khởi động Yana cron runner: ",
              "작업은 여기에 저장되고 표시됩니다. 자동으로 실행하려면 Yana cron runner를 실행하세요: ",
              "任务会被保存并显示在此处。要自动执行，请运行 Yana cron runner："
            )}
            <code style={{ fontFamily: "monospace", background: "rgba(var(--shadow-rgb),.06)", padding: "1px 6px", borderRadius: 4 }}>
              node tools/yana-web/cron-runner.js
            </code>
          </span>
        </div>

        {jobs === null && (
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{L("Loading…", "Đang tải…", "불러오는 중…", "加载中…")}</div>
        )}
        {jobs !== null && jobs.length === 0 && !adding && (
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>
            {L("No jobs yet. Create one to get started.", "Chưa có công việc nào. Tạo mới để bắt đầu.", "아직 작업이 없습니다. 새로 만들어 시작해보세요.", "尚无任务，创建一个开始使用吧。")}
          </div>
        )}
        {(jobs || []).map(j => (
          <JobRow key={j.id} job={j} onToggle={toggle} onDelete={del} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Cron });
