# Program J — Universal Capability Runtime

**Status:** `Draft` — Phase 0-9 xong 2026-07-24 (Input → Implementation
Plan; xem section tương ứng cho chi tiết từng phase). Kiến trúc chốt: MCP
Server (`yana-rt mcp`, dùng SDK `rmcp` bản stable `2.2.0`) thay thế hoàn
toàn translator-per-engine cho cả 5 client, gọi `check_command()` trực
tiếp, giữ nguyên fail-closed + cơ chế chặn bắt buộc Claude Code, cài đặt
zero-config qua `plugin.json`. ADR: `docs/adr/ADR-010-...md`. L1 memory:
`fact-20260724-233122`. **Phase 5 Readiness: 70% → vẫn BLOCK theo ADS v1**
(cần ≥80%) — Roadmap (Phase 9) chia 5 giai đoạn Research→Prototype→Alpha→
Beta→Stable. **Giai đoạn Research xong 2026-07-25** — config file MCP
của cả 4 client còn lại đã xác nhận (Cursor/Gemini dùng chung schema
JSON với Claude Code, Codex dùng TOML riêng). anh Tâm cho phép vượt cổng
Readiness làm 1 spike nhỏ (Prototype) — xem tiến độ ở "Roadmap" bên dưới.
**Nguồn:** anh Tâm's tóm tắt trực tiếp 2 video tham khảo (InsForge,
"Tại sao cần MCP trong khi đã có API?", 2026-07-23) + `docs/VISION-2.4.md`
(2026-07-24, cho 3 câu trả lời dưới đây) + anh Tâm trực tiếp trong hội
thoại 2026-07-24 (Input bổ sung).
**Template:** ADS v1 Phase 1 (19 trường).

> Ranh giới rõ: mục nào ghi **"Nguồn gốc"** là nguyên văn/paraphrase sát
> nguồn, KHÔNG sửa ý. Mục nào ghi **"Chưa quyết — cần anh"** là phần thật
> sự chưa có câu trả lời ở bất kỳ đâu, KHÔNG phải AI tự điền.

---

## Program Name

Program J — Universal Capability Runtime

## Vision

Nguồn gốc (video 2 — MCP vs API): thay hạ tầng kết nối Agent↔Dịch vụ từ
mô hình **M×N** (mỗi Agent tự hardcode kết nối tới mỗi dịch vụ, build-time)
sang mô hình **M+N** qua giao thức trung gian chuẩn hoá (MCP) — Agent
(MCP Client) và Dịch vụ (MCP Server) tách rời, agent tự khám phá công cụ
lúc runtime thay vì hardcode.

Nguồn gốc (video 1 — InsForge): mở rộng nguyên tắc đó xuống hạ tầng
backend — DB, auth/OAuth, file storage chuẩn hoá thành "tool" agent tự
dùng được (chỉ là NGUỒN CẢM HỨNG cho pattern — xem Non Goals, Yana AI
không tự làm phần backend provisioning này).

## Motivation

Nguồn gốc: 2 video cụ thể (InsForge — tool mã nguồn mở Apache 2.0 tự
động hoá backend; "Tại sao cần MCP" — MCP do Anthropic công bố cuối
2024, lớp trung gian chuẩn hoá Model↔API/Dịch vụ).

## Problem

Nguồn gốc (video 2): 2 vấn đề. (1) **Bùng nổ M×N** — 3 agent × 4 dịch vụ
= 12 kết nối bảo trì tay; thêm 1 agent → 16; API đổi version/xoay token
→ sửa code hàng loạt vị trí. (2) **Đóng cứng build-time** — công cụ
hardcode trong mã nguồn, agent chạy không tự nhận biết/kết nối công cụ
mới nếu không sửa code+build+deploy lại.

**Áp dụng cho Yana AI** (từ `VISION-2.4.md`'s nguyên tắc #2 "một
capability, nhiều AI cùng dùng — không khoá vào Claude/Cursor/Gemini" +
mục "Adapter tầng AI"): vấn đề M×N thật của Yana AI KHÔNG phải kết nối
tới dịch vụ ngoài (Slack/Jira/Postgres như ví dụ chung trong video) — mà
là mỗi capability/skill/hook mới của Yana AI phải nối tay riêng vào từng
adapter AI (Claude/Cursor/Gemini/Codex = M = 4), thay vì 1 lần expose
dùng chung cho cả 4.

## Goals

Nguồn gốc: tách rời Agent/Dịch vụ, dynamic discovery lúc runtime, giảm
M×N xuống M+N, chuẩn hoá capability thành tool.

## Non Goals

**Trả lời từ `VISION-2.4.md`** (không tìm thấy InsForge-style backend
provisioning ở đâu trong 30-capability roadmap gốc; sứ mệnh Yana AI
xuyên suốt session này là AI-agent-safety tooling, không phải backend-
as-a-service): **Yana AI KHÔNG tự triển khai lớp provisioning DB/auth/
storage kiểu InsForge cho dự án khác.** InsForge chỉ là nguồn cảm hứng
cho pattern "chuẩn hoá capability thành tool agent tự dùng được" — pattern
đó áp dụng cho capability CỦA CHÍNH Yana AI (skill/hook/command), không
mở rộng thành một sản phẩm backend-provisioning riêng.

## Scope

**Trả lời từ `VISION-2.4.md`** (mục 2, "Adapter tầng AI"): N = capability/
skill/hook hiện có của Yana AI (`core/skills/`, `core/hooks/`,
`core/commands/`), M = 4 AI tool đã nêu tên rõ trong roadmap
(Claude/Cursor/Gemini/Codex), tương ứng trực tiếp với `core/adapters/`
đã tồn tại trong repo. Không mở rộng sang dịch vụ ngoài (GitHub/Linear/
Slack) trong phạm vi Program J này.

