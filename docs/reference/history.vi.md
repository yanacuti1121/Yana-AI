# Lịch sử dự án — từ template Claude đến hệ sinh thái Yana

Gia phả của mọi phiên bản/trạng thái mà dự án này từng trải qua: xuất phát điểm từ Claude Code, thời kỳ "YAMTAM Engine", việc reset về đánh số kiểu sản phẩm `v0.x`, đổi tên thành Yana AI, và các nhánh mọc ra từ đó (`yana-rt`, `yana-web`, Desktop, `yana-robot`).

## Tình trạng kiểm chứng — đọc phần này trước

Tài liệu này được tổng hợp từ tên phiên bản và ghi chú phát hành đã lưu trữ, không phải dựng lại từng dòng từ `git log`. Trước khi đưa vào đây, các claim cốt lõi đã được đối chiếu với lịch sử commit/tag thật của repo:

- **Xác nhận đúng.** "YAMTAM" là tên cũ có thật của dự án — tìm thấy nguyên văn trong commit message thật (`docs: clarify YAMTAM scaffold roadmap status`, `feat: import YAMTAM runtime assets`). Cấu trúc tổng thể — YAMTAM Engine `v1.x` → reset về đánh số kiểu sản phẩm `v0.x` → đổi tên thành Yana AI — khớp với thứ tự tag thật trong repo.
- **Đã sửa: tốc độ thật nhanh hơn nhiều so với văn phong gợi ý.** Phần I–VI bên dưới đọc như một hành trình nhiều tuần/tháng. Nhưng dấu thời gian tag thật cho thấy toàn bộ chặng — từ commit đầu tiên đến khi reset về `v0.x` — gói gọn trong khoảng **13 ngày** (17/05 đến 30/05/2026). Nên coi mỗi "thời kỳ" là 1 chu kỳ lặp cực nhanh (nhiều khả năng có AI hỗ trợ), không phải 1 hành trình chậm rãi, cân nhắc kỹ.
- **Lệch ngày nhỏ.** Commit thật của tag `v1.0.0` ghi ngày 26/07 (giờ Nhật), không phải 27/07 như ghi bên dưới — lệch 1 ngày, nhiều khả năng do múi giờ.
- **Chưa kiểm chứng độc lập.** Chi tiết tính năng của `v1.3.0`–`v1.3.11`, `v1.3.40`–`v1.3.53`, và sản phẩm `v0.6`–`v0.13` — chính tài liệu gốc cũng chỉ xác nhận các phiên bản này *tồn tại*, chưa xác nhận được *chúng làm gì*. Nên đọc các dòng đó là "phiên bản này có tồn tại", không phải "phiên bản này chắc chắn làm đúng như mô tả".
- **Nằm ngoài git history của repo này.** Các nhánh `yana-web`, Chat Terminal, thử nghiệm capability-runtime, và robotics (Phần XII–XV) nằm ở repo/artifact riêng — `git log` của repo này không xác nhận hay bác bỏ được.

## I. Tiền YAMTAM — nhánh Claude Code

| Phiên bản | Làm gì / thay đổi chính |
|---|---|
| Claude Development Template | Nền móng ban đầu: agents, hooks, rules, MCP, PRD/project workflow. |
| GitNexus integration | Bổ sung code intelligence/context; trở thành một phần quan trọng của nhánh tiền YAMTAM. |
| claude-code v3.0 | Debug discipline, workflow/guard ban đầu; khoảng 69 files. |
| v4.0 | Automation layer: Context Synthesizer, BRAIN_DUMP, Auto-QA. |
| v5.0 | Chuyển mạnh sang spec-driven development: spec planner → executor → verifier; thêm context monitoring. |
| v6.0 | Tool-attention layer; quản lý việc dùng MCP/tool và chi phí context kiểu MCP Tax. |
| v7.0 | Persistent memory; thêm các coding guideline/engineering rules. |
| v8.0 | Memory architecture phát triển thành hệ thống nhiều tầng. |
| v9.0 | Quality-control agent layer: prompt-firewall, token-guard, tool-router, config-doctor, agent-gardener… |
| v9 GitNexus variants | Các snapshot tích hợp/audit GitNexus; có `gitnexus-v9`, `v9-real` và agent pack riêng. |
| v10.0 | Reliability thay vì chỉ tăng agent: `/resume`, `/route`, `/verify-pack`, memory router, session checkpoint, audit/fix. |
| `gitnexus-v10-audited` | Snapshot v10 đã audit; trở thành nền trực tiếp cho YAMTAM ENGINE v1.0. |
| `claude-code-v1.2-enhanced` | Nhánh nằm giữa Claude-era/YAMTAM-era; cần đào sâu hơn mới gán feature cụ thể. |

