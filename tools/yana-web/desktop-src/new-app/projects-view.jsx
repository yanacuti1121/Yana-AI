// Roadmap Phase 11 — Projects. The main process owns project selection and
// persistence: this view can ask it to open a native directory picker or
// switch only to a recorded recent project. It never accepts a typed path or
// accesses the filesystem directly from the renderer.
import React from 'react';
import { Icons, L } from '../components.jsx';
import { IS_ELECTRON } from '../lib/is-electron.js';
import { formatDateTime } from './locale-format.mjs';

function ProjectRow({ project, active, busy, onSwitch, language }) {
  return (
    <button
      onClick={() => onSwitch(project.root)}
      disabled={active || busy}
      title={project.root}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', textAlign: 'left',
        background: active ? 'var(--primary-soft)' : 'transparent', border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)', color: 'var(--ink)', cursor: active || busy ? 'default' : 'pointer',
        opacity: busy && !active ? 0.6 : 1,
      }}
    >
      <span style={{ display: 'flex', color: active ? 'var(--primary)' : 'var(--color-text-muted)' }}>{Icons.folder(16)}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{project.name}</span>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>{project.root}</span>
          {project.lastOpenedAt && <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 3 }}>{L('Last opened ', 'Mở gần nhất ', '최근 열기 ', '最近打开 ')}{formatDateTime(project.lastOpenedAt, language)}</span>}
      </span>
      {active && <span style={{ color: 'var(--primary)', fontSize: 'var(--font-size-xs)', flexShrink: 0 }}>{L('Current', 'Đang mở', '현재', '当前')}</span>}
    </button>
  );
}

export function ProjectsView({ projectInfo, onOpen, onSwitch, language }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  async function openProject() {
    setBusy(true);
    setError(null);
    const result = await onOpen();
    setBusy(false);
    if (!result?.ok && !result?.cancelled) setError(result?.error || L('Could not open the project.', 'Không thể mở dự án.', '프로젝트를 열 수 없습니다.', '无法打开项目。'));
  }

  async function switchProject(root) {
    setBusy(true);
    setError(null);
    const result = await onSwitch(root);
    setBusy(false);
    if (!result?.ok) setError(result?.error || L('Could not switch the project.', 'Không thể chuyển dự án.', '프로젝트를 전환할 수 없습니다.', '无法切换项目。'));
  }

  if (!IS_ELECTRON) {
    return (
      <div style={{ display: 'grid', height: '100%', placeItems: 'center', color: 'var(--color-text-muted)' }}>
        <p>{L('Projects are available in the desktop app.', 'Dự án chỉ có trong ứng dụng desktop.', '프로젝트는 데스크톱 앱에서 사용할 수 있습니다.', '项目仅在桌面应用中可用。')}</p>
      </div>
    );
  }

  const currentRoot = projectInfo?.root || null;
  const recent = Array.isArray(projectInfo?.recent) ? projectInfo.recent : [];
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px clamp(20px, 5vw, 56px)', color: 'var(--ink)' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: 650 }}>{L('Projects', 'Dự án', '프로젝트', '项目')}</h1>
            <p style={{ margin: '7px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
              {L('Choose a folder to make it the shared workspace for chat, files, Git, new terminals, and the IDE.', 'Chọn thư mục để dùng chung cho chat, tệp, Git, terminal mới và IDE.', '채팅, 파일, Git, 새 터미널 및 IDE가 공유할 폴더를 선택하세요.', '选择一个文件夹，供聊天、文件、Git、新终端和 IDE 共同使用。')}
            </p>
          </div>
          <button onClick={openProject} disabled={busy} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', padding: '8px 12px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.65 : 1 }}>
            {Icons.folder(15)} {L('Open project', 'Mở dự án', '프로젝트 열기', '打开项目')}
          </button>
        </div>

        <section style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '16px 18px', marginBottom: 28 }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 650, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 8 }}>{L('Current workspace', 'Không gian hiện tại', '현재 작업 공간', '当前工作区')}</div>
          {currentRoot ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 'var(--font-size-base)' }}>{Icons.folder(16)} {projectInfo.name}</div>
              <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>{currentRoot}</div>
            </>
          ) : <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{L('No workspace is available yet.', 'Chưa có không gian làm việc.', '아직 작업 공간이 없습니다.', '尚无工作区。')}</span>}
        </section>

        <section>
          <h2 style={{ fontSize: 'var(--font-size-base)', margin: '0 0 10px', fontWeight: 650 }}>{L('Recent projects', 'Dự án gần đây', '최근 프로젝트', '最近项目')}</h2>
          {recent.length ? (
            <div style={{ display: 'grid', gap: 8 }}>{recent.map((project) => <ProjectRow key={project.root} project={project} active={project.root === currentRoot} busy={busy} onSwitch={switchProject} language={language} />)}</div>
          ) : (
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{L('Projects you open will appear here. Yana stores only a folder reference, not a copy of your files.', 'Dự án đã mở sẽ hiện ở đây. Yana chỉ lưu tham chiếu thư mục, không sao chép tệp của bạn.', '열었던 프로젝트가 여기에 표시됩니다. Yana는 파일 복사본이 아니라 폴더 참조만 저장합니다.', '打开过的项目会显示在这里。Yana 仅保存文件夹引用，不会复制您的文件。')}</p>
          )}
        </section>
        {error && <p role="alert" style={{ marginTop: 16, color: 'var(--warn)', fontSize: 'var(--font-size-sm)' }}>{error}</p>}
      </div>
    </div>
  );
}
