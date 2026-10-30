# Yana UX-first backlog

Updated: 2026-10-29. Phase 0 (internal audit), batch 1. Study of external systems (Phase 1) has not started, so the "Learn from" column holds study targets only, not findings.

Rules: an item is listed only if its evidence was observed in this session. Evidence that could not be reproduced is marked `unverified` and does not count toward the 100.

Size: S under 1 hour, M under 1 day, L more. Status: open, unverified.

Count so far: 39 verified items and 3 unverified (not counted). Solved: 7 (A01, A11, B01, B04, C01, C02, C10). Partial: 7 (A02, B02, C03, C06, C07, C08, D01). In progress elsewhere: 1 (E01). Closed by design: 1 (C05). Counted by a script over the tables.

## A. First run and first impression

| ID | Problem | Evidence | Learn from (to study) | Size | Status |
|---|---|---|---|---|---|
| A01 | Quick start table repeats the same macOS row twice and lists no other platform | README.md, "Quick start" table: two identical rows `macOS, Apple Silicon` | Homebrew install page | S | solved (3f5e2d54) |
| A02 | Counts disagree inside one repo although the README says CI derives them | README "At a glance": 100 agents, 2,026 skills, 40 subcommands, 288 core files. README "System structure": 60 agents, 2,027 skills, 41 subcommands, 289 files. `bin/yana --help` banner: 2035 skills. `ls core/skills` entries: 2036 | Stripe docs (single source for facts) | S | partial (3f5e2d54): README counts fixed; checker blind spot is A11; subcommand count 40 vs 41 still unverified |
| A03 | Three install routes (desktop, pip, cargo) are offered together with no recommended path, and `cargo install yana-rt` comes after `yana-ai doctor` | README "Quick start" | GitHub CLI install, Vercel CLI | S | open |
| A04 | macOS build is not notarized, so first launch triggers a Gatekeeper warning | README Quick start note | Apple notarization docs, Docker Desktop | L | open |
| A05 | No Linux ARM build; Windows and Linux are not mentioned in the platform table | README Quick start note and table | VS Code download page | M | open |
| A06 | The opening message is a slogan about control, not what the user gets | README line 8: "Models propose. Yana decides. Humans stay in charge." | Linear, Raycast landing copy | S | open |
| A07 | Headline stats describe what was built (hooks, files, startup time) and not what the user gains | README "At a glance": 66 hooks, 288 core files, 4.2 ms startup, 2,026 skills "no permissions" | Rule 69 L6.4/L6.5 (numbers must say what they mean) | S | open |
| A08 | Component status is conveyed only by shields.io images, so it fails without network or a screen reader | README "System structure": status cells are `![Live](https://img.shields.io/...)` | WCAG text alternatives | S | open |
| A09 | Four frontends are presented side by side (Studio, IDE, Desktop/Web, plus `tools/yana-notch` which the table omits) with no guidance on which to use | README "System structure"; `ls tools` | Docker Desktop vs CLI positioning | M | open |
| A10 | `tools/` mixes product code with experiments (finetune-vi, moss-tts-nano, promo, codexmate-vi-patch) | `ls tools` (15 entries) | Monorepo hygiene in large OSS repos | M | open |
| A11 | check_counts.py reported CLEAN while the README held wrong counts, so its patterns miss the stats table, the structure table, the file tree and the translations | Running python3 -I core/scripts/check_counts.py printed CLEAN (agents=100, skills=2035) while README.md said 2,026 and 2,027 skills, 60 agents and 288 files | Docs-as-code link checkers | M | solved (4b531c48) |
| A12 | The vi, ko and zh READMEs are not covered by the count anchors, so their numbers can drift again. vi writes thousands with a dot, which the anchor formatter would overwrite | Before the fixes in 3f5e2d54 and 4b531c48 the translations held 2.026 and 40 while the canonical counts were 2035 and 41; `_COUNT_ANCHORS` in core/scripts/check_counts.py has an entry only for README.md | Docs-as-code checks | M | open |

## B. Command line

