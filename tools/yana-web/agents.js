'use strict';

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', '..', 'core', 'agents');
const MAX_PROMPT_BYTES = 8 * 1024; // 8 KB cap
const TRUNCATION_MARKER = '\n\n[...system prompt truncated at 8 KB...]';

const GENERIC_PROMPT =
  'You are Yana, a helpful AI task assistant. ' +
  'Complete the user\'s task clearly and concisely. ' +
  'Respond in the same language as the task.';

/**
 * Strip YAML frontmatter (between first two "---" lines) from markdown.
 * Returns the body after the closing ---.
 */
function stripFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return content;
  const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (closeIdx < 0) return content;
  return lines.slice(closeIdx + 1).join('\n').trim();
}

function tryLoadAgent(name) {
  // Sanitize: agent names must be simple alphanumeric + hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return null;
  const filePath = path.join(AGENTS_DIR, name + '.md');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return stripFrontmatter(raw);
  } catch (_) {
    return null;
  }
}

/**
 * loadSystemPrompt(suggestedAgents) → system prompt string
 * Uses the first suggested agent whose .md file exists; falls back to generic.
 * @param {string[]} suggestedAgents
 * @returns {string}
 */
function loadSystemPrompt(suggestedAgents) {
  if (Array.isArray(suggestedAgents)) {
    for (const name of suggestedAgents) {
      if (typeof name !== 'string') continue;
      const body = tryLoadAgent(name.trim());
      if (body && body.length > 0) {
        return capPrompt(body);
      }
    }
  }
  return GENERIC_PROMPT;
}

function capPrompt(text) {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= MAX_PROMPT_BYTES) return text;
  const marker = Buffer.from(TRUNCATION_MARKER, 'utf8');
  const sliced = buf.slice(0, MAX_PROMPT_BYTES - marker.length);
  return sliced.toString('utf8') + TRUNCATION_MARKER;
}

module.exports = { loadSystemPrompt };
