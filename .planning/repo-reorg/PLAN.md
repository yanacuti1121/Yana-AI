# Kế hoạch sắp xếp lại repo

Trạng thái: bản nháp, chưa duyệt. Lập ngày 2026-11-11, cập nhật lần hai sau khi chủ repo chọn hai repo đích có sẵn.
Số liệu đo bằng `scripts/reorg_refmap.py` (xem phần "Cách dùng công cụ").

Đã làm: bước 1 (công cụ và kế hoạch, PR 523) và việc nhập terminal workspace về `tools/yana-terminal/` (PR 524) đã merge vào `main`.

## Quyết định của chủ repo (đã nghe trong phiên làm việc)

- Phần web và app tách khỏi repo này, gồm cả website đang chạy trên Vercel. Hai repo đích đã có sẵn (xem phần "Repo đích").
- Repo gốc chỉ giữ phần phát hành PyPI và crates.io (Python package `yana-ai` và Rust crate `yana-rt`). npm đã bị bỏ từ trước (xem `VERSIONING.md`).
- Mỗi repo phát hành phiên bản của mình, phần web và app phát hành từ repo đích. Hai bên nối nhau bằng phiên bản đã phát hành, không dùng submodule. Cần xác nhận lại cách hiểu này.
- Terminal CLI của repo `yana-studio` cũ được chuyển về repo này trước khi repo đó được dùng lại cho app.
- Tách cấu trúc, không cắt liên kết: các phần vẫn làm việc với nhau như hiện tại.
- Làm lần lượt, từ phần dễ đến phần khó. Tài liệu cũ được cập nhật như một phần của việc sắp xếp.

## Nguyên tắc

1. Mỗi bước là một PR riêng, hoàn tác được bằng `git revert`.
1b. Sao chép trước, xóa sau. Repo này vẫn dùng dữ liệu hiện tại cho tới khi bản sao ở repo đích chạy được; chỉ khi đó mới có PR xóa riêng. Đã làm: yana-web PR 2 (web, desktop, site, website) và yana-studio PR 25 (app, Studio, IDE), cả hai nháp.
2. Không đổi tên các đường dẫn là quy ước cố định: `core/*`, `.yana-ai/` (91 file code nhắc đến), `.planning/` (agent `spec-*` ghi vào `.planning/<slug>/PLAN.md`), `gates/` (26 file nhắc đến).
3. Sau mỗi lần di chuyển, chạy `python3 scripts/reorg_refmap.py --target <đường dẫn cũ> --expect-zero`. Kết quả phải là exit 0, đồng thời `core/scripts/drift-check.sh` sạch và CI xanh.
4. Vùng bị ghim bởi `core/config/core-lock.json`: `core/rules`, `core/gates`, `core/hooks`, `core/scripts`, `src/guard`. Sửa trong đó phải sinh lại khóa và review từng dòng; `core/rules`, `core/hooks`, `core/gates` còn phải qua hai reviewer theo rule 54.
5. Mọi push và merge cần chủ repo duyệt trong phiên.

## Repo đích

Cả hai repo đã tồn tại và đều là bản chụp cũ, nên nội dung hiện có phải được lưu lại trước khi dùng lại. Không dùng `git push --force` để thay nội dung.

| Repo | Hiện có gì (đọc ngày 2026-11-11) | Dùng cho | Cách lưu bản cũ |
|---|---|---|---|
| `yanacuti1121/yana-web` | 338 file, cập nhật cuối 2026-08-08, nhánh `main` và `chore/real-snapshot`, không tag, không workflow. Bản chụp cũ của `tools/yana-web`: khoảng 287 file giống hệt, 28 khác, 23 chỉ còn ở repo cũ, 58 chỉ có ở bản mới (con số 287 là suy ra) | phần web: website, `site/`, `worker.js`, `wrangler.jsonc`, `vercel.json`, `yana-web` | đánh tag `legacy-snapshot-2026-08` trên `main`; đưa nội dung mới vào bằng merge, không ghi đè |
| `yanacuti1121/yana-studio` | 77 file, cập nhật cuối 2026-08-09 (PR 24), Rust, nhiều nhánh `feat/m2-*` và `backup/*`. Là terminal CLI, README "Yana Terminal AI Workspace" | phần app: `yana-app`, Studio | nội dung đã nhập vào `tools/yana-terminal/` (PR 524, commit `592de4d` của `yana-studio`); tag `legacy-terminal-2026-08` đã tạo ở local nhưng chưa đẩy được (xem dưới) |

