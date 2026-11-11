# Kế hoạch sắp xếp lại repo

Trạng thái: bản nháp, chưa duyệt. Lập ngày 2026-11-11 trên commit `b3e62b6`, cập nhật sau khi chủ repo chốt phạm vi.
Số liệu đo bằng `scripts/reorg_refmap.py` (xem phần "Cách dùng công cụ").

## Quyết định của chủ repo (đã nghe trong phiên làm việc)

- Một repo mới nhận toàn bộ phần web và app, gồm cả website đang chạy trên Vercel.
- Repo gốc chỉ giữ phần phát hành PyPI và crates.io (Python package `yana-ai` và Rust crate `yana-rt`). npm đã bị bỏ từ trước (xem `VERSIONING.md`).
- Mỗi repo phát hành phiên bản của mình, phần web và app phát hành từ repo mới. Hai bên nối nhau bằng phiên bản đã phát hành, không dùng submodule. Cần xác nhận lại cách hiểu này.
- Tách cấu trúc, không cắt liên kết: các phần vẫn làm việc với nhau như hiện tại.
- Làm lần lượt, từ phần dễ đến phần khó. Tài liệu cũ được cập nhật như một phần của việc sắp xếp.

## Nguyên tắc

1. Mỗi bước là một PR riêng, hoàn tác được bằng `git revert`.
2. Không đổi tên các đường dẫn là quy ước cố định: `core/*`, `.yana-ai/` (91 file code nhắc đến), `.planning/` (agent `spec-*` ghi vào `.planning/<slug>/PLAN.md`), `gates/` (26 file nhắc đến).
3. Sau mỗi lần di chuyển, chạy `python3 scripts/reorg_refmap.py --target <đường dẫn cũ> --expect-zero`. Kết quả phải là exit 0, đồng thời `core/scripts/drift-check.sh` sạch và CI xanh.
4. Vùng bị ghim bởi `core/config/core-lock.json`: `core/rules`, `core/gates`, `core/hooks`, `core/scripts`, `src/guard`. Sửa trong đó phải sinh lại khóa và review từng dòng; `core/rules`, `core/hooks`, `core/gates` còn phải qua hai reviewer theo rule 54.
5. Mọi push và merge cần chủ repo duyệt trong phiên.

## Phạm vi của repo mới (đề xuất, cần xác nhận)

| Thành phần | Ghi chú |
|---|---|
| `tools/yana-app` | 0 file ngoài nhắc đến |
| `tools/yana-web`, `tools/yana-desktop` | đi cùng nhau, Electron đóng gói server của web; 12 và 14 file ngoài nhắc đến |
| `tools/yana-studio`, `tools/yana-ide` | 16 file nhắc `yana-studio`; 13 file của `yana-ide` trỏ vào `yana-studio` |
| `tools/yana-notch`, `yana-promo`, `yana-pixel-bridge` | chỉ tài liệu hoặc dependabot nhắc đến |
| `site/` (Astro) | 1 file code ngoài nhắc đến (`core/scripts/generate-agents-data.py`) |
| Phần website trong `docs/` (html, css, js, `assets/`, `_next/`, `website/`, `embed/`, `videos/`) | Vercel và Cloudflare phục vụ từ `docs/` |
| `vercel.json`, `wrangler.jsonc`, `worker.js` | `worker.js` là Cloudflare Worker, có test nằm trong `tools/yana-web` |
| Workflow `desktop.yml`, `native-macos.yml`, `yana-studio-desktop.yml` | tạo GitHub Release cho app, desktop, Studio |
| `github-app/` | chưa rõ có tính là web hay không |

Ở lại repo gốc: `src/` (Rust), `core/`, `src/yana_ai`, `pyproject.toml`, `Cargo.toml`, `publish.yml`, `release.yml`, tài liệu `.md` trong `docs/` (adr, reference, operations, history, programs...), `scanner/`, `tests/`.

Chưa chắc: `release.yml` (tag `v*`, build và đính kèm `yana-rt`) được giả định là ở lại vì thuộc phần Rust. Cần xác nhận.

## Các rủi ro đã thấy

