# Yana Studio trên nền Code-OSS (kiểu Antigravity)

Trạng thái: DRAFT, chờ anh Tâm duyệt. Chưa có dòng code nào.
Ngày: 2026-10-10.

## Mục tiêu

Yana Studio dùng VS Code (Code-OSS) làm gốc, giữ gần như nguyên bản, chỉ đổi:
- Màu: theo `docs/stitch_yana_studio_ide_evolution_extracted/.../autonomous_runtime_cockpit/DESIGN.md` (nền `#111317`).
- Panel Yana bên phải (màn `yana_studio_main_workspace`): chế độ Autonomous / Supervised / Plan-Only, thẻ diff Accept & Apply, thẻ Human approval.
- Manager view kiểu Antigravity (màn `autonomous_runtime_cockpit`): theo dõi nhiều agent chạy song song.
- Màn Models & Runtime (màn `yana_studio_models_runtime_settings_macos_titlebar`).

## Cách làm: patch chồng lên upstream, không giữ fork toàn bộ

Học theo VSCodium: repo của mình chỉ chứa phần khác biệt, upstream VS Code
được kéo về lúc build theo một tag cố định. Lý do: anh làm một mình, giữ fork
nguyên lịch sử thì mỗi lần VS Code ra bản mới phải rebase hàng nghìn commit;
giữ patch thì chỉ phải sửa vài file patch bị lệch.

Thư mục mới `tools/yana-ide/`:

```
upstream.lock            tag + commit VS Code đang dùng
product.json             tên "Yana Studio", gallery = Open VSX, tắt telemetry Microsoft
patches/                 càng ít càng tốt: branding, layout mặc định (aux bar phải mở sẵn)
extensions/yana-theme/   color theme từ DESIGN.md
extensions/yana-agent/   extension built-in: panel Yana, approval, diff, Manager view
scripts/build.sh         kéo upstream theo lock, áp patch, chép extension, build
```

## Tận dụng Yana Studio hiện tại (tools/yana-studio, khoảng 20k dòng)

| Hiện tại | Sang bản mới |
|---|---|
| `host/runtime.cjs`, `chat-turns.cjs`, `permissions.cjs`, `model-*.cjs`, `mixture-of-agents.cjs` | Port vào phía Node của `yana-agent` (extension host) |
| `host/model-credentials.cjs` | Chuyển sang `SecretStorage` của VS Code |
| `renderer/` React: chat, GovernancePopover, ModelManager, Tasks | Port thành webview của `yana-agent` |
| `renderer/Editor.tsx` (CodeMirror), `Terminal.tsx` (xterm), `host/terminals.cjs`, file tree | Bỏ, VS Code đã có sẵn |
| Kênh nói chuyện với `yana-rt` (NDJSON) và guard | Giữ nguyên, đây là phần khác biệt thật của Yana |

App cũ giữ chạy song song đến khi bản mới đủ tính năng, trong lúc đó không thêm tính năng mới vào app cũ.

## Các giai đoạn

| GĐ | Việc | Xong khi |
|---|---|---|
| P0 | Spike: kéo VS Code theo tag mới nhất ra thư mục ngoài repo, build thử trên mac arm64 | Có số đo thật: thời gian build, dung lượng đĩa, bản Node cần dùng |
| P1 | `product.json` + `yana-theme` + patch branding | App tên Yana Studio mở được, đúng màu, cài extension từ Open VSX được |
| P2 | `yana-agent`: panel chat nối `yana-rt`, thẻ approval, diff Accept & Apply | Một turn chat thật chạy qua guard, bị chặn thì hiện thẻ approval |
| P3 | Manager view: bản đầu là webview editor mở từ activity bar, chưa sửa lõi workbench | Thấy được nhiều agent cùng chạy và trạng thái của từng cái |
| P4 | Port Models & Runtime, Tasks, Permissions | Đủ tính năng so với `FEATURE-PARITY.md` của app cũ |
| P5 | Đóng gói, ký và notarize mac, bản Windows, CI, kênh update | Có bản ký được, CI build được |

## Rủi ro

- Rebase theo VS Code hằng tháng. Cách patch giảm bớt, nhưng không hết.
- Không được dùng Marketplace của Microsoft, phải dùng Open VSX. Một số extension của Microsoft (Pylance, C# Dev Kit, Remote-SSH, Live Share) có license chỉ cho sản phẩm Microsoft, nên Yana Studio không có. Cursor và Antigravity cũng gặp vấn đề này.
- Không được dùng tên và logo "Visual Studio Code".
- Build VS Code nặng: tốn nhiều GB đĩa và nhiều phút CI. P0 sẽ đo số thật.
- Bản mac phải ký và notarize, bản Windows phải ký, nếu không người dùng bị cảnh báo khi mở.

## Cần anh chốt trước khi bắt đầu P0

1. Lệnh đóng băng tính năng từ 2026-07 đã bỏ chưa?
2. Cho phép clone repo `microsoft/vscode` (lớn) ra thư mục ngoài repo Yana, ví dụ `~/yana-ide-upstream/`?
3. Giữ app cũ chạy song song đến P4 như trên, hay bỏ luôn?
4. Manager view bản đầu làm webview (nhanh, chưa sửa lõi workbench) được chưa, hay anh muốn sửa lõi ngay để giống Antigravity hơn?
