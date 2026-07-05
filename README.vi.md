<h1 align="center">Yana AI</h1>

<p align="center">
  <strong>Một lớp tường lửa an toàn giữa AI agent lập trình của bạn và shell máy bạn.</strong>
</p>

<p align="center">
  <em>Phát triển bởi Vũ Văn Tâm · 17 tuổi · Việt Nam</em>
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>Tiếng Việt</strong> · <a href="README.ko.md">🇰🇷 한국어</a> · <a href="README.zh.md">🇨🇳 中文</a>
</p>

<p align="center">
  <a href="https://github.com/yanacuti1121/yana-ai/actions/workflows/ci.yml">
    <img src="https://github.com/yanacuti1121/yana-ai/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <img src="https://img.shields.io/badge/version-v0.43.1-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-Apache_2.0-blue?style=for-the-badge" />
  <a href="https://www.npmjs.com/package/yana-ai">
    <img src="https://img.shields.io/npm/v/yana-ai?style=for-the-badge&logo=npm&color=cb3837" />
  </a>
  <a href="https://crates.io/crates/yana-rt">
    <img src="https://img.shields.io/crates/v/yana-rt?style=for-the-badge&logo=rust&color=ce422b" />
  </a>
  <a href="https://pypi.org/project/yana-ai/">
    <img src="https://img.shields.io/pypi/v/yana-ai?style=for-the-badge&logo=pypi&color=3775a9" />
  </a>
</p>

Agent của bạn thử làm một việc nguy hiểm. Yana chặn lại, giải thích lý do, và ghi log. Hoạt động với Claude Code, Cursor, Windsurf, Antigravity, Kiro, OpenCode, Zed, Gemini, GitHub Copilot, Aider và nhiều công cụ khác.

```bash
npm install -g yana-ai && npx yana-ai-install   # nối hooks (60 giây)
```

Thử bảo agent làm bậy, rồi xem điều gì xảy ra. Mỗi ví dụ dưới đây là copy nguyên văn từ một lần chạy thật của `core/hooks/guard-destructive.sh` ngày 2026-07-04, không phải copy quảng cáo (xem [Known Limitations](docs/reference/known-limitations.md) để biết guard này chưa bắt được gì):

```bash
# Agent thử: git push --force origin main
Blocked: 'git push --force' (any flag spelling) is not allowed. The
orchestrator pushes branches; force-pushing risks overwriting shared history.

# Agent thử: rm -rf /some/path
Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible.
Use targeted 'rm' with explicit paths, or ask the human to confirm first.

# Agent thử: git clean -f
Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked
files. Ask the human to confirm before running this.
```

Đó là toàn bộ giá trị dự án: quy tắc xác định trước, chạy hoàn toàn cục bộ, không có LLM nào trong đường ra quyết định, không có gì rời khỏi máy bạn.

## Chặn được những gì

Các thao tác git phá hoại, `rm` ngoài phạm vi workspace, pipe nội dung từ internet vào bash, và cài package chưa được kiểm định, thông qua 55 hook agent được hỗ trợ bởi runtime viết bằng Rust (`yana-rt`). Bên dưới: 101 agent chuyên trách, 1,989 kỹ năng, và 70 quy tắc thực thi, kiểm tra theo 826 cách trong CI. Xem [tài liệu kiến trúc](docs/reference/architecture.md) để biết chi tiết từng lớp gate.

## Kiểm tra xem đã hoạt động chưa

```bash
yana-ai doctor .      # kiểm tra hook đã nối đúng, config còn nguyên vẹn, gate khỏe mạnh
yana-ai audit .       # quét cấu hình agent trong repo của bạn để tìm rủi ro
```

## Ngoài lớp tường lửa

Engine còn có [một CLI với task router, mission dispatcher, và multi-agent launcher](docs/reference/cli-reference.md), một [GitHub Action](docs/reference/github-action.md) để quét mọi PR, và [Yana](docs/reference/yana-web.md), một giao diện chat xây trên cùng lõi này.

**→ [Tài liệu đầy đủ & demo](https://yanacuti1121.github.io/Yana-AI/)** · [Architecture](ARCHITECTURE.md) · [Vision](VISION.md) · [Roadmap](ROADMAP.md) · [Versioning](VERSIONING.md)

## Giới hạn thật

Các quy tắc là mẫu xác định trước: chúng bắt được các dạng nguy hiểm đã biết, không phải các kiểu tấn công chưa từng thấy. Chi tiết đầy đủ, gồm cả phần nào là chính sách trên giấy và phần nào đã thực sự chạy, nằm ở [Known Limitations](docs/reference/known-limitations.md). Nếu một gate chặn quá tay hoặc lọt lưới, [mở issue](https://github.com/yanacuti1121/yana-ai/issues); phản hồi từ thực tế là cách các gate trở nên sắc bén hơn.

---

**Vũ Văn Tâm** · Việt Nam · 17 tuổi

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [yanacuti1121.github.io/Yana-AI](https://yanacuti1121.github.io/Yana-AI/) |
| GitHub | [yanacuti1121/Yana-AI](https://github.com/yanacuti1121/Yana-AI) |
| Yana | [yanai-production.up.railway.app](https://yanai-production.up.railway.app) |

Apache-2.0. Xây dựng dựa trên ý tưởng, mẫu thiết kế, và công cụ từ cộng đồng mã nguồn mở, gồm các dự án cấp phép Apache 2.0, MIT, và các giấy phép cho phép khác, tất cả được sử dụng đúng theo giấy phép tương ứng. Những dự án ảnh hưởng trực tiếp đến quyết định thiết kế được ghi công trong các file mã nguồn và tài liệu quy tắc liên quan.
