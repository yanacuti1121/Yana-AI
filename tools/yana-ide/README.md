# Yana Studio trên nền Code-OSS

Thư mục này chỉ chứa phần Yana sửa đè lên VS Code (Code-OSS, MIT), không chứa
mã VS Code. Mã upstream được kéo về theo đúng commit trong `upstream.lock`.
Plan đầy đủ: `.planning/yana-studio-vscode-base/PLAN.md`.

## Thành phần

| Đường dẫn | Vai trò |
|---|---|
| `upstream.lock` | Tag, commit VS Code và bản Node cần dùng |
| `product.overrides.json` | Tên, bundle id, thư mục dữ liệu, gallery Open VSX |
| `patches/` | Patch tối thiểu lên mã upstream |
| `extensions/yana-theme/` | Theme Yana Dark, lấy màu từ thiết kế Autonomous Runtime Cockpit |
| `scripts/prepare.sh` | Áp tất cả phần trên vào một checkout upstream |

## Chạy bản dev (macOS)

```bash
# 1. Lấy upstream đúng commit trong upstream.lock, đặt ngoài repo Yana
git clone --depth 1 --branch 1.141.0 https://github.com/microsoft/vscode.git ~/yana-ide-upstream/vscode

# 2. Dùng Node đúng major trong upstream.lock (24.x)
export PATH="$HOME/yana-ide-upstream/node/bin:$PATH"

# 3. Cài và áp phần Yana
cd ~/yana-ide-upstream/vscode && npm ci
/path/to/Yana-AI/tools/yana-ide/scripts/prepare.sh ~/yana-ide-upstream/vscode

# 4. Build và mở. Dùng compile-client, không dùng `npm run compile`:
#    lệnh đó còn build extension Copilot mà Yana đã tắt (removed-extensions.txt).
npm run compile-client
./scripts/code.sh
```

## Giới hạn đã biết

- Gallery là Open VSX. Extension độc quyền của Microsoft (Pylance, C# Dev Kit,
  Remote-SSH, Live Share) không dùng được, giống Cursor và Antigravity.
- Không dùng tên và logo "Visual Studio Code".
- Chưa có icon app, ký, notarize, CI. Đó là giai đoạn P5 trong plan.
