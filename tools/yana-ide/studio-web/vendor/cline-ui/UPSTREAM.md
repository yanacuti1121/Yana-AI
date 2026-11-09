# Vendored from cline/cline (`@cline/ui`), then adapted for Yana

- Source: https://github.com/cline/cline, directory `sdk/packages/ui`
- Commit: `d3ecc4890e8f9bcb77182b96c77fa90575e8e145`
- License: Apache License 2.0 (`LICENSE` in this directory is a copy of upstream's root `LICENSE`).
- Palette ancestry: `theme/palette.css` was derived by Cline from Radix Colors, MIT (`RADIX-COLORS-LICENSE`).
- Copied on 2026-11-05, adapted on 2026-11-06.

## Policy: these files are Yana's now

Anh decided on 2026-11-06 to edit the vendored files directly, so the Yana look lives in one place and
nothing is re-fixed later. Apache-2.0 allows modification as long as the license and copyright notices
stay and changed files carry a notice. Apache-2.0 does not grant any right to Cline's name or logos
(section 6), so none of that is used here: the Cline robot is replaced by the Yana rabbit.

Consequence: these files are no longer byte-for-byte copies, so they are not guaranteed to diff cleanly
against upstream. Each modified file starts with a comment naming what changed. To send something back
upstream, port the change by hand.

## Files and what changed

| Here | Upstream path (under `sdk/packages/ui`) | State |
|---|---|---|
| `theme/palette.css` | same | **Modified.** Every color replaced by Yana's light palette (Fluent Blue values); `.dark` block removed. Structure unchanged. |
| `theme/tokens.css` | same | **Modified.** Relative palette import, blue brand artwork colors, system font stack, light-only role mapping, `.dark` blocks removed. |
| `theme/component-theme.css` | same | Unmodified. |
| `components/agent-welcome-hero.tsx` | same | **Modified.** Cline robot replaced by the Yana rabbit logo (`../../../assets/yana-rabbit.svg`, the pixel rabbit from the notch prototype, `tools/yana-notch/prototype/index.html`, with a dark outline so it reads on white). |
| `components/agent-welcome-hero.css` | same | **Modified.** Robot masks, layers and `.dark` rule removed; `__rabbit` rule added. |
| `components/agent-welcome-hero-pointer.ts` | same | Unmodified. The rabbit reuses the CSS variables the eyes used. |
| `components/agent-quick-actions.tsx` | same | **Modified.** The description wraps instead of ending in an ellipsis; an empty description renders nothing. |
| `components/agent-quick-actions.css` | same | Unmodified. |
| `components/session-status.{tsx,css}` | same | Unmodified. |

## Also copied verbatim on 2026-11-06 ("take the rest")

Every other file of the package: all `components/` (chat, composer, approval card, ask question, changes, command output,
prompt queue, pull request bar, session row, UX verification, generated media, markdown, mermaid, carousel, message
scroller, search combobox, switch, badge, button, kbd, tool diff and tool summary), the `stories/` examples with their
two sample images, and `components.css`, `theme/theme.css`, `theme/base.css`, `theme/index.css`. The four CSS files hold no
color values. Their `@import "@cline/ui/..."` lines are left as upstream wrote them and need an alias when wired.
`components/*` that are not listed in the table above are unmodified and do not carry Yana colors in their own files; they
read the palette from `theme/palette.css` and `theme/tokens.css`.

Three files under `shared/` (`browser.ts`, `llms/media.ts`, `ux-verifier.ts`) come from `@cline/shared`, not from this
package. They were copied early and will be replaced by a Yana shim, because Yana does not take Cline's shared runtime.

## Not taken, on purpose

- `theme/scoped-tokens.css` (generated from Cline's own tokens, so it still holds Cline's violet palette; Yana generates its own when needed).
- `.storybook/` configuration, tests, scripts and package metadata.

Cline's core, agents, LLM layers, `apps/vscode/webview-ui` (PostHog telemetry and a private protocol),
and every other `@cline/ui` component. Yana's own runtime is `yana-rt`. Cline's name, logo and robot
are not used in the product.

## Palette source

Values follow the Fluent Blue design system, light theme (https://github.com/danieldev23/fluent-blue, MIT).
Primary blue is `#1470f0`, slightly lighter than Fluent Blue's `#0e68ea`; it is the lightest blue that
keeps white text at 4.5:1 (4.56:1). The same values drive the IDE theme (`scripts/build-themes.mjs`).

## Rules for editing here

1. Add a notice comment to any file you change and update the table above.
2. Keep light only. There is no dark theme.
3. No Cline account, cloud, marketplace, telemetry code or branding.
