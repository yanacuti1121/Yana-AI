// Roadmap Phase 12 — a small, real settings foundation. This deliberately
// exposes only preferences and destinations that have a live effect today;
// runtime governance, secrets, and developer diagnostics stay outside this
// normal-user surface until their canonical backend controls exist.
import React from 'react';
import { Icons, L } from '../components.jsx';

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

function LinkRow({ title, description, action }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <div><div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 550 }}>{title}</div><div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 3 }}>{description}</div></div>
      {action && <button onClick={action} style={{ flexShrink: 0, border: '1px solid var(--border)', background: 'transparent', color: 'var(--primary)', borderRadius: 'var(--r-sm)', padding: '5px 9px', cursor: 'pointer' }}>{L('Open', 'Mở', '열기', '打开')}</button>}
    </div>
  );
}

export function SettingsView({ preferences, onChange, onNavigate, onFocusTerminal }) {
  const [query, setQuery] = React.useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (keywords) => !normalizedQuery || keywords.toLocaleLowerCase().includes(normalizedQuery);
  const visible = {
    appearance: matches('appearance theme navy ocean obsidian jade'),
    language: matches('language locale region vietnamese korean chinese english'),
    workspace: matches('projects workspace folders terminal providers models privacy permissions'),
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px clamp(20px, 5vw, 56px)', color: 'var(--ink)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: 650 }}>{L('Settings', 'Cài đặt', '설정', '设置')}</h1>
        <p style={{ margin: '7px 0 18px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Presentation preferences are separate from Yana runtime policy and encrypted provider credentials.', 'Tùy chọn hiển thị tách biệt khỏi policy runtime Yana và credential provider đã mã hóa.', '표시 환경설정은 Yana 런타임 정책 및 암호화된 프로바이더 자격 증명과 분리됩니다.', '显示偏好与 Yana 运行时策略及加密提供商凭据分离。')}</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '7px 10px', marginBottom: 18, color: 'var(--color-text-muted)' }}>
          {Icons.search(15)}
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={L('Search settings', 'Tìm cài đặt', '설정 검색', '搜索设置')} aria-label={L('Search settings', 'Tìm cài đặt', '설정 검색', '搜索设置')} style={{ border: 'none', outline: 'none', minWidth: 0, flex: 1, background: 'transparent', color: 'var(--ink)', font: 'inherit', fontSize: 'var(--font-size-sm)' }} />
        </label>
        <div style={{ display: 'grid', gap: 14 }}>
          {visible.appearance && <Section title={L('Appearance', 'Giao diện', '모양', '外观')} description={L('Theme changes apply to this new workspace immediately.', 'Đổi theme áp dụng ngay cho workspace mới này.', '테마 변경은 이 새 작업 공간에 즉시 적용됩니다.', '主题更改会立即应用到此新工作区。')}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                ['navy', L('Midnight Navy', 'Xanh navy đêm', '미드나이트 네이비', '午夜海军蓝')],
                ['ocean', L('Deep Ocean', 'Biển sâu', '깊은 바다', '深海')],
                ['obsidian', L('Obsidian', 'Hắc diện thạch', '흑요석', '黑曜石')],
                ['jade', L('Jade Lake', 'Hồ ngọc bích', '비취 호수', '翡翠湖')],
              ].map(([id, label]) => <button key={id} onClick={() => onChange({ theme: id })} aria-pressed={preferences.theme === id} style={{ border: preferences.theme === id ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '7px 10px', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}>{label}</button>)}
            </div>
          </Section>}
          {visible.language && <Section title={L('Language & region', 'Ngôn ngữ & khu vực', '언어 및 지역', '语言与地区')} description={L('Interface language changes immediately; new workspace dates use the selected locale.', 'Ngôn ngữ giao diện đổi ngay; ngày trong workspace mới dùng locale đã chọn.', '인터페이스 언어는 즉시 변경되며 새 작업 공간의 날짜는 선택한 로캘을 사용합니다.', '界面语言会立即更改；新工作区中的日期使用所选区域设置。')}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 'var(--font-size-sm)' }}>
              {L('Language', 'Ngôn ngữ', '언어', '语言')}
              <select value={preferences.language} onChange={(event) => onChange({ language: event.target.value })} style={{ background: 'var(--color-bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '5px 8px', font: 'inherit' }}>
                {LANGUAGE_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
          </Section>}
          {visible.workspace && <Section title={L('Workspace', 'Không gian làm việc', '작업 공간', '工作区')} description={L('Open live surfaces instead of duplicating their state in Settings.', 'Mở các surface thật thay vì sao chép state vào Settings.', '설정에 상태를 복제하지 않고 실제 화면을 엽니다.', '打开真实界面，而不在设置中复制状态。')}>
            <LinkRow title={L('Projects', 'Dự án', '프로젝트', '项目')} description={L('Choose the folder shared by chat, files, Git, new terminals, and the IDE.', 'Chọn thư mục dùng chung cho chat, tệp, Git, terminal mới và IDE.', '채팅, 파일, Git, 새 터미널 및 IDE가 공유할 폴더를 선택합니다.', '选择聊天、文件、Git、新终端和 IDE 共享的文件夹。')} action={() => onNavigate('projects')} />
            <LinkRow title={L('Terminal', 'Terminal', '터미널', '终端')} description={L('Adjust shell presentation in the terminal dock. Human shells remain separate from governed AI execution.', 'Chỉnh hiển thị shell trong terminal dock. Shell người dùng vẫn tách biệt khỏi thực thi AI có governance.', '터미널 도크에서 셸 표시를 조정합니다. 사람 셸은 거버넌스가 적용된 AI 실행과 분리됩니다.', '在终端停靠栏中调整 shell 显示。人类 shell 与受治理的 AI 执行保持分离。')} action={onFocusTerminal} />
            <LinkRow title={L('Providers & models', 'Provider & model', '프로바이더 및 모델', '提供商与模型')} description={L('Configure API credentials through the encrypted YanaVault surface; discover models from supported providers.', 'Cấu hình credential API qua YanaVault mã hóa; khám phá model từ provider hỗ trợ.', '암호화된 YanaVault 화면에서 API 자격 증명을 구성하고 지원되는 프로바이더의 모델을 검색합니다.', '通过加密的 YanaVault 界面配置 API 凭据，并从受支持的提供商发现模型。')} action={() => onNavigate('models')} />
            <LinkRow title={L('Permissions & autonomy', 'Quyền & tự chủ', '권한 및 자율성', '权限与自主性')} description={L('Current approval rules are shown in the Context panel. An editable autonomy level will appear only when the runtime provides one.', 'Rule approval hiện hiển thị ở Context. Mức tự chủ chỉnh được chỉ xuất hiện khi runtime cung cấp.', '현재 승인 규칙은 Context 패널에 표시됩니다. 런타임이 제공할 때만 편집 가능한 자율성 수준이 나타납니다.', '当前审批规则显示在 Context 面板中。只有运行时提供后才会显示可编辑的自主级别。')} />
          </Section>}
          {!visible.appearance && !visible.language && !visible.workspace && <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{L('No matching settings.', 'Không có cài đặt phù hợp.', '일치하는 설정이 없습니다.', '没有匹配的设置。')}</p>}
        </div>
      </div>
    </div>
  );
}
