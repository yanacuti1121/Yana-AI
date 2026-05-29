# Current Context

**Cập nhật lần cuối:** 2026-05-29

## Đang làm
- yamtam-engine v0.16.0 — Rust runtime `yamtam-rt`
- 8 subcommands: task, eval, bus, memory, config, plugin, cost, scan

## Ưu tiên tiếp theo
1. Verify parity: `yamtam-rt scan` vs `audit_scanner.py`
2. Wire `yamtam audit .` CLI → gọi `yamtam-rt scan` thay Python
3. Benchmark Rust scanner vs Python scanner

## Đã biết / blockers
- `/home` disk 100% full → dùng `CARGO_TARGET_DIR=/tmp` khi build
- Circuit breaker hook: chạy standalone cần CLAUDE_TOOL_NAME đúng
- session-wrap spawn subagents → tốn API nếu dùng API key riêng

## Ghi chú cá nhân
- Anh quan tâm đến unsloth (LLM fine-tuning, ~65k stars)
- GPT 5.5 thỉnh thoảng review code cùng — anh hay gửi nhận xét của GPT cho em
