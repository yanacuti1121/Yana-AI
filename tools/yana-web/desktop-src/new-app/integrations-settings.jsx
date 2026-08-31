import React from 'react';
import { L } from '../components.jsx';

function statePresentation(state) {
  if (state === 'ready') return { label: L('Ready', 'Sẵn sàng', '준비됨', '就绪'), color: 'var(--good)' };
  if (state === 'credential-required') return { label: L('Credential required', 'Cần credential', '자격 증명 필요', '需要凭据'), color: 'var(--warn)' };
  if (state === 'adapter-unavailable') return { label: L('Adapter not installed', 'Chưa có adapter', '어댑터 미설치', '适配器未安装'), color: 'var(--color-text-muted)' };
  return { label: L('Disconnected', 'Chưa kết nối', '연결 끊김', '未连接'), color: 'var(--color-text-muted)' };
}

function connectorTitle(name) {
  return name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function buttonStyle(primary = false) {
  return {
    border: `1px solid ${primary ? 'var(--primary)' : 'var(--border)'}`,
    background: primary ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'transparent',
    color: primary ? 'var(--primary)' : 'var(--ink)',
    borderRadius: 'var(--r-sm)',
    padding: '6px 9px',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 'var(--font-size-xs)',
  };
}

export function IntegrationsSettings() {
  const [connectors, setConnectors] = React.useState([]);
  const [draftScopes, setDraftScopes] = React.useState({});
  const [resources, setResources] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingResources, setLoadingResources] = React.useState(true);
  const [busy, setBusy] = React.useState('');
  const [notice, setNotice] = React.useState(null);

  const acceptConnectorList = React.useCallback((result) => {
    if (!result?.ok) {
      setNotice({ ok: false, message: result?.error || L('Could not load connectors.', 'Không thể tải connector.', '커넥터를 불러올 수 없습니다.', '无法加载连接器。') });
      return false;
    }
    setConnectors(result.connectors);
    setDraftScopes(Object.fromEntries(result.connectors.map((connector) => [connector.name, connector.enabledScopes])));
    return true;
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    const result = await window.yana?.connectorList?.();
    acceptConnectorList(result || { ok: false, error: 'Desktop runtime bridge unavailable.' });
    setLoading(false);
  }, [acceptConnectorList]);

  const refreshResources = React.useCallback(async () => {
    setLoadingResources(true);
    const result = await window.yana?.workspaceResources?.();
    if (result?.ok) setResources(result.resources);
    else setNotice({ ok: false, message: result?.error || L('Could not load synced resources.', 'Không thể tải resource đã sync.', '동기화된 리소스를 불러올 수 없습니다.', '无法加载已同步资源。') });
    setLoadingResources(false);
  }, []);

  React.useEffect(() => { refresh(); refreshResources(); }, [refresh, refreshResources]);

  const toggleScope = (name, scope) => {
    setDraftScopes((current) => {
      const selected = current[name] || [];
      return {
        ...current,
        [name]: selected.includes(scope)
          ? selected.filter((item) => item !== scope)
          : [...selected, scope],
      };
    });
  };

  const mutate = async (key, operation, successMessage, refreshSyncedResources = false) => {
    setBusy(key);
    setNotice(null);
    const result = await operation();
    if (result?.connectors) acceptConnectorList(result);
    if (result?.ok && refreshSyncedResources) await refreshResources();
    setNotice(result?.ok
      ? { ok: true, message: successMessage || result.message }
      : { ok: false, message: result?.error || L('Connector operation failed.', 'Thao tác connector thất bại.', '커넥터 작업에 실패했습니다.', '连接器操作失败。') });
    setBusy('');
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: 650, letterSpacing: '-0.02em' }}>{L('Connections', 'Kết nối', '연결', '连接')}</h1>
          <p style={{ margin: '5px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            {L('Choose the resources Yana can use in this project. Credentials remain outside the renderer.', 'Chọn resource Yana được dùng trong dự án này. Credential không đi vào renderer.', '이 프로젝트에서 Yana가 사용할 리소스를 선택합니다. 자격 증명은 렌더러 밖에 유지됩니다.', '选择 Yana 可在此项目中使用的资源。凭据始终留在渲染器之外。')}
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={loading || !!busy} style={buttonStyle()}>{L('Refresh', 'Làm mới', '새로고침', '刷新')}</button>
      </div>

      <div style={{ border: '1px solid color-mix(in srgb, var(--border) 76%, var(--primary) 24%)', borderRadius: 'var(--r-md)', padding: '9px 11px', background: 'color-mix(in srgb, var(--primary) 7%, transparent)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>
        {L('Connectors are project-scoped. Saving scopes records Yana’s local allowlist; it does not sign into a provider or send data. Resources enter chat only when you attach or reference them.', 'Connector theo từng dự án. Lưu scope chỉ ghi allowlist cục bộ của Yana; thao tác này không đăng nhập provider hoặc gửi dữ liệu. Resource chỉ đi vào chat khi anh đính kèm hoặc tham chiếu.', '커넥터는 프로젝트 범위입니다. 범위를 저장하면 Yana의 로컬 허용 목록만 기록되며 공급자 로그인이나 데이터 전송은 수행하지 않습니다. 리소스는 첨부하거나 참조할 때만 채팅에 들어갑니다.', '连接器按项目限定。保存权限范围仅记录 Yana 的本地允许列表，不会登录服务商或发送数据。资源仅在你附加或引用时进入聊天。')}
      </div>

      {loading && <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{L('Loading connector registry…', 'Đang tải registry connector…', '커넥터 레지스트리 로드 중…', '正在加载连接器注册表…')}</p>}
      {!loading && connectors.map((connector) => {
        const state = statePresentation(connector.connectionState);
        const selectedScopes = draftScopes[connector.name] || [];
        const isEnabled = connector.enabledScopes.length > 0;
        const needsRuntimeCredential = connector.connectionState === 'credential-required';
        const adapterUnavailable = connector.connectionState === 'adapter-unavailable';
        const canSync = connector.name === 'github' && connector.connectionState === 'ready' && connector.enabledScopes.includes('repo.read');
        const syncedResources = resources.filter((resource) => resource.metadata.connector === connector.name);
        return (
          <article key={connector.name} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '14px 15px', background: 'color-mix(in srgb, var(--surface) 76%, transparent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 'var(--font-size-base)' }}>{connectorTitle(connector.name)}</strong>
                  <span style={{ color: state.color, fontSize: 'var(--font-size-xs)' }}>● {state.label}</span>
                </div>
                <p style={{ margin: '4px 0 8px', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', lineHeight: 1.45 }}>{connector.description}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {connector.resourceKinds.map((kind) => <span key={kind} style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '2px 7px', color: 'var(--color-text-muted)', fontSize: '11px' }}>{kind}</span>)}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, color: 'var(--color-text-muted)', fontSize: '11px', lineHeight: 1.5 }}>
                <div>{connector.adapterInstalled ? L('Adapter ready', 'Adapter sẵn sàng', '어댑터 준비됨', '适配器已就绪') : L('Adapter unavailable', 'Chưa có adapter', '어댑터 없음', '适配器不可用')}</div>
                {connector.runtimeCredentialAvailable && <div>{L('Credential available', 'Credential khả dụng', '자격 증명 사용 가능', '凭据可用')}</div>}
              </div>
            </div>

            <fieldset style={{ border: 0, padding: 0, margin: '11px 0 0' }}>
              <legend style={{ color: 'var(--color-text-muted)', fontSize: '11px', marginBottom: 5 }}>{L('Explicit permissions', 'Quyền được cấp rõ ràng', '명시적 권한', '显式权限')}</legend>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {connector.allowedScopes.map((scope) => (
                  <label key={scope} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedScopes.includes(scope)} onChange={() => toggleScope(connector.name, scope)} />
                    {scope}
                  </label>
                ))}
              </div>
            </fieldset>

            {needsRuntimeCredential && (
              <p role="status" style={{ margin: '10px 0 0', color: 'var(--warn)', fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>
                {L('Authentication is still required. Make the provider credential available to the Yana runtime through the existing OS-secret or environment boundary, then refresh. This screen does not collect credentials or start OAuth.', 'Vẫn cần xác thực. Hãy cấp credential provider cho Yana runtime qua OS-secret hoặc biến môi trường hiện có, rồi làm mới. Màn hình này không thu credential hoặc tự mở OAuth.', '인증이 아직 필요합니다. 기존 OS 비밀 저장소 또는 환경 변수 경계를 통해 Yana 런타임에 공급자 자격 증명을 제공한 다음 새로고침하세요. 이 화면은 자격 증명을 수집하거나 OAuth를 시작하지 않습니다.', '仍需认证。请通过现有操作系统密钥存储或环境变量边界向 Yana 运行时提供服务商凭据，然后刷新。本界面不会收集凭据或启动 OAuth。')}
              </p>
            )}
            {adapterUnavailable && (
              <p role="status" style={{ margin: '10px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>
                {L('The local permission can be recorded now, but this connector has no runtime adapter yet and cannot access a provider.', 'Có thể lưu quyền cục bộ ngay, nhưng connector này chưa có runtime adapter nên chưa thể truy cập provider.', '로컬 권한은 지금 기록할 수 있지만 이 커넥터에는 아직 런타임 어댑터가 없어 공급자에 접근할 수 없습니다.', '现在可以记录本地权限，但此连接器尚无运行时适配器，无法访问服务商。')}
              </p>
            )}

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11 }}>
              <button type="button" disabled={!selectedScopes.length || !!busy} onClick={() => mutate(`${connector.name}:configure`, () => window.yana.connectorConfigure(connector.name, selectedScopes), L('Local connector permissions saved. Authentication remains separate.', 'Đã lưu quyền connector cục bộ. Xác thực vẫn là bước riêng.', '로컬 커넥터 권한이 저장되었습니다. 인증은 별도 단계입니다.', '本地连接器权限已保存。认证仍是独立步骤。'))} style={buttonStyle(true)}>{L('Save local permissions', 'Lưu quyền cục bộ', '로컬 권한 저장', '保存本地权限')}</button>
              {isEnabled && <button type="button" disabled={!!busy} onClick={() => mutate(`${connector.name}:disconnect`, () => window.yana.connectorDisconnect(connector.name), L('Local connector access disabled. Provider credentials were not deleted.', 'Đã tắt quyền connector cục bộ. Credential phía provider không bị xóa.', '로컬 커넥터 접근이 비활성화되었습니다. 공급자 자격 증명은 삭제되지 않았습니다.', '已禁用本地连接器访问。服务商凭据未被删除。'))} style={buttonStyle()}>{L('Disable local access', 'Tắt quyền cục bộ', '로컬 접근 비활성화', '禁用本地访问')}</button>}
              {canSync && <button type="button" disabled={!!busy} onClick={() => mutate(`${connector.name}:preview`, () => window.yana.connectorSync(connector.name, { limit: 20, dryRun: true }))} style={buttonStyle()}>{L('Preview sync', 'Xem trước sync', '동기화 미리보기', '预览同步')}</button>}
              {canSync && <button type="button" disabled={!!busy} onClick={() => mutate(`${connector.name}:sync`, () => window.yana.connectorSync(connector.name, { limit: 20, dryRun: false }), undefined, true)} style={buttonStyle()}>{L('Sync to workspace', 'Sync vào workspace', '작업 공간에 동기화', '同步到工作区')}</button>}
              {busy.startsWith(`${connector.name}:`) && <span style={{ alignSelf: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{L('Working…', 'Đang xử lý…', '처리 중…', '处理中…')}</span>}
            </div>

            {(canSync || syncedResources.length > 0) && <div style={{ marginTop: 12, padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb, var(--surface) 88%, transparent)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: syncedResources.length ? 7 : 0 }}>
                <strong style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--color-text-muted)' }}>{L('Workspace resources', 'Resource trong workspace', '작업 공간 리소스', '工作区资源')}</strong>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>{loadingResources ? '…' : syncedResources.length}</span>
              </div>
              {!loadingResources && syncedResources.length === 0 && <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{L('No canonical workspace resources from this connector yet.', 'Chưa có resource canonical nào từ connector này.', '이 커넥터의 정식 작업 공간 리소스가 아직 없습니다.', '此连接器尚无标准工作区资源。')}</div>}
              {syncedResources.slice(0, 5).map((resource) => (
                <div key={resource.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--font-size-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.title}</div>
                    <div style={{ marginTop: 2, color: 'var(--color-text-muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.metadata.repository || resource.metadata.resource_kind || resource.kind}</div>
                  </div>
                  <span style={{ alignSelf: 'center', color: resource.attention === 'signal' ? 'var(--good)' : 'var(--color-text-muted)', fontSize: '11px' }}>{resource.attention}</span>
                </div>
              ))}
              {syncedResources.length > 5 && <div style={{ paddingTop: 5, color: 'var(--color-text-muted)', fontSize: '11px' }}>+{syncedResources.length - 5} {L('more', 'resource khác', '개 더', '项更多')}</div>}
            </div>}
          </article>
        );
      })}
      {notice?.message && <p role="status" style={{ margin: '10px 0 0', color: notice.ok ? 'var(--good)' : 'var(--warn)', fontSize: 'var(--font-size-xs)', overflowWrap: 'anywhere' }}>{notice.message}</p>}
    </section>
  );
}
