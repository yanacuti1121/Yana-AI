# Yana AI — Ecosystem Map

**Trạng thái:** Audit lần đầu, 2026-09-09, cập nhật 2026-09-10. Viết theo
yêu cầu trực tiếp của anh Tâm trước khi tiếp tục redesign
`yana.vutam.link` — dừng thiết kế, audit toàn bộ repo trước, coi repo là
source of truth, không suy luận rằng Yana Studio = toàn bộ Yana AI.

**Thứ tự đọc đúng theo anh Tâm (2026-09-10):** `YANA-DEEP-ARCHITECTURE.md`
(kiến trúc hệ thống hiện tại, từ tầng sâu nhất lên sản phẩm) → file này
(bản audit gốc + lịch sử sửa) → `YANA-BUILD-JOURNEY-DRAFT.md` (vì sao kiến
trúc này tồn tại) → mới thiết kế homepage. File hierarchy chính thức (§2)
đã SUPERSEDED bởi `YANA-DEEP-ARCHITECTURE.md` §90 — xem ghi chú trong §2.

**Phương pháp:** Đọc trực tiếp README.md, ARCHITECTURE.md, VISION.md,
docs/reference/architecture.md, docs/YANA-CONTROL-PLANES.md, docs/SEPARATION.md,
CURRENT-MILESTONE.md, VERSIONING.md, docs/adr/ADR-014, docs/reference/known-limitations.md,
pyproject.toml, Cargo.toml, package.json, MANIFEST.json, docs/programs/README.md,
và package.json/README.md của từng thư mục trong `tools/`. Mọi số liệu dưới đây
trace được về một file cụ thể — không suy diễn.

**Lưu ý ngay:** repo có nhiều tài liệu kiến trúc viết ở các thời điểm khác
nhau, và chúng **không đồng nhất** — `docs/ARCHITECTURE.md` (tiếng Việt, sơ đồ
Router/Safety Gate/Context) tự nhận nó lỗi thời ("mô tả hệ thống trước khi có
yana-rt"), còn `docs/reference/architecture.md` mới hơn và trỏ về
`ADR-014` là "current runtime source of truth". Map này ưu tiên tài liệu mới
nhất + số liệu do script tự động sinh ra (`check_counts.py`), không ưu tiên
tài liệu cũ hơn khi có xung đột.

---

## 1. Product identity — Yana AI là gì (theo repo, không theo suy diễn)

**SỬA 2026-09-09 theo lời chỉnh trực tiếp của anh Tâm:** bản đầu của file này
dẫn đầu bằng cụm "Personal agent operating system" từ `MANIFEST.json` —
anh Tâm chỉ ra đây **sai triết lý**. Cụm đó vẫn có thật trong repo (giữ lại
làm nguồn tham chiếu, không xoá lịch sử), nhưng KHÔNG phải cách anh muốn
định nghĩa Yana AI ra bên ngoài. Định nghĩa đúng, theo lời anh:

> **Yana AI là một hệ sinh thái (ecosystem), lấy `yana-rt` (Rust runtime)
> làm chủ/lõi. Xung quanh nó là các nhánh con** — Yana Studio là một nhánh,
> Yana-wheelbot/yana-robot cũng là một nhánh (đi từ ngày đầu, vẫn còn đó,
> bên trong vẫn chạy Yana), Yana AI Desktop và Yana Web cũng là nhánh.

Bằng chứng nhánh robot có thật trong repo (không phải suy diễn): trước audit
này chưa tìm ra, sau khi anh nhắc mới grep lại thấy —
`docs/reference/history.md` dòng 320-331: *"`yana-wheelbot` is the
physical-control/robotics branch. `yana-robot` goes further: ESP32-S3
firmware, web/mobile control, local real-time safety, ToF sensing,
motor/servo control..."* — code của nhánh này KHÔNG nằm trong repo
Yana-AI này (không phải submodule, không trong `.gitmodules`), nó là
repo/dự án riêng, chỉ được nhắc tới ở đây như một nhánh lineage.

Ba nguồn khác vẫn đúng và không mâu thuẫn với sửa đổi trên, chỉ là **không
còn là câu mở đầu**:

- `MANIFEST.json`: *"Personal agent operating system. Hook layer + safety
  guards + workflow rules for AI assistants."* — mô tả đúng lớp Governance
  Core, không phải toàn bộ ecosystem.
- `docs/SEPARATION.md`: *"Yana AI is NOT a product. It is NOT bundled with
  any product repo by default."* — vẫn đúng: cách phân phối chính của lớp
  Governance Core là cài **vào** một repo khác, không phải tải app.
- `README.md`: *"Yana turns independent AI models and agents into one
  governed, persistent system... Yana provides the control plane."*

**Kết luận đã sửa:** Yana AI là **hệ sinh thái**, trung tâm là `yana-rt`.
Yana AI Desktop, Yana Web, Yana Studio, Yana-wheelbot/yana-robot đều là
**nhánh** chạy quanh/dùng `yana-rt` — không nhánh nào "là" Yana AI, và
Governance Core (rules/hooks/agents/skills, thứ phân phối qua `pip install
yana-ai`) là MỘT khối trong hệ sinh thái đó, không phải định nghĩa của toàn
bộ nó.

**"jnmt" — đã tìm ra (2026-09-09, qua `gh repo list`):** không phải nhánh
Yana AI, mà là repo riêng **`jnmt-claude-code-agenl-21`** (private, tạo
2026-04-21) — *"Jeonnam Future International High School student support
app"*, app hỗ trợ học sinh trường của anh (thông báo, học tập, dịch, thi,
điểm, đặt phòng, liên lạc). Đây là app **có trước** cả Yana AI (repo Yana-AI
tạo 2026-05-17, sau JNMT gần 1 tháng) và vẫn đang tồn tại riêng. Theo lời
anh — *"trong nó cũng chạy Yana"* — nghĩa là JNMT là một ví dụ Yana AI được
dùng để VẬN HÀNH một app thật khác (một "khách hàng"/consumer của Yana),
không phải một nhánh SẢN PHẨM của Yana AI ecosystem như Studio/Desktop/
Wheelbot. Repo private, em không đọc sâu nội dung bên trong (dữ liệu học
sinh có thể nhạy cảm) — chỉ xác nhận nó có thật và tồn tại từ trước Yana AI.

