# Third-Party Inspiration Log

Tài liệu này ghi lại tất cả nguồn bên ngoài được dùng để tham khảo
hoặc adapt khi phát triển YAMTAM ENGINE.

Không phải tất cả đều được copy nguyên — nhiều nguồn chỉ dùng làm
inspiration để viết original content. Xem cột "Nature" để phân biệt.

Mọi file adapt phải ghi attribution trong header comment của file đó.

---

## Nguồn

### ECC (Everything Claude Code)
- **License:** MIT © 2026 Affaan Mustafa
- **Dùng trong:** Phase 1 — Anti-Fake-Pass Gate concept
- **Nature:** Concept adaptation — EVALUATION.md gap analysis, SOUL.md identity structure
- **Files adapted:** `gates/anti-fake-pass-gate.md` (concept), `core/SOUL.md` (future Phase)
- **Không copy:** install scripts, ecc2 Rust TUI, mcp-configs, package.json
- **Attribution required:** Giữ copyright notice nếu adapt > 50% text gốc

### Strix
- **License:** Apache 2.0
- **Dùng trong:** Phase 1 — Security Skill Pack, Security Scan Modes doc
- **Nature:** Concept adaptation — scan mode taxonomy, Red/Blue/Purple Team framing, agent state machine pattern
- **Files adapted:** `docs/security-scan-modes.md` (adapted, Apache 2.0), security skills (concept only, viết original)
- **Changes made:** Rewritten cho YAMTAM context, không port code nào
- **Không copy:** Python source, Docker configs, cloud integration, Strix brand/logo
- **Attribution required:** Ghi "Adapted from Strix (Apache 2.0)" trong file header

### Taste Skill
- **License:** MIT © 2026 Leonxlnx
- **Dùng trong:** Phase 3 — Design Skill Pack
- **Nature:** Adapted SKILL.md content (5 skills)
- **Files adapted:** 5 SKILL.md files trong `core/skills/design-*/` (adapted, MIT)
- **Changes made:** Thêm `origin`, `compatibility`, Anti-Fake-Pass sections; bỏ GPT-specific behavior; font stack thành suggestion thay vì mandate
- **Không copy:** brutalist (BETA), imagegen skills, brandkit, skill.sh
- **Attribution required:** Giữ copyright notice trong file header

### Free Claude Code
- **License:** MIT © 2026 Ali Khokhar
- **Dùng trong:** Phase 3 — Model Routing Strategy doc
- **Nature:** Concept only — ProviderDescriptor pattern, model tiering taxonomy
- **Files adapted:** `docs/model-routing-strategy.md` (concept doc, không có code)
- **Không copy:** Python FastAPI service, Admin UI, CLI, credential patterns
- **Attribution required:** Ghi credit trong file header

### AgentSkills
- **License:** Apache 2.0 © 2025 Anthropic, PBC
- **Dùng trong:** Phase 2 — Skill Spec, Writing Guide, Evaluation Rules
- **Nature:** Adapted documentation structure và field definitions
- **Files adapted:** `docs/skill-spec.md`, `docs/skill-writing-guide.md`, `docs/skill-evaluation-rules.md`
- **Changes made:** Adapted sang YAMTAM format, thêm YAMTAM-specific fields (origin, Anti-Fake-Pass), bỏ Mintlify-specific content
- **Không copy:** JSX components, docs.json, package.json
- **Attribution required:** Ghi "Adapted from AgentSkills (Apache 2.0, © Anthropic PBC)" trong file header

### Skills-Main
- **License:** KHÔNG CÓ LICENSE FILE
- **Dùng trong:** Không dùng — inspiration only
- **Nature:** Đọc để hiểu canonical SKILL.md template pattern
- **Files adapted:** Không có — tất cả viết original
- **Risk note:** No license file = All Rights Reserved by default. Không copy bất kỳ text nào.

---

## Trạng thái compliance

| Phase | Nguồn | Status |
|-------|-------|--------|
| Pre | Attribution doc này | DONE |
| P1 | ECC — Anti-Fake-Pass concept | REVIEWED, adapted |
| P1 | Strix — Security concepts | REVIEWED, adapted |
| P2 | AgentSkills — Skill spec | REVIEWED |
| P3 | Taste Skill — Design skills | REVIEWED |
| P3 | Free Claude Code — Model routing | REVIEWED |

_Cập nhật file này sau mỗi phase._