**Cập nhật 2026-07-24 — anh Tâm xác nhận trực tiếp** ("program J đi, gộp
vào cho gọn", trả lời Open Question 2 bên dưới): **M = 5**, thêm
`yana-ai chat` (chế độ `--provider ollama`, local model) làm client thứ
5, cùng hạng với Claude/Cursor/Gemini/Codex. Khác với 4 client kia —
vốn là editor/CLI BÊN NGOÀI mà Yana AI viết adapter để nối vào — client
thứ 5 này là **binary Yana AI tự sở hữu** (`yana-rt chat`), nên khả năng
nối vào Capability Engine có thể trực tiếp hơn (gọi hàm Rust nội bộ)
thay vì qua translator script kiểu `core/adapters/cursor/`. Đây là nhận
định sơ bộ, KHÔNG phải quyết định kiến trúc — Phase 3 (còn bị chặn bởi
Open Question kiến trúc cũ: MCP Server thay thế hay mở rộng pattern
translator-per-engine) mới là nơi vẽ chi tiết chuyện này.

## Architecture

**Trả lời từ `VISION-2.4.md`** (nguyên tắc #2 + "Capability Registry +
Dynamic Discovery — agent hỏi 'what can I do?' thay vì hardcode if/else
theo provider"): Yana AI đóng vai **MCP Server** — expose capability của
chính mình (registry) cho nhiều AI client (Claude/Cursor/Gemini/Codex,
đóng vai MCP Client) cùng dùng chung, thay vì mỗi AI tool có adapter
code hardcode riêng. Đây là hướng kiến trúc cấp cao, CHƯA phải bản vẽ
chi tiết (module/interface cụ thể) — cần Phase 3 riêng để vẽ đầy đủ.

_(Câu hỏi "Yana AI có cần đóng thêm vai MCP Client để tiêu thụ MCP server
khác không, hay thuần Server" — vẫn CHƯA trả lời, không nằm trong scope
2 câu Open Question đã chốt. Không suy diễn ở đây; Phase 3 dưới đây giả
định Yana AI thuần Server, vì đó là hướng duy nhất có bằng chứng cụ thể
(4 client hiện có đều là consumer, không phải server khác cần tiêu thụ).
Nếu giả định này sai, phần dưới cần sửa lại.)_

## Phase 3 — Sơ đồ kiến trúc (2026-07-24, "sơ đồ luồng, không code" theo ADS v1)

**Đọc code thật trước khi vẽ** (không đoán): `src/guard/mod.rs`'s
`check_command(command: &str) -> Option<&'static str>` (dòng 691) là hàm
thuần — không I/O, không side-effect, chính là logic phán đoán "lệnh này
có nguy hiểm không" mà `core/hooks/guard-destructive.sh` (bash) và
`cmd_destructive()` (Rust CLI wrapper, gọi qua `dispatch()`) đều dựa vào.
Comment ngay tại hàm đó đã tự nói rõ ý định: *"Extracted out of
cmd_destructive() so it can be called once per MCP candidate... this is
the whole point of the design"* — tức là hạ tầng MCP-ready đã được chuẩn
bị sẵn một phần, dù chưa có MCP Server nào thật sự gọi tới.

**Ràng buộc phải giữ nguyên khi thay translator bằng MCP Server** (rút ra
từ đọc `core/adapters/cursor/before-shell-execution.js` trực tiếp, không
suy diễn): fail-closed ở MỌI lớp (input không đọc được → deny, timeout →
deny, JSON không hợp lệ → deny, status lạ → deny, không bao giờ đoán là
an toàn), đồng bộ/có giới hạn thời gian (hiện tại 15s qua `spawnSync`),
và `guard-destructive.sh`/`src/guard/mod.rs` vẫn là NGUỒN PHÁN ĐOÁN DUY
NHẤT — MCP Server chỉ là lớp giao thức/vận chuyển mới, không được tự
thêm logic phán đoán riêng.

**Vấn đề implementation cụ thể đã phát hiện, chưa có ở Phase 1/2** (ghi
lại vì ảnh hưởng trực tiếp Phase 9 Implementation Plan sau này): `dispatch()`
(dòng 99) gọi `std::process::exit(code)` trực tiếp — thiết kế cho CLI
one-shot, KHÔNG gọi được nguyên trạng từ một MCP Server chạy dài hạn (gọi
vào sẽ giết luôn cả process server). Điểm nối đúng là `check_command()`
(hiện đang `fn` riêng tư, cần đổi `pub fn`), không phải `dispatch()` hay
`cmd_destructive()`.

**Sơ đồ luồng 1 — Real-time hook enforcement** (thay thế translator-per-engine,
VD lệnh `rm -rf` từ Cursor/Codex/Gemini/`yana-ai chat`):

```
Client (Cursor / Gemini / Codex / yana-ai chat --provider ollama)
        │  muốn chạy 1 lệnh shell
        ▼
MCP tool call: tools/call "check_command" { command: "..." }
        │
        ▼
Yana AI MCP Server (mode mới của binary yana-rt sẵn có,
                     VD `yana-rt mcp-server` — chưa quyết tên,
                     không phải service tách rời)
        │  gọi TRỰC TIẾP trong process, không shell-out
        ▼
src/guard/mod.rs::check_command(&command) -> Option<&'static str>
        │  (giống hệt logic guard-destructive.sh bash — 2 bản đã kiểm
        │   chứng đồng bộ qua các đợt review trước, không viết lại)
        ▼
MCP Server bọc kết quả thành MCP tool result
        │  None → { permission: "allow" }
        │  Some(reason) → { permission: "deny", reason }
        ▼
Client nhận quyết định, thực thi hoặc chặn
```

**Sơ đồ luồng 2 — Capability discovery** (cái MCP thêm mới, translator
cũ không làm được): client hỏi "Yana AI có công cụ gì" thay vì mỗi
engine tự hardcode danh sách.

```
Client → MCP "tools/list" (chuẩn giao thức MCP, không phải API riêng)
        │
        ▼
Yana AI MCP Server → đọc registry từ core/skills/, core/hooks/,
                      core/commands/ lúc runtime (không hardcode)
        │
        ▼
Trả về danh sách tool/capability động — thêm 1 skill/hook mới vào
core/ = tự động xuất hiện cho MỌI client, không cần sửa code adapter
```

**Ranh giới scope — ĐÃ QUYẾT 2026-07-24:** anh Tâm trả lời "nếu chuyển
được thì cứ, không thì nếu vẫn hỗ trợ thì dùng như cũ là được" — ưu tiên
chuyển Claude Code qua MCP luôn nếu khả thi, không ép nếu không được.

**Đánh giá khả thi (đọc kỹ trước khi kết luận, vì đây là câu hỏi an toàn
thật, không chỉ kỹ thuật):** Claude Code's PreToolUse hook và MCP là 2
khái niệm khác nhau — hook là cơ chế CHẶN bắt buộc (Claude Code tự động
chạy trước MỌI lệnh Bash/Write/Edit, model không có quyền bỏ qua), còn
MCP tool là khả năng model TỰ CHỌN có gọi hay không. Nếu "chuyển qua MCP"
nghĩa là biến việc kiểm tra thành 1 MCP tool mà Claude tự quyết định có
gọi hay không — đó là RỤT LÙI an toàn thật sự (model có thể bị prompt
injection dụ bỏ qua bước gọi tool tự nguyện), đi ngược mục đích cốt lõi
của toàn bộ hệ hook đang có.

**Cách chuyển được mà KHÔNG rút lùi an toàn:** không đổi cơ chế chặn của
Claude Code (`.claude/settings.json`'s PreToolUse vẫn bắt buộc chạy y
hệt hiện tại, model không biết/không can thiệp được) — chỉ đổi NỘI DUNG
BÊN TRONG hook script đang chạy: từ gọi thẳng `core/hooks/guard-destructive.sh`
sang gọi MCP Server mới (client thin-bridge, cùng pattern với
`core/adapters/cursor/before-shell-execution.js`, chỉ khác là caller là
Claude Code's hook runner thay vì Cursor). Cơ chế "bắt buộc, model không
biết" giữ nguyên 100%; chỉ có nguồn phán đoán được hợp nhất qua MCP Server
chung với 4 client kia. **Kết luận: chuyển được, không cần giữ bản cũ.**

Vậy Claude Code CŨNG nằm trong scope thay thế — không còn ngoại lệ. Sửa
Modules table bên dưới cho khớp.

## Modules

Rút ra trực tiếp từ 2 sơ đồ trên (không phải danh sách đầy đủ — Phase 4
Workflow mới vẽ pipeline chi tiết):

| Module | Vai trò | Đã có hay mới |
|---|---|---|
| MCP Server (mode mới trong `yana-rt`) | Nhận MCP request, gọi guard logic, trả kết quả | **Mới** |
| `src/guard/mod.rs::check_command()` | Logic phán đoán lệnh nguy hiểm | **Đã có**, cần đổi `pub` |
| Capability Registry reader | Đọc `core/skills/`/`core/hooks/`/`core/commands/` lúc runtime | **Mới** |
| `core/adapters/cursor/before-shell-execution.js` | Translator cũ | **Sẽ bị thay thế** (không xoá ngay — xem Deliverables/Roadmap sau) |
| `.claude/settings.json` PreToolUse/PostToolUse (cơ chế chặn) | Cơ chế chặn bắt buộc của Claude Code | **Không đổi** — vẫn bắt buộc, model không biết/can thiệp được |
| Hook script Claude Code gọi (nội dung bên trong) | Hiện gọi thẳng `guard-destructive.sh` | **Sẽ đổi** — gọi MCP Server thay vì gọi thẳng, cùng pattern client-mỏng như Cursor |

## Interfaces (2026-07-24)

**Nguồn:** MCP spec chính thức (`modelcontextprotocol.io/specification/2025-06-18/server/tools`,
fetch trực tiếp 2026-07-24, KHÔNG tự bịa format) — JSON-RPC 2.0. Schema
dưới đây map từ spec thật vào nhu cầu thật của `check_command`, không
phải interface tự nghĩ ra.

**Tool definition** (trả về trong `tools/list`):

```json
{
  "name": "check_command",
  "title": "Yana AI destructive-command guard",
  "description": "Checks whether a shell command is destructive (rm -rf, git push --force, git reset --hard, SQL DROP/TRUNCATE, disguised inline-script bypasses, etc.) before it runs. Single source of truth: src/guard/mod.rs::check_command(), identical logic to core/hooks/guard-destructive.sh.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "command": { "type": "string", "description": "The raw shell command about to be executed" }
    },
    "required": ["command"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "permission": { "type": "string", "enum": ["allow", "deny"] },
      "reason": { "type": "string", "description": "Present only when permission is deny" }
    },
    "required": ["permission"]
  }
}
```

**`tools/call` request** (client → MCP Server):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "check_command", "arguments": { "command": "rm -rf /important-data" } }
}
```

**`tools/call` response — allow** (`check_command()` trả `None`):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "{\"permission\":\"allow\"}" }],
    "structuredContent": { "permission": "allow" },
    "isError": false
  }
}
```

**`tools/call` response — deny** (`check_command()` trả `Some(reason)`):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "{\"permission\":\"deny\",\"reason\":\"Blocked: 'rm -rf' ...\"}" }],
    "structuredContent": { "permission": "deny", "reason": "Blocked: 'rm -rf' ..." },
    "isError": false
  }
}
```

**Ánh xạ fail-closed — điểm QUAN TRỌNG NHẤT của toàn bộ Interfaces này**
(không phải chi tiết phụ): MCP spec tự định nghĩa 2 kênh lỗi khác nhau —
*Protocol Error* (JSON-RPC `error` field, VD tool không tồn tại, tham số
sai) và *Tool Execution Error* (`isError: true` bên trong `result`, VD
lỗi logic nghiệp vụ). `guard-destructive.sh`/`check_command()` hiện tại
**không có khái niệm "lỗi" tách biệt với "deny"** — mọi trường hợp không
verify được (input không đọc được, JSON hỏng, timeout, status lạ) đều
là `deny`, không phải allow, không phải "lỗi trung tính". Khi chuyển
qua MCP, **cả 2 kênh lỗi của MCP (Protocol Error VÀ Tool Execution
Error) đều phải được hook script phía client hiểu là `deny`**, không có
ngoại lệ — nếu client code coi "có lỗi giao thức" khác với "coi như
allow luôn cho nhanh", đó chính là kiểu rút lùi an toàn mà `before-shell-execution.js`'s
toàn bộ thiết kế (đọc ở Phase 3) đang cố tránh. Đây là yêu cầu bắt buộc
cho Phase 9 Implementation, không phải gợi ý.

**`tools/list` response** (Capability Registry, ví dụ rút gọn — danh sách
thật sẽ dài hơn khi có thêm tool ngoài `check_command`):

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": { "tools": [ { "name": "check_command", "...": "..." } ] }
}
```