Lưu trữ bản cũ: đẩy tag lên hai repo đích thất bại ("the remote end hung up unexpectedly"; đẩy nhánh thì được), nên bản cũ được lưu bằng NHÁNH: `legacy-snapshot-2026-08` (yana-web, 4bb40af) và `legacy-terminal-2026-08` (yana-studio, 592de4d), cả hai bằng `main` của repo đó lúc đó. Không có tag trên remote; chủ repo có thể tự đẩy tag từ máy riêng nếu muốn. Nên bật bảo vệ nhánh cho hai nhánh này.

Chưa xác định: bố cục thư mục trong từng repo. `yana-web` hiện để file ở gốc; nếu repo chứa cả website và `site/` thì chọn giữ web ở gốc hoặc chuyển vào `apps/` và `site/`. Chưa biết hai repo có Vercel, Cloudflare hay release nào nối sẵn không, vì API GitHub không đọc được khi chưa gắn quyền.

## Phạm vi chuyển đi (đề xuất, cần xác nhận)

Các dòng dưới đây chia giữa `yana-web` (web) và `yana-studio` (app). `yana-desktop` đóng gói server của web, nên chưa rõ thuộc bên nào.

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

1. **Bản đã cài tự hỏi repo cũ để tìm bản cập nhật.** `tools/yana-app/Sources/YanaApp/AppUpdater.swift` gọi `api.github.com/repos/yanacuti1121/Yana-AI/releases` và lọc tag `app-v`. `tools/yana-desktop/package.json` cấu hình electron-updater với `owner: yanacuti1121`, `repo: Yana-AI`. Nếu bản phát hành chuyển sang repo mới, Yana.app 1.0.0 và Desktop đã cài sẽ không bao giờ thấy bản mới. Quyết định của chủ repo (2026-11-11): phát bản mới có địa chỉ cập nhật trỏ sang repo đích, chấp nhận một số người dùng cũ phải cài lại vì hiện chưa có nhiều người dùng; không làm bản cầu nối. Việc đổi địa chỉ là sửa code trong repo đích (`AppUpdater.swift`, `SettingsSections.swift`, cấu hình electron-updater), làm sau khi chuyển. Số người đã cài chưa được đếm.
2. **`docs/` là gốc của website.** `vercel.json` có `ignoreCommand` so sánh `:/docs`; `wrangler.jsonc` đặt `assets.directory` là `docs`. Mọi file đặt vào `docs/` đều được phục vụ công khai. Vì vậy việc chuyển 18 file `.md` ở gốc vào `docs/` phải làm **sau** khi website rời đi.
3. **Hạ tầng triển khai phải nối lại.** Dự án Vercel `yana-ai-docs` và dự án Cloudflare Workers `yana` đang gắn với repo này. Phải nối lại sang repo mới và giữ nguyên tên miền, biến môi trường, secret (khóa Groq) và KV của worker. Đây là thao tác ngoài git.
4. **Dữ liệu sinh ra từ lõi.** `core/scripts/generate-agents-data.py` ghi `docs/agents-data.json` và `site/public/agents-data.json`; `core/scripts/gen_skills_page.py` ghi `docs/skills-data.json`. Sau khi tách cần một cách chuyển dữ liệu này sang repo mới (xem mục Tình trạng sau khi sao chép về `skills-data.json`).
5. **Số liệu trong trang chủ được kiểm bằng code ở repo gốc.** `core/scripts/check_counts.py`, `core/scripts/drift-check.sh` và `tests/test_project_metadata.py` kiểm các số trong `docs/index.html`. Cả hai script đều nằm trong vùng khóa. Bản sao `.claude/docs/index.html` (nguồn của lỗi mirror ở PR 522) cũng biến mất khi tách.
6. **Cặp logic phải khớp giữa JS và Rust:** `provider-failover.js` với `circuit_breaker.rs`, bảng `PROVIDERS` của `server.js` với `openai_compat.rs`, `terminal-context.mjs` với `headless.rs`. Cần bộ test đối chiếu dùng chung dữ liệu mẫu.
7. **Chỗ khác trong repo gốc nhắc tới các thành phần sẽ rời đi:** `core/scripts/check_dangling_paths.py` (nhắc `tools/yana-desktop`), `core/lib/hermes_adapted/memory_manager_io.py` (nhắc `tools/yana-web`), `scanner/*.yml` (có bản biên dịch kiểm trong CI), `core/hooks/scope-guard.sh` (nhắc `vercel.json`), `ci.yml`, `package.json` gốc, `Cargo.toml`, `src/*.rs` (chỉ trong comment). Hai chỗ nằm trong vùng khóa.

