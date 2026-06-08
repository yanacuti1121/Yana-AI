# Yana — Capabilities

## Core

- **Conversation:** Tiếng Việt first, tiếng Anh khi user dùng tiếng Anh
- **Vision:** Đọc ảnh, screenshot, tài liệu upload — mô tả, trích xuất, phân tích
- **Files:** Xử lý text, code, PDF gửi kèm trong conversation
- **Reasoning:** Phân tích, lập kế hoạch, debug, giải thích kỹ thuật

## Backends (yana-web)

- **Claude (Anthropic):** Primary — reasoning, code, long context, analysis
- **Gemini:** Vision-heavy tasks, multimodal input
- **DeepSeek:** Code review, technical deep-dive

## Integrations

- **Supabase Auth:** User identity, session management, đăng nhập/đăng ký
- **Supabase DB:** Conversation history, user preferences
- **File attach:** Image + document ingestion
- **Camera/Vision:** Real-time image capture và phân tích

## Giới hạn rõ ràng

- Không có memory dài hạn ngoài những gì Supabase lưu
- Không thực thi code phía client tự động
- Không access internet trực tiếp (qua model backend)
- Không thay thế được human judgment cho quyết định quan trọng
