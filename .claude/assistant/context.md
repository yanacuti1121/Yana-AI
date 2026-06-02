# Current Context

**Cập nhật lần cuối:** 2026-06-02

## Trạng thái
- yamtam-engine v0.17.0 — npm ✅ PyPI ✅ crates.io yamtam-rt v1.2.0 ✅
- CI ✅ YAMTAM Audit ✅ tất cả xanh
- 2,353 skills, 93 agents
- Website: index/skills/marketplace/changelog/guide/search — dark/light toggle ✅
- Sections mới: Agents, Runtime commands table, Docker Sandbox ✅
- Lab: 4 bài C++ terminal demo (Sơn Thủy Trùng Mây, Trót Yêu, See Tình, Come My Way) ✅
- Sandbox: Dockerfile built, wire tool-proxy.sh, CI workflow ✅
- Trợ lý: 7/7 roadmap done (weekly, memory, milestone, health check) ✅

## Phase hiện tại: ACTIVE

## Ưu tiên tiếp theo
1. **Rotate tokens** (npm + crates.io + PyPI) → update GitHub Secrets ← vẫn pending (anh tự làm trên web)

## Đã biết / blockers
- Token rotation: anh cần tự làm trên web rồi update GitHub Secrets
- Codexmate chạy bằng `CODEXMATE_PORT=8080 codexmate run` + Web Preview 8080
- Disk /home 81% (904MB free) — đã dọn kiro-cli + cache, ổn
- Build Rust: CARGO_TARGET_DIR=/tmp/yamtam-build cargo build
- Session bị lỗi 1M token khi đang tổng hợp context — tiếp tục session mới

## Backup AI stack (khi Claude hết quota)
- `gemini` → Gemini 2.5 Flash, 1,500 req/ngày, hooks active
- `aider-groq` → Llama 3.3 70B trên Groq, 14,400 req/ngày
- `aider-qwen` → Qwen3 32B trên Groq
- Groq key: trong ~/.bashrc (cần rotate — đã paste vào chat)
- Aider cài tại /tmp/aider-lib (mất sau khi reconnect, reinstall: `pip install aider-chat --target /tmp/aider-lib`)

## Ghi chú
- Anh dùng Google Cloud Shell
- strix --mode experts: recon + 12 OWASP families, 4 bugs tìm + fix
- codexmate: EN|VI only, zh fallback removed, hook traceback fixed
- Build Rust: CARGO_TARGET_DIR=/tmp/yamtam-build cargo build
- agentshield: scan .claude/ config (khác strix — strix scan source, agentshield scan agent config)
- JNMT: 6 ngôn ngữ thực tế (không phải 100), 620k dòng tự viết, 55 deployments
- marketplace.html: 2,571 items (skills+agents+hooks+commands+rules)
