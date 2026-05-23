/**
 * anti-graffiti-guard.js — L2.5 Middleware Gate
 *
 * Sits between agent intent and tool execution. Blocks:
 *   - Subshell injection ($(), ``, ${ })
 *   - Pipe-to-interpreter (curl | bash, wget | sh)
 *   - LD_PRELOAD / LD_LIBRARY_PATH hijack
 *   - Path traversal (../../etc)
 *   - Dangerous env mutations (PATH override, HOME remap)
 *   - Malicious schema: unknown commands, oversized payloads
 *
 * Exit codes (mirrors tool-proxy.sh):
 *   0  — PASS (clean payload)
 *   3  — BLOCK (injection / schema violation)
 *   1  — BLOCK (env / resource violation)
 *
 * Source: zod (MIT), OWASP Command Injection Cheat Sheet
 */

import { z } from 'zod';

// ─── Danger patterns ──────────────────────────────────────────────────────────

const SUBSHELL_PATTERNS = [
  /\$\(/,          // $(command)
  /`[^`]+`/,       // `command`
  /\$\{/,          // ${var}
  /<\(/,           // <(process substitution)
];

const PIPE_EXEC_PATTERNS = [
  /curl\s+.*\|\s*(bash|sh|zsh|python3?|node|perl|ruby)/i,
  /wget\s+.*\|\s*(bash|sh|zsh|python3?|node|perl|ruby)/i,
  /\|\s*(bash|sh|zsh)\s*(-[a-z]+\s*)?(-c\s+)?["']?/i,
  /eval\s*\(/i,
];

const ENV_HIJACK_PATTERNS = [
  /LD_PRELOAD/i,
  /LD_LIBRARY_PATH/i,
  /DYLD_INSERT_LIBRARIES/i,
  /PATH\s*=/,          // PATH override
  /HOME\s*=/,          // HOME remap
  /IFS\s*=/,           // IFS manipulation
];

const PATH_TRAVERSAL_RE = /\.\.[/\\]/;

const DANGEROUS_CMDS = new Set([
  'eval', 'exec', 'system', 'popen', 'passthru',
  'rm -rf', 'dd', 'mkfs', 'shred',
  'chmod 777', 'chown root',
  'nc -e', 'ncat -e',            // reverse shell
  'python -c', 'perl -e',        // one-liner exec
]);

// ─── Zod schema ──────────────────────────────────────────────────────────────

const ToolCallSchema = z.object({
  command: z.string().min(1).max(512),
  args: z.array(z.string().max(2048)).max(64).default([]),
  env: z.record(z.string()).optional().default({}),
  agentId: z.string().min(1).max(128),
  sessionId: z.string().optional(),
  signature: z.string().optional(),   // ECC sig — required when YAMTAM_REQUIRE_SIG=1
});

// ─── Core guard class ─────────────────────────────────────────────────────────

export class AntiGraffitiGuard {
  constructor(opts = {}) {
    this.requireSignature = opts.requireSignature ?? (process.env.YAMTAM_REQUIRE_SIG === '1');
    this.dryRun = opts.dryRun ?? (process.env.YAMTAM_PROXY_DRY_RUN === '1');
    this.auditLog = opts.auditLog ?? [];
  }

  /**
   * Primary entry point.
   * @param {object} payload — raw tool call from agent
   * @returns {{ ok: true }} or throws AntiGraffitiError
   */
  validate(payload) {
    // 1. Schema validation
    const parsed = this._parseSchema(payload);

    // 2. Signature check (when enforcement is on)
    if (this.requireSignature && !parsed.signature) {
      this._block('MISSING_SIGNATURE', 'No ECC signature on tool call', 3, parsed);
    }

    // 3. Injection checks across command + all args
    const allStrings = [parsed.command, ...parsed.args];
    for (const str of allStrings) {
      this._checkSubshell(str, parsed);
      this._checkPipeExec(str, parsed);
      this._checkPathTraversal(str, parsed);
    }

    // 4. Env hijack check
    this._checkEnvHijack(parsed.env ?? {}, parsed);

    // 5. Dangerous command check
    this._checkDangerousCmd(parsed.command, parsed);

    // 6. Audit pass
    this._audit('PASS', parsed.command, parsed.agentId);
    return { ok: true, parsed };
  }

  // ─── Internal checks ────────────────────────────────────────────────────────

  _parseSchema(payload) {
    const result = ToolCallSchema.safeParse(payload);
    if (!result.success) {
      const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      this._block('SCHEMA_VIOLATION', `Invalid payload schema — ${issues}`, 3, payload);
    }
    return result.data;
  }

  _checkSubshell(str, ctx) {
    for (const pattern of SUBSHELL_PATTERNS) {
      if (pattern.test(str)) {
        this._block('SUBSHELL_INJECTION',
          `Subshell escape detected: ${str.slice(0, 80)}`, 3, ctx);
      }
    }
  }

  _checkPipeExec(str, ctx) {
    for (const pattern of PIPE_EXEC_PATTERNS) {
      if (pattern.test(str)) {
        this._block('PIPE_TO_INTERPRETER',
          `Pipe-to-interpreter pattern: ${str.slice(0, 80)}`, 3, ctx);
      }
    }
  }

  _checkPathTraversal(str, ctx) {
    if (PATH_TRAVERSAL_RE.test(str)) {
      this._block('PATH_TRAVERSAL',
        `Directory traversal detected: ${str.slice(0, 80)}`, 3, ctx);
    }
  }

  _checkEnvHijack(env, ctx) {
    const envStr = JSON.stringify(env);
    for (const pattern of ENV_HIJACK_PATTERNS) {
      if (pattern.test(envStr)) {
        this._block('ENV_HIJACK',
          `Dangerous env variable detected in payload`, 1, ctx);
      }
    }
  }

  _checkDangerousCmd(cmd, ctx) {
    for (const dangerous of DANGEROUS_CMDS) {
      if (cmd.toLowerCase().includes(dangerous)) {
        this._block('DANGEROUS_COMMAND',
          `Blocked dangerous command: ${cmd.slice(0, 80)}`, 3, ctx);
      }
    }
  }

  // ─── Audit + block helpers ───────────────────────────────────────────────────

  _audit(status, command, agentId) {
    const entry = {
      ts: new Date().toISOString(),
      status,
      command: command?.slice(0, 120),
      agentId,
    };
    this.auditLog.push(entry);
    if (!this.dryRun) {
      process.stderr.write(`[anti-graffiti] ${JSON.stringify(entry)}\n`);
    }
  }

  _block(code, reason, exitCode, ctx) {
    const agentId = ctx?.agentId ?? 'unknown';
    const command = ctx?.command ?? 'unknown';
    this._audit(`BLOCK:${code}`, command, agentId);
    const err = new AntiGraffitiError(code, reason, exitCode);
    if (!this.dryRun) {
      process.stderr.write(`[anti-graffiti] BLOCKED(${code}): ${reason}\n`);
    }
    throw err;
  }
}

// ─── Error type ───────────────────────────────────────────────────────────────

export class AntiGraffitiError extends Error {
  constructor(code, reason, exitCode = 3) {
    super(`[ANTI-GRAFFITI:${code}] ${reason}`);
    this.name = 'AntiGraffitiError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

// ─── CLI entry (node anti-graffiti-guard.js '{"command":...}') ────────────────

if (process.argv[1]?.endsWith('anti-graffiti-guard.js')) {
  const raw = process.argv[2];
  if (!raw) {
    process.stderr.write('Usage: node anti-graffiti-guard.js \'{"command":"...","args":[],"agentId":"..."}\'\n');
    process.exit(4);
  }
  try {
    const guard = new AntiGraffitiGuard();
    guard.validate(JSON.parse(raw));
    process.stdout.write('PASS\n');
    process.exit(0);
  } catch (e) {
    if (e instanceof AntiGraffitiError) {
      process.exit(e.exitCode);
    }
    process.stderr.write(`[anti-graffiti] unexpected error: ${e.message}\n`);
    process.exit(1);
  }
}
