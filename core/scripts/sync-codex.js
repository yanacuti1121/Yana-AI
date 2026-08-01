#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { check: false, target: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      args.check = true;
    } else if (arg === '--target') {
      index += 1;
      if (!argv[index]) throw new Error('--target requires a directory');
      args.target = path.resolve(argv[index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readFrontmatter(source) {
  if (!source.startsWith('---\n')) return { metadata: {}, body: source.trim() };

  const end = source.indexOf('\n---\n', 4);
  if (end === -1) return { metadata: {}, body: source.trim() };

  const metadata = {};
  const lines = source.slice(4, end).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (rawValue === '>' || rawValue === '|') {
      const parts = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        index += 1;
        parts.push(lines[index].trim());
      }
      metadata[key] = parts.join(rawValue === '>' ? ' ' : '\n').trim();
    } else {
      metadata[key] = rawValue.replace(/^(["'])(.*)\1$/, '$2').trim();
    }
  }

  return { metadata, body: source.slice(end + 5).trim() };
}

function firstParagraph(body) {
  const paragraphs = body.split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const text = paragraph
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join(' ')
      .replace(/[*_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) return text;
  }
  return 'Yana AI specialist agent.';
}

function renderAgent(sourcePath) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const { metadata, body } = readFrontmatter(source);
  const name = metadata.name || path.basename(sourcePath, '.md');
  const description = metadata.description || metadata.role || firstParagraph(body);

  return [
    `name = ${JSON.stringify(name)}`,
    `description = ${JSON.stringify(description)}`,
    `developer_instructions = ${JSON.stringify(body)}`,
    '',
  ].join('\n');
}

function renderCommandSkill(sourcePath) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const { metadata, body } = readFrontmatter(source);
  const commandName = path.basename(sourcePath, '.md');
  const skillName = `yana-command-${commandName}`;
  const description = metadata.description
    || firstParagraph(body)
    || `Codex adapter for the Yana AI /${commandName} command.`;

  return [
    '---',
    `name: ${skillName}`,
    `description: ${JSON.stringify(`Yana AI /${commandName} command adapter. ${description}`)}`,
    '---',
    '',
    `# Yana AI Command: /${commandName}`,
    '',
    `Invoke this workflow explicitly as \`$${skillName}\`.`,
    `Treat text supplied with the invocation as \`$ARGUMENTS\` wherever the source workflow references it.`,
    'Follow the source workflow without weakening its approval, scope, safety, or verification requirements.',
    '',
    body,
    '',
  ].join('\n');
}

function listDirectoriesWithFile(root, filename) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, filename)))
    .map((entry) => entry.name)
    .sort();
}

function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copied += copyTree(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      const current = fs.existsSync(destinationPath) ? fs.readFileSync(destinationPath) : null;
      const next = fs.readFileSync(sourcePath);
      if (!current || !current.equals(next)) {
        fs.copyFileSync(sourcePath, destinationPath);
        copied += 1;
      }
    }
  }
  return copied;
}

function listRelativeFiles(root, prefix = '') {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const relativePath = path.join(prefix, entry.name);
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRelativeFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function staleTreeFiles(source, destination) {
  return listRelativeFiles(source).filter((relativePath) => {
    const sourcePath = path.join(source, relativePath);
    const destinationPath = path.join(destination, relativePath);
    return !fs.existsSync(destinationPath)
      || !fs.readFileSync(sourcePath).equals(fs.readFileSync(destinationPath));
  });
}

function syncAgents(sourceRoot, targetRoot) {
  const sourceDir = path.join(sourceRoot, 'core', 'agents');
  const targetDir = path.join(targetRoot, '.codex', 'agents');
  fs.mkdirSync(targetDir, { recursive: true });

  let written = 0;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const destination = path.join(targetDir, `${path.basename(entry.name, '.md')}.toml`);
    const rendered = renderAgent(path.join(sourceDir, entry.name));
    if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== rendered) {
      fs.writeFileSync(destination, rendered);
      written += 1;
    }
  }
  return written;
}

function syncCommands(sourceRoot, targetRoot) {
  const sourceDir = path.join(sourceRoot, 'core', 'commands');
  const targetDir = path.join(targetRoot, '.agents', 'skills');
  let written = 0;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const commandName = path.basename(entry.name, '.md');
    const destinationDir = path.join(targetDir, `yana-command-${commandName}`);
    const destination = path.join(destinationDir, 'SKILL.md');
    const rendered = renderCommandSkill(path.join(sourceDir, entry.name));
    fs.mkdirSync(destinationDir, { recursive: true });
    if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== rendered) {
      fs.writeFileSync(destination, rendered);
      written += 1;
    }
  }
  return written;
}

