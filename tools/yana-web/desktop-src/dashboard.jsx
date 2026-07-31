// Yana AI — Dashboard (AI Control Center)
// All numbers are real: /api/status (MANIFEST), /api/dashboard (L1 memory +
// audit log + uptime), /api/usage (per-provider stats), YanaVault (keys).
import React from 'react';
import { L, Icons, Card } from './components.jsx';
import { MissionComposer } from './dashboard/mission-composer.jsx';

function StatTile({ label, value, sub, accent }) {
  return (
    <div className="glass card-interactive" style={{ borderRadius: "var(--r-lg)", padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="label-xs">{label}</span>
      <span className="num-lg">{value}</span>
      <span style={{ fontSize: 12.5, color: accent ? "var(--primary)" : "var(--ink-3)" }}>{sub}</span>
    </div>
  );
}

function ModelRow({ m }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "16px 1fr 110px 56px", alignItems: "center", gap: 12, padding: "calc(8px * var(--sp)) 0" }}>
      <span className={"dot " + (m.status === "active" ? "on" : "idle")}></span>
      <div style={{ lineHeight: 1.3, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{m.name} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{m.model}</span></div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.role}</div>
      </div>
      <div className="bar"><i style={{ width: m.load + "%" }}></i></div>
      <span style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "right" }}>{m.latency}</span>
    </div>
  );
}

function MissionRowMini({ m, onOpen }) {
  return (
    <button onClick={onOpen} style={{
      display: "grid", gridTemplateColumns: "1fr 90px 48px", alignItems: "center", gap: 12,
      padding: "calc(8px * var(--sp)) 0", width: "100%", textAlign: "left",
      background: "none", border: "none", cursor: "pointer", color: "inherit",
    }}>
      <div style={{ lineHeight: 1.3, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{m.owner} · {m.status}</div>
      </div>
      <div className="bar"><i style={{ width: m.progress + "%" }}></i></div>
      <span style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "right" }}>{m.progress}%</span>
    </button>
  );
}

function EmptyHint({ text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(8px * var(--sp)) 0" }}>
      <span className="dot idle" style={{ flex: "none" }}></span>
      <span style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}

function fmtAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins + L(" min ago", " phút trước", "분 전", " 分钟前");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + L(" h ago", " giờ trước", "시간 전", " 小时前");
  return Math.floor(hours / 24) + L(" days ago", " ngày trước", "일 전", " 天前");
}

function fmtUptime(s) {
  if (s < 3600) return Math.floor(s / 60) + L(" min", " phút", "분", " 分钟");
  if (s < 86400) return (s / 3600).toFixed(1) + L(" h", " giờ", "시간", " 小时");
  return (s / 86400).toFixed(1) + L(" days", " ngày", "일", " 天");
}

