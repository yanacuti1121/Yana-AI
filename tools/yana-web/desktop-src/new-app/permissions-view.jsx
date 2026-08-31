// Roadmap Phase 16 — Permissions & Autonomy. Three real, backend-backed
// sections, no fake controls:
//   1. Capability registry (item 61, Permission Inspector) — every
//      capability yana-rt's RuntimeAuthority can decide on, read via the
//      new `yana-rt capability list --root <root>`.
//   2. Pending approvals (item 62, Approval UI) — READ-ONLY. There is no
//      CLI path today to approve/deny an approval from outside the turn
//      that's actually paused on it — that's a real backend gap, not a
//      button this view fakes.
//   3. Active leases (item 63, Autonomy Controls) — list + Revoke. Granting
//      a *new* lease from this view is a separate, later piece (needs a
//      real subject/allow/deny editor, not a quick add-on here).
// Safety Mode (item 64) already renders elsewhere in this shell
// (header.jsx / context-panel.jsx / sidebar.jsx via governanceStatus()) —
// not duplicated here.
import React from 'react';
import { L, Icons } from '../components.jsx';
import { IS_ELECTRON } from '../lib/is-electron.js';

const ACCESS_LABEL = {
  read_only: () => L('Read-only', 'Chỉ đọc', '읽기 전용', '只读'),
  mutating: () => L('Mutating', 'Thay đổi trạng thái', '변경 작업', '会修改状态'),
};
const RISK_COLOR = { low: 'var(--good)', medium: 'var(--warn)', high: 'var(--danger, var(--warn))' };
const RISK_LABEL = {
  low: () => L('Low', 'Thấp', '낮음', '低'),
  medium: () => L('Medium', 'Trung bình', '중간', '中'),
  high: () => L('High', 'Cao', '높음', '高'),
};

function Badge({ children, color }) {
  return (
    <span style={{ fontSize: 'var(--font-size-xs)', color: color || 'var(--color-text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '1px 7px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function SectionHeading({ children, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
      <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{children}</h2>
      {hint && <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>{hint}</p>}
    </div>
  );
}

function CapabilityRow({ cap }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <code style={{ fontSize: 'var(--font-size-sm)', color: 'var(--ink)', fontWeight: 600 }}>{cap.name}</code>
        <Badge>{ACCESS_LABEL[cap.accessMode]?.() || cap.accessMode}</Badge>
        <Badge color={RISK_COLOR[cap.riskTier]}>{RISK_LABEL[cap.riskTier]?.() || cap.riskTier}</Badge>
        {cap.approval === 'human_approval_per_call' && (
          <Badge color="var(--primary)">{L('Needs approval', 'Cần phê duyệt', '승인 필요', '需要审批')}</Badge>
        )}
        <span style={{ fontSize: 'var(--font-size-xs)', color: cap.available ? 'var(--good)' : 'var(--color-text-muted)', marginLeft: 'auto' }}>
          {cap.available ? L('Available now', 'Đang khả dụng', '지금 사용 가능', '当前可用') : L('Unavailable now', 'Hiện chưa khả dụng', '현재 사용 불가', '当前不可用')}
        </span>
      </div>
      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>{cap.description}</p>
    </div>
  );
}

function ApprovalRow({ approval }) {
  const call = approval.pending_call || {};
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <code style={{ fontSize: 'var(--font-size-sm)', color: 'var(--ink)', fontWeight: 600 }}>{call.name || '?'}</code>
        <Badge>{approval.context?.origin || '?'}</Badge>
        {approval.context?.agent_id && <Badge>{approval.context.agent_id}</Badge>}
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
          {approval.expires_at && new Date(approval.expires_at).toLocaleString()}
        </span>
      </div>
      {approval.authority_reason && (
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>{approval.authority_reason}</p>
      )}
      {call.arguments_json && (
        <code style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', background: 'var(--surface-1)', padding: '4px 6px', borderRadius: 'var(--r-sm)', overflowX: 'auto', whiteSpace: 'pre' }}>
          {call.arguments_json}
        </code>
      )}
    </div>
  );
}

function leaseStatus(lease) {
  if (lease.revoked) return { key: 'revoked', label: L('Revoked', 'Đã thu hồi', '취소됨', '已撤销'), color: 'var(--color-text-muted)' };
  if (lease.remaining === 0) return { key: 'exhausted', label: L('Budget exhausted', 'Hết hạn mức', '예산 소진', '额度已用尽'), color: 'var(--warn)' };
  if (lease.expires_at && new Date(lease.expires_at).getTime() < Date.now()) {
    return { key: 'expired', label: L('Expired', 'Đã hết hạn', '만료됨', '已过期'), color: 'var(--color-text-muted)' };
  }
  return { key: 'active', label: L('Active', 'Đang hiệu lực', '활성', '生效中'), color: 'var(--good)' };
}

function LeaseRow({ lease, onRevoke, busy }) {
  const status = leaseStatus(lease);
  const canRevoke = status.key === 'active' || status.key === 'exhausted';
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <code style={{ fontSize: 'var(--font-size-sm)', color: 'var(--ink)', fontWeight: 600 }}>{lease.subject}</code>
        <Badge>{lease.capability}</Badge>
        <Badge color={status.color}>{status.label}</Badge>
        {canRevoke && (
          <button
            onClick={() => onRevoke(lease.id)}
            disabled={busy}
            style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '2px 8px', fontSize: 'var(--font-size-xs)', color: 'var(--warn)', cursor: busy ? 'default' : 'pointer' }}
          >
            {L('Revoke', 'Thu hồi', '취소', '撤销')}
          </button>
        )}
      </div>
      {lease.allow?.length > 0 && (
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
          {L('Allowed: ', 'Cho phép: ', '허용: ', '允许：')}{lease.allow.join(', ')}
        </p>
      )}
    </div>
  );
}

