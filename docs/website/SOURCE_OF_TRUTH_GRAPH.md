# Source of Truth Graph

Map mỗi subsystem/product → implementation thật → docs → lịch sử → trạng
thái hiện tại → sản phẩm liên quan → trang public. Markdown, không cần
graph DB — đúng yêu cầu anh. Đây là bảng tra cứu khi viết bất kỳ trang nào;
không lặp lại nội dung chi tiết đã có ở các file khác, chỉ trỏ tới.

---

### Governance
- **Implementation:** `src/runtime/authority.rs`, `receipt.rs`,
  `pending_approval.rs`; `src/capability/` (file_mutation.rs, config_write.rs)
- **Docs:** `docs/adr/ADR-014-unified-runtime-authority-hierarchy.md`,
  `docs/reference/architecture.md`
- **History:** §II YAMTAM v1.2.x (Scope Lock, Local Audit Log, E2E Safety)
  trong `docs/reference/history.md` — governance có mặt từ rất sớm, trước
  khi có Rust runtime
- **Current status:** LIVE (xem `PRODUCT_TRUTH_MATRIX.md` mục Capability/Governance)
- **Related product:** nền tảng cho mọi surface (Studio/Desktop/Terminal)
- **Public page:** `/governance`

### Runtime (yana-rt / TurnEngine)
- **Implementation:** `src/runtime/mod.rs`, `src/model/` (gateway.rs,
  provider.rs, catalog.rs, circuit_breaker.rs)
- **Docs:** `docs/adr/ADR-014...`, `Cargo.toml` (crate `yana-rt`)
- **History:** `docs/reference/history.md` §XIII "Capability Runtime
  experiments" — 6 bản thiết kế trước khi tới bản Rust hiện tại
  (`yana-local-capability-runtime-design-v1` → ... →
  `yana-program-j-capability-runtime-rust` → implementation thật)
- **Current status:** LIVE (core), provider-gateway-helpers UNWIRED một phần
- **Related product:** nền cho Studio, Desktop, Terminal, Web
- **Public page:** `/runtime`

### Yana OS (Program K)
- **Implementation:** rải trong `src/os/` (chưa audit chi tiết từng file
  lần này) — theo `docs/programs/PROGRAM-K-YANA-OS-SKELETON.md`: accounting
  + read-only aggregate doctor đã có code thật và review/benchmark
- **Docs:** `docs/programs/PROGRAM-K-YANA-OS-SKELETON.md`,
  `PROGRAM-K-PHASE-2-CAPABILITY-INVENTORY.md`, `PROGRAM-K-PHASES-3-15.md`
- **History:** tạo 2026-08-09, Phase 0 do anh Tâm trả lời trực tiếp
  ("Yana AI remains the product users interact with. Yana OS is the
  underlying platform that powers Yana AI" — quan hệ CHA-CON, không phải
  2 nhánh ngang hàng)
- **Current status:** IN DEVELOPMENT — accounting/doctor xong, Supervisor/
  scheduler/vault/managed-agent-auth/schema-migration/Windows-mutation/
  kernel-resource-control BLOCKED ở readiness 40–55%
- **Related product:** nền bên dưới Yana AI nói chung, không phải 1 nhánh
  ngang hàng Studio — **sửa lại taxonomy so với hypothesis ban đầu**
- **Public page:** `/os` — PHẢI mở đầu bằng banner "In development"

### Yana Studio
- **Implementation:** `tools/yana-studio/` — Electron 43 + React 19 + TS +
  Vite, `main: host/main.cjs`, real test suite (`node --test`, Playwright
  E2E qua `test:ui`), native `node-pty` cho terminal thật
- **Docs:** `tools/yana-studio/README.md` (tự nhận "Một app mới. Không
  phải bản đổi giao diện của Yana Desktop cũ")
- **History:** PR #323 "Wave 1 + Wave 2" (merged 2026-09-08, verify
  `gh pr view 323` — mọi CI check pass kể cả Hook Tests)
