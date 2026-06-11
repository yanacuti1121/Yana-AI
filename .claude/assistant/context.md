# Current Context

**Cập nhật lần cuối:** 2026-06-12 (sáng KR)

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

## Ưu tiên tiếp theo
1. **PyPI bước cuối — VIỆC CỦA ANH trên pypi.org**: v0.41.2 đã qua "Set up job" (fix SHA ăn), giờ fail ở publish vì pypi.org chưa đăng ký trusted publisher. Anh vào pypi.org → project yamtam-engine (hoặc Pending publishers nếu project chưa tồn tại) → Publishing → Add GitHub publisher: owner `phamlongh230-lgtm`, repo `yamtam-engine`, workflow `publish.yml`, environment `pypi`. Xong thì re-run job PyPI (hoặc đợi tag sau)
2. **codexmate PR #193** — phía mình XONG; merge bị chặn bởi branch protection của SakuraByteCore (cần 1 review + maintainer approve workflow). Token fine-grained không comment sang repo họ được — anh tự đăng câu nhắn maintainer nếu muốn giục
3. **Token**: anh đang xoá token sau mỗi đợt — token hiện tại trong remote sẽ chết; lần làm việc sau cần token mới (repo + workflow scope) nếu có push
4. **Backlog repos** — xem `.claude/assistant/repo-backlog.md` (pm-skills học cho Phase 4)

## v0.41.2 RELEASED (12/06 sáng KR)
- npm ✅ · crates.io ✅ · GitHub Release ✅ · PyPI chờ anh đăng ký trusted publisher
- Toàn bộ 8 commits đã push (rule 68 full-stack, Confidential Mode, Settings thật, crypto tests 17, vhs demo, publish.yml repin)
- Cảnh báo từ runner: actions/checkout + setup-python pin cũ chạy Node 20 — GitHub ép Node 24 từ 16/06/2026 → nên bump 2 pin này trước ngày đó

## Đã xong 12/06 sáng KR (session "lm hết các công việc qua lưu đi")
- Rule 68 thành code thật 3 tầng: Rust route.rs (Sensitivity enum, 13/13 tests), yamtam-core classifier (classifySensitivity export), yana-web UI
- Yana Confidential Mode: nút 🔒 + auto-detect marker VI/EN → no-persist localStorage, không gửi about-context, SOVEREIGN → chỉ Ollama (provider mới, keyless, 127.0.0.1:11434), server chặn 403 defense-in-depth, missions reject 403 tên mật
- Settings thật: useTweaks persist localStorage (yana.tweaks) — theme/accent/density/ngôn ngữ sống qua reload; workspace name editable; timezone detect thật; default provider select (wire vào yana.chat.provider); Safety/Memory cards đọc /api/dashboard; Ollama "On-device/keyless"
- Tests: crypto-store 17/17 (mới), classifier 14/14 (viết lại), router fixed, missions 26/26 (+3 rule 68), auth 28/28, cargo 76/76
- vhs: demo/demo.sh (nguồn duy nhất) + demo/demo.tape + workflow demo-gif.yml (workflow_dispatch)
- publish.yml: repin pypa/gh-action-pypi-publish (SHA cũ không tồn tại upstream — root cause "Set up job" fail từ v0.41.0)
- codexmate #193: CSS mutual-exclusion fix pushed, title "vn" → mô tả đúng, comment 5 điểm CodeRabbit resolved

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
