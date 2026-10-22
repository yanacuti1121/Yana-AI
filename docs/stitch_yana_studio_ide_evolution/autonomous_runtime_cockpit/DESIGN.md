---
name: Autonomous Runtime Cockpit
colors:
  surface: '#111317'
  surface-dim: '#111317'
  surface-bright: '#37393e'
  surface-container-lowest: '#0c0e12'
  surface-container-low: '#1a1c20'
  surface-container: '#1e2024'
  surface-container-high: '#282a2e'
  surface-container-highest: '#333539'
  on-surface: '#e2e2e8'
  on-surface-variant: '#c3c6d7'
  inverse-surface: '#e2e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#8d90a0'
  outline-variant: '#434654'
  surface-tint: '#b4c5ff'
  primary: '#b4c5ff'
  on-primary: '#002a77'
  primary-container: '#608bff'
  on-primary-container: '#002469'
  inverse-primary: '#1454d3'
  secondary: '#46eee0'
  on-secondary: '#003733'
  secondary-container: '#00d2c4'
  on-secondary-container: '#00554f'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#00a572'
  on-tertiary-container: '#00311f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea7'
  secondary-fixed: '#56faeb'
  secondary-fixed-dim: '#28ddcf'
  on-secondary-fixed: '#00201d'
  on-secondary-fixed-variant: '#00504a'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#111317'
  on-background: '#e2e2e8'
  surface-variant: '#333539'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-md:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 15px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0px
  margin: 0px
  space-xs: 0.125rem
  space-sm: 0.25rem
  space-md: 0.5rem
  space-lg: 0.75rem
  space-xl: 1rem
---

## Brand & Style

This design system is tailored for an elite AI-native development studio and autonomous execution environment. Designed explicitly for software engineers, systems architects, and runtime operators engaged in 10+ hour continuous coding cycles, the visual posture communicates high technical rigor, uncompromising utility, and surgical control.

The visual style blends:
- **Technical Precision & Density:** Inspired by premier code execution surfaces (VS Code / Cursor), prioritizing maximum operational density, zero-waste chrome, razor-thin panel separations, and immediate information extraction.
- **Mission-Critical Cockpit Semantics:** Incorporating deterministic runtime governance (approval gates, autonomous agent traces, memory diffs, and execution permissions) without turning the surface into a cluttered telemetry dashboard.
- **Calculated Anti-Distraction:** No fuzzy glassmorphism, no playful skeuomorphism, and no oversized marketing-grade margins. Depth is achieved strictly through calibrated luminance stepping and hairline borders.

## Colors

The palette is engineered around low optical fatigue across deep dark spectrums, punctuated by razor-sharp semantic accents and intelligence indicators.

### Base Surface Architecture
- **App Canvas Base (`#0c0e12`):** Primary root workbench background, visible behind detached panes and global framing.
- **Editor Canvas (`#12151c`):** Primary focal zone for code editing, agent reasoning diffs, and file tabs.
- **Panels & Activity Rail (`#161a22`):** Terminal panes, file explorers, agent inspector trees, and bottom status panels.
- **Elevated Overlays (`#1c212c`):** Quick-open palettes (Cmd+P), context tooltips, hover diagnostic popovers, and prompt input boxes.

### Hairline Borders & Dividers
- **Structural Border Subdued (`#1e222b`):** Hairline (1px) borders between static panels, status bars, and gutter boundaries.
- **Structural Border High-Contrast (`#252a36`):** Active pane borders, focused input peripheries, and tab segment borders.

### Intelligence & Runtime Tokens
- **Yana Core Intelligence (`#4f80ff`):** Autonomous agent streams, active suggestions, and neural context triggers.
- **Telemetry & Synthesis (`#00d2c4`):** Real-time latency indicators, model routing nodes, and token-cost graphs.
- **ALLOW / Active Status (`#10b981`):** Permitted autonomous tool calls, sandbox healthy states, and passing regression checks.
- **HUMAN APPROVAL REQUIRED (`#f59e0b`):** Execution stalls, destructive file operations, and gated agent actions awaiting review.
- **DENY / Error (`#ef4444`):** Blocked calls, lint breaks, fatal exceptions, and security guardrail triggers.

## Typography

The type hierarchy prioritizes high information density and programmatic clarity. 

1. **Interface Neutral (Geist):** Handles panel headers, modal text, and conversational reasoning steps. The neutral character and compact x-height allow multi-column file trees and docked sidebars to remain legible without horizontal overflow.
2. **Deterministic Monospace (JetBrains Mono):** Drives source code, AST diff views, agent terminal outputs, file paths, keybindings, and governance badges (`ALLOW`, `DENY`, `APPROVAL`). Ligatures are retained for language symbols (`=>`, `===`, `!=`), while numbers have uniform tabular widths to ensure numerical alignment in telemetry tables.

## Layout & Spacing

