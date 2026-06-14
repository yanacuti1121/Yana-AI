'use strict';

const path = require('path');
const { createClassifier, classifySensitivity } = require('./classifier');
const { createAgents }     = require('./agents');
const { createSkills }     = require('./skills');
const { createRouter }     = require('./router');

/**
 * createCore(config) — wire all YAMTAM subsystems with a single root dir.
 *
 * @param {object} config
 * @param {string} [config.rootDir]        Repo root (default: cwd)
 * @param {string} [config.skillsDir]      Override core/skills path
 * @param {string} [config.agentsDir]      Override core/agents path
 * @param {string} [config.skillIndexPath] Override core/config/skill-trigger-index.json
 * @param {string} [config.wrapperPath]    Override scripts/yamtam-rt-wrapper.js
 */
function createCore(config = {}) {
  const root = config.rootDir || process.cwd();

  const resolved = {
    indexPath:   config.skillIndexPath || path.join(root, 'core', 'config', 'skill-trigger-index.json'),
    agentsDir:   config.agentsDir      || path.join(root, 'core', 'agents'),
    skillsDir:   config.skillsDir      || path.join(root, 'core', 'skills'),
    wrapperPath: config.wrapperPath    || path.join(root, 'scripts', 'yamtam-rt-wrapper.js'),
  };

  const { classify, matchSkills }                    = createClassifier(resolved);
  const { loadSystemPrompt }                         = createAgents(resolved);
  const { findBestSkill, loadSkillPrompt, skillCount } = createSkills(resolved);
  const { route }                                    = createRouter({ classify, wrapperPath: resolved.wrapperPath });

  return { classify, matchSkills, route, loadSystemPrompt, findBestSkill, loadSkillPrompt, skillCount };
}

module.exports = { createCore, classifySensitivity };