## Các bước

### Bước 1: lưới an toàn và kế hoạch (đã merge, PR 523)

Thêm `scripts/reorg_refmap.py` và tài liệu này. Không di chuyển file nào. `scripts/` gốc nằm ngoài vùng khóa nên không phải sinh lại `core-lock`.

### Bước 1b: nhập terminal workspace (đã merge, PR 524)

77 file của `yana-studio` (commit `592de4d`, 2026-08-09) được sao vào `tools/yana-terminal/`, không sửa, không mang theo lịch sử. Là crate độc lập vì `Cargo.toml` gốc không có `[workspace]`. Còn lại: hai workflow lồng trong `tools/yana-terminal/.github/` không chạy được (GitHub chỉ đọc `.github/workflows` ở gốc) và chưa quyết định giữ hay dọn; 77 file chưa được đọc từng cái để tìm secret.

### Bước 2: gộp thư mục kế hoạch

Chuyển `plans/261024-0000-yana-demo-video/` (8 file) vào `.planning/`. Không có code nhắc đến; 1 tài liệu cần sửa đường dẫn: `docs/product/IMPLEMENTATION_REVIEW_MATRIX.md`.

### Bước 3: tách `yana-app` sang `yana-studio`

Không có file code nào nhắc đến `tools/yana-app` (chỉ có `NOTICE`). Điều kiện: tag `legacy-terminal-2026-08` đã lên remote của `yana-studio` (đang bị chặn bởi quyền, xem phần "Repo đích"), và bản app mới sẽ phát hành từ repo đích với địa chỉ cập nhật đã đổi (rủi ro 1). Lấy lịch sử bằng `git filter-repo --path tools/yana-app` trên một bản clone riêng của repo này, rồi đưa vào `yana-studio` bằng merge, không ghi đè `main` và giữ nguyên các nhánh `feat/m2-*`. Repo hiện tại không bị đụng tới cho tới khi PR xóa được duyệt.

### Bước 4: tách cụm web sang `yana-web`

Bản cũ của `yana-web` được lưu ở nhánh `legacy-snapshot-2026-08` (không phải tag, xem mục Repo đích). Đã sao chép sang `yana-web` (PR 2): website, `site/`, `worker.js`, `wrangler.jsonc`, `vercel.json`, `tools/yana-web` và một bản sao của `yana-desktop`. `yana-studio` và `yana-ide` thuộc bước 3 và đã sang `Yana-studio`, không sang `yana-web`. `yana-desktop` vẫn ở lại repo này vì cấu hình đóng gói của nó cần `core/`, `MANIFEST.json` và `target/`; bản ở `yana-web` chỉ là bản sao.

Còn phải làm: cắt chuyển, tức nối lại Vercel, Cloudflare và Pages sang `yana-web`, rồi mới xóa bản gốc ở repo này, cùng xử lý rủi ro 2 đến 7 và danh sách "sẽ hỏng" ở mục Tình trạng sau khi sao chép. Chia thành các PR nhỏ.

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