The workspace uses a full-bleed, edge-to-edge multi-pane layout model optimized for multi-monitor desktop environments:
- **Zero-Margin Shell:** The workspace canvas spans 100vw and 100vh with no outer canvas margin.
- **Hairline Pane Dividers:** Panes, terminals, and sidebars sit flush against each other separated purely by 1px solid boundaries (`#1e222b`) with 0px gutters.
- **Docking Flexibility:** Split panels support 2-way, 3-way vertical, and horizontal divisions. Draggable splitter handles occupy a 3px invisible hit area centered over the 1px divider.
- **Compact Component Padding:** Interior padding relies strictly on `space-xs` (2px) to `space-md` (8px). File tree rows, terminal logs, and token list items maintain a fixed vertical cadence of 22px to 26px to maximize lines of viewable code.

## Elevation & Depth

Visual hierarchy is communicated via structured tonal stacking and calibrated 1px outlines rather than heavy drop shadows:

- **Surface Level 0 (`#0c0e12`):** Primary background frame and unallocated canvas space.
- **Surface Level 1 (`#12151c`):** Editor canvas, markdown preview surfaces, agent chat history panes.
- **Surface Level 2 (`#161a22`):** Activity bar, explorer sidebars, integrated terminal drawers, breadcrumbs.
- **Surface Level 3 (`#1c212c`):** Hover cards, completion tooltips, contextual action bars. Bordered with `#252a36` and an ultra-subtle directional shadow: `0 4px 16px rgba(0, 0, 0, 0.45)`.
- **Surface Level 4 (Modal Command Center):** Command palette (Cmd+K/Cmd+P) and permission approval dialogs. Framed by a solid 1px `#252a36` boundary with an ambient drop: `0 12px 32px rgba(0, 0, 0, 0.65)`.
- **Focus Indication:** Active focus rings bypass thick multi-pixel glows in favor of a crisp 1px outline in `#4f80ff` with 0px offset.

## Shapes

The design system enforces compact, sharp geometry (`roundedness: 1`) to preserve precious pixel real estate and maintain a serious, IDE-grade aesthetic:
- **Panels, Panes, & File Tabs:** 0px radius (`rounded-none`). Tabs and dockable panels merge seamlessly into the 1px perimeter dividers.
- **Buttons, Badges, Inputs & Tooltips:** 0.25rem (4px) radius. Micro-components maintain clean, slightly softened corners that prevent visual harshness without degrading density.
- **Floating Prompts & Overlays:** 0.375rem (6px) radius for detached central overlays (Command Palette, Runtime Permission Cards).

## Components

### Buttons & Interactive Triggers
- **Primary Action (Trigger Run / Commit):** Solid `#4f80ff` background, white label, 4px corner radius, height 26px, padding 0 10px. Hover elevates brightness by 8%.
- **Governance Gate Action:** 
  - *Approve Action:* Hairline container `#10b981` (10% tint), border 1px solid `#10b981`, text `#10b981`.
  - *Deny Action:* Hairline container `#ef4444` (10% tint), border 1px solid `#ef4444`, text `#ef4444`.
- **Ghost Tool Button:** Background transparent, text `#94a3b8`, 4px radius. Hover: background `#1c212c`, text `#f8fafc`.

### Cockpit Governance Chips & Status Badges
- **Format:** Micro monospace label (`label-sm`), 18px total height, horizontal padding 6px, 2px radius.
- **ALLOW:** Text `#10b981`, background `rgba(16, 185, 129, 0.12)`, border 1px solid `rgba(16, 185, 129, 0.3)`.
- **HUMAN APPROVAL REQUIRED:** Text `#f59e0b`, background `rgba(245, 158, 11, 0.12)`, border 1px solid `rgba(245, 158, 11, 0.3)`.
- **DENY:** Text `#ef4444`, background `rgba(239, 68, 68, 0.12)`, border 1px solid `rgba(239, 68, 68, 0.3)`.
- **Autonomous Agent Active:** Pulsing dot (6px `#00d2c4`) paired with monospace model tag (`CLAUDE-3.7-SONNET [THINKING]`).

### Inputs & Chat Prompts
- **Editor Inline AI Prompt:** Embedded directly within the code canvas. Background `#161a22`, border 1px solid `#252a36`, focused state switches border to `#4f80ff`. Height dynamic with single-line default at 30px.
- **System Inputs:** Monospace text rendering, placeholder in `#475569`, zero native browser outlines.

### Tree Views & Lists
- **File Explorer & AST Nodes:** 22px row height. Hover row background `#1c212c`. Selected row background `#252a36` with 2px accent indicator bar pinned to the left edge.
- **Agent Execution Timeline:** Step-by-step collapsible disclosure nodes connected by 1px vertical tracks (`#1e222b`). Completed steps show `#10b981` checkmarks; awaiting steps show `#f59e0b` hollow circles.

### Cards & Execution Containers
- No floating decorative cards. All cards act as functional panels: flush borders (`#1e222b`), top header bar (28px height, `#161a22`), and interior content body (`#12151c`).