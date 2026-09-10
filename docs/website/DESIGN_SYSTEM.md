# Design System — Yana Ecosystem Website

Đề xuất token/nguyên tắc, dựa trên palette "Jade Lake" đã có thật trong
`docs/desktop-redesign.css` (giữ theo yêu cầu anh: *"Preserve the calm
Yana identity"*) + brief thiết kế 2026-09-10 + các rule đã load sẵn trong
repo (`anti-ai-slop-design-law.md`, `color-rules.md`, `typography-rules.md`,
`frontend-production-checklist.md`). Đây là PROPOSAL — chưa áp dụng.

## Màu — mở rộng từ token đã có, không đổi identity

```
--primary:   #257967   (đã có — Jade Lake)
--pink:      #d47d9a   (đã có — accent phụ)
--blue:      #477fd1   (đã có — accent phụ)
--gold:      #b68b42   (đã có — accent phụ, dùng cho macOS platform card)
```

Giữ đúng 4 màu này — brief anh liệt "soft blue, pale cyan, white, subtle
green" và cấm "generic purple AI gradient/neon cyberpunk/matrix green" —
palette hiện tại đã tránh đúng những cái đó (không tím, không neon), chỉ
cần **kỷ luật hơn về nơi dùng gradient** (h1 gradient text đã bị cấm và đã
sửa ở PR #324 — giữ nguyên quy tắc đó cho mọi trang mới).

**Semantic status colors (MỚI — cần thêm)** cho `PRODUCT_TRUTH_MATRIX.md`
hiển thị trên web (badge Stable/Beta/Experimental/Planned):

```
--status-live:          #257967  (dùng lại --primary — nhất quán, không thêm màu mới)
--status-unwired:       #b68b42  (dùng lại --gold — "cảnh báo nhẹ", không phải lỗi)
--status-experimental:  #477fd1  (dùng lại --blue)
--status-deferred:      var(--fg-faint)  (trung tính — chưa xây, không cần màu nổi)
```

Không thêm màu mới ngoài 4 màu đã có + neutral — đúng
`color-rules.md`: "no more than 1 accent color per view (2 max)".

## Liquid glass — dùng đúng nơi brief chỉ định

```
✅ Nav sticky, floating architecture-diagram controls, status chip/badge,
   product selector dropdown, small overlay, diagram node
❌ Mọi card đều translucent, text trên gradient nhiễu, blur phá contrast
```

Kỹ thuật: `backdrop-filter: blur(12px)` + `background: rgba(255,255,255,.82)`
— **đúng pattern nav hiện có trong `docs/index.html`** (đã dùng blur cho
nav từ trước), mở rộng sang các chỗ brief chỉ định, KHÔNG lan ra toàn bộ
site (đúng ngoại lệ có kiểm soát trong `anti-ai-slop-design-law.md` §2 —
glass là "rare and purposeful", không phải default).

## Typography

Giữ `--sans: "Be Vietnam Pro", ui-sans-serif, system-ui...` đã có (hỗ trợ
tiếng Việt tốt, đã dùng toàn site). Thêm `--mono` (đã có trong
`desktop-redesign.css`) cho mọi đoạn code/command/CLI trong trang
`/developers`, `/runtime`.

Scale mới cho trang sản phẩm nhiều tầng (không chỉ 1 trang dài như hiện
tại):

```
--display: clamp(3.5rem, 7vw, 6.5rem)   /* hero — brief đề xuất tới 8rem, giảm nhẹ để giữ tỷ lệ với nav/logo hiện có */
--h1:      clamp(2.5rem, 5vw, 4rem)      /* đầu mỗi trang sản phẩm */
--h2:      clamp(1.75rem, 3vw, 2.5rem)   /* section trong trang */
```

(Kế thừa `--font-size-*` đã định nghĩa trong `typography-rules.md` cho các
cấp nhỏ hơn — không định nghĩa lại.)

## Motion — theo đúng nguyên tắc đã có + brief mới

Site hiện tại đã có 3D-tilt mockup + `prefers-reduced-motion` fallback
(đúng chuẩn). Brief yêu cầu thêm 1 animation ý tưởng: request di chuyển từ
model → Yana → capability → execution → evidence. Áp dụng
`frontend-production-checklist.md` §4 (duration theo mục đích, không theo
cảm giác):

```
Model swap animation (Claude/Gemini/Ollama/Codex đổi chỗ, YANA cố định):
  transform/opacity only, 300–500ms mỗi swap, dừng hẳn nếu prefers-reduced-motion
Request-flow animation (Section 4 — model→Yana→capability→execution):
  KHÔNG dùng framework animation lớn — CSS/Web Animations API, dùng lại
  --primary/--gold để tô màu trạng thái (proposal/allow/deny), không thêm
  màu semantic mới ngoài bảng "Semantic status colors" trên
```

## Cards — brief cấm "40 tiny feature card", đã có tiền lệ tốt

`docs/index.html` PR #324 đã sửa đúng 1 lần: bỏ big-number-stat, thay bằng
`.gate-demo` mockup thật cho card "spotlight". **Áp dụng nguyên tắc đó cho
toàn site**: Section 5 "One Ecosystem" trong brief dùng "Large product
cards, NOT generic feature cards" — nghĩa là mỗi card Runtime/Governance/
Studio/OS/Wheelbot/Integrations cần 1 chi tiết cụ thể riêng (không phải
icon+title+text lặp lại 6 lần) — xem `CONTENT_STRATEGY.md` cho nội dung
cụ thể từng card.

## Việc CHƯA quyết — cần anh chọn trước Phase 2

1. Framework — **đã có khuyến nghị cụ thể** sau khi audit `tools/yana-web`
   (xem `ROUTE_MAP.md` mục "Framework — khuyến nghị"): KEEP CURRENT static
   HTML cho toàn site, ngoại lệ 1 doc-site generator riêng cho `/docs`.
   Cần anh xác nhận đồng ý ngoại lệ này.
2. Kích thước hero display (`clamp(3.5rem,...)` em đề xuất giảm so với
   brief `clamp(4rem, 8vw, 8rem)` — vì trang chủ hiện tại đang dùng
   `clamp(2rem, 4vw, 3.3rem)` cho section-title, nhảy thẳng lên 8rem có
   thể lệch tỷ lệ toàn site. Cần anh xác nhận có muốn hero thật sự lớn
   theo đúng brief, hay giữ nhịp gần với site hiện tại hơn.
