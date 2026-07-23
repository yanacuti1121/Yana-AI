# TODO

## Repo → Skill ingestion queue

Repos anh Tâm muốn map thành skill (pattern: `core/skills/<owner--repo>/SKILL.md`,
xem ví dụ `core/skills/agent-reach/`).

- [x] https://github.com/nidhinjs/prompt-master — SKIP, duplicate. `core/skills/prompt-engineering/`
      already covers the same ground (role framing, few-shot, CoT, format control,
      versioning, A/B testing). Only non-overlapping angle (multi-target-tool prompt
      shaping, clarifying-questions workflow) can be folded into that skill later if wanted.
- [x] https://github.com/devbeta-hcode/pig-agents — SKIP. Standalone competing IDE+agent
      app, not a "install a CLI, here's how to invoke it" skill shape. Also no explicit
      OSS license in the repo — copying content would be an attribution risk.
- [x] https://github.com/Panniantong/Agent-Reach — already done, and done twice. Deduped:
      removed `core/skills/panniantong--agent-reach/` (thinner installer-style dup), kept
      `core/skills/agent-reach/` (richer, has Anti-Fake-Pass + See Also). Lockfile pruned.
- [x] https://github.com/asgeirtj/system_prompts_leaks — DONE. Extended
      `core/skills/ai-system-prompts-intel/` (both `core/` and `.claude/` copies) with a
      new "Key patterns — general chat products" section (Claude claude.ai, Gemini, Grok,
      Perplexity Comet, Mistral) — structural/pattern analysis only, no verbatim leaked
      policy text reproduced. skills-lock.json hash regenerated, verify-skills-lock.sh and
      skill-trigger tests both pass. The zip file anh provided has been processed and
      deleted (content extracted, not needed anymore).
- [x] https://github.com/addyosmani/agent-skills — SKIP, already done (previously, not
      in this pass). Confirmed via `origin:` field on `core/skills/addyosmani--using-
      agent-skills/SKILL.md` and 22 sibling `addyosmani--*/` skill dirs, all citing the
      same repo — this is already fully ingested.
- [x] https://github.com/msitarzewski/agency-agents — SKIP, already done (previously).
      `core/skills/agency-agents/SKILL.md` has `origin: msitarzewski/agency-agents (MIT)`
      — exact match, already ingested.
- [x] https://github.com/ogulcancelik/herdr — SKIP. Standalone Rust terminal-multiplexer
      binary ("agent multiplexer that lives in your terminal", tmux-for-agents with a
      socket API) — same "not a skill shape" call as `devbeta-hcode/pig-agents` earlier
      in this queue: no prompt/instruction content to port, it's an external tool product.
      Also dual-licensed AGPL-3.0-or-later/commercial (GitHub API reports license as
      NOASSERTION), a copyleft complication if ever reconsidered. Genuinely useful tool
      anh could evaluate personally outside Yana AI — just not a `core/skills/` candidate.
- [x] https://github.com/DeusData/codebase-memory-mcp — DONE. Created
      `core/skills/deusdata--codebase-memory-mcp/` (MCP install/usage skill, not
      content-porting — matches the predicted shape). MIT, SLSA 3, OpenSSF Scorecard,
      signed+VirusTotal-scanned releases, arXiv-published benchmarks (10x fewer tokens,
      2x fewer tool calls vs file-by-file exploration on structural code queries).
      Distinct from `graphify-knowledge-graph` (broader multimodal graph, not code-only
      AST/LSP). Skill flags the install script's curl|bash pattern as requiring explicit
      per-action human-gate confirmation before ever running it (44-supply-chain-vetting.md).
- [x] https://github.com/JuliusBrussee/caveman — SKIP, functional duplicate. This repo's
      existing `core/skills/caveman/SKILL.md` is sourced from `mattpocock/skills`
      (different origin repo, same "caveman mode" concept/trigger phrases) — confirmed
      JuliusBrussee/caveman is a real, separate implementation of the same idea (ponytail's
      own README benchmarks against it by name). Same mechanism (terse-prose token
      compression), same trigger surface → not worth a second skill entry.
- [x] https://github.com/DietrichGebert/ponytail — DONE. Created `core/skills/ponytail/`
      — YAGNI code-minimalism ladder (does this need to exist? → in codebase already? →
      stdlib? → native platform? → dependency? → one line?). Genuinely distinct axis from
      `caveman` (prose compression vs. code-size discipline) — cross-referenced in both
      skills. Real benchmark data in the skill (-54% LOC, -22% tokens, 100% safety score
      vs. a bare "write fewer tokens" prompt at 95% on adversarial testing).

`skills-lock.json` regenerated (2015 entries, 0 drift), `verify-skills-lock.sh` and the
678-case skill-trigger suite both pass. Both new skills mirrored into `.claude/skills/`
per this repo's dual-copy convention.

