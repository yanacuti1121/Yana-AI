# Current Context

**Cập nhật lần cuối:** 2026-06-06

## Trạng thái
- yamtam-engine v0.40.0 — CI ✅ · Pages ✅ · repo clean
- Disk: 79% (~988MB free) — đã dọn sạch sáng nay
- Git user: đã fix lại "Vũ Văn Tâm" (bị Gemini set thành "Gemini AI")
- Submodule codexmate: đã fork → phamlongh230-lgtm/codexmate, VI patch pushed, URL updated
- lotus-petals.js: cánh sen nhỏ + bông hoa đầy đủ rơi, pause khi tab ẩn, cap 50 nodes
- Pages: đã fix submodule lỗi → deploy thành công

## Phase hiện tại: ACTIVE

## Ưu tiên tiếp theo
1. **mission-dispatcher** — Rust binary: Tokio + Git2 + SQLite, pattern từ ECC2, parallel agent orchestration
2. **GitHub Marketplace** — chờ review → CHECK MAIL: `python3 tools/check-mail.py --from github`

## Đã biết / blockers
- Token rotation: ✅ DONE (NPM + CARGO + PYPI đã rotate 03/06)
- yana-router: ✅ built, `yamtam-rt route classify` hoạt động
- yana automation stack: ✅ route binary + yana-classify skill + DIRECTION routing law + dynamic-workflow-mode skill
- Disk: 79% — thoải mái, build Rust được (vẫn nên dùng CARGO_TARGET_DIR=/tmp/yamtam-build)
- Codexmate chạy bằng `CODEXMATE_PORT=8080 codexmate run` + Web Preview 8080

## Backup AI stack (khi Claude hết quota)
- `gemini` → Gemini 2.5 Flash, 1,500 req/ngày, hooks active
- `aider-groq` → Llama 3.3 70B trên Groq, 14,400 req/ngày
- `aider-qwen` → Qwen3 32B trên Groq
- Aider cài tại /tmp/aider-lib (mất sau khi reconnect, reinstall: `pip install aider-chat --target /tmp/aider-lib`)

## Ghi chú
- Anh dùng Google Cloud Shell
- Build Rust: CARGO_TARGET_DIR=/tmp/yamtam-build cargo build
- JNMT: 6 ngôn ngữ thực tế, 620k dòng tự viết, 55 deployments
- marketplace.html: 2,571 items
- drift-check đọc `components.<key>.count` trong MANIFEST.json — không phải `skills_count` top-level
