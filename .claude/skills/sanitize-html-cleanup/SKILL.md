---
name: sanitize-html-cleanup
description: Strict HTML cleanup with self-closing tag repair, attribute allowlists, URL protocol validation, and CSS sanitization. apostrophecms/sanitize-html patterns for cleaning LLM-generated and web-scraped HTML. Sources: apostrophecms/sanitize-html.
origin: yamtam-engine — synthesized from apostrophecms/sanitize-html (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /sanitize-html-cleanup

## When to Use

- Fix malformed HTML (unclosed tags, broken nesting) from LLM output
- Sanitize HTML from web scraping before storing in agent knowledge base
- Configure per-tag attribute rules more granularly than DOMPurify
- Server-side Node.js HTML sanitization without JSDOM overhead

## Do NOT use for

- Pure XSS prevention in high-security contexts (use [[dompurify-xss-prevention]])
- Plain text extraction (empty allowedTags list works but use regex instead)

---

## Strict config

```javascript
import sanitizeHtml from 'sanitize-html'

const STRICT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'b', 'i', 'em', 'strong', 'ul', 'ol', 'li', 'code', 'pre',
                'h1', 'h2', 'h3', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],

  allowedAttributes: {
    '*':    ['class'],
    'a':    ['href', 'title'],
    'code': ['class'],   // for syntax highlighting classes
    'pre':  ['class'],
  },

  allowedSchemes:       ['https', 'mailto'],
  allowedSchemesByTag:  { 'a': ['https', 'mailto'] },

  // Auto-repair unclosed tags
  selfClosing: ['br', 'hr', 'img', 'input'],

  // Transform: strip onclick but keep the element
  transformTags: {
    'a': sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
  },

  disallowedTagsMode: 'discard',   // 'discard' | 'escape' | 'recursiveEscape'
}

const clean = sanitizeHtml(dirtyHtml, STRICT_OPTIONS)
```

---

## Text-only extraction

```javascript
const text = sanitizeHtml(html, {
  allowedTags:       [],
  allowedAttributes: {},
})
// Preserves text content, strips all markup
```

---

## LLM output pipeline

```typescript
function cleanLLMHtml(raw: string): string {
  // 1. sanitize-html fixes malformed structure + strips dangerous content
  const sanitized = sanitizeHtml(raw, STRICT_OPTIONS)

  // 2. Strip empty paragraphs
  return sanitized.replace(/<p>\s*<\/p>/g, '')
}
```

---

## Allow CSS with constraints

```javascript
{
  allowedAttributes: { '*': ['style'] },
  allowedStyles: {
    '*': {
      color:       [/^#[0-9a-f]{3,6}$/i, /^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/],
      'font-size': [/^\d+(px|em|rem|%)$/],
      // Block: expression(), url(), behavior: — these are not in the allowlist
    },
  },
}
```

---

## Anti-Fake-Pass Checklist

```
❌ allowedTags not set → sanitize-html uses its default list (may include script)
❌ href allowed without allowedSchemes → javascript: and data: URIs pass through
❌ disallowedTagsMode:'escape' → script tags rendered as visible text but NOT removed
❌ Nested allowedAttributes { 'a': ['onclick'] } → XSS via event handler
❌ CSS url() in style attribute not blocked by allowedStyles → SSRF via CSS
❌ transformTags not a function but array → TypeError at runtime
```
