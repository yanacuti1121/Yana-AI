# Current Context

**Cập nhật lần cuối:** 2026-06-11

## Trạng thái
- yamtam-engine **v0.41.1** — npm ✅ LIVE · crates ✅ · Release tự động hóa hoàn chỉnh (push tag là publish) · CI ✅ xanh lại sau 30+ runs đỏ · repo clean
- Skills: **3,518** (11/06 chiều: +9router-gateway, +trending-pulse-research) · Rules: **64** (+68 principal-confidentiality)
- Adapters: **15** (+Windsurf, Kiro, Antigravity — switch-engine.sh)
- Demo: GIF thật trong README (agg render) + asciinema player live trên docs homepage
- Git history: sạch — không còn binary lớn, force-pushed 2026-06-07
- Disk: 79% (~988MB free) — đã dọn sạch sáng nay
- Git user: đã fix lại "Vũ Văn Tâm" (bị Gemini set thành "Gemini AI")
- Submodule codexmate: đã fork → phamlongh230-lgtm/codexmate, VI patch pushed, URL updated
- lotus-petals.js: cánh sen nhỏ + bông hoa đầy đủ rơi, pause khi tab ẩn, cap 50 nodes
- Pages: đã fix submodule lỗi → deploy thành công

## Phase hiện tại: ACTIVE

## Ưu tiên tiếp theo (anh chốt cuối ngày 11/06: "mai làm")
1. **Yana Confidential Mode** — hiện thực rule 68 thành UI: tag mật trong chat → no-persist (không vào missions/memory/about-context) + tier routing (SOVEREIGN → local model). Em đề xuất, anh chưa chốt nhưng nghiêng theo
2. **vhs .tape script** — tự động hóa demo GIF mỗi release (hiện render tay bằng agg /tmp/agg + font /tmp/fonts — mất sau reconnect)
3. **PyPI environment** — publish job fail "Set up job" từ v0.41.0; sửa trong repo Settings → Environments (OIDC trusted publishing) thì PyPI mới lên 0.41.1
4. **Tests còn thiếu** — crypto-store.js chưa có test; _test_router.js vẫn hỏng (require ./router.js đã move sang yamtam-core)
5. **Backlog repos** — xem `.claude/assistant/repo-backlog.md` (pm-skills học cho Phase 4, asciinema-player đã dùng)

## Đã xong hôm nay 11/06 (chiều — sau khi anh quay lại 14h KR)
- npm 0.41.1 LIVE (sửa 3 tầng: drift CI → release auto → publish trigger tag-push + --allow-same-version)
- PR codexmate #193: root cause = merge giữ nhầm release.yml cũ → fix pushed (5a8ec81)
- 9Router tích hợp yana-web (provider + live models + skill 9router-gateway)
- 3 engine adapters mới: Windsurf, Kiro, Antigravity (15 tổng)
- Demo: asciinema terminal live trên docs + GIF trong README EN+VI
- Rule 68 principal-confidentiality (+ Platform Trust Reality) — anh định hướng: cho NGƯỜI DÙNG, không phải cho anh
- Gate scripts thống nhất định nghĩa scripts count (validate-manifest = drift-check = 100)

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
- ⏰ Lưu ý giờ: clock máy chủ chạy UTC — giờ của anh là GMT+9 (Hàn Quốc, chênh +9h). Briefing nên quy đổi theo giờ KR.
- 11/06: anh hết token quota lúc ~10:00 sáng giờ KR, hẹn quay lại ~14:00 giờ KR — việc tiếp theo đã ghi ở 'Ưu tiên tiếp theo'
- Anh dùng Google Cloud Shell
- Build Rust: CARGO_TARGET_DIR=/tmp/yamtam-build cargo build
- JNMT: 6 ngôn ngữ thực tế, 620k dòng tự viết, 55 deployments
- marketplace.html: 2,571 items
- drift-check đọc `components.<key>.count` trong MANIFEST.json — không phải `skills_count` top-level
