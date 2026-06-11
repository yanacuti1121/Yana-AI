# Current Context

**Cập nhật lần cuối:** 2026-06-10

## Trạng thái
- yamtam-engine v0.41.0 — CI ✅ · Pages ✅ · repo clean · history rewritten (Antigravity removed)
- Skills: **3,495** (hôm nay +32 từ GitHub trending, 5 batches)
- Git history: sạch — không còn binary lớn, force-pushed 2026-06-07
- Disk: 79% (~988MB free) — đã dọn sạch sáng nay
- Git user: đã fix lại "Vũ Văn Tâm" (bị Gemini set thành "Gemini AI")
- Submodule codexmate: đã fork → phamlongh230-lgtm/codexmate, VI patch pushed, URL updated
- lotus-petals.js: cánh sen nhỏ + bông hoa đầy đủ rơi, pause khi tab ẩn, cap 50 nodes
- Pages: đã fix submodule lỗi → deploy thành công

## Phase hiện tại: ACTIVE

## Ưu tiên tiếp theo
1. **Yana web/desktop** — security hardening DONE 10/06 (vault mã hóa key + server hardening + rule 66). Còn thiếu: test cho crypto-store/server, _test_router.js đang hỏng (require ./router.js đã move sang yamtam-core)
2. **Marketplace post-launch** — cập nhật README/docs với badge + link Marketplace, theo dõi install count

## 🎉 GitHub Marketplace — APPROVED & LIVE (10/06/2026)
- Listing: https://github.com/marketplace/yamtam-engine
- Manage: https://github.com/marketplace/yamtam-engine/edit
- Vòng 2 approve ngày 10/06 — sớm hơn milestone 17/06 một tuần

## Đã biết / blockers
- Token rotation: ✅ DONE (NPM + CARGO + PYPI đã rotate 03/06)
- yana-router: ✅ built, `yamtam-rt route classify` hoạt động
- yana automation stack: ✅ COMPLETE — route binary + yana-classify (Path A/B) + mission-run skill + mission-dispatcher Rust + dynamic-workflow-mode
- mission-dispatcher: ✅ DONE — dispatch marks Running, cancel/retry/--instructions, broken pipe fix, skill mission-run, tích hợp yana-classify
- Binary build: CC/AR từ nix store, CARGO_TARGET_DIR=/tmp/yamtam-build (reset sau reconnect)
- Disk: 79% — thoải mái, build Rust được (vẫn nên dùng CARGO_TARGET_DIR=/tmp/yamtam-build)
- Codexmate chạy bằng `CODEXMATE_PORT=8080 codexmate run` + Web Preview 8080

## Backup AI stack (khi Claude hết quota)
- `gemini` → Gemini 2.5 Flash, 1,500 req/ngày, hooks active
- `aider-groq` → Llama 3.3 70B trên Groq, 14,400 req/ngày
- `aider-qwen` → Qwen3 32B trên Groq
- Aider cài tại /tmp/aider-lib (mất sau khi reconnect, reinstall: `pip install aider-chat --target /tmp/aider-lib`)

## Nhắc hàng ngày — đọc to cuối mỗi briefing

> **"Hôm nay tôi chỉ làm sâu hơn lớp cốt lõi — không mở rộng."**
>
> YAMTAM không phải tool code. Là lớp điều phối giữa con người và AI.
> Routing · Safety · Orchestration · Context — làm thật tốt bốn thứ này,
> mọi domain bên trên chỉ là application layer.

*Trợ lý: cuối mỗi briefing, luôn quote câu in đậm trên.*

---

## Ghi chú
- Anh dùng Google Cloud Shell
- Build Rust: CARGO_TARGET_DIR=/tmp/yamtam-build cargo build
- JNMT: 6 ngôn ngữ thực tế, 620k dòng tự viết, 55 deployments
- marketplace.html: 2,571 items
- drift-check đọc `components.<key>.count` trong MANIFEST.json — không phải `skills_count` top-level
