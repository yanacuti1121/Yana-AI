# Current Context

**Cập nhật lần cuối:** 2026-06-03

## Trạng thái
- yamtam-engine v0.40.0 — MANIFEST ✅ skills 3,457 · agents 95 · CI ✅ xanh
- Plugin format: openclaw/agentskills compatible ✅ — cài được bằng `npx skills add phamlongh230-lgtm/yamtam-engine`
- Mail reader: `tools/check-mail.py` IMAP Gmail ✅ — GMAIL_APP_PASSWORD trong ~/.bashrc
- Supermemory: .mcp.json với Bearer token ✅ — SUPERMEMORY_API_KEY trong ~/.bashrc
- Token rotation: NPM_TOKEN + CARGO_REGISTRY_TOKEN + PYPI_TOKEN đã set GitHub Secrets ✅
- GitHub Marketplace review: submitted 02/06 → dự kiến kết quả 05–09/06
- Disk /home 96% (~200MB free) — cần theo dõi

## Phase hiện tại: ACTIVE

## Ưu tiên tiếp theo
1. **GitHub Marketplace** — chờ review → **CHECK MAIL ĐẦU SESSION: `python3 tools/check-mail.py --from github`**
2. **Disk** — dọn thêm nếu xuống dưới 150MB

## Đã biết / blockers
- Disk 96% — tránh pip install nặng, build Rust dùng CARGO_TARGET_DIR=/tmp/yamtam-build
- headroom: base install OK, cần `pip install "headroom-ai[all]"` để unlock SmartCrusher (cần disk)
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
