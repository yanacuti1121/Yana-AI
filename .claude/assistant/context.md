# Current Context

**Cập nhật lần cuối:** 2026-05-31 (wrap-up)

## Trạng thái
- yamtam-engine v0.17.0 — npm ✅ PyPI ✅ crates.io ✅
- CI ✅ YAMTAM Audit ✅ tất cả xanh
- 2,207 skills, 93 agents
- Disk: 85% (718MB trống) — cargo clean đã chạy hôm nay
- 4 security findings trong src/ đã fix (SSRF, file-read, path-traversal)

## Phase hiện tại: STABILIZE
Không thêm feature mới. Chỉ fix và ổn định.

## Ưu tiên tiếp theo
1. **Rotate tokens** (npm + crates.io + PyPI) → update GitHub Secrets ← vẫn pending
2. Codexmate VI patch — debug trên Cloud Shell (patch.py chưa ăn ở đó)
3. Benchmark table Rust vs Python trong README
4. Chạy `agentshield scan .` để audit agent config (tool mới import hôm nay)

## Đã biết / blockers
- Token rotation: anh cần tự làm trên web rồi update GitHub Secrets
- Codexmate chạy bằng `CODEXMATE_PORT=8080 codexmate run` + Web Preview 8080
- Disk chật — build Rust phải dùng `CARGO_TARGET_DIR=/tmp/yamtam-build cargo build`
- cargo clean trước build nếu disk gần đầy lại

## Ghi chú
- Anh dùng Google Cloud Shell
- strix --mode experts: recon + 12 OWASP families, tìm được 4 real bugs hôm nay
- agentshield: scan .claude/ config (khác strix — strix scan source, agentshield scan agent config)
