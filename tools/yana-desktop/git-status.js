'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');

// Delegates to `yana-rt capability git-status` — the canonical
// `crate::capability::git::git_status` implementation chat's own
// `git_status` tool already uses (Gate L5-style: no reimplemented git
// parsing in two places). Same shape as list-dir.js's `listDir()`: every
// external dependency is a parameter, testable from plain `node` without
// bootstrapping Electron.
//
// TEMPORARY TRANSPORT ADAPTER (see src/capability/cli.rs's own doc
// comment on `CapabilityAction::GitStatus` for the full rationale):
// verified there is no generic "invoke capability by name" dispatcher in
// yana-rt today, so this is a one-off CLI-shaped read path for exactly
// one Context Panel field, not a pattern to keep replicating per-panel.
// A future generic `capability invoke <name>` path should replace this
// (and list-dir.js's own equivalent) if more panels need similar reads.
function gitStatus({ repoRoot, yanaRtBin, exec = execFileSync, existsSync = fs.existsSync }) {
  if (!existsSync(yanaRtBin)) {
    return { ok: false, error: `yana-rt binary not found at ${yanaRtBin}` };
  }
  let stdout;
  try {
    stdout = exec(yanaRtBin, ['capability', 'git-status', '--root', repoRoot], { encoding: 'utf8' });
  } catch (e) {
    const detail = (e.stderr || e.message || '').toString().trim();
    return { ok: false, error: detail || 'capability git-status failed' };
  }
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch (e) {
    return { ok: false, error: `capability git-status returned invalid JSON: ${e.message}` };
  }
  const raw = envelope?.data?.output;
  if (typeof raw !== 'string') {
    return { ok: false, error: 'capability git-status returned an invalid response envelope' };
  }
  return { ok: true, repoRoot, ...parsePorcelainV2(raw) };
}

// Porcelain v2 (`git status --porcelain=v2 --branch`): `# branch.*` header
// lines, then one line per change — `1 `/`2 ` ordinary/renamed changes,
// `u ` unmerged, `? ` untracked. Deliberately does NOT attempt to parse
// per-file diff content or a "last commit" summary — `branch.oid` is a
// commit hash, not a message/date, and getting those needs a second `git
// log` call this capability doesn't make; omitted rather than fabricated
// (see the new-app Context Panel's own doc comment).
//
// Roadmap Phase 7 item 26 (Changes View) added the `files` array: each
// entry's own index/worktree status letters (X/Y — e.g. 'M.' = staged
// modify, '.M' = unstaged modify, 'A.' = staged add), not a single
// collapsed "modified" bucket, since Changes View needs to show staged
// vs unstaged distinctly, matching what `git status` itself distinguishes.
function parsePorcelainV2(raw) {
  let branch = null;
  let modifiedCount = 0;
  let untrackedCount = 0;
  const files = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    if (line.startsWith('# branch.head ')) {
      branch = line.slice('# branch.head '.length).trim();
    } else if (line.startsWith('1 ')) {
      modifiedCount += 1;
      const xy = line.slice(2, 4);
      const path = line.split(' ').slice(8).join(' ');
      files.push({ path, indexStatus: xy[0], worktreeStatus: xy[1], kind: 'ordinary' });
    } else if (line.startsWith('u ')) {
      // Unmerged lines carry 3 stage-mode fields (m1/m2/m3) instead of
      // ordinary's single mW, so the path lands one field further right.
      modifiedCount += 1;
      const xy = line.slice(2, 4);
      const path = line.split(' ').slice(10).join(' ');
      files.push({ path, indexStatus: xy[0], worktreeStatus: xy[1], kind: 'unmerged' });
    } else if (line.startsWith('2 ')) {
      modifiedCount += 1;
      const xy = line.slice(2, 4);
      // Rename/copy lines carry "<newPath>\t<origPath>" as the final field.
      const rest = line.split(' ').slice(9).join(' ');
      const path = rest.split('\t')[0];
      files.push({ path, indexStatus: xy[0], worktreeStatus: xy[1], kind: 'renamed' });
    } else if (line.startsWith('? ')) {
      untrackedCount += 1;
      files.push({ path: line.slice(2), indexStatus: '?', worktreeStatus: '?', kind: 'untracked' });
    }
  }
  return { branch, modifiedCount, untrackedCount, files };
}

module.exports = { gitStatus, parsePorcelainV2 };
