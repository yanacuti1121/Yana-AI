# Information Architecture — Yana Ecosystem Website

**Nguồn:** IA đề xuất của anh Tâm (brief 2026-09-10) — **đã đối chiếu với
audit thật** (`ECOSYSTEM_AUDIT.md`, `PRODUCT_TRUTH_MATRIX.md`) theo đúng
yêu cầu của anh: *"Audit reality before finalizing this taxonomy. Do not
invent a product merely because a subsystem exists."*

Kết luận: IA gốc anh đề xuất **đúng hướng ~90%** — chỉ có 3 điều chỉnh dựa
trên thực tế repo, ghi rõ bên dưới. Không tự đổi cấu trúc lớn.

---

## 3 điều chỉnh so với brief gốc, và vì sao

### 1. `/wheelbot` — giảm độ sâu, không xây "hardware page" đầy đủ ngay

Brief đề xuất `/wheelbot` với 12 mục con (hardware, ESP32-S3, mobility,
servos, display, ToF, control interface, BOM, firmware, 3D printing, build
guide, status). **Audit thật:** `yana-wheelbot` là **repo riêng**, KHÔNG
nằm trong Yana-AI monorepo — em chưa audit code/hardware của nó (ngoài
phạm vi audit lần này). Theo `PRODUCT_TRUTH_MATRIX.md`, mọi chi tiết
hardware (ToF safety, firmware, BOM) hiện là **UNKNOWN** từ góc nhìn repo
Yana-AI.

**Đề xuất:** `/wheelbot` Phase 1 chỉ gồm: Hero + "What is Wheelbot?" +
"Yana connection" (điều DUY NHẤT audit thật xác nhận được: nó là robotics
platform ESP32-S3 lai với `xiaozhi-esp32`, semantic command từ Yana) + CTA
"Explore on GitHub" trỏ thẳng repo `yana-wheelbot`. Các mục sâu hơn
(hardware diagram, BOM, build guide, current status) đợi audit riêng repo
đó — **không viết trước khi có bằng chứng**, đúng luật "UNKNOWN → không
viết claim."

### 2. `/os` (Yana OS) — trình bày như "đang xây", không như 1 sản phẩm hoàn chỉnh

Brief đề xuất `/os` với overview/lifecycle/autonomy/health/supervision đầy
đủ. **Audit thật** (`docs/programs/README.md`): Program K (Yana OS) —
"Supervisor, scheduler, vault, managed-agent authorization, schema
migration, Windows mutation, kernel resource control còn BLOCKED ở
readiness 40–55%." Chỉ 1 phần nhỏ (accounting + read-only aggregate
doctor) đã xong.

**Đề xuất:** giữ `/os` làm trang riêng (đúng ý anh — Yana OS là nhánh có
thật), nhưng mở đầu bằng banner trạng thái rõ ràng ("Early / In progress")
trước khi đi vào concept — không để trang đọc như 1 sản phẩm đã hoàn
thiện. Nội dung tập trung vào **ý tưởng kiến trúc** (agent lifecycle thay
vì shell syntax — Deep Architecture §40) hơn là liệt kê feature, vì phần
lớn feature thật sự chưa xong.

### 3. `/integrations/mcp` — tách mức "opt-in/experimental" rõ so với 4 harness khác

Brief liệt MCP cùng cấp với Claude Code/Codex/Cursor/Antigravity trong
Integrations dropdown. **Audit thật:** MCP là `EXPERIMENTAL/LIMITED`
(`PRODUCT_TRUTH_MATRIX.md`) — "Studio audit từ chối xây MCP config UI vì
MCP work vẫn là unwired Program J spike."

**Đề xuất:** giữ MCP trong dropdown Integrations (đúng vị trí ecosystem),
nhưng trang `/integrations/mcp` phải mở đầu bằng nhãn "Experimental /
opt-in" — không viết với cùng độ chắc chắn như trang Claude Code.

### 4. `Yana-AI-Chat_Teminal` — đã xác định (2026-09-10), vẫn KHÔNG vào `/products`

Đọc trực tiếp README repo đó qua `gh api`: đây là "UI/UX incubator" thật,
đang active (push 2026-08-09), nhưng **tự nhận MVP dùng mock data, chưa
nối `yana-rt` thật**. Phân loại: **ACTIVE COMPONENT / EXPERIMENTAL** (chi
tiết ở `SOURCE_OF_TRUTH_GRAPH.md`), không phải HISTORICAL/ABANDONED —
nhưng cũng chưa phải sản phẩm dùng được. Đúng luật "không quảng cáo
experimental như production": **không có trang riêng trong `/products`**.
Có thể nhắc ở `/roadmap` (mục "Exploring") nếu anh xác nhận muốn công
khai hướng phát triển Terminal thế hệ kế tiếp — **đây là quyết định
product direction, cần anh chọn, không phải sự thật kỹ thuật em tự suy
ra được.**

