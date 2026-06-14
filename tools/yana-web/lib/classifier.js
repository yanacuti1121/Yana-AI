'use strict';

const fs   = require('fs');
const path = require('path');

const EXTERNAL_SIGNALS = [
  'git push', 'cargo publish', 'npm publish', 'deploy',
  'send email', 'send message', 'rm -rf', 'production',
  'kubectl apply', 'terraform apply',
];

const COMPLEX_SIGNALS = [
  'implement', 'refactor', 'sửa bug', 'fix bug',
  'add feature', 'create', 'build', 'migrate',
  'test', 'debug',
];

// Learning signals → route to hoc-tap agent
const LEARNING_SIGNALS = [
  'giải thích', 'explain', 'học', 'hiểu', 'tại sao', 'why is',
  'how does', 'hoạt động như thế nào', 'là gì', 'what is',
  'ví dụ về', 'example of', 'dạy tôi', 'teach me',
  'tóm tắt bài', 'summarize this article', 'ôn tập',
  'bài tập', 'exercise', 'quiz', 'kiểm tra kiến thức',
];

// Daily work signals → route to daily-assistant agent
const DAILY_SIGNALS = [
  'tóm tắt', 'summarize', 'soạn email', 'write email', 'viết email',
  'lên kế hoạch', 'plan', 'todo', 'danh sách việc', 'task list',
  'nhắc tôi', 'remind me', 'lịch', 'schedule',
  'phân tích', 'analyze this', 'pros cons', 'so sánh',
  'soạn thảo', 'draft', 'báo cáo', 'report',
];

// Creative writing signals → route to creative-writer agent
const CREATIVE_SIGNALS = [
  'viết bài', 'bài viết', 'blog', 'content', 'copywriting',
  'sáng tác', 'kịch bản', 'story', 'câu chuyện', 'tiểu thuyết',
  'thông điệp', 'slogan', 'tagline', 'quảng cáo', 'ad copy',
  'caption', 'mô tả sản phẩm', 'product description',
  'lời giới thiệu', 'introduction text', 'about us',
  'viết lại', 'rewrite', 'paraphrase',
];

// Data analysis signals → route to data-analyst agent
const DATA_SIGNALS = [
  'phân tích dữ liệu', 'data analysis', 'dataset',
  'sql', 'query', 'select from', 'join',
  'excel', 'csv', 'pandas', 'dataframe', 'matplotlib',
  'thống kê', 'statistics', 'biểu đồ', 'chart', 'dashboard',
  'eda', 'exploratory', 'histogram', 'correlation',
  'machine learning', 'model training', 'feature',
];

// Review / audit signals → route to reviewer agents
const REVIEW_SIGNALS = [
  'review code', 'code review', 'kiểm tra code',
  'đánh giá', 'nhận xét', 'feedback on', 'góp ý',
  'proofreading', 'chỉnh sửa văn bản', 'sửa lỗi chính tả',
  'audit', 'kiểm tra lỗi', 'check this', 'xem lại',
  'có vấn đề gì không', 'có bug không', 'bảo mật',
];

// ── Rule 68 — sensitivity tiers ──────────────────────────────────────────────
// Canonical marker tables live in src/route.rs (yamtam-rt). This JS mirror
// keeps the fallback classifier and the web UI honest when the binary is
// missing or stale. Tier decides persistence + which model may see the text.

const SOVEREIGN_MARKERS = [
  'chỉ mình anh biết', 'chỉ anh biết', 'chỉ riêng anh', 'không ai được biết',
  'sovereign only', 'for my eyes only', 'local model only', 'chỉ model local',
  '#sovereign',
];

const CONFIDENTIAL_MARKERS = [
  'bí mật', 'tuyệt mật', 'confidential', 'đừng ghi lại', 'đừng lưu',
  'không lưu lại', 'không ghi lại', 'không được lưu', 'giữ kín',
  'off the record', 'do not log', "don't log", 'do not save', "don't save",
  'do not persist', '#mật', '#confidential', '#private',
];

const CONFIDENTIAL_SMELLS = [
  'mua công ty', 'bán công ty', 'thương vụ', 'sáp nhập', 'đàm phán',
  'acquisition', 'merger', 'negotiation position', 'lương của', 'salary of',
  'chẩn đoán', 'diagnosis', 'bệnh án', 'health record', 'kiện tụng', 'lawsuit',
  'chưa công bố', 'chưa công khai', 'unannounced',
];

const SENSITIVITY_POLICY = {
  public:       { allow_persist: true,  model_scope: 'any' },
  internal:     { allow_persist: true,  model_scope: 'any' },
  confidential: { allow_persist: false, model_scope: 'cloud-redacted' },
  sovereign:    { allow_persist: false, model_scope: 'local-only' },
};

/** classifySensitivity(text) → { sensitivity, signals } — marker > smell > public > internal */
function classifySensitivity(text) {
  const lower = String(text || '').toLowerCase();
  const hits = set => set.filter(m => lower.includes(m));

  const sov = hits(SOVEREIGN_MARKERS);
  if (sov.length) return { sensitivity: 'sovereign', signals: sov };

  const conf = hits(CONFIDENTIAL_MARKERS);
  if (conf.length) return { sensitivity: 'confidential', signals: conf };

  const smell = hits(CONFIDENTIAL_SMELLS);
  if (smell.length) return { sensitivity: 'confidential', signals: smell };

  if (lower.includes('#public')) return { sensitivity: 'public', signals: ['#public'] };
  return { sensitivity: 'internal', signals: [] };
}

function findMatches(task, signals) {
  const lower = task.toLowerCase();
  return signals.filter(s => lower.includes(s.toLowerCase()));
}