## Workflow (Phase 4 — pipeline chi tiết, 2026-07-24)

Mở rộng Sơ đồ luồng 1 (Phase 3) thành pipeline đầy đủ, có nhánh lỗi —
đúng tinh thần ADS v1 Phase 4 ("vẽ toàn bộ pipeline, có review/lỗi, không
chỉ happy path"):

```
1. KHỞI ĐỘNG
   yana-rt mcp-server khởi động (tên lệnh tạm, chưa chốt) — process nền,
   sống suốt phiên làm việc, KHÔNG spawn mới mỗi request (khác hẳn
   before-shell-execution.js's spawnSync mỗi lần gọi guard-destructive.sh)

2. CLIENT KẾT NỐI
   Cursor / Codex / Gemini / yana-ai chat / Claude Code's hook script
   → kết nối MCP Server 1 lần (không phải 1 lần/request)

3. CLIENT MUỐN CHẠY LỆNH
   → gửi tools/call "check_command" { command }
   → MCP Server gọi check_command(&command) TRỰC TIẾP trong process
     (không shell-out, không spawn con — khác before-shell-execution.js)

4. NHÁNH KẾT QUẢ
   a. check_command() trả None            → { permission: "allow" }
   b. check_command() trả Some(reason)    → { permission: "deny", reason }
   c. MCP Server tự lỗi (panic, timeout nội bộ, request quá khổ)
      → Protocol Error HOẶC isError:true — client BẮT BUỘC hiểu là deny
        (xem "Ánh xạ fail-closed" ở Interfaces, không phải tuỳ chọn)
   d. MCP Server không phản hồi kịp thời hạn phía client
      → client tự áp timeout riêng (giữ nguyên tinh thần "15s" của
        before-shell-execution.js, con số cụ thể chưa chốt — cần đo thật
        ở Phase 12 Benchmark, không đoán ở đây) → hết hạn = deny

5. CLIENT NHẬN QUYẾT ĐỊNH → thực thi lệnh hoặc chặn + hiện lý do cho
   người dùng (đúng yêu cầu MCP spec: "Prompt for user confirmation on
   sensitive operations")

6. AUDIT LOG (yêu cầu MCP spec: "Log tool usage for audit purposes",
   trùng khớp với `audit-hardening-policy.md` đã có) — MCP Server ghi
   mỗi lần gọi `check_command` vào audit chain hiện có, KHÔNG tạo hệ
   thống log riêng song song
```

**Chưa quyết, cần Phase 9 Implementation Plan hoặc anh Tâm quyết định
trước:**
- Tên lệnh CLI chính xác cho MCP Server mode (`yana-rt mcp-server`?
  `yana-rt serve`?) — chưa chốt, chỉ là placeholder ở trên
- Con số timeout cụ thể phía client khi gọi MCP Server (giữ 15s như cũ,
  hay đo lại vì giờ gọi in-process nhanh hơn nhiều so với spawn bash?)
- MCP Server chạy nền như thế nào trong phiên Claude Code/Cursor (tự
  khởi động lần đầu? cần lệnh cài đặt riêng như `npx yana-ai-install`?)

## Data Flow

Trùng với Workflow ở trên — Program J's pipeline chỉ có 1 luồng dữ liệu
chính (command string → phán đoán → permission decision), không có luồng
dữ liệu phụ nào khác đáng vẽ riêng ở mức Phase 4 này.

## Capability List (Phase 2 — Capability Inventory)

**Phát hiện thật trước khi liệt kê** (đọc trực tiếp
`core/adapters/cursor/before-shell-execution.js`, file DUY NHẤT hiện có
trong `core/adapters/`): pattern THẬT đang chạy không phải "MCP Server
expose registry" — mà là **mỗi AI engine có 1 translator mỏng riêng cho
từng loại hook, forward vào logic gốc dùng chung** (comment trong chính
file đó: "Windsurf/Kiro/OpenCode/Codex translators planned to follow this
same pattern"). Cách này ĐÃ giải một phần M×N (logic gốc — vd
`guard-destructive.sh` — chỉ sống ở 1 nơi), nhưng vẫn còn M×N ở cấp
"số loại hook × số engine" (mỗi hook type mới × mỗi engine mới = 1
translator mới cần viết tay).

**Câu hỏi kiến trúc — ĐÃ QUYẾT 2026-07-24:** anh Tâm chọn **Thay thế hoàn
toàn** (qua `AskUserQuestion`, giữa 2 lựa chọn: mở rộng thêm lớp — được
đề xuất vì rủi ro thấp hơn — vs thay thế hoàn toàn). MCP Server sẽ thay
thế pattern translator-per-engine hiện tại (`core/adapters/cursor/
before-shell-execution.js` và tương lai các translator khác), không giữ
song song 2 cơ chế.

**Rủi ro đã nêu trước khi anh quyết, ghi lại để không mất dấu (không phải
để phản đối quyết định — đây là quyết định của anh, không phải AI tự
suy diễn):** cơ chế enforce hook thời gian thực hiện tại (guard-destructive.sh
qua Cursor) đã chạy thật, đã proven; thay thế hoàn toàn nghĩa là phải
viết lại/re-validate toàn bộ đường enforce đó qua MCP. MCP vốn là mô hình
request/response — cần xác nhận rõ trong Phase 3 rằng nó đáp ứng được
yêu cầu chặn nhanh/không được lỗi của một `PreToolUse` hook trước khi
implement, không giả định suông. Đây là mục cần kiểm chứng cụ thể trong
Phase 3 Architecture, không phải lý do trì hoãn quyết định đã chốt.

**Mở khoá Phase 3 Architecture** cho toàn bộ Program J (bao gồm cả use
case `yana-ai chat` mới) — cả 2 câu hỏi kiến trúc từng chặn Phase 3 giờ
đã có câu trả lời.

Danh sách capability (nguồn: `VISION-2.4.md` mục 2, đã gộp sẵn):

| Name | Purpose | Input | Output | Dependency | Priority | Owner | Status |
|---|---|---|---|---|---|---|---|
| AI Adapter Layer | Dịch hook event của từng AI tool sang format chung, không hardcode logic riêng | Tool-native hook payload (vd Cursor's beforeShellExecution JSON) | Tool-native permission response | `core/hooks/*.sh` (logic gốc dùng chung) | _(TODO)_ | _(TODO)_ | **Có thật, hẹp** — 1/4+ engine (chỉ Cursor), 1 hook type (destructive-command). Client thứ 5 (`yana-ai chat`, xác nhận 2026-07-24, xem mục Scope) chưa có adapter — vì là binary Yana AI tự sở hữu, có thể không cần pattern translator-script như 4 client kia, nhưng đây là giả thuyết, chưa quyết ở Phase 3 |
| Prompt Translation Engine | Dịch Prompt AST sang format riêng từng AI | _(TODO — chưa rõ input cụ thể)_ | _(TODO)_ | _(TODO)_ | _(TODO)_ | _(TODO)_ | Chưa bắt đầu |
| Capability Engine (Registry + Dynamic Discovery) | Agent hỏi "có công cụ gì" thay vì hardcode if/else theo provider | _(TODO — phụ thuộc câu hỏi kiến trúc ở trên: MCP hay mở rộng translator)_ | _(TODO)_ | _(TODO)_ | _(TODO)_ | _(TODO)_ | Chưa bắt đầu — đây là phần lõi MCP-Server hướng đã chốt |
| Model Router | Định tuyến task theo độ khó (Simple→Haiku, Medium→Sonnet, Hard→Opus) | Task description | Model tier quyết định | _(TODO)_ | _(TODO)_ | _(TODO)_ | Chưa bắt đầu |
| Marketplace (lớp phân phối) | Phân phối capability đã đóng gói | _(TODO)_ | _(TODO)_ | Capability Engine (phải có trước) | _(TODO)_ | _(TODO)_ | Chưa bắt đầu — phụ thuộc Capability Engine |
| Extension SDK (lớp phân phối) | Cho phép bên thứ 3 viết thêm capability | _(TODO)_ | _(TODO)_ | Capability Engine (phải có trước) | _(TODO)_ | _(TODO)_ | Chưa bắt đầu — phụ thuộc Capability Engine |

Nhiều ô `_(TODO)_` — đúng theo ADS v1: Priority/Owner/Input/Output cụ thể
cần anh quyết định hoặc cần Phase 3 Architecture xong trước, không suy
diễn cho đủ bảng.

## Dependencies

Đã biết thật: `core/adapters/` (đối tượng cần refactor theo hướng MCP
Server), `core/config/mcp-whitelist.json` (cơ chế whitelist MCP server
đã tồn tại — quan hệ cụ thể với Program J vẫn là Open Question 4).

## Deliverables

_(TODO — theo ADS v1 Output cuối: PROGRAM_J.md hoàn chỉnh, ADR,
Architecture Diagram, Capability Matrix, Workflow Diagram, Implementation
Roadmap, Readiness Report, Risk Register, Benchmark Plan, Documentation
Plan — chưa cái nào có, đúng vì còn ở Phase 1)_

## Definition of Done

_(TODO — cần Capability List đầy đủ (Phase 2) + Architecture chi tiết
(Phase 3) trước)_

## Risks

Governance risk (nguồn gốc, suy ra trực tiếp): MCP mở rộng bề mặt tấn
công (dynamic tool discovery từ nguồn ngoài lúc runtime) — cần đối chiếu
với `agent-tool-poisoning-guard.md`, `core/config/mcp-whitelist.json` đã
có sẵn (chi tiết = Open Question 4).

## ADR

`docs/adr/ADR-010-mcp-server-replaces-translator-per-engine.md` — viết
2026-07-24, theo đúng template ADS v1 Phase 6 (Decision/Problem/
Alternatives/Tradeoffs/Reason/Consequence). Chưng cất lại nội dung
Phase 0-5 ở trên thành 1 ADR, không thêm quyết định mới nào không có
nguồn. Trạng thái: Draft — ADR này tự ghi rõ nó KHÔNG mở khoá Phase 10
(Readiness vẫn 70%, cần Phase 7 Research + Phase 8 Design Review trước).

## Research (Phase 7 — 2026-07-24)

**Nguồn:** fetch trực tiếp `github.com/modelcontextprotocol/rust-sdk` và
`code.claude.com/docs/en/mcp` (2026-07-24, không suy đoán). Tổng hợp bản
nháp qua local model (`qwen2.5-coder:14b`, chỉ giao việc rút gọn nguồn
đã có sẵn — khác 2 lần thử trước đó cùng ngày, KHÔNG bắt tự suy luận từ
đầu, và kết quả lần này đúng/dùng được), sau đó tự bổ sung chi tiết đầy
đủ dưới đây trước khi đưa vào doc chính thức.

**1. `rmcp` — SDK Rust chính thức của Anthropic cho MCP server**
(`cargo add rmcp --features server`). Đang phát triển tích cực (593
commit), hỗ trợ cả bản draft mới nhất lẫn `2025-11-25` stable. Định nghĩa
tool bằng macro khai báo, không phải viết tay JSON-RPC:

```rust
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct CheckCommandParams { command: String }

#[tool_router(server_handler)]
impl YanaGuard {
    #[tool(description = "Checks whether a shell command is destructive")]
    fn check_command(&self, Parameters(CheckCommandParams { command }): Parameters<CheckCommandParams>) -> String {
        // gọi src/guard/mod.rs::check_command() thật ở đây
    }
}
```

Hỗ trợ cả stdio mode và Streamable HTTP mode, cả 2 đều chạy dài hạn,
phục vụ nhiều client lặp lại — đúng nhu cầu Program J's Workflow (Phase
4) đã vẽ. **Ảnh hưởng Phase 9:** dùng `rmcp` thay vì tự viết JSON-RPC
tay — giảm hẳn rủi ro tự implement sai spec, đặc biệt phần map lỗi mà
Interfaces (Phase 1) đã nhấn mạnh là bắt buộc.

**2. Claude Code kết nối MCP server local qua `.mcp.json`** (project-scoped)
hoặc `~/.claude.json` (user-scoped): `{"mcpServers": {"<name>": {"command": "...", "args": [...], "env": {...}}}}`.
Với stdio transport cụ thể: `claude mcp add --transport stdio <name> -- <command> [args...]`.
Claude Code tự set `CLAUDE_PROJECT_DIR` trong environment của server con
— **trùng khớp 100% với convention đã dùng trong `before-shell-execution.js`**
(`process.env.CLAUDE_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR`, đọc
trực tiếp ở Phase 3) — không cần convention mới.

**3. Phát hiện quan trọng nhất, ảnh hưởng trực tiếp trải nghiệm cài đặt:**
Claude Code **plugin** (Yana AI đã ship dưới dạng plugin — có `plugin.json`,
`marketplace.json`) có thể khai báo `mcpServers` NGAY TRONG `plugin.json`,
dùng placeholder `${CLAUDE_PLUGIN_ROOT}` (tự resolve về thư mục cài plugin).
Server khai báo kiểu này **tự kết nối lúc session khởi động, không cần
user tự tay setup `.mcp.json`** — khớp thẳng với triết lý cài đặt hiện có
của Yana AI ("`npx yana-ai-install` wires the hooks (60 seconds)", README.md).
**Ảnh hưởng Phase 9:** không cần thêm bước cài đặt thủ công nào cho MCP
Server — chỉ cần thêm 1 entry `mcpServers` vào `plugin.json` hiện có.

**4. Gap đã đóng — 2026-07-25, fetch riêng từng client, không giả định
giống nhau:**

| Client | File config (project-scoped) | Format | Nguồn |
|---|---|---|---|
| Claude Code | `.mcp.json` (hoặc auto qua `plugin.json`'s `mcpServers`) | JSON, `mcpServers: {name: {command,args,env}}` | `code.claude.com/docs/en/mcp` |
| Cursor | `.cursor/mcp.json` | JSON, **cùng schema `mcpServers` y hệt Claude Code** | `cursor.com/docs/context/mcp` |
| Gemini CLI | `.gemini/settings.json` | JSON, **cùng schema `mcpServers` y hệt Claude Code** | `github.com/google-gemini/gemini-cli` docs |
| Codex CLI | `.codex/config.toml` | **TOML, khác hẳn** — `[mcp_servers.<name>]` table, không phải JSON | `learn.chatgpt.com/docs/extend/mcp` |

**Phát hiện quan trọng cho Phase 9:** 3/4 client (Cursor, Gemini, và
Claude Code khi không dùng auto-plugin) dùng **chung 1 schema JSON**
(`mcpServers: {name: {command, args, env}}`) — script cài đặt của Yana
AI có thể sinh gần như cùng 1 block cho cả 3, chỉ khác đường dẫn file.
Chỉ Codex cần nhánh riêng (TOML). Repo này đã có sẵn `.cursor/`, `.codex/`,
`.gemini/` (đều đang untracked, từ công việc trước đó session này) —
đúng vị trí cần ghi các file config này vào khi tới Phase 10.

## Design Review (Phase 8 — checklist 9 mục theo ADS v1, 2026-07-24)

| Mục | Đánh giá | Bằng chứng |
|---|---|---|
| Architecture | ✅ Ổn | 2 sơ đồ luồng (Phase 3) + Workflow pipeline (Phase 4), cả 2 đều grounded trên code thật, không suy diễn |
| Naming | ⚠️ Thiếu | Tên lệnh CLI cho MCP Server mode CHƯA chốt (`yana-rt mcp-server`? `yana-rt serve`?) — đã ghi rõ ở Workflow, chưa quyết ở đây |
| Dependency | ✅ Qua vetting, có lưu ý | `rmcp`: 17.1 triệu lượt tải, Apache-2.0 (khớp license Yana AI), cập nhật 23/07/2026 (hôm qua) — qua dễ dàng `dependency-vetting-law.md`'s 8 tiêu chí. **Lưu ý quan trọng:** bản mới nhất trên crates.io là `3.0.0-beta.1`, bản **stable** là `2.2.0` — Phase 9 nên pin `2.2.0`, không phải bản beta, cho một dependency của guard bảo mật |
| Duplicate | ✅ Không trùng | Thay thế translator-per-engine, không xây song song; tái dùng `check_command()` có sẵn, không viết lại logic phán đoán |
| Security | ✅ Mạnh nhất trong 9 mục | Ánh xạ fail-closed 2 kênh lỗi MCP (Interfaces), phân biệt rõ chặn-bắt-buộc vs tool-tự-nguyện cho Claude Code (ADR-010) |
| Maintainability | ✅ Ổn, 1 câu hỏi tương lai | Macro-based tool definition (`rmcp`) thay viết tay JSON-RPC — giảm bề mặt lỗi. Câu hỏi chưa cần trả lời ngay: `guard-destructive.sh` (bash) có nên deprecate sau khi MCP thay thế hoàn toàn translator không, hay giữ song song cho mục đích khác? Không quyết ở Phase 8 này |
| Performance | ✅ Có số liệu thật | Baseline đo trực tiếp 178-310ms/lần gọi (translator hiện tại); ước lượng có định hướng rằng in-process nhanh hơn ít nhất 1 bậc độ lớn — số thật của chính MCP Server chờ Phase 12 |
| Scalability | ✅ Ổn (đọc code trực tiếp, không suy đoán) | `check_command(command: &str) -> Option<&'static str>` — không state chia sẻ, không lock, không I/O — an toàn gọi đồng thời từ nhiều client cùng lúc, không cần đồng bộ hoá thêm |
| Governance | ✅ Ổn | `54-bft-consensus-law.md`'s dual-review sẽ áp dụng khi Phase 10 đụng `core/hooks/`/`core/adapters/`; đang tự áp dụng đúng quy trình D7/ADS v1 |

**Kết luận:** 7/9 Ready rõ ràng, 1 mục có lưu ý cần xử lý ở Phase 9 (pin
`rmcp` bản stable, không phải beta) chứ không phải chặn, 1 mục thiếu
thật (Naming — tên lệnh CLI). Không có mục nào Fail. Design Review
KHÔNG tự động nâng điểm Readiness Matrix (Phase 5) — đó là 2 gate khác
nhau; Readiness vẫn đứng ở 70%, cần đi thật qua Phase 9 mới biết rõ hơn.

## Roadmap (Phase 9 — Implementation Plan, 2026-07-24)

**Tên lệnh CLI — đề xuất, không phải suy diễn tuỳ tiện:** `yana-rt mcp`
(top-level command, flag phẳng — VD `--transport stdio`), theo đúng
pattern đã có của `Chat` (`src/main.rs` dòng 162, cũng flag phẳng, không
có nested action enum) — vì MCP Server, giống `chat`, là "chạy như 1
mode" chứ không phải CRUD resource kiểu `Task`/`Guard` (noun + action
enum). Đây là quyết định housekeeping/naming theo convention có sẵn,
không phải kiến trúc — không cần chờ anh Tâm duyệt riêng, nhưng ghi rõ
nguồn suy luận để không phải suy diễn mù.

**5 giai đoạn theo đúng khuôn ADS v1 (Research → Prototype → Alpha →
Beta → Stable):**

1. **Research** — ✅ xong 2026-07-25 (config file từng client đã xác
   nhận, xem bảng ở "Capability List"). Còn lại của giai đoạn này: spike
   nhỏ nối `rmcp` (pin `2.2.0` stable, không phải `3.0.0-beta.1` — Phase
   8 finding) với `check_command()` (đổi `pub`) qua 1 tool duy nhất
   (`check_command`), chạy thử stdio mode, KHÔNG thay bất kỳ client thật
   nào chưa.

2. **Prototype**: `yana-rt mcp --transport stdio` chạy được, expose đúng
   1 tool `check_command` theo schema đã định nghĩa ở Interfaces (Phase
   1). Test tay bằng 1 MCP client thật (VD `mcp-inspector` hoặc tương
   đương) — chưa nối vào Cursor/Claude Code thật. Xác nhận sống được cả
   2 nhánh lỗi (Protocol Error, `isError:true`) đều map đúng thành deny
   như Interfaces đã ghi — đây là điều kiện bắt buộc trước khi qua Alpha,
   không phải tuỳ chọn.

3. **Alpha**: thay 1 client duy nhất — Cursor (đã có translator để so
   sánh song song) — sang gọi `yana-rt mcp` thay vì
   `core/adapters/cursor/before-shell-execution.js`. Chạy song song có
   kiểm soát (feature-flag hoặc branch riêng), đo Benchmark thật (Phase
   12) so với baseline 178-310ms đã đo. Không tắt translator cũ cho tới
   khi số liệu thật xác nhận parity + nhanh hơn.

4. **Beta**: mở rộng sang các client còn lại theo Phase 3's Modules table
   — Claude Code's hook script (đổi nội dung bên trong, không đổi cơ chế
   chặn), Codex/Gemini (cần Research bước 1 xong trước), `yana-ai chat`
   (client thật đầu tiên chưa từng có translator, use case gốc khởi động
   toàn bộ Program J này). `core/config/mcp-whitelist.json` (đã tạo,
   chưa enforce — gap từ Open Question 1) cần có điểm wire enforcement
   thật ở giai đoạn này, không để tiếp tục là file mồ côi.

