// Yana AI — Settings page shell: composes the cards below.
import React from 'react';
import { L, PageHeader, Card } from '../../components.jsx';
import { providerAvailable } from '../../lib/provider-config.js';
import { switchToNewShell } from '../../shell-selector.js';
import { SettingRow, EditableRow, ToggleRow, detectTimezone } from './settings/atoms.jsx';
import { AppearanceCard } from './settings/appearance-card.jsx';
import { AboutYouCard } from './settings/about-you-card.jsx';
import { ProfileHero } from './settings/profile-hero.jsx';
import { ProfileCard } from './settings/profile-card.jsx';
import { VoiceCard } from './settings/voice-card.jsx';
import { DataManagementCard } from './settings/data-management-card.jsx';
import { ModelParamsCard, AdvancedCard } from './settings/model-params-card.jsx';

export function Settings({ t, setTweak }) {
  const D = window.YANA;

  const [dash, setDash] = React.useState(null);
  React.useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setDash(d); })
      .catch(() => {});
  }, []);

  const [defProvider, setDefProvider] = React.useState(() => localStorage.getItem("yana.chat.provider") || "");
  function pickProvider(v) {
    setDefProvider(v);
    localStorage.setItem("yana.chat.provider", v);
  }
  const available = D.providers.filter((p) => providerAvailable(p.id));
  const chain = available.map((p) => p.name).join(" → ") || L("None — add a key in Providers", "Chưa có — thêm key ở Nhà cung cấp", "없음 — 프로바이더에서 키 추가", "无 — 请在提供商中添加密钥");

  const LANG_CYCLE = ["English", "Tiếng Việt", "한국어", "中文"];
  function toggleLang() {
    const idx = LANG_CYCLE.indexOf(t.language);
    setTweak("language", LANG_CYCLE[(idx + 1) % LANG_CYCLE.length]);
  }
  const langDisplay = LANG_CYCLE.map((l) => l === t.language ? l + " ✓" : l).join(" / ");

  const GAP = "var(--gap)";
  return (
    <div data-screen-label="Settings">
      <PageHeader
        title={L("Settings", "Cài đặt", "설정", "设置")}
        sub={L("Quiet defaults. Everything supervised by Yana AI Core.", "Cài đặt mặc định. Mọi thứ được Yana AI Core giám sát.", "조용한 기본값. 모든 것이 Yana AI Core의 감독 아래 있습니다.", "低调的默认设置。一切均由 Yana AI Core 监督。")} />

      <div style={{ display: "flex", flexDirection: "column", gap: GAP, maxWidth: 900 }}>

        {/* Interface — the only way back to new-app once switched to this
            legacy shell (shell-selector.js's flag persists across every
            relaunch; new-app's own Header has "Legacy UI" but this shell
            had no reciprocal control until now). */}
        <Card title={L("Interface", "Giao diện", "인터페이스", "界面")}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0" }}>
            <div style={{ lineHeight: 1.35 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("You're using the legacy interface", "Anh đang dùng giao diện cũ", "이전 인터페이스를 사용 중입니다", "您正在使用旧版界面")}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("The new workspace shell replaces this over time", "Giao diện workspace mới sẽ thay thế dần cái này", "새 워크스페이스 셸이 점차 이를 대체합니다", "新工作区外壳将逐步取代此界面")}</div>
            </div>
            <button onClick={switchToNewShell} style={{
              background: "none", border: "1px solid var(--border)", padding: "4px 12px",
              borderRadius: 99, cursor: "pointer", fontSize: 12, color: "var(--primary)",
              fontWeight: 500, fontFamily: "inherit",
            }}>{L("Switch to new UI", "Dùng giao diện mới", "새 UI로 전환", "切换到新界面")}</button>
          </div>
        </Card>

        {/* Profile hero */}
        <ProfileHero t={t} setTweak={setTweak} dash={dash} />

        {/* Profile card — profession + custom instructions */}
        <ProfileCard lang={t.language} />

        {/* Appearance — full width */}
        <AppearanceCard t={t} setTweak={setTweak} />

        {/* Workspace + Orchestration side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: GAP }}>
          <Card title={L("Workspace", "Không gian làm việc", "워크스페이스", "工作区")}>
            <EditableRow label={L("Workspace name", "Tên không gian", "워크스페이스 이름", "工作区名称")} storeKey="yana.workspace.name"
              fallback={L("Yana's Lake", "Mặt hồ của Yana", "Yana의 호수", "Yana 的湖")} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ lineHeight: 1.35 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Language", "Ngôn ngữ", "언어", "语言")}</div>
              </div>
              <button onClick={toggleLang} style={{
                background: "none", border: "1px solid var(--border)", padding: "4px 12px",
                borderRadius: 99, cursor: "pointer", fontSize: 12, color: "var(--primary)",
                fontWeight: 500, fontFamily: "inherit",
              }}>{langDisplay}</button>
            </div>
            <SettingRow label={L("Timezone", "Múi giờ", "시간대", "时区")}
              desc={L("Detected from this browser", "Phát hiện từ trình duyệt này", "이 브라우저에서 감지됨", "从此浏览器检测")}
              value={detectTimezone()} />
          </Card>

          <Card title={L("Orchestration", "Điều phối", "오케스트레이션", "编排")}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "calc(11px * var(--sp)) 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ lineHeight: 1.35 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{L("Default provider", "Nhà cung cấp mặc định", "기본 프로바이더", "默认提供商")}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{L("Used by Chat unless overridden", "Chat dùng mặc định này trừ khi chọn khác", "따로 지정하지 않으면 채팅에서 사용", "除非另行指定，否则聊天将使用此项")}</div>
              </div>
              <select value={defProvider} onChange={(e) => pickProvider(e.target.value)} style={{
                border: "1px solid var(--border)", borderRadius: 99, padding: "5px 10px",
                background: "transparent", color: "var(--primary)", fontSize: 12,
                fontWeight: 500, fontFamily: "inherit", cursor: "pointer", maxWidth: 150,
              }}>
                <option value="">{L("Auto (first connected)", "Tự động (kết nối đầu tiên)", "자동 (첫 연결)", "自动（首个已连接）")}</option>
                {D.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!providerAvailable(p.id)}>
                    {p.name}{p.desktopOnly ? " 🖥" : ""}{providerAvailable(p.id) ? "" : " 🔒"}
                  </option>
                ))}
              </select>
            </div>
            <SettingRow
              label={L("Task routing", "Định tuyến tác vụ", "작업 라우팅", "任务路由")}
              desc={L("yana-rt classifier — local, before any provider call", "yana-rt classifier — chạy local, trước mọi lệnh gọi provider", "yana-rt 분류기 — 프로바이더 호출 전 로컬에서 실행", "yana-rt 分类器 — 在调用任何提供商之前于本地运行")}
              value={L("simple · complex · external", "simple · complex · external", "simple · complex · external", "simple · complex · external")} />
            <SettingRow label={L("Fallback chain", "Chuỗi dự phòng", "폴백 체인", "回退链")}
              desc={L("Connected providers, in order", "Các nhà cung cấp đã kết nối, theo thứ tự", "연결된 프로바이더, 순서대로", "已连接的提供商，按顺序")}
              value={chain} />
          </Card>
        </div>

        {/* Model Parameters — full width */}
        <ModelParamsCard lang={t.language} />

        {/* About you — full width */}
        <AboutYouCard />

        {/* Safety + Memory side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: GAP }}>
          <Card title={L("Safety", "Bảo mật", "안전", "安全")}>
            <SettingRow
              label={L("Gate mode", "Chế độ cổng", "게이트 모드", "门控模式")}
              desc={L("Every agent action is reviewed", "Mọi hành động của tác nhân đều được xem xét", "모든 에이전트 동작이 검토됨", "所有智能体操作均经过审查")}
              value={L("Strict · deny by default", "Nghiêm ngặt · từ chối mặc định", "엄격 · 기본 거부", "严格 · 默认拒绝")} />
            <SettingRow
              label={L("Audit events today", "Sự kiện audit hôm nay", "오늘의 감사 이벤트", "今日审计事件")}
              desc={L("From the L0 hash-chained audit log", "Từ audit log băm chuỗi L0", "L0 해시체인 감사 로그 기준", "来自 L0 哈希链审计日志")}
              value={dash ? String(dash.safety.events_today) : "…"} />
            <SettingRow
              label={L("Blocked today", "Đã chặn hôm nay", "오늘 차단됨", "今日已拦截")}
              desc={dash && dash.safety.last_incident
                ? L("Last incident: ", "Sự cố gần nhất: ", "최근 사건: ", "最近事件：") + dash.safety.last_incident
                : L("No incidents on record", "Chưa ghi nhận sự cố", "기록된 사건 없음", "暂无记录事件")}
              value={dash ? String(dash.safety.blocked_today) : "…"} />
          </Card>
          <Card title={L("Memory", "Bộ nhớ", "메모리", "记忆")}>
            <SettingRow
              label={L("L1 atomic facts", "Fact L1", "L1 원자적 사실", "L1 原子事实")}
              desc={L("Persisted in memory/L1_atomic", "Lưu tại memory/L1_atomic", "memory/L1_atomic에 저장됨", "持久化存储于 memory/L1_atomic")}
              value={dash ? String(dash.memories.total) : "…"} />
            <SettingRow label={L("Fresh today", "Mới hôm nay", "오늘 추가됨", "今日新增")} value={dash ? String(dash.memories.today) : "…"} />
            <SettingRow label={L("Storage", "Lưu trữ", "저장소", "存储")}
              desc={L("API keys AES-256-GCM encrypted at rest (rule 66)", "API key mã hóa AES-256-GCM khi lưu (rule 66)", "API 키는 저장 시 AES-256-GCM으로 암호화됨 (rule 66)", "API 密钥静态存储时使用 AES-256-GCM 加密（规则 66）")}
              value={L("Local · encrypted", "Cục bộ · mã hóa", "로컬 · 암호화됨", "本地 · 已加密")} />
          </Card>
        </div>

        {/* Chat + Notifications side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: GAP }}>
          <Card title={L("Chat", "Trò chuyện", "채팅", "聊天")}>
            <ToggleRow
              label={L("Send on Enter", "Gửi bằng Enter", "Enter로 전송", "按 Enter 发送")}
              desc={L("Shift+Enter to add a new line", "Shift+Enter để xuống dòng", "Shift+Enter로 줄바꿈", "Shift+Enter 换行")}
              storeKey="yana.chat.send-on-enter" defaultVal={true} />
            <ToggleRow
              label={L("Show timestamps", "Hiện thời gian", "타임스탬프 표시", "显示时间戳")}
              desc={L("Display time beside each message", "Hiện giờ cạnh mỗi tin nhắn", "각 메시지 옆에 시간 표시", "在每条消息旁显示时间")}
              storeKey="yana.chat.show-timestamps" defaultVal={false} />
            <ToggleRow
              label={L("Compact messages", "Tin nhắn gọn", "간결한 메시지", "紧凑消息")}
              desc={L("Reduce spacing between bubbles", "Giảm khoảng cách giữa bong bóng", "말풍선 간격 줄이기", "减少消息气泡间距")}
              storeKey="yana.chat.compact" defaultVal={false} />
            <ToggleRow
              label={L("Auto-scroll to new messages", "Tự cuộn xuống tin mới", "새 메시지로 자동 스크롤", "自动滚动到新消息")}
              storeKey="yana.chat.auto-scroll" defaultVal={true} />
            <ToggleRow
              label={L("Show model name in header", "Hiện tên model ở đầu trang", "헤더에 모델 이름 표시", "在页眉显示模型名称")}
              desc={L("Display active model above the chat", "Hiện model đang dùng phía trên chat", "채팅 위에 사용 중인 모델 표시", "在聊天上方显示当前使用的模型")}
              storeKey="yana.chat.show-model" defaultVal={false} />
          </Card>

          <Card title={L("Notifications", "Thông báo", "알림", "通知")}>
            <ToggleRow
              label={L("Sound on reply", "Âm báo khi có trả lời", "답변 시 알림음", "回复时提示音")}
              desc={L("Soft chime when Yana finishes replying", "Tiếng chuông nhẹ khi Yana trả lời xong", "Yana의 답변이 끝나면 은은한 차임벨", "Yana 回复完成时的轻柔提示音")}
              storeKey="yana.notify.sound" defaultVal={true} />
            <ToggleRow
              label={L("Desktop notifications", "Thông báo màn hình", "데스크톱 알림", "桌面通知")}
              desc={L("OS notification when window is in background", "Thông báo hệ thống khi cửa sổ thu nhỏ", "창이 백그라운드에 있을 때 OS 알림", "窗口处于后台时显示系统通知")}
              storeKey="yana.notify.desktop" defaultVal={false} />
            <ToggleRow
              label={L("Agent alerts", "Cảnh báo tác nhân", "에이전트 알림", "智能体提醒")}
              desc={L("Notify when an agent finishes a long task", "Thông báo khi tác nhân hoàn tất tác vụ dài", "에이전트가 긴 작업을 마치면 알림", "智能体完成长时间任务时通知")}
              storeKey="yana.notify.agents" defaultVal={true} />
            <ToggleRow
              label={L("Error alerts", "Cảnh báo lỗi", "오류 알림", "错误提醒")}
              desc={L("Notify when a gate or safety rule blocks an action", "Thông báo khi cổng hoặc quy tắc bảo mật chặn hành động", "게이트나 안전 규칙이 작업을 차단하면 알림", "门控或安全规则阻止操作时通知")}
              storeKey="yana.notify.errors" defaultVal={true} />
          </Card>
        </div>

        {/* Voice & Data side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: GAP }}>
          <VoiceCard lang={t.language} />
          <DataManagementCard />
        </div>

        {/* Advanced / Developer */}
        <AdvancedCard lang={t.language} />

        {/* About — full width */}
        <Card title={L("About Yana AI", "Về Yana AI", "Yana AI 소개", "关于 Yana AI")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0 32px" }}>
            <div>
              <SettingRow
                label={L("Version", "Phiên bản", "버전", "版本")}
                desc={L("Current release", "Phiên bản hiện tại", "현재 릴리스", "当前版本")}
                value={"v" + (D.version || "0.43.0")} />
              <SettingRow
                label={L("Skills", "Kỹ năng", "스킬", "技能")}
                desc={L("On-demand workflow modules", "Module quy trình theo yêu cầu", "필요 시 사용하는 워크플로우 모듈", "按需调用的工作流模块")}
                value={D.stats.skills > 0 ? String(D.stats.skills) : "1988"} />
              <SettingRow
                label={L("Agents", "Tác nhân", "에이전트", "智能体")}
                desc={L("Specialist parallel workers", "Công nhân song song chuyên biệt", "병렬로 작동하는 전문 워커", "并行工作的专业执行体")}
                value={D.stats.agents > 0 ? String(D.stats.agents) : "101"} />
            </div>
            <div>
              <SettingRow
                label={L("License", "Giấy phép", "라이선스", "许可证")}
                value="Apache-2.0" />
              <SettingRow
                label={L("Storage encryption", "Mã hóa lưu trữ", "저장소 암호화", "存储加密")}
                desc={L("AES-256-GCM, non-extractable key", "AES-256-GCM, khóa không thể xuất", "AES-256-GCM, 추출 불가능한 키", "AES-256-GCM，密钥不可导出")}
                value={L("Rule 66 · active", "Rule 66 · đang hoạt động", "Rule 66 · 활성", "Rule 66 · 已启用")} />
              <SettingRow
                label={L("Safety rules", "Quy tắc bảo mật", "안전 규칙", "安全规则")}
                desc={L("Enforcement policies loaded", "Chính sách thực thi đã tải", "실행 정책 로드됨", "已加载执行策略")}
                value="70 rules" />
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