1. **Bản đã cài tự hỏi repo cũ để tìm bản cập nhật.** `tools/yana-app/Sources/YanaApp/AppUpdater.swift` gọi `api.github.com/repos/yanacuti1121/Yana-AI/releases` và lọc tag `app-v`. `tools/yana-desktop/package.json` cấu hình electron-updater với `owner: yanacuti1121`, `repo: Yana-AI`. Nếu bản phát hành chuyển sang repo mới, Yana.app 1.0.0 và Desktop đã cài sẽ không bao giờ thấy bản mới. Cần chọn cách xử lý trước khi chuyển (xem câu hỏi mở 1).
2. **`docs/` là gốc của website.** `vercel.json` có `ignoreCommand` so sánh `:/docs`; `wrangler.jsonc` đặt `assets.directory` là `docs`. Mọi file đặt vào `docs/` đều được phục vụ công khai. Vì vậy việc chuyển 18 file `.md` ở gốc vào `docs/` phải làm **sau** khi website rời đi.
3. **Hạ tầng triển khai phải nối lại.** Dự án Vercel `yana-ai-docs` và dự án Cloudflare Workers `yana` đang gắn với repo này. Phải nối lại sang repo mới và giữ nguyên tên miền, biến môi trường, secret (khóa Groq) và KV của worker. Đây là thao tác ngoài git.
4. **Dữ liệu sinh ra từ lõi.** `core/scripts/generate-agents-data.py` ghi `docs/skills-data.json` và `site/public/skills-data.json`. Sau khi tách cần một cách chuyển dữ liệu này sang repo mới.
5. **Số liệu trong trang chủ được kiểm bằng code ở repo gốc.** `core/scripts/check_counts.py`, `core/scripts/drift-check.sh` và `tests/test_project_metadata.py` kiểm các số trong `docs/index.html`. Cả hai script đều nằm trong vùng khóa. Bản sao `.claude/docs/index.html` (nguồn của lỗi mirror ở PR 522) cũng biến mất khi tách.
6. **Cặp logic phải khớp giữa JS và Rust:** `provider-failover.js` với `circuit_breaker.rs`, bảng `PROVIDERS` của `server.js` với `openai_compat.rs`, `terminal-context.mjs` với `headless.rs`. Cần bộ test đối chiếu dùng chung dữ liệu mẫu.
7. **Chỗ khác trong repo gốc nhắc tới các thành phần sẽ rời đi:** `core/scripts/check_dangling_paths.py` (nhắc `tools/yana-desktop`), `core/lib/hermes_adapted/memory_manager_io.py` (nhắc `tools/yana-web`), `scanner/*.yml` (có bản biên dịch kiểm trong CI), `core/hooks/scope-guard.sh` (nhắc `vercel.json`), `ci.yml`, `package.json` gốc, `Cargo.toml`, `src/*.rs` (chỉ trong comment). Hai chỗ nằm trong vùng khóa.

## Các bước

### Bước 1: lưới an toàn và kế hoạch (PR này)

Thêm `scripts/reorg_refmap.py` và tài liệu này. Không di chuyển file nào. `scripts/` gốc nằm ngoài vùng khóa nên không phải sinh lại `core-lock`.

### Bước 2: gộp thư mục kế hoạch

Chuyển `plans/261024-0000-yana-demo-video/` (8 file) vào `.planning/`. Không có code nhắc đến; 1 tài liệu cần sửa đường dẫn: `docs/product/IMPLEMENTATION_REVIEW_MATRIX.md`.

### Bước 3: tách `yana-app`

Không có file code nào nhắc đến `tools/yana-app` (chỉ có `NOTICE`). Điều kiện: đã chọn cách xử lý rủi ro 1. Tạo repo mới từ một bản clone riêng bằng `git filter-repo --path tools/yana-app`, repo hiện tại không bị đụng tới cho tới khi PR xóa được duyệt.

### Bước 4: tách cụm web

Chuyển website, `site/`, `worker.js`, `wrangler.jsonc`, `vercel.json`, `yana-web`, `yana-desktop`, `yana-studio`, `yana-ide` và các workflow phát hành tương ứng. Gồm xử lý rủi ro 2 đến 7. Đây là bước lớn nhất, nên chia thành các PR nhỏ theo thứ tự: website tĩnh và dữ liệu sinh ra, rồi `yana-web` cùng `yana-desktop`, rồi Studio và IDE.

