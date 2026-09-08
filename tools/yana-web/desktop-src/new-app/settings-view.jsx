// Roadmap Phase 12 — a small, real settings foundation. This deliberately
// exposes only preferences and destinations that have a live effect today;
// runtime governance, secrets, and developer diagnostics stay outside this
// normal-user surface until their canonical backend controls exist.
import React from 'react';
import { Icons, L } from '../components.jsx';
import { IntegrationsSettings } from './integrations-settings.jsx';

const LANGUAGE_OPTIONS = [
  ['en', 'English'], ['vi', 'Tiếng Việt'], ['ko', '한국어'], ['zh', '中文'],
];

function Section({ title, description, children }) {
  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '16px 18px' }}>
      <h2 style={{ margin: 0, fontSize: 'var(--font-size-base)', fontWeight: 650 }}>{title}</h2>
      {description && <p style={{ margin: '5px 0 14px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{description}</p>}
      {children}
    </section>
  );
}

function LinkRow({ title, description, action, actionLabel }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <div><div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 550 }}>{title}</div><div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 3 }}>{description}</div></div>
      {action && <button onClick={action} style={{ flexShrink: 0, border: '1px solid var(--border)', background: 'transparent', color: 'var(--primary)', borderRadius: 'var(--r-sm)', padding: '5px 9px', cursor: 'pointer' }}>{actionLabel || L('Open', 'Mở', '열기', '打开')}</button>}
    </div>
  );
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dataGroupLabel(id) {
  const labels = {
    memory: L('Memory & conversations', 'Memory & hội thoại', '메모리 및 대화', '记忆与对话'),
    workspace: L('Workspace metadata', 'Metadata workspace', '작업 공간 메타데이터', '工作区元数据'),
    settings: L('Yana settings', 'Cài đặt Yana', 'Yana 설정', 'Yana 设置'),
    credentials: L('Credentials & sessions', 'Credential & phiên', '자격 증명 및 세션', '凭据与会话'),
  };
  return labels[id] || id;
}