Điều này khớp với điều anh vừa nói: **Yana Studio chỉ là một nhánh, không
phải toàn bộ Yana AI.**

---

## 2. Product hierarchy thực tế (kiểm chứng từ repo)

**SUPERSEDED 2026-09-10 — xem `YANA-DEEP-ARCHITECTURE.md` §90 làm hierarchy
chính thức.** Anh Tâm tự đào lại `main` sâu hơn và gửi một bản hierarchy mới,
chi tiết hơn, đã spot-verify trực tiếp trong source code (`src/capability/`,
`src/model/`, `src/task.rs`, `src/project_workspace/`...). Hierarchy đó chia
7 nhánh: **Yana Runtime · Yana Governance · Yana OS · Yana Knowledge/Core ·
Yana Integrations · Yana Studio · Developer/Distribution** — chi tiết hơn
cây dưới đây (cây dưới vẫn đúng hướng — yana-rt là chủ — nhưng gộp Runtime
và Governance chung một nhánh, bản mới tách riêng rõ hơn). Giữ cây cũ ở đây
làm lịch sử/đối chiếu, **không dùng cây dưới để viết copy web — dùng
`YANA-DEEP-ARCHITECTURE.md` §90.**

**SỬA 2026-09-09 (áp dụng cho cây dưới, vẫn còn giá trị lịch sử):** bản đầu
đặt "Governance & Safety Core" lên đầu làm trung tâm ("ĐÂY LÀ SẢN PHẨM
CHÍNH"). Theo lời chỉnh của anh, `yana-rt` (Runtime) mới là chủ/lõi của
ecosystem, Governance Core là một khối cùng cấp với các nhánh khác — không
phải cái duy nhất đứng trung tâm. Cấu trúc dưới đây đã sửa lại theo đúng ý
đó, và thêm nhánh Yana-wheelbot/yana-robot mà bản đầu chưa tìm ra.

```
YANA AI  (hệ sinh thái — trung tâm là yana-rt)
│
├── Giám Thị — root safety authority
│     Độc lập, chạy ngoài mọi session (macOS LaunchAgent/cron), kiểm tra
│     core-lock + audit-chain định kỳ. Không ai — kể cả Yana control plane —
│     override được HALT lock của nó. (README §Safety architecture, ADR-014
│     Authority Order #1)
│
├── Runtime — `yana-rt` (Rust)  ← CHỦ/LÕI của ecosystem, theo lời anh Tâm
│     ├── TurnEngine — canonical turn orchestration (ADR-014)
│     ├── Capability execution plane (typed, governed, một executor duy nhất)
│     ├── Model/provider plane — local (Ollama) hoặc cloud (Claude/GPT/
│     │   Gemini/bất kỳ), provider không đổi authority
│     ├── MCP server (opt-in, chỉ đọc/governed, không tự cấp approval)
│     ├── Subcommands: chat, scan, hunt, fix, route, mission, vault, doctor,
│     │     os, workspace, evidence, bus, lease... (~39 theo
│     │     docs/reference/architecture.md)
│     └── Phân phối: `cargo install yana-rt` (crates.io) — version riêng,
│           độc lập với version tổng của Yana AI (VERSIONING.md)
│
├── Governance & Safety Core — một khối trong ecosystem, KHÔNG phải trung
│   tâm; là lớp policy áp lên mọi nhánh khác khi chúng dùng yana-rt
│     ├── Rules (71) · Hooks (66) · Gates (L0–L5) · Agents (100, persona
│     │   config — không phải process) · Skills (2,025, routing-triggered)
│     │   · Commands (170) · Scripts (133) · Merkle audit-chain log
│     └── Phân phối qua:
│           `pip install yana-ai` + `yana-ai install`  (PyPI, áp hooks/rules
│             vào MỘT repo khác của người dùng)
│           KHÔNG qua npm — 3 lần thử, bỏ vĩnh viễn (VERSIONING.md)
│
├── Interfaces / Surfaces — chạy TRÊN Governance Core + Runtime, không phải
│   là Governance Core
│     ├── Terminal — native CLI + adapter cho Claude Code/Codex/Cursor/
│     │     Antigravity (4 harness, ADR-014 Interface Boundaries)
│     ├── Yana Web (`tools/yana-web`) — chat UI thật, Node server. Theo
│     │     README của yana-desktop: *"the web app IS the desktop app"*
│     ├── Yana AI Desktop (`tools/yana-desktop`) — **chỉ là Electron
│     │     wrapper quanh Yana Web + bundled yana-rt, không có UI riêng.**
│     │     Đây chính là cái đang bán trên yana.vutam.link hôm nay
│     │     (v1.4.8, .dmg/.exe/.AppImage).
│     ├── Yana Studio (`tools/yana-studio`) — app MỚI, TÁCH BIỆT, v0.1.0,
│     │     UI riêng (terminal grid, file editor CodeMirror, git status,
│     │     Design Canvas). Tự nhận trong README riêng: *"Một app mới.
│     │     Không phải bản đổi giao diện của Yana Desktop cũ."* Đang được
│     │     Codex xây, chưa production-ready ("xây nền làm việc thật
│     │     trước, không lấp giao diện bằng số liệu hoặc nút bấm giả").
│     └── Discord adapter — plain chat, allowlist, không có tool capability
│
├── Yana-wheelbot → yana-robot — nhánh robotics
│     **Xác nhận qua `gh repo list yanacuti1121` (2026-09-09):** repo public
│     riêng **`yana-wheelbot`**, tạo **2026-08-23** — mô tả chính chủ:
│     *"Independent ESP32-S3 voice-AI robotics platform derived from
│     XiaoZhi AI Chatbot (MIT) — Yana Wheelbot board, chassis, and web
│     controller."* Khớp với lời anh (ESP32-S3, ToF, hybrid với XiaoZhi) và
│     với `docs/reference/history.md` (dòng 320-331) — chỉ khác: draft gốc
│     nói "tháng 8/2026 tôi bắt đầu yana-robot", ngày tạo repo thật là
│     **23/08/2026**, không phải chỉ "tháng 8" mơ hồ — có thể ghi chính xác
│     lên web. Code KHÔNG nằm trong repo Yana-AI này (không phải submodule
│     của repo này).
│
├── Yana OS / Program K (Draft, một phần triển khai) — layer quản lý agent
│     lifecycle/identity/capabilities/sessions/policies/sandboxing, xây
│     TRÊN `yana-rt` (không thay thế). Supervisor/scheduler/vault còn BLOCKED
│     ở readiness 40–55% (docs/programs/README.md).
│
├── Governance-of-development meta-layer (Idea Challenger / Evolution
│     Governor / Local Embodiment Runtime, `docs/YANA-CONTROL-PLANES.md`) —
│     công cụ NỘI BỘ để quyết định Yana AI tự phát triển tiếp thế nào.
│     KHÔNG phải sản phẩm cho người dùng cuối. Draft, "none of the three
│     systems are implemented yet" tính đến 2026-08-08.
│
└── Auxiliary tools (`tools/`) — không thuộc ecosystem chính, không nên lên
      trang chủ: codexmate + codexmate-vi-patch (tích hợp OpenAI Codex, bản
      patch tiếng Việt riêng), moss-tts-nano/finetune-vi (TTS tiếng Việt),
      airllm-bridge (chạy model lớn trên GPU yếu), yana-pixel-bridge (trực
      quan hoá subagent dispatch thành nhân vật đi lại — "a status monitor,
      not a place where real work happens", theo README riêng của nó).
```

**Khác với gợi ý ban đầu của anh ở đâu, và vì sao:**
- Thêm **Giám Thị** làm tầng riêng phía trên Yana — repo coi nó là authority
  tách biệt, không phải một phần của "Safety & Governance" thông thường.
- Tách **Runtime** (yana-rt, Rust, version riêng) ra khỏi **Governance Core**
  (rules/hooks/agents/skills, phân phối qua pip) — đây là 2 artifact khác
  nhau, khác registry, khác version, theo VERSIONING.md.
- Thêm **Yana OS / Program K** — có thật trong repo (Draft, code có), gợi ý
  ban đầu không có mục này.
- Thêm **meta-governance layer** — có thật (3 file thiết kế), nhưng phải nói
  rõ đây là nội bộ, không public-facing.
- Thêm **Yana-wheelbot/yana-robot** — nhánh có thật (`docs/reference/history.md`),
  bản audit đầu tiên bỏ sót vì không nghĩ tới việc grep "robot".

---

## 3. Subsystem tìm thấy — bảng tổng hợp

| Subsystem | Vị trí | Trạng thái | Public-facing? |
|---|---|---|---|
| Rules | `core/rules/` (71) | ✅ Sống, enforce qua hooks | Có, nhưng là chi tiết kỹ thuật |
| Hooks | `core/hooks/` (66) | ✅ Sống | Có |
| Gates L0–L5 | `gates/`, rải trong rules | ✅ Sống (một phần là policy tài liệu, xem §6) | Có |
| Agents | `core/agents/` (100, file `.md`) | ✅ Sống, "config không phải process" | Có |
| Skills | `core/skills/` (2,025) | ✅ Sống, chỉ load khi trigger match | Có |
| Commands | `core/commands/` (170) | ✅ Sống | Có |
| Scripts | `core/scripts/` (133) | ✅ Sống | Nội bộ/dev-facing |
| Merkle audit-chain | `secure-logger.sh`, `.claude/state/audit-chain.log` | ✅ Sống | Kỹ thuật, có thể nhắc tới |
| `yana-rt` Runtime | `src/` (Rust) | ✅ Sống, publish crates.io | Có — là phần "chạy được" nhất |
| MCP server | `src/mcp.rs`, `src/capability/` | 🟡 Built nhưng **chưa merge vào `main`** (chỉ có ở branch cũ + 1 file zip untracked, theo `docs/YANA-CONTROL-PLANES.md` "Known gaps") | Không — chưa xong |
| Yana Web | `tools/yana-web` | ✅ Sống, là UI thật | Có |
| Yana AI Desktop | `tools/yana-desktop` | ✅ Sống, đang bán v1.4.8 | Có — đây là cái yana.vutam.link đang giới thiệu |
| Yana Studio | `tools/yana-studio` | 🟡 v0.1.0, đang xây, tự nhận chưa xong | Có thể nhắc, phải ghi rõ "đang phát triển" |
| Yana OS / Program K | `docs/programs/PROGRAM-K-*` + code liên quan | 🟡 Draft, một phần readiness 40–55% | Không — chưa đủ chín |
| Program J (Universal Capability Runtime) | `docs/programs/PROGRAM-J-SKELETON.md` | 🟡 Draft, 1 spike prototype đo thật (p50 0.134ms), chưa full implement | Không |
| Idea Challenger / Evolution Governor / Local Embodiment Runtime | `docs/YANA-CONTROL-PLANES.md` + 3 file con | ⚪ Draft, chưa code | Không — nội bộ dev-process |
| Giám Thị halt watcher | README §Safety architecture | ✅ Sống, opt-in, LaunchAgent/cron | Có — là điểm bán hàng thật (fail-closed, không ai override) |
| Auxiliary tools (codexmate, TTS, airllm-bridge, pixel-bridge) | `tools/*` | Đa dạng, phần lớn side-project | Không — không thuộc ecosystem chính |

---

## 4. Trạng thái triển khai hiện tại (theo `CURRENT-MILESTONE.md`)

Milestone đang chạy (từ 2026-08-07), 5 mục ưu tiên, **không mục nào ✅ xong
hoàn toàn** trừ mục ghi-chép-milestone:

1. Capability Runtime canonical — 🟡 in progress (MCP + Chat đã dùng chung
   `src/capability/`; Desktop's file-tree IPC vẫn có logic riêng — chưa xong)
2. Local model tool calling — 🟡 in progress (thiếu Golden E2E test end-to-end)
3. Unified mutation pipeline — 🟡 in progress
4. Source-of-truth cleanup (version/count drift) — 🟡 ongoing, incremental
5. Milestone + debt register tồn tại — ✅ done (chính file này)

**Ý nghĩa cho website:** không được nói "Yana AI đã hoàn thiện kiến trúc
capability runtime thống nhất" — đúng là **đang xây**, có thật, có tiến độ đo
được, nhưng chưa đóng gate.

---

## 5. Honesty constraints — những gì KHÔNG được quảng cáo là xong

Trực tiếp từ `docs/reference/known-limitations.md` (nội dung này từng nằm
ngay trong README, dời ra để README không dài, không phải vì kém quan trọng):

- `guard-destructive.sh` là command-string guard, **không phải shell parser
  đầy đủ** — vẫn có cách né được bằng quote-splice tinh vi. Người dùng bình
  thường bị chặn; kẻ cố tình né vẫn có khe hẹp.
- SSRF/metadata-endpoint blocking và typosquat-package blocking **là policy
  tài liệu, chưa phải hook sống** ở một số chỗ — đã xác minh trực tiếp qua
  từng `PreToolUse` matcher, không suy đoán.
- MCP server 9 read-only tools: code có thật nhưng **chưa merge vào `main`**.
- Yana Studio: tự nhận "0.1.0", "không lấp giao diện bằng số liệu hoặc nút
  bấm giả" — nghĩa là các phần chưa làm THẬT SỰ CHƯA CÓ, không phải ẩn đi.

Website phải giữ đúng tinh thần này: **claim nào cũng phải trace được về
file/code**, đúng như anh yêu cầu — không fake metric, không fake feature,
không gọi experimental là production.

---

## 6. Cái gì NÊN lên website, cái gì KHÔNG

### Nên giới thiệu (có thật, có evidence, ổn định)
- Yana AI là control-plane/governance layer cho AI coding agent — positioning
  chính từ README.
- Số liệu thật: 2,025 skills · 100 agents · 71 rules · 66 hooks · 170 commands
  (nguồn: `MANIFEST.json` + `check_counts.py`, KHÔNG dùng số 124 scripts /
  "40+ rules" cũ trong các doc lỗi thời — số đúng hiện tại là 133 scripts, 71
  rules).
- 2 con đường cài đặt thật: `pip install yana-ai` (governance) và
  `cargo install yana-rt` (runtime) — kèu ví dụ thật (chặn `rm -rf`, chặn
  `git push --force`, như README's "See governance act" demo).
- Giám Thị — fail-closed halt watcher, độc lập, không ai override được.
- Yana AI Desktop — app GUI thật, đang phát hành, tải được ngay.
- Yana Studio — **có thể nhắc**, nhưng phải ghi đúng vị thế: "app workspace
  trực quan cho Yana, đang được xây" — không phải "Yana chính là app này".
- Multi-harness: Claude Code, Codex, Cursor, Antigravity.
- Open source, Apache 2.0.

### Không nên quảng cáo (chưa chín, hoặc nội bộ)
- MCP server 9 tools — chưa merge main.
- Yana OS / Program K, Program J — Draft, readiness thấp, chưa cho end-user.
- Idea Challenger / Evolution Governor / Local Embodiment Runtime — công cụ
  nội bộ, không liên quan người dùng cuối.
- Auxiliary tools (codexmate patch, TTS, airllm-bridge, pixel-bridge) — side
  project, không thuộc câu chuyện chính.
- Bất kỳ số liệu benchmark/testimonial/khách hàng nào không có trong repo —
  hiện tại **không có** testimonial thật, không nên dựng giả (đã áp dụng khi
  quyết định bỏ qua phần "closing CTA kiểu Codex" ở lần sửa trước).

---

## 7. Việc cần anh quyết định (chưa audit ra được, không đoán)

1. **`yana.vutam.link` có cần dẫn tới cả `pip install yana-ai` NGAY trên
   hero, hay hero chỉ nêu ý tưởng và đẩy chi tiết cài đặt xuống trang
   `/docs` riêng?** — README hiện có "Choose your first win" (3 cột: Run
   local AI / Govern a repository / Orchestrate work) — có thể tái dùng cấu
   trúc này cho web, nhưng cần anh xác nhận đây có phải đúng 3 "cửa vào"
   muốn nhấn trên web không.
2. **Yana Studio khi nhắc trên trang chủ, dùng ảnh chụp thật (v0.1.0, còn
   thiếu nhiều) hay chỉ dùng khung UI tĩnh + text "đang phát triển"?** — vì
   Studio tự nhận chưa xong, một ảnh chụp thật ở giai đoạn này có thể trông
   sơ sài trên landing page.
3. **Domain `yana.vutam.link` có nên tách route riêng cho từng surface**
   (`/` = Yana AI tổng, `/desktop` = Desktop app, `/studio` = Studio,
   `/docs` = CLI/governance) hay tất cả dồn một trang dài? Ảnh hưởng trực
   tiếp tới cấu trúc nav anh đề xuất (Yana / Products / Developers / Safety /
   Docs / GitHub).
4. **Nav "Safety" nên trỏ tới cái gì cụ thể** — README's kiến trúc governance
   (`docs/reference/architecture.md`), hay một trang mới tổng hợp riêng
   `SECURITY.md` + 71 rules? SECURITY.md hiện có nhưng viết cho contributor,
   chưa viết cho khách hàng.
5. **README có 4 bản ngôn ngữ (en/vi/ko/zh) — trang web hiện cũng có 4 ngôn
   ngữ. Nội dung ecosystem-map này nên đồng bộ 1:1 với README hay được viết
   lại ngắn hơn cho web?** Ảnh hưởng khối lượng dịch cần làm.

---

## References

- `YANA-DEEP-ARCHITECTURE.md` — **hierarchy chính thức (§90), phân loại
  LIVE/UNWIRED/OPT-IN/DEFERRED (§91)** — đọc trước file này
- `YANA-BUILD-JOURNEY-DRAFT.md` — vì sao kiến trúc này tồn tại (origin
  story, DRAFT chưa duyệt), kèm kết quả điều tra GitHub đối chiếu từng claim
- `README.md` — positioning chính, "Choose your first win", numbers, safety architecture
- `docs/SEPARATION.md` — Yana AI không phải bundled product
- `docs/reference/architecture.md` + `docs/adr/ADR-014-unified-runtime-authority-hierarchy.md` — kiến trúc runtime hiện hành
- `docs/YANA-CONTROL-PLANES.md` — meta-governance (Challenger/Governor/Local Embodiment Runtime)
- `CURRENT-MILESTONE.md`, `ARCHITECTURE-DEBT.md` — trạng thái thật, không phải aspirational
- `VERSIONING.md` — 3 trục version độc lập, npm bị bỏ vĩnh viễn
- `docs/reference/known-limitations.md` — honesty constraints
- `docs/programs/README.md` — trạng thái Program D/F/H/J/K
- `tools/yana-desktop/README.md`, `tools/yana-studio/README.md`, `tools/yana-web/README.md` — sự thật về từng surface
- `MANIFEST.json` — số liệu chính thức, đồng bộ qua `check_counts.py --fix`
