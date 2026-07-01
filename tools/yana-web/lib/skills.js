'use strict';

const fs   = require('fs');
const path = require('path');

const SKILL_FILE       = 'SKILL.md';
const MAX_PROMPT_BYTES = 8 * 1024;
const MIN_TOKEN_LEN    = 3;

/**
 * createSkills({ skillsDir }) → { findBestSkill, loadSkillPrompt, skillCount }
 */
// Weight given to a token match against the skill's folder name vs. its
// description. Name matches are a stronger, more deliberate signal (the
// task probably named the skill/technology outright); description matches
// are the recall net that catches everything the name alone can't.
const NAME_MATCH_WEIGHT = 2;
const DESC_MATCH_WEIGHT = 1;

// Pull just the `description:` field out of SKILL.md frontmatter without a
// full YAML dependency (keeps this zero-dep). Handles both the inline form
//   description: one line of text
// and the block form
//   description: >
//     folded text
//     across multiple indented lines
function extractDescription(raw) {
  const lines = raw.split('\n');
  if (lines[0].trim() !== '---') return '';
  const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  const front = closeIdx < 0 ? lines.slice(1) : lines.slice(1, closeIdx);

  const idx = front.findIndex(l => /^description:\s*(.*)$/.test(l));
  if (idx < 0) return '';

  const m = front[idx].match(/^description:\s*(.*)$/);
  const inline = m[1].trim();

  // Block scalar (`>` folded or `|` literal) — collect subsequent indented lines.
  if (inline === '>' || inline === '|' || inline === '>-' || inline === '|-') {
    const block = [];
    for (let i = idx + 1; i < front.length; i++) {
      if (/^\s+\S/.test(front[i])) block.push(front[i].trim());
      else break;
    }
    return block.join(' ');
  }
  return inline.replace(/^["']|["']$/g, '');
}

function createSkills({ skillsDir } = {}) {
  const SKILLS_DIR = skillsDir || '';
  const index = new Map(); // name → dirPath
  const descTokens = new Map(); // name → Set<token> parsed from description

  function tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= MIN_TOKEN_LEN);
  }

  if (SKILLS_DIR) {
    try {
      const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const key = ent.name.toLowerCase();
        const dirPath = path.join(SKILLS_DIR, ent.name);
        index.set(key, dirPath);

        // Best-effort: a skill with unreadable/missing frontmatter still
        // works via name matching, it just won't get the description boost.
        try {
          const raw = fs.readFileSync(path.join(dirPath, SKILL_FILE), 'utf8');
          const desc = extractDescription(raw);
          if (desc) descTokens.set(key, new Set(tokenize(desc)));
        } catch (_) {}
      }
    } catch (_) {}
  }

  // Minimum token length allowed to count as a *substring* match against the
  // name (e.g. "auth" inside "authentication-patterns"). Below this length,
  // short tokens like "tra" or "con" collide accidentally with unrelated
  // words ("con-tra-ct") far too often to be trusted as a name signal —
  // they still get scored, but only via the description-token set below,
  // where they must match a whole word rather than any substring.
  const MIN_SUBSTRING_MATCH_LEN = 4;

  function findBestSkill(task) {
    const tokens = tokenize(task);
    if (tokens.length === 0) return null;
    let bestName = null, bestScore = 0;
    for (const name of index.keys()) {
      let score = 0;
      const desc = descTokens.get(name);
      const nameParts = name.split(/[^a-z0-9]+/);
      for (const tok of tokens) {
        const wholeWordNameMatch = nameParts.includes(tok);
        const substringNameMatch = tok.length >= MIN_SUBSTRING_MATCH_LEN && name.includes(tok);
        if (wholeWordNameMatch || substringNameMatch) score += NAME_MATCH_WEIGHT;
        else if (desc && desc.has(tok)) score += DESC_MATCH_WEIGHT;
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
