import React from 'react';
import { L } from '../components.jsx';
import { Providers } from '../pages/system/providers.jsx';
import {
  readCustomLocalModel,
  removeCustomLocalModel,
  saveCustomLocalModel,
  validateCustomLocalModel,
} from './custom-local-model.mjs';

const fieldStyle = {
  width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border)', background: 'var(--color-bg)', color: 'var(--ink)', font: 'inherit',
};

const buttonStyle = (primary = false) => ({
  border: `1px solid ${primary ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 'var(--r-sm)',
  background: primary ? 'var(--primary)' : 'transparent', color: primary ? 'var(--primary-ink, white)' : 'var(--ink)',
  padding: '8px 11px', cursor: 'pointer', font: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 600,
});

function errorFromResponse(response, payload) {
  if (payload?.error && typeof payload.error === 'string') return payload.error;
  return `Connection check failed (HTTP ${response.status}).`;
}

export function ModelManager() {
  const [saved, setSaved] = React.useState(() => readCustomLocalModel());
  const [baseUrl, setBaseUrl] = React.useState(saved?.baseUrl || '');
  const [label, setLabel] = React.useState(saved?.label || 'My local AI');
  const [model, setModel] = React.useState(saved?.model || '');
  const [models, setModels] = React.useState([]);
  const [checking, setChecking] = React.useState(false);
  const [notice, setNotice] = React.useState('');
  const [error, setError] = React.useState('');

  async function checkConnection() {
    const endpointCheck = validateCustomLocalModel({ baseUrl, model: model || 'probe-model', label });
    if (!endpointCheck.ok && !endpointCheck.error.includes('model id')) {
      setError(endpointCheck.error);
      setNotice('');
      return;
    }
    setChecking(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/models', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'custom', baseUrl: baseUrl.trim(), customKeyless: true }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorFromResponse(response, payload));
      const discovered = Array.isArray(payload?.models)
        ? payload.models.map((entry) => entry?.id).filter((entry) => typeof entry === 'string' && entry.length > 0).slice(0, 60)
        : [];
      setModels(discovered);
      if (!model && discovered[0]) setModel(discovered[0]);
      setNotice(discovered.length
        ? L(`Connected — ${discovered.length} model${discovered.length === 1 ? '' : 's'} found.`, `Đã kết nối — tìm thấy ${discovered.length} model.`, `${discovered.length}개의 모델을 찾았습니다.`, `已连接 — 找到 ${discovered.length} 个模型。`)
        : L('Connected, but this server returned no chat models. Enter the model id manually.', 'Đã kết nối nhưng server không trả model chat. Hãy nhập model id thủ công.', '연결되었지만 서버가 채팅 모델을 반환하지 않았습니다. 모델 ID를 직접 입력하세요.', '已连接，但服务器没有返回聊天模型。请手动输入模型 ID。'));
    } catch (connectionError) {
      setError(connectionError?.message || L('Could not reach the local model server.', 'Không thể kết nối server model cục bộ.', '로컬 모델 서버에 연결할 수 없습니다.', '无法连接本地模型服务器。'));
    } finally {
      setChecking(false);
    }
  }

  function saveModel() {
    const result = saveCustomLocalModel({ baseUrl, model, label });
    if (!result.ok) {
      setError(result.error);
      setNotice('');
      return;
    }
    localStorage.setItem('yana.chat.provider', 'custom');
    setSaved(result.value);
    setError('');
    setNotice(L('Saved. Chat will use this local model when you return to Chat.', 'Đã lưu. Khi quay lại Chat, Yana sẽ dùng model local này.', '저장했습니다. Chat으로 돌아가면 이 로컬 모델을 사용합니다.', '已保存。返回聊天后，Yana 将使用这个本地模型。'));
  }

  function disconnect() {
    removeCustomLocalModel();
    setSaved(null);
    if (localStorage.getItem('yana.chat.provider') === 'custom') localStorage.removeItem('yana.chat.provider');
    setModels([]);
    setModel('');
    setError('');
    setNotice(L('The local model was removed from Yana. The server itself was not changed.', 'Đã bỏ model local khỏi Yana. Server local không bị thay đổi.', 'Yana에서 로컬 모델을 제거했습니다. 서버 자체는 변경되지 않았습니다.', '已从 Yana 移除本地模型；服务器本身没有被修改。'));
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--gap)', maxWidth: 920, margin: '0 auto', padding: 'var(--gap)' }}>
      <section className="glass" style={{ borderRadius: 'var(--r-lg)', padding: 'clamp(16px, 3vw, 26px)', display: 'grid', gap: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 27px)' }}>{L('Add your local AI', 'Thêm AI local của anh', '내 로컬 AI 추가', '添加你的本地 AI')}</h1>
          <p style={{ margin: '8px 0 0', color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
            {L('Connect a model server already running on this computer. Yana talks to it directly through the governed runtime — no Ollama required.', 'Kết nối server model đang chạy sẵn trên máy này. Yana gọi trực tiếp qua runtime có giám sát — không cần Ollama.', '이 컴퓨터에서 이미 실행 중인 모델 서버를 연결합니다. Yana는 Ollama 없이 거버넌스 런타임을 통해 직접 호출합니다.', '连接此电脑上已经运行的模型服务器。Yana 通过受治理运行时直接调用它，无需 Ollama。')}
          </p>
        </div>
        <div style={{ display: 'grid', gap: 7 }}>
          <label htmlFor="custom-local-endpoint" style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{L('OpenAI-compatible chat endpoint', 'Endpoint chat tương thích OpenAI', 'OpenAI 호환 채팅 엔드포인트', 'OpenAI 兼容聊天端点')}</label>
          <input id="custom-local-endpoint" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://127.0.0.1:8080/v1/chat/completions" spellCheck="false" style={fieldStyle} />
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{L('Only localhost / 127.0.0.1 / ::1 is accepted here. No credentials are stored in the renderer.', 'Chỉ nhận localhost / 127.0.0.1 / ::1. Không lưu credential ở renderer.', 'localhost / 127.0.0.1 / ::1만 허용합니다. 렌더러에는 자격 증명을 저장하지 않습니다.', '这里只接受 localhost / 127.0.0.1 / ::1。渲染器不会保存凭据。')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
          <label style={{ display: 'grid', gap: 7, fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
            {L('Display name', 'Tên hiển thị', '표시 이름', '显示名称')}
            <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength="80" style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 7, fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
            {L('Model id', 'Model id', '모델 ID', '模型 ID')}
            <input value={model} onChange={(event) => setModel(event.target.value)} list="custom-local-models" placeholder={L('Discover or enter manually', 'Khám phá hoặc tự nhập', '검색 또는 직접 입력', '发现或手动输入')} spellCheck="false" style={fieldStyle} />
            <datalist id="custom-local-models">{models.map((entry) => <option value={entry} key={entry} />)}</datalist>
          </label>
        </div>
        {error && <div role="alert" style={{ color: 'var(--bad, #d66)', fontSize: 'var(--font-size-sm)' }}>{error}</div>}
        {notice && <div role="status" style={{ color: 'var(--good, #3bba7a)', fontSize: 'var(--font-size-sm)' }}>{notice}</div>}
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <button type="button" onClick={checkConnection} disabled={checking} style={buttonStyle()}>{checking ? L('Checking…', 'Đang kiểm tra…', '확인 중…', '正在检查…') : L('Test & discover models', 'Kiểm tra & tìm model', '테스트 및 모델 검색', '测试并发现模型')}</button>
          <button type="button" onClick={saveModel} style={buttonStyle(true)}>{L('Save and use in Chat', 'Lưu và dùng trong Chat', '저장 후 Chat에서 사용', '保存并在聊天中使用')}</button>
          {saved && <button type="button" onClick={disconnect} style={buttonStyle()}>{L('Remove from Yana', 'Bỏ khỏi Yana', 'Yana에서 제거', '从 Yana 移除')}</button>}
        </div>
      </section>
      <section aria-label={L('Built-in providers', 'Provider có sẵn', '기본 제공 프로바이더', '内置提供商')}>
        <Providers />
      </section>
    </div>
  );
}