**Điểm chuyển giao:** `claude-code-v10.0` → `YAMTAM_ENGINE_v1.0_school-stable_from-gitnexus-v10-audited`. Hai artifact có cùng kích thước/snapshot lineage, đánh dấu đây gần như là điểm đổi identity từ Claude Code sang YAMTAM ENGINE.

## II. YAMTAM Genesis — v1.0 → v1.2.9

| Phiên bản | Chức năng |
|---|---|
| YAMTAM ENGINE v1.0 | Đóng gói hệ Claude/GitNexus thành YAMTAM ENGINE. |
| v1.1 | Giai đoạn phát triển tiếp architecture; archive còn cả `v1.0_v1.1_plans`. |
| v1.2 | Bắt đầu hình thành safety/control system rõ ràng hơn thay vì đơn thuần agent pack. |
| v1.2.1 | Truthful Cost Guard — kiểm soát/hiển thị cost đáng tin cậy. |
| v1.2.2 | Budget Mode Switch — chuyển chế độ theo ngân sách. |
| v1.2.3 | Scope Lock — giới hạn phạm vi AI được phép thay đổi. |
| v1.2.4 | Local Audit Log — lưu dấu vết hoạt động cục bộ. |
| v1.2.5 | E2E Safety — safety cho quy trình end-to-end. |
| v1.2.6 | Handoff Mode — bàn giao context/work giữa phiên/agent. |
| v1.2.7 | Replit Incident Defense / Production Protection — chống thao tác nguy hiểm lên production. |
| v1.2.8 | PocketOS Incident Defense / API Destruction Guard — mở rộng bảo vệ API/destructive operations. |
| v1.2.8-fixed | Sửa/hardening bản 1.2.8. |
| v1.2.9 | Hoàn thiện đợt safety trước standalone transition. |
| v1.2.9-fixed | Hook Test Suite + Release QA, bản cuối giai đoạn này; tài liệu cũ ghi test 13/13 pass. |

Tài liệu handover cũ còn ghi chính chuỗi `1.2.1 → 1.2.9-fixed` này và cảnh báo rằng internal `v10`/`v11`/`v12` là một hệ đánh số khác (`JNMT_YAMTAM_HANDOVER_ALL_IN_ONE_v2.md`).

## III. YAMTAM tách thành standalone engine

Đây không hẳn SemVer release mà là các trạng thái kiến trúc:

| State | Làm gì |
|---|---|
| repo-scaffold | Tách YAMTAM khỏi `.claude/` của project cũ thành repository/engine riêng. |
| scaffold update #1 | Làm rõ roadmap và trạng thái standalone. |
| scaffold update #2 | Agent OS gates, prompts, behavior examples. |
| scaffold metadata | Hoàn thiện metadata/changelog. |
| `yamtam-engine-main` snapshots | Các snapshot liên tục của standalone engine; nhiều bản cùng tên nhưng kích thước khác nhau. |

Đây là lúc cấu trúc kiểu `core/ gates/ prompts/ docs/ releases/` bắt đầu quan trọng hơn cấu trúc `.claude/` cũ.

## IV. YAMTAM v1.3.x — giai đoạn bùng nổ

Đây là thời kỳ khó nhất vì version chạy cực nhanh và một SemVer có thể có nhiều rebuild.

