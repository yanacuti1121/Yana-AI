---
name: string-validation-patterns
description: Comprehensive string validation for agent inputs and API boundaries. Email, URL, UUID, IP, credit card, hex, base64, JSON, and custom regex validation patterns. Sources: validatorjs/validator.js.
origin: yana-ai — synthesized from validatorjs/validator.js (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /string-validation-patterns

## When to Use

- Validate user input at system boundary before passing to agent tools
- Reject malformed data early (email, URL, UUID) before processing
- Sanitize and normalize strings from external API responses
- Build input validation layer for agent tool parameters

## Do NOT use for

- HTML sanitization (use [[dompurify-xss-prevention]])
- Schema-level type validation (use Zod/Yup for object graphs)

---

## Common validators

```javascript
import validator from 'validator'

// Email
validator.isEmail('user@example.com')       // true
validator.isEmail('not-an-email')            // false

// URL (options: require HTTPS, no localhost)
validator.isURL('https://api.github.com', {
  protocols:      ['https'],
  require_tld:    true,
  require_protocol: true,
  allow_underscores: false,
})

// UUID v4
validator.isUUID('550e8400-e29b-41d4-a716-446655440000', 4)

// IP address (IPv4 or IPv6)
validator.isIP('192.168.1.1')
validator.isIP('::1', 6)

// Alphanumeric only (safe for log entry identifiers)
validator.isAlphanumeric('abc123')

// Base64
validator.isBase64('SGVsbG8gV29ybGQ=')

// JSON string
validator.isJSON('{"key": "value"}')
```

---

## Agent tool input validation

```typescript
import validator from 'validator'

interface ToolInput {
  url?:      string
  email?:    string
  sessionId?: string
  filePath?:  string
}

function validateToolInput(input: ToolInput): string[] {
  const errors: string[] = []

  if (input.url && !validator.isURL(input.url, { protocols: ['https'] })) {
    errors.push(`invalid URL: ${input.url}`)
  }
  if (input.email && !validator.isEmail(input.email)) {
    errors.push(`invalid email: ${input.email}`)
  }
  if (input.sessionId && !validator.isUUID(input.sessionId)) {
    errors.push(`invalid sessionId (must be UUID): ${input.sessionId}`)
  }
  if (input.filePath && !validator.matches(input.filePath, /^[\w\-./]+$/)) {
    errors.push(`suspicious filePath: ${input.filePath}`)
  }

  return errors
}
```

---

## Sanitize (normalize) not just validate

```javascript
// Escape HTML entities in user-supplied content
const safeText = validator.escape('<script>alert(1)</script>')
// → '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;'

// Normalize email
const email = validator.normalizeEmail('User+Tag@Gmail.Com')
// → 'user@gmail.com'

// Strip non-ASCII
const clean = validator.stripLow(userInput, { keep_newlines: true })
```

---

## Anti-Fake-Pass Checklist

```
❌ validator.isURL() accepts http:// by default — specify protocols:['https'] explicitly
❌ validator.isEmail() allows unicode local-part — add ascii_only option for strict validation
❌ No whitespace trim before validation — ' valid@email.com ' fails isEmail
❌ validator.escape() alone not sufficient for HTML content — pair with DOMPurify
❌ isJSON() returns false for arrays ('[1,2,3]') depending on version — test your version
❌ Non-string inputs throw TypeError — coerce to string before calling validators
```
