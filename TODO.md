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
- [ ] https://github.com/asgeirtj/system_prompts_leaks — 56k⭐, CC0, updated today. Leaked
      system prompts from foundation-model chat products (Anthropic Claude, OpenAI ChatGPT/
      Codex, Google Gemini, xAI Grok, Copilot, Perplexity, Mistral, Notion, Qwen). PARTIAL
      overlap with `core/skills/ai-system-prompts-intel/` (sourced from a different repo,
      x1xhlol/system-prompts-and-models-of-ai-tools, 141k⭐) — that skill covers *coding
      tools* (Cursor, Windsurf, Devin, v0...), this one covers *general chat products*
      (raw ChatGPT/Claude/Gemini/Grok prompts) — different vendor angle, not a straight
      duplicate. Recommend: extend `ai-system-prompts-intel` with a "general chat products"
      section sourced from this repo, rather than a new skill — not yet done.
- [ ] https://github.com/addyosmani/agent-skills — not yet reviewed for overlap against
      existing `core/skills/` content.
- [ ] https://github.com/msitarzewski/agency-agents — not yet reviewed for overlap.
- [ ] https://github.com/ogulcancelik/herdr — not yet reviewed for overlap.
- [ ] https://github.com/DeusData/codebase-memory-mcp — MCP server, so likely a candidate
      for a "how to install/wire up this MCP" skill shape rather than a content-porting
      skill (pattern differs from the others above) — not yet reviewed.

> Note: anh nói tổng đang có **19 cái cần làm** — 4 link mới nhất (agent-skills,
> agency-agents, herdr, codebase-memory-mcp) chưa research, cộng 1 cái pending từ trước
> (system_prompts_leaks) = 5 actionable. 14 cái còn lại đang được anh track ở nơi khác
> (chưa có trong file này) — bổ sung vào đây khi có link.
