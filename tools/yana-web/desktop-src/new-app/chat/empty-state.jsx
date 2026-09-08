import React from 'react';
import { L } from '../../components.jsx';

// New Yana Workspace empty state — replaces the legacy "Start a
// conversation" landing page (message-log.jsx's own EmptyState, which
// stays as the legacy Chat page's default). Suggestions map to REAL
// capabilities only: "Inspect repository"/"Explain changes" resolve via
// the chat model's real read_file/run_command tools; nothing here is a
// decorative action with no backend behind it.
const MODES = [
  {
    label: () => L('Code', 'Lập trình', '코드', '代码'),
    prompt: () => L('Help me write or improve code in this project.', 'Giúp tôi viết hoặc cải thiện code trong project này.', '이 프로젝트의 코드를 작성하거나 개선해 주세요.', '帮助我编写或改进此项目中的代码。'),
  },
  {
    label: () => L('Analyze', 'Phân tích', '분석', '分析'),
    prompt: () => L('Analyze this project and explain the most important findings.', 'Phân tích project này và giải thích những phát hiện quan trọng nhất.', '이 프로젝트를 분석하고 가장 중요한 발견을 설명해 주세요.', '分析此项目并说明最重要的发现。'),
  },
  {
    label: () => L('Design', 'Thiết kế', '디자인', '设计'),
    prompt: () => L('Help me design a focused implementation plan for this project.', 'Giúp tôi thiết kế kế hoạch triển khai rõ ràng cho project này.', '이 프로젝트를 위한 집중된 구현 계획을 설계해 주세요.', '帮助我为此项目设计一份聚焦的实现计划。'),
  },
  {
    label: () => L('Research', 'Nghiên cứu', '리서치', '研究'),
    prompt: () => L('Research the current codebase and identify important trade-offs.', 'Nghiên cứu codebase hiện tại và chỉ ra các đánh đổi quan trọng.', '현재 코드베이스를 조사하고 중요한 트레이드오프를 식별해 주세요.', '研究当前代码库并找出重要的权衡。'),
  },
  {
    label: () => L('Automate', 'Tự động hóa', '자동화', '自动化'),
    prompt: () => L('Find a safe workflow in this project that is worth automating.', 'Tìm một quy trình an toàn trong project này đáng để tự động hóa.', '이 프로젝트에서 자동화할 가치가 있는 안전한 워크플로를 찾아 주세요.', '在此项目中找到值得自动化的安全工作流程。'),
  },
];

const SUGGESTIONS = [
  () => L('Inspect this repository', 'Khảo sát repository này', '이 저장소 살펴보기', '检查此仓库'),
  () => L('Explain the current changes', 'Giải thích các thay đổi hiện tại', '현재 변경 사항 설명', '解释当前的更改'),
  () => L('Run the tests', 'Chạy test', '테스트 실행', '运行测试'),
  () => L('Find issues in this code', 'Tìm lỗi trong code này', '이 코드의 문제 찾기', '查找此代码中的问题'),
];

export function EmptyState({ onPick }) {
  return (
    <div className="na-empty-state" style={{ margin: 'auto', textAlign: 'center', maxWidth: 650 }}>
      <h1 className="na-empty-heading">
        {L('How can I help you today?', 'Hôm nay em có thể giúp anh việc gì?', '오늘 무엇을 도와드릴까요?', '今天我能为你做什么？')}
      </h1>
      <div className="na-mode-actions" aria-label={L('Chat modes', 'Chế độ trò chuyện', '채팅 모드', '聊天模式')}>
        {MODES.map((mode) => (
          <button key={mode.label()} onClick={() => onPick(mode.prompt())} className="na-mode-action">
            {mode.label()}
          </button>
        ))}
      </div>
      <div className="na-suggestion-grid">
        {SUGGESTIONS.map((label, i) => (
          <button
            key={i}
            onClick={() => onPick(label())}
            className="na-suggestion-card"
          >
            {label()}
          </button>
        ))}
      </div>
    </div>
  );
}
