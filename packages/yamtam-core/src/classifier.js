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

module.exports = { createClassifier };
