# Yana Website — Current Route Matrix

**Snapshot:** 2026-09-15
**Scope:** public files under `docs/`; this is an inventory, not a release claim.

## Source rules

- Product behaviour is described only from its owning source, not from other web copy.
- The model/provider count comes from `src/model/catalog.rs` (`PROVIDERS`): 19 registrations in this snapshot.
- Download availability is live GitHub Release data rendered by `docs/assets/ecosystem-pages.js`.
- A route is only marked **canonical** when it belongs to the current shared ecosystem site. Archive and utility pages remain listed so they are not mistaken for current product pages.

## Canonical routes

| Route | Purpose | Current navigation exposure | Language coverage | Truth source | Status / known inconsistency |
| --- | --- | --- | --- | --- | --- |
| `index.html` / `en.html` | Main product story and trust anchors | Top-level entry | VI / EN | Website source; Studio/runtime sources for product claims | Local-first copy needed a cloud-operation boundary; corrected in this snapshot. |
| `studio.html` / `studio-en.html` | Desktop workspace product surface | Direct and product mega menu on selected pages | VI / EN | `tools/yana-studio/` and release artefacts | Published Electron line is separate from the native macOS experiment; do not represent the latter as public. |
| `runtime.html` / `runtime-en.html` | Governed runtime/control plane | Direct on several pages | VI / EN | `src/`, `Cargo.toml` | Navigation varies by page. |
| `wheelbot.html` / `wheelbot-en.html` | Physical AI boundary | Direct on product pages | VI / EN | Wheelbot repository and bridge source | Must keep the explicit end-to-end verification boundary. |
| `ecosystem.html` / `ecosystem-en.html` | Product and deep-page directory | Direct / partly mega menu | VI / EN | Public product sources | Provider count was stale in the VI page; corrected to 19. |
| `models.html` / `models-en.html` | Provider/model contract | Deep page, weakly discoverable | VI / EN | `src/model/catalog.rs` | Both pages claimed 7 providers while catalog has 19; corrected in this snapshot. |
| `agents-skills.html` / `agents-skills-en.html` | Agents and skills | Deep page | VI / EN | `core/agents/`, `core/skills/` | Needs global navigation. |
| `connectors.html` / `connectors-en.html` | Connector boundaries | Deep page | VI / EN | `tools/yana-studio/host/integrations/` | OAuth capability must stay configuration-dependent. |
| `missions.html` / `missions-en.html` | Mission/task orchestration | Direct only on selected pages | VI / EN | `src/mission/` | Needs global navigation. |
| `continuity.html` / `continuity-en.html` | Session and continuity model | Direct only on selected pages | VI / EN | `src/chat/`, Studio session source | Needs global navigation. |
| `design.html` / `design-en.html` | Design canvas surface | Studio-adjacent navigation | VI / EN | `tools/yana-studio/renderer/` | Experimental scope must remain clear. |
| `governance.html` / `governance-en.html` | Human authority and governance | Direct on selected pages | VI / EN | `core/`, `src/guard/` | Needs global navigation. |
| `evidence.html` / `evidence-en.html` | Audit/evidence model | Deep page | VI / EN | Evidence and audit sources | Needs global navigation. |
| `safety.html` / `safety-en.html` | Guardrails and safety | Deep page | VI / EN | `core/hooks/`, `src/guard/` | Needs global navigation. |
| `architecture.html` / `architecture-en.html` | System architecture | Direct on selected pages | VI / EN | Repository architecture sources | Needs global navigation. |
| `download.html` / `download-en.html` | Official installer discovery | Primary CTA | VI / EN | GitHub Releases API via `ecosystem-pages.js` | Apple Silicon-only UI is intentional until other installers exist. |

## Special and legacy routes

| Route | Purpose | Language coverage | Status / follow-up |
| --- | --- | --- | --- |
| `integrations.html` | Host-specific integration distinctions | Runtime EN / VI / KO / ZH switcher | Keep technical distinctions; migrate its bespoke shell and i18n into the shared system. |
| `history.html` | Project history | VI only | Decide whether to publish as a resource page or mark as archival. |
| `commands.html` | Command reference | Single language | Give it the shared shell or move it behind documentation navigation. |
| `search.html` | Search utility | Single language | Utility page; keep out of primary mega navigation. |
| `music.html` | Non-core page | Single language | Not a canonical product route. |
| `yana-ai-system-map.html` | System map | Single language | Technical resource; expose from Architecture/Resources if retained. |
| `website-archive.html` | Earlier website implementation | Mixed/legacy | Archive only; do not link from canonical navigation. |

## Missing first-class resource surfaces

| Intended route | Current state | Canonical source to use |
| --- | --- | --- |
| `releases.html` | Missing | GitHub Releases API / release artefacts |
| `changelog.html` | Missing | Real release history and `CHANGELOG.md` |
| `roadmap.html` | Missing | `ROADMAP.md`, with shipped / in progress / exploring / deferred states |
| `principles.html` | Missing | Established governance and architecture principles |
| `security.html` | Missing | `SECURITY.md` and the actual security model |

## Implementation order

1. **P0 — truth:** provider count and precise local-first boundary.
2. **P1 — navigation:** one keyboard-accessible shared mega navigation across canonical pages, with a mobile menu rather than hover emulation.
3. **P1 — integrations:** migrate the legacy integrations shell without weakening its technical distinctions.
4. **P2 — resources:** build first-class Releases, Changelog, Roadmap, Principles, and Security pages from canonical sources.
5. **P2 — i18n:** document and apply one predictable language strategy.
