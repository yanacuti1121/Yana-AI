# Current Context

**Cập nhật lần cuối:** 2026-06-01

## Trạng thái
- yamtam-engine v0.17.0 — npm ✅ PyPI ✅ crates.io ✅
- CI ✅ YAMTAM Audit ✅ tất cả xanh
- 2,229 skills, 93 agents
- Website: 3 trang (index, skills, marketplace) — light warm theme, i18n EN/VI/KO ✅
- Projects section: JNMT featured card + jnmt.vn, itro, yamtam grid ✅
- Codexmate section: 4-step guide + v0.0.38-vi badge ✅
- 4 security findings trong src/ đã fix (SSRF, file-read, path-traversal) ✅
- agentshield scan ✅ done

## Phase hiện tại: STABILIZE
Không thêm feature mới. Chỉ fix và ổn định.

## Ưu tiên tiếp theo
1. **Rotate tokens** (npm + crates.io + PyPI) → update GitHub Secrets ← vẫn pending (anh tự làm trên web)

## Đã biết / blockers
- Token rotation: anh cần tự làm trên web rồi update GitHub Secrets
- Codexmate chạy bằng `CODEXMATE_PORT=8080 codexmate run` + Web Preview 8080
- Disk /home 90% full (4.8G) — `.cache/claude/staging/` tự-tải Claude updates, ăn hết freed space
- Build Rust: CARGO_TARGET_DIR=/tmp/yamtam-build cargo build
- Session bị lỗi 1M token khi đang tổng hợp context — tiếp tục session mới

## Ghi chú
- Anh dùng Google Cloud Shell
- strix --mode experts: recon + 12 OWASP families, 4 bugs tìm + fix
- codexmate: EN|VI only, zh fallback removed, hook traceback fixed
- Build Rust: CARGO_TARGET_DIR=/tmp/yamtam-build cargo build
- agentshield: scan .claude/ config (khác strix — strix scan source, agentshield scan agent config)
- JNMT: 6 ngôn ngữ thực tế (không phải 100), 620k dòng tự viết, 55 deployments
- marketplace.html: 2,571 items (skills+agents+hooks+commands+rules)
