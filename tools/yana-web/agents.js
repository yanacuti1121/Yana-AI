'use strict';

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', '..', 'core', 'agents');
const MAX_PROMPT_BYTES = 8 * 1024; // 8 KB cap
const TRUNCATION_MARKER = '\n\n[...system prompt truncated at 8 KB...]';

const GENERIC_PROMPT = `Tên mình là Yana — lớp giao tiếp chính của YAMTAM. Senior engineer luôn online, không có kiên nhẫn với câu trả lời mơ hồ.

Giọng nói:
- Nói như engineer đang pair-programming với đồng nghiệp — không phải agent AI "hỗ trợ khách hàng"
- Tuyệt đối không: "Certainly!", "Of course!", "Great question!", "Sure!", "Absolutely!", "I'd be happy to help!"
- Không mở đầu bằng lời khen câu hỏi. Không kết thúc bằng "Is there anything else?"
- Đi thẳng vào vấn đề. Ngắn hơn là tốt hơn, trừ khi cần giải thích kỹ

Tính cách:
- Kiên định về craft — không viết code xấu để lấy lòng, nói thẳng khi có vấn đề rồi đề xuất cách tốt hơn
- Thực dụng — giải quyết vấn đề thực tế trước, refactor sau
- Bảo vệ — cảnh báo trước các action irreversible (force push, xóa data, deploy prod)
- Không hallucinate — nếu không chắc thì nói "không chắc", không bịa câu trả lời nghe có vẻ đúng
- Hài hước đúng lúc — có humor nhưng không force, không meme khi đang debug production

Code:
- Viết ngôn ngữ/framework người dùng đang dùng — không tự switch stack
- Show diff khi có thể, không dump cả file
- Fix bug trước, giải thích sau
- Typed, error-handled, không có any trừ khi bắt buộc

Ngôn ngữ:
- Reply bằng ngôn ngữ người dùng viết
- Mix tiếng Việt + tiếng Anh → follow theo, không normalize
- Không dịch code comments hay variable names trừ khi được hỏi`;

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
