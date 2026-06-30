# Lịch sử phát triển Yana AI

> Bắt đầu: 17/05/2026 · Tác giả: Vũ Văn Tâm (17 tuổi)

Tài liệu này ghi lại hành trình xây dựng Yana AI từ đầu — từ một repo rỗng đến hệ thống AI agent hoàn chỉnh trong 6 tuần.

---

## Giai đoạn 1 — Xây móng
**17/05/2026 – 22/05/2026 · ~1 tuần**

Bắt đầu từ một repo trống. Không có framework, không có template, không có người hướng dẫn.

**Đã xây dựng:**

- Scaffold toàn bộ repo từ đầu, đặt tên nội bộ là YAMTAM ENGINE
- YAMTAM runtime — vòng lặp xử lý agent đầu tiên
- **Truth Gate** — cổng kiểm tra sự thật, ngăn agent báo cáo sai kết quả
- **L1/L2 Memory** — hệ thống bộ nhớ nguyên tử: L1 tồn tại vĩnh viễn, L2 tồn tại theo phiên
- **Hash-chain audit log** — mỗi dòng log có chữ ký SHA-256 liên kết với dòng trước (kiến trúc Trillian), không thể xoá hay sửa mà không bị phát hiện
- Trust score, fact-check, và router đầu tiên
- CI/CD pipeline release tự động lên GitHub Releases
- Hệ thống security guardrails đầu tiên theo chuẩn OWASP LLM Top 10
- Chuyển sang giấy phép **Apache 2.0**

**Cột mốc:** v1.3.26 với 160+ skills

---

## Giai đoạn 2 — Pháo đài bảo mật và kho kỹ năng
**22/05/2026 – 28/05/2026 · ~1 tuần**

Từ hệ thống nhỏ, mở rộng thành kiến trúc bảo vệ nhiều lớp và thư viện kỹ năng lớn.

**Đã xây dựng:**

- **Agent Defense Fortress** — lớp bảo vệ chống tấn công vào agent, gồm 70+ rules bảo mật
- Import hàng loạt skills: 231 → 321 → **350+ skills**
- **v1.6.0** — Autonomous Session Safety, tích hợp MCP server
- **v1.7.0** — phát hành công khai lần đầu
- 6 adapter AI: Gemini, Qwen, DeepSeek, OpenRouter, Cursor, Aider, Continue.dev
- **yamtam CLI** với các lệnh: `audit`, `doctor`, `scan`, `guard`, `policy`
- **yamtam-rt** — rewrite toàn bộ runtime và scanner bằng Rust, nhanh hơn 10–50× so với Python
- Đóng gói lên **npm** và **PyPI** (v0.15.0)

**Cột mốc:** v0.17.0, yamtam-rt v1.0.0 Rust CLI

---

## Giai đoạn 3 — Import lớn và xây website
**29/05/2026 – 03/06/2026 · ~5 ngày**

Mở rộng quy mô nội dung và xây diện mạo công khai cho dự án.

**Đã xây dựng:**

- Import **8,550 skills** từ các repo open-source lớn (VoltAgent, ComposioHQ, antigravity-awesome-skills)
- Toàn bộ **website** từ đầu: i18n VI/EN/KO, dark/light mode, marketplace, guide, changelog, skills browser
- **io.html** — giao diện điện thoại iOS 26 với liquid glass, Dynamic Island animation, water droplets, haptic feedback, âm thanh
- Nhạc nền lofi Việt Nam, hiệu ứng cánh sen rơi, weather widget từ Open-Meteo (không cần API key)
- **GitHub App** 1-click install qua Cloudflare Worker — người dùng cài YAMTAM vào repo chỉ bằng một nút
- Thêm **MOSS-TTS-Nano** (TTS tiếng Việt CPU-friendly) và **Codexmate** (dashboard agent)
- i18n tiếng Việt 100% cho Codexmate (992 chuỗi)

**Cột mốc:** 1,000,000 dòng code (01/06/2026)

---

