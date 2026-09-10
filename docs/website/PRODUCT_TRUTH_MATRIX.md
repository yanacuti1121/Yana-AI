# Product Truth Matrix

**Nguồn:** chuẩn hoá từ `docs/YANA-DEEP-ARCHITECTURE.md` §91 (đã spot-verify
với source code thật) + `docs/YANA-ECOSYSTEM-MAP.md` §4-5. Không phải audit
mới — đây là bảng tra cứu nhanh để không ai (agent hay người) lỡ tay biến
`DEFERRED` thành "đã ship" khi viết copy web.

**Luật bắt buộc khi viết bất kỳ trang nào trong `/products`, `/studio`,
`/runtime`, `/governance`, `/os`, `/wheelbot`:** tra bảng này trước. Không
tìm thấy dòng tương ứng → không viết claim đó, hoặc quay lại audit trước.

**6 trạng thái dùng trong toàn bộ website** (định nghĩa của anh Tâm):
`LIVE` · `EXPERIMENTAL` · `IMPLEMENTED_BUT_UNWIRED` · `DEFERRED` ·
`HISTORICAL` · `UNKNOWN`.

---

## Runtime / TurnEngine

| Feature | Status | Bằng chứng |
|---|---|---|
| Unified Rust TurnEngine (typed turns, streaming, cancellation) | **LIVE** | `docs/adr/ADR-014`, `src/runtime/mod.rs` |
| Cancellation giữ lại partial output | **LIVE** | ADR-014 Decision section |
| Model/provider plane (local + cloud cùng authority model) | **LIVE** | `src/model/` (`provider.rs`, `catalog.rs`) |
| Provider gateway thống nhất (`ProviderQuota`/`ProviderStats`) | **IMPLEMENTED_BUT_UNWIRED** | Deep Architecture §9 — "chưa là live dispatch path cho mọi provider call" |
| Circuit breaker phân biệt 429/5xx vs 401/403 vs 4xx khác | **LIVE** (thiết kế), mức độ áp dụng đầy đủ **chưa audit hết** | Deep Architecture §10 |

## Capability / Governance

| Feature | Status | Bằng chứng |
|---|---|---|
| Canonical capability plane (Manifest lookup, risk, approval) | **LIVE** | Deep Architecture §4, §12 |
| `YanaAuthorityChain` | **LIVE** | grep thật: `src/runtime/authority.rs`, `receipt.rs`, `chat/tui/approval.rs`, `chat/headless.rs` (2026-09-10) |
| `file.write` capability (propose→diff→guard→approval→backup→atomic write→verify→evidence) | **LIVE** | `src/capability/file_mutation.rs` có thật; PR #319 có E2E cho approved/denied writes |
| TOCTOU re-diff trước khi approved mutation chạy | **LIVE** | Deep Architecture §15 |
| `config.write` (chỉ `core/config/`, chặn path escape/symlink, loại trừ `core-lock.json`) | **LIVE** | `src/capability/config_write.rs` có thật |
| Rename/delete/copy file mutation | **DEFERRED** | Deep Architecture §14 — "current first increment covers create/overwrite" |
| Destructive command guard (`rm -rf`, force push, `git reset --hard`...) | **LIVE**, nhưng **không phải shell parser đầy đủ** | `docs/reference/known-limitations.md` — có khe hẹp quote-splice |
| Hook fail-loud khi guard bị skip âm thầm | **LIVE** | PR #317 (merged 2026-09-07, verify trực tiếp qua `gh pr view`) |
| Enforcement mạnh đều nhau trên mọi harness (Claude Code/Codex/Cursor/Antigravity) | **KHÔNG ĐÚNG — đừng viết claim này** | Deep Architecture §21 — enforcement khác nhau theo host |
| Giám Thị root HALT authority | **LIVE** | ADR-014 Authority Order #1, README §Safety architecture |
| Merkle/hash-chain audit log | **LIVE** (tamper-detectable, KHÔNG phải tamper-proof) | Deep Architecture §29 — dùng đúng chữ, không nói quá |
| Independent-review-before-infra-write (BFT-style consensus) | **HISTORICAL — đã bị xoá khỏi doc kiến trúc, đừng dựng lại** | Deep Architecture §30 |

## Task / Continuity

