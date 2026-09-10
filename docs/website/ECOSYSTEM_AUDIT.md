# Ecosystem Audit — Yana Website Rebuild, Phase 0

**Trạng thái:** Phase 0 (audit) của brief `docs/website/*` anh Tâm gửi
2026-09-10 — *"Build the canonical public website for the entire Yana
ecosystem"*. Quy tắc bắt buộc: **audit trước, IA trước, code sau** — file
này không chứa bất kỳ quyết định thiết kế nào, chỉ sự thật đã kiểm chứng.

**Không lặp lại nội dung đã có** (rule-consistency-policy.md — một nguồn
sự thật): chi tiết kiến trúc đầy đủ nằm ở `docs/YANA-DEEP-ARCHITECTURE.md`
(đã spot-verify với source code) và `docs/YANA-ECOSYSTEM-MAP.md`. File này
chỉ làm phần **CHƯA có**: khám phá đầy đủ các repo GitHub thuộc ecosystem
(anh yêu cầu rõ "DO NOT assume the list is complete"), và tổng hợp
what-to-keep/what-to-replace từ trang web hiện tại.

---

## 1. Khám phá repo — toàn bộ tài khoản `yanacuti1121`

Chạy `gh repo list yanacuti1121 --limit 50 --json name,description,isPrivate,createdAt,isFork,primaryLanguage,pushedAt`
(2026-09-10) — 12 repo, phân loại theo bằng chứng thật (`isFork`,
description, ngôn ngữ, lịch sử push), không suy đoán:

| Repo | Fork? | Ngôn ngữ | Tạo | Phân loại |
|---|---|---|---|---|
| **Yana-AI** | Không | Rust/Python/TS | 2026-05-17 | ✅ **Ecosystem — repo chính**, description hiện tại đã là "One runtime. Any AI. Human-governed." |
| **yana-wheelbot** | Không | (firmware/hardware) | 2026-08-23 | ✅ **Ecosystem — nhánh Wheelbot**, description: "Independent ESP32-S3 voice-AI robotics platform derived from XiaoZhi AI Chatbot (MIT)" |
| **yana-web** | Không | JS/TS | 2026-06-13 | ✅ **Ecosystem — repo Yana Web độc lập** (song song với `tools/yana-web` trong monorepo — cần anh xác nhận đây là cùng 1 codebase mirror ra, hay 2 bản khác nhau; chưa kiểm) |
| Yana-AI-Chat_Teminal | Không | Rust | 2026-06-16 | ✅ **ĐÃ XÁC ĐỊNH (2026-09-10, đọc trực tiếp README qua `gh api`)** — tự nhận: *"currently a UI/UX incubator for the next Yana terminal experience... The current MVP uses mock data."* Ratatui, `src/app`/`src/domain`/`src/ui`, chưa nối `yana-rt` thật. Khớp với `docs/reference/history.md` §XII (điểm hội tụ của các archive "14-UI-Engines"/"Compose-ZeroMemory"). **Phân loại: ACTIVE COMPONENT / EXPERIMENTAL** — không phải ABANDONED (push gần nhất 2026-08-09), không phải ABSORBED, không phải ACTIVE PRODUCT (mock data, chưa dùng được thật). Chi tiết đầy đủ ở `SOURCE_OF_TRUTH_GRAPH.md`. Không thấy bằng chứng liên quan tới claim "127.0.0.1:8081/3438 skills" trong build-journey draft §9 — 2 việc khác nhau, trùng ngày tạo là trùng hợp, không phải cùng 1 sự kiện. |
| jnmt-claude-code-agenl-21 | Không | (private) | 2026-04-21 | ⚪ **KHÔNG thuộc ecosystem sản phẩm** — app trường học của anh (Jeonnam), có TRƯỚC Yana AI, dùng Yana để vận hành (consumer, không phải branch). Private — không đưa lên web công khai. |
| codexmate | **Fork** | — | 2026-06-04 | ⚪ Fork của dự án người khác, tích hợp làm tool phụ (`tools/codexmate` submodule + `codexmate-vi-patch` bản patch riêng) — KHÔNG phải sản phẩm Yana, không lên trang chủ ecosystem |
| agent-office | **Fork** | — | 2026-06-18 | ⚪ Fork — nguồn cảm hứng cho `yana-pixel-bridge` (tool phụ trực quan hoá), không phải sản phẩm Yana |
| TencentDB-Agent-Memory | **Fork** | — | 2026-08-04 | ⚪ Fork — không liên quan Yana, có thể chỉ là repo tham khảo/star |
| viettelex | **Fork** | — | 2026-08-13 | ⚪ Fork, bộ gõ tiếng Việt macOS — không liên quan Yana |
| itro | Không | HTML | 2026-05-24 | ⚪ **KHÔNG RÕ** — không có description, chưa xác định nội dung, push cuối 2026-06-02. Cần anh xác nhận có liên quan Yana không. |
| vutam-me | Không | HTML | 2026-09-07 | ⚪ **Khả năng cao là site cá nhân/portfolio của anh** (tên khớp domain cá nhân), không phải sản phẩm Yana — cần anh xác nhận |
| yanacuti1121 | Không | — | 2026-06-08 | ⚪ Repo đặc biệt trùng username (GitHub profile README) — không phải sản phẩm |

