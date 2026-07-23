# Program F — Cost-Aware Specification Refusal — Skeleton

**Status:** Specification Required
**Created:** 2026-07-23
**Blocked by:** Program D §D7 (Specification-first Development).

> Cấu trúc này CHƯA có nội dung thật, và tên Program F ở đây còn tạm hơn cả
> H/J — chỉ mới xuất hiện lần đầu trong chỉ đạo hôm nay (2026-07-23), chưa
> từng được đặt tên hay viết ra trước đó ở bất kỳ đâu trong repo. Tên file
> và tiêu đề trên là suy đoán hợp lý từ mô tả bằng lời của anh Tâm, KHÔNG
> phải tên chính thức đã xác nhận — cần anh Tâm xác nhận hoặc đổi tên khi
> điền specification.

## Vision

_(TODO — điền từ đặc tả gốc)_

## Problem Statement

Mô tả bằng lời từ chỉ đạo 2026-07-23 (paraphrase, không phải trích dẫn
chính xác — cần xác nhận lại khi viết specification thật):

Khi một task cần nhiều context hơn những gì đang có sẵn (ví dụ: Wave 2 cần
nội dung Program H/J mà repo không có), Yana nên có khả năng nói thẳng
"không đủ specification để tiếp tục" — thay vì grep cả repo, đọc hàng
nghìn file, tiêu tốn hàng trăm nghìn token, rồi vẫn phải hỏi lại. Đây là
biểu hiện cụ thể của "Cost-aware AI".

**Lưu ý:** hành vi cụ thể xảy ra hôm nay (dừng lại, hỏi thay vì tiếp tục
suy diễn Program H/J) là một ví dụ thực tế của ý tưởng này, không phải
bằng chứng rằng Program F đã được implement — hành vi đó hiện là kỷ luật
tự áp dụng của AI trong phiên làm việc, chưa phải một capability có code
riêng.

## Design Goals

_(TODO)_

## Non-Goals

_(TODO)_

## Capability List

_(TODO)_

## Architecture

_(TODO)_

## ADR References

_(TODO)_

## Readiness Checklist

- [ ] Repository Readiness
- [ ] Memory Readiness
- [ ] Runtime Readiness
- [ ] Governance Readiness
- [ ] Cost Readiness

## Open Questions

- Tên "Program F" có đúng không, hay đây thực ra là một phần của Program D
  (Engineering Excellence) chứ không phải Program riêng?
- Ranh giới với `70-context-faithfulness-law.md` và
  `69-cognitive-reliability-law.md` (đã có sẵn, cùng tinh thần "không suy
  diễn khi thiếu bằng chứng") là gì — Program F là một rule mới, hay là
  một capability kỹ thuật cụ thể hoá 2 rule đó (ví dụ: một hàm ước tính
  "đủ context chưa" trước khi bắt đầu một task lớn)?