function checkCodex(sourceRoot, targetRoot) {
  const sourceAgents = fs.readdirSync(path.join(sourceRoot, 'core', 'agents'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.basename(name, '.md'))
    .sort();
  const targetAgents = fs.existsSync(path.join(targetRoot, '.codex', 'agents'))
    ? fs.readdirSync(path.join(targetRoot, '.codex', 'agents'))
      .filter((name) => name.endsWith('.toml'))
      .map((name) => path.basename(name, '.toml'))
      .sort()
    : [];
  const sourceSkills = listDirectoriesWithFile(path.join(sourceRoot, 'core', 'skills'), 'SKILL.md');
  const targetSkills = listDirectoriesWithFile(path.join(targetRoot, '.agents', 'skills'), 'SKILL.md');
  const sourceCommands = fs.readdirSync(path.join(sourceRoot, 'core', 'commands'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.basename(name, '.md'))
    .sort();
  const missingAgents = sourceAgents.filter((name) => !targetAgents.includes(name));
  const missingSkills = sourceSkills.filter((name) => !targetSkills.includes(name));
  const staleAgents = sourceAgents.filter((name) => {
    const sourcePath = path.join(sourceRoot, 'core', 'agents', `${name}.md`);
    const targetPath = path.join(targetRoot, '.codex', 'agents', `${name}.toml`);
    return fs.existsSync(targetPath) && fs.readFileSync(targetPath, 'utf8') !== renderAgent(sourcePath);
  });
  const staleSkillFiles = staleTreeFiles(
    path.join(sourceRoot, 'core', 'skills'),
    path.join(targetRoot, '.agents', 'skills'),
  );
  const staleHookFiles = staleTreeFiles(
    path.join(sourceRoot, 'core', 'hooks'),
    path.join(targetRoot, '.codex', 'hooks'),
  );
  const staleCommands = sourceCommands.filter((name) => {
    const sourcePath = path.join(sourceRoot, 'core', 'commands', `${name}.md`);
    const targetPath = path.join(targetRoot, '.agents', 'skills', `yana-command-${name}`, 'SKILL.md');
    return !fs.existsSync(targetPath)
      || fs.readFileSync(targetPath, 'utf8') !== renderCommandSkill(sourcePath);
  });
  const requiredFiles = ['AGENTS.md', '.codex/config.toml', '.codex/hooks.json'];
  requiredFiles.push('.codex/hooks/guard-destructive.sh');
  const missingFiles = requiredFiles.filter((name) => !fs.existsSync(path.join(targetRoot, name)));

  if (
    missingAgents.length
    || missingSkills.length
    || missingFiles.length
    || staleAgents.length
    || staleSkillFiles.length
    || staleHookFiles.length
    || staleCommands.length
  ) {
    if (missingFiles.length) console.error(`Missing Codex files: ${missingFiles.join(', ')}`);
    if (missingAgents.length) console.error(`Missing Codex agents: ${missingAgents.join(', ')}`);
    if (missingSkills.length) console.error(`Missing Codex skills: ${missingSkills.join(', ')}`);
    if (staleAgents.length) console.error(`Stale Codex agents: ${staleAgents.join(', ')}`);
    if (staleSkillFiles.length) console.error(`Stale Codex skill files: ${staleSkillFiles.length}`);
    if (staleHookFiles.length) console.error(`Stale Codex hook files: ${staleHookFiles.length}`);
    if (staleCommands.length) console.error(`Missing or stale Codex command adapters: ${staleCommands.length}`);
    return false;
  }

  console.log(
    `Codex sync check: ${sourceAgents.length} agents, ${sourceSkills.length} skills, ${sourceCommands.length} commands, 0 missing or stale`,
  );
  return true;
}

function syncCodex(sourceRoot, targetRoot) {
  const agentsWritten = syncAgents(sourceRoot, targetRoot);
  const commandsWritten = syncCommands(sourceRoot, targetRoot);
  const skillsCopied = copyTree(
    path.join(sourceRoot, 'core', 'skills'),
    path.join(targetRoot, '.agents', 'skills'),
  );
  const hooksCopied = copyTree(
    path.join(sourceRoot, 'core', 'hooks'),
    path.join(targetRoot, '.codex', 'hooks'),
  );
  console.log(
    `Codex sync: ${agentsWritten} agent files, ${commandsWritten} command adapters, ${skillsCopied} skill files, ${hooksCopied} hook files updated`,
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(__dirname, '..', '..');
  if (args.check) {
    process.exit(checkCodex(sourceRoot, args.target) ? 0 : 1);
  }
  syncCodex(sourceRoot, args.target);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Codex sync failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { checkCodex, renderCommandSkill, syncCodex };
