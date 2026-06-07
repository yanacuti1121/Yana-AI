'use strict';

const fs   = require('fs');
const path = require('path');

const SKILLS_DIR      = path.join(__dirname, '..', '..', 'core', 'skills');
const SKILL_FILE      = 'SKILL.md';
const MAX_PROMPT_BYTES = 8 * 1024;
const MIN_TOKEN_LEN   = 3;

// ── Index: skill-name → dir-path (built once at startup) ─────────────────────
const skillIndex = new Map();

function buildIndex() {
  try {
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        skillIndex.set(ent.name.toLowerCase(), path.join(SKILLS_DIR, ent.name));
      }
    }
  } catch (_) {}
}

buildIndex();

// ── Search: substring match skill names against task tokens ───────────────────
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

  let bestName  = null;
  let bestScore = 0;

  for (const name of skillIndex.keys()) {
    let score = 0;
    for (const tok of tokens) {
      if (name.includes(tok)) score++;
    }
    if (score > bestScore) { bestScore = score; bestName = name; }
  }

  return bestScore >= 1 ? bestName : null;
}

// ── Load: read SKILL.md, strip frontmatter, cap at 8 KB ──────────────────────
function stripFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return content;
  const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  return closeIdx < 0 ? content : lines.slice(closeIdx + 1).join('\n').trim();
}

function loadSkillPrompt(name) {
  const dirPath = skillIndex.get(name);
  if (!dirPath) return null;
  try {
    const raw  = fs.readFileSync(path.join(dirPath, SKILL_FILE), 'utf8');
    const body = stripFrontmatter(raw);
    const buf  = Buffer.from(body, 'utf8');
    if (buf.length <= MAX_PROMPT_BYTES) return body;
    return buf.slice(0, MAX_PROMPT_BYTES).toString('utf8') + '\n\n[...skill truncated at 8 KB]';
  } catch (_) { return null; }
}

module.exports = {
  findBestSkill,
  loadSkillPrompt,
  skillCount: () => skillIndex.size,
};
