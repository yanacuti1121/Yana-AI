---
name: dompurify-xss-prevention
description: DOMPurify XSS sanitization for HTML content in agent outputs. Strip script tags and event handlers, allowlist-based tag/attribute filtering, sanitize LLM-generated HTML before rendering, and defend against DOM clobbering. Sources: cure53/DOMPurify.
origin: yamtam-engine — synthesized from cure53/DOMPurify (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /dompurify-xss-prevention

## When to Use

- Sanitize HTML produced by LLM before rendering in web UI
- Strip malicious payloads from web-scraped content before storing in agent memory
- Validate HTML tool outputs before passing to downstream HTML-rendering components
- Prevent stored XSS when agent outputs are displayed to other users

## Do NOT use for

- Plain text sanitization (overkill — use [[string-validation-patterns]])
- Server-side template injection (different attack class)

---

## Browser + JSDOM (server-side)

```javascript
import { JSDOM }    from 'jsdom'
import DOMPurify   from 'dompurify'

const { window } = new JSDOM('')
const purify     = DOMPurify(window)

function sanitizeHtml(dirty: string): string {
  return purify.sanitize(dirty, {
    ALLOWED_TAGS:  ['p','br','b','i','em','strong','ul','ol','li','code','pre','h1','h2','h3'],
    ALLOWED_ATTR:  ['class'],       // no href, no src, no on* handlers
    FORBID_TAGS:   ['script','style','iframe','object','embed','form','input'],
    FORBID_ATTR:   ['onerror','onload','onclick','href','src','action','formaction'],
    ALLOW_DATA_ATTR: false,         // no data-* attributes (DOM clobbering vector)
    RETURN_DOM:    false,
    RETURN_DOM_FRAGMENT: false,
  })
}
```

---

## Strict sanitize (text only)

```javascript
function toPlainText(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS:  [],   // strip ALL tags
    ALLOWED_ATTR:  [],
    KEEP_CONTENT:  true, // keep text content inside stripped tags
  })
}

toPlainText('<script>alert(1)</script>Hello <b>World</b>')
// → 'Hello World'
```

---

## Sanitize LLM output pipeline

```typescript
interface LLMOutput {
  text:  string
  html?: string
}

function safeLLMOutput(raw: LLMOutput): LLMOutput {
  return {
    text: raw.text,
    html: raw.html ? sanitizeHtml(raw.html) : undefined,
  }
}

// Hook: run before any LLM HTML output is stored or rendered
purify.addHook('afterSanitizeAttributes', (node) => {
  // Block javascript: URLs even in allowed attributes
  if (node.hasAttribute('href')) {
    const href = node.getAttribute('href') ?? ''
    if (/^javascript:/i.test(href)) node.removeAttribute('href')
  }
})
```

---

## Content Security Policy complement

```html
<!-- CSP header to back up DOMPurify (defense in depth) -->
Content-Security-Policy:
  default-src 'self';
  script-src  'self';
  style-src   'self' 'unsafe-inline';
  img-src     'self' data:;
  connect-src 'self';
  frame-src   'none';
  object-src  'none'
```

---

## Anti-Fake-Pass Checklist

```
❌ DOMPurify used in Node.js without JSDOM → no DOM API → sanitize() is no-op
❌ ALLOWED_ATTR includes 'href' without protocol check → javascript:alert(1)
❌ ALLOW_DATA_ATTR:true → data-* attributes used for DOM clobbering attacks
❌ No JSDOM window passed to DOMPurify(window) → undefined behavior
❌ Sanitizing after storing in DB → stored XSS window between store and sanitize
❌ mXSS: DOMPurify v2 has known bypasses — always use latest version
❌ No CSP header → XSS possible via browser's own DOM quirks despite sanitization
```
