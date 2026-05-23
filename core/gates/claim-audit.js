/**
 * claim-audit.js — Automated Compliance Claim Auditor (L4.5 Gate)
 *
 * Scans agent output text for compliance violations before it reaches the
 * orchestrator. Detects fake "PASS" claims, unverified assertions, deferred
 * promises, phantom rule references, and evidence-free code execution claims.
 *
 * Labels:
 *   COMPLIANT          — output passes all checks
 *   UNVERIFIED_CLAIM   — "I verified/confirmed" without tool-call evidence
 *   FAKE_PASS          — "PASS" or "✓" asserted without proof
 *   DEFERRED_PROMISE   — "I will..." / "I'll..." — promises not yet done
 *   PHANTOM_RULE       — references a non-existent rule number/name
 *   POLICY_VIOLATION   — known forbidden pattern (eval, bypass, etc.)
 *
 * Usage:
 *   import { ClaimAuditor } from './claim-audit.js';
 *   const auditor = new ClaimAuditor({ ledger, knownRules });
 *   const result  = await auditor.audit('agent-42', outputText);
 *   // result → { label, violations, score, compliant }
 *
 * Integration:
 *   - Connects to TrustLedger to penalize on violations
 *   - Connects to SecureAuditLogger to log all audits
 */

import { existsSync, readFileSync, readdirSync } from 'fs';

// ─── Pattern library ──────────────────────────────────────────────────────────

