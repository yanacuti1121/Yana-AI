import React from 'react';
import { L } from '../../components.jsx';

// New Yana Workspace empty state — replaces the legacy "Start a
// conversation" landing page (message-log.jsx's own EmptyState, which
// stays as the legacy Chat page's default). Suggestions map to REAL
// capabilities only: "Inspect repository"/"Explain changes" resolve via
// the chat model's real read_file/run_command tools; nothing here is a
// decorative action with no backend behind it.
const SUGGESTIONS = [
  () => L('Inspect this repository', 'Khảo sát repository này', '이 저장소 살펴보기', '检查此仓库'),
  () => L('Explain the current changes', 'Giải thích các thay đổi hiện tại', '현재 변경 사항 설명', '解释当前的更改'),
  () => L('Run the tests', 'Chạy test', '테스트 실행', '运行测试'),
  () => L('Find issues in this code', 'Tìm lỗi trong code này', '이 코드의 문제 찾기', '查找此代码中的问题'),
];

export function EmptyState({ onPick }) {
  return (
    <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 420 }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-xl)', color: 'var(--ink)', marginBottom: 6 }}>
        Yana
      </div>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-base)', marginBottom: 20 }}>
        {L('What do you want to work on?', 'Bạn muốn làm gì?', '무엇을 하고 싶으신가요?', '你想做什么？')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SUGGESTIONS.map((label, i) => (
          <button
            key={i}
            onClick={() => onPick(label())}
            style={{
              textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)', background: 'var(--color-bg-subtle)',
              color: 'var(--ink)', fontSize: 'var(--font-size-sm)', cursor: 'pointer',
            }}
          >
            {label()}
          </button>
        ))}
      </div>
    </div>
  );
}
