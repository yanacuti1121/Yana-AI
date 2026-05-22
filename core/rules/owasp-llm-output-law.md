**Rule:** owasp-llm-output-law
**Status:** REVIEWED
**Gate:** L2 — agent output before display/storage
**Source:** OWASP/www-project-top-10-for-large-language-model-applications (LLM02: Insecure Output Handling), guardrails-ai/guardrails, OWASP WSTG-INPV-07

---

# OWASP LLM02: Output Sanitization Law

## Threat

LLM output is untrusted text. Rendering it directly causes:
- XSS injection (Markdown → HTML rendering)
- Prompt injection laundering (agent A poisons output read by agent B)
- Path traversal in generated file paths
- Command injection in generated shell commands

## Mandatory checks before using LLM output

```
Tier A — absolute block (exit 2):
  - Output rendered as raw HTML without sanitization
  - Generated file path contains ".." or starts with "/"
  - Generated shell command piped directly to eval/bash
  - Output stored as-is into agent memory (L1/L2) without strip

Tier B — log and warn:
  - Output contains <script>, onerror=, javascript:, data:
  - Output contains ${...} or `...` patterns in code context
  - Output > 8192 tokens in a single field
```

## Output sanitization pattern

```javascript
import DOMPurify from 'dompurify'
import { marked } from 'marked'

// NEVER: element.innerHTML = llmOutput
// ALWAYS: sanitize before render
function renderLLMOutput(raw) {
  const html = marked.parse(raw)                    // Markdown → HTML
  return DOMPurify.sanitize(html, {                 // strip XSS
    ALLOWED_TAGS: ['p','strong','em','code','pre','ul','ol','li','blockquote'],
    ALLOWED_ATTR: [],                               // no href, no src
  })
}
```

## Agent-to-agent output rule

```
When agent A's output is consumed by agent B:
  1. Strip all instruction-like patterns before passing
  2. Wrap in data context: { type: "data", content: "..." }
     NOT: { type: "instruction", content: "..." }
  3. Agent B must validate structure — reject if type != "data"
  4. Log chain: A → sanitize → B (traceable in audit-log)
```

## File path validation (generated paths)

```bash
sanitize_llm_path() {
  local raw="$1"
  # Strip traversal, null bytes, leading slash
  local clean="${raw//\.\.\//}"
  clean="${clean//[[:cntrl:]]/}"
  clean="${clean#/}"
  # Must stay within YAMTAM_WORKSPACE
  echo "$YAMTAM_WORKSPACE/$clean"
}
# Never: eval "cat $LLM_GENERATED_PATH"
# Always: cat "$(sanitize_llm_path "$path")"
```

## Anti-Pattern Checklist

```
❌ innerHTML = llmResponse (XSS)
❌ exec(llmGeneratedCode) without review gate
❌ llmPath passed to file ops without traversal strip
❌ agent output stored verbatim in L1 memory (poisoning)
❌ No token length limit on output field
```
