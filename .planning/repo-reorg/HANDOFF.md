# Bàn giao: tách web và app khỏi Yana-AI (cập nhật 2026-11-11)

Tài liệu này dành cho phiên Claude chạy trên máy Mac của chủ repo, để đọc là nắm được trạng thái, không phải dựng lại ngữ cảnh. Kế hoạch gốc và bằng chứng chi tiết nằm ở `PLAN.md` cùng thư mục. Tài liệu này là bản tóm tắt thao tác, không thay thế `PLAN.md`.

Quy ước nhãn: **Đã xác minh** (có lệnh hoặc kết quả CI), **Chưa xác minh** (chưa chạy hoặc chưa đọc), **Suy luận** (hợp lý nhưng chưa có bằng chứng).

## 1. Ba repo và vai trò

| Repo | Vai trò sau khi tách | Trạng thái |
|---|---|---|
| `yanacuti1121/Yana-AI` | Chỉ giữ Rust (`yana-rt`, crates.io), Python (`yana-ai`, PyPI) và `core/` | Bản gốc CHƯA bị xóa gì. Web và app vẫn nằm ở đây và vẫn là bản đang chạy. |
| `yanacuti1121/yana-web` | Website `yana.vutam.link`, `site/`, `worker.js`, `vercel.json`, `wrangler.jsonc`, `tools/yana-web`, `yana-desktop/` | Đã sao chép, CI xanh. Hạ tầng (Vercel, Cloudflare) CHƯA nối sang. |
| `yanacuti1121/Yana-studio` | `yana-app/` (Swift macOS), `yana-studio/`, `yana-ide/` | Đã sao chép, CI xanh. Workflow phát hành desktop chưa qua hết. |

Nguyên tắc chủ repo đặt ra: sao chép trước, bản gốc vẫn chạy, ổn định rồi mới chuyển kết nối và cắt bản gốc.

## 2. Đã làm và đã xác minh

- `yana-web`: PR 2 (nhập dữ liệu), 3 đến 7 (sửa đường dẫn test, gitignore, CI, README, dependabot và CodeQL), 14 (job `counts` đối chiếu số liệu với Yana-AI), 15 (test Python của website). CI xanh: 30 file test Node, Astro build 8 trang, `npm audit` 0 lỗ hổng.
- `Yana-studio`: PR 25 (nhập `yana-app`, `yana-studio`, `yana-ide`), 26 (đổi địa chỉ cập nhật app), 27 (`native-macos.yml`), 28 (`yana-studio-desktop.yml`), 29 (README), 30 (dependabot, CodeQL), 31 (`yana-app-macos.yml`), 40 (sửa kiểu CodeMirror). `native-macos.yml` và `yana-app-macos.yml` đã chạy xanh trên macOS 15.
- Website: 95 trang HTML, 1.532 tham chiếu cục bộ giống bản gốc; các đích rewrite trong `vercel.json` đều tồn tại.
- Mã Swift của `yana-app`: 53 file `.swift`, giống bản gốc trừ hai dòng địa chỉ cập nhật (PR 26).
- Yana-AI: PR 523, 524, 526 đã merge. PR 527 (cập nhật `PLAN.md` và tài liệu này) CI xanh, chờ chủ repo merge.

## 3. Chưa qua: workflow phát hành desktop của Yana-studio

Lần chạy `42971796225` (dispatch trên `main`, sau khi PR 40 merge): checkout Yana-AI, build `yana-rt`, smoke test, `npm ci`, build frontend (`tsc` và `vite`), `electron-builder` đều đạt trên Linux x64, Windows x64, Windows arm64. Cả ba hỏng ở bước 14 `Verify packaged app`:

> Google sign-in secret is missing: .../resources/secrets.local.cjs (scripts/write-secrets.cjs did not run, or YANA_GOOGLE_CLIENT_SECRET was empty)

Nguyên nhân: secret `YANA_GOOGLE_CLIENT_SECRET` chưa có ở `Yana-studio` hoặc đang rỗng. Chủ repo cần thêm; giá trị là Google OAuth client secret mà bản gốc dùng. Phiên Claude không được thấy giá trị này.

**Chưa xác minh:** mọi thứ từ bước 15 (upload, publish, `Install smoke` trên Windows). Chưa phát hành gì.

Lưu ý: lần dispatch đầu (`42971729939`) hỏng ở `Verify commit passed required CI` vì commit merge còn mới, các check `check` và `test` chưa xong. Suy luận về thời điểm, đã khớp vì chạy lại thì qua.

## 4. Việc chỉ chủ repo làm được

