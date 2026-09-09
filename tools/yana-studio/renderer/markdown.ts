import { marked } from "marked";
import DOMPurify from "dompurify";

// LLM output is untrusted text (owasp-llm-output-law.md) — Markdown → HTML
// must go through DOMPurify before ever reaching the DOM. Never render raw
// marked.parse() output directly (no `dangerouslySetInnerHTML={{ __html: raw }}`
// without this step in between).
marked.setOptions({ breaks: true, gfm: true });

const ALLOWED_TAGS = [
  "p",
  "strong",
  "em",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "a",
  "br",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];
const ALLOWED_ATTR = ["href", "class"];

export function renderMarkdown(raw: string): string {
  const html = marked.parse(raw, { async: false });
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Belt-and-suspenders on top of the tag/attr allowlist above — DOMPurify
    // already strips javascript:/data: hrefs by default, this just makes
    // the intent explicit rather than relying on the default silently.
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}
