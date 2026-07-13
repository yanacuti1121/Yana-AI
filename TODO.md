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

> Note: MANIFEST.json's `skills_count` (1989) is stale against the real skill directory
> count (2016, post this pass) by a much larger margin than these 2 additions explain —
> `core/scripts/validate-counts.sh` already reports this drift plus a separate `rules`
> count mismatch (70 vs 71), both pre-existing and NOT caused by this pass. Out of scope
> here (would need auditing which of ~27 skill dirs went uncounted, likely across several
> prior sessions) — flagging for a dedicated pass, not silently fixing or silently ignoring.

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
