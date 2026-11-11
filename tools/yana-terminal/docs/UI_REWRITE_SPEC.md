Được. Tôi sẽ tổng hợp thành một spec kỹ thuật để Claude Code đọc và làm việc. Tôi sẽ bỏ hết những thứ chúng ta thử sai hôm nay, chỉ giữ mục tiêu cuối cùng.

⸻

Yana AI Chat Terminal — UI Rewrite Specification (v1)

Mục tiêu

Đây là một dự án mới.

KHÔNG clone Yana AI.

KHÔNG copy runtime.

KHÔNG copy guard.

KHÔNG copy operator.

Đây chỉ là:

Terminal Chat UI dành cho Yana AI.

Yana Core sau này sẽ giao tiếp qua Bridge/API.

Repo này chỉ chịu trách nhiệm:

* UI
* UX
* Session
* Context
* Composer
* Memory UI
* Approval UI

⸻

Kiến trúc

Yana AI Chat Terminal
↓
UI
↓
Bridge
↓
Yana Core
↓
Claude/OpenAI/Gemini/Ollama...

Không được đưa runtime của Yana Core vào repo này.

⸻

Nguyên tắc

Không thêm architecture

Không tạo thêm:

* operator
* forge
* harbor
* atlas
* journal
* lens
* workspace
* guard
* runtime clone

trừ khi UI thực sự dùng.

⸻

Không tạo skeleton

Không được viết

struct XXXEngine

rồi không render.

Không được tạo module chỉ để “đẹp kiến trúc”.

⸻

Thứ cần làm

1. Viết lại UI

File chính:

src/ui/mod.rs

được phép viết lại gần như toàn bộ.

⸻

Layout

┌──────────────────────────────────────────────────────────────┬──────────────────────────────┐
│ Header                                                       │ Provider                     │
├──────────────────────────────────────────────────────────────┼──────────────────────────────┤
│                                                              │ Compose                      │
│                                                              ├──────────────────────────────┤
│                      Conversation                            │ Workflow                     │
│                                                              ├──────────────────────────────┤
│                                                              │ Memory                       │
│                                                              ├──────────────────────────────┤
│                                                              │ Activity                     │
│                                                              ├──────────────────────────────┤
│                                                              │ Approval                     │
├──────────────────────────────────────────────────────────────┴──────────────────────────────┤
│ Composer                                                                     Tokens Model   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Status Bar                                                                              Idle│
└─────────────────────────────────────────────────────────────────────────────────────────────┘

⸻

Chat

Hiển thị rõ:

SYSTEM
YOU
YANA

Không chỉ khác màu.

Có khoảng cách.

Đọc dễ.

⸻

Composer

Không phải một ô text.

Composer phải có:

Provider
Approval
Mode
Attachment
Memory
Session
Prompt

⸻

Sidebar

Sidebar phải chuyển được bằng Tab.

Ví dụ

Activity
↓
Workflow
↓
Memory
↓
Compose
↓
Provider
↓
Approval

Không hiển thị tất cả cùng lúc.

⸻

Workflow

Workflow phải có state.

Planning
Running
Review
Testing
Done

Không phải text cứng.

⸻

Compose

Compose hiển thị:

Plan
Execute
Review
Test
Reflect

Có trạng thái.

⸻

Zero Memory

Không dùng LLM.

Ý tưởng lấy từ Zero-Memory paper.

Memory chỉ là UI.

Hiện:

Recent Evidence
Timeline
Entities
Related
Retrieved

Chưa cần backend.

⸻

Context

Không dùng context dài.

Hiện:

4 files
locked
expand?
token estimate

⸻

Provider

Hiển thị:

Claude
OpenAI
Gemini
Ollama

Có provider đang active.

⸻

Approval

Hiển thị:

AUTO
ASK
NEVER

⸻

Streaming

Có trạng thái:

Typing...
Streaming...
Waiting...
Done

⸻

Agent

Hiện:

Planner
Coder
Reviewer
Memory
Search

Chỉ là UI.

⸻

Theme

Không sửa nhiều.

Nhưng:

* bo góc đẹp hơn
* spacing tốt hơn
* màu dịu hơn
* nhìn giống Warp + Claude Code hơn.

⸻

Header

Hiện:

Workspace
Provider
Model
Context
Bridge
Session

⸻

Footer

Hiện

Ctrl+P Plan
Ctrl+M Memory
Ctrl+A Approval
Tab Sidebar
Esc Quit

⸻

Điều KHÔNG được làm

Không:

* thêm runtime
* thêm operator
* thêm guard
* thêm journal
* thêm harbor
* thêm atlas
* thêm workspace clone
* thêm skeleton engine

⸻

Điều được phép

Được:

* sửa UI
* sửa App
* sửa Layout
* sửa Render
* đổi toàn bộ TUI nếu cần

⸻

Sau khi hoàn thành

Phải chạy:

cargo fmt
cargo check
cargo test
cargo run

Không được để warning mới.

⸻

Mục tiêu cuối cùng

Không phải tăng số dòng code.

Không phải tăng số module.

Mà là:

Khi mở cargo run, người dùng phải nhìn thấy ngay đây là một terminal AI hiện đại, khác hẳn bản MVP hiện tại.

⸻

Có thêm 3 ý tôi muốn bổ sung sau khi xem cả buổi tối nay

1. Tách rõ UI và Core

Repo này chỉ là client. Những thứ như Memory, Compose, Approval, Workflow ở đây là trạng thái giao diện, không phải logic đầy đủ. Logic sẽ đến từ Yana Core qua bridge.

2. Mọi thành phần trên màn hình phải có tác dụng

Nếu tạo panel Memory, phải có dữ liệu mẫu hiển thị.

Nếu tạo panel Compose, phải có state thay đổi.

Không tạo widget chỉ để trống hoặc hiện một dòng text.

3. Ưu tiên trải nghiệm hơn kiến trúc

Nếu phải chọn giữa:

* thêm 10 module mới, hoặc
* làm cho cargo run đẹp hơn ngay,

hãy chọn phương án thứ hai.