**Kết luận khám phá repo (cập nhật 2026-09-10):** ngoài Yana-AI (repo
chính), có **3 repo khác chắc chắn thuộc ecosystem**: `yana-wheelbot`,
`yana-web` (độc lập), và `Yana-AI-Chat_Teminal` (ACTIVE COMPONENT/
EXPERIMENTAL — xem `SOURCE_OF_TRUTH_GRAPH.md`, KHÔNG đưa vào `/products`
vì còn mock data, có thể nhắc ở `/roadmap` hoặc `/story`). `yana-studio`
không phải repo GitHub riêng — nó sống trong `tools/yana-studio/` bên
trong monorepo Yana-AI. **Đúng nguyên tắc anh nhắc: REPOSITORY != PRODUCT
— Studio là product thật dù không có repo riêng.**

**Xác nhận sâu Yana Studio (2026-09-10):** không chỉ là thư mục có file —
`tools/yana-studio/package.json` cho thấy 1 app Electron 43 + React 19 +
TypeScript + Vite thật, có test suite thật (`node --test`, Playwright E2E
qua `npm run test:ui`, `electron-rebuild` cho native `node-pty`). Đây là
đầu tư kỹ thuật thật, không phải khung sườn rỗng — dù version còn 0.1.0.

**Bridge Yana ↔ robot/device (mới tìm, quan trọng cho `/wheelbot`):**
`tools/yana-web/robot.js` (503 dòng) — WebSocket + MCP-client handshake
cho 1 "device" tổng quát, có test thật (`_test_robot.js`). **Nhưng
KHÔNG có chuỗi "ESP32"/"xiaozhi"/"wheelbot" nào trong file này** — đây là
bridge tổng quát cho mọi thiết bị nói MCP, chưa có bằng chứng code-level
nó đã nối cụ thể tới firmware Wheelbot. `docs/mcp-protocol.md` được
comment trong test nhắc tới nhưng **không tồn tại trong repo** — 1 gap
tài liệu thật.

**Kiến trúc `yana-web` (cho quyết định framework — xem `ROUTE_MAP.md`):**
KHÔNG dùng Express/Next — 1 Node `http.createServer` tự viết
(`server.js`) + `serveStatic()` router, phục vụ HTML tĩnh build ra từ
`desktop-src/` (React 18.3.1 + Vite 6.4.3). Ecosystem's flagship web app
tự nó cũng không dùng framework nặng như Next.js/Astro — chỉ Vite+React
cho phần UI tương tác, còn lại là static serving thuần.

## 2. Subsystem/kiến trúc — đã audit đầy đủ ở nơi khác

Không lặp lại — xem:
- `docs/YANA-DEEP-ARCHITECTURE.md` — kiến trúc runtime/governance/OS/Studio
  đầy đủ, đã spot-verify với source thật (§Spot-verification ở đầu file),
  kèm phân loại LIVE/UNWIRED/OPT-IN/DEFERRED (§91) — **đây chính là
  PRODUCT_TRUTH_MATRIX ở dạng thô, được chuẩn hoá lại thành bảng ở file
  `PRODUCT_TRUTH_MATRIX.md` cùng thư mục này.**
- `docs/YANA-ECOSYSTEM-MAP.md` — bảng subsystem, honesty constraints,
  ngày/PR đã verify qua `gh pr view`/`git log` thật.