/**
 * createClassifier({ indexPath }) → { classify, matchSkills }
 *
 * @param {object} cfg
 * @param {string} cfg.indexPath  Path to skill-trigger-index.json
 */
function createClassifier({ indexPath } = {}) {
  let SKILL_INDEX = [];
  if (indexPath) {
    try { SKILL_INDEX = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch (_) {}
  }

  function matchSkills(task) {
    if (SKILL_INDEX.length === 0) return [];
    const lower = task.toLowerCase();
    const scored = [];

    for (const entry of SKILL_INDEX) {
      let score = 0;
      const hits = [];
      for (const trigger of entry.triggers) {
        if (lower.includes(trigger)) {
          score += 1 + Math.floor(trigger.length / 8);
          hits.push(trigger);
        } else {
          const parts = trigger.split(' ');
          if (parts.length === 2) {
            const rev = `${parts[1]} ${parts[0]}`;
            if (lower.includes(rev)) {
              score += 1;
              hits.push(trigger);
            }
          }
        }
      }
      if (score > 0) scored.push({ name: entry.name, score, hits });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3);
  }

  function classify(task) {
    if (typeof task !== 'string') task = String(task || '');
    const { sensitivity, signals } = classifySensitivity(task);
    const policy = SENSITIVITY_POLICY[sensitivity];
    return {
      ...classifyRoute(task),
      sensitivity,
      allow_persist:       policy.allow_persist,
      model_scope:         policy.model_scope,
      sensitivity_signals: signals,
    };
  }

  function classifyRoute(task) {
    const extMatches = findMatches(task, EXTERNAL_SIGNALS);
    if (extMatches.length > 0) {
      return {
        route:           'external',
        gate:            'confirm',
        confidence:      Math.min(0.6 + extMatches.length * 0.1, 0.95),
        reason:          'Task involves external side-effects or irreversible actions',
        matched_signals: extMatches,
        matched_skills:  [],
        suggested_agents: ['security-engineer', 'deployment-engineer'],
      };
    }

    const skillMatches = matchSkills(task);
    if (skillMatches.length > 0 && skillMatches[0].score >= 1) {
      const top = skillMatches[0];
      const confidence = Math.min(0.55 + top.score * 0.07, 0.95);
      return {
        route:           'skill',
        gate:            'harness',
        confidence,
        reason:          `Matched skill: ${top.name} (triggers: ${top.hits.slice(0, 3).join(', ')})`,
        matched_signals: top.hits,
        matched_skills:  skillMatches.map(s => s.name),
        suggested_agents: [top.name],
      };
    }

    const learnMatches = findMatches(task, LEARNING_SIGNALS);
    if (learnMatches.length > 0) {
      return {
        route:           'learn',
        gate:            'auto',
        confidence:      Math.min(0.65 + learnMatches.length * 0.08, 0.92),
        reason:          'Learning or explanation request detected',
        matched_signals: learnMatches,
        matched_skills:  skillMatches.map(s => s.name),
        suggested_agents: ['hoc-tap'],
      };
    }

    const dailyMatches = findMatches(task, DAILY_SIGNALS);
    if (dailyMatches.length > 0) {
      return {
        route:           'daily',
        gate:            'auto',
        confidence:      Math.min(0.65 + dailyMatches.length * 0.08, 0.92),
        reason:          'Daily work task detected',
        matched_signals: dailyMatches,
        matched_skills:  skillMatches.map(s => s.name),
        suggested_agents: ['daily-assistant'],
      };
    }

    const creativeMatches = findMatches(task, CREATIVE_SIGNALS);
    if (creativeMatches.length > 0) {
      return {
        route:           'creative',
        gate:            'auto',
        confidence:      Math.min(0.65 + creativeMatches.length * 0.08, 0.92),
        reason:          'Creative writing or content request detected',
        matched_signals: creativeMatches,
        matched_skills:  skillMatches.map(s => s.name),
        suggested_agents: ['creative-writer', 'documentation-writer'],
      };
    }

    const dataMatches = findMatches(task, DATA_SIGNALS);
    if (dataMatches.length > 0) {
      return {
        route:           'data',
        gate:            'auto',
        confidence:      Math.min(0.65 + dataMatches.length * 0.08, 0.92),
        reason:          'Data analysis or SQL task detected',
        matched_signals: dataMatches,
        matched_skills:  skillMatches.map(s => s.name),
        suggested_agents: ['data-analyst', 'database-reviewer'],
      };
    }

    const reviewMatches = findMatches(task, REVIEW_SIGNALS);
    if (reviewMatches.length > 0) {
      return {
        route:           'review',
        gate:            'auto',
        confidence:      Math.min(0.65 + reviewMatches.length * 0.08, 0.92),
        reason:          'Review or audit task detected',
        matched_signals: reviewMatches,
        matched_skills:  skillMatches.map(s => s.name),
        suggested_agents: ['code-reviewer', 'react-reviewer'],
      };
    }

    const cplxMatches = findMatches(task, COMPLEX_SIGNALS);
    if (cplxMatches.length > 0) {
      return {
        route:           'complex',
        gate:            'harness',
        confidence:      Math.min(0.6 + cplxMatches.length * 0.1, 0.95),
        reason:          'Task requires multi-step code changes or analysis',
        matched_signals: cplxMatches,
        matched_skills:  skillMatches.map(s => s.name),
        suggested_agents: ['backend-developer', 'code-reviewer'],
      };
    }

    return {
      route:           'simple',
      gate:            'auto',
      confidence:      0.5,
      reason:          'No complex or external signals detected',
      matched_signals: [],
      matched_skills:  skillMatches.map(s => s.name),
      suggested_agents: [],
    };
  }

  return { classify, matchSkills };
}

module.exports = { createClassifier, classifySensitivity };