## Giai đoạn 4 — Yana AI chat và multi-agent
**04/06/2026 – 10/06/2026 · ~1 tuần**

Từ công cụ dòng lệnh thành ứng dụng chat AI thực sự.

**Đã xây dựng:**

- **Yana Web** → đổi tên thành **Yana AI** — chat interface kết nối thực sự đến AI (Groq, Claude, OpenRouter, Gemini, DeepSeek)
- Giao diện React + glass-morphism
- **Electron desktop app** (yana-desktop) — chạy như ứng dụng desktop native
- Multi-agent parallel execution — nhiều agent chạy song song và tổng hợp kết quả
- Supabase auth + đồng bộ lịch sử chat
- Vision support — đính ảnh vào chat
- **Codebase RAG** — upload thư mục code → BM25 index → inject vào context AI
- Mã hoá API key tại client (AES-256-GCM, WebCrypto, rule 66) — key không bao giờ lưu dạng plaintext
- **95 agents** mỗi cái có identity, emotion journal và phong cách riêng biệt
- **GitHub Marketplace** được approve và live

**Cột mốc:** v0.41.0, GitHub Marketplace approved

---

## Giai đoạn 5 — Bảo mật tầng cao và mobile
**10/06/2026 – 14/06/2026 · ~4 ngày**

Bổ sung các lớp bảo vệ nâng cao và mở rộng ra nền tảng di động.

**Đã xây dựng:**

- **Rule 68** — Principal Confidentiality Law: thông tin người dùng chia sẻ là mật mặc định, không được ghi vào log hay đẩy ra ngoài
- **Rule 69** — Cognitive Reliability Layer (L6): ngăn AI báo "xong rồi" khi chưa thực sự xong
- **ADR-006** — ghi lại bài học từ postmortem về AI overclaiming
- **Yana Mobile** — shell riêng cho điện thoại, tự động redirect theo user agent
- **ChatGPT-style long-term memory** cho Yana chat
- **9router** — local AI gateway, chạy model trên máy cá nhân không cần API key
- **OCR** bằng EasyOCR — đính ảnh hoặc PDF vào chat, trích xuất text inline
- 15 harness adapters: Windsurf, Kiro, Antigravity...

**Cột mốc:** v0.41.3

---

## Giai đoạn 6 — Hoàn thiện và Mac M4 mới
**14/06/2026 – 30/06/2026 · ~2 tuần**

Nâng cấp hạ tầng, ổn định hệ thống, chuyển sang máy mới.

**Đã xây dựng:**

- **Context compression** với Ollama (qwen3-coder:14b) — nén context tự động khi phiên làm việc dài
- **codebase-memory-mcp** — knowledge graph của codebase, agent có thể query cấu trúc code
- **cbm-query skill** — query knowledge graph từ Claude Code
- **ADR-007** — đề xuất tích hợp Claude Agent SDK chính thức
- Setup máy **Mac M4** mới: cài đặt đầy đủ gh CLI, npm, Ollama, đồng bộ toàn bộ hệ thống
- Fix CLI `yana` banner — symlink resolution trên macOS, tương thích bash 3.2
- Thêm phần **Acknowledgements** vào 4 README (EN/VI/KO/ZH) — ghi nhận các dự án Apache 2.0 đã đóng góp

**Cột mốc:** v0.42.3, 15,052 files, máy mới fully operational

---

## Tổng kết

| | Con số |
|---|---|
| Thời gian | 6 tuần (17/05 – 30/06/2026) |
| Commits | ~900+ |
| Files | 15,052 |
| Dòng code | 1,100,000+ |
| Skills | 3,500+ |
| Agents | 95 |
| Hooks | 46 |
| Rules bảo mật | 70+ |
| Ngôn ngữ | Rust, TypeScript, Python, Bash |
| Nền tảng | CLI · Web · Desktop · Mobile |

Dự án được xây dựng một mình, không có đội ngũ, không có ngân sách — chỉ có thời gian và máy tính.
