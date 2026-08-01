'use strict';

// Streaming-safe secret/PII scrubber for LLM chat output.
//
// Yana AI has a real input-side injection guard
// (.claude/hooks/prompt-injection-guard.sh) but nothing scanned what a
// model actually said back to a public chat user before this module —
// see docs/Yana-AI-Danh-gia-Kien-truc-Bao-mat.md section 2.2. If a model
// ever echoed a secret pattern (leaked from context, hallucinated-but-
// real-shaped, or pasted by the user earlier in the conversation) or PII,
// it reached the client with zero inspection.
//
// Design ported (technique, not code — this scrubs different content)
// from core/lib/hermes_adapted/context_scrubber.py's
// StreamingContextScrubber: hold back a trailing window of each chunk
// across feed() calls so a pattern split across two upstream SSE frames
// still gets caught, instead of only matching within a single chunk.
//
// Two tiers, a deliberate product decision (see plan doc history):
//   - HARD_BLOCK: high-confidence secret shapes (API keys, private-key
//     PEM headers) — one match aborts the whole response with a fixed
//     message. A false positive here costs one response; a false
//     negative costs a real credential reaching the user.
//   - REDACT: lower-confidence PII shapes (email/phone/SSN/etc.) — matched
//     spans are replaced with [REDACTED:type], streaming continues. These
//     patterns have real false-positive rates (a phone-shaped number in a
//     legitimate answer), so aborting the whole response over one is
//     worse than the leak risk for this class.
//
// Patterns are hand-ported literal strings, not loaded from
// scanner/*.yml at runtime — no YAML parser dependency exists in this
// package today, and this set is small/stable enough not to need one.
// Each pattern below cites the scanner check ID or hook it was ported
// from, so it can be kept in sync by hand if the source changes.

// (pattern, label) — matching any one aborts the response.
const HARD_BLOCK_PATTERNS = [
  [/sk-ant-[a-zA-Z0-9\-_]{20,}/, 'anthropic-key'],       // scanner/env-secret-checks.yml SE001
  [/sk-(?:proj-)?[a-zA-Z0-9\-_]{20,}/, 'openai-key'],    // SE002 (simplified: drops the lookbehind exclusion for sk-ant-, harmless since SE001 already matches those first)
  [/(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82})/, 'github-token'], // SE003
  [/AKIA[0-9A-Z]{16}/, 'aws-key'],                       // SE004
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, 'private-key'], // SE005
  [/sk_(?:live|test)_[a-zA-Z0-9]{24,}/, 'stripe-key'],   // SE006
  [/AIza[0-9A-Za-z\-_]{35}/, 'google-api-key'],          // SE007
  [/(?:https:\/\/hooks\.slack\.com\/services\/[A-Z0-9/]{40,}|xox[bpoa]-[0-9]{10,}-[a-zA-Z0-9-]{20,})/, 'slack-token'], // SE008
];

// (pattern, label) — matches are redacted in place, streaming continues.
// Ported from core/hooks/validate-completion.sh's PII_TYPES/PII_PATTERNS.
const REDACT_PATTERNS = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, 'email'],
  [/\b\d{3}-\d{2}-\d{4}\b/, 'ssn'],
  [/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, 'credit-card'],
  [/\b[A-Z]{2}\d{6,8}\b/, 'passport'],
  [/\b\+?1?\d{10,11}\b|\(\d{3}\)\s?\d{3}-\d{4}\b/, 'phone'],
];

// Longest realistic match any pattern above can produce, rounded up.
// github_pat_ (10 + 82 = 92 chars) is the longest fixed-length pattern;
// the `{20,}`/`{24,}`-style open-ended key patterns are unbounded in
// principle, so this is a practical cap, not a mathematical guarantee —
// documented limitation, same spirit as guard-destructive.sh's own
// "KNOWN LIMITATION" comment: a genuine secret whose matching portion is
// chunked into pieces more than this many characters apart across SSE
// frames could be missed. 128 covers every pattern above with margin.
const HOLD_BACK_WINDOW = 128;

class OutputScrubber {
  constructor() {
    this._tail = '';
  }

  // feed(chunk) -> { text, blocked }
  //   text: the safe-to-emit portion (redactions applied); the last
  //         HOLD_BACK_WINDOW characters are held back internally and
  //         prepended to the next feed() call, not included here.
  //   blocked: true if a hard-block pattern matched anywhere in
  //            (held-back tail + chunk) — caller must stop streaming
  //            further chunks and emit a fixed refusal instead. text is
  //            '' in this case (nothing more should reach the client).
  feed(chunk) {
    const buf = this._tail + chunk;

    for (const [pattern, label] of HARD_BLOCK_PATTERNS) {
      if (pattern.test(buf)) {
        this._tail = '';
        return { text: '', blocked: true, blockedLabel: label };
      }
    }

    let redacted = buf;
    for (const [pattern, label] of REDACT_PATTERNS) {
      const g = new RegExp(pattern.source, 'g');
      redacted = redacted.replace(g, `[REDACTED:${label}]`);
    }

    if (redacted.length <= HOLD_BACK_WINDOW) {
      // Not enough buffered yet to safely release anything — a match
      // could still be completed by the next chunk.
      this._tail = redacted;
      return { text: '', blocked: false };
    }

    const releaseAt = redacted.length - HOLD_BACK_WINDOW;
    const toEmit = redacted.slice(0, releaseAt);
    this._tail = redacted.slice(releaseAt);
    return { text: toEmit, blocked: false };
  }

  // flush() -> { text, blocked } for whatever's left at stream end —
  // must be called once after the last feed(), or the final
  // HOLD_BACK_WINDOW characters of the response are silently dropped.
  flush() {
    if (!this._tail) return { text: '', blocked: false };

    for (const [pattern, label] of HARD_BLOCK_PATTERNS) {
      if (pattern.test(this._tail)) {
        this._tail = '';
        return { text: '', blocked: true, blockedLabel: label };
      }
    }

    let redacted = this._tail;
    for (const [pattern, label] of REDACT_PATTERNS) {
      const g = new RegExp(pattern.source, 'g');
      redacted = redacted.replace(g, `[REDACTED:${label}]`);
    }
    this._tail = '';
    return { text: redacted, blocked: false };
  }
}

module.exports = { OutputScrubber, HARD_BLOCK_PATTERNS, REDACT_PATTERNS, HOLD_BACK_WINDOW };
