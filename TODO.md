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

> Note: anh nói tổng đang có **19 cái cần làm** — 3 link trên là phần mới nhất được
> thêm vào, nay đã resolve hết (0 actionable). 16 cái còn lại đang được anh track ở nơi
> khác (chưa có trong file này) — bổ sung vào đây khi có link.