> Update 2026-07-16: resolved. MANIFEST.json's `skills_count`/`rules_count` were already
> correct by the time of this pass (2016 / 71 — `validate-counts.sh` confirms OK on both).
> The actual drift turned out to live outside MANIFEST.json entirely: `.claude-plugin/
> marketplace.json`, `skills/yana-ai/SKILL.md`, and `docs/{index,desktop}.html` (+ their
> `.claude/docs/` mirrors) all had stale hardcoded counts (45/51/59 hooks, 1989/3440/4200
> skills, 68 rules, 90/95/204 agents) that never got updated when MANIFEST.json's real
> numbers changed. Fixed all of them to match MANIFEST.json (58 hooks, 2016 skills, 71
> rules, 101 agents, 170 commands) in the same pass as this note. `validate-counts.sh`
> itself currently reports 2 unrelated mismatches (hooks 58→60, scripts 108→109) caused by
> a separate in-progress session adding new hook/script files — not part of this fix.

> Note: anh nói tổng đang có **19 cái cần làm** — the 6 links above are now fully
> researched (0 actionable left in this batch: 2 built, 3 skipped as duplicate/non-skill-
> shaped, 1 already done previously). 12 cái còn lại đang được anh track ở nơi khác
> (chưa có trong file này) — bổ sung vào đây khi có link.

- [ ] https://github.com/bestagentkits/ck-skills — not yet reviewed.
- [ ] https://github.com/JustVugg/colibri — not yet reviewed.
- [ ] https://github.com/Dicklesworthstone/destructive_command_guard — not yet reviewed;
      name suggests direct overlap with this repo's own `guard-destructive.sh` /
      `02-terminal-validator.md` — worth checking first for cross-pollination ideas
      even if not ported as a standalone skill.
- [ ] https://github.com/Comfy-Org/ComfyUI — likely SKIP on sight (large node-based image-gen
      application, not skill-shaped content) but not yet confirmed — flagging the likely
      call rather than silently deciding without checking license/shape first.
- [ ] https://github.com/vxcontrol/pentagi — not yet reviewed (added 2026-07-23).
- [ ] https://github.com/koala73/worldmonitor — not yet reviewed (added 2026-07-23).

## Pre-1.0 priorities (from a 2026-07-13 cross-AI evidence-based review — see
## PR #72 and memory/feedback_evidence_hierarchy_review.md for the full exchange)

Converged after verifying two AI-generated reviews of this repo against real
code/git history (most of the reviews' specific claims were wrong — 21k files
vs. real 13,391 tracked, "missing roadmap/architecture/contributing" when all
3 exist — but the underlying concerns were directionally reasonable). Not yet
started, no priority order committed to — anh said "dừng ở đây được rồi" before
picking a next step.

- [x] BENCHMARK.md — DONE 2026-07-23. Real measured numbers (startup,
      memory, hook latency, dispatch latency, scan/doctor/ci Rust-vs-Python
      at two scales). Found and fixed a real bug in the process: README's
      inline "1256x faster" claim was already debunked once (2026-05-31,
      commit fb6a0cd7) and had silently regressed back via an unrelated
      README restore (2026-07-07) — not reproducible by any measurement,
      then or now. Fixed everywhere it appeared (README.md — the zh/vi/ko
      translations were checked and don't have this claim, docs/index.html
      + mirror, docs/reference/cli-reference.md,
      docs/social/{hn-post,reddit-posts}.md + mirrors). Also found: stale
      "2,016 skills"/"58 hooks" counts in README.md were never covered by
      drift-check.sh's marketing-copy check (only marketplace.json/SKILL.md/
      docs html were in that file list) — fixed by hand this pass, NOT added
      to the automated check, since README.md has legitimate non-total-count
      number mentions (e.g. "Launch 3 agents" in an example command) that
      would false-positive against the existing simple regex heuristic.
- [ ] Demo GIF/video — 1-2 min showing an agent trying something destructive
      and Yana blocking it in real time. README already has real captured
      terminal output (not staged) but no visual/video walkthrough.
- [ ] Documentation/version consistency CI check — package.json, MANIFEST.json,
      Cargo.toml, pyproject.toml, and README's stated counts (skills/agents/
      hooks/rules/commands/scripts) drifting apart is a REAL, repeated pattern
      in this repo's history (found and fixed 3 separate times just in this
      session: MANIFEST/README count drift PR #67/#68/#69, ROADMAP/VERSIONING.md
      discoverability PR #72). `drift-check.sh`/`validate-manifest.sh`/
      `validate-counts.sh` already exist but don't fully agree with each other
      on methodology (see PR #71's commit message for one concrete example —
      `components.agents.count` vs `agents_count` disagreeing) — worth
      reconciling into one canonical check before adding more.
- [ ] Release governance checklist for the 3-axis version scheme (see
      VERSIONING.md) — ensure each artifact gets the right axis bumped and
      related docs updated together, not piecemeal.
- [ ] (Lower priority, explicitly not urgent per the review exchange) —
      skill governance / duplicate-detection tooling for the 2016 SKILL.md
      files (near-duplicate names like "X", "X_v2", "X_fixed"), and an audit
      of whether all 101 agents are actually reachable/used vs. overlapping
      responsibilities (e.g. backend-developer vs. api-designer vs.
      backend-reviewer). Raised as a real concern, not yet investigated.