| ID | Problem | Evidence | Learn from (to study) | Size | Status |
|---|---|---|---|---|---|
| B01 | `yana-ai --help` prints a roughly 20 line banner before the usage text | Output of `bash bin/yana --help` | GitHub CLI, Homebrew (usage first) | S | solved (0d100c75) |
| B02 | Usage is one flat list of 19+ commands with no "start here" group | `bash bin/yana --help` | GitHub CLI command groups | S | partial (0d100c75): a Start here block now leads the list; the 70 command list itself is still flat |
| B03 | Commands depend on three different backends (bash, Python scripts "not yet ported", the Rust runtime), and the user must know which | `bin/yana`: comment "Python scripts (not yet ported)"; error text lists "Commands that work without yana-rt" | Homebrew single entry point | L | open |
| B04 | Missing-runtime error tells every user to "cargo build --release (run in this repo)", which only fits a source checkout | `bin/yana`, function `rt()` | Rustup, Deno error messages | S | solved (0d100c75) |
| B05 | Two npm bins with near identical names: `yana-ai-rt` is a 4 line alias that sets `YANA_RT_CHAT_ALIAS=1` then loads `yana-rt-wrapper.js` | `scripts/yana-ai-rt-wrapper.js`; `package.json` bin map has 4 entries | npm bin naming in popular CLIs | S | open |
| B06 | npm metadata is maintained for a channel that no longer exists: registry says `Unpublished on 2026-07-30` and the README says "not published to npm", yet a recent commit is "bump npm product version to 1.5.1" | `npm view yana-ai` returned E404 Unpublished; README Quick start; git reflog | Single release channel policy | M | open |

## C. Permissions, hooks and the halt flow

| ID | Problem | Evidence | Learn from (to study) | Size | Status |
|---|---|---|---|---|---|
| C01 | The halt message gives a command containing `<tên>` and `<lý do>`; zsh reads `<` as redirection, so the user got `parse error near \n` | Terminal output pasted by the maintainer in this session | GitHub CLI, kubectl error hints with real examples | S | solved (314906ac) |
| C02 | The halt message says to delete a lock file but does not give the command, and the user typed the path alone and got `permission denied` | Same paste: `.claude/state/GIAMTHI_HALT.lock` run as a command | Docker, Git "hint:" lines | S | solved (314906ac) |
| C03 | The halt record lists 13 changed files with no diffstat and no risk label, so a human must diff by hand to judge it | Halt text in this session | GitHub Dependabot PR summaries | M | partial (314906ac): diff command added to the message; no risk labels yet |
| C04 | Approving the baseline does not clear the halt, a second manual step the message only mentions in passing | Halt text: "lệnh này KHÔNG gỡ HALT" | Two-step flows with a single summary screen | M | open |
| C05 | The halt blocked a skill triggered by a greeting, so fail-closed was wider than the risk | First turn: `idea-loop` blocked by Giám Thị after "Helo em" | Claude Code permission modes | M | closed, by design: core/hooks/giamthi-halt-check.sh header says a HALT denies every tool call so that whatever can stop a session cannot also restart it. Not changed |
| C06 | The shell guard blocked `${PIPESTATUS[0]}` as a subshell injection and the message does not say what is allowed | Hook error `tool-proxy-enforcer` in this session | ShellCheck messages with fixes | S | partial (this commit): the deny message now names the matched text and the alternative; the guard still blocks it by design |
| C07 | The shell guard blocked a harmless count command that used `$( )` inside `printf` | Same hook, earlier call in this session | ShellCheck | S | partial (this commit): same message change; the guard still blocks it by design |
| C08 | The pipe-to-interpreter rule fired on a `grep -E` pattern that merely contained the text `node ` | Hook error "pipe-to-interpreter detected" on a grep with pattern `...|node |...` | Parse the command before matching | M | partial (this commit): the message now shows the matched text and a hint for grep patterns; the false positive remains |
| C09 | `token-scope-guard` warns "bulk secret scan" whenever a `grep -r` line contains the word secret or token anywhere later, even as the search phrase itself. The regex `grep.*-r.*secret` also spans across `;` and `\|`, so words from a different command on the same line count. Correction: the first version of this row said the commands "only listed file names"; that was wrong, the patterns contained `service_token` and the phrase "bulk secret scan" | Warnings in this session on commands containing `grep -rIlE "...service_token"` and `grep -rIl "bulk secret scan"`; regex at `core/hooks/token-scope-guard.sh` line 80 | Secret scanners that look at content, not names | M | open (advisory only, matches the design; narrowing it is a design choice, not changed) |
| C10 | The `Trust score: N/100` line is stuck at 0. It is real state, not a dead metric: `truth-gate-guard.sh` subtracts 10 per warning and `session-bootstrap.sh` prints the value below 80, but `session-trust.sh` documents the score as per session and nothing calls its `reset` at session start, so the file keeps the floor value across sessions. Correction: an earlier note called this a number with no information; that was wrong | `.claude/state/session-trust.json` contains `{"score":0}`; `grep -rn "session-trust.sh reset" core/hooks core/scripts` finds no caller; header of `core/scripts/session-trust.sh` says "within the current session" | Rule 63 stop below 60 | S | solved (7c7bfc45) |
| C11 | Guidance that tells people to run `git diff` opens a pager, and the maintainer asked how to leave it | Conversation: "mà xem rồi thoát ra kiểu gì" | Tools that ship `--no-pager` examples | S | open |