## Tình trạng sau khi sao chép (2026-11-11)

Nguyên tắc đang theo: sao chép trước, ổn định, rồi mới chuyển kết nối (Vercel, Cloudflare, địa chỉ cập nhật app) và xóa bản gốc. Bản gốc ở repo này chưa bị xóa hay sửa.

**Đã sao chép và đã merge:**
- `yana-web`: `tools/yana-web` ở gốc, `yana-desktop/`, `site/`, các file không phải `.md` trong `docs/`, `worker.js`, `wrangler.jsonc`, `vercel.json` (PR 2); sửa đường dẫn test (PR 3), `.gitignore` (PR 4), CI (PR 5), README (PR 6).
- `Yana-studio`: `yana-app/`, `yana-studio/`, `yana-ide/` (PR 25), workflow `native-macos.yml` (PR 27) và `yana-studio-desktop.yml` (PR 28), README (PR 29). PR 26 đã đổi địa chỉ cập nhật app sang `Yana-studio` trước khi có bản phát hành `app-v*` ở đó; chưa gây hại vì chưa có bản app nào build từ code đó, nhưng không được phân phối app từ `main` của `Yana-studio` trước khi có bản `app-v*`.

**Bằng chứng đã có (đọc từ GitHub hoặc chạy tay):**
- `yana-web`: 30 file test ở gốc đạt, build Astro ra 8 trang, `npm audit` 0 lỗ hổng; CI mới chạy xanh trên GitHub.
- `Yana-studio`: `native-macos.yml` đã chạy trên macOS 15 Apple Silicon, các bước build, unit test, build bản xem trước đã ký và kiểm bundle đều đạt.
- Quét bí mật bằng biểu thức chính quy trên 823 file của `yana-web` và 1.121 file của `Yana-studio`: chỉ có dữ liệu giả trong test. Không quét lịch sử git, không quét entropy.

- `yana-app`: workflow `yana-app-macos.yml` (PR 31 ở `Yana-studio`) build xanh trên macOS 15, hai lần chạy. Mã Swift (53 file `.swift`) giống bản gốc ở repo này, trừ hai dòng địa chỉ cập nhật của PR 26.
- Cầu nối số liệu: job `counts` của `yana-web` (PR 14) checkout `Yana-AI` và chạy `check_counts.py` trên trang chủ của `yana-web`; đã chạy xanh trên GitHub.
- `yana-studio-desktop.yml` chạy thử bằng `workflow_dispatch` (run 42967379280): bước kiểm commit đạt CI, các bước checkout `Yana-AI`, build `yana-rt`, smoke test, `npm ci`, stage runtime đều đạt. Cả ba bản Linux x64, Windows x64, Windows arm64 hỏng ở bước 10 `Build frontend (tsc + vite)`. Nguyên nhân đã xác định: `@codemirror/legacy-modes@6.5.5` khai báo `shell` bằng `StreamParser` từ `@codemirror/streamparser`, khác kiểu `StreamParser` của `@codemirror/language`, nên `tsc` báo TS2345 ở `yana-studio/renderer/Editor.tsx:27`. Lockfile và mã nguồn giống bản gốc, nên lỗi không do việc chuyển; mình chưa chạy build đó ở repo này để đối chiếu. Sửa ở `Yana-studio` PR 40 (ép kiểu có chú thích; `tsc --noEmit` và `vite build` chạy tay đều thoát 0, CI của PR xanh). PR 40 còn là bản nháp, chưa merge.

**Chưa có bằng chứng:**
- Các bước sau `Build frontend` của `yana-studio-desktop.yml`: ghi secret, `electron-builder`, `verify-package`, smoke test cài đặt trên Windows. Cần merge PR 40, thêm secret `YANA_GOOGLE_CLIENT_SECRET` rồi chạy lại. Hai bước publish và install smoke đang bị bỏ qua nên chưa có gì được phát hành.
- Bản xem trước Vercel, Cloudflare từ `yana-web`.
- 31 test của `yana-desktop` trong bản sao ở `yana-web`: 29 đạt, 2 lỗi vì thiếu `.github/workflows/desktop.yml`. Cấu hình đóng gói của nó đọc `../../core`, `../../MANIFEST.json`, `../../target/...`, `../../yana-web/node_modules`, nên chỉ build được ở repo này. Hiện `yana-desktop` ở lại đây.

