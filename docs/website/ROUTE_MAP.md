# Route Map — Yana Ecosystem Website

Danh sách URL cụ thể theo `INFORMATION_ARCHITECTURE.md`, cộng redirect
plan cho route cũ. Đây là bản đề xuất — cần anh xác nhận trước khi build
(đặc biệt phần redirect, vì ảnh hưởng link cũ đã chia sẻ).

## URL đầy đủ

```
/                              — trang chủ ecosystem (14 section theo brief)
/products                      — danh sách nhánh

/studio                        /studio/features   /studio/governance
/studio/downloads              /studio/install

/runtime                       /runtime/architecture   /runtime/capabilities
/runtime/providers             /runtime/install

/governance                    /governance/authority   /governance/capabilities
/governance/approvals          /governance/audit        /governance/halt

/os                            /os/lifecycle   /os/autonomy   /os/health-supervision

/wheelbot                      /wheelbot/yana-connection   /wheelbot/repository

/integrations                  /integrations/claude-code   /integrations/codex
/integrations/cursor           /integrations/antigravity   /integrations/discord
/integrations/mcp

/developers                    /developers/quickstart   /developers/architecture
/developers/cli                /developers/python        /developers/rust
/developers/providers          /developers/contributing

/docs           (doc site — left-nav/TOC/search riêng, không phải 1 route tĩnh)
/download
/releases
/changelog
/roadmap
/story          /story/lessons
/principles
/security
/about
```

## Redirect từ route cũ

| Route cũ | Trạng thái hiện tại | Đề xuất |
|---|---|---|
| `yana.vutam.link/` | Trang download Desktop app duy nhất | Trở thành trang chủ ecosystem MỚI — nội dung Desktop-app-download cũ dời sang `/studio/downloads` hoặc `/download` (xem mục "Cần anh quyết" dưới) |
| `yana.vutam.link/desktop.html` | Bản gần-song-song với `/`, câu hỏi này đã hỏi anh 2 lần trong phiên trước, **chưa có câu trả lời** | Đề xuất: 301 → `/studio` (vì nội dung file này thực chất đang nói về app Desktop, gần với vai trò Studio/product-page hơn là trang chủ ecosystem). **Cần anh xác nhận — đây là quyết định ảnh hưởng SEO, không tự quyết.** |
| `.claude/docs/index.html`, `.claude/docs/desktop.html` | Bản mirror byte-identical (yêu cầu bởi `check_counts.py`) | Giữ nguyên cơ chế mirror — bất kỳ file `docs/*.html` mới cũng cần mirror tương ứng nếu `MIRROR_PAIRS` trong `check_counts.py` được mở rộng, hoặc bỏ mirror nếu 2 file cũ bị xoá hoàn toàn (cần sửa `check_counts.py`, không tự ý xoá ràng buộc) |

## Đã quyết (anh Tâm, 2026-09-10)

1. ✅ **`/download` là route download CANONICAL cho toàn ecosystem** —
   không đặt download center chính ở `/studio/downloads`. `/download`
   chứa: Studio/Desktop, `yana-ai` (pip), `yana-rt` (cargo), Wheelbot
   firmware (khi có), và mọi artifact chính thức khác. Trang Studio chỉ
   link/filter sang `/download`, không tự làm download center riêng.
   Giữ nguyên hành vi tốt của trang cũ (OS detection, architecture
   detection, platform instructions, macOS/Windows/Linux install steps) —
   chuyển sang kiến trúc phân phối ecosystem, không viết lại từ đầu.

## Cần anh quyết trước khi build (không tự chọn)

1. **`docs/desktop.html` giữ hay xoá hoàn toàn?** Nếu route mới không cần
   1 bản gần-song-song với `/`, file này có thể nghỉ hưu (redirect, không
   xoá code — theo thói quen repo giữ file cũ làm historical reference,
   xem cách `docs/ARCHITECTURE.md` tự nhận lỗi thời nhưng không bị xoá).

## Framework — khuyến nghị (đã audit `yana-web`, xem mục 13 brief anh)

**Khuyến nghị: KEEP CURRENT (static HTML nhiều file)** cho phần marketing/
ecosystem site (`/`, `/products`, `/governance`, `/story`...), với 1 ngoại
lệ có chủ đích cho `/docs` (doc site thật cần sidebar/TOC/search).

**Justification kỹ thuật** (không chọn vì "React/Next mới hơn" — đúng luật
anh đặt): audit `tools/yana-web` (flagship product thật của ecosystem)
cho thấy chính nó KHÔNG dùng framework nặng — `server.js` là 1 Node
`http.createServer` tự viết + `serveStatic()` router thuần, chỉ phần UI
tương tác (`desktop-src/`) dùng React 18.3.1 + Vite 6.4.3, build ra static
trước khi serve. Site marketing hiện tại (`docs/index.html`) đã có i18n
4 ngôn ngữ, dark mode, live GitHub stats, gate-demo mockup — tất cả chạy
tốt bằng vanilla JS/CSS, không cần build step. Multi-page (10+ trang mới
theo IA) tăng số FILE, không tự động đòi hỏi framework — HTML tĩnh nhiều
file vẫn maintain được ở quy mô này, và giữ đúng "the website must remain
usable if GitHub API calls fail" (brief mục GITHUB INTEGRATION) dễ hơn với
static.

**Ngoại lệ:** `/docs` (sidebar/TOC/search/copy-code-button/prev-next) —
tự viết những thứ này bằng vanilla JS tốn công hơn dùng 1 công cụ doc-site
có sẵn (VitePress/Docusaurus/Starlight). Đề xuất: static HTML cho toàn
site, riêng `/docs` dùng 1 doc-site generator — **cần anh xác nhận có
đồng ý ngoại lệ này hay muốn 100% tự viết để giữ nhất quán tuyệt đối.**
