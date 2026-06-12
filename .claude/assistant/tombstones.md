# Tombstones — ký ức đã chết, không được đội mồ

> **Luật:** trước khi nhắc bất kỳ pending / alert / fact nào trong briefing,
> đối chiếu bảng này. Fact khớp pattern = ĐÃ CHẾT — không nhắc lại.
> Nếu thấy nó còn "sống" trong `context.md` / `milestones.md` → đó là zombie,
> xóa nó ở đó luôn rồi mới ra briefing.
>
> Khi đóng một việc: KHÔNG chỉ sửa một file. Quy trình bắt buộc:
> 1. Thêm 1 dòng vào bảng dưới (pattern + evidence)
> 2. Quét cả `context.md` + `milestones.md` xóa/đánh dấu mọi chỗ fact đó còn sống
> 3. `memory-gc.py` sẽ bắt sót — nếu nó kêu ZOMBIE thì bước 2 làm chưa sạch

<!-- Pattern là regex (case-insensitive). Mọi dấu "|" trong regex PHẢI viết "\|" để không vỡ bảng. -->

| Closed | Pattern (regex, case-insensitive) | Lý do chết / evidence |
|--------|-----------------------------------|----------------------|
| 2026-06-03 | token rotation | Rotation NPM+CARGO+PYPI xong 03/06 — nhưng alert nhắc dai tới 12/06 mới đóng. Vụ này là lý do file này tồn tại. |
| 2026-06-12 | fine-grained.*(không\|khong\|can't\|cannot).*comment | Ghi chú cũ SAI: token classic comment được sang SakuraByteCore (evidence: issuecomment-4688928819) |
| 2026-06-12 | node ?24.*(pin\|action\|runtime)\|action.*pin.*node ?24 | Commit 6818cb34 bump 17 dòng uses: trên 6 workflow, CI + Pages xanh — xong trước deadline 16/06. Alert 🔴 vẫn kêu tối 12/06 → zombie thứ hai. |
| 2026-06-12 | push yamtam-engine\|chưa push.*yamtam | Main = origin từ 12/06 chiều (anh ra lệnh push). Credential qua GIT_ASKPASS + cache 8h. |
