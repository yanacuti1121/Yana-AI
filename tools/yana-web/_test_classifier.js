'use strict';
// Tests for the yamtam-core classifier (route + rule-68 sensitivity).
// Run: node _test_classifier.js
const { createClassifier, classifySensitivity } = require('yamtam-core/src/classifier.js');
const { classify } = createClassifier({});

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else      { fail++; console.log('FAIL  ' + name); }
}

// ── Routing ───────────────────────────────────────────────────────────────────
t('external route',          classify('git push origin main').route === 'external');
t('Vietnamese complex',      classify('sửa bug auth middleware').route === 'complex');
t('simple question',         classify('what time is it').route === 'simple');

const keys = Object.keys(classify('what time is it')).sort().join(',');
const expected = 'allow_persist,confidence,gate,matched_signals,matched_skills,'
  + 'model_scope,reason,route,sensitivity,sensitivity_signals,suggested_agents';
t('decision carries route + rule-68 keys', keys === expected);

// ── Rule 68 — sensitivity tiers ──────────────────────────────────────────────
const sov = classify('chuyện này chỉ mình anh biết: kế hoạch năm sau');
t('sovereign marker → sovereign',      sov.sensitivity === 'sovereign');
t('sovereign → local-only',            sov.model_scope === 'local-only');
t('sovereign → no persist',            sov.allow_persist === false);

const conf = classify('đừng ghi lại nhé — sắp có thay đổi nhân sự');
t('confidential marker → confidential', conf.sensitivity === 'confidential');
t('confidential → cloud-redacted',      conf.model_scope === 'cloud-redacted');
t('confidential → no persist',          conf.allow_persist === false);

const smell = classify('phân tích thương vụ sáp nhập chưa công bố');
t('context smell → confidential',       smell.sensitivity === 'confidential');

const sec = classify('sửa bug bảo mật trong auth middleware');
t("security work ('bảo mật') stays internal", sec.sensitivity === 'internal' && sec.allow_persist === true);

const plain = classify('explain how the router works');
t('default tier is internal',           plain.sensitivity === 'internal' && plain.model_scope === 'any');

const tag = classifySensitivity('#mật ghi chú buổi họp đối tác');
t('hashtag marker via direct export',   tag.sensitivity === 'confidential' && tag.signals.length > 0);

console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