### Continuity Engine — không xuất hiện ở đâu trong `/studio` hiện tại

Ý tưởng mới anh nhắc (nhiều conversation → 1 dòng công việc liên tục qua
Project Memory/Decisions/Open Loops/Retrieval/Provenance/Context
Composer) — grep toàn repo cho thấy **0 dòng code**. Chỉ có thể xuất hiện
ở `/roadmap` mục "Exploring", tuyệt đối không ở trang `/studio` như 1
feature đã có — đúng yêu cầu trực tiếp của anh.

---

## IA cuối cùng (đã điều chỉnh)

```
/
├── /products                      — danh sách tất cả nhánh, dẫn vào từng trang
│
├── /studio                        — Yana Studio (product page đầy đủ nhất, có real UI)
│   ├── overview
│   ├── features (workspace/files/terminal/models/context/governance-telemetry/permissions/project-memory/tasks/git/activity)
│   ├── governance (cách Studio hiển thị governance, không phải tự tạo governance riêng)
│   ├── downloads
│   └── install
│
├── /runtime                       — yana-rt, TurnEngine
│   ├── overview
│   ├── architecture (TurnEngine/RuntimeEvent/provider plane/capabilities/approval/cancellation)
│   ├── capabilities
│   ├── providers (local+cloud catalog — sinh động, không hardcode số)
│   └── install (cargo install yana-rt)
│
├── /governance                    — tại sao Yana khác về cấu trúc
│   ├── overview (Intelligence != Authority)
│   ├── authority (Giám Thị, Yana control plane, Manifest lookup)
│   ├── capabilities (file.write/config.write lifecycle — animation ứng viên mạnh nhất)
│   ├── approvals
│   ├── audit (Merkle/hash-chain — đúng chữ "tamper-detectable", KHÔNG "tamper-proof")
│   └── halt
│
├── /os                            — Yana OS — MỞ ĐẦU BẰNG BANNER "IN PROGRESS"
│   ├── overview (agent lifecycle, không phải OS thay macOS/Linux/Windows)
│   ├── lifecycle
│   ├── autonomy
│   └── health-supervision (gộp 2 mục, vì nội dung thật còn mỏng)
│
├── /wheelbot                      — RÚT GỌN Phase 1 (xem điều chỉnh #1)
│   ├── overview
│   ├── yana-connection
│   └── repository (CTA ra GitHub, không tự viết chi tiết hardware chưa audit)
│
├── /integrations
│   ├── overview
│   ├── claude-code
│   ├── codex
│   ├── cursor
│   ├── antigravity
│   ├── discord
│   └── mcp                        — nhãn "Experimental/opt-in" ngay đầu trang
│
├── /developers
│   ├── quickstart
│   ├── architecture (trỏ tới docs/reference/architecture.md + ADR-014, không viết lại)
│   ├── cli
│   ├── python                     — pip install yana-ai
│   ├── rust                       — cargo install yana-rt
│   ├── providers
│   └── contributing
│
├── /docs                          — doc site thật (left-nav/TOC/search), không phải 1 trang dài
├── /download                      — nguồn từ GitHub Releases thật, không hardcode
├── /releases
├── /changelog
├── /roadmap                       — Shipped/In progress/Exploring/Deferred, không gán ngày giả
├── /story                         — origin story (nguồn: YANA-BUILD-JOURNEY-DRAFT.md, sau khi anh duyệt)
│   └── /story/lessons             — "green build, broken package" và các bài học khác
├── /principles
├── /security
└── /about
```

## Route hiện tại → route mới (mapping tối thiểu để không mất SEO/link cũ)

| Route cũ | Route mới | Ghi chú |
|---|---|---|
| `yana.vutam.link/` (mọi thứ dồn 1 trang) | `yana.vutam.link/` (trang chủ ecosystem MỚI) + `/studio` (Desktop app content cũ dời sang đây, đổi tên rõ) | Trang chủ cũ sẽ chuyển thành nội dung của `/studio` hoặc `/download`, không xoá — chi tiết ở `ROUTE_MAP.md` |
| `yana.vutam.link/desktop.html` | 301 redirect → `/download` hoặc `/studio` | Cần quyết định cụ thể — xem `ROUTE_MAP.md` mục "cần anh quyết" |

## Điều KHÔNG làm (đúng luật Absolute Rule #1/#2 của anh)

- Không tạo trang `/wheelbot/hardware`, `/wheelbot/build-guide` cho đến khi
  audit repo `yana-wheelbot`.
- Không tạo dropdown/trang riêng cho `Yana-AI-Chat_Teminal` (UNKNOWN).
- Không thêm mục nav nào không map được về 1 dòng trong
  `PRODUCT_TRUTH_MATRIX.md`.

Xem tiếp: `ROUTE_MAP.md` (URL cụ thể + redirect), `CONTENT_STRATEGY.md`
(nội dung từng trang), `IMPLEMENTATION_PLAN.md` (thứ tự làm).
