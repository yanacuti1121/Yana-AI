# Yana AI trong IDE: bảng phủ sóng (số đo thật, 2026-10-14)

Số liệu trong các tài liệu kiến trúc (ECOSYSTEM-MAP, DEEP-ARCHITECTURE) đã cũ và lệch. Mọi số dưới đây do hai script đo trực tiếp trong repo,
chạy lại được bất cứ lúc nào:

    python3 -I tools/yana-ide/scripts/inventory.py .        # đếm thành phần
    python3 -I tools/yana-ide/scripts/ide-coverage.py .     # IDE gọi được nhóm lệnh yana-rt nào

## Nguyên tắc anh Tâm đã chốt

1. Yana AI là hệ nhiều phần nối với nhau. Nối vài phần thì IDE không "gọi được Yana AI". Phải phủ toàn bộ.
2. Các thành phần **mặc định chạy**, người dùng không phải tự bật. Một số thành phần cho phép **bật tắt trong Cài đặt**.
3. Agent và skill được **tích hợp sẵn**.
4. Không báo "xong" khi chưa phủ hết. "Xong" chỉ khi có màn hình thật, có test, và đã xem trong cửa sổ thật.

## Cách Yana AI thật sự nối với nhau (từ DEEP-ARCHITECTURE, đã đối chiếu mã)

    Người dùng > Giám Thị (HALT, chạy ngoài mọi phiên) > Yana control plane > yana-rt TurnEngine
                                                               > model plane  +  capability plane > môi trường thật

Hệ quả cho IDE (đã kiểm bằng mã, `src/chat/mod.rs` và `src/guard/mod.rs`):

- Chat trong IDE chạy bằng **yana-rt**, không phải Claude Code. Các hook trong `.claude/settings.json` chỉ bắn khi **Claude Code** tự gọi công cụ.
  Vì vậy lượt chat IDE **không chạy 47 hook đó**. Nó có phần bảo vệ riêng viết sẵn trong yana-rt (cổng lệnh nguy hiểm `check_command`, ngân sách token,
  blast radius, chống tự sửa lõi, chuỗi ủy quyền, duyệt từng hành động).
- Hook, rules, gates, scripts là **lớp adapter cho các harness ngoài** (Claude Code, Codex, Cursor, Antigravity). Trong IDE, lớp này có tác dụng khi
  người dùng chạy Claude Code hoặc Codex trong terminal của IDE, nên cần cài vào dự án.
- Vậy "mặc định chạy" nghĩa là hai việc: (a) các lớp bảo vệ gốc của yana-rt luôn bật và **hiện trạng thái thật** trong IDE; (b) lớp adapter được áp vào dự án
  một cách có đồng ý (xem Quyết định 1).

## Số đo thật

| Thành phần | Số thật | Ghi chú |
|---|---|---|
| Skill (thư mục có SKILL.md) | 2026 | `core/skills` |
| File agent | 103 | `core/agents` (gồm thư mục con) |
| Lệnh slash | 170 | `core/commands` |
| Luật | 71 | `core/rules` |
| Script | 136 | `core/scripts` |
| Cổng (gates) | 6 | `core/gates` |
| Script hook | 66 | `core/hooks` |
| Hook **đang nối** trong `.claude/settings.json` | 47 mục, 43 script khác nhau | PreToolUse 24, PostToolUse 12, Stop 5, UserPromptSubmit 3, SessionStart 2, PreCompact 1 |
| Script hook **chưa nối** | 23 | xem danh sách trong kết quả `inventory.py` |
| File Rust | 313 | `src` |
| Nhóm lệnh yana-rt | 38 | không tính `help` |
| Capability khai báo | 17 | `src/capability/registry_data*.rs` |
| Module guard native | 7 | blast_paths, blast_radius, entry_point_check, lock, portable, self_mod, token_budget |
| Bề mặt trong `tools/` | desktop 72 file, studio 3071, web, ide 151, pixel-bridge 4, airllm-bridge, finetune-vi, codexmate-vi-patch |

## Nhóm lệnh yana-rt: IDE đã gọi trực tiếp chưa (đo bằng mã)