export function PermissionsView() {
  const [capabilities, setCapabilities] = React.useState(null); // null = loading
  const [approvals, setApprovals] = React.useState(null);
  const [leases, setLeases] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(() => {
    window.yana.listCapabilities().then((result) => {
      if (result.ok) setCapabilities(result.capabilities);
      else { setError(result.error); setCapabilities([]); }
    });
    window.yana.listPendingApprovals().then((result) => {
      if (result.ok) setApprovals(result.approvals);
      else { setError(result.error); setApprovals([]); }
    });
    window.yana.listLeases().then((result) => {
      if (result.ok) setLeases(result.leases);
      else { setError(result.error); setLeases([]); }
    });
  }, []);

  React.useEffect(() => { if (IS_ELECTRON) refresh(); }, [refresh]);

  async function onRevoke(id) {
    setBusy(true);
    const result = await window.yana.revokeLease(id);
    setBusy(false);
    if (result.ok) refresh(); else setError(result.error);
  }

  if (!IS_ELECTRON) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
        <p>{L('Permissions are only available in the desktop app.', 'Quyền hạn chỉ có trong ứng dụng desktop.', '권한은 데스크톱 앱에서만 사용할 수 있습니다.', '权限仅在桌面应用中可用。')}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        {Icons.safety(20)}
        <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          {L('Permissions', 'Quyền hạn', '권한', '权限')}
        </h1>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--warn)' }}>{error}</p>}

        <section>
          <SectionHeading hint={L('What Yana can do, and whether it needs your approval first.', 'Yana có thể làm gì, và có cần anh phê duyệt trước không.', 'Yana가 할 수 있는 일과 사전 승인이 필요한지 여부입니다.', 'Yana 可以做什么，以及是否需要事先获得您的批准。')}>
            {L('Capability registry', 'Danh mục quyền năng', '기능 레지스트리', '能力注册表')}
          </SectionHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {capabilities === null ? (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Loading…', 'Đang tải…', '불러오는 중…', '加载中…')}</p>
            ) : capabilities.length === 0 ? (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('No capabilities registered.', 'Chưa có quyền năng nào.', '등록된 기능이 없습니다.', '暂无注册的能力。')}</p>
            ) : (
              capabilities.map((cap) => <CapabilityRow key={cap.name} cap={cap} />)
            )}
          </div>
        </section>

        <section>
          <SectionHeading hint={L('Turns currently paused waiting on a human decision. Deciding happens where the turn is running, not here — this is visibility only.', 'Các lượt đang tạm dừng chờ con người quyết định. Việc quyết định diễn ra ở nơi lượt đó đang chạy, không phải ở đây — đây chỉ để xem.', '사람의 결정을 기다리며 일시 중지된 턴입니다. 결정은 이곳이 아니라 해당 턴이 실행 중인 곳에서 이루어집니다 — 여기는 확인용입니다.', '当前暂停等待人工决定的回合。决定在该回合运行的地方进行，不在此处——这里仅供查看。')}>
            {L('Pending approvals', 'Chờ phê duyệt', '승인 대기', '待批准')}
          </SectionHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {approvals === null ? (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Loading…', 'Đang tải…', '불러오는 중…', '加载中…')}</p>
            ) : approvals.length === 0 ? (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Nothing waiting on approval.', 'Không có gì chờ phê duyệt.', '승인 대기 중인 항목이 없습니다.', '没有等待批准的项目。')}</p>
            ) : (
              approvals.map((a) => <ApprovalRow key={a.approval_id} approval={a} />)
            )}
          </div>
        </section>

        <section>
          <SectionHeading hint={L('Time-boxed, scoped delegations that let an agent act without asking each time.', 'Ủy quyền có giới hạn thời gian và phạm vi, cho phép agent hành động mà không cần hỏi mỗi lần.', '에이전트가 매번 묻지 않고 행동할 수 있게 하는 시간 제한 및 범위 지정 위임입니다.', '限时、限定范围的授权，让代理无需每次请求即可行动。')}>
            {L('Active leases', 'Ủy quyền đang hoạt động', '활성 위임', '生效中的授权')}
          </SectionHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leases === null ? (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('Loading…', 'Đang tải…', '불러오는 중…', '加载中…')}</p>
            ) : leases.length === 0 ? (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{L('No leases granted yet.', 'Chưa có ủy quyền nào.', '아직 부여된 위임이 없습니다.', '尚未授予任何授权。')}</p>
            ) : (
              leases.map((l) => <LeaseRow key={l.id} lease={l} onRevoke={onRevoke} busy={busy} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
