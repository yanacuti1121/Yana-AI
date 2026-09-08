# Yana Desktop — User Guide

For installing on macOS (and the Gatekeeper warning), see
[MACOS_INSTALL.md](MACOS_INSTALL.md) first. This page covers using the app
once it's open.

## First launch

The first time you open Yana Desktop, you'll land on a setup screen: pick
a username and password (stored locally, scrypt-hashed — never sent
anywhere). From then on, that screen becomes the sign-in screen. If you've
linked a Google account (Settings → account section → "Link Google
account"), you can also sign in with the "Sign in with Google" button
there instead of typing your password.

You'll also want to add at least one AI provider — Settings → Models
& Providers → paste an API key (Anthropic, OpenAI, Gemini, Groq,
DeepSeek, OpenRouter, GLM, Kimi, xAI, and more), or connect a local model
(Ollama, LM Studio) if you'd rather run fully offline with no API key at
all.

## Two interfaces — new workspace vs. legacy

Yana Desktop currently ships with **two** interfaces, and it's easy to
land in the wrong one without realizing it:

- **New workspace** (default) — where active development happens, and
  what the rest of this guide describes.
- **Legacy** — the earlier interface, kept running while the new one
  catches up feature-for-feature.

**How to tell which one you're in:** the new workspace has a left icon
rail (Chat/Files/Git/Terminal/... — see below) and a "•••" menu in the
top-right of the header. The legacy interface has its own full sidebar
with labeled navigation and no "•••" header menu.

**Switching:**
- From the **new workspace** → legacy: click the **"•••"** menu (top-right
  header) → **"Legacy UI"**.
- From **legacy** → new workspace: open **Settings** → the **"Interface"**
  card → click the button there.

Whichever you pick is remembered for next launch — you only need to
switch once, not every time you open the app.

## The new workspace, section by section

The left icon rail is grouped into two parts:

**Core:**
| Section | What it's for |
|---|---|
| **Chat** | Talk to Yana. Supports text, pasted screenshots, dragged-in files, and referencing files from your open project. Multiple conversation tabs are supported (the tab bar above the message list). |
| **Projects** | Open, switch between, and manage the folders/repos Yana works on. |
| **Files** | Browse the active project's file tree; inspect/extract archives. |
| **Tasks** | Yana's real task list for the active project (not a separate to-do app — it's backed by the same task store the CLI uses). |
| **Git** | Stage, unstage, commit, and view diffs for the active project — a human-driven workspace (your own clicks), separate from anything Yana does autonomously. |
| **Activity** | A live feed of what Yana actually did — real runtime events, not a simulated log. |
| **Terminal** | A real system terminal (your own shell) alongside a governed execution path for anything Yana runs on your behalf — see the note below. |

**More:**
| Section | What it's for |
|---|---|
| **Models** | See and switch the active AI model/provider. |
| **Agents** | Browse available specialized agents. |
| **Commands** | Reference list of built-in commands. |
| **Permissions** | Review and adjust what Yana is allowed to do autonomously. |

Settings (providers, appearance/theme, language, account, integrations)
lives behind the **"•••"** menu in the header, not in the icon rail.

## An important distinction: your terminal vs. Yana's actions

Yana Desktop's Terminal section gives you a real, unrestricted shell —
anything **you** type there runs exactly like it would in any terminal
app, with no extra governance layer, because it's you driving it. When
**Yana** runs a command on your behalf (from Chat, for example), that
goes through a separate, governed execution path with its own logging
and permission checks. These two paths are intentionally kept separate:
Yana never gets to silently reuse your open terminal session to execute
something outside that governed path.

## Chat features

- **Attachments:** drag a file in, use the "+" menu, or paste a
  screenshot directly (Cmd/Ctrl+V) — an image attach requires a
  vision-capable model (Claude, Gemini, GPT-4o, and a few others; the
  composer tells you if the current model doesn't support it).
- **Multiple conversations:** the tab bar above the chat keeps several
  conversations open at once (up to 8) — attachments and drafts don't
  leak between tabs or when you switch projects.
- **Stop / retry:** the send button becomes a stop button mid-response;
  if a send fails (network, provider error), your typed message is
  restored to the composer instead of being silently lost.

## Where things are stored

Everything is local: account credentials, session data, and API keys
live under the app's own local data directory — nothing routes through a
Yana AI-operated server. See the main [README](../README.md) for the
full local-first/governance model this app is built on.
