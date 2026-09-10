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
| `yana.vutam.link/` | Trang chủ ecosystem (đã redesign, PR #325) | ✅ Giữ nguyên — đây chính là route duy nhất |
| `yana.vutam.link/desktop.html` | **ĐÃ XOÁ (2026-09-10, quyết định của anh: "xóa chỉ giữ đúng một trang duy nhất yana.vutam.link")** | Không redirect — file không còn tồn tại. Mọi link nội bộ từng trỏ tới `/desktop.html` (`docs/commands.html` nav) đã cập nhật sang `/#ecosystem` + `/governance.html`. |
| `.claude/docs/index.html` | Bản mirror byte-identical (yêu cầu bởi `check_counts.py`) | ✅ Giữ — `MIRROR_PAIRS` trong `check_counts.py` giờ chỉ còn đúng 1 cặp (index.html), đã xoá cặp desktop.html khỏi cả `core/scripts/` và `.claude/scripts/` |

## Đã quyết (anh Tâm, 2026-09-10)

1. ✅ **`/download` là route download CANONICAL cho toàn ecosystem** —
   không đặt download center chính ở `/studio/downloads`. `/download`
   chứa: Studio/Desktop, `yana-ai` (pip), `yana-rt` (cargo), Wheelbot
   firmware (khi có), và mọi artifact chính thức khác. Trang Studio chỉ
   link/filter sang `/download`, không tự làm download center riêng.
   Giữ nguyên hành vi tốt của trang cũ (OS detection, architecture
   detection, platform instructions, macOS/Windows/Linux install steps) —
   chuyển sang kiến trúc phân phối ecosystem, không viết lại từ đầu.

2. ✅ **`docs/desktop.html` — xoá hoàn toàn** (anh Tâm, 2026-09-10). Đã xoá
   `docs/desktop.html` + `.claude/docs/desktop.html`, gỡ khỏi
   `MIRROR_PAIRS`/`MARKETING_FILES` trong `core/scripts/check_counts.py`
   và `.claude/scripts/check_counts.py`, gỡ khỏi vòng lặp
   `check_doc_stat` trong `core/scripts/drift-check.sh`, cập nhật
   `tests/test_project_metadata.py` (1 test viết lại để không phụ thuộc
   cặp mirror đã xoá), `VERSIONING.md`, `docs/RELEASE-CHECKLIST.md`,
   `.github/workflows/herald.yml`, và nav của `docs/commands.html`.

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
