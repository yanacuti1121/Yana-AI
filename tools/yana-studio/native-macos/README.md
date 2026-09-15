# Yana Studio Native

Native macOS foundation for Yana Studio, built with SwiftUI for Apple Silicon.

## What it currently does

- Creates and unlocks a local profile stored only on the Mac.
- Opens and remembers local project folders.
- Browses project files, searches by path, edits safe UTF-8 text files, and saves atomically.
- Highlights common Swift, Rust, JavaScript, TypeScript, Python, JSON, and shell syntax in the editor.
- Scans safe interface source files for hex color tokens and opens their source in the editor; it skips hidden, symlinked, oversized, and sensitive-named files.
- Runs streaming Yana chat through a user-selected `yana-rt` binary, with conversation-specific sessions, cancellation, a ten-minute watchdog, copy, resend after editing a user prompt, and safe text-file attachments from the selected project.
- Supports Ollama discovery plus manual OpenAI, Anthropic, Gemini, and Custom runtime profiles. API keys are stored in Keychain; a Custom profile also validates and sends its Base URL.
- Shows Git status and read-only diffs, and opens a changed file directly in the editor. It does not stage, commit, or push.
- Keeps local quick tasks and can list, create, and complete Yana Runtime tasks. Runtime task completion requires user-entered evidence.
- Shows a read-only profile of the current Mac, including chip, memory, cores, uptime, workspace, and configured runtime path.
- Reads capability leases and pending approval requests from Yana Runtime. A human can explicitly allow or deny a pending request; the runtime records the decision and re-checks policy before it resumes the turn.
- Runs one-shot terminal commands and a basic persistent PTY shell in the selected project. Full-screen terminal programs still need a dedicated terminal renderer.
- Offers system, light, and dark appearances with an adjustable glass strength and a local readiness check for profile, project, runtime, and model.

## Not yet replaced

The Electron application remains the functional version for Google/GitHub OAuth,
full terminal emulation, connector integrations, and Git write operations.
Those features require either a larger native platform layer or external
OAuth/provider configuration; this package does not present them as working
when they are not.

## Run locally

```sh
cd /Users/vutam/Desktop/Yana-AI/tools/yana-studio/native-macos
swift run YanaStudioNative
```

## Validation

```sh
swift build
swift test
```

## Create a test app

```sh
zsh scripts/build-app.sh
```

It creates `release/Yana Studio Native.app` with an ad-hoc local signature.
It is an internal test app, not a notarized public release.

GitHub Actions runs the same build, unit-test, package, signature, and arm64
checks for native changes on pushes and pull requests, then stores the resulting
app as a test artifact.
