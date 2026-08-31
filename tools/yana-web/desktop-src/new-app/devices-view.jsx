import React from 'react';
import { L, Icons } from '../components.jsx';
import { IS_ELECTRON } from '../lib/is-electron.js';

function bytes(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function titleCase(value) {
  if (typeof value !== 'string' || value.length === 0) return '—';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Metric({ label, value, hint }) {
  return (
    <article style={{ minWidth: 0, padding: '14px 15px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--color-bg-subtle)' }}>
      <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 650, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: '7px 0 0', color: 'var(--ink)', fontSize: 'var(--font-size-lg)', fontWeight: 650, overflowWrap: 'anywhere' }}>{value}</p>
      {hint && <p style={{ margin: '5px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{hint}</p>}
    </article>
  );
}

const CAPABILITIES = [
  ['native_service_manager', L('Service manager', 'Trình quản lý dịch vụ', '서비스 관리자', '服务管理器')],
  ['filesystem_events', L('Filesystem events', 'Sự kiện hệ thống tệp', '파일 시스템 이벤트', '文件系统事件')],
  ['secure_secret_storage', L('Secure credential storage', 'Lưu credential bảo mật', '보안 자격 증명 저장소', '安全凭据存储')],
  ['process_containment', L('Process containment', 'Cô lập tiến trình', '프로세스 격리', '进程隔离')],
  ['native_notifications', L('Native notifications', 'Thông báo hệ thống', '네이티브 알림', '原生通知')],
  ['accelerator_telemetry', L('Accelerator telemetry', 'Telemetry accelerator', '가속기 텔레메트리', '加速器遥测')],
];

function SupportBadge({ value }) {
  const state = typeof value === 'string' ? value : 'unknown';
  const color = state === 'supported' ? 'var(--good)' : state === 'unsupported' ? 'var(--warn)' : 'var(--color-text-muted)';
  return <span style={{ color, border: `1px solid ${color}`, borderRadius: 99, padding: '3px 8px', fontSize: 'var(--font-size-xs)', fontWeight: 650 }}>{titleCase(state)}</span>;
}

export function DevicesView() {
  const [state, setState] = React.useState({ loading: true, host: null, error: null });

  const refresh = React.useCallback(async () => {
    if (!IS_ELECTRON || !window.yana?.hostStatus) return;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const result = await window.yana.hostStatus();
      setState({ loading: false, host: result?.ok ? result.host : null, error: result?.ok ? null : result?.error || L('Host status is unavailable.', 'Không có trạng thái máy.', '호스트 상태를 사용할 수 없습니다.', '主机状态不可用。') });
    } catch (_) {
      setState({ loading: false, host: null, error: L('Host status is unavailable.', 'Không có trạng thái máy.', '호스트 상태를 사용할 수 없습니다.', '主机状态不可用。') });
    }
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  if (!IS_ELECTRON) {
    return (
      <section style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 28, textAlign: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--ink)', margin: 0 }}>{L('Devices are available in Yana Desktop', 'Thiết bị có trong Yana Desktop', '기기는 Yana Desktop에서 사용할 수 있습니다.', '设备可在 Yana Desktop 中使用')}</h1>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: 540 }}>{L('This view reads the bundled runtime’s host status and intentionally has no web fallback.', 'Màn hình này đọc trạng thái host từ runtime đi kèm và chủ ý không có fallback trên web.', '이 화면은 번들 런타임의 호스트 상태를 읽으며 웹 대체 경로는 의도적으로 제공하지 않습니다.', '此视图读取随附运行时的主机状态，并且有意不提供网页回退。')}</p>
        </div>
      </section>
    );
  }

  const { host, loading, error } = state;
  const accelerators = Array.isArray(host?.accelerators) ? host.accelerators : [];
  const capabilities = host?.capabilities || {};

  return (
    <section aria-label={L('Devices', 'Thiết bị', '기기', '设备')} style={{ height: '100%', overflowY: 'auto', padding: 'clamp(18px, 3vw, 34px)', maxWidth: 1180, margin: '0 auto' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, marginBottom: 22 }}>
        <div>
          <p style={{ color: 'var(--primary)', fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>{L('This device', 'Máy này', '이 기기', '此设备')}</p>
          <h1 style={{ color: 'var(--ink)', fontSize: 'clamp(22px, 3vw, 30px)', letterSpacing: '-0.025em', margin: '5px 0 6px' }}>{L('Host profile', 'Hồ sơ máy', '호스트 프로필', '主机配置')}</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', maxWidth: 660, margin: 0 }}>{L('Read-only data from the bundled Yana runtime. Remote devices are not shown as connected until Yana has a real device registry.', 'Dữ liệu chỉ đọc từ Yana Runtime đi kèm. Thiết bị từ xa sẽ không hiển thị là đã kết nối cho đến khi Yana có device registry thật.', '번들 Yana 런타임의 읽기 전용 데이터입니다. 실제 기기 레지스트리가 생기기 전까지 원격 기기는 연결됨으로 표시되지 않습니다.', '来自随附 Yana Runtime 的只读数据。在 Yana 有真正的设备注册表之前，不会将远程设备显示为已连接。')}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '7px 11px', background: 'var(--color-bg-subtle)', color: 'var(--ink)', cursor: loading ? 'progress' : 'pointer', font: 'inherit' }}>
          {loading ? L('Refreshing…', 'Đang làm mới…', '새로 고치는 중…', '正在刷新…') : L('Refresh', 'Làm mới', '새로 고침', '刷新')}
        </button>
      </header>

      {error && <p role="alert" style={{ margin: '0 0 14px', padding: '11px 13px', border: '1px solid var(--warn)', borderRadius: 'var(--r-md)', color: 'var(--ink)', background: 'var(--color-bg-subtle)' }}>{error}</p>}
      {loading && !host && <p role="status" style={{ color: 'var(--color-text-muted)' }}>{L('Reading host information from the runtime…', 'Đang đọc thông tin máy từ runtime…', '런타임에서 호스트 정보를 읽는 중…', '正在从运行时读取主机信息…')}</p>}

      {host && <>
        <section style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 16, background: 'var(--color-bg-subtle)', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--primary)' }}>{Icons.monitor(22)}<strong style={{ color: 'var(--ink)' }}>{host.os} · {host.arch}</strong></div>
          <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{host.cpu?.vendor || L('CPU vendor unavailable', 'Chưa có hãng CPU', 'CPU 공급업체를 사용할 수 없습니다.', 'CPU 供应商不可用')}</p>
        </section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Metric label={L('Logical CPU cores', 'Lõi CPU logic', '논리 CPU 코어', '逻辑 CPU 核心')} value={String(host.cpu?.logical_cores ?? '—')} hint={Number.isInteger(host.cpu?.physical_cores) ? L(`${host.cpu.physical_cores} physical`, `${host.cpu.physical_cores} lõi vật lý`, `${host.cpu.physical_cores} 물리 코어`, `${host.cpu.physical_cores} 个物理核心`) : L('Physical count unavailable', 'Chưa có số lõi vật lý', '물리 코어 수를 사용할 수 없습니다.', '物理核心数不可用')} />
          <Metric label={L('Memory', 'Bộ nhớ', '메모리', '内存')} value={bytes(host.memory?.total_bytes)} hint={titleCase(host.memory?.model)} />
          <Metric label={L('Accelerators', 'Tăng tốc phần cứng', '가속기', '加速器')} value={String(accelerators.length)} hint={accelerators.length === 0 ? L('None detected', 'Không phát hiện', '감지되지 않음', '未检测到') : L('Reported by runtime', 'Runtime báo cáo', '런타임이 보고함', '由运行时报告')} />
        </div>
        <section style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--color-bg-subtle)', padding: 16 }}>
          <h2 style={{ color: 'var(--ink)', fontSize: 'var(--font-size-md)', margin: 0 }}>{L('Accelerators', 'Tăng tốc phần cứng', '가속기', '加速器')}</h2>
          {accelerators.length === 0 ? <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', margin: '8px 0 0' }}>{L('The runtime did not report an accelerator on this device.', 'Runtime không báo accelerator nào cho máy này.', '런타임에서 이 기기의 가속기를 보고하지 않았습니다.', '运行时没有报告此设备上的加速器。')}</p> : <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>{accelerators.map((accelerator, index) => <article key={`${accelerator.name || 'accelerator'}-${index}`} style={{ borderTop: index ? '1px solid var(--border)' : 'none', paddingTop: index ? 10 : 0, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong style={{ color: 'var(--ink)' }}>{accelerator.name || L('Unnamed accelerator', 'Accelerator chưa có tên', '이름 없는 가속기', '未命名加速器')}</strong><p style={{ color: 'var(--color-text-muted)', margin: '3px 0 0', fontSize: 'var(--font-size-xs)' }}>{titleCase(accelerator.kind)} · {titleCase(accelerator.memory_model)}{accelerator.backend ? ` · ${accelerator.backend}` : ''}</p></div><SupportBadge value={accelerator.telemetry} /></article>)}</div>}
        </section>
        <section style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--color-bg-subtle)', padding: 16, marginTop: 14 }}>
          <h2 style={{ color: 'var(--ink)', fontSize: 'var(--font-size-md)', margin: 0 }}>{L('Platform capabilities', 'Khả năng nền tảng', '플랫폼 기능', '平台能力')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 12 }}>{CAPABILITIES.map(([key, label]) => <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '9px 10px' }}><span style={{ color: 'var(--ink)', fontSize: 'var(--font-size-sm)' }}>{label}</span><SupportBadge value={capabilities[key]} /></div>)}</div>
        </section>
      </>}
    </section>
  );
}