| Version | Chức năng / sự kiện tìm được |
|---|---|
| 1.3.0-fixed | Early standalone stabilization. |
| 1.3.1 | Iteration sau standalone. |
| 1.3.2–1.3.10 | Chuỗi fixed/stabilization rất nhanh; chưa đủ bằng chứng để gán chính xác từng feature. |
| 1.3.11-fixed | Có ít nhất nhiều build/rebuild cùng version; không nên coi là một artifact duy nhất. |
| 1.3.12 | Superpowers integration. |
| 1.3.13 | TDD workflow. |
| 1.3.14 | Checkpoint + Handoff. |
| 1.3.15-clean | Clean distribution/build. |
| 1.3.16 | Claude Code Harness. |
| 1.3.16-fixed | Fix cho Harness release. |
| 1.3.17 | Command Suite; agent count tăng mạnh, khoảng 19 → 42. |
| 1.3.18 | Import lượng lớn agent/skill; khoảng 42 → 83 agents. |
| 1.3.19 | Command import/expansion. |
| 1.3.20 | YAMTAM-native governance. |
| 1.3.21 | Conflict Resolution. |
| 1.3.22 | Skill + hook review/hardening. |
| 1.3.23-clean | Clean build. |
| 1.3.23-fixed | Fixed build. |
| 1.3.24 | Claude Forge. |
| 1.3.25-clean | Clean distribution. |
| 1.3.25 rebuild | Rebuild cùng SemVer. |
| 1.3.26 | Continued expansion. |
| 1.3.26-fixed | Fixed artifact — một trong những bản archive cứu lại được. |
| 1.3.27 | Continued engine development. |
| 1.3.27-fixed | Fixed artifact được tìm lại. |
| 1.3.28 | Continued engine development. |
| 1.3.28-fixed | Fixed artifact được tìm lại. |
| 1.3.28 rebuild | Một artifact khác dù cùng family 1.3.28. |
| 1.3.29 | Iteration tiếp. |
| 1.3.30 | Iteration tiếp. |
| 1.3.31 | Mốc trước đợt release cực nhanh 32–56. |
| 1.3.32–1.3.38 | Các version tồn tại nhưng tag được backfill về sau. |
| 1.3.39 | Backfill tags cho 1.3.32–1.3.38. |
| 1.3.40–1.3.48 | Rapid iteration; chưa gán feature nếu chưa đủ evidence. |
| 1.3.49 → 1.3.50 | Có dấu vết hai version-state nằm rất sát/thậm chí cùng một commit context. |
| 1.3.51–1.3.53 | Rapid evolution. |
| 1.3.54 | +15 agentic-AI skills, tổng skill khoảng 306 → 321. |
| 1.3.55 | Iteration tiếp. |
| 1.3.56 | Cuối chuỗi 1.3.x đã xác định. |

Một commit retention sau đó xóa hàng loạt ZIP v1.3.x cũ, nên Git còn lịch sử nhưng artifact không còn đầy đủ — đây là lý do lớn nhất khiến giai đoạn này có nhiều "bản mất".

## V. Late YAMTAM

| Version | Vai trò |
|---|---|
| v1.4.00 | Chuyển khỏi 1.3.x rapid line. |
| v1.4.20 | Release artifact còn được lịch sử nhắc tới. |
| v1.5.0 | Engine evolution. |
| v1.6.0 | Major iteration. |
| v1.6.1 | Patch. |
| v1.7.0 | Major iteration. |
| v1.7.1 | Patch. |
| v1.7.2 | Patch. |
| v1.7.3 | Late 1.7 artifact. |
| v1.8.0 | Một trong những mốc cuối của old YAMTAM release-pack numbering. |

> YAMTAM 1.4.x này **không phải** Yana Product 1.4.x tháng 8. Hai version axis khác nhau hoàn toàn.

## VI. Productization — reset về v0.x

```
YAMTAM Engine v1.x
        │
   Product architecture
        │
        v0.1.x
```

| Version | Chức năng/sự kiện |
|---|---|
| v0.1–0.2 | Early productization. |
| v0.3 | Policy Kit. |
| v0.4 | Guard Installer. |
| v0.5 | Runtime/task/eval development. |
| v0.6–0.13 | Product architecture phát triển nhanh; cần commit archaeology thêm để gán từng feature. |
| v0.14.0 | Graph-related development. |
| v0.14.1 | Import khoảng +423 skills. |
| v0.14.2 | Import khoảng +1,048 skills. |
| v0.15.0 | Skill/design/hunt expansion; từng xuất hiện metadata `2.0.0` ở một số component → version drift. |
| v0.16.0 | Product line tiếp tục ổn định. |
| v0.17.0 | CLI/product được wire với `yamtam-rt v1.0.0`. |
| v0.18.0 | Ephemeral/unreleased state; sau đó chính thức đánh dấu SKIPPED. |
| v0.22.4 | Có dấu vết version nhưng chưa xác định chắc nó thuộc product/component/internal axis nào. |
| v0.40.0 | Thay thế v0.18.0; product numbering nhảy lớn. |

