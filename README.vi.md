<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/yana-banner-dark.svg">
    <img src="docs/yana-banner-light.svg" alt="Yana AI" width="760">
  </picture>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.vi.md"><strong>Tiếng Việt</strong></a> · <a href="README.ko.md">한국어</a> · <a href="README.zh.md">中文</a>
</p>

<h1 align="center">Yana AI 🐰</h1>

<p align="center">
  <a href="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml"><img src="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://crates.io/crates/yana-rt"><img src="https://img.shields.io/crates/v/yana-rt?logo=rust&color=ce422b" alt="yana-rt on crates.io"></a>
  <a href="https://pypi.org/project/yana-ai/"><img src="https://img.shields.io/pypi/v/yana-ai?logo=pypi&color=3775a9" alt="yana-ai on PyPI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-2563eb" alt="Apache 2.0 license"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-2e8b75" alt="Contributions welcome"></a>
</p>

<p align="center"><em>Sáng lập bởi Vũ Văn Tâm · Việt Nam</em></p>

---

## Model đề xuất. Yana quyết định. Con người nắm quyền.

Yana là lớp điều khiển nằm giữa AI và quyền lực thật. Model có thể nói nó muốn
làm gì. Yana quyết định việc đó có được phép hay không, và con người luôn có
thể dừng nó lại.

```text
Model        đề xuất một hành động
   |
Authority    agent này có được phép yêu cầu không?
   |
Capability   đây chính xác là quyền gì?  (một tập nhỏ, cố định)
   |
Policy       lúc này có được làm không?  quy tắc trước, rồi đến con người
   |
Executor     chỉ thực hiện đúng thao tác được phép
```

Mọi model đều đi qua cùng một đường: Claude, GPT, Gemini, DeepSeek, hay model
chạy ngay trên máy của bạn. Skill dạy agent cách làm việc; chỉ capability mới
cấp quyền hành động.

## Cấu trúc hệ thống

