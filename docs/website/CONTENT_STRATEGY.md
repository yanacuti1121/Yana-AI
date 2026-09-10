# Content Strategy — Homepage + Story

Ánh xạ 14 section trang chủ (brief 2026-09-10) sang nguồn sự thật cụ thể —
mỗi section phải trace được về 1 dòng trong `PRODUCT_TRUTH_MATRIX.md` hoặc
1 file audit đã có. Không viết copy tự do.

## Nguyên tắc chung (áp dụng mọi section)

- Mỗi claim → tra `PRODUCT_TRUTH_MATRIX.md` trước khi viết (luật đã ghi
  trong file đó).
- Không dùng tính từ marketing không kèm bằng chứng ("enterprise-grade",
  "powerful", "revolutionary") — đúng `text-slop-law.md` + yêu cầu riêng
  của anh: "remove all marketing adjectives, does it still make Yana
  technically interesting?"
- Số liệu (skills/agents/rules/hooks/commands) — sinh từ
  `MANIFEST.json`/`check_counts.py` tại build time nếu có thể, không viết
  cứng ("Do not hard-code ecosystem counts" — Deep Architecture §26).

## Section-by-section

| # | Section | Nguồn sự thật | Ghi chú viết |
|---|---|---|---|
| 1 | Hero | `README.md` positioning mới nhất ("One Runtime. Any AI. Human-Governed.") + Deep Architecture §93 | Dùng câu của anh hoặc biến thể — KHÔNG copy máy móc "INTELLIGENCE IS REPLACEABLE. AUTHORITY IS NOT." nếu chưa test độ rõ với người ngoài |
| 2 | The Problem | Deep Architecture §1, §3 | "AI có thể làm sai rất nhanh" — dùng ví dụ CỤ THỂ từ Truth Matrix (rm -rf, force push), không nói chung |
| 3 | Intelligence != Authority | Deep Architecture §1, §66-67 | Danh sách model bên trái PHẢI khớp catalog thật (`src/model/catalog.rs`) — không tự thêm model chưa hỗ trợ |
| 4 | How Yana Works | Deep Architecture §0, §87 (Current System Map) | Dùng đúng sơ đồ đã có, không vẽ lại khác |
| 5 | One Ecosystem | `INFORMATION_ARCHITECTURE.md` — 6 nhánh đã điều chỉnh | Card Wheelbot/OS ghi rõ trạng thái sớm (không cùng mức "hoàn thiện" như Runtime/Governance) |
| 6 | Yana Studio | `PRODUCT_TRUTH_MATRIX.md` mục Studio | **Chặn bởi thiếu ảnh thật** — xem `MEDIA_INVENTORY.md`. Không dùng mockup CSS giả làm "real product visual" cho section này — brief cấm rõ |
| 7 | Governed Execution | `file.write` lifecycle (LIVE, đã verify PR #319) | Animation propose→diff→guard→approval→backup→write→verify→evidence — đây là claim mạnh nhất, có bằng chứng tốt nhất, nên đầu tư kỹ nhất |
| 8 | Use the AI You Want | `src/model/catalog.rs` (19-provider catalog theo Deep Architecture §8) | Sinh động từ catalog nếu khả thi, không đếm tay |
| 9 | Works With Your Tools | Deep Architecture §21 | PHẢI nói rõ "enforcement strength differs by host" — cấm câu "hard-blocks every dangerous command in every agent" |
| 10 | Continuity | Deep Architecture §32-34, §37-38 | Project Memory là claim LIVE mạnh, mới xác nhận — ưu tiên nhắc |
| 11 | Yana Wheelbot | `PRODUCT_TRUTH_MATRIX.md` mục Wheelbot — phần lớn UNKNOWN | Rút gọn theo `INFORMATION_ARCHITECTURE.md` điều chỉnh #1 — không tự bịa chi tiết hardware |
| 12 | Built in the Open | Live GitHub stats fetch đã có sẵn trong `docs/index.html` | Tái dùng cơ chế cũ, mở rộng số liệu (commits/CI) nếu cần, giữ nguyên tắc "ẩn khi fail, không giả số" |
| 13 | The Story | `YANA-BUILD-JOURNEY-DRAFT.md` — **DRAFT CHƯA DUYỆT** | KHÔNG copy nguyên văn lên web — chờ anh duyệt bản rút gọn cuối, và sửa 2 lỗi đã tìm ra (PR #85 = 31 commits không phải 28; PR #324 nhầm — Studio Wave thật là PR #323) |
| 14 | CTA | — | 4 lối vào (Download Studio / Install Runtime / Explore GitHub / Read Docs) — khớp đúng brief, không cần audit thêm |

## `/story` page — nguyên tắc riêng

Nguồn: `YANA-BUILD-JOURNEY-DRAFT.md`. Trước khi đăng bất kỳ đoạn nào:

1. Sửa 2 lỗi đã tìm ra (PR #85 commit count, PR #324→#323 nhầm số).
2. Bỏ/làm mờ các số liệu chưa verify được (18B token, sự kiện 16/06,
   "9 lần fail macOS") — xem mục "Không kiểm chứng được" trong file đó —
   hoặc đổi thành ngôn ngữ không cần số chính xác.
3. Anh duyệt bản rút gọn cuối — file draft tự ghi rõ điều này, không tự ý
   bỏ qua bước duyệt.
4. `/story/lessons` — dùng đúng các ví dụ anh đưa trong brief mới nhất
   ("Green source build, broken packaged app", "Guard existed, wrapper
   never called it", "Provider failure looked like zero available
   models", "Approval is not execution", "Implemented is not integrated")
   — mỗi cái đã có bằng chứng thật trong `PRODUCT_TRUTH_MATRIX.md`/
   `docs/reference/known-limitations.md`, không cần viết thêm case mới.

## Tone check trước khi publish bất kỳ trang nào

Câu hỏi bắt buộc tự hỏi (từ brief anh, "Final Honesty Test"):
> Remove all marketing adjectives. Does the website still make Yana
> technically interesting? If NO, the website is relying on marketing
> instead of architecture.

Và (từ "Most Important Product Test"):
> Mentally remove Yana Studio. Does the remaining website still clearly
> describe a meaningful Yana platform? If NO, fix the architecture.