- **Current status:** v0.1.0, ACTIVE PRODUCT nhưng CÔNG KHAI NHẬN "đang xây
  nền làm việc thật trước" — không production-ready
- **Related product:** dùng Governance + Runtime bên dưới, không thay thế
- **Public page:** `/studio` — **chặn bởi thiếu ảnh chụp thật** (xem
  `MEDIA_INVENTORY.md`)

### Yana-AI-Chat_Teminal (repo riêng, mới xác định 2026-09-10)
- **Implementation:** repo GitHub riêng `yanacuti1121/Yana-AI-Chat_Teminal`
  — Rust + Ratatui, `src/app/` (interaction state), `src/domain/` (UI data
  models), `src/ui/` (adaptive rendering), `reference/` (legacy code "for
  study only")
- **Docs:** README riêng của repo đó (đọc trực tiếp qua `gh api`,
  2026-09-10) — tự nhận: *"This repository is currently a UI/UX incubator
  for the next Yana terminal experience. The current MVP uses mock data."*
  Cũng có `DESIGN.md`, `UI_ENGINES.md`, `NOTICE` trong repo đó (chưa đọc
  sâu — ngoài phạm vi 1 lượt audit)
- **History:** `docs/reference/history.md` §XII "Yana-AI-Chat_Terminal" —
  đây là điểm hội tụ của nhiều bản archive cũ ("14-UI-Engines",
  "Compose-ZeroMemory", "Visible-UI-Patch") — khớp đúng README hiện tại
  liệt "fourteen deliberately UI-facing engines"
- **Current status:** **ACTIVE COMPONENT / EXPERIMENTAL** (KHÔNG phải
  ACTIVE PRODUCT — tự nhận mock data, chưa nối vào `yana-rt` thật; KHÔNG
  phải ABANDONED — push gần nhất 2026-08-09, KHÔNG phải ABSORBED —
  functionality chưa được đưa ngược vào Yana-AI main)
- **Related product:** hướng thay thế/bổ sung Terminal interface trong
  tương lai — chưa phải sản phẩm dùng được hôm nay
- **Public page:** KHÔNG có trang riêng trong `/products` lúc này — nhắc ở
  `/roadmap` (nếu anh xác nhận muốn công khai hướng phát triển này) hoặc
  `/story` (tiếp nối lineage "14-UI-Engines")

### Yana-wheelbot / yana-robot
- **Implementation:** repo GitHub riêng `yanacuti1121/yana-wheelbot`
  (tạo 2026-08-23) — **chưa audit code bên trong** (ngoài phạm vi checkout
  hiện tại, cần clone/inspect riêng)
- **Bridge phía Yana-AI:** `tools/yana-web/robot.js` (503 dòng) — WebSocket
  + MCP-client handshake cho một "device" tổng quát, có test thật
  (`_test_robot.js`, verify handshake + MCP initialize/tools-list). **Quan
  trọng: `robot.js` KHÔNG chứa chuỗi "ESP32"/"xiaozhi"/"wheelbot" nào** —
  đây là bridge tổng quát cho MỌI thiết bị nói MCP, không có bằng chứng
  code-level nó đã được wire cụ thể tới firmware Wheelbot. Tài liệu
  `docs/mcp-protocol.md` được comment trong test nhắc tới **không tồn tại
  trong repo** — 1 gap tài liệu thật, không phải lỗi của em khi không tìm
  thấy.
- **Docs:** description repo GitHub, `docs/reference/history.md` §XV
- **History:** §XV "Robotics" — `yana-wheelbot` (nhánh vật lý) →
  `yana-robot` (đi xa hơn: ESP32-S3, ToF, motor/servo, AI/MCP) — lai với
  `xiaozhi-esp32` (MIT, external DNA)
- **Current status:** **PARTIAL AUDIT** — repo có thật, bridge phía Yana-AI
  có thật (generic), NHƯNG chưa xác nhận được bridge cụ thể tới Wheelbot
  hardware, chưa audit firmware/hardware maturity
- **Related product:** nhánh riêng, không phải Studio, không phải Governance
- **Public page:** `/wheelbot` — rút gọn Phase 1 theo `INFORMATION_ARCHITECTURE.md`

### MCP
- **Implementation:** `src/mcp.rs`, `src/capability/` (canonical
  read-only tools) — theo `YANA-DEEP-ARCHITECTURE.md` §49
- **Docs:** ADR-014 Interface Boundaries table
- **History:** Program J (Universal Capability Runtime) spike, chưa merge main
- **Current status:** EXPERIMENTAL/OPT-IN — Studio audit từ chối xây MCP
  config UI vì lý do này
- **Related product:** dùng bởi `robot.js` (bridge tổng quát) và Program J
- **Public page:** `/integrations/mcp` — nhãn "Experimental" ngay đầu

### Continuity Engine (mới nhắc 2026-09-10, chưa có code)
- **Implementation:** **KHÔNG TÌM THẤY** — grep toàn repo
  (`.rs`/`.md`/`.ts`/`.cjs`/`.js`) cho "Continuity Engine"/"ContinuityEngine"
  → 0 kết quả (2026-09-10)
- **Docs:** chỉ có trong tin nhắn anh gửi hôm nay — chưa có file thiết kế
  riêng trong repo
- **History:** mới — chưa có lineage
- **Current status:** **DEFERRED / Ý TƯỞNG, KHÔNG PHẢI CODE** — đúng lời
  anh: "đây hiện tại là FUTURE/IN DEVELOPMENT direction... Không được
  quảng cáo trên public website như shipped capability"
- **Related product:** Yana Studio (dự kiến), Continuity plane khái niệm
  đã có trong `YANA-DEEP-ARCHITECTURE.md` §68 (Missions/Tasks/Memory) —
  Continuity Engine là bước tiến xa hơn của plane đó, chưa xây
- **Public page:** KHÔNG có trang — nhắc ở `/roadmap` MỤC "Exploring" nếu
  anh muốn công khai, tuyệt đối không ở `/studio` như feature đã có

### yana-web (repo độc lập + `tools/yana-web`)
- **Implementation:** custom Node `http.createServer` (`server.js`, không
  dùng Express) + `serveStatic()` router phục vụ HTML tĩnh từ `desktop/`
  (build output) + `desktop-src/` (nguồn: React 18.3.1 + Vite 6.4.3, build
  qua `vite build --config desktop-src/vite.config.mjs`)
- **Docs:** `tools/yana-web/README.md`
- **History:** `docs/reference/history.md` §XIV — "yana-web predates the
  1.0 product release", xuất hiện trước khi rename YAMTAM→Yana hoàn tất
- **Current status:** LIVE — là "the web app" mà `tools/yana-desktop`
  README tự nhận "the web app IS the desktop app"
- **Related product:** nền của Yana AI Desktop (Electron wrapper quanh nó)
- **Public page:** không có trang riêng — nội dung của nó là cái đang hiện
  ra trong `/download` → Desktop app, và tham chiếu kỹ thuật cho quyết
  định framework (xem A-J summary, mục F)

---

## Ghi chú taxonomy — sửa 1 điểm so với hypothesis ban đầu

Hypothesis anh gửi đặt **Yana OS** ngang hàng Studio/Wheelbot trong nhóm
"PLATFORM". Theo chính lời anh Tâm trả lời Phase 0 của Program K
(`PROGRAM-K-YANA-OS-SKELETON.md`, nguyên văn, không phải AI suy diễn):
*"Yana AI remains the product users interact with. Yana OS is the
underlying platform that powers Yana AI."* — nghĩa là Yana OS không đứng
CÙNG CẤP với Studio (1 product/surface), mà đứng DƯỚI, cùng cấp với
Runtime/Governance (hạ tầng nền). Taxonomy PLATFORM trong hypothesis ban
đầu đã đúng vị trí này (Runtime/Governance/Yana OS/Continuity cùng nhóm
PLATFORM, tách khỏi PRODUCTS) — không cần sửa cấu trúc, chỉ cần khẳng định
lại bằng chính lời anh làm bằng chứng.