function DataOverview({ overview, loading, onRefresh }) {
  return (
    <div style={{ padding: '11px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--color-bg-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{L('Local data overview', 'Tổng quan dữ liệu cục bộ', '로컬 데이터 개요', '本地数据概览')}</div>
          <div style={{ marginTop: 2, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{L('File counts and sizes only — Yana does not read or reveal file contents here.', 'Chỉ số tệp và dung lượng — Yana không đọc hoặc hiện nội dung tệp ở đây.', '파일 수와 크기만 표시합니다. Yana는 여기서 파일 내용을 읽거나 공개하지 않습니다.', '仅显示文件数量和大小；Yana 不会在此读取或显示文件内容。')}</div>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} style={{ flexShrink: 0, border: '1px solid var(--border)', background: 'transparent', color: 'var(--primary)', borderRadius: 'var(--r-sm)', padding: '5px 9px', cursor: loading ? 'default' : 'pointer', font: 'inherit', fontSize: 'var(--font-size-xs)', opacity: loading ? 0.6 : 1 }}>{L('Refresh', 'Làm mới', '새로고침', '刷新')}</button>
      </div>
      {loading && <p role="status" style={{ margin: '8px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{L('Reading local data summary…', 'Đang đọc tóm tắt dữ liệu cục bộ…', '로컬 데이터 요약을 읽는 중…', '正在读取本地数据摘要…')}</p>}
      {overview && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, margin: '8px 0', color: 'var(--ink)', fontSize: 'var(--font-size-sm)' }}><strong>{L('Managed locally', 'Được quản lý cục bộ', '로컬 관리', '本地管理')}</strong><span>{formatBytes(overview.totalBytes)}</span></div>
        <div style={{ display: 'grid', gap: 5 }}>
          {overview.groups.map((group) => (
            <div key={group.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
              <span>{dataGroupLabel(group.id)}{group.sensitive ? ` · ${L('not exported', 'không xuất', '내보내지 않음', '不导出')}` : ''}</span>
              <span>{group.fileCount} · {formatBytes(group.bytes)}</span>
            </div>
          ))}
        </div>
      </>}
      {!loading && !overview && <p style={{ margin: '8px 0 0', color: 'var(--warn)', fontSize: 'var(--font-size-xs)' }}>{L('The local data summary is unavailable.', 'Không tải được tóm tắt dữ liệu cục bộ.', '로컬 데이터 요약을 사용할 수 없습니다.', '本地数据摘要不可用。')}</p>}
    </div>
  );
}

export function SettingsView({ preferences, onChange, onNavigate, onFocusTerminal }) {
  const [query, setQuery] = React.useState('');
  const [section, setSection] = React.useState('general');
  const [backupStatus, setBackupStatus] = React.useState(null);
  const [restoreStatus, setRestoreStatus] = React.useState(null);
  const [automaticBackup, setAutomaticBackup] = React.useState(null);
  const [resetStatus, setResetStatus] = React.useState(null);
  const [dataOverview, setDataOverview] = React.useState(null);
  const [dataOverviewLoading, setDataOverviewLoading] = React.useState(true);
  const [authStatus, setAuthStatus] = React.useState(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (keywords) => !normalizedQuery || keywords.toLocaleLowerCase().includes(normalizedQuery);
  const visible = {
    account: matches('account google link sign in login'),
    appearance: matches('appearance theme system light dark mode'),
    language: matches('language locale region vietnamese korean chinese english'),
    workspace: matches('projects workspace folders terminal providers models privacy permissions'),
    integrations: matches('integrations connectors github gmail google drive calendar notion permissions scopes oauth'),
    privacy: matches('privacy data memory backup export restore'),
  };
  const showSection = (id) => !normalizedQuery || section === id;
  const hasSettingsResult = visible.account || visible.appearance || visible.language || visible.workspace || visible.integrations || visible.privacy;
  const sections = [
    { id: 'general', label: L('General', 'Chung', '일반', '通用'), matches: visible.account || visible.appearance || visible.language },
    { id: 'workspace', label: L('Workspace', 'Không gian làm việc', '작업 공간', '工作区'), matches: visible.workspace },
    { id: 'connections', label: L('Connections', 'Kết nối', '연결', '连接'), matches: visible.integrations },
    { id: 'data', label: L('Data & memory', 'Dữ liệu & memory', '데이터 및 메모리', '数据与记忆'), matches: visible.privacy },
  ];

  const exportMemory = React.useCallback(async () => {
    setBackupStatus({ loading: true });
    const result = await window.yana?.exportMemoryBackup?.();
    if (result?.cancelled) setBackupStatus(null);
    else if (result?.ok) setBackupStatus({ ok: true, message: result.outputPath });
    else setBackupStatus({ ok: false, message: result?.error || L('Backup failed.', 'Sao lưu thất bại.', '백업에 실패했습니다.', '备份失败。') });
  }, []);

  const restoreMemory = React.useCallback(async () => {
    setRestoreStatus({ loading: true });
    const result = await window.yana?.restoreMemoryBackup?.();
    if (result?.cancelled) setRestoreStatus(null);
    else if (result?.ok) setRestoreStatus({ ok: true, message: L('Memory restored. The local Yana service has restarted.', 'Đã khôi phục memory. Dịch vụ Yana cục bộ đã khởi động lại.', '메모리가 복원되었습니다. 로컬 Yana 서비스가 다시 시작되었습니다.', '记忆已恢复。本地 Yana 服务已重新启动。') });
    else setRestoreStatus({ ok: false, message: result?.error || L('Restore failed.', 'Khôi phục thất bại.', '복원에 실패했습니다.', '恢复失败。') });
  }, []);

  React.useEffect(() => {
    let active = true;
    window.yana?.memoryBackupSettings?.().then((result) => {
      if (active && result?.ok) setAutomaticBackup(result);
    });
    return () => { active = false; };
  }, []);

  const refreshDataOverview = React.useCallback(async () => {
    setDataOverviewLoading(true);
    const result = await window.yana?.dataOverview?.();
    setDataOverview(result?.ok ? result.overview : null);
    setDataOverviewLoading(false);
  }, []);

  React.useEffect(() => { void refreshDataOverview(); }, [refreshDataOverview]);

  // Powers the "Link Google Account" row below. Same /api/auth/status
  // endpoint login.html already calls before its own googleAvailable
  // check — googleLinked is a real field on that response (auth.js:164),
  // not something new-app previously read anywhere.
  React.useEffect(() => {
    let active = true;
    fetch('/api/auth/status').then((r) => r.json()).then((d) => { if (active) setAuthStatus(d); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const chooseAutomaticBackupFolder = React.useCallback(async () => {
    const result = await window.yana?.selectMemoryBackupDirectory?.();
    if (result?.cancelled) return;
    if (result?.ok) {
      setAutomaticBackup(result);
      setBackupStatus({ ok: true, message: L('Automatic backup folder updated.', 'Đã cập nhật thư mục backup tự động.', '자동 백업 폴더가 업데이트되었습니다.', '自动备份文件夹已更新。') });
    } else {
      setBackupStatus({ ok: false, message: result?.error || L('Could not select backup folder.', 'Không thể chọn thư mục backup.', '백업 폴더를 선택할 수 없습니다.', '无法选择备份文件夹。') });
    }
  }, []);

  const toggleAutomaticBackup = React.useCallback(async () => {
    const result = await window.yana?.setAutomaticMemoryBackupEnabled?.(!automaticBackup?.enabled);
    if (result?.ok) {
      setAutomaticBackup(result);
      setBackupStatus({ ok: true, message: result.enabled
        ? L('Daily automatic backup enabled.', 'Đã bật backup tự động hằng ngày.', '매일 자동 백업이 활성화되었습니다.', '已启用每日自动备份。')
        : L('Automatic backup disabled.', 'Đã tắt backup tự động.', '자동 백업이 비활성화되었습니다.', '已禁用自动备份。') });
    } else {
      setBackupStatus({ ok: false, message: result?.error || L('Could not update automatic backup.', 'Không thể cập nhật backup tự động.', '자동 백업을 업데이트할 수 없습니다.', '无法更新自动备份。') });
    }
  }, [automaticBackup?.enabled]);

  const resetMemory = React.useCallback(async () => {
    setResetStatus({ loading: true });
    const result = await window.yana?.resetMemory?.();
    if (result?.cancelled) setResetStatus(null);
    else if (result?.ok) setResetStatus({ ok: true, message: L('Portable memory reset completed.', 'Đã reset memory di động.', '이식 가능한 메모리 재설정이 완료되었습니다.', '可移植记忆已重置。') });
    else setResetStatus({ ok: false, message: result?.error || L('Memory reset failed.', 'Reset memory thất bại.', '메모리 재설정에 실패했습니다.', '记忆重置失败。') });
  }, []);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px clamp(20px, 5vw, 56px)', color: 'var(--ink)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: 650 }}>{L('Settings', 'Cài đặt', '설정', '设置')}</h1>
        <p style={{ margin: '7px 0 18px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Presentation preferences are separate from Yana runtime policy and encrypted provider credentials.', 'Tùy chọn hiển thị tách biệt khỏi policy runtime Yana và credential provider đã mã hóa.', '표시 환경설정은 Yana 런타임 정책 및 암호화된 프로바이더 자격 증명과 분리됩니다.', '显示偏好与 Yana 运行时策略及加密提供商凭据分离。')}</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '7px 10px', marginBottom: 18, color: 'var(--color-text-muted)' }}>
          {Icons.search(15)}
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={L('Search settings', 'Tìm cài đặt', '설정 검색', '搜索设置')} aria-label={L('Search settings', 'Tìm cài đặt', '설정 검색', '搜索设置')} style={{ border: 'none', outline: 'none', minWidth: 0, flex: 1, background: 'transparent', color: 'var(--ink)', font: 'inherit', fontSize: 'var(--font-size-sm)' }} />
        </label>
        <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 22 }}>
          <nav aria-label={L('Settings sections', 'Nhóm cài đặt', '설정 섹션', '设置部分')} style={{ flex: '0 0 176px', display: 'grid', gap: 4, padding: 8, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface-1)' }}>
            {sections.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                aria-current={!normalizedQuery && section === item.id ? 'page' : undefined}
                style={{
                  border: 0, borderRadius: 'var(--r-sm)', padding: '8px 9px', textAlign: 'left', cursor: 'pointer',
                  background: !normalizedQuery && section === item.id ? 'var(--primary-soft)' : 'transparent',
                  color: !normalizedQuery && section === item.id ? 'var(--primary)' : 'var(--ink)',
                  fontSize: 'var(--font-size-sm)', fontWeight: !normalizedQuery && section === item.id ? 600 : 450,
                  opacity: normalizedQuery && !item.matches ? 0.55 : 1,
                }}
              >
                {item.label}
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--border)', margin: '5px 2px' }} />
            <button type="button" onClick={() => onNavigate('models')} style={{ border: 0, borderRadius: 'var(--r-sm)', padding: '8px 9px', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', textAlign: 'left', fontSize: 'var(--font-size-sm)' }}>
              {L('Models & providers ↗', 'Model & provider ↗', '모델 및 프로바이더 ↗', '模型与提供商 ↗')}
            </button>
          </nav>
          <div style={{ minWidth: 0, flex: '1 1 520px', display: 'grid', gap: 14 }}>
          {showSection('general') && visible.account && <Section title={L('Account', 'Tài khoản', '계정', '账号')} description={L('Link Google to sign in without your password. This is separate from the per-connector Gmail/Calendar access under Connections.', 'Liên kết Google để đăng nhập không cần mật khẩu. Việc này tách biệt với quyền truy cập Gmail/Calendar theo từng connector ở mục Kết nối.', '비밀번호 없이 로그인하려면 Google을 연결하세요. 이는 연결 메뉴의 커넥터별 Gmail/Calendar 액세스와 별개입니다.', '关联 Google 即可免密码登录。这与"连接"下按连接器授予的 Gmail/Calendar 访问权限是分开的。')}>
            {authStatus?.googleAvailable === false && (
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{L('Google sign-in is not configured on this installation yet.', 'Đăng nhập Google chưa được cấu hình trên máy này.', '이 설치본에는 아직 Google 로그인이 구성되어 있지 않습니다.', '此安装尚未配置 Google 登录。')}</p>
            )}
            {authStatus?.googleAvailable && (
              <LinkRow
                title={L('Google account', 'Tài khoản Google', 'Google 계정', 'Google 账号')}
                description={authStatus.googleLinked
                  ? L('Linked — you can sign in with Google.', 'Đã liên kết — anh có thể đăng nhập bằng Google.', '연결됨 — Google로 로그인할 수 있습니다.', '已关联 — 您可以使用 Google 登录。')
                  : L('Not linked. Link it to sign in without typing your password.', 'Chưa liên kết. Liên kết để đăng nhập không cần gõ mật khẩu.', '연결되지 않음. 비밀번호 입력 없이 로그인하려면 연결하세요.', '尚未关联。关联后即可免输入密码登录。')}
                action={authStatus.googleLinked ? null : () => { window.location.href = '/api/auth/google/start?intent=link'; }}
                actionLabel={L('Link Google', 'Liên kết Google', 'Google 연결', '关联 Google')}
              />
            )}
          </Section>}
          {showSection('general') && visible.appearance && <Section title={L('Appearance', 'Giao diện', '모양', '外观')} description={L('System follows your OS setting automatically; Light/Dark override it.', 'System tự theo cài đặt hệ điều hành; Light/Dark ghi đè lên nó.', 'System은 OS 설정을 자동으로 따릅니다. Light/Dark는 이를 재정의합니다.', 'System 会自动跟随操作系统设置；Light/Dark 会覆盖它。')}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {/* Manual override restored on top of the automatic default
                  (2026-09-03, anh's call) — 'system' (default) follows the
                  OS via prefers-color-scheme with no data-theme attribute
                  set at all; 'light'/'dark' set it explicitly. See
                  ui-preferences.mjs's own note and themes.css's
                  :root[data-theme] blocks for how the override applies in
                  both directions regardless of the OS's own setting. */}
              {[
                ['system', L('System', 'Hệ thống', '시스템', '系统')],
                ['light', L('Light', 'Sáng', '라이트', '浅色')],
                ['dark', L('Dark', 'Tối', '다크', '深色')],
              ].map(([id, label]) => <button key={id} onClick={() => onChange({ theme: id })} aria-pressed={preferences.theme === id} style={{ border: preferences.theme === id ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '7px 10px', background: preferences.theme === id ? 'var(--primary-soft)' : 'transparent', color: preferences.theme === id ? 'var(--primary)' : 'var(--ink)', cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}>{label}</button>)}
            </div>
          </Section>}
          {showSection('general') && visible.language && <Section title={L('Language & region', 'Ngôn ngữ & khu vực', '언어 및 지역', '语言与地区')} description={L('Interface language changes immediately; new workspace dates use the selected locale.', 'Ngôn ngữ giao diện đổi ngay; ngày trong workspace mới dùng locale đã chọn.', '인터페이스 언어는 즉시 변경되며 새 작업 공간의 날짜는 선택한 로캘을 사용합니다.', '界面语言会立即更改；新工作区中的日期使用所选区域设置。')}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 'var(--font-size-sm)' }}>
              {L('Language', 'Ngôn ngữ', '언어', '语言')}
              <select value={preferences.language} onChange={(event) => onChange({ language: event.target.value })} style={{ background: 'var(--color-bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '5px 8px', font: 'inherit' }}>
                {LANGUAGE_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
          </Section>}
          {showSection('workspace') && visible.workspace && <Section title={L('Workspace', 'Không gian làm việc', '작업 공간', '工作区')} description={L('Open live surfaces instead of duplicating their state in Settings.', 'Mở các surface thật thay vì sao chép state vào Settings.', '설정에 상태를 복제하지 않고 실제 화면을 엽니다.', '打开真实界面，而不在设置中复制状态。')}>
            <LinkRow title={L('Projects', 'Dự án', '프로젝트', '项目')} description={L('Choose the folder shared by chat, files, Git, new terminals, and the IDE.', 'Chọn thư mục dùng chung cho chat, tệp, Git, terminal mới và IDE.', '채팅, 파일, Git, 새 터미널 및 IDE가 공유할 폴더를 선택합니다.', '选择聊天、文件、Git、新终端和 IDE 共享的文件夹。')} action={() => onNavigate('projects')} />
            <LinkRow title={L('Terminal', 'Terminal', '터미널', '终端')} description={L('Adjust shell presentation in the terminal dock. Human shells remain separate from governed AI execution.', 'Chỉnh hiển thị shell trong terminal dock. Shell người dùng vẫn tách biệt khỏi thực thi AI có governance.', '터미널 도크에서 셸 표시를 조정합니다. 사람 셸은 거버넌스가 적용된 AI 실행과 분리됩니다.', '在终端停靠栏中调整 shell 显示。人类 shell 与受治理的 AI 执行保持分离。')} action={onFocusTerminal} />
            <LinkRow title={L('Providers & models', 'Provider & model', '프로바이더 및 모델', '提供商与模型')} description={L('Configure API credentials through the encrypted YanaVault surface; discover models from supported providers.', 'Cấu hình credential API qua YanaVault mã hóa; khám phá model từ provider hỗ trợ.', '암호화된 YanaVault 화면에서 API 자격 증명을 구성하고 지원되는 프로바이더의 모델을 검색합니다.', '通过加密的 YanaVault 界面配置 API 凭据，并从受支持的提供商发现模型。')} action={() => onNavigate('models')} />
            <LinkRow title={L('Permissions & autonomy', 'Quyền & tự chủ', '권한 및 자율성', '权限与自主性')} description={L('Current approval rules are shown in the Context panel. An editable autonomy level will appear only when the runtime provides one.', 'Rule approval hiện hiển thị ở Context. Mức tự chủ chỉnh được chỉ xuất hiện khi runtime cung cấp.', '현재 승인 규칙은 Context 패널에 표시됩니다. 런타임이 제공할 때만 편집 가능한 자율성 수준이 나타납니다.', '当前审批规则显示在 Context 面板中。只有运行时提供后才会显示可编辑的自主级别。')} />
          </Section>}
          {showSection('connections') && visible.integrations && <IntegrationsSettings />}
          {showSection('data') && visible.privacy && <Section title={L('Privacy & data', 'Quyền riêng tư & dữ liệu', '개인정보 및 데이터', '隐私与数据')} description={L('Export portable memory without credentials or login sessions.', 'Xuất memory di động mà không kèm credential hoặc phiên đăng nhập.', '자격 증명이나 로그인 세션 없이 이식 가능한 메모리를 내보냅니다.', '导出不含凭据或登录会话的可移植记忆。')}>
            <DataOverview overview={dataOverview} loading={dataOverviewLoading} onRefresh={refreshDataOverview} />
            <p style={{ margin: '10px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', lineHeight: 1.45 }}>{L('No standalone cache-clearing control is shown because the desktop runtime has no separate canonical cache store yet. This prevents a “clear cache” action from deleting persistent data by mistake.', 'Chưa hiển thị nút xóa cache riêng vì runtime Desktop chưa có kho cache chuẩn tách biệt. Điều này tránh thao tác “xóa cache” xóa nhầm dữ liệu lưu trữ.', '데스크톱 런타임에 별도의 표준 캐시 저장소가 아직 없으므로 독립적인 캐시 지우기 제어는 표시되지 않습니다. 이는 “캐시 지우기”가 영구 데이터를 실수로 삭제하는 일을 방지합니다.', '由于桌面运行时尚无独立的规范缓存存储，因此未显示单独的清除缓存控件。这可以避免“清除缓存”错误删除持久数据。')}</p>
            <LinkRow title={L('Export Yana memory', 'Xuất memory Yana', 'Yana 메모리 내보내기', '导出 Yana 记忆')} description={L('Includes data schema, memory, conversations, and missions. API keys, password hashes, and session tokens are excluded.', 'Gồm schema dữ liệu, memory, hội thoại và mission. API key, hash mật khẩu và session token đều bị loại.', '데이터 스키마, 메모리, 대화 및 미션을 포함합니다. API 키, 비밀번호 해시 및 세션 토큰은 제외됩니다.', '包含数据架构、记忆、对话和任务。排除 API 密钥、密码哈希和会话令牌。')} action={backupStatus?.loading ? null : exportMemory} actionLabel={L('Export', 'Xuất', '내보내기', '导出')} />
            {backupStatus?.loading && <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{L('Creating backup…', 'Đang tạo bản sao lưu…', '백업 생성 중…', '正在创建备份…')}</p>}
            {backupStatus?.message && <p style={{ color: backupStatus.ok ? 'var(--good)' : 'var(--warn)', fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>{backupStatus.message}</p>}
            <LinkRow title={L('Restore Yana memory', 'Khôi phục memory Yana', 'Yana 메모리 복원', '恢复 Yana 记忆')} description={L('Validates the backup before replacing portable data, keeps credentials and sessions, and rolls back if the local service cannot restart.', 'Kiểm tra backup trước khi thay dữ liệu di động, giữ nguyên credential và phiên đăng nhập, đồng thời rollback nếu dịch vụ cục bộ không khởi động lại được.', '이식 가능한 데이터를 교체하기 전에 백업을 검증하고 자격 증명과 세션을 유지하며 로컬 서비스가 다시 시작되지 않으면 롤백합니다.', '在替换可移植数据前验证备份，保留凭据和会话；若本地服务无法重启则回滚。')} action={restoreStatus?.loading ? null : restoreMemory} actionLabel={L('Restore', 'Khôi phục', '복원', '恢复')} />
            {restoreStatus?.loading && <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{L('Validating backup…', 'Đang kiểm tra backup…', '백업 검증 중…', '正在验证备份…')}</p>}
            {restoreStatus?.message && <p style={{ color: restoreStatus.ok ? 'var(--good)' : 'var(--warn)', fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>{restoreStatus.message}</p>}
            <LinkRow title={L('Automatic backup folder', 'Thư mục backup tự động', '자동 백업 폴더', '自动备份文件夹')} description={automaticBackup?.directory || L('No folder selected. Yana will not create automatic backups.', 'Chưa chọn thư mục. Yana sẽ không tạo backup tự động.', '선택된 폴더가 없습니다. Yana는 자동 백업을 만들지 않습니다.', '未选择文件夹。Yana 不会创建自动备份。')} action={chooseAutomaticBackupFolder} actionLabel={L('Choose', 'Chọn', '선택', '选择')} />
            <LinkRow title={L('Daily automatic backup', 'Backup tự động hằng ngày', '매일 자동 백업', '每日自动备份')} description={automaticBackup?.lastSuccessfulBackupAt
              ? `${L('Last successful backup', 'Backup thành công gần nhất', '마지막 성공 백업', '上次成功备份')}: ${new Date(automaticBackup.lastSuccessfulBackupAt).toLocaleString()}`
              : L('Runs in the background only after a folder is selected and this option is enabled.', 'Chỉ chạy nền sau khi đã chọn thư mục và bật tùy chọn này.', '폴더를 선택하고 이 옵션을 활성화한 후에만 백그라운드에서 실행됩니다.', '仅在选择文件夹并启用此选项后在后台运行。')} action={automaticBackup?.directory ? toggleAutomaticBackup : null} actionLabel={automaticBackup?.enabled ? L('Disable', 'Tắt', '비활성화', '禁用') : L('Enable', 'Bật', '활성화', '启用')} />
            {automaticBackup?.lastError && <p style={{ color: 'var(--warn)', fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>{automaticBackup.lastError}</p>}
            <LinkRow title={L('Reset portable memory', 'Reset memory di động', '이식 가능한 메모리 재설정', '重置可移植记忆')} description={L('Removes memory, conversations, and missions only. Yana offers an export first, asks twice, preserves credentials and sessions, and rolls back on restart failure.', 'Chỉ xóa memory, hội thoại và mission. Yana đề nghị export trước, hỏi xác nhận hai lần, giữ credential và phiên đăng nhập, và rollback nếu restart lỗi.', '메모리, 대화 및 미션만 제거합니다. 먼저 내보내기를 제안하고 두 번 확인하며 자격 증명과 세션을 보존하고 재시작 실패 시 롤백합니다.', '仅移除记忆、对话和任务。Yana 会先建议导出、二次确认、保留凭据和会话，并在重启失败时回滚。')} action={resetStatus?.loading ? null : resetMemory} actionLabel={L('Reset…', 'Reset…', '재설정…', '重置…')} />
            {resetStatus?.loading && <p style={{ color: 'var(--warn)', fontSize: 'var(--font-size-xs)' }}>{L('Waiting for confirmation…', 'Đang chờ xác nhận…', '확인을 기다리는 중…', '等待确认…')}</p>}
            {resetStatus?.message && <p style={{ color: resetStatus.ok ? 'var(--good)' : 'var(--warn)', fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>{resetStatus.message}</p>}
          </Section>}
          {!hasSettingsResult && <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{L('No matching settings.', 'Không có cài đặt phù hợp.', '일치하는 설정이 없습니다.', '没有匹配的设置。')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