1. Merge PR 527 của Yana-AI.
2. Thêm secret `YANA_GOOGLE_CLIENT_SECRET` ở `Yana-studio` (Settings, Secrets and variables, Actions), rồi chạy lại `yana-studio-desktop.yml`.
3. Tạo release `app-v1.0.0` ở `Yana-studio`: tag `app-v1.0.0`, target `main`, tên "Yana 1.0.0", ghi chú sao từ release Yana-AI, đính kèm `Yana-1.0.0.dmg` (474.865.728 byte, SHA-256 `b7b77b697d8f03d7c78561e527b40668a401e09d2aa8ccf712b8f08d0269617c`) và `Yana-1.0.0.zip` (428.743.568 byte, SHA-256 `a5e2b873a787a6b4ecc373a576516a2c7ef85e3f20f6a6ae1dbd48d784f9d2df`). Kiểm SHA-256 trước khi publish. Phiên Claude không tạo được release.
4. Nối lại Vercel `yana-ai-docs` và Cloudflare `yana` sang `yana-web` (giữ domain `yana.vutam.link`, biến môi trường, khóa Groq, KV). Kiểm cấu hình GitHub Pages của Yana-AI (đang chạy `pages-build-deployment`, chưa biết phục vụ thư mục nào).
5. Quyết định tạo tổ chức GitHub hay không (nên trước khi nối hạ tầng để nối một lần).
6. Bản `app-v*` đầu tiên thật sự dựng trên máy Mac của chủ repo.

## 5. Câu hỏi chủ repo chưa trả lời

- Có revert `Yana-studio` PR 26 (đã đổi địa chỉ cập nhật app trước khi có bản `app-v*` ở đó) không? Hiện chưa gây hại nhưng đừng phân phối app từ `main` của `Yana-studio` khi chưa có release `app-v*`.
- `yana-desktop` ở lại Yana-AI hay đi theo `yana-web`? Mặc định hiện tại: ở lại (nó đóng gói web server, nên `desktop.yml` ở nhánh cắt chuyển checkout thêm `yana-web`).
- `docs/skills-data.json`: giữ danh mục cũ 4.200 mục (lần sinh lại thật cuối 2026-06-15, 2.220 id không còn trong `core/skills`) hay sinh lại cho khớp 2.035 skill?
- Sửa README, ARCHITECTURE, AGENTS.md của Yana-AI ngay hay sau khi cắt chuyển (ví dụ 1.989 và 2.035 skill, AGENTS.md ghi v1.6.1 trong khi `Cargo.toml` là 1.5.2).

## 6. Nhánh cắt chuyển (đừng merge sớm)

Nhánh `cutover/remove-moved-parts` của Yana-AI đã đẩy, không có PR, commit ghi DO NOT MERGE. Nó xóa `tools/yana-app`, `tools/yana-studio`, `tools/yana-ide`, `tools/yana-web`, `site`, `worker.js`, `wrangler.jsonc`, `vercel.json`, 1.976 file không phải `.md` trong `docs/`, hai workflow chuyển đi và một test; sửa `ci.yml`, `desktop.yml`, `dependabot.yml`. Đã kiểm trên cây đó: `pytest tests` 1.002 đạt, 2 bỏ qua; `drift-check`, `check_dangling_paths`, `verify-core-lock` sạch. **Chưa chạy trên GitHub Actions.** Chỉ mở PR sau khi mục 4.4 xong. Sau cắt chuyển còn dọn 17 PR dependabot cũ của các thư mục đã chuyển, và `scanner/*.yml`, `herald.yml`, `demo-gif.yml` chưa được xử lý.

## 7. Cách tự kiểm chứng trên máy Mac

```bash
git clone https://github.com/yanacuti1121/Yana-AI.git && cd Yana-AI
bash core/scripts/verify-core-lock.sh
python3 core/scripts/check_counts.py
cargo test --lib --features cli
```

```bash
git clone https://github.com/yanacuti1121/Yana-studio.git && cd Yana-studio
swift build --package-path yana-app
cd yana-studio && npm ci && npx tsc --noEmit && npx vite build
```

Ghi chú: ở môi trường đám mây, `cargo` đầy đủ hỏng vì một build-script (`liteparse-pdfium-sys`) cố tải pdfium và gặp lỗi chứng chỉ TLS của proxy; đó là hạn chế môi trường, không phải lỗi mã. Trên Mac thường không gặp.

## 8. Ràng buộc đang có hiệu lực ở Yana-AI

- Không `git push` nếu chưa có người duyệt; không force push (`git-push-enforcement`, `02-terminal-validator`).
- `core/rules`, `core/gates`, `core/hooks`, `core/scripts`, `src/guard` bị ghim SHA-256 trong `core/config/core-lock.json`; sửa ở đó cần tái tạo khóa và hai reviewer độc lập (rule 54, 67). Việc tách repo chưa chạm các thư mục này.
- Văn bản trong repo theo `text-slop-law`: không em dash, không nháy cong, không ký tự ba chấm, không từ sáo rỗng.
- Báo cáo theo `69-cognitive-reliability-law`: tách đã biết, chưa biết, giả định; không nói "xong" khi chưa có bằng chứng.
- Thao tác GraphQL (`gh pr`, `gh release download`) bị chặn trong phiên đám mây; dùng REST `gh api`.

## 9. Việc phiên tiếp theo có thể làm ngay

- Sau khi có secret: chạy lại `yana-studio-desktop.yml` bằng `workflow_dispatch` và báo bước hỏng tiếp theo, nếu có.
- Thử build từng PR dependabot lớn của `Yana-studio` (#33, #35 đến #39: lucide-react 0.577 lên 1.67, mermaid 11 lên 12, react-day-picker 9 lên 10, nhóm studio-web) trước khi quyết định merge.
- Phân tích mã trên Mac: những gì không làm được từ môi trường đám mây là build Swift có chứng chỉ, chạy app thật, và kiểm thử đóng gói trên macOS.
