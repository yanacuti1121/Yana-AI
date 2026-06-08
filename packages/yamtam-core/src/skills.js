'use strict';

const fs   = require('fs');
const path = require('path');

const SKILL_FILE       = 'SKILL.md';
const MAX_PROMPT_BYTES = 8 * 1024;
const MIN_TOKEN_LEN    = 3;

/**
 * createSkills({ skillsDir }) → { findBestSkill, loadSkillPrompt, skillCount }
 */
function createSkills({ skillsDir } = {}) {
  const SKILLS_DIR = skillsDir || '';
  const index = new Map(); // name → dirPath

  if (SKILLS_DIR) {
    try {
      const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          index.set(ent.name.toLowerCase(), path.join(SKILLS_DIR, ent.name));
        }
      }
    } catch (_) {}
  }

  function tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= MIN_TOKEN_LEN);
  }

  function findBestSkill(task) {
    const tokens = tokenize(task);
    if (tokens.length === 0) return null;
    let bestName = null, bestScore = 0;
    for (const name of index.keys()) {
      let score = 0;
      for (const tok of tokens) {
        if (name.includes(tok)) score++;
      }
      if (score > bestScore) { bestScore = score; bestName = name; }
    }
    return bestScore >= 1 ? bestName : null;
  }

  function stripFrontmatter(content) {
    const lines = content.split('\n');
    if (lines[0].trim() !== '---') return content;
    const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    return closeIdx < 0 ? content : lines.slice(closeIdx + 1).join('\n').trim();
  }

  function loadSkillPrompt(name) {
    const dirPath = index.get(name);
    if (!dirPath) return null;
    try {
      const raw  = fs.readFileSync(path.join(dirPath, SKILL_FILE), 'utf8');
      const body = stripFrontmatter(raw);
      const buf  = Buffer.from(body, 'utf8');
      if (buf.length <= MAX_PROMPT_BYTES) return body;
      return buf.slice(0, MAX_PROMPT_BYTES).toString('utf8') + '\n\n[...skill truncated at 8 KB]';
    } catch (_) { return null; }
  }

  return { findBestSkill, loadSkillPrompt, skillCount: () => index.size };
}

module.exports = { createSkills };
