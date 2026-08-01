#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { renderCommandSkill } = require('./sync-codex.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const targetIndex = process.argv.indexOf('--target');
const targetRoot = targetIndex === -1
  ? repoRoot
  : path.resolve(process.argv[targetIndex + 1] || '');

function names(root, extension) {
  return fs.readdirSync(root)
    .filter((name) => name.endsWith(extension))
    .map((name) => path.basename(name, extension))
    .sort();
}

function missing(source, target) {
  return source.filter((name) => !target.includes(name));
}

function skillNames(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

function hookScripts(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const scripts = new Set();
  for (const groups of Object.values(config.hooks || {})) {
    for (const group of groups) {
      for (const hook of group.hooks || []) {
        const command = hook.command || '';
        for (const match of command.matchAll(/hooks\/([A-Za-z0-9._-]+\.(?:sh|js))/g)) {
          scripts.add(match[1]);
        }
      }
    }
  }
  return [...scripts].sort();
}

function fail(label, values) {
  if (!values.length) return false;
  console.error(`FAIL: ${label}: ${values.join(', ')}`);
  return true;
}

function main() {
  const manifestPath = path.join(repoRoot, 'core', 'config', 'engine-capabilities.json');
  JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const sourceAgents = names(path.join(repoRoot, 'core', 'agents'), '.md');
  const claudeAgents = names(path.join(targetRoot, '.claude', 'agents'), '.md');
  const codexAgents = names(path.join(targetRoot, '.codex', 'agents'), '.toml');
  const sourceSkills = skillNames(path.join(repoRoot, 'core', 'skills'));
  const claudeSkills = skillNames(path.join(targetRoot, '.claude', 'skills'));
  const codexSkills = skillNames(path.join(targetRoot, '.agents', 'skills'));
  const sourceCommands = names(path.join(repoRoot, 'core', 'commands'), '.md');
  const claudeCommands = names(path.join(targetRoot, '.claude', 'commands'), '.md');
  const claudeHooks = hookScripts(path.join(repoRoot, '.claude', 'settings.json'));
  const codexHooks = hookScripts(path.join(targetRoot, '.codex', 'hooks.json'));
  const staleCommands = sourceCommands.filter((name) => {
    const source = path.join(repoRoot, 'core', 'commands', `${name}.md`);
    const target = path.join(targetRoot, '.agents', 'skills', `yana-command-${name}`, 'SKILL.md');
    return !fs.existsSync(target)
      || fs.readFileSync(target, 'utf8') !== renderCommandSkill(source);
  });

  let failed = false;
  failed = fail('Claude agents missing', missing(sourceAgents, claudeAgents)) || failed;
  failed = fail('Codex agents missing', missing(sourceAgents, codexAgents)) || failed;
  failed = fail('Claude skills missing', missing(sourceSkills, claudeSkills)) || failed;
  failed = fail('Codex skills missing', missing(sourceSkills, codexSkills)) || failed;
  failed = fail('Claude commands missing', missing(sourceCommands, claudeCommands)) || failed;
  failed = fail('Codex command adapters missing or stale', staleCommands) || failed;
  failed = fail('Codex active hooks missing', missing(claudeHooks, codexHooks)) || failed;
  if (!fs.existsSync(path.join(targetRoot, 'AGENTS.md'))) {
    console.error('FAIL: shared AGENTS.md missing');
    failed = true;
  }

  if (failed) process.exit(1);

  console.log('=== Claude ↔ Codex parity ===');
  console.log(`Instructions: 1/1`);
  console.log(`Agents:       ${sourceAgents.length}/${sourceAgents.length}`);
  console.log(`Skills:       ${sourceSkills.length}/${sourceSkills.length}`);
  console.log(`Commands:     ${sourceCommands.length}/${sourceCommands.length}`);
  console.log(`Active hooks: ${claudeHooks.length}/${claudeHooks.length}`);
  console.log('Result: PASS');
}

main();