| Thành phần | Làm gì | Ở đâu | Trạng thái |
| --- | --- | --- | --- |
| **Yana Studio** | Không gian làm việc trên máy tính để làm việc với AI trên một dự án thật. | [`tools/yana-studio`](tools/yana-studio) | Đang dùng |
| **Runtime (`yana-rt`)** | Engine Rust: một vòng lặp turn và một hợp đồng authority cho model local lẫn cloud, 19 provider. | [`src/`](src) | Đang dùng |
| **Governance** | Capability manifest, phê duyệt của con người, nhật ký kiểm toán nối băm, kiểm tra toàn vẹn core-lock, và Giám Thị, bộ giám sát độc lập có thể dừng mọi phiên làm việc. | [`core/`](core) | Đang dùng |
| **Harness adapters** | Claude Code, Codex, Cursor và Antigravity, được quản trị qua hook, rule và gate sinh tự động. Mức thực thi khác nhau tùy host. | [`adapters/`](adapters) | Đang dùng, tùy host |
| **Lớp tri thức** | 100 agent và 2.026 skill dạy agent cách làm việc. Chúng không cấp quyền nào. | [`core/agents`](core/agents), [`core/skills`](core/skills) | Đang dùng |
| **Yana OS** | Lớp quản lý cục bộ: danh tính agent, mức tự chủ, quota, sức khỏe, cách ly. | [`src/os`](src/os) | Đang phát triển |
| **Yana Wheelbot** | Nền tảng robot trên ESP32-S3, nằm trong repository riêng. | [`yana-wheelbot`](https://github.com/yanacuti1121/yana-wheelbot) | Thử nghiệm |

`Đang dùng` nghĩa là đã phát hành và được sử dụng. `Đang phát triển` nghĩa là
đã có code thật nhưng chưa đầy đủ tính năng. `Thử nghiệm` nghĩa là tùy chọn bật
và chưa được kiểm chứng độc lập.

`yana-rt` có 39 subcommand, không phụ thuộc Python. Đây là số đếm theo mã nguồn trên mọi cấu hình build, kể cả các lệnh nằm sau feature flag.

```text
core/
├── hooks/    # 66 hook PreToolUse / PostToolUse / Stop
├── rules/    # 71 rule bắt buộc
├── agents/   # 100 agent chuyên biệt
├── skills/   # 2.026 skill
└── config/
    └── core-lock.json    # manifest SHA-256 — 287 file lõi được ghim
```

## Yana Studio

Một cửa sổ cho những thứ bạn hay phải chuyển qua lại khi làm việc với AI trên một dự án:

- **File và trình soạn thảo:** mở thư mục thật, tìm trong toàn dự án, sửa bằng CodeMirror. Khi lưu, Studio phát hiện thay đổi từ bên ngoài trước khi ghi đè.
- **Terminal:** phiên PTY thật theo tab, hoặc lưới tối đa 12 phiên.
- **Git:** xem trạng thái, worktree và diff (chỉ đọc).
- **Chat:** stream qua `yana-rt`, dùng model local hoặc cloud, cùng một đường authority với mọi thứ khác.
- **Telemetry quản trị:** cái gì được cho phép, cái gì bị chặn, và vì sao.

Tải về từ [bản phát hành mới nhất](https://github.com/yanacuti1121/Yana-AI/releases/latest)
hoặc [yana.vutam.link](https://yana.vutam.link).

| Nền tảng | Bộ cài |
| --- | --- |
| macOS, Apple Silicon | `.dmg` hoặc `.zip` |
| Windows | `.exe`, x64 hoặc ARM64 |
| Linux | `.deb` hoặc `.AppImage` |

Mỗi bản phát hành liệt kê tài nguyên riêng của nó, nên hãy kiểm tra nền tảng của
bạn có trong đó không, và đối chiếu với `SHA256SUMS` khi có. Bản macOS được ký
ad-hoc và **chưa được Apple notarize** (dự án chưa có tài khoản Apple Developer),
nên Gatekeeper sẽ cảnh báo khi mở lần đầu; [docs/MACOS_INSTALL.md](docs/MACOS_INSTALL.md)
hướng dẫn hai cách chính thức để mở.

## Dòng lệnh

```bash
pip install yana-ai    # CLI Python
yana-ai install        # thêm hook và rule của Yana vào repo của bạn
yana-ai doctor .       # kiểm tra mọi thứ đã nối đúng chưa
cargo install yana-rt  # runtime native, không cần Python
```

Cần Python 3.11+ (hoặc Rust), Git, và một harness được hỗ trợ. Toàn bộ lệnh nằm
trong [COMMANDS.md](COMMANDS.md). Yana không được phát hành lên npm, xem
[VERSIONING.md](VERSIONING.md).

## Điều gì bảo vệ bạn, và nó dừng ở đâu

- **Nhật ký kiểm toán:** nối băm, nên sửa hoặc xóa một dòng đều bị phát hiện. Nó chống sửa được phát hiện, chưa phải chống sửa tuyệt đối.
- **Core-lock:** manifest SHA-256 phát hiện file trong `core/` bị đổi, bị xóa hoặc bị chèn thêm.
- **Cổng con người:** force-push, publish, deploy và xóa cần xác nhận trong phiên hiện tại; sự đồng ý trước đó không được kế thừa.
- **Giám Thị:** tùy chọn bật, chạy ngoài mọi phiên AI, và khi phát hiện vấn đề sẽ khóa mọi lệnh tool về sau cho đến khi một người gỡ khóa.
- **Giới hạn:** `guard-destructive.sh` so khớp chuỗi lệnh chứ không phân tích cú pháp shell đầy đủ, nên một lệnh cố tình tạo ra có thể lọt qua. Bản web chạy trên trình duyệt mà không có Rust runtime chưa được quản trị đầy đủ. Chi tiết: [giới hạn đã biết](docs/reference/known-limitations.md).

## Xem thêm

[ARCHITECTURE.md](ARCHITECTURE.md) · [PHILOSOPHY.md](PHILOSOPHY.md) · [ROADMAP.md](ROADMAP.md) · [CHANGELOG.md](CHANGELOG.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [Lời cảm ơn](ACKNOWLEDGEMENTS.md) · [Nguồn gốc](docs/history/LINEAGE.md)

Do một người xây dựng, không có đội ngũ, không có tài trợ: **Vũ Văn Tâm**, Việt Nam ·
[yana.vutam.link](https://yana.vutam.link/) · phamlongh230@gmail.com · [Apache 2.0](LICENSE)
