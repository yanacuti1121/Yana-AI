# Program L: Unified Plugins (plugin dùng chung cho mọi tầng và mọi chế độ)

**Status:** `Draft`. Phase 0 (Input) đã có từ lời anh Tâm. Phase 1
(Specification) mới điền phần có nguồn xác minh; các mục ghi
`Cần anh quyết` là Specification Required. Theo ADS v1 và README của thư
mục này: thiếu Specification thì Implementation = BLOCKED. Chưa có dòng
code nào cho Program này.

**Ngày tạo:** 2026-11-07. **Người yêu cầu:** anh Tâm. **Người soạn:** Claude,
chỉ ghi lại yêu cầu và hiện trạng đã kiểm, không tự suy diễn kiến trúc.

---

## Phase 0: Input

**1. Vision** (lời anh Tâm, 2026-11-07, nguyên văn): "chúng ta lên tích hợp
các tính năng như plugin của codex claude vào đây dùng cho tất cả mode".

**2. Problem Statement** (hiện trạng đã kiểm trong repo, không phải suy đoán):
Yana đang có ba thứ giống "plugin" nhưng tách rời, mỗi thứ một chỗ lưu,
một lệnh quản lý, và không tầng giao diện nào thấy được cả ba:

| Thứ đang có | Lưu ở đâu | Quản lý bằng | Ghi chú |
|---|---|---|---|
| MCP server | `.yana-ai/mcp-servers.json` | `yana-rt trust status/show/allow/revoke` | Phải xác nhận nội dung (gõ `yes` ở terminal) trước khi dùng |
| Connector | trạng thái cục bộ trong `.yana-ai/` | `yana-rt connector list/enable/disable/status/sync` | 8 loại (gmail, google-calendar, github, notion, google-drive, slack, figma, canva), quyền theo phạm vi |
| Skill | `core/skills/<tên>/SKILL.md` | thư mục; `yana-rt skill-quality` cho điểm tin cậy | 2.035 skill có `SKILL.md` trong repo chính |
| "Plugin hook" | `.yana-ai/plugins.json` | `yana-rt plugin list/add/remove/enable/disable/run` | Chỉ là script guard tuỳ chỉnh (`add <name> <script>`), không phải gói tính năng; hiện chưa đăng ký cái nào |
| Gói plugin của chính Yana | `plugin.json`, `marketplace.json` ở gốc repo | quy trình phát hành | Định dạng plugin của Claude Code, dùng để phân phối Yana, không phải để cài plugin vào Yana |

Hệ quả: app Swift, IDE và terminal không có chung một danh sách "đang cài gì,
được phép gì"; chữ "plugin" trong `yana-rt` đang mang nghĩa khác với
"plugin" mà anh muốn.

**3. Goals / Non-Goals / Out of Scope:** `Cần anh quyết`. Gợi ý để anh
chọn (chưa phải quyết định):
- Goal ứng viên: một danh sách plugin duy nhất trong `yana-rt`, mọi tầng
  (app Swift, IDE, terminal) đọc chung; cài/gỡ/bật/tắt ở một tầng thì tầng
  khác thấy ngay.
- Goal ứng viên: mọi hành động của plugin đi qua cổng duyệt hiện có
  (authority receipts, pending approvals), ở cả chế độ Làm việc và Kế hoạch.
- Non-Goal ứng viên: chợ plugin công khai, tải plugin tự động từ mạng.

**4. Motivation:** anh Tâm đã xem giao diện Plugin của Codex (ảnh chụp
`docs/Ảnh màn hình 2026-11-07 lúc 09.16.36.png`, 2026-11-07): danh mục
Phổ biến / Mới / Doanh nghiệp nhỏ, ô tìm kiếm, tab Công khai / Cá nhân,
danh sách "Đã cài đặt". Nhu cầu đi kèm: vibe coding trong app Yana cần
plugin dùng được ở mọi chế độ, không riêng một nơi.

---

## Phase 1: Specification (19 trường, ADS v1)

