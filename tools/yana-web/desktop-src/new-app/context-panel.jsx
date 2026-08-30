import React from 'react';
import { L, Icons } from '../components.jsx';
import { providerAvailable } from '../lib/provider-config.js';
import { ChangesView } from './changes-view.jsx';

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
  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--ink)', fontWeight: 600 }}>
            {providers?.find((p) => p.id === (providerSel || provider))?.name || provider || '—'}
          </div>
          {model && <div title={model} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{shortModelName(model)}</div>}
        </div>
        {providers && setProviderSel && (
          <button onClick={() => setEditing(true)} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {L('Change', 'Đổi', '변경', '更改')}
          </button>
        )}
      </div>
    );
  }
  return (
    <>
      <select
        value={providerSel || provider || ''}
        onChange={(e) => setProviderSel(e.target.value)}
        style={{ width: '100%', fontSize: 'var(--font-size-sm)', background: 'var(--color-bg)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '6px 8px', marginBottom: 6 }}
      >
        {providers.filter((p) => !p.desktopOnly || window.innerWidth >= 860).map((p) => (
          <option key={p.id} value={p.id} disabled={!providerAvailable(p.id)}>{p.name}</option>
        ))}
      </select>
      {provider !== 'auto' && modelOptions?.length > 0 && (
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
      <button onClick={() => setEditing(false)} style={{ marginTop: 6, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
        {L('Done', 'Xong', '완료', '完成')}
      </button>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-size-sm)', padding: '3px 0' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}

function Pill({ tone, children }) {
  const colors = {
    good: { bg: 'color-mix(in srgb, var(--good) 15%, transparent)', fg: 'var(--good)' },
    warn: { bg: 'color-mix(in srgb, var(--warn) 15%, transparent)', fg: 'var(--warn)' },
  }[tone] || { bg: 'var(--border)', fg: 'var(--color-text-muted)' };
  return (
    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: colors.bg, color: colors.fg }}>
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

const TABS = ['context', 'files', 'changes', 'info'];

function NotYetAvailable({ label }) {
  return (
    <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
      {label} — {L('not yet available', 'chưa có sẵn', '아직 사용 불가', '尚不可用')}
    </div>
  );
}

export function ContextPanel({
  projectName, repoRoot, branch, modifiedCount, untrackedCount, changedFiles, onRefreshGit,
  provider, model, lastUsage, providerSel, setProviderSel, pickModel, modelOptions, providers,
  selection,
}) {
  const [tab, setTab] = React.useState('context');
  const changesCount = (modifiedCount ?? 0) + (untrackedCount ?? 0);

  // Universal Inspector (roadmap Phase 2 item 6): a real selection
  // auto-switches to Info so the panel actually reflects what the user
  // just clicked, instead of requiring a second manual tab click.
  const prevSelectionRef = React.useRef(null);
  React.useEffect(() => {
    if (selection && selection !== prevSelectionRef.current) setTab('info');
    prevSelectionRef.current = selection;
  }, [selection]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 'var(--font-size-sm)', fontWeight: tab === t ? 600 : 400,
              color: tab === t ? 'var(--primary)' : 'var(--color-text-muted)',
              borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
              textTransform: 'capitalize', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            {t}
            {t === 'changes' && changesCount > 0 && (
              <span style={{ fontSize: 10, background: 'var(--primary)', color: '#fff', borderRadius: 99, padding: '0 5px' }}>{changesCount}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'files' && <NotYetAvailable label="Files" />}
        {tab === 'changes' && (
          <div style={{ padding: '10px 14px' }}>
            <ChangesView repoRoot={repoRoot} files={changedFiles} onRefreshGit={onRefreshGit} />
          </div>
        )}
        {tab === 'info' && (
          selection ? (
            <Section title={L('Selection', 'Đã chọn', '선택 항목', '所选内容')}>
              <Row label={L('Kind', 'Loại', '종류', '类型')} value={selection.kind === 'ephemeral-ui' ? 'live UI event' : selection.kind === 'canonical' ? 'runtime event' : selection.kind} />
              <Row label={L('Time', 'Thời gian', '시간', '时间')} value={new Date(selection.timestamp).toLocaleTimeString()} />
              <Row label={L('Label', 'Nhãn', '라벨', '标签')} value={selection.label} />
              {selection.source && <Row label={L('Source', 'Nguồn', '출처', '来源')} value={selection.source} />}
            </Section>
          ) : (
            <NotYetAvailable label={L('Nothing selected', 'Chưa chọn gì', '선택된 항목 없음', '未选择任何内容')} />
          )
        )}
        {tab === 'context' && (
          <>
            <Section title={L('Repository', 'Repository', '리포지토리', '仓库')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-base)', color: 'var(--ink)', fontWeight: 600 }}>
                <span style={{ display: 'flex', color: 'var(--color-text-muted)' }}>{Icons.repo(15)}</span>
                {projectName || '—'}
                {branch && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>{Icons.gitBranch(12)}{branch}</span>}
              </div>
              {repoRoot && (
                <div title={repoRoot} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {repoRoot}
                </div>
              )}
            </Section>

            <Section title={L('Model', 'Model', '모델', '模型')}>
              <ModelSection
                provider={provider} model={model} providerSel={providerSel} setProviderSel={setProviderSel}
                pickModel={pickModel} modelOptions={modelOptions} providers={providers}
              />
            </Section>

            <Section title={L('Authority', 'Quyền hạn', '권한', '权限')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Safe Mode', 'Chế độ an toàn', '안전 모드', '安全模式')}</span>
                <Pill tone="good">ON</Pill>
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '6px 0' }}>
                {L('Permissions', 'Quyền', '권한', '权限')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {REAL_PERMISSIONS.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{p.label()}</span>
                    <Pill tone={p.tone}>{p.value()}</Pill>
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
        )}
      </div>
    </div>
  );
}