| Feature | Status | Bằng chứng |
|---|---|---|
| Tasks với typed dependency graph (`blocks`/`related`/`parent-child`/`discovered-from`) | **LIVE** | `src/task.rs` có thật; readiness là derived state |
| Missions (mission → tasks → dependencies) | **LIVE** (mức độ trưởng thành **chưa audit sâu**) | Deep Architecture §34 |
| Memory L1 permanent / L2 session | **LIVE** | `core/memory/L1_atomic/`, `core/memory/L2_session/` |
| Project Memory (`.yana-ai/project-memory.md`) nối vào context mỗi turn | **LIVE** | grep thật: `tools/yana-studio/host/project-memory.cjs`, `main.cjs` (2026-09-10) |
| `ProjectWorkspace` filesystem service (tree/diff/symlink-safety) | **IMPLEMENTED_BUT_UNWIRED** | grep thật: `mod project_workspace;` có trong `src/main.rs` nhưng KHÔNG có trong `cli.rs`/`mcp.rs` (2026-09-10) — xác nhận 100% |
| `crate::workspace` (khái niệm workspace cũ, khác `ProjectWorkspace`) | **LIVE**, tồn tại song song, không trộn lẫn | `src/main.rs:39: mod workspace;` |

## Yana OS

| Feature | Status | Bằng chứng |
|---|---|---|
| Agent lifecycle/identity/autonomy/health/supervision/leases/quarantine/HALT (khái niệm) | **LIVE một phần, phần lớn DEFERRED** | `docs/programs/README.md` — Program K: "authoritative ownership fixed, canonical strict accounting + read-only aggregate doctor implemented/reviewed" nhưng "Supervisor, scheduler, vault, managed-agent authorization, schema migration, Windows mutation, kernel resource control BLOCKED ở readiness 40–55%" |
| Capability leases (scoped, không phải "auto accept all") | **LIVE** | Deep Architecture §42; lease lock cross-platform (Windows support mới thêm — CHANGELOG 2026-09-04) |

## Interfaces

| Feature | Status | Bằng chứng |
|---|---|---|
| Terminal — interactive approval cho mutating capability | **LIVE**, và là con đường DUY NHẤT có approval-continuation hiện nay | ADR-014 Interface Boundaries table |
| Electron Desktop — headless chat, KHÔNG có mutation capability | **LIVE** (nhưng giới hạn rõ) | ADR-014: "Headless executor exposes no capabilities" |
| Packaged Web — bundled `yana-rt`, required mode, fail loudly nếu thiếu runtime | **LIVE** | ADR-014 |
| Development/Legacy Web — JS provider gateway, có Giám Thị HALT check riêng | **LIVE**, nhưng là compatibility mode, KHÔNG bằng runtime chính | ADR-014, Deep Architecture §54 |
| Discord — plain chat, KHÔNG có host/tool capability | **LIVE**, giới hạn có chủ đích | ADR-014 |
| MCP — canonical capability/workspace, KHÔNG tự tạo approval | **EXPERIMENTAL/OPT-IN** | ADR-014; Deep Architecture §49: "Studio audit từ chối xây MCP config UI vì MCP work vẫn là unwired Program J spike" |

## Yana Studio

| Feature | Status | Bằng chứng |
|---|---|---|
| Workspace / Files / Editor (CodeMirror) / Git status (read-only) / Terminal PTY thật | **LIVE** | `tools/yana-studio/README.md` — "Những đường thao tác đã được triển khai" |
| Project Memory wiring vào chat context | **LIVE** | xem bảng Task/Continuity trên |
| Governance telemetry (tool-call count, approved/denied, context usage) | **LIVE** | PR #323 "Wave 1 + Wave 2 — composer, governance telemetry..." (merged, verify `gh pr view 323`) |
| Inline diff-comment review | **LIVE** | PR #323 cùng trên |
| ⌘P quick open, file attachments, terminal search/clickable links, activity timeline không giới hạn | **LIVE** | PR #323 |
| Scoped capability lease granting (Permissions surface) | **LIVE** | Deep Architecture §42 |
| Worktree-per-task, Kanban multi-agent orchestration | **DEFERRED** | Deep Architecture §62 — Studio Wave 3, chưa xây |
| Typed RPC layer, event-sourced replay, remote execution | **DEFERRED** | Deep Architecture §63 — Studio Wave 4, chưa xây |
| Design Canvas (từ m3e-canvas port) | **EXPERIMENTAL** | Đang port, chưa production-ready theo README riêng của Studio ("xây nền làm việc thật trước") |