**Đã gọi (14 trên 38):** task, config, cost, lease, authority, observability, hunt, ci, map, score, doctor, os, scan, chat.

**Chưa gọi (24):** eval, bus, memory, research, connector, plugin, trust, skill-quality, fix, guard, mission, route, spec, design, graph, vault, watch,
workspace, init, provenance, evidence, compact, capability, filescan.

**Ngoài yana-rt, chỉ có trong `bin/yana` (IDE không có gì):** `giamthi` (Giám Thị), `audit`, `policy`, `verify`, `monitor`, `snapshot`, `harness`, `install`,
`upgrade`, `report`, `su-gia`, `remote`, `mcp`, `rule`, `lint`, `stats`, `diff-report`.

## Các nhánh của hệ sinh thái và trạng thái trong IDE

| Nhánh | Thành phần chính | Trong IDE hiện giờ |
|---|---|---|
| Giám Thị | `core/scripts/giamthi-watch.sh`, `giamthi_service.py`, `.claude/state/GIAMTHI_HALT.lock`, hook `giamthi-halt-check.sh` | **Không có gì.** Trên máy này: `Supervisor: not installed`, có giám thị khác trỏ sang `/Users/vutam/Yana-AI` |
| Control plane | authority, lease, trust, vault, evidence, provenance | authority, lease có. trust, vault, evidence, provenance **chưa** |
| Runtime | TurnEngine, 17 capability, guard native, token budget | chat + duyệt có. Danh mục capability, trạng thái guard **chưa hiện** |
| Model plane | provider, failover, catalog | Models & Runtime có (41 nhà cung cấp trong catalog, đo từ `host/model-catalog.cjs`) |
| Execution | sandbox (`sandbox-exec.sh`), file mutation, config write | Ghi file có duyệt và xem trước. **Sandbox: chưa hiện, Docker máy này đang tắt, chưa có image** |
| Governance (adapter) | hook, gate, luật, scripts, core-lock, audit chain | **Không có** (không phát hiện, không cài, không kiểm) |
| Knowledge | 2026 skill, 103 agent, 170 lệnh, 71 luật | Chỉ có 2 agent mặc định của IDE. Skill, lệnh, luật **chưa tích hợp** |
| Memory / Evidence | memory, session_db, evidence, compact | Project Memory (ghi chú) có. memory, evidence, compact **chưa** |
| OS program | `src/os` 48 file: host, supervisor, remote, Discord | `os host` có. supervisor, remote, Discord **chưa** |
| Integrations | MCP client, LSP client, web search, connector, plugin | **Chưa** (cần xác nhận cấu hình bằng `trust`) |
| Spec / Mission / Route / Graph | spec, mission, route, graph, design | **Chưa** |

## Phân loại bật tắt (đề xuất, anh duyệt)

Cơ sở: `human-gate-policy`, `00-meta-rule-enforcer` (Tier 1 bảo mật không bị ghi đè), và quy tắc "authorization theo từng hành động".

- **Khóa, luôn chạy, hiện trạng thái nhưng không có công tắc tắt:** HALT của Giám Thị, chặn lệnh nguy hiểm, blast radius, chống tự sửa lõi, scope guard,
  chặn prompt injection, audit log, canary token, truth gate, supply chain guard, db-protect, deploy gate, api-destruct-guard, sandbox.
- **Mặc định bật, có công tắc trong Cài đặt:** ngân sách token và vòng lặp, circuit breaker, các cổng chất lượng (code quality, static analysis,
  test runner, coverage, dependency safety), nhắc kiểm thử file vào, chấm điểm tự tin và rủi ro, tự tách việc, nén ngữ cảnh, nhớ theo lượt, gọi nhớ khi hỏi.
- **Mặc định tắt, có công tắc:** 23 hook chưa nối (telemetry, rbac, permission auto approve, sbom, format on write...), Discord remote, web search, MCP, LSP,
  giám thị cấp hệ điều hành.

## Quyết định cần anh chốt

