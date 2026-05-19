# YAMTAM ENGINE — Maintenance Policy

> Version: 1.3.25-clean | Updated: 2026-05-19

## Chu kỳ review định kỳ

**Chu kỳ chuẩn:** 3–6 tháng

Mỗi chu kỳ, chạy `/hook-review` để đánh giá toàn bộ hook còn hiệu quả không.
Ghi kết quả vào `docs/reviews/YYYY-MM-DD-hook-review.md`.

**Trigger phụ — review sớm hơn nếu:**
- Major release của Claude Code (version bump đáng kể)
- Hook báo false positive liên tục (>3 lần trong 1 tuần)
- Hook im lặng quá lâu (không fire trong 30 ngày dù workflow hoạt động)
- Anthropic thay đổi hook API hoặc event type

## Tiêu chuẩn Metadata cho Hook
Mọi file hook trong `core/hooks/*.sh` phải bắt đầu bằng header sau:
```bash
#!/bin/bash
# YAMTAM ENGINE Hook
# Version: x.y.z
# Status: [active|review|deprecated]
# Description: [Mô tả ngắn gọn chức năng]
# Last Reviewed: YYYY-MM-DD
```
Việc thiếu header này sẽ khiến `/hook-review` đánh dấu hook là `NEEDS ATTENTION`.

## Vòng đời hook

Mỗi hook ở một trong bốn trạng thái:

| Trạng thái | Ý nghĩa | Hành động |
|-----------|---------|-----------|
| `active` | Đang hoạt động đúng, có test | Giữ nguyên |
| `review` | Nghi ngờ lỗi thời hoặc false positive | Review trong chu kỳ tiếp |
| `deprecated` | Sẽ bỏ, còn giữ tạm | Đánh dấu header, lên lịch xóa |
| `removed` | Đã xóa | Ghi vào CHANGELOG, xóa khỏi wiring |

**Quy trình chuyển trạng thái:**
```
active → review     : khi có dấu hiệu vấn đề
review → active     : sau khi fix và test pass
review → deprecated : quyết định bỏ
deprecated → removed: sau 1 chu kỳ review
```

## Rủi ro hook lỗi thời

Hook lỗi thời (stale hook) nguy hiểm hơn không có hook:
- Chặn workflow hợp lệ (false positive) → AI không làm được việc
- Im lặng khi lẽ ra phải chặn (false negative) → mất bảo vệ
- Tốn token mỗi call nhưng không đem lại giá trị

Dấu hiệu hook lỗi thời:
- Pattern match quá rộng hoặc quá hẹp so với thực tế hiện tại
- Không có test hoặc test không cover edge case thật
- Comment header ghi version cũ hơn 2 minor releases

## Quy trình review một chu kỳ

Chạy: `/hook-review`

Lệnh này sẽ:
1. Liệt kê tất cả hook đang active
2. Kiểm tra mỗi hook có test không
3. Kiểm tra version header có đồng bộ không
4. Gợi ý trạng thái mới dựa trên evidence
5. Xuất report để human quyết định

Human duyệt report → Claude Code thực thi các thay đổi được chọn.

## Lưu review history

```
docs/reviews/
  YYYY-MM-DD-hook-review.md     ← output của /hook-review
  YYYY-MM-DD-release-notes.md   ← sau major Claude Code release
```

Không xóa review cũ. Chúng là bằng chứng audit trail.

---

## Release Zip Policy

Release zips trong `releases/` làm repo phình to với mỗi version. Quy tắc:

### Giữ trong repo (main branch)
- `yamtam-engine-latest.zip` — symlink, luôn giữ
- Bản **hiện tại** (vừa build)
- Bản **trước đó** (1 bản trước)

### Không giữ trong repo
- Các bản cũ hơn 2 releases → đưa lên **GitHub Releases** để archive
- Không commit `releases/yamtam-engine-v1.3.X-fixed.zip` cũ vào main

### Cách archive lên GitHub Releases
```bash
gh release create vX.Y.Z releases/yamtam-engine-vX.Y.Z-fixed.zip \
  --title "YAMTAM ENGINE vX.Y.Z" --notes "See CHANGELOG.md"
```

### Rationale
Repo scaffold chỉ cần latest để test offline install. Lịch sử đầy đủ đã có trong CHANGELOG.md và GitHub Releases. Giữ toàn bộ zips trong git làm `git clone` ngày càng chậm.

**Hiện trạng (2026-05-19):**

| Bản | Kích thước | Giữ? |
|---|---|---|
| v1.3.22-fixed.zip (latest) | 892K | ✅ Giữ |
| v1.3.21-fixed.zip | 854K | ✅ Giữ (previous) |
| v1.3.0 → v1.3.20 (17 bản) | 204K–852K mỗi bản | ⚠️ Nên archive lên GitHub Releases |

Tổng 19 zips ≈ 8MB trong repo. Chưa xóa — cần human duyệt trước khi cleanup.