**Sẽ hỏng ở repo này khi xóa bản gốc (chưa xử lý):**
- `ci.yml`: job `dependency-audit` (npm audit của `tools/yana-web` và `tools/yana-desktop`) và `quality-gates` (`tools/yana-web/_test_static_path.js`).
- `desktop.yml` cần `tools/yana-web` để đóng gói; phải checkout thêm `yana-web` vào `tools/yana-web` nếu web rời đi.
- 9 file test ngoài workflow nhắc đến phần đã chuyển (4 về web, 4 về desktop, 1 kiểm `docs/index.html` là `tests/test_project_metadata.py`).
- `scanner/*.yml` nhắc `tools/yana-web`; `package.json:74-78` (các script `electron:*`, vẫn đúng nếu desktop ở lại); một số file Rust nhắc đường dẫn (phần lớn có vẻ là comment, chưa đọc từng cái).
- `herald.yml` gọi `core/scripts/check_counts.py`, kiểm các con số trong trang chủ; sau khi website rời đi không còn ai cập nhật các con số đó ở `yana-web`. `demo-gif.yml` ghi `docs/demo.gif` vào chỗ không còn phục vụ.
- `core/scripts/generate-agents-data.py` ghi `docs/agents-data.json` và `site/public/agents-data.json`; `core/scripts/gen_skills_page.py` ghi `docs/skills-data.json` (và một trang `docs/skills.html` không có ở bản đang chạy). Chưa có cách đưa dữ liệu agent hay skill sang `yana-web`. Riêng `docs/skills-data.json` đang chạy có 4.200 mục, còn `gen_skills_page.py` chỉ sinh 2.035, nên file đang chạy không do script này tạo ra; không được đồng bộ tự động khi chưa biết nguồn thật.

**Nguồn gốc `docs/skills-data.json` (đọc từ lịch sử GitHub, vì bản clone cục bộ là shallow):**
- Lần sinh lại thật cuối cùng là 2026-06-15 (commit "regen skills-data.json + skills.html, 3436 skills"); lần chạm cuối 2026-06-24. Từ đó file không có công cụ nào cập nhật.
- Theo ns, 4.200 mục gồm `yana-ai` 2.728, `terminal` 1.009, `openai` 424, `sports` 20, `venice` 19. Chỉ 1.980 id có trong `core/skills` (2.035 thư mục); 2.220 id không còn trong repo (ví dụ `composio-skills--*`, `terminal--*` lấy từ github.com/TerminalSkills/skills qua `import_skills_flat.py`).
- Hệ quả: trang chủ ghi 2.035 skill, danh mục trang `skills` liệt kê 4.200. Hai con số này khác nhau từ trước khi chuyển repo. Quyết định (giữ danh mục cũ hay sinh lại cho khớp 2.035) thuộc chủ repo; chưa có quyết định nên bản sao ở `yana-web` giữ nguyên file hiện tại.