1. **Áp lớp adapter vào dự án.** Yana AI cài bằng `yana-ai install` (chép hook, skill, luật, script, cổng vào `.claude/` của dự án và nối `settings.json`).
   Đây là ghi hàng nghìn file vào dự án của anh. Đề xuất: lần đầu mở một thư mục git, hiện **một thông báo một nút** "Áp dụng Yana AI cho thư mục này",
   nhớ lựa chọn theo từng thư mục; có công tắc `yana.pack.apply` với ba giá trị `ask` (mặc định), `auto`, `off`. Anh muốn mặc định `auto` thì em đổi,
   nhưng `auto` sẽ ghi vào mọi thư mục git anh mở.
2. **Nguồn của gói.** Đề xuất: đóng gói sẵn trong app (đường dẫn cấu hình được `yana.pack.source`), không bắt người dùng cài PyPI riêng.
3. **Giám Thị cấp hệ điều hành** chạy ngoài IDE (LaunchAgent). Cài là thay đổi hệ thống, cần anh bấm đồng ý, không bao giờ tự cài.

## Phát hiện khi đo (cần anh biết)

1. **Sandbox có thể không tìm thấy script trong dự án đã cài Yana.** yana-rt tìm đúng `<dự án>/core/scripts/sandbox-exec.sh` (`src/capability/command.rs`).
   `yana-ai install` lại chép script vào `.claude/scripts/`, không phải `core/scripts/`. Với một dự án cài bằng `yana-ai install`, lệnh chạy từ chat sẽ không thấy
   script. Chưa thử chạy thật. Control Center đã báo đúng tình huống này ("Found only at .claude/scripts"). Sửa thế nào (yana-rt tìm cả hai chỗ, hay installer chép
   thêm) là việc em đề xuất làm tiếp, chưa làm.
2. **Chat trong IDE không chạy 47 hook** của `.claude/settings.json` (chúng chỉ bắn khi Claude Code làm việc). Chat IDE dùng phần bảo vệ viết sẵn trong yana-rt.
3. **23 trong 66 script hook chưa được nối** vào `settings.json`.
4. Trên máy này Docker đang tắt và chưa có image `yana-ai-sandbox`, nên sandbox đang ở chế độ `ulimit` (không cách ly file, không cách ly mạng).
5. Giám Thị của repo này chưa cài; có một giám thị khác đang trỏ sang `/Users/vutam/Yana-AI`.

## Tiến độ (cập nhật 2026-10-14)

- Bước 1 (Control Center, chỉ đọc): **đã viết và có test** (`tests/control-center.test.cjs` 41/41, gồm chạy thật trên repo này). **Chưa xem trong cửa sổ thật.**
- Bước 2 đến 6: chưa làm.

## Thứ tự làm (mỗi bước xong khi có màn hình, test và ảnh chụp cửa sổ thật)

1. **Yana Control Center, chỉ đọc:** trạng thái thật của Giám Thị, HALT, core-lock, chuỗi audit, hook đang nối và chưa nối, sandbox (Docker lên chưa, chế độ nào),
   guard native, capability, trust. Mỗi dòng đọc từ lệnh thật, không viết cứng. Phát hiện dự án đã áp Yana chưa.
2. **Bảng công tắc trong Cài đặt** theo phân loại trên (cần quyết định cách tắt từng hook: sửa `settings.json` hay biến môi trường, tùy từng hook).
3. **Áp lớp adapter** (Quyết định 1 và 2), có dry-run xem trước, duyệt, rồi kiểm lại bằng `verify-core-lock`, `verify_hooks.py`, `doctor`.
4. **Agent và skill tích hợp sẵn:** agent làm hồ sơ trợ lý có sẵn (chọn trong chat), skill có chỉ mục tìm kiếm và gọi bằng `/` đưa SKILL.md vào ngữ cảnh.
5. Từng nhóm lệnh còn thiếu (24 nhóm yana-rt và các lệnh `bin/yana`), theo mức anh dùng.
6. Sandbox: hiện trạng thái, hướng dẫn bật Docker và dựng image, thử chạy thật khi Docker lên.