- `docs/YANA-BUILD-JOURNEY-DRAFT.md` — origin story + verification kết quả
  GitHub (PR #85/#157/#317/#319/#320/#321, npm 403, v1.0.0 snapshot).

## 3. Trang web hiện tại — cái gì giữ được, cái gì phải bỏ

Audit trực tiếp `docs/index.html` + `docs/desktop-redesign.css` (đã sửa 2
lần trong phiên làm việc gần nhất, PR #324):

### Giữ được (hạ tầng kỹ thuật, tách khỏi nội dung/positioning)

| Phần | Vị trí | Vì sao giữ |
|---|---|---|
| i18n 4 ngôn ngữ (en/vi/ko/zh) | `<script>` LANGS object trong `docs/index.html` | Cơ chế `data-i18n` hoạt động tốt, mở rộng key mới dễ — tái dùng, không viết lại từ đầu |
| Live GitHub stats fetch | inline `<script>`, fetch `api.github.com/repos/...` | Đúng hướng "Built in the open" (Section 12 brief) — ẩn khi fail, không giả số |
| OS-based download auto-detect | `data-platform` + JS | Logic đúng, tái dùng cho `/download` mới |
| Dark mode đầy đủ | `docs/desktop-redesign.css` `@media (prefers-color-scheme: dark)` | Đã đúng chuẩn token, không cần viết lại |
| Palette Jade Lake (`--primary: #257967`) | `desktop-redesign.css` `:root` | Anh muốn giữ "the calm Yana identity" — đây chính là identity đó |
| Gate-demo mockup (`rm -rf`/`git push --force` bị chặn) | `docs/index.html` features section | Đúng tinh thần Section 7 brief ("Governed Execution") — chỉ cần chuyển vị trí/mở rộng, không xoá |
| 3D-tilt mockup + `prefers-reduced-motion` fallback | `docs/index.html` hero script | Motion discipline đã đúng chuẩn `anti-ai-slop-design-law.md` §4 |

### Phải bỏ / viết lại hoàn toàn (positioning, không phải mã)

| Phần | Vấn đề |
|---|---|
| Toàn bộ hero copy ("Trợ lý AI trên máy của bạn") | Kể câu chuyện "Yana = 1 app desktop" — đúng cái anh vừa nói phải dừng |
| Nav: `Yana AI DESKTOP \| Trang chủ \| GitHub \| Releases \| Download` | Đúng tư duy cũ anh muốn bỏ hẳn — thay bằng `Yana / Products / Developers / Governance / Story / Docs ... GitHub / Download` |
| Cấu trúc 1-trang-dài (`index.html` chứa mọi thứ: hero, features, FAQ, platforms, CTA) | Anh yêu cầu multi-page thật (`/studio`, `/runtime`, `/governance`...), không phải section trong 1 trang |
| Features section 6-card về "Desktop app" (Bring your own API key, 2025 skills, works offline, smart dashboard...) | Đúng nội dung nhưng đang đại diện cho "cả Yana" trong khi thực ra là tính năng của 1 nhánh (Runtime+Governance) — cần tách theo product area |
| FAQ hiện tại (chỉ hỏi về Desktop app: giá, riêng tư, API key, "2 interface cũ/mới") | Không còn phù hợp khi site là ecosystem — cần FAQ theo từng product page |

### Media hiện có (kiểm `find`, không suy đoán)

| Asset | Vị trí | Dùng được không |
|---|---|---|
| `yana-logo.png`, `logo.svg`, `yana-banner-light/dark.svg` | `docs/` | ✅ Logo/banner — tái dùng |
| `demo.gif`, `demo.cast`, `demo.svg`, `demo.sh` (asciinema) | `docs/`, `docs/assets/` | ✅ Demo CLI thật — dùng cho `/runtime` hoặc `/developers` |
| Ảnh chụp OpenAI Codex (7 file `Ảnh màn hình...png`) | `docs/` | ❌ **KHÔNG phải asset của Yana** — đây là ảnh anh gửi làm tài liệu tham khảo thiết kế, không phải asset website. Cần dọn khỏi `docs/` trước khi build (không phải file web, chỉ là file tạm anh gửi qua) |
| Ảnh chụp Yana Studio thật | — | ❌ **CHƯA CÓ** — đã hỏi anh 2 lần trong phiên trước, chưa nhận được. Chi tiết ở `MEDIA_INVENTORY.md` |
| Ảnh/render Wheelbot | — | ❌ **CHƯA CÓ trong repo Yana-AI** — cần kiểm repo `yana-wheelbot` riêng (chưa làm, ngoài phạm vi audit lần này vì đó là repo khác) |

## 4. Kết luận Phase 0

- Repo ecosystem thật gồm: **Yana-AI** (chính) + **yana-wheelbot** +
  **yana-web** (độc lập). `Yana-AI-Chat_Teminal` cần anh xác nhận trước khi
  quyết định đưa vào hay không.
- Kiến trúc/subsystem đã audit đủ sâu ở 2 file trước — không audit lại.
- Trang web hiện tại: hạ tầng kỹ thuật (i18n, dark mode, live stats, gate
  demo, palette) đáng giữ; toàn bộ **nội dung/positioning/nav/cấu trúc
  1-trang** phải viết lại theo IA mới.
- 7 file ảnh Codex trong `docs/` cần dọn (không phải asset web).
- **Chưa có ảnh Studio thật, chưa có media Wheelbot** — chặn Phase 5/11
  của IA cho đến khi có.

Xem tiếp: `PRODUCT_TRUTH_MATRIX.md`, `INFORMATION_ARCHITECTURE.md`.