5. **Stable**: tất cả 5 client qua MCP Server. `core/adapters/cursor/
   before-shell-execution.js` và `guard-destructive.sh` (bash) — quyết
   định deprecate hay giữ (câu hỏi đã nêu ở Design Review's mục
   Maintainability, chưa trả lời) cần chốt ở giai đoạn này, không phải
   trước.

**Không nằm trong Implementation Plan này — thuộc Phase 10 trở đi:** code
thật, test thật, PR thật. Roadmap này chỉ chia giai đoạn, không phải bắt
đầu code.

---

## Readiness Matrix (Phase 5 — đánh giá 2026-07-24, sau khi Phase 1-4 xong)

**Lưu ý trước khi đọc bảng:** `ADS-v1.md` chỉ liệt kê tên 10 mục, không
định nghĩa rubric cụ thể cho từng mục — bảng dưới là đánh giá trung thực
theo cách hiểu hợp lý nhất của từng tên mục, có nêu bằng chứng, KHÔNG
phải chấm theo tiêu chuẩn chính thức đã có sẵn (vì tiêu chuẩn đó chưa
được viết ra). Mục nào cách hiểu không chắc, ghi rõ "cách hiểu chưa chắc"
thay vì chấm điểm giả vờ chắc chắn.

| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| Repository | ✅ Ready | Vị trí code rõ ràng: `src/guard/mod.rs` (đã có, cần đổi `pub`), `core/adapters/` (pattern cũ cần thay), module MCP Server mới sẽ nằm trong crate `yana-rt` sẵn có |
| Knowledge | ✅ Ready | MCP spec thật đã fetch trực tiếp (không suy đoán), code thật đã đọc (`check_command`, `before-shell-execution.js`), Phase 0-4 đều có nguồn gốc rõ |
| Notebook | ⚠️ Cách hiểu chưa chắc | Nếu "Notebook" nghĩa là nhật ký nghiên cứu/quyết định đang chạy cho Program này — chính file `PROGRAM-J-SKELETON.md` đang làm đúng vai trò đó (mọi quyết định đều có tag "Nguồn gốc"/ngày tháng). Nếu nghĩa khác (VD hệ thống Notebook riêng của Yana AI) — chưa xác nhận có tồn tại hay không, chưa grep kiểm tra |
| Memory | ✅ Ready (vừa fix) | Trước đánh giá này: KHÔNG có fact nào ở `memory/L1_atomic/` — vi phạm `memory-persistence-law.md`. Đã fix ngay: `fact-20260724-233122` ghi quyết định kiến trúc chính |
| Runtime | ✅ Ready | `yana-rt` là binary thật, đang chạy tốt (183 unit + 63 integration test pass, xác nhận lúc chuẩn bị PR #80 cùng session này), thêm 1 mode/subcommand mới là pattern quen thuộc của codebase |
| Governance | ✅ Ready | Đang tự áp dụng đúng quy trình D7/ADS v1; `54-bft-consensus-law.md`'s dual-review sẽ áp dụng khi code thật đụng `core/hooks/`/`core/adapters/` |
| Security | ✅ Ready | Mục được đầu tư kỹ nhất trong toàn bộ Phase 1-4: ánh xạ fail-closed cho 2 kênh lỗi MCP, phân biệt rõ "chặn bắt buộc" (Claude Code hook) vs "tool tự nguyện" (MCP thường), giữ nguyên `check_command()` làm nguồn phán đoán duy nhất |
| Benchmark | ⚠️ Partial (nâng từ Not ready, 2026-07-24) | **Đo thật, không phải đoán:** cơ chế translator hiện tại (`before-shell-execution.js` → spawn bash → `guard-destructive.sh`) = **178-310ms/lần gọi, trung bình ~220ms** (5 lần đo trực tiếp, `node` + `spawnSync`, lệnh benign `ls -la`). So với số đã có sẵn từ `BENCHMARK.md` (2026-07-23): Rust binary startup ~22-24ms, `yana-rt guard token-budget` dispatch (in-process nhưng có lock overhead) ~65ms. `check_command()` là hàm thuần, không lock, không I/O — hướng ước lượng mạnh là MCP Server in-process sẽ nhanh hơn translator hiện tại ít nhất một bậc độ lớn, nhưng **số thật của chính MCP Server chưa đo được vì chưa implement** — đây là giới hạn thật, không phải lười đo |
| Cost | ⚠️ Partial (nâng từ Not ready, 2026-07-24) | Thử giao cho 2 model local brainstorm cost factor trước khi tự viết — cả 2 đều fail (14B trả lời lạc đề/cắt cụt; 9.7B "thinking" chạy quá 120s rồi lỗi JSON rỗng, không phải do thiếu kiên nhẫn mà do output không hợp lệ). Tự viết bằng Claude thay vì ép model yếu ra kết quả giả. Yếu tố chi phí thật cần cân nhắc: (1) engineering time viết + review MCP Server module mới, (2) chi phí vận hành gần như 0 (chạy local trong `yana-rt` sẵn có, không gọi API ngoài), (3) rủi ro chi phí ẩn lớn nhất — nếu bước "map lỗi MCP thành deny" (Interfaces, đã ghi) làm sai, chi phí là an toàn bị suy yếu, không phải tiền — nên đây là hạng mục cần review kỹ hơn benchmark tiền bạc thông thường |
| Context | ⚠️ Cách hiểu chưa chắc | Nếu nghĩa là "phạm vi có đủ gọn để implement không phát sinh phức tạp" — có vẻ Ready (1 tool mới, tái dùng hàm thuần có sẵn, module boundary rõ). Nếu nghĩa khác (VD ngân sách context window lúc chạy) — chưa đánh giá |

**Điểm tổng (tự tính, không phải công thức chính thức, cập nhật sau khi
đo Benchmark + viết Cost, cùng ngày):** 5 Ready + 4 Partial/cách-hiểu-
chưa-chắc (tính 0.5) + 0 Not ready = 5 + 2 = 7/10 = **70%** (tăng từ 60%
lúc đánh giá lần đầu).

**Kết luận theo đúng luật ADS v1** ("Readiness < 80% → Block, chỉ được
Research/ADR/Design, không code"): **Program J vẫn CHƯA đủ điều kiện vào
Phase 10 Implementation** — 70% < 80%, dù đã cải thiện. Đây không phải
tin xấu — đúng thực tế hiện tại (mới xong Phase 1-4, chưa qua Phase 6
ADR/Phase 7 Research/Phase 8 Design Review), và đúng chức năng của
Readiness Matrix: chặn code chạy sớm khi số liệu thật của chính MCP
Server (chưa tồn tại) vẫn chưa đo được, thay vì đoán rồi implement sai
hướng. Cách nâng điểm thật sự tiếp theo: đi qua Phase 6-8 trước, không
phải cố "chấm cho đủ 80%".

## Input bổ sung — 2026-07-24 (trực tiếp từ anh Tâm, không phải suy diễn)

**Nguồn gốc:** anh Tâm, giữa hội thoại 2026-07-24, sau khi xác nhận
`yana-ai chat --provider ollama` đã chạy được thật (test trực tiếp,
model `qwen2.5-coder:14b`) nhưng chỉ là hội thoại thuần — không đọc
được file, không thấy repo (xem `src/chat/mod.rs`'s module doc, quyết
định phạm vi có chủ đích từ bản kế hoạch gốc `mellow-sleeping-jellyfish.md`
decision 4). Nguyên văn ý định: *"2 cái đó là ý định anh muốn từ trước,
nó giống Claude Code ấy, nó cũng có thể đọc được repo"* — chọn thẳng
hướng B (tự mở rộng `yana-ai chat`) khi được hỏi so với hướng A (dùng
`core/adapters/cursor/` đã có sẵn + Cursor trỏ vào Ollama, độ chắc chắn
thấp hơn vì không verify được Cursor Agent mode có support Ollama).

**Yêu cầu cụ thể:** `yana-ai chat` (hoặc một chế độ mới của nó) khi chạy
với `--provider ollama` cần có khả năng đọc (và có thể sau này là thao
tác) repo thật, giống Claude Code đang làm trong phiên này — không còn
là "hội thoại thuần" nữa.

**Câu hỏi phạm vi — ĐÃ QUYẾT 2026-07-24:** anh Tâm xác nhận trực tiếp
("program J đi, gộp vào cho gọn") — việc này nằm TRONG scope Program J,
chấp nhận mở rộng Scope thật sự (M = 5, không phải 4 như roadmap gốc
`VISION-2.4.md` nêu). Xem mục Scope ở trên cho nội dung đã cập nhật.
Đây là quyết định của anh Tâm, không phải AI tự suy diễn — ghi lại đúng
nguyên văn để có dấu vết.

**An toàn — đã xác định rõ trước khi bàn tới Phase 3 Architecture:** đây
KHÔNG phải một thay đổi nhỏ. Hiện tại `yana-ai chat` cố tình zero
tool-calling/zero execution — chính vì lý do đó mà nó nằm ngoài tầm với
của toàn bộ hệ hook bảo vệ (`.claude/settings.json`'s PreToolUse/
PostToolUse chỉ bắt được tool-call Claude Code tự làm, không thấy được
process độc lập). Cho nó đọc file/chạy lệnh thật nghĩa là nó cần bắt đầu
tuân theo TOÀN BỘ hàng rào repo này đã xây: `04-sandbox-isolation-law.md`,
`agent-excessive-agency-law.md` (min-permission, irreversible-action
gate), `agent-tool-poisoning-guard.md`, `execution-environment.md`'s
banned runtime functions. Không có ngoại lệ vì model chạy local — model
yếu hơn Claude không có nghĩa lệnh nó tạo ra kém nguy hiểm hơn.

## Open Questions

0 câu hỏi mở còn lại — cả 2 câu ban đầu đã được trả lời (xem "Đã trả lời"
bên dưới cho cả hai, kể cả 1 phát hiện mới giữa chừng làm đổi hình dạng
câu hỏi số 1).

**Đã trả lời (2026-07-24) — Open Question 1:** ~~Quan hệ với
`44-supply-chain-vetting.md`/`agent-tool-poisoning-guard.md` (MCP server
whitelist đã có ở `core/config/mcp-whitelist.json`) — Program J có mở
rộng cơ chế whitelist này, hay xây riêng?~~ → **Phát hiện giữa chừng: file
này KHÔNG hề tồn tại** trước 2026-07-24, dù 4 file rule/skill khác
(`agent-tool-poisoning-guard.md`, `owasp-llm-top10`, `agent-attack-surface`,
`deusdata--codebase-memory-mcp`) đều nhắc như đã có sẵn — cùng loại lỗi
với `yana-router` (rule mô tả hạ tầng chưa từng build). Câu hỏi "mở rộng
hay xây riêng" vì vậy không còn ý nghĩa như cũ; anh Tâm trả lời trực tiếp
("không có thì tạo") — đã tạo `core/config/mcp-whitelist.json` theo đúng
schema đã có sẵn trong `agent-tool-poisoning-guard.md` (policy
deny-by-default, 1 server khởi điểm: `ollama`, xác nhận thật đang chạy
session này). **Lưu ý quan trọng, chưa phải xong:** chưa có hook/script
nào đọc file này để enforce — file tồn tại nhưng chưa được wire vào bất
kỳ gate nào (đã grep `sovereign-interceptor.js` + `core/hooks/*.sh` xác
nhận). Việc wire enforcement là việc riêng, có thể là một phần của Phase
3 Architecture (MCP Server) hoặc một fix nhỏ độc lập — chưa quyết.

**Đã trả lời (2026-07-24) — Open Question cũ (yana-ai chat scope):** ~~`yana-ai chat` + Ollama local có thuộc
Scope Program J (M=5) hay Program/sub-goal riêng?~~ → Có, thuộc Program J,
M=5 (xem mục Scope). Câu hỏi kiến trúc gốc (MCP Server thay thế hay mở
rộng translator-per-engine) cũng đã được trả lời cùng ngày — Thay thế
hoàn toàn (xem "Capability List" phía trên) — nên Phase 3 Architecture
không còn bị chặn cho use case này nữa.
