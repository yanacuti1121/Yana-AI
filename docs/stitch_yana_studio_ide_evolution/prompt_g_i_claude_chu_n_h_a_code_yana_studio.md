# PROMPT ĐẶC TẢ CHI TIẾT (COPY GỬI CHO CLAUDE ĐỂ CODE 100% CHÍNH XÁC)

Dưới đây là prompt mẫu có cấu trúc "System Prompt + UI Specification + Code Blueprint" được chuẩn hóa dành riêng cho Claude (Claude 3.5 Sonnet / Claude 3.7 Sonnet). Khi anh gửi prompt này, Claude sẽ không bao giờ code "chung chung" hay tự bịa giao diện, mà sẽ dựng đúng 1:1 theo chuẩn VS Code x Yana Studio Dark Cockpit.

---

```markdown
BẠN LÀ SENIOR FRONTEND ENGINEER & CHUYÊN GIA SYSTEM UI (TAILWIND CSS + REACT + TYPESCRIPT).
HÃY VIẾT TOÀN BỘ CODE HOÀN CHỈNH CHO GIAO DIỆN "YANA STUDIO — MODELS & RUNTIME SETTINGS" THUỘC DỰ ÁN https://github.com/yanacuti1121/Yana-AI.

YÊU CẦU BẮT BUỘC (CRITICAL SPECIFICATIONS):
1. Không code rút gọn, không dùng comment "// ...rest of code", không placeholder sơ sài.
2. Styling: 100% Tailwind CSS theo bảng màu Dark Theme Cockpit:
   - Nền chính (surface): #111317
   - Thanh taskbar / Titlebar macOS: #1a1c20 (viền dưới #27292e, cao h-9 tức 36px)
   - Thẻ Container / Panel: #1a1c20, viền border-[#27292e]
   - Nền input / inner box: #111317 (border #27292e)
   - Màu chủ đạo (Primary Blue): #4f80ff, hover #3b6df0
   - Font chữ: Geist / Inter cho UI, Geist Mono / JetBrains Mono cho code/paths
   - Text colors: Trắng (#ffffff), Muted (#9a9da5), Subtitle (#71747d)

---

### BỐ CỤC 4 PHẦN CHI TIẾT CẦN DỰNG:

#### PHẦN 1: MACOS TITLEBAR & VS CODE CHROME (HÀNG TRÊN CÙNG - h-9)
- Góc trái: 
  - 3 nút Traffic Lights chuẩn macOS tròn 12px: Đỏ (#ff5f56), Vàng (#ffbd2e), Xanh lá (#27c93f).
  - Menu ngang VS Code: File, Edit, Selection, View, Go, Run, Terminal, Help (hover text-white).
  - Ký tự phân cách "|" và các nút icon layout/sidebar toggle.
  - Cặp nút điều hướng "<" và ">".
- Trung tâm:
  - Command Palette dài ~380px, nền #111317, viền #27292e, có icon Search bên trái, text monospace chính giữa: "yanacuti1121/Yana-AI ⌘P".
- Góc phải:
  - Danh sách chuyển Surface: "Studio Home", "Workspace", "Design Canvas", "Tasks", "Models & Runtime" (tab đang Active: nền #2b2d32, chữ #4f80ff, viền #4f80ff/40), "Settings".

#### PHẦN 2: HEADER CÀI ĐẶT & TAB NAVIGATION
- Sub-badge: "CONTROL PLANE" (text-[10px] uppercase font-semibold text-[#4f80ff] tracking-wider).
- Tiêu đề: "Cài đặt Yana Studio" (text-xl font-bold text-white).
- Mô tả: "Quản lý giao diện, model, runtime và kết nối trong một nơi."
- Link: "Xem lại giới thiệu Studio ↗".
- Thanh 9 Tabs cài đặt:
  ['Tài khoản', 'Giao diện', 'Mô hình & Điều phối' (Active - bg-[#2b2d32] text-[#4f80ff]), 'Sử dụng', 'Tài khoản & Kết nối', 'Quyền hạn', 'Công cụ ngoài', 'Lệnh Yana', 'Riêng tư & Dữ liệu'].

#### PHẦN 3: MODEL & RUNTIME CONTROLS (2 CỘT TRÊN)
- Cột trái: "Model đang dùng"
  - Badge [Local] góc phải.
  - Sub: "Cùng catalog với yana-rt; mỗi provider giữ key riêng."
  - Dropdown Provider: "TurboFieldfare • On-device".
  - Endpoint input: "http://127.0.0.1:8091/v1" kèm chú thích "Provider Yana chính thức dùng endpoint cố định. Custom chỉ nhận HTTPS hoặc loopback HTTP."
  - Model ID input: "gemma-4-26b-a4b-it".
  - Error alert box: "Error invoking remote method 'studio:discoverModels': TypeError: fetch failed" kèm nút "Thử lại".
  - Candidate badge: "Gemma 4 26B (gemma-4-26b-a4b-it) [local]".
- Cột phải: "Local AI trên máy"
  - Nút góc phải: [⟳ Quét local].
  - Sub: "Dò endpoint từ trusted host, không qua renderer. Bấm Quét local để tìm 9Router, Ollama, LM Studio, llama.cpp, TurboFieldfare và AirLLM."
  - Danh sách dịch vụ local phát hiện:
    + Ollama Engine (http://127.0.0.1:11434 • 3 models active) -> Badge Xanh [CONNECTED].
    + LM Studio Server (http://127.0.0.1:1234/v1 • Port ready) -> Badge [KEYLESS READY].
    + llama.cpp Runtime (CLI Daemon Standby • GGUF loader) -> Badge [STANDBY].
  - Banner chân cột: "Tự động tối ưu hoá VRAM và tensor parallelism qua Apple Metal MPS. ● Metal VRAM 64GB OK".

#### PHẦN 4: THƯ VIỆN 41 NHÀ CUNG CẤP (PROVIDER LIBRARY - BENTO GRID)
- Header:
  - "Provider library" kèm huy hiệu "41 TOTAL PROVIDERS LOADED (Cloud, Local & Inference Gateways)".
  - Text: "41 provider chính thức từ catalog Rust yana-rt • Cloud, Local & Specialized Gateway."
  - Ô Search: "Lọc theo tên catalog...".
- Bộ lọc danh mục 5 tabs (có filter state bằng React useState):
  1. Tất cả (41)
  2. Cloud LLM (18): Claude (Anthropic), OpenAI, Gemini (Google), Groq (Groq Cloud LPU - Key encrypted - Active), DeepSeek, OpenRouter, xAI, Mistral AI, Cohere, Perplexity, AI21 Labs, Novita AI, NVIDIA, MiniMax, GLM, Kimi, Qwen, Baidu ERNIE.
  3. Local / On-device (7): Ollama (Keyless - Connected), TurboFieldfare (Keyless - Active gemma-4-26b-a4b-it), LM Studio, llama.cpp, AirLLM (70B layer streaming), vLLM Engine (:8000), Jan / Cortex.cpp.
  4. Open-source Hosting & Router (10): 9Router, Hugging Face, Together AI, Fireworks AI, Anyscale, Replicate, DeepInfra, Lepton AI, OctoAI, Hyperbolic.
  5. Specialized / Enterprise (6): AWS Bedrock, Azure OpenAI, Cloudflare AI, Cerebras, SambaNova, Custom Endpoint (Keyless - Loopback/HTTPS).
- Mỗi card trong grid 3 cột có:
  - Tên Provider + Logo/Icon + Đơn vị phát triển.
  - Badge trạng thái: 'Key encrypted' (Xanh lá), 'Keyless' (Xanh dương primary), 'Needs key' (Xám).
  - Footer card (monospace): Tags (vd: balanced · tools) và số model khả dụng.

#### PHẦN 5: TELEMETRY (SỬ DỤNG TOKEN) & EXTERNAL TOOLS
- Telemetry Card:
  - 2 Box đo lường: "Workspace hiện tại: 21.066 tokens (8 vòng model)" và "Tất cả dự án: 21.066 tokens".
  - Thanh đo: Token đầu vào (19.595 ~ 93%) và Token đầu ra (1.471 ~ 7%).
  - Breakdown theo model: openai/gpt-oss-120b (17.401), gemma-4-26b-a4b-it (3.665).
- External Coding Tools Check:
  - Claude Code (/Users/vutam/.local/bin/claude - Checked xanh)
  - Codex (Not found)
  - Cursor (Not found)
  - Antigravity (Not found)
  - Gemini CLI (/opt/homebrew/bin/gemini - Checked xanh)
```

---

## CÁCH ANH SỬ DỤNG PROMPT NÀY VỚI CLAUDE:
1. Copy nguyên khối Markdown ở trên.
2. Mở Claude (khuyên dùng Claude 3.5 Sonnet hoặc Claude 3.7 Sonnet).
3. Paste prompt và gửi.
4. Claude sẽ xuất ra 1 file component React `ModelsAndRuntime.tsx` hoàn chỉnh từ đầu đến cuối không bị thiếu bất kỳ icon hay thẻ div nào!