## VII. `yamtam-rt` → `yana-rt`

Đây là lúc Rust runtime trở thành một nhánh version độc lập:

| Runtime | Ý nghĩa |
|---|---|
| `yamtam-rt` 0.7 | Early Rust runtime. |
| 0.8 | Runtime iteration. |
| 0.9 | Pre-1.0 runtime. |
| 1.0.0 | Runtime stable boundary; được YAMTAM Product 0.17 wire vào CLI. |
| → `yana-rt` | Rename cùng YAMTAM → Yana. |
| `yana-rt` 1.1.x | Independent runtime development. |
| 1.3.2 | Runtime axis tiếp tục độc lập với Product. |
| 1.3.3 | Runtime đi cùng thời Product 1.0.0. |
| 1.4.0 | Runtime thế hệ mới; thời Product 1.3.2 vẫn có thể mang runtime 1.4.0. |

Đây là lý do cụ thể vì sao không được nhìn Product version để đo runtime version — xem [`VERSIONING.md`](../../VERSIONING.md) để biết repo hiện giữ các version axis độc lập ra sao.

## VIII. Proto-Yana / Thời kỳ đổi tên

Yana thực tế xuất hiện trước formal rename. Khoảng đầu–giữa tháng 6:

```
yana-router → yana-web → yana-desktop
```

Rồi mới đến formal rename, **15/06/2026**:

```
YAMTAM ENGINE → Yana AI
yamtam-engine → yana-ai
yamtam-rt     → yana-rt
YAMTAM_*      → YANA_*
.yamtam/      → .yana/
bin/yamtam    → bin/yana
```

Migration kéo dài thêm nhiều ngày vì vẫn còn identifiers/package/reference mang tên YAMTAM. Nên coi 15/6 là *sự kiện* đổi tên, và khoảng 15–25/6 là *cửa sổ* migration, không phải một lần chuyển đổi sạch sẽ duy nhất.

## IX. Early Yana v0.x

| Version | Làm gì |
|---|---|
| 0.40.0 | Cầu nối cuối YAMTAM / đầu Yana. |
| 0.41.0–0.41.2 | Early Yana product development. |
| 0.41.3 | Confirmed product state ngày 13/6. |
| 0.42.0 | Product state trước binary distribution workflow. |
| 0.42.1 | First binary release. Không chỉ patch: thay đổi cách phân phối Yana. |
| 0.42.2 | WASM + publish pipeline. |
| 0.42.3 | Stabilization/pre-0.43 state. |
| 0.43.0 | Onboarding + conversation-history era. |
| 0.43.1 | Phát hiện CI đang ép Product/Rust/Python chung version → formalize independent version axes. |
| 0.43.2 | Một trong những pre-1.0 product states cuối. |

## X. Yana Stable

| Product | Ý nghĩa |
|---|---|
| v1.0.0 — 26/07 hoặc 27/07 | Stable product-axis 1.0 đầu tiên. Không phải ngày dự án sinh ra. |
| v1.1.0 — 30/07 | Product stable tiếp theo + Desktop development. |
| v1.2.0 | Product axis bị **SKIPPED**. Version 1.2 xuất hiện ở surface/component khác nhưng không phải Product release chuẩn. |
| v1.3.0 — 01/08 | Product version sync sau Desktop/version-display drift. |
| v1.3.1 — 02/08 | Stabilization/patch. |
| v1.3.2 — 11/08 | Product 1.3.2, `yana-rt` 1.4.0, Python 0.42.5; safety/SSRF/runtime work đã rất trưởng thành. |
| v1.4.0 — 16/08 | Capability Runtime, OS/service/provider expansion và safety hardening. |
| v1.4.1 — 20/08 | Patch/stabilization sau 1.4.0. |

## XI. Desktop

Desktop phải coi là axis/component riêng:

| Version | Vai trò |
|---|---|
| 0.1.0 metadata era | Package metadata từng bị kẹt ở version rất cũ. |
| 1.1.0 | Desktop release. |
| 1.2.0 | Desktop/release-surface version — một lý do dễ nhầm rằng Product cũng có 1.2.0. |
| 1.3.0 | Desktop đi trước/ảnh hưởng việc đồng bộ Product display version. |