## D. Multi-session work

| ID | Problem | Evidence | Learn from (to study) | Size | Status |
|---|---|---|---|---|---|
| D01 | Three sessions share one checkout, and a branch switch plus reset lost uncommitted edits | `git reflog` shows checkout, reset and rebase in the shared dir; edits were gone afterwards | Git worktree workflows, Cursor background agents | M | partial (56607115): rule added to AGENTS.md; nothing enforces it |
| D02 | No coordination for heavy builds: another session started `cargo build` while load average was 17.6 and swap 85% used | `uptime`, `sysctl vm.swapusage`, `ps` showing `rustc` | Build queues, sccache | M | open |
| D03 | Each session starts its own copy of `ollama-mcp` and `rea-agents` (three copies each) | `pgrep -fl` listing | Shared MCP host process | M | open |
| D04 | An untracked large video sits in `docs/` and is not ignored | `git status`: `?? docs/d267...MP4` | `.gitignore` for media, Git LFS | S | open |

## E. Information access

| ID | Problem | Evidence | Learn from (to study) | Size | Status |
|---|---|---|---|---|---|
| E01 | Pending approvals, halt state, token budget, audit log and memory live in different places with no single view | Paths seen: `.claude/state/`, `core/memory/`, `docs/`, hook output in the terminal | Docker Desktop dashboard, macOS notification center | L | in progress elsewhere: worktree Yana-AI-status, branch feat/status-hub (yana-rt status); not duplicated here |
| E02 | Permission requests arrive one by one across the session instead of once up front | Maintainer feedback in this session; lease code is described as subagent oriented in `src/capability/lease.rs` header (not traced further) | Claude Code plan mode, Codex CLI approval modes | L | open |
| E03 | Users can browse 170 commands and 2,036 skills, which they should never have to do | `ls core/commands`, `ls core/skills` | Raycast and VS Code command palette search | M | open |
| E04 | The docs folder has 205 entries and the repo root 76, with no obvious entry point beyond the README | `ls docs`, `ls` counts | Stripe and Vercel doc structure | M | open |
| E05 | Idea: trust a project folder once, and let a parent folder cover its subfolders, so the first prompt is the only trust question. Whether Yana already does this was not checked | VS Code Workspace Trust page: remembered Trusted Folders list, parent folder trusts all subfolders (EVIDENCE/phase1-permissions.md) | VS Code Workspace Trust | M | unverified (Yana side not checked) |
| E06 | Idea: when a user approves an action offer a remembered choice scoped by repository and command, with a shorter scope for file edits (session only). Yana side not checked | Claude Code permissions page: "Yes, and don't ask again" lasts per repository and command for Bash, until session end for file edits | Claude Code permissions | M | unverified (Yana side not checked) |
| E07 | Idea: let the user pick a named run mode before work starts (for example plan only, accept edits, ask for everything) instead of answering prompts one by one. Yana side not checked | Claude Code permissions page lists acceptEdits, dontAsk, bypassPermissions and plan mode | Claude Code permission modes | L | unverified (Yana side not checked) |

## F. Review and release flow

| ID | Problem | Evidence | Learn from (to study) | Size | Status |
|---|---|---|---|---|---|
| F01 | Dependabot bumps of GitHub Actions touch `.github/workflows/`, a path Giám Thị watches, so each merged bump produces a HALT that needs a human baseline approval | Commit 1e75153b "Bump the actions group across 1 directory with 15 updates" (merged 2026-10-28) changed the 12 workflow files named in the HALT record; CI on main stayed green for six runs afterwards (`gh run list`) | Dependabot auto-merge policies | M | open |
| F02 | The release, publish and desktop workflows run only on tags or manual dispatch, so a pin bump to them is not exercised by the green ci.yml runs | `gh run list --workflow ci.yml` is green; no run of release.yml or publish.yml was seen in this session | Dry-run or `workflow_dispatch` smoke runs | M | open |

## Next

Phase 0, batch 2: walk the daily path and the failure path (`yana-ai doctor`, a blocked command, a refused approval). Then Phase 1: study the systems named above and replace the "to study" cells with cited findings.
