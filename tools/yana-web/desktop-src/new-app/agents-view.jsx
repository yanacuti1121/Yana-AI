import React from 'react';
import { L } from '../components.jsx';
import { filterAgentCatalog, groupAgentsByCategory, normalizeAgentCatalog } from './agent-catalog.mjs';

function titleCase(value) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AgentsView() {
  const [status, setStatus] = React.useState('loading');
  const [agents, setAgents] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState('all');

  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/agents', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`agent catalog request failed (${response.status})`);
        return response.json();
      })
      .then((payload) => {
        setAgents(normalizeAgentCatalog(payload));
        setStatus('ready');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setStatus('error');
      });
    return () => controller.abort();
  }, []);

  const categories = React.useMemo(
    () => [...new Set(agents.map((agent) => agent.category))].sort((a, b) => a.localeCompare(b)),
    [agents],
  );
  const visible = React.useMemo(() => filterAgentCatalog(agents, query, category), [agents, query, category]);
  const grouped = React.useMemo(() => groupAgentsByCategory(visible), [visible]);

  return (
    <section aria-label={L('Agents', 'Agent', '에이전트', '智能体')} style={{ height: '100%', overflowY: 'auto', padding: 'clamp(18px, 3vw, 34px)', maxWidth: 1180, margin: '0 auto' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 22 }}>
        <div>
          <p style={{ margin: 0, color: 'var(--primary)', fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {L('Runtime catalog', 'Danh mục runtime', '런타임 카탈로그', '运行时目录')}
          </p>
          <h1 style={{ margin: '5px 0 6px', color: 'var(--ink)', fontSize: 'clamp(22px, 3vw, 30px)', letterSpacing: '-0.025em' }}>
            {L('Agents', 'Agent', '에이전트', '智能体')}
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', maxWidth: 640 }}>
            {L(
              'Read-only roles loaded from Yana’s canonical agent catalog. Running an agent remains governed by the runtime.',
              'Vai trò chỉ đọc được tải từ danh mục agent chuẩn của Yana. Việc chạy agent vẫn do runtime quản trị.',
              'Yana의 표준 에이전트 카탈로그에서 불러온 읽기 전용 역할입니다. 에이전트 실행은 런타임이 계속 관리합니다.',
              '从 Yana 的规范智能体目录加载的只读角色。智能体执行仍由运行时治理。',
            )}
          </p>
        </div>
        {status === 'ready' && (
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', border: '1px solid var(--border)', borderRadius: 99, padding: '5px 10px' }}>
            {L(`${agents.length} available`, `${agents.length} khả dụng`, `${agents.length}개 사용 가능`, `${agents.length} 个可用`)}
          </span>
        )}
      </header>

      {status === 'loading' && <p role="status" style={{ color: 'var(--color-text-muted)' }}>{L('Loading agent catalog…', 'Đang tải danh mục agent…', '에이전트 카탈로그를 불러오는 중…', '正在加载智能体目录…')}</p>}
      {status === 'error' && (
        <div role="alert" style={{ padding: 14, border: '1px solid var(--warn)', borderRadius: 'var(--r-md)', color: 'var(--ink)', background: 'var(--color-bg-subtle)' }}>
          {L('The runtime agent catalog is unavailable. No agent list is shown.', 'Không tải được danh mục agent từ runtime. Không hiển thị danh sách agent.', '런타임 에이전트 카탈로그를 사용할 수 없습니다. 에이전트 목록은 표시되지 않습니다.', '运行时智能体目录不可用。未显示智能体列表。')}
        </div>
      )}
      {status === 'ready' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 18 }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={L('Search roles or capabilities', 'Tìm vai trò hoặc năng lực', '역할 또는 역량 검색', '搜索角色或能力')}
              aria-label={L('Search agents', 'Tìm agent', '에이전트 검색', '搜索智能体')}
              style={{ flex: '1 1 240px', minWidth: 0, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '8px 10px', background: 'var(--color-bg-subtle)', color: 'var(--ink)' }}
            />
            <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label={L('Filter agents by category', 'Lọc agent theo nhóm', '카테고리별 에이전트 필터', '按类别筛选智能体')} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '8px 10px', background: 'var(--color-bg-subtle)', color: 'var(--ink)' }}>
              <option value="all">{L('All categories', 'Tất cả nhóm', '모든 카테고리', '所有类别')}</option>
              {categories.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
          </div>
          {grouped.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)' }}>{L('No agents match this filter.', 'Không có agent phù hợp bộ lọc.', '이 필터와 일치하는 에이전트가 없습니다.', '没有智能体符合此筛选条件。')}</p>
          ) : grouped.map(([group, entries]) => (
            <section key={group} style={{ marginBottom: 24 }}>
              <h2 style={{ margin: '0 0 9px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{titleCase(group)} · {entries.length}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                {entries.map((agent) => (
                  <article key={`${agent.category}/${agent.name}`} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--color-bg-subtle)' }}>
                    <h3 style={{ margin: 0, color: 'var(--ink)', fontSize: 'var(--font-size-base)' }}>{agent.name}</h3>
                    <p style={{ margin: '7px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>{agent.description}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
          <p style={{ borderTop: '1px solid var(--border)', margin: '26px 0 0', paddingTop: 14, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', lineHeight: 1.45 }}>
            {L(
              'Agent activity and configuration are intentionally not shown here: the current runtime event envelope does not identify an agent, and no user-safe configuration API is available yet.',
              'Hoạt động và cấu hình agent chủ ý chưa hiển thị tại đây: event runtime hiện chưa nhận diện agent và chưa có API cấu hình an toàn cho người dùng.',
              '현재 런타임 이벤트 봉투에는 에이전트 식별 정보가 없고 사용자 안전 구성 API도 없으므로 에이전트 활동과 구성은 의도적으로 표시하지 않습니다.',
              '当前运行时事件信封不包含智能体身份，且尚无面向用户的安全配置 API，因此此处有意不显示智能体活动和配置。',
            )}
          </p>
        </>
      )}
    </section>
  );
}