## Yana-wheelbot / yana-robot

| Feature | Status | Bằng chứng |
|---|---|---|
| ESP32-S3 board/chassis/web controller tồn tại | **LIVE (repo riêng có thật)** | `gh repo view yanacuti1121/yana-wheelbot`, tạo 2026-08-23 |
| Mức độ hoàn thiện phần cứng/firmware | **UNKNOWN — chưa audit repo `yana-wheelbot` riêng** | Ngoài phạm vi audit lần này (repo khác `Yana-AI`) — cần audit riêng trước khi viết trang `/wheelbot` |
| ToF anti-fall, local safety không phụ thuộc cloud AI | **KHÔNG XÁC MINH ĐƯỢC qua Yana-AI repo** | Chỉ có trong lời kể (build-journey draft §18), chưa grep code thật của `yana-wheelbot` |
| Bridge WebSocket+MCP cho device tổng quát (`robot.js`) | **LIVE** | `tools/yana-web/robot.js` (503 dòng) + `_test_robot.js` — test thật, verify handshake + MCP initialize/tools-list |
| Bridge trên đã nối cụ thể tới firmware ESP32-S3 Wheelbot | **UNKNOWN** | `robot.js` không chứa chuỗi "ESP32"/"xiaozhi"/"wheelbot" — bridge tổng quát, chưa có bằng chứng wiring cụ thể |
| `docs/mcp-protocol.md` (file được code comment trong `_test_robot.js` nhắc tới) | **KHÔNG TỒN TẠI trong repo** | Gap tài liệu thật — không viết claim dựa trên file này |

## Terminal (thế hệ kế tiếp — repo riêng)

| Feature | Status | Bằng chứng |
|---|---|---|
| "Yana Terminal AI Workspace" (Ratatui UI, 14 UI engines) | **EXPERIMENTAL / ACTIVE COMPONENT** | README repo `Yana-AI-Chat_Teminal` (đọc trực tiếp 2026-09-10): "UI/UX incubator... MVP uses mock data" |
| Nối vào `yana-rt` thật (provider/runtime/safety guards) | **DEFERRED (theo README riêng của repo đó)** | "Provider adapters, model downloads, runtime management, safety guards... will be connected later through a small bridge" |
| Đây là "next Terminal experience" chính thức của Yana | **CHƯA XÁC NHẬN — cần anh quyết định product direction** | Chỉ là mô tả tự nhận trong README của 1 repo experiment, chưa phải quyết định chính thức trên README chính |

## Ý tưởng chưa có code (không viết như đã ship)

| Feature | Status | Bằng chứng |
|---|---|---|
| Continuity Engine (nhiều conversation → 1 dòng công việc liên tục) | **DEFERRED — 0 dòng code** | Grep toàn repo (`.rs`/`.md`/`.ts`/`.cjs`/`.js`) cho "Continuity Engine"/"ContinuityEngine" → không có kết quả (2026-09-10) |

## Distribution

| Feature | Status | Bằng chứng |
|---|---|---|
| `pip install yana-ai` + `yana-ai install` | **LIVE** | `pyproject.toml`, PyPI badge trong README |
| `cargo install yana-rt` | **LIVE** | `Cargo.toml`, crates.io badge trong README |
| npm distribution | **HISTORICAL — bỏ vĩnh viễn, đừng nhắc như 1 lựa chọn hiện tại** | `VERSIONING.md` — 3 lần thử đều 403, đóng 2026-08-01 |
| Yana AI Desktop (.dmg/.exe/.AppImage v1.4.8) | **LIVE** | Đang phát hành thật trên yana.vutam.link hôm nay |

---

## Cách dùng bảng này

Khi viết bất kỳ dòng copy nào cho website:
1. Tìm claim tương ứng trong bảng.
2. Nếu là `LIVE` → viết bình thường, kèm 1 chi tiết cụ thể (không chỉ tính từ).
3. Nếu là `IMPLEMENTED_BUT_UNWIRED`/`EXPERIMENTAL`/`DEFERRED` → phải nói rõ
   trạng thái đó trên trang, không im lặng bỏ qua.
4. Nếu là `HISTORICAL` → không đưa vào trang sản phẩm hiện tại; có thể xuất
   hiện ở `/story` như một bài học.
5. Nếu là `UNKNOWN` → KHÔNG viết claim, quay lại audit trước.
