---
name: grammar-lexer-dsl
description: Grammar definition, lexing, and DSL compilation patterns for AI agent config parsing. Chevrotain high-performance LL(k) parser for custom rule DSLs, Handlebars safe template compilation without eval, marked Markdown-to-HTML with custom renderer, Prism tokenization for syntax highlighting, PEG.js parser generator from grammar expressions. Sources: chevrotain/chevrotain, handlebars-lang/handlebars.js, markedjs/marked, prismjs/prism, pegjs/pegjs.
origin: yamtam-engine — synthesized from chevrotain/chevrotain, handlebars-lang/handlebars.js, markedjs/marked, prismjs/prism, pegjs/pegjs
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.46
---

# /grammar-lexer-dsl

## When to Use

- YAMTAM rule files need a faster parser than JSON/YAML (custom DSL)
- Rendering Markdown rule docs to HTML for a dashboard
- Tokenizing source code for highlighting in agent output
- Template-filling audit reports / skill docs without exec risk
- Writing a mini grammar to parse structured agent log lines

## Do NOT use for

- Simple key=value config (use dotenv or ini)
- JSON/YAML config that already parses fine (don't over-engineer)

---

## Decision: Which Tool

```
Need to define a new custom grammar (DSL) for YAMTAM config?
  → PEG.js (grammar file → parser, great for structured text)
  OR Chevrotain (code-first, better error messages, no codegen step)

Need to fill templates with data safely (no eval/exec)?
  → Handlebars (logic-less, safe, partials, helpers)

Rendering Markdown docs to HTML?
  → marked (fastest, custom renderer for code blocks)

Tokenizing / syntax-highlighting code in agent output?
  → Prism (language grammars as regex sets, browser + Node)
```

---

## Chevrotain: Custom Rule DSL Parser

```typescript
import { createToken, Lexer, CstParser, tokenMatcher } from 'chevrotain'

// 1. Define tokens (lexer rules)
const Gate    = createToken({ name: 'Gate',    pattern: /L[0-5]/        })
const Rule    = createToken({ name: 'Rule',    pattern: /[a-z][a-z0-9-]+/ })
const Colon   = createToken({ name: 'Colon',   pattern: /:/               })
const Arrow   = createToken({ name: 'Arrow',   pattern: /->/              })
const NL      = createToken({ name: 'NL',      pattern: /\n+/, group: Lexer.SKIPPED })
const WS      = createToken({ name: 'WS',      pattern: /[ \t]+/, group: Lexer.SKIPPED })

// Ordering matters — longer/specific tokens BEFORE generic
const allTokens = [Gate, Arrow, Colon, Rule, NL, WS]
const YamtamLexer = new Lexer(allTokens)

// Input: "L2: shell-sanitize-law -> network-egress-law"
// 2. Define parser (CST = Concrete Syntax Tree)
class YamtamDSLParser extends CstParser {
  constructor() {
    super(allTokens)
    this.performSelfAnalysis()  // must be called at end of constructor
  }

  // Rule: gateDecl := Gate COLON Rule (ARROW Rule)*
  gateDecl = this.RULE('gateDecl', () => {
    this.CONSUME(Gate)
    this.CONSUME(Colon)
    this.CONSUME(Rule)
    this.MANY(() => {
      this.CONSUME(Arrow)
      this.CONSUME2(Rule)   // Rule2 to avoid token alias conflict
    })
  })

  // Top-level rule
  program = this.RULE('program', () => {
    this.MANY(() => this.SUBRULE(this.gateDecl))
  })
}

const parser = new YamtamDSLParser()

// 3. Parse input
function parseGateConfig(input: string) {
  const { tokens, errors: lexErrors } = YamtamLexer.tokenize(input)
  if (lexErrors.length) throw new Error(`Lex error: ${lexErrors[0].message}`)

  parser.input = tokens
  const cst    = parser.program()

  if (parser.errors.length) {
    throw new Error(`Parse error: ${parser.errors[0].message}`)
  }
  return cst
}

// Rule: performSelfAnalysis() must be last line of constructor (validates grammar)
// Rule: CONSUME vs CONSUME2 etc — use numbered variants for same token in one rule
// Rule: Chevrotain gives line+column in errors — far better than regex for debugging
```

---

## Handlebars: Safe Template Compilation

```typescript
import Handlebars from 'handlebars'

// Register a helper (safe — no eval, no exec)
Handlebars.registerHelper('upper', (str: string) => str.toUpperCase())

Handlebars.registerHelper('gateLabel', (level: number) => {
  const labels: Record<number, string> = { 0: 'Audit', 1: 'Anti-Evasion', 2: 'Sanitize', 3: 'Egress', 4: 'SLSA' }
  return labels[level] ?? `L${level}`
})

// Register a partial (reusable fragment)
Handlebars.registerPartial('ruleHeader', `
## {{ruleName}} (Gate {{gateLabel gate}})
**Status:** {{status}}  **Version:** {{version}}
`)

// Compile template — result is a pure function, no exec at call time
const reportTemplate = Handlebars.compile(`
# YAMTAM Audit Report — {{date}}

{{#each gates}}
  {{> ruleHeader ruleName=this.name gate=this.level status=this.status version=../version}}
  {{#if this.violations}}
  ### Violations
  {{#each this.violations}}
  - [{{upper this.severity}}] {{this.message}}
  {{/each}}
  {{/if}}
{{/each}}
`)

const report = reportTemplate({
  date:    '2026-05-22',
  version: '1.3.46',
  gates: [
    { name: 'shell-sanitize-law', level: 2, status: 'ACTIVE', violations: [] },
    { name: 'network-egress-law', level: 3, status: 'ACTIVE',
      violations: [{ severity: 'warn', message: 'Allowlist empty — deny-all mode' }] },
  ],
})

// Rule: Handlebars.compile() once, cache the fn — don't re-compile per request
// Rule: {{expression}} HTML-escapes by default; use {{{expression}}} for raw HTML only
// Rule: never pass user-supplied strings as template source — compile only trusted templates
```

---

## marked: Markdown → HTML with Custom Renderer

```typescript
import { marked, Renderer } from 'marked'

// Custom renderer — override specific node types
const renderer = new Renderer()

// Highlight code blocks with language tag
renderer.code = (code: string, lang: string = '') => {
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<pre class="language-${lang}"><code class="language-${lang}">${escaped}</code></pre>`
}

// Open external links in new tab
renderer.link = (href: string, title: string | null, text: string) => {
  const external = href.startsWith('http')
  const attrs    = external ? ' target="_blank" rel="noopener noreferrer"' : ''
  const titleAttr = title ? ` title="${title}"` : ''
  return `<a href="${href}"${titleAttr}${attrs}>${text}</a>`
}

// Render rule doc headings with anchor IDs
renderer.heading = (text: string, level: number) => {
  const id = text.toLowerCase().replace(/\W+/g, '-')
  return `<h${level} id="${id}">${text}</h${level}>\n`
}

marked.use({ renderer })

// Parse a rule Markdown file to HTML
const html = marked.parse(`
# Shell Sanitize Law
\`\`\`bash
sanitize_arg() { ... }
\`\`\`
See [espree](/skills/ast-code-manipulation) for JS AST parsing.
`)

// Lex only (get token list without rendering)
import { Lexer } from 'marked'
const tokens = Lexer.lex('# Heading\n\nParagraph with **bold**.')
// tokens[0] = { type: 'heading', depth: 1, text: 'Heading' }

// Rule: always override renderer.code for untrusted content — default includes raw HTML
// Rule: marked.parse() is synchronous — wrap in try/catch for malformed Markdown
// Rule: use Lexer.lex() for analysis (extract headings, links) without HTML output
```

---

## Prism: Tokenization & Syntax Highlighting

```typescript
import Prism from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'

// Highlight a code snippet
const tsCode = `const x: number = computeBlast({ tool: 'Bash', depth: 2 })`
const highlighted = Prism.highlight(tsCode, Prism.languages.typescript, 'typescript')
// Returns HTML with <span class="token keyword">const</span> etc.

// Tokenize only — get token stream without HTML (for analysis)
const tokens = Prism.tokenize(tsCode, Prism.languages.typescript)
// tokens = ['const ', Token{type:'identifier', content:'x'}, Token{type:'punctuation',...}, ...]

// Custom mini-language for YAMTAM gate notation: "L2: shell-sanitize → tool-exec"
Prism.languages.yamtam = {
  gate:     /\bL[0-5]\b/,
  arrow:    /→|->/,
  ruleName: /\b[a-z][a-z0-9-]+(?:-law|guard|policy)?\b/,
  colon:    /:/,
  comment:  { pattern: /#.*/, greedy: true },
}

const gateTokens = Prism.tokenize('L2: shell-sanitize-law → network-egress-law', Prism.languages.yamtam)

// Count token types for static analysis
function countTokenTypes(tokens: (string | Prism.Token)[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const t of tokens) {
    if (typeof t === 'string') continue
    counts[t.type] = (counts[t.type] ?? 0) + 1
  }
  return counts
}

// Rule: import language components before use — Prism doesn't auto-load
// Rule: Prism.languages.extend('bash', { ... }) to add tokens to existing language
// Rule: greedy: true on string/comment tokens — prevents inner tokens from matching inside them
```

---

## PEG.js: Parser Generator from Grammar

```typescript
import * as peg from 'pegjs'

// Define a grammar for structured agent log lines:
// "[2026-05-22T10:00:00Z] tool=Bash blast=3 result=OK"
const grammar = `
  LogLine
    = "[" ts:Timestamp "]" WS entries:Entry|1.., WS|
      { return { timestamp: ts, fields: Object.fromEntries(entries) } }

  Timestamp
    = chars:$([0-9T:Z.-]+) { return new Date(chars) }

  Entry
    = key:$([a-z]+) "=" value:Value { return [key, value] }

  Value
    = $([A-Za-z0-9_/-]+)

  WS = [ \\t]+
`

// Generate parser (returns a parser module)
const parser = peg.generate(grammar, {
  output:   'parser',    // 'parser' | 'source' | 'bare'
  format:   'bare',
  optimize: 'speed',     // 'speed' | 'size'
})

const result = parser.parse('[2026-05-22T10:00:00Z] tool=Bash blast=3 result=OK')
// { timestamp: Date, fields: { tool: 'Bash', blast: '3', result: 'OK' } }

// Generate source string for saving to file (avoid regenerating per request)
const parserSource = peg.generate(grammar, { output: 'source', format: 'commonjs' })
// Save parserSource to core/scripts/log-parser.js and require() it

// Rule: generate parser once at startup and cache — peg.generate() is expensive
// Rule: output: 'source' + save to file = fastest cold-start (no re-generation)
// Rule: PEG grammar is greedy — ordered choice (/) tries alternatives left-to-right, first match wins
```

---

## Anti-Fake-Pass Checklist

```
❌ Chevrotain performSelfAnalysis() not called in constructor (grammar never validated)
❌ Chevrotain CONSUME used twice for same token in one rule (must use CONSUME2, CONSUME3…)
❌ Handlebars template compiled per request (expensive — compile once, cache the fn)
❌ Handlebars {{{raw}}} used for user input (XSS — always use {{escaped}})
❌ marked.parse() without custom renderer.code (raw HTML in code blocks from user content)
❌ Prism language component not imported (Prism.languages.typescript is undefined)
❌ Prism.tokenize() confused with Prism.highlight() (tokenize = token stream, highlight = HTML)
❌ PEG.js grammar regenerated per parse call (100× slower — generate once, reuse parser)
❌ PEG ordered choice / wrong order (longer match must come BEFORE shorter alternative)
```
