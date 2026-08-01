---
name: template-engine-from-scratch
description: "Use when implementing a text/HTML template engine (lexer, parser, renderer) from first principles — not when just using Handlebars/Jinja/EJS in an app. Triggers on: 'write a template engine', 'build a templating language', 'implement mustache-style templates', 'template lexer and parser', 'safe string interpolation without eval'. Covers tokenizing, AST design, and safe (non-eval) rendering."
origin: yana-ai — synthesized from public design notes on Mustache/Handlebars/Jinja2 and community from-scratch tutorials indexed in codecrafters-io/build-your-own-x
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 0.43.2
---

# /template-engine-from-scratch

## When to Use

- Building a template engine (variable interpolation, conditionals, loops) from raw string input, for teaching or a custom DSL need.
- Deciding between logic-less (Mustache-style) vs logic-full (Jinja/EJS-style) template design for a new project.
- Understanding why `eval()`-based templating is unsafe and what the safe alternative actually does under the hood.

## Do NOT use for

- Choosing a template library for a real application — use `grammar-lexer-dsl` for the decision matrix among existing libraries (Handlebars, marked, etc.) instead of building one.
- General parser/compiler construction unrelated to templates — see `grammar-lexer-dsl` (DSL/grammar tooling) or `ast-code-manipulation` for broader AST work.
- Sanitizing untrusted HTML output — see `html-xss-filtering`/`dompurify-xss-prevention` for that specific concern; this skill covers the *engine*, not output sanitization policy.

---

## Design Decision: Logic-less vs Logic-full

```
Templates authored by non-programmers (marketing, docs)?
  → Logic-less (Mustache-style): only {{var}}, {{#section}}, {{^inverted}} —
    no expressions, no arithmetic, forces logic to live in the calling code

Templates authored by developers, need conditionals/loops/filters inline?
  → Logic-full (Jinja/EJS-style): {% if %}, {% for %}, {{ expr | filter }} —
    more expressive, but blurs the view/logic boundary if overused
```

## Step 1: Lexer (tokenize)

Scan the raw template string and emit a token stream. A minimal token set:

```
TEXT           — raw characters outside any tag
VAR_OPEN       — "{{"      VAR_CLOSE       — "}}"
BLOCK_OPEN     — "{{#"     BLOCK_CLOSE     — "{{/"
IDENTIFIER     — a variable/section name
```

Implementation is a straightforward state machine: scan forward accumulating `TEXT` until you hit `{{`, then switch to "inside tag" mode and accumulate until `}}`, classify the tag content (bare identifier = variable, `#name` = block open, `/name` = block close), emit the token, switch back to `TEXT` mode.

## Step 2: Parser (build an AST)

Turn the flat token stream into a tree so nested blocks (a loop containing a conditional) render correctly. Node types:

```
TextNode(string)
VariableNode(path)              — path e.g. "user.name" for nested lookup
SectionNode(path, children[])   — loop or conditional body, resolved at render time
```

Parsing algorithm: recursive-descent, one function that consumes tokens until it hits a `BLOCK_CLOSE` matching the current open tag or end-of-input. A `SectionNode` recursively parses its own children the same way — this recursion is what makes nesting work "for free" once the base case (`TextNode`/`VariableNode`) is correct.

**Balance blocks explicitly**: track open block names on a stack as you parse; a `{{/name}}` that doesn't match the top of the stack (wrong name, or empty stack) is a template syntax error — report it, don't silently ignore the mismatch. An engine that tolerates mismatched blocks will render subtly wrong output instead of failing loudly.

## Step 3: Renderer (walk the AST against a context)

```
render(node, context):
  TextNode      → return node.string
  VariableNode  → return escape(lookup(node.path, context))
  SectionNode   → value = lookup(node.path, context)
                  if value is falsy/empty:      render nothing (or {{^}} inverted branch)
                  if value is a list:            render children once per item, item becomes new context
                  if value is truthy (not list): render children once, value merged into context
```

`lookup(path, context)` needs to walk dotted paths (`user.address.city`) against nested dicts/objects, and — critically — return a clearly-distinguishable "not found" sentinel rather than throwing, so a missing optional field renders as empty rather than crashing the whole render.

## Step 4: Safety — Never `eval()`

The unsafe shortcut is tempting: turn `{{ user.name }}` into `eval("user.name")` against a context object and let the host language's interpreter do variable lookup and even arbitrary logic-full expressions. **Don't** — a template string is often partially or fully user-influenced (a saved profile bio field rendered back into a page, a config value from an admin panel), and `eval` on that string is unrestricted code execution.

The correct approach is exactly Steps 1-3: a real (if minimal) lexer/parser/interpreter that only understands the specific grammar you defined (variable lookup, iteration, conditionals) — there is no code path from template text to arbitrary host-language execution, because the interpreter never calls `eval`/`Function()`/`exec()` on template content, only on your own fixed renderer code operating on data.

Escape output by default (`escape()` in Step 3 above HTML-encodes `< > & " '`) — provide an explicit "raw/unescaped" tag variant (Mustache uses `{{{triple}}}` for this) so unescaped output is an opt-in the template author chose, not the default behavior.

## What NOT to Do

- Don't use `eval()`/`Function()`/string-concatenation-into-code as a shortcut for expression evaluation — see Step 4; this is the single most common way a template engine becomes an RCE vector.
- Don't auto-escape only sometimes — inconsistent escaping is worse than never escaping, since callers stop trusting the default and add manual escaping that then double-escapes.
- Don't let unmatched block tags render silently — see Step 2's stack-balance check; a mismatched `{{/if}}` should be a parse error, not a rendering oddity discovered in production.
- Don't skip the AST step and try to render directly from the token stream with regex substitution — this is how nested blocks (a loop inside a conditional) break in subtle, hard-to-debug ways.
