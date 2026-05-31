# Current Context

**Cập nhật lần cuối:** 2026-05-30 (wrap-up)

## Trạng thái
- yamtam-engine v0.17.0 — npm ✅ PyPI ✅ crates.io ✅
- CI ✅ YAMTAM Audit ✅ tất cả xanh
- 2,204 skills — số liệu đã sync đồng nhất
- Disk: 92% (389MB trống)

## Phase hiện tại: STABILIZE
Không thêm feature mới. Chỉ fix và ổn định.

## Ưu tiên tiếp theo
1. **Rotate tokens** (npm + crates.io + PyPI) → update GitHub Secrets
2. Codexmate VI patch — debug trên Cloud Shell (patch.py chưa ăn ở đó)
3. DIRECTION.md — anh muốn update nhưng chưa nói rõ phần nào
4. Benchmark table Rust vs Python trong README

## Đã biết / blockers
- Token rotation: anh cần tự làm trên web rồi update GitHub Secrets
- Codexmate chạy bằng `CODEXMATE_PORT=8080 codexmate run` + Web Preview 8080
- Disk vẫn chật — tránh cargo build, npm install nặng

## Ghi chú
- Anh dùng Google Cloud Shell
- jnmt.vn + jnmt-vn-work đã xóa khỏi Cloud Shell (vẫn có trên GitHub)