**Nhánh cắt chuyển `cutover/remove-moved-parts` (đã đẩy, chưa mở PR, thông điệp commit ghi DO NOT MERGE):**
- Xóa `tools/yana-app`, `tools/yana-studio`, `tools/yana-ide`, `tools/yana-web`, `site`, `worker.js`, `wrangler.jsonc`, `vercel.json`, mọi file không phải `.md` trong `docs/` (1.976 file; còn 144 file `.md`), hai workflow `native-macos.yml` và `yana-studio-desktop.yml`, và `tests/test_site_no_hardcoded_studio_version.py` (đã có bản ở `yana-web`, PR 15).
- Sửa `ci.yml` (bỏ bước npm audit của `yana-web` và bước test đường dẫn tĩnh), `desktop.yml` (thêm bước checkout `yana-web` vào `tools/yana-web` trước khi cài phụ thuộc web, để `yana-desktop` ở lại repo này mà vẫn đóng gói được), `.github/dependabot.yml` (10 khối còn 7), và thêm mục "Where the web server lives" vào `tools/yana-desktop/README.md`.
- Đã chạy trên cây đó: `pytest tests` 1.002 đạt, 2 bỏ qua, 13 subtest; `drift-check`, `check_dangling_paths`, `verify-core-lock` sạch. Chưa chạy trên GitHub Actions.
- Chỉ mở PR sau khi chủ repo đã nối Vercel, Cloudflare và kiểm Pages sang `yana-web`; `check_counts.py` và `drift-check.sh` bỏ qua file thiếu và thoát 0, nên sau cắt chuyển hai công cụ này không còn báo gì về trang chủ ở repo này (việc đó do job `counts` ở `yana-web` đảm nhận).
- `dependabot.yml` còn khai báo `/site`, `/tools/yana-web`, `/tools/yana-studio`, `/tools/yana-desktop`. Hai repo mới đã có dependabot và CodeQL riêng (PR 7 ở `yana-web`, PR 30 ở `Yana-studio`).

**Chưa đọc kỹ:** `codeql.yml`, `sandbox.yml`, `publish.yml`, `release.yml`, `yana-audit.yml`, `mojo-vector-recall-pilot.yml` ở repo này (công cụ không thấy chúng nhắc đường dẫn đã chuyển); `hardening.yml` ở `Yana-studio`; cấu hình GitHub Pages của repo này (`pages-build-deployment` đang chạy, chưa biết phục vụ thư mục nào; API bị chặn, cần chủ repo xem ở Settings).

**Việc của chủ repo (không làm được từ phiên này):** tạo tổ chức GitHub nếu muốn gom ba repo (nên làm trước khi nối hạ tầng để chỉ nối một lần; tên chủ bị ghi cứng ở 212 file của repo này, 112 của `yana-web`, 10 của `Yana-studio`), nối lại Vercel `yana-ai-docs` và Cloudflare `yana` sang `yana-web`, kiểm Pages, thêm secret `YANA_GOOGLE_CLIENT_SECRET` cho `Yana-studio`, phát hành bản `app-v*` đầu tiên.

## Câu hỏi mở

Đã trả lời: tên repo đích là `yana-web` (web) và `yana-studio` (app).

1. (Đã trả lời) Bản Yana.app và Desktop đã cài: phát bản mới với địa chỉ cập nhật đã đổi, chấp nhận một số người dùng phải cài lại (xem rủi ro 1).
2. Danh sách trong bảng "Phạm vi chuyển đi" có đúng không? `yana-desktop` thuộc `yana-web` hay `yana-studio`? `github-app/`, `yana-notch`, `yana-promo`, `yana-pixel-bridge` đi đâu? Studio dựa trên VS Code (`tools/yana-studio`, `tools/yana-ide`) có vào `yana-studio` không?
3. Bố cục thư mục trong `yana-web` và `yana-studio` (web ở gốc hay trong `apps/`).
4. `release.yml` (build `yana-rt` theo tag `v*`) ở lại repo này đúng không?
5. (Đã trả lời) Chủ repo tự nối lại Vercel và Cloudflare sang repo đích khi chuyển; đây là thao tác nhỏ, làm lại được.
6. Cài Claude GitHub App cho `yana-studio` (và `yana-web` nếu cần push), hoặc tự đẩy tag lưu trữ.

## Cách dùng công cụ

```bash
python3 scripts/reorg_refmap.py                          # khảo sát toàn bộ
python3 scripts/reorg_refmap.py --target plans/          # ai nhắc đến plans/
python3 scripts/reorg_refmap.py --target plans/ --expect-zero   # exit 1 nếu còn code nhắc
```

Số liệu là cận trên theo khớp chuỗi. Công cụ bỏ qua `.claude/`, `core/skills/`, `vendor/`, file khóa và thư mục build. Mình chưa đọc từng tham chiếu để phân biệt phụ thuộc thật với comment.