| Trường | Nội dung |
|---|---|
| Program Name | Program L: Unified Plugins (tên tạm, anh đổi được) |
| Vision | Xem Phase 0 mục 1 |
| Motivation | Xem Phase 0 mục 4 |
| Problem | Xem Phase 0 mục 2 |
| Goals | `Cần anh quyết` |
| Non Goals | `Cần anh quyết` |
| Scope | `Cần anh quyết`: "tất cả mode" là ba tầng (app Swift, IDE, terminal), hay hai chế độ Làm việc / Kế hoạch, hay cả hai? |
| Architecture | Chưa vẽ. Ràng buộc đã biết: quyết định quyền nằm trong `yana-rt` (tầng giao diện chỉ hiển thị và chuyển câu trả lời của người dùng), giống Tool approvals hiện nay |
| Modules | Chưa xác định |
| Interfaces | Đã có sẵn để nối vào: `yana-rt chat --headless` (NDJSON, `awaiting_approval`, `--resume-approval`), `yana-rt authority receipts/executions/pending-approvals --json`, `yana-rt connector list --json`, `yana-rt trust status` |
| Workflow | Chưa vẽ |
| Data Flow | Chưa vẽ |
| Capability List | `Cần anh quyết`: plugin gồm những gì (MCP server, skill, connector, lệnh, hook, giao diện con?) |
| Dependencies | Program J (Universal Capability Runtime): MCP server trong `yana-rt`, đang ở Phase 10 phạm vi hẹp. Program L nên xây trên J, không làm runtime thứ hai |
| Deliverables | `Cần anh quyết` |
| Definition of Done | `Cần anh quyết` |
| Risks | Đã thấy: (1) plugin chạy mã của bên thứ ba, nên phải qua `trust` và quét chuỗi cung ứng (`44-supply-chain-vetting.md`); (2) trùng tên "plugin" với `yana-rt plugin` hiện có (guard script), cần đổi tên một trong hai; (3) sửa lõi `yana-rt`, theo luật 54 phải có hai người review trước khi ghi |
| ADR | Chưa có. ADR đầu tiên cần trả lời: gộp ba nguồn (MCP, connector, skill) vào một sổ đăng ký, hay giữ riêng và chỉ thêm lớp xem chung |
| Roadmap | Chưa lập. Theo ADS v1 chỉ lập ở Phase 9 |

---

## Câu hỏi mở cho anh Tâm (cần trả lời trước Phase 2)

1. "Tất cả mode" nghĩa là ba tầng giao diện, hai chế độ Làm việc / Kế hoạch, hay cả hai?
2. Một plugin gồm những gì: chỉ MCP server, hay gồm cả skill, connector, lệnh, hook?
3. Plugin lấy từ đâu: chỉ cài tay từ tệp/thư mục cục bộ, hay có danh mục (như Codex) để chọn?
   **Đã trả lời (anh Tâm, 2026-11-07):** có một trang chợ plugin, kiểu trang tải ứng dụng như ảnh Codex
   anh gửi. Bước đầu đã làm trong app Swift (`PluginStorePage.swift`) chỉ với nguồn có thật: cài/gỡ
   connector qua `yana-rt connector enable/disable`, trạng thái MCP qua `yana-rt trust status`, số skill.
   Danh mục plugin của bên thứ ba vẫn chờ các câu còn lại.
   **Bổ sung (anh Tâm, 2026-11-07):** chợ gồm cả plugin của Claude, của Codex và "một số bên em kiếm
   thêm". Nguồn ứng viên, **chưa truy cập, chưa xác minh**, phải qua Phase 7 Research trước khi chọn:
   - Định dạng marketplace plugin của Claude Code (`marketplace.json` + `plugin.json`). Repo Yana đã
     có hai tệp này ở gốc, nên định dạng là quen, nhưng chưa kiểm danh mục công khai nào.
   - Danh mục ứng dụng/plugin của Codex (ảnh `docs/Ảnh màn hình 2026-11-07 lúc 09.16.36.png`).
     Chưa biết họ có công bố định dạng hay API cho bên ngoài đọc không.
   - Danh bạ MCP server công khai (registry chính thức của MCP và các danh bạ cộng đồng).
     Chưa xác minh địa chỉ, giấy phép, cách kiểm tính toàn vẹn.

**Yêu cầu bổ sung (anh Tâm, 2026-11-07): "plugin bên ngoài mình phải dùng api cập nhật liên tục thì
mới đc".** Danh mục plugin bên ngoài lấy trực tiếp qua API của từng nguồn và luôn mới, không đóng gói
một danh sách cố định trong app. Hệ quả cần thiết kế ở Phase 3/4 (chưa quyết): tần suất làm mới và
bộ nhớ đệm khi mất mạng; nguồn nào có API công khai thật (Phase 7 phải xác minh); kiểm tính toàn vẹn
cho từng gói tải về; và mọi truy vấn ra mạng đi qua luật egress (`network-egress-law.md`,
`53-network-egress-whitelist-law.md`: chỉ https, danh sách host được phép).

**Yêu cầu bổ sung (anh Tâm, 2026-11-07): "AI nào cũng có thể sử dụng".** Plugin cài một lần phải
dùng được với mọi model và mọi nhà cung cấp (Claude, OpenAI, Gemini, model chạy trên máy...), đúng
triết lý của Yana là "thân thể", không phải "bộ não". Hệ quả thiết kế: plugin phải gắn vào
`yana-rt` (tầng công cụ chung, như MCP trong Program J), không gắn vào định dạng riêng của một hãng
AI. Câu 1 bên dưới vì thế đã có một nửa lời đáp: mọi AI; còn "mọi tầng/mọi chế độ" vẫn chờ.
4. Có cho plugin tự chạy mà không hỏi (kiểu "lease" có hạn), hay mọi lệnh đều phải duyệt?
5. Chữ `plugin` hiện dùng cho guard script trong `yana-rt plugin`: đổi tên lệnh cũ, hay đặt tên khác cho khái niệm mới?

## Readiness (Phase 5, ước tính sơ bộ)

Dưới 80%: Goals, Scope, Capability List và Architecture còn trống. Theo
ADS v1, Program này đang **Block**: chỉ được Research, ADR, Design; không code.
