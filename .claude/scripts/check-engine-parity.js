#!/usr/bin/env node

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const python = process.env.PYTHON || 'python3';
const script = path.join(__dirname, 'check_engine_parity.py');
const result = spawnSync(python, [script, ...process.argv.slice(2)], { stdio: 'inherit' });

if (result.error) {
  console.error(`Engine parity check failed: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
