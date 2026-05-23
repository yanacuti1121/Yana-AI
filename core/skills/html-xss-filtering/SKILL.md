---
name: html-xss-filtering
description: Custom-allowlist XSS filtering with fine-grained tag and attribute control. leizongmin/js-xss whitelist configuration, attribute value sanitization, CSS sanitization, and protocol filtering. Sources: leizongmin/js-xss.
origin: yamtam-engine — synthesized from leizongmin/js-xss (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /html-xss-filtering

## When to Use

- Sanitize user-generated HTML with custom allowed tag/attribute rules
- Strip XSS from web-scraped content before indexing in agent memory
- Preserve safe formatting (bold, lists) while stripping dangerous attributes
- Server-side filtering when DOMPurify (browser-oriented) is not preferred

## Do NOT use for

- Scenarios requiring DOM parsing (use [[dompurify-xss-prevention]] with JSDOM)
- Plain text — stripping is 1 line with `replace(/<[^>]*>/g, '')`

---

## Custom allowlist config

```javascript
import xss from 'xss'

const agentXss = new xss.FilterXSS({
  whiteList: {
    a:      ['href', 'title', 'target'],
    b:      [],
    i:      [],
    em:     [],
    strong: [],
    p:      ['class'],
    br:     [],
    ul:     [],
    ol:     [],
    li:     [],
    code:   ['class'],
    pre:    ['class'],
    h1:     [], h2: [], h3: [],
    // Explicitly NOT included: script, style, iframe, object, form, input
  },

  // Strip href with javascript: or data: protocols
  onTagAttr(tag, name, value) {
    if (name === 'href') {
      if (/^javascript:/i.test(value) || /^data:/i.test(value)) {
        return ''  // remove attribute
      }
    }
    return undefined  // use default (allowlist check)
  },

  // Replace unknown tags with escaped text (don't silently drop)
  escapeHtml: xss.escapeHtml,
})

const clean = agentXss.process('<script>alert(1)</script><b>Safe</b>')
// → '&lt;script&gt;alert(1)&lt;/script&gt;<b>Safe</b>'
```

---

## Strip all HTML (plain text extraction)

```javascript
const textOnly = new xss.FilterXSS({
  whiteList: {},
  stripIgnoreTag:       true,
  stripIgnoreTagBody:   ['script', 'style'],
})

const text = textOnly.process('<div>Hello <b>World</b><script>bad()</script></div>')
// → 'Hello World'
```

---

## CSS attribute sanitization

```javascript
import xss from 'xss'

const withCss = new xss.FilterXSS({
  whiteList: { span: ['style'] },
  css: {
    whiteList: {
      color:      true,
      'font-size': /^\d+(px|em|rem|%)$/,
      // Block: expression(), url(), behavior:
    },
  },
})
```

---

## Anti-Fake-Pass Checklist

```
❌ Empty whiteList {} with no stripIgnoreTag → unknown tags preserved, XSS possible
❌ href not validated for protocol → javascript: and data: URIs pass through
❌ css option not set when style attribute allowed → CSS expression() injection
❌ onTagAttr returning null vs undefined → null strips attribute, undefined uses default
❌ Nested quotes in attribute values → some parsers misinterpret, allowing escape
❌ No escaping of tag bodies after strip → raw content may contain partial HTML
```
