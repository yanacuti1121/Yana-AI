/**
 * YAMTAM Structured Output Validator
 * Version: 1.8.0
 * Purpose: Enforces that Agent responses follow the YAMTAM structural requirements
 * (Intent, Rationale, Evidence) and comply with OWASP LLM02.
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_SECTIONS = ['Intent', 'Rationale', 'Evidence'];

function validateOutput(content) {
  const findings = [];
  
  // 1. Check for required YAMTAM sections
  REQUIRED_SECTIONS.forEach(section => {
    const regex = new RegExp(`^#*\\s*${section}:?`, 'mi');
    if (!regex.test(content)) {
      findings.push({
        level: 'ERROR',
        message: `Missing required section: ${section}`,
        suggestion: `Ensure your response includes a section clearly labeled "${section}".`
      });
    }
  });

  // 2. OWASP LLM02: Check for path traversal in what looks like paths
  const traversalRegex = /\.\.\//g;
  if (traversalRegex.test(content)) {
    findings.push({
      level: 'BLOCK',
      message: 'Potential Path Traversal detected in output (../)',
      suggestion: 'Remove relative path components from output.'
    });
  }

  // 3. Check for shell injection patterns in code blocks
  const shellInjectionRegex = /\|\s*(bash|sh|eval|python|node)/i;
  if (shellInjectionRegex.test(content)) {
    findings.push({
      level: 'BLOCK',
      message: 'Potential Shell Injection pattern detected (pipe to shell)',
      suggestion: 'Do not output code that pipes directly to a shell interpreter.'
    });
  }

  return {
    valid: findings.filter(f => f.level === 'BLOCK' || f.level === 'ERROR').length === 0,
    findings: findings
  };
}

// CLI Interface
if (require.main === module) {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Usage: node structured-output-validator.js <response_file>');
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(inputFile, 'utf8');
    const result = validateOutput(content);
    
    if (!result.valid) {
      console.error('--- YAMTAM STRUCTURED OUTPUT VALIDATION FAILED ---');
      result.findings.forEach(f => {
        console.error(`[${f.level}] ${f.message}`);
        if (f.suggestion) console.error(`  Suggestion: ${f.suggestion}`);
      });
      process.exit(1);
    } else {
      console.log('--- YAMTAM STRUCTURED OUTPUT VALIDATION PASSED ---');
      process.exit(0);
    }
  } catch (err) {
    console.error(`Error reading file: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { validateOutput };
