# Current Context

**Cập nhật lần cuối:** 2026-06-12 (chiều KR — session feedback/L6)

## Trạng thái
- yamtam-engine **v0.41.2** — 4 kênh ✅ · Release tự động hóa hoàn chỉnh (push tag là publish)
- Skills: **3,518** · Rules: **65** (+69 cognitive-reliability — L6, từ ADR-006)
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
1. **PUSH yamtam-engine** — 3 commits local chưa push (922ee30b rule 69 + ADR-006, 79595557 submodule bump, + assistant sync). Giữ lại vì luật git-push-enforcement yêu cầu anh ra lệnh push main rõ ràng
2. **PR #193 — reply ĐÃ ĐĂNG** (12/06 chiều, issuecomment-4688928819, đủ 3 điểm + evidence). Token classic ghp_ hiện tại COMMENT ĐƯỢC sang repo SakuraByteCore (ghi chú cũ "fine-grained không comment được" đã lỗi thời). Còn chờ: ymkiux phản hồi + maintainer approve workflow (Actions chưa chạy trên 885fd60) + 1 review
3. **Bump action pins lên Node 24** — deadline 16/06/2026 (còn 4 ngày!); publish.yml đang Node 20. Cần token workflow scope
4. **L6 follow-up (từ ADR-006)** — gate tooling tự động: wrap-up linter, completion-state check trong truth gate, cognitive-debt backlog. Hiện mới enforcement hành vi
5. **Backlog repos** — xem `.claude/assistant/repo-backlog.md`

## Đã xong 12/06 chiều KR (session "học từ feedback + thêm L6")
- **codexmate #193 theo review ymkiux**: merge upstream/main (lấy 4 key claude.model.* đã dịch sẵn từ #194) + tự thêm 4 key thiếu (templatesCount, diff.title.claudeSettings, copyPath, applyAria) → vi.mjs **1200/1200** với en.mjs, 0 thiếu 0 thừa 0 trùng; unit suite codexmate 11/11 pass; pushed 885fd60 → PR head cập nhật, CI đang chạy
- **CSS point của reviewer**: KHÔNG đổi code — có bằng chứng base `.lang-switch-text` mặc định `translateY(10px)` (layout-shell.css:279) và rule vi theo đúng pattern opacity-only của zh/en upstream có sẵn → trả lời reviewer bằng evidence
- **Docstring 33%**: PR chỉ đổi README/locale-data/CSS, không có exported function → không có gì để sửa
- **ADR-006 + rule 69 (L6 Cognitive Reliability)**: docs/adr/ADR-006 (Accepted, guard table L6.0–L6.20) + core/rules/69 (Tier 2, completion vocabulary 8 trạng thái, Claim/Evidence/Confidence, cấm success-only wrap-up) + formal change record trong YAMTAM_LAYER_MODEL.md (L6 nằm NGOÀI stack L1–L5.5). verify-rules 4/4 PASS, core-lock 218 pinned, MANIFEST rules 65
- **Memory dài hạn**: reporting_discipline.md — bài học #1 của anh ("đừng báo oke ngon lành khi còn lỗi") vào Claude memory index
- **Ghi nhận**: MANIFEST `actual_present` của rules stale từ trước (61 entries / 65 rules) — script chỉ fix count; chưa sửa vì ngoài scope

## v0.41.2 RELEASED — TRỌN BỘ 4 KÊNH ✅ (12/06 sáng KR)
- npm ✅ · crates.io ✅ · GitHub Release ✅ · **PyPI ✅ 0.41.2 live 00:25 UTC** (lần đầu kể từ 0.40.0!)
- PyPI 3 tầng lỗi đã gỡ tuần tự: (1) SHA pin pypa/gh-action-pypi-publish không tồn tại → repin; (2) OIDC chưa đăng ký → anh thêm trusted publisher; (3) thêm nhầm dạng pending trong khi project ĐÃ tồn tại → thêm vào project Manage → Publishing. Pipeline giờ tự động 100%: push tag là lên đủ 4 kênh
- Toàn bộ commits đã push (rule 68 full-stack, Confidential Mode, Settings thật, crypto tests 17, vhs demo, publish.yml repin)

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
