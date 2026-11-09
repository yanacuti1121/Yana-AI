# Yana Studio interface: locked design decisions

Locked by anh on 2026-11-06 after reviewing the rendered preview. Change a line here only when anh changes the decision.

## Decisions

1. **Light only.** There is no dark theme and none is designed. Cline's `.dark` blocks were removed from the vendored theme files.
2. **Palette from Fluent Blue** (https://github.com/danieldev23/fluent-blue, MIT, light theme), not from the Yana website palette.
   - Primary blue `#1470f0`: slightly lighter than Fluent Blue's `#0e68ea`, and the lightest blue that keeps white text at 4.5:1 (4.56:1). `#1677ff` gives 4.10:1, so use it only for borders and tints.
   - Page `#f5f5f5`, card `#ffffff`, border `#d9d9d9`, text `#141414`, secondary text `#595959`, blue tint `#e6f4ff`.
   - Status text uses the darker variants so small text stays readable: ok `#237804`, warning `#9a5c00`, error `#cf1322`, info `#0958d9`.
3. **Logo: the pixel rabbit from the notch prototype**, drawn as `assets/yana-rabbit.svg` (generated from the sprite in `tools/yana-notch/prototype/index.html`, with a dark outline so it reads on white). It replaces the Cline robot in the welcome hero.
4. **Cline's `@cline/ui` is Yana's now.** The vendored files are edited directly, with a notice in each changed file and a table in `vendor/cline-ui/UPSTREAM.md`. Apache-2.0 allows this; it gives no right to Cline's name or logos, so none are used.
5. **The IDE theme follows the same palette.** `scripts/build-themes.mjs` generates "Yana Light" and "Yana High Contrast Light" from the Fluent Blue values. The two interfaces are meant to merge later, so keep the values in step.

## Where the values live

| What | File |
|---|---|
| 12-step color scales | `vendor/cline-ui/theme/palette.css` |
| Roles (surface, text, border, status, fonts) | `vendor/cline-ui/theme/tokens.css` |
| IDE color theme | `scripts/build-themes.mjs` (run it to regenerate `extensions/yana-theme/themes/`) |
| Logo | `assets/yana-rabbit.svg` |
| Visual check | `preview/` and `vite.preview.config.mjs` (builds a preview page into a folder you choose) |

## Checked

- 18 text/background pairs of the generated "Yana Light" theme all reach at least 4.5:1 (lowest 4.56:1).
- The 19 `tools/yana-ide/tests/*.test.cjs` files pass.
- The preview page builds, and a screenshot shows the Cline components in the new colors with the rabbit in the hero.

## Not done yet

- The IDE default theme is still "Yana Dark" (`patches/0001-default-dark-theme.patch`). Changing it means editing the patch and building VS Code to verify.
- The React screens (settings, tasks, permissions, canvas) force a dark mode and are not restyled.
- The Start screen is built on the Cline components (`start-screen.tsx`, with `start-entry.tsx` as the webview entry): all 22 shortcuts of `features/home.js` in 5 groups, the rabbit, and a two-core status card that shows "unavailable" when `yana-rt` data is missing. It is not wired into the extension host: `features/home.js` is still a TreeView, and the host side of the `yana:start-data` and `yana:run-command` messages is not written. Nothing here has been opened in the real IDE.
- The "Yana Web" VS Code theme (black buttons, mirrors the website) is unchanged.
- The logo appears only in the hero. The app icon, the website and brand images are unchanged.
- The notch is part of the app but is out of scope for now. Do not touch `tools/yana-notch/` as part of this work.
- Column layout (pale-blue card vs full blue rail) is not chosen.