## XII. Yana-AI-Chat_Terminal

Nhiều artifact thật, không chỉ một repo:

| Artifact | Chức năng |
|---|---|
| `Yana-AI-Chat_Teminal-main.zip` | Snapshot Chat Terminal chính. |
| `...main (1).zip` | Snapshot khác của cùng branch. |
| `Yana-AI-Chat-Terminal-14-UI-Engines.zip` | Thử nghiệm/thiết kế 14 UI engines. |
| `...Compose-ZeroMemory.zip` | Compose/ZeroMemory direction. |
| `...Visible-UI-Patch.zip` | Patch UI/visibility. |

## XIII. Thử nghiệm Capability Runtime

Cho thấy kiến trúc runtime không nhảy thẳng tới implementation cuối:

```
yana-local-capability-runtime-design-v1
                ↓
              v2
                ↓
yana-runtime-design-v3
                ↓
              v4
                ↓
yana-runtime-foundation-final
                ↓
yana-program-j-capability-runtime-rust
                ↓
        Yana runtime implementation
```

Đây là architectural prototype lineage, không nên gọi chúng là Product releases.

## XIV. `yana-web`

Nhánh Web/UI của ecosystem. Nó xuất hiện trước khi formal rename hoàn tất — nghĩa là identity "Yana" đã được dùng cho các component mới trong lúc core vẫn còn tên YAMTAM:

```
YAMTAM core
    │
Proto-Yana
    ├── yana-router
    ├── yana-web
    └── yana-desktop
            │
        Yana AI
```

Không phải `Yana 1.0 → yana-web` — `yana-web` có trước cả bản Product 1.0.

## XV. Robotics

Nhánh Yana rời khỏi software-only:

```
Yana ecosystem
      │
      └── yana-wheelbot
                │
                └────► yana-robot
                         ▲
                         │
                    xiaozhi-esp32
                    external DNA
```

`yana-wheelbot` là physical-control/robotics branch. `yana-robot` đi xa hơn: ESP32-S3 firmware + Web/mobile control + local real-time safety + ToF + motor/servo + LED/display và hướng AI/MCP semantic control — có nhận code lineage bên ngoài từ `xiaozhi-esp32`, nên đây là hybrid descendant, không phải fork thuần Yana-AI.

## Toàn bộ tiến hóa, rút gọn

```
Claude Development Template
        ↓
GitNexus
        ↓
claude-code v3
 ↓ v4
 ↓ v5   Spec-driven
 ↓ v6   Tool attention
 ↓ v7   Persistent memory
 ↓ v8   Memory architecture
 ↓ v9   Quality agents
 ↓ v10  Reliability
        ↓
╔══════════════════╗
║ YAMTAM ENGINE 1.0║
╚══════════════════╝
        ↓
1.1 → 1.2
        ↓
1.2.1 Cost Guard
1.2.2 Budget
1.2.3 Scope Lock
1.2.4 Audit
1.2.5 E2E Safety
1.2.6 Handoff
1.2.7 Production Defense
1.2.8 API Defense
1.2.9 Release QA
        ↓
STANDALONE ENGINE
        ↓
1.3.0 → ... → 1.3.56
        ↓
1.4 → 1.5 → 1.6 → 1.7 → 1.8
        ↓
──────── PRODUCT RESET ────────
        ↓
0.1 → ... → 0.17
        │
        ├──── yamtam-rt
        │
        ↓
0.18 [ephemeral/skipped]
        ↓
0.40 → 0.41 → 0.42 → 0.43
        ↓
════ YAMTAM → YANA ════
        ↓
              YANA AI
      ┌─────────┼─────────┐
      ↓         ↓         ↓
   yana-rt    Python    Desktop
      │
      ├───────────────┐
      ↓               ↓
  yana-web       Chat Terminal
                      │
               runtime experiments
             YANA ECOSYSTEM
                    │
                    ↓
              yana-wheelbot
                    ↓
               yana-robot
                    ↑
              xiaozhi-esp32
```

Phần còn thiếu nhất hiện nay chính là feature-level của `v1.3.0`–`1.3.11`, `1.3.40`–`53` và Product `0.6`–`0.13` — các version/state này biết là tồn tại, nhưng không nên đọc bất kỳ dòng nào ở đây là "bản này thêm X" nếu chưa có bằng chứng cấp commit đi kèm.