### Bước 5: dọn gốc repo gốc

Sau khi `docs/` không còn là gốc website, chuyển 18 file `.md` chỉ có tài liệu nhắc đến. Giữ `CODE_OF_CONDUCT.md` ở gốc theo chuẩn GitHub.

- Sang `docs/archive/`, 6 file: `JOURNEY.md`, `HISTORY.md`, `YANA-UNIFIED-ENGINEERING-ARCHITECTURE.md`, `YANA-UNIFIED-IMPLEMENTATION-PLAN.md`, `BMAD-YANA-GAP-ANALYSIS.md`, `ARCHITECTURE-DEBT.md`.
- Sang `docs/`, 4 file: `PRINCIPLES.md`, `VISION.md`, `DIRECTION.md`, `ACKNOWLEDGEMENTS.md`.
- Sang `docs/i18n/`, 8 file bản dịch `.ko.md` và `.vi.md` của ACKNOWLEDGEMENTS, JOURNEY, PHILOSOPHY, PRINCIPLES.

Giữ ở gốc các file chuẩn và những file có code nhắc đến: README (và bản dịch), AGENTS, CHANGELOG, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, LICENSE, NOTICE, VERSIONING, COMMANDS, ARCHITECTURE, ROADMAP, TODO, CURRENT-MILESTONE, BENCHMARK, PHILOSOPHY.

### Bước 6: bản sao `.claude/`

Có 67 file code/CI/cấu hình dựa vào đường dẫn `.claude/...` (`skills-lock.json` ghi khoảng 2.000 lần, các test và watcher `giamthi`, `run-hook-tests.sh`, `verify-skills-lock.sh`). Đây còn là cấu hình thật của các phiên Claude Code chạy trong repo này. Chỉ làm sau khi có thiết kế riêng về cách sinh `.claude/` từ `core/`, và cần duyệt riêng.

### Bước 7: tài liệu

- `ARCHITECTURE.md` ghi 1.989 skills, thực tế 2.035: sinh từ `MANIFEST.json`.
- `AGENTS.md` ghi "Enforcement status (v1.6.1)", phiên bản hiện tại là 1.5.2: kiểm tra cách đánh số phiên bản.
- README nhắc 1.5.1 và 1.7.0: xác nhận cái nào là kế hoạch.
- Chính sách cho bản dịch (vi, en, ko, zh): chọn bản gốc và ghi tình trạng đồng bộ.
- Tài liệu của phần web và app chuyển sang repo mới cùng với chúng.
- Mở rộng `check_counts.py` hoặc `drift-check.sh` để giữ các số liệu; sửa vào vùng khóa nên cần duyệt riêng.

## Câu hỏi mở

1. Bản Yana.app và Desktop đã cài đang hỏi repo cũ để tìm bản cập nhật. Chọn một: (a) repo mới vẫn đăng bản phát hành lên Releases của repo cũ (cần token có quyền ghi vào repo cũ), (b) phát một bản cầu nối từ repo cũ có cấu hình cập nhật trỏ sang repo mới, rồi mới chuyển hẳn.
2. Danh sách trong bảng "Phạm vi của repo mới" có đúng không? Cụ thể: `github-app/`, `yana-notch`, `yana-promo`, `yana-pixel-bridge` đi đâu?
3. Tên repo mới là gì?
4. `release.yml` (build `yana-rt` theo tag `v*`) ở lại repo gốc đúng không?
5. Hạ tầng Vercel và Cloudflare do chủ repo nối lại thủ công, hay cần liệt kê từng bước?

## Cách dùng công cụ

```bash
python3 scripts/reorg_refmap.py                          # khảo sát toàn bộ
python3 scripts/reorg_refmap.py --target plans/          # ai nhắc đến plans/
python3 scripts/reorg_refmap.py --target plans/ --expect-zero   # exit 1 nếu còn code nhắc
```

Số liệu là cận trên theo khớp chuỗi. Công cụ bỏ qua `.claude/`, `core/skills/`, `vendor/`, file khóa và thư mục build. Mình chưa đọc từng tham chiếu để phân biệt phụ thuộc thật với comment.
