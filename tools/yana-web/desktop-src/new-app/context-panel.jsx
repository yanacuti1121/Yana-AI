import React from 'react';
import { L, Icons } from '../components.jsx';
import { IS_ELECTRON } from '../lib/is-electron.js';
import { providerAvailable } from '../lib/provider-config.js';
import { ChangesView } from './changes-view.jsx';
import { ActivityPanel } from './activity-panel.jsx';

// Twin of header.jsx's own shortModelName() — small enough (one line) to
// duplicate rather than add a shared-util import graph for.
function shortModelName(model) {
  if (!model) return null;
  const afterSlash = model.includes('/') ? model.split('/').pop() : model;
  return afterSlash.split(':')[0];
}

// Context = glance at current state, not a settings page — real
// provider/model selection stays available (click "Change"), but the
// resting state is compact text, not two always-open <select>s.
function ModelSection({ provider, model, providerSel, setProviderSel, pickModel, modelOptions, providers }) {
  const [editing, setEditing] = React.useState(false);
  const effectiveProvider = providerSel || provider;
  const selectedProvider = providers?.find((item) => item.id === effectiveProvider);
  if (!editing) {
    return (
      <div className="na-model-summary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--ink)', fontWeight: 600 }}>
            {selectedProvider?.name || effectiveProvider || '—'}
          </div>
          {model && <div title={model} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortModelName(model)}</div>}
        </div>
        {providers && setProviderSel && (
          <button className="na-inline-action" onClick={() => setEditing(true)} type="button" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
            {L('Change', 'Đổi', '변경', '更改')}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="na-model-editor">
      <select
        value={effectiveProvider || ''}
        onChange={(e) => setProviderSel(e.target.value)}
        style={{ width: '100%', fontSize: 'var(--font-size-sm)', background: 'var(--color-bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 8px', marginBottom: 6 }}
      >
        {providers.filter((p) => !p.desktopOnly || window.innerWidth >= 860).map((p) => (
          <option key={p.id} value={p.id} disabled={p.id !== 'custom' && !providerAvailable(p.id)}>{p.name}</option>
        ))}
      </select>
      {effectiveProvider !== 'auto' && modelOptions?.length > 0 && (
        <select
          value={model || ''}
          onChange={(e) => pickModel(e.target.value)}
          style={{ width: '100%', fontSize: 'var(--font-size-sm)', background: 'var(--color-bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 8px' }}
        >
          {(modelOptions.includes(model) ? modelOptions : [model, ...modelOptions]).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
      <button className="na-inline-action" onClick={() => setEditing(false)} type="button" style={{ marginTop: 6, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
        {L('Done', 'Xong', '완료', '完成')}
      </button>
    </div>
  );
}

function Section({ title, children, className = '' }) {
  return (
    <section className={`na-inspector-section ${className}`} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
      <div className="na-inspector-section-title" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="na-inspector-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 'var(--font-size-sm)', padding: '3px 0' }}>
      <span style={{ color: 'var(--color-text-muted)', minWidth: 0 }}>{label}</span>
      <span style={{ color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function SummaryMetric({ label, value }) {
  return (
    <div className="na-inspector-metric" style={{ minWidth: 0, flex: 1, padding: '8px 6px', textAlign: 'center' }}>
      <div style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 'var(--font-size-base)' }}>{value}</div>
      <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Pill({ tone, children }) {
  const colors = {
    good: { bg: 'color-mix(in srgb, var(--good) 15%, transparent)', fg: 'var(--good)' },
    warn: { bg: 'color-mix(in srgb, var(--warn) 15%, transparent)', fg: 'var(--warn)' },
  }[tone] || { bg: 'var(--border)', fg: 'var(--color-text-muted)' };
  return (
    <span className="na-status-pill" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: colors.bg, color: colors.fg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

// Mirrors `src/capability/registry_data.rs`'s real, current
// ApprovalRequirement values (verified by reading that file — only 10
// capabilities exist today, exactly these two approval shapes relevant
// to what a user does through this app). Not queried live — a fixed
// security-policy fact compiled into the runtime. Update only if the
// registry itself grows a distinct capability.
const REAL_PERMISSIONS = [
  { label: () => L('Read Files', 'Đọc tệp', '파일 읽기', '读取文件'), tone: 'good', value: () => L('Allowed', 'Cho phép', '허용됨', '允许') },
  { label: () => 'Git Status', tone: 'good', value: () => L('Allowed', 'Cho phép', '허용됨', '允许') },
  { label: () => L('Run Commands', 'Chạy lệnh', '명령 실행', '运行命令'), tone: 'warn', value: () => L('Requires approval', 'Cần phê duyệt', '승인 필요', '需要批准') },
];

const TABS = [
  { id: 'inspector', label: () => L('Inspector', 'Kiểm tra', '검사기', '检查器') },
  { id: 'context', label: () => L('Context', 'Ngữ cảnh', '컨텍스트', '上下文') },
  { id: 'models', label: () => L('AI Models', 'Mô hình AI', 'AI 모델', 'AI 模型') },
];

function safetyTone(mode) {
  if (mode === 'normal') return 'good';
  if (mode === 'halted') return 'warn';
  if (typeof mode === 'string' && mode.startsWith('quarantine:')) return 'warn';
  return 'neutral';
}

function safetyLabel(mode) {
  if (mode === 'normal') return L('Normal', 'Bình thường', '정상', '正常');
  if (mode === 'halted') return L('Halted', 'Đã dừng', '중지됨', '已停止');
  if (typeof mode === 'string' && mode.startsWith('quarantine:')) return L('Quarantined', 'Cách ly', '격리됨', '已隔离');
  return mode || '—';
}

function timestampLabel(timestamp) {
  if (typeof timestamp !== 'number') return '—';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString();
}

function SelectionSection({ selection }) {
  if (!selection) return null;

  const kind = selection.kind === 'ephemeral-ui'
    ? L('Live UI event', 'Sự kiện UI trực tiếp', '실시간 UI 이벤트', '实时 UI 事件')
    : selection.kind === 'canonical'
      ? L('Runtime event', 'Sự kiện runtime', '런타임 이벤트', '运行时事件')
      : selection.kind || '—';

  return (
    <Section title={L('Selected item', 'Mục đã chọn', '선택된 항목', '所选项目')} className="na-inspector-selection">
      <Row label={L('Kind', 'Loại', '종류', '类型')} value={kind} />
      <Row label={L('Time', 'Thời gian', '시간', '时间')} value={timestampLabel(selection.timestamp)} />
      <Row label={L('Label', 'Nhãn', '라벨', '标签')} value={selection.label || '—'} />
      {selection.source && <Row label={L('Source', 'Nguồn', '출처', '来源')} value={selection.source} />}
    </Section>
  );
}

function ProjectSection({ projectName, repoRoot, branch }) {
  return (
    <Section title={L('Project', 'Dự án', '프로젝트', '项目')} className="na-inspector-project-section">
      <div className="na-inspector-project" style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <span style={{ display: 'flex', color: 'var(--primary)', marginTop: 2 }}>{Icons.repo(16)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--ink)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName || '—'}</div>
          {branch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
              {Icons.gitBranch(12)}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{branch}</span>
            </div>
          )}
          {repoRoot && (
            <div title={repoRoot} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {repoRoot}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function TaskSnapshot({ onOpenTasks }) {
  const [state, setState] = React.useState({ loading: true, tasks: [], error: null });

  const refresh = React.useCallback(() => {
    if (!IS_ELECTRON || !window.yana?.taskList) {
      setState({ loading: false, tasks: [], error: null });
      return;
    }
    window.yana.taskList().then((result) => {
      if (result?.ok && Array.isArray(result.tasks)) {
        setState({ loading: false, tasks: result.tasks, error: null });
      } else {
        setState({ loading: false, tasks: [], error: result?.error || L('Tasks unavailable', 'Không thể tải việc', '작업을 사용할 수 없음', '任务不可用') });
      }
    }).catch(() => {
      setState({ loading: false, tasks: [], error: L('Tasks unavailable', 'Không thể tải việc', '작업을 사용할 수 없음', '任务不可用') });
    });
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  if (!IS_ELECTRON) return null;

  const active = state.tasks.filter((task) => task.status !== 'done').slice(0, 4);
  return (
    <Section title={L('Tasks', 'Việc', '작업', '任务')} className="na-inspector-tasks-section">
      {state.loading ? (
        <p className="na-inspector-empty">{L('Loading tasks…', 'Đang tải việc…', '작업을 불러오는 중…', '正在加载任务…')}</p>
      ) : state.error ? (
        <p className="na-inspector-empty na-inspector-error">{state.error}</p>
      ) : active.length === 0 ? (
        <p className="na-inspector-empty">{L('No open tasks.', 'Không có việc đang mở.', '열린 작업이 없습니다.', '没有未完成任务。')}</p>
      ) : (
        <div className="na-inspector-task-list">
          {active.map((task) => (
            <div className="na-inspector-task" key={task.id}>
              <span aria-hidden="true" className={`na-inspector-task-status is-${task.status || 'open'}`}>
                {task.status === 'blocked' ? '!' : task.status === 'in_progress' ? '•' : '○'}
              </span>
              <span title={task.name} className="na-inspector-task-name">{task.name}</span>
            </div>
          ))}
        </div>
      )}
      {onOpenTasks && (
        <button className="na-inline-action na-inspector-section-action" type="button" onClick={onOpenTasks}>
          {L('View tasks', 'Xem việc', '작업 보기', '查看任务')}
        </button>
      )}
    </Section>
  );
}

function InspectorView({
  projectName, repoRoot, branch, modifiedCount, untrackedCount, changedFiles, onRefreshGit, selection,
  onViewActivity, onSelectActivityEvent, onOpenTasks,
}) {
  const changeCount = Array.isArray(changedFiles) ? changedFiles.length : '—';

  return (
    <>
      <SelectionSection selection={selection} />
      <ProjectSection projectName={projectName} repoRoot={repoRoot} branch={branch} />
      <Section title={L('Summary', 'Tóm tắt', '요약', '摘要')} className="na-inspector-summary-section">
        <div className="na-inspector-metrics" style={{ display: 'flex', gap: 4 }}>
          <SummaryMetric label={L('Changed', 'Đã đổi', '변경됨', '已更改')} value={changeCount} />
          <SummaryMetric label={L('Modified', 'Đã sửa', '수정됨', '已修改')} value={modifiedCount ?? '—'} />
          <SummaryMetric label={L('Untracked', 'Chưa theo dõi', '추적 안 됨', '未跟踪')} value={untrackedCount ?? '—'} />
        </div>
      </Section>
      <Section title={L('Git Status', 'Trạng thái Git', 'Git 상태', 'Git 状态')} className="na-inspector-git-section">
        <ChangesView repoRoot={repoRoot} files={changedFiles} onRefreshGit={onRefreshGit} />
      </Section>
      <section className="na-inspector-activity-section">
        <ActivityPanel
          limit={5}
          onViewAll={onViewActivity}
          onSelect={onSelectActivityEvent}
          selectedId={selection?.id}
        />
      </section>
      <TaskSnapshot onOpenTasks={onOpenTasks} />
    </>
  );
}

function ContextView({ projectName, repoRoot, branch, modifiedCount, untrackedCount, lastUsage, governance }) {
  return (
    <>
      <ProjectSection projectName={projectName} repoRoot={repoRoot} branch={branch} />
      <Section title={L('Authority', 'Quyền hạn', '권한', '权限')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Safety state', 'Trạng thái an toàn', '안전 상태', '安全状态')}</span>
          <Pill tone={safetyTone(governance?.safety?.mode)}>{safetyLabel(governance?.safety?.mode)}</Pill>
        </div>
        {governance?.autonomy ? (
          <>
            <Row label={L('Automatic actions', 'Hành động tự động', '자동 작업', '自动操作')} value={governance.autonomy.enabled ? L('Enabled', 'Đã bật', '활성화됨', '已启用') : L('Disabled', 'Đã tắt', '비활성화됨', '已禁用')} />
            <Row label={L('Autonomy ceiling', 'Mức tự chủ tối đa', '자율성 상한', '自主性上限')} value={governance.autonomy.max_automatic_level} />
            <Row label={L('Max attempts', 'Số lần thử tối đa', '최대 시도 횟수', '最大尝试次数')} value={governance.autonomy.max_attempts} />
          </>
        ) : (
          <Row label={L('Autonomy policy', 'Chính sách tự chủ', '자율성 정책', '自主性策略')} value="—" />
        )}
        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '10px 0 6px' }}>
          {L('Permissions', 'Quyền', '권한', '权限')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {REAL_PERMISSIONS.map((permission) => (
            <div key={permission.label()} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{permission.label()}</span>
              <Pill tone={permission.tone}>{permission.value()}</Pill>
            </div>
          ))}
        </div>
      </Section>
      <Section title={L('Context Usage', 'Sử dụng ngữ cảnh', '컨텍스트 사용량', '上下文使用量')}>
        {lastUsage ? (
          <Row label={L('Last turn', 'Lượt gần nhất', '최근 턴', '最近一轮')} value={`${lastUsage.input_tokens} in / ${lastUsage.output_tokens} out`} />
        ) : (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
            {L('No usage data yet', 'Chưa có dữ liệu sử dụng', '아직 사용량 데이터 없음', '尚无使用数据')}
          </p>
        )}
      </Section>
      <Section title={L('Workspace', 'Workspace', '워크스페이스', '工作区')}>
        <Row label={L('Branch', 'Nhánh', '브랜치', '分支')} value={branch || '—'} />
        <Row label={L('Modified', 'Đã sửa', '수정됨', '已修改')} value={modifiedCount ?? '—'} />
        <Row label={L('Untracked', 'Chưa theo dõi', '추적 안 됨', '未跟踪')} value={untrackedCount ?? '—'} />
      </Section>
    </>
  );
}

function ModelsView({ provider, model, providerSel, setProviderSel, pickModel, modelOptions, providers, lastUsage, onOpenModels }) {
  return (
    <>
      <Section title={L('Active model', 'Mô hình đang dùng', '활성 모델', '当前模型')} className="na-inspector-model-section">
        <ModelSection
          provider={provider}
          model={model}
          providerSel={providerSel}
          setProviderSel={setProviderSel}
          pickModel={pickModel}
          modelOptions={modelOptions}
          providers={providers}
        />
      </Section>
      {onOpenModels && (
        <Section title={L('Model library', 'Thư viện model', '모델 라이브러리', '模型库')}>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
            {L('Add a provider model or manage the models available to Yana.', 'Thêm model của provider hoặc quản lý model Yana có thể dùng.', '프로바이더 모델을 추가하거나 Yana에서 사용할 수 있는 모델을 관리합니다.', '添加提供商模型或管理 Yana 可用的模型。')}
          </p>
          <button type="button" onClick={onOpenModels} style={{ border: '1px solid var(--primary)', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary)', padding: '6px 10px', cursor: 'pointer', font: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
            {L('+ Add model', '+ Thêm model', '+ 모델 추가', '+ 添加模型')}
          </button>
        </Section>
      )}
      <Section title={L('Usage', 'Sử dụng', '사용량', '用量')}>
        {lastUsage ? (
          <Row label={L('Last turn', 'Lượt gần nhất', '최근 턴', '最近一轮')} value={`${lastUsage.input_tokens} in / ${lastUsage.output_tokens} out`} />
        ) : (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
            {L('No usage data yet', 'Chưa có dữ liệu sử dụng', '아직 사용량 데이터 없음', '尚无使用数据')}
          </p>
        )}
      </Section>
    </>
  );
}

export function ContextPanel({
  projectName, repoRoot, branch, modifiedCount, untrackedCount, changedFiles, onRefreshGit,
  provider, model, lastUsage, providerSel, setProviderSel, pickModel, modelOptions, providers,
  governance, selection, onViewActivity, onSelectActivityEvent, onOpenTasks, onOpenModels,
}) {
  const [tab, setTab] = React.useState('inspector');
  const prevSelectionRef = React.useRef(null);
  React.useEffect(() => {
    if (selection && selection !== prevSelectionRef.current) setTab('inspector');
    prevSelectionRef.current = selection;
  }, [selection]);

  return (
    <aside className="na-inspector-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div className="na-inspector-tabs" role="tablist" aria-label={L('Workspace inspector tabs', 'Các tab kiểm tra workspace', '워크스페이스 검사기 탭', '工作区检查器标签')} style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`na-inspector-tab${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
            style={{
              flex: 1, padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 'var(--font-size-sm)', fontWeight: tab === item.id ? 600 : 400,
              color: tab === item.id ? 'var(--primary)' : 'var(--color-text-muted)',
              borderBottom: tab === item.id ? '2px solid var(--primary)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, whiteSpace: 'nowrap',
            }}
          >
            {item.label()}
          </button>
        ))}
      </div>

      <div className="na-inspector-content" role="tabpanel" style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'inspector' && (
          <InspectorView
            projectName={projectName}
            repoRoot={repoRoot}
            branch={branch}
            modifiedCount={modifiedCount}
            untrackedCount={untrackedCount}
            changedFiles={changedFiles}
            onRefreshGit={onRefreshGit}
            selection={selection}
            onViewActivity={onViewActivity}
            onSelectActivityEvent={onSelectActivityEvent}
            onOpenTasks={onOpenTasks}
          />
        )}
        {tab === 'context' && (
          <ContextView
            projectName={projectName}
            repoRoot={repoRoot}
            branch={branch}
            modifiedCount={modifiedCount}
            untrackedCount={untrackedCount}
            lastUsage={lastUsage}
            governance={governance}
          />
        )}
        {tab === 'models' && (
          <ModelsView
            provider={provider}
            model={model}
            providerSel={providerSel}
            setProviderSel={setProviderSel}
            pickModel={pickModel}
            modelOptions={modelOptions}
            providers={providers}
            lastUsage={lastUsage}
            onOpenModels={onOpenModels}
          />
        )}
      </div>
    </aside>
  );
}
