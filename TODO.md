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
- [ ] https://github.com/addyosmani/agent-skills — not yet reviewed for overlap against
      existing `core/skills/` content.
- [ ] https://github.com/msitarzewski/agency-agents — not yet reviewed for overlap.
- [ ] https://github.com/ogulcancelik/herdr — not yet reviewed for overlap.
- [ ] https://github.com/DeusData/codebase-memory-mcp — MCP server, so likely a candidate
      for a "how to install/wire up this MCP" skill shape rather than a content-porting
      skill (pattern differs from the others above) — not yet reviewed.
- [ ] https://github.com/JuliusBrussee/caveman — not yet reviewed for overlap.
- [ ] https://github.com/DietrichGebert/ponytail — not yet reviewed for overlap.

> Note: anh nói tổng đang có **19 cái cần làm** — 6 link mới nhất (agent-skills,
> agency-agents, herdr, codebase-memory-mcp, caveman, ponytail) chưa research = 6
> actionable (system_prompts_leaks đã xong). 12 cái còn lại đang được anh track ở nơi
> khác (chưa có trong file này) — bổ sung vào đây khi có link.
