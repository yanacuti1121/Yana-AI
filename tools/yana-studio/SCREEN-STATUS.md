# 17-screen implementation inventory

Source: user's Yana Desktop - Main Workspace.dc.html; inspected 2026-09-06.
Partial is NOT complete parity. No screenshots or sample counts count as runtime proof.

| Screen | Current Studio state | Remaining |
|---|---|---|
| 1 Main workspace | Real projects, chat, terminal grid | Worktree mutations, custom split tree |
| 2 Models/providers | Local/cloud single profile, discovery | Multiple profiles, direct model loading |
| 3 Devices | Not implemented | Runtime host profile and device registry |
| 4 Permissions | Chat approval presentation | Full canonical permission controls |
| 5 Runtime | Chat event presentation | Full event bus history/audit UI |
| 6 Agents | Not implemented | Canonical sessions and orchestration |
| 7 Git | Read-only status/diff | Review/mutations governed by runtime |
| 8 Tasks | Not implemented | Runtime task API integration |
| 9 Mobile | Not implemented | Pairing/authenticated remote channel |
| 10 Integrations | Google native OAuth, shared infrastructure | Real consent QA, other registrations/broker, resource APIs |
| 11 Sign in | Optional Google identity connection | Remote Yana session/email account service not implemented |
| 12 Palette | Navigation/actions | Global resource search |
| 13 Browser/design inspector | Not implemented | Isolated browser surface and context capture |
| 14 Remote/tools | Not implemented | SSH/Docker execution contracts |
| 15 Settings | Models/runtime and Connections sections | Appearance, locale, backup, updates |
| 16 Projects/files | Real folder selection, text editor/save | Attachments/import/full explorer interactions |
| 17 Activity/commands | Per-chat event metadata | Persistent history and complete command reference |

OAuth acceptance remaining: real account authorization, client registration for
GitHub/Slack/Notion, hosted broker where needed, signed packaged macOS test and
Windows/Linux native-store tests. Existing OAuth tests use local fixtures and an
encryption test double, not live Keychain consent or a production identity server.