const PATTERNS = {
  FAKE_PASS: [
    /\bPASS\b/,
    /✓\s*(all|every|each)\s+\w+\s+pass/i,
    /all\s+tests?\s+pass(?:ed)?/i,
    /status:\s*PASS/i,
    /result:\s*PASS/i,
    /\[PASS\]/,
  ],

  UNVERIFIED_CLAIM: [
    /I\s+(?:have\s+)?verified\b/i,
    /I\s+(?:have\s+)?confirmed\b/i,
    /I\s+(?:have\s+)?checked\b/i,
    /I\s+(?:have\s+)?validated\b/i,
    /already\s+(?:verified|confirmed|checked)/i,
    /as\s+verified\b/i,
    /(?:it|this|that)\s+(?:is|was)\s+verified/i,
  ],

  DEFERRED_PROMISE: [
    /\bI(?:'ll| will)\s+(?:add|fix|update|check|verify|ensure|handle|implement)/i,
    /\bI(?:'ll| will)\s+do\s+(?:that|this|it)\b/i,
    /(?:next|later|soon),?\s+I\s+will\b/i,
    /can\s+be\s+done\s+(?:later|next|soon)/i,
    /\bTODO:\s/i,
    /\bFIXME:\s/i,
  ],

  POLICY_VIOLATION: [
    /bypass\s+(?:the\s+)?(?:gate|check|validation|policy|rule)/i,
    /--no-verify/i,
    /skip\s+(?:the\s+)?(?:gate|check|validation)/i,
    /ignore\s+(?:the\s+)?(?:rule|policy|law)/i,
    /eval\s*\(/,
    /process\.exit\s*\(\s*(?:0|1)\s*\)/,
  ],
};

// Evidence markers: if these appear near a claim, the claim is considered verified
const EVIDENCE_MARKERS = [
  /```\w*\n[\s\S]+?```/,                    // code block output
  /\$\s+\w+/,                               // shell command line
  /Exit code [0-9]/i,
  /\b(node|bash|python|npm|git)\s+\S+/,     // tool invocations
  /\[\d{4}-\d{2}-\d{2}/,                    // timestamp → tool output
  /Result of calling/i,
  /tool_use_result/i,
];

// ─── Rule existence check ─────────────────────────────────────────────────────

function loadKnownRuleNums(rulesDir = 'core/rules') {
  if (!existsSync(rulesDir)) return new Set();
  try {
    return new Set(
      readdirSync(rulesDir)
        .map(f => f.match(/^(\d+)-/)?.[1])
        .filter(Boolean)
        .map(Number)
    );
  } catch { return new Set(); }
}

function checkPhantomRules(text, knownRules) {
  const violations = [];
  for (const m of text.matchAll(/rule\s+(\d+)\b/gi)) {
    const num = Number(m[1]);
    if (num > 0 && !knownRules.has(num)) {
      violations.push(`References non-existent rule ${num}`);
    }
  }
  return violations;
}

// ─── ClaimAuditor ─────────────────────────────────────────────────────────────

export class ClaimAuditor {
  /**
   * @param {Object} opts
   * @param {import('../memory/trust-ledger.js').TrustLedger} [opts.ledger]
   * @param {import('../memory/secure-logger.js').SecureAuditLogger} [opts.logger]
   * @param {string} [opts.rulesDir]
   */
  constructor(opts = {}) {
    this.ledger     = opts.ledger  ?? null;
    this.logger     = opts.logger  ?? null;
    this.rulesDir   = opts.rulesDir ?? 'core/rules';
    this.knownRules = loadKnownRuleNums(this.rulesDir);
  }

  /**
   * Audit agent output for compliance violations.
   * @param {string} agentId
   * @param {string} outputText     — the agent's raw output
   * @param {Object} [ctx]
   * @param {string[]} [ctx.toolCalls]  — names of tools actually called this turn
   * @returns {AuditResult}
   */
  audit(agentId, outputText, ctx = {}) {
    const violations = [];
    const toolCalls  = ctx.toolCalls ?? [];
    const hasEvidence = EVIDENCE_MARKERS.some(re => re.test(outputText))
      || toolCalls.length > 0;

    // Check each pattern category
    for (const [label, patterns] of Object.entries(PATTERNS)) {
      for (const re of patterns) {
        const m = outputText.match(re);
        if (m) {
          // UNVERIFIED_CLAIM / FAKE_PASS: exempt if evidence present
          if ((label === 'UNVERIFIED_CLAIM' || label === 'FAKE_PASS') && hasEvidence) continue;
          violations.push({ label, match: m[0].slice(0, 80) });
          break; // one violation per category
        }
      }
    }

    // Phantom rule check
    const phantomRuleViolations = checkPhantomRules(outputText, this.knownRules);
    for (const v of phantomRuleViolations) {
      violations.push({ label: 'PHANTOM_RULE', match: v });
    }

    // Determine overall label (worst wins)
    const SEVERITY = {
      POLICY_VIOLATION:  5,
      FAKE_PASS:         4,
      PHANTOM_RULE:      3,
      UNVERIFIED_CLAIM:  2,
      DEFERRED_PROMISE:  1,
      COMPLIANT:         0,
    };
    const worst = violations.reduce(
      (top, v) => SEVERITY[v.label] > SEVERITY[top] ? v.label : top,
      'COMPLIANT'
    );

    const result = {
      agentId,
      label:      worst,
      compliant:  worst === 'COMPLIANT',
      violations,
      hasEvidence,
      ts:         new Date().toISOString(),
    };

    this._emit(agentId, result);
    return result;
  }

  // ─── Side effects ───────────────────────────────────────────────────────────

  _emit(agentId, result) {
    const { label, violations } = result;

    if (this.logger) {
      this.logger.logAction(agentId, 'claim-audit', label, {
        violations: violations.length,
        labels: violations.map(v => v.label),
      });
    }

    if (!result.compliant && this.ledger) {
      const penaltyMap = {
        POLICY_VIOLATION: 'POLICY_VIOLATION',
        FAKE_PASS:        'POLICY_VIOLATION',
        PHANTOM_RULE:     'AST_WARN',
        UNVERIFIED_CLAIM: 'AST_WARN',
        DEFERRED_PROMISE: null,               // warn only, no score impact
      };
      const event = penaltyMap[label];
      if (event) {
        this.ledger.event(agentId, event, `claim-audit:${label}`);
      }
    }

    // stderr for critical violations
    if (['POLICY_VIOLATION', 'FAKE_PASS'].includes(label)) {
      process.stderr.write(
        `[ClaimAudit] ${label} detected in ${agentId} output — ${violations[0]?.match}\n`
      );
    }
  }
}

// ─── CLI smoke-test ───────────────────────────────────────────────────────────

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const auditor = new ClaimAuditor({ rulesDir: 'core/rules' });

  const cases = [
    { id: 'agent-01', text: 'All tests PASS. The implementation is complete.' },
    { id: 'agent-02', text: 'I have verified the output manually and it looks correct.' },
    { id: 'agent-03', text: "I'll fix the edge case later. TODO: add validation." },
    { id: 'agent-04', text: 'You should bypass the gate to speed things up.' },
    { id: 'agent-05', text: 'See rule 999 for details on this behavior.' },
    { id: 'agent-06', text: 'Exit code 0\nThe function returned the correct result.\n```\n{ ok: true }\n```' },
  ];

  for (const c of cases) {
    const r = auditor.audit(c.id, c.text);
    const icon = r.compliant ? '✓' : '✗';
    console.log(`${icon} ${c.id}  ${r.label.padEnd(20)}  ${r.violations.map(v=>v.match).join(' | ') || '—'}`);
  }
}