export function Dashboard({ t, onNav }) {
  const D = window.YANA;
  const [dash, setDash]   = React.useState(null);
  const [usage, setUsage] = React.useState(null);
  const [missions, setMissions] = React.useState([]);

  React.useEffect(() => {
    fetch("/api/dashboard").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setDash(d); }).catch(() => {});
    fetch("/api/usage").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setUsage(d.usage); }).catch(() => {});
    fetch("/api/missions").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setMissions(d.missions); }).catch(() => {});
  }, []);

  const connected = D.providers.filter((p) => YanaVault.hasKey(p.id));
  const totalTok  = connected.reduce((s, p) => s + ((usage && usage[p.id] && usage[p.id].est_tokens) || 0), 0);
  const liveModels = connected.map((p) => {
    const u = usage && usage[p.id];
    return {
      id: p.id, name: p.name, model: p.models[0], role: p.role,
      status:  u && u.requests > 0 ? "active" : "idle",
      load:    totalTok > 0 && u ? Math.round((u.est_tokens / totalTok) * 100) : 0,
      latency: u && u.avg_latency_ms ? (u.avg_latency_ms / 1000).toFixed(1) + "s" : "—",
    };
  });
  const mem    = dash && dash.memories;
  const safety = dash && dash.safety;

  return (
    <div data-screen-label="Lake">
      <MissionComposer onNav={onNav} missionCount={missions.filter((m) => m.status !== "done").length} />

      <div className="grid-stat">
        <StatTile label={L("Agents", "Tác nhân", "에이전트", "智能体")} value={D.stats.agents || "—"} sub={L("in catalog", "trong danh mục", "카탈로그 등록", "已收录")} accent />
        <StatTile label={L("Skills", "Kỹ năng", "스킬", "技能")} value={(D.stats.skills || 0).toLocaleString()} sub={L("indexed & callable", "đã lập chỉ mục", "인덱싱 · 호출 가능", "已索引 · 可调用")} />
        <StatTile label={L("Missions", "Nhiệm vụ", "미션", "任务")} value={missions.filter((m) => m.status !== "done").length} sub={L("in motion", "đang diễn ra", "진행 중", "进行中")} />
        <StatTile label={L("Memories", "Ký ức", "메모리", "记忆")} value={mem ? mem.total : "—"} sub={mem ? "+" + mem.today + L(" today", " hôm nay", "개 오늘", " 今日") : L("L1 atomic facts", "L1 atomic facts", "L1 원자적 사실", "L1 原子事实")} />
      </div>

      <div className="grid-main">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
          <Card title={L("Active AI Models", "Mô hình AI đang hoạt động", "활성 AI 모델", "活跃 AI 模型")} aside={<span className="chip neutral">{connected.length} {L("providers", "nhà cung cấp", "프로바이더", "提供商")}</span>}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {liveModels.length
                ? liveModels.map((m) => <ModelRow key={m.id} m={m} />)
                : <EmptyHint text={L("No providers connected — add an API key in Providers.", "Chưa kết nối nhà cung cấp — thêm API key ở mục Nhà cung cấp.", "연결된 프로바이더가 없습니다 — Providers에서 API 키를 추가하세요.", "尚未连接任何提供商 — 请在提供商中添加 API 密钥。")} />}
            </div>
          </Card>

          {t.showMissions && (
            <Card title={L("Missions", "Nhiệm vụ", "미션", "任务")} aside={
              <button onClick={() => onNav("missions")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 2 }}>
                {L("Mission Center", "Trung tâm nhiệm vụ", "미션 센터", "任务中心")} {Icons.chevron(13)}
              </button>
            }>
              {missions.length
                ? missions.slice(0, 4).map((m) => <MissionRowMini key={m.id} m={m} onOpen={() => { window.YANA._openMission = m.id; onNav("missions"); }} />)
                : <EmptyHint text={L("No missions yet — start one above.", "Chưa có nhiệm vụ — bắt đầu một nhiệm vụ ở trên.", "아직 미션이 없습니다 — 위에서 시작해보세요.", "尚无任务 — 请在上方开始一个。")} />}
            </Card>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
          {t.showAgents && (
            <Card title={L("Running Agents", "Tác nhân đang chạy", "실행 중인 에이전트", "运行中的智能体")} aside={
              <button onClick={() => onNav("agents")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 12.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 2 }}>
                {L("Agent Space", "Không gian tác nhân", "에이전트 공간", "智能体空间")} {Icons.chevron(13)}
              </button>
            }>
              <EmptyHint text={L("No agents running — agents start when a mission dispatches.", "Chưa có tác nhân nào chạy — tác nhân khởi động khi nhiệm vụ được giao.", "실행 중인 에이전트가 없습니다 — 미션이 배정되면 에이전트가 시작됩니다.", "暂无运行中的智能体 — 任务分派后智能体将启动。")} />
            </Card>
          )}

          {t.showMemory && (
            <Card title={L("Memory Garden", "Vườn ký ức", "메모리 가든", "记忆花园")} aside={<span className="chip pink">{Icons.memory(13)} {mem ? "+" + mem.today : "—"} {L("today", "hôm nay", "오늘", "今日")}</span>}>
              {mem && mem.recent.length
                ? mem.recent.map((m, i) => (
                    <div key={i} style={{ padding: "calc(7px * var(--sp)) 0", display: "flex", gap: 10, alignItems: "baseline" }}>
                      <span className="chip neutral" style={{ flex: "none", fontSize: 11 }}>{m.kind}</span>
                      <span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.45 }}>{m.text}</span>
                    </div>
                  ))
                : <EmptyHint text={L("No memories yet.", "Chưa có ký ức nào.", "아직 메모리가 없습니다.", "暂无记忆。")} />}
            </Card>
          )}

          {t.showSystem && (
            <Card title={L("System Health", "Sức khỏe hệ thống", "시스템 상태", "系统健康")}>
              <div className="grid-2">
                {[
                  [L("Audit events", "Sự kiện audit", "감사 이벤트", "审计事件"), safety ? safety.events_today + L(" today", " hôm nay", "개 오늘", " 今日") : "—"],
                  [L("Blocked actions", "Hành động bị chặn", "차단된 작업", "已拦截操作"), safety ? String(safety.blocked_today) : "—"],
                  [L("Last incident", "Sự cố gần nhất", "최근 사건", "最近事件"), safety ? (safety.last_incident ? fmtAgo(safety.last_incident) : L("None recorded", "Chưa ghi nhận", "기록 없음", "暂无记录")) : "—"],
                  [L("Server uptime", "Uptime máy chủ", "서버 가동 시간", "服务器运行时间"), dash ? fmtUptime(dash.uptime_s) : "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{ lineHeight: 1.35 }}>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
