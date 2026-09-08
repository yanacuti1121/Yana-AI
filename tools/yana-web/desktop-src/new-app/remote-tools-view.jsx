import React from 'react';
import { L, Icons } from '../components.jsx';
import { IS_ELECTRON } from '../lib/is-electron.js';

function ActionButton({ children, onClick, disabled = false, primary = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ border: `1px solid ${primary ? 'var(--primary)' : 'var(--border)'}`, background: primary ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'var(--color-bg-subtle)', color: primary ? 'var(--primary)' : 'var(--ink)', borderRadius: 'var(--r-sm)', padding: '7px 10px', cursor: disabled ? 'not-allowed' : 'pointer', font: 'inherit', fontSize: 'var(--font-size-xs)', opacity: disabled ? 0.58 : 1 }}>{children}</button>
  );
}

function StateBadge({ ok, yes, no }) {
  const color = ok ? 'var(--good)' : 'var(--color-text-muted)';
  return <span style={{ color, border: `1px solid ${color}`, borderRadius: 99, padding: '3px 8px', fontSize: 'var(--font-size-xs)', fontWeight: 650 }}>{ok ? `● ${yes}` : `○ ${no}`}</span>;
}

function Card({ eyebrow, title, children }) {
  return <article style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '16px 17px', background: 'color-mix(in srgb, var(--color-bg-subtle) 82%, transparent)' }}><p style={{ margin: 0, color: 'var(--primary)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{eyebrow}</p><h2 style={{ margin: '5px 0 0', color: 'var(--ink)', fontSize: 'var(--font-size-lg)', letterSpacing: '-0.015em' }}>{title}</h2>{children}</article>;
}

function Detail({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 'var(--font-size-sm)' }}><span style={{ color: 'var(--color-text-muted)' }}>{label}</span><strong style={{ color: 'var(--ink)', textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</strong></div>;
}

function statusMessage(status) {
  if (!status?.runtimeAvailable) return L('The bundled runtime is unavailable.', 'Không tìm thấy Yana Runtime đi kèm.', '번들 런타임을 사용할 수 없습니다.', '随附运行时不可用。');
  if (!status.runtimeInspected) return L('The runtime could not be inspected.', 'Không thể kiểm tra runtime.', '런타임을 검사할 수 없습니다.', '无法检查运行时。');
  return null;
}

export function RemoteToolsView({ onFocusTerminal }) {
  const [state, setState] = React.useState({ loading: true, status: null, error: null });
  const [showDiscordSetup, setShowDiscordSetup] = React.useState(false);
  const refresh = React.useCallback(async () => {
    if (!IS_ELECTRON || !window.yana?.remoteToolsStatus) return;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await window.yana.remoteToolsStatus();
      setState({ loading: false, status: result?.ok ? result : null, error: result?.ok ? null : result?.error || L('Could not read tool status.', 'Không thể đọc trạng thái công cụ.', '도구 상태를 읽을 수 없습니다.', '无法读取工具状态。') });
    } catch (_) {
      setState({ loading: false, status: null, error: L('Could not read tool status.', 'Không thể đọc trạng thái công cụ.', '도구 상태를 읽을 수 없습니다.', '无法读取工具状态。') });
    }
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);

  if (!IS_ELECTRON) {
    return <section style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 28, textAlign: 'center' }}><div><h1 style={{ color: 'var(--ink)', margin: 0 }}>{L('Remote tools are available in Yana Desktop', 'Công cụ từ xa có trong Yana Desktop', '원격 도구는 Yana Desktop에서 사용할 수 있습니다.', '远程工具可在 Yana Desktop 中使用')}</h1><p style={{ color: 'var(--color-text-muted)', maxWidth: 560 }}>{L('This view reads host-side runtime and command status. It intentionally has no browser fallback.', 'Màn hình này đọc trạng thái runtime và lệnh ở máy chủ. Chủ ý không có fallback trên trình duyệt.', '이 화면은 호스트 측 런타임 및 명령 상태를 읽습니다. 의도적으로 브라우저 대체 경로가 없습니다.', '此视图读取主机端运行时和命令状态，并且有意不提供浏览器回退。')}</p></div></section>;
  }

  const { status, loading, error } = state;
  const discord = status?.discord;
  const configuration = discord?.configuration;
  const externalTools = status?.externalTools || [];
  return (
    <section aria-label={L('Remote tools', 'Công cụ từ xa', '원격 도구', '远程工具')} style={{ height: '100%', overflowY: 'auto', padding: 'clamp(18px, 3vw, 34px)', maxWidth: 1060, margin: '0 auto' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, marginBottom: 20 }}><div><p style={{ color: 'var(--primary)', fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>{L('Controlled entry points', 'Điểm vào có kiểm soát', '제어된 진입점', '受控入口')}</p><h1 style={{ color: 'var(--ink)', fontSize: 'clamp(22px, 3vw, 30px)', letterSpacing: '-0.025em', margin: '5px 0 6px' }}>{L('Remote & external tools', 'Công cụ từ xa & bên ngoài', '원격 및 외부 도구', '远程与外部工具')}</h1><p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5, maxWidth: 720, margin: 0 }}>{L('Status is read from the local runtime and your PATH. Yana does not start a bot or external coding tool from this screen.', 'Trạng thái được đọc từ runtime cục bộ và PATH của máy. Yana không tự khởi động bot hoặc công cụ code bên ngoài từ màn hình này.', '상태는 로컬 런타임과 PATH에서 읽습니다. 이 화면에서는 봇이나 외부 코딩 도구를 자동으로 시작하지 않습니다.', '状态从本地运行时和 PATH 读取。Yana 不会从此界面自动启动机器人或外部编码工具。')}</p></div><ActionButton onClick={() => void refresh()} disabled={loading}>{loading ? L('Refreshing…', 'Đang làm mới…', '새로 고치는 중…', '正在刷新…') : L('Refresh', 'Làm mới', '새로고침', '刷新')}</ActionButton></header>
      {(error || statusMessage(status)) && <p role="alert" style={{ margin: '0 0 14px', padding: '11px 13px', border: '1px solid var(--warn)', borderRadius: 'var(--r-md)', color: 'var(--ink)', background: 'var(--color-bg-subtle)' }}>{error || statusMessage(status)}</p>}
      {loading && !status && <p role="status" style={{ color: 'var(--color-text-muted)' }}>{L('Reading local tool status…', 'Đang đọc trạng thái công cụ cục bộ…', '로컬 도구 상태를 읽는 중…', '正在读取本地工具状态…')}</p>}
      {status && <div style={{ display: 'grid', gap: 12 }}>
        <Card eyebrow={L('Remote chat', 'Chat từ xa', '원격 채팅', '远程聊天')} title="Discord"><p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5, margin: '8px 0 13px' }}>{L('The Discord gateway is deliberately plain chat only. It never exposes host, repository, Git, process or tool capabilities to Discord.', 'Discord gateway được cố ý giới hạn ở chat thuần. Nó không bao giờ đưa capability của máy, repository, Git, process hay tool ra Discord.', 'Discord 게이트웨이는 의도적으로 일반 채팅만 제공합니다. 호스트, 저장소, Git, 프로세스 또는 도구 권한을 Discord에 노출하지 않습니다.', 'Discord 网关被有意限制为纯聊天。它绝不会向 Discord 暴露主机、仓库、Git、进程或工具能力。')}</p><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}><StateBadge ok={discord?.available} yes={L('Runtime supports Discord', 'Runtime hỗ trợ Discord', '런타임이 Discord 지원', '运行时支持 Discord')} no={L('Discord not detected', 'Chưa phát hiện Discord', 'Discord 감지 안 됨', '未检测到 Discord')} /><StateBadge ok={configuration?.valid} yes={L('Allowlist configured', 'Đã cấu hình allowlist', '허용 목록 구성됨', '允许列表已配置')} no={L('No valid allowlist', 'Chưa có allowlist hợp lệ', '유효한 허용 목록 없음', '没有有效允许列表')} /></div><Detail label={L('Allowed channels', 'Kênh được phép', '허용된 채널', '允许的频道')} value={String(configuration?.allowedChannels ?? 0)} /><Detail label={L('Allowed users', 'Người dùng được phép', '허용된 사용자', '允许的用户')} value={String(configuration?.allowedUsers ?? 0)} /><Detail label={L('Credential boundary', 'Ranh giới credential', '자격 증명 경계', '凭据边界')} value={L('Managed outside Desktop', 'Quản lý ngoài Desktop', 'Desktop 외부에서 관리됨', '在桌面端外管理')} /><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 13 }}><ActionButton primary onClick={() => setShowDiscordSetup((value) => !value)}>{showDiscordSetup ? L('Hide setup', 'Ẩn hướng dẫn', '설정 숨기기', '隐藏设置') : L('View setup', 'Xem hướng dẫn', '설정 보기', '查看设置')}</ActionButton><ActionButton onClick={onFocusTerminal}>{L('Open terminal', 'Mở Terminal', '터미널 열기', '打开终端')}</ActionButton></div>{showDiscordSetup && <div style={{ marginTop: 12, padding: '10px 11px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--color-bg)' }}><ol style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6, margin: 0, paddingLeft: 20 }}><li>{L('Keep the bot credential in Yana’s existing OS-secret or environment boundary. This screen never reads or collects it.', 'Giữ credential bot trong ranh giới OS-secret hoặc environment hiện có của Yana. Màn hình này không đọc hoặc thu nó.', '봇 자격 증명은 Yana의 기존 OS 비밀 저장소 또는 환경 경계에 보관하세요. 이 화면은 이를 읽거나 수집하지 않습니다.', '将机器人凭据保存在 Yana 现有的操作系统密钥存储或环境边界中。此界面不会读取或收集它。')}</li><li>{L('Set at least one allowed channel or user in .yana-ai/os/discord-config.json.', 'Đặt ít nhất một kênh hoặc người dùng được phép trong .yana-ai/os/discord-config.json.', '.yana-ai/os/discord-config.json에 허용된 채널 또는 사용자를 하나 이상 설정하세요.', '在 .yana-ai/os/discord-config.json 中设置至少一个允许的频道或用户。')}</li><li>{L('Use the terminal to test, then deliberately start the gateway when you are ready.', 'Dùng Terminal để kiểm tra, rồi chủ động khởi động gateway khi anh sẵn sàng.', '터미널에서 테스트한 후 준비되면 의도적으로 게이트웨이를 시작하세요.', '使用终端测试，然后在准备好后有意启动网关。')}</li></ol></div>}</Card>
        <Card eyebrow={L('Tool protocol', 'Giao thức công cụ', '도구 프로토콜', '工具协议')} title="MCP"><p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5, margin: '8px 0 13px' }}>{L('MCP uses stdio and only runs when a user explicitly registers it with a compatible client. Governed workspace mutations remain denied from MCP.', 'MCP dùng stdio và chỉ chạy khi người dùng chủ động đăng ký với client tương thích. Mutation workspace cần governance vẫn bị từ chối từ MCP.', 'MCP는 stdio를 사용하며 사용자가 호환 클라이언트에 명시적으로 등록할 때만 실행됩니다. 거버넌스가 필요한 작업 공간 변경은 MCP에서 계속 거부됩니다.', 'MCP 使用 stdio，仅当用户明确将其注册到兼容客户端时才运行。需要治理的工作区变更仍会被 MCP 拒绝。')}</p><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}><StateBadge ok={status.mcp?.available} yes={L('MCP available', 'MCP khả dụng', 'MCP 사용 가능', 'MCP 可用')} no={L('MCP unavailable', 'MCP chưa khả dụng', 'MCP 不可用', 'MCP 不可用')} /><span style={{ color: 'var(--color-text-muted)', border: '1px solid var(--border)', borderRadius: 99, padding: '3px 8px', fontSize: 'var(--font-size-xs)' }}>stdio</span></div><Detail label={L('Launch command', 'Lệnh khởi động', '시작 명령', '启动命令')} value="yana-rt mcp" /><div style={{ marginTop: 13 }}><ActionButton onClick={onFocusTerminal}>{L('Open terminal to register', 'Mở Terminal để đăng ký', '등록을 위해 터미널 열기', '打开终端以注册')}</ActionButton></div></Card>
        <Card eyebrow={L('Human terminal', 'Terminal người dùng', '사용자 터미널', '用户终端')} title={L('External coding tools', 'Công cụ code bên ngoài', '외부 코딩 도구', '外部编码工具')}><p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.5, margin: '8px 0 13px' }}>{L('Detection only checks commands already available in PATH. These tools run in the human terminal; their printed text is never treated as verified Yana evidence.', 'Chỉ kiểm tra các lệnh đã có trong PATH. Những công cụ này chạy trong terminal của người dùng; text chúng in ra không bao giờ tự thành Yana evidence đã xác minh.', 'PATH에 이미 있는 명령만 감지합니다. 이 도구는 사용자 터미널에서 실행되며 출력 텍스트는 검증된 Yana 증거로 취급되지 않습니다.', '仅检测 PATH 中已有的命令。这些工具在用户终端中运行；它们的输出文本绝不会被视为经过验证的 Yana 证据。')}</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 9 }}>{externalTools.map((tool) => <div key={tool.id} style={{ padding: '10px 11px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><div><strong style={{ color: 'var(--ink)', fontSize: 'var(--font-size-sm)' }}>{tool.name}</strong><p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', margin: '2px 0 0' }}>{tool.command}</p></div><StateBadge ok={tool.available} yes={L('Found', 'Đã thấy', '발견됨', '已找到')} no={L('Not found', 'Không thấy', '없음', '未找到')} /></div>)}</div><div style={{ marginTop: 13 }}><ActionButton onClick={onFocusTerminal}>{Icons.code(14)} {L('Open terminal', 'Mở Terminal', '터미널 열기', '打开终端')}</ActionButton></div></Card>
      </div>}
    </section>
  );
}
