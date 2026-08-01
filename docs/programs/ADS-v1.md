# YANA Architecture Development Standard (ADS v1)

> Do anh Tâm tổng hợp (2026-07-24), sau ~2 ngày nghiên cứu, từ toàn bộ
> quá trình trao đổi Yana v2.0 → v2.4, các buổi audit repo, vấn đề quota/
> token, các video tham khảo, và triết lý đã xây dựng cùng nhau. Đây là
> quy trình CHUẨN, bắt buộc cho mọi Program mới — thay thế cách làm ad-hoc
> đã dùng cho Program D/F/H/J trước đó (skeleton 9 mục đơn giản hơn), để
> bất kỳ AI nào (Claude, Codex, Cursor, Gemini) làm theo cũng ra kết quả
> giống nhau, không cần hỏi đi hỏi lại quyết định nền tảng.

## Quan hệ với Program D §D7

ADS v1 KHÔNG thay thế triết lý D7 (Specification-first Development,
`Idea → Specification → ADR → Readiness → Implementation`) — ADS v1 là
bản **operationalize** đầy đủ của chính chuỗi đó, tách 5 bước triết lý
thành 16 phase cụ thể, có template, có checklist, có tiêu chí đo được.
Xem `PROGRAM-D-ENGINEERING-EXCELLENCE.md` §D8 cho liên kết chính thức.

## Mục tiêu

Mỗi Program mới phải đi qua cùng một quy trình chuẩn. Không được:
- nghĩ ra capability giữa chừng
- code trước architecture
- đọc toàn repo (tốn token vô ích — xem Program F, cost-aware refusal)
- AI tự suy diễn

---

## PHASE 0 — INPUT

Trước khi bắt đầu Program mới phải có đầy đủ 4 thứ:

**1. Vision** — Program này giải quyết vấn đề gì? (ví dụ: Program G —
Universal AI Platform; Program H — AI Safety; Program J — Universal
Capability Runtime)

**2. Problem Statement** — hiện tại hệ thống thiếu gì? (chuỗi nhân-quả,
ví dụ: AI đọc toàn repo → token cực lớn → review chậm → context trùng →
không chia sẻ giữa AI)

**3. Goals** — viết rõ Goal / Non-Goal / Out of Scope.

**4. Motivation** — tại sao cần Program này? (nguồn cụ thể: video, thảo
luận, audit finding — không phải "vì nó hay")

## PHASE 1 — SPECIFICATION

Không code. Chỉ đặc tả. Template đầy đủ (thay cho 9-mục cũ):

```
Program Name
Vision
Motivation
Problem
Goals
Non Goals
Scope
Architecture
Modules
Interfaces
Workflow
Data Flow
Capability List
Dependencies
Deliverables
Definition of Done
Risks
ADR
Roadmap
```

## PHASE 2 — CAPABILITY INVENTORY

Liệt kê toàn bộ capability, mỗi cái ghi: Name / Purpose / Input / Output /
Dependency / Priority / Owner / Status.

## PHASE 3 — ARCHITECTURE

Vẽ kiến trúc (sơ đồ luồng, ví dụ User → Runtime → Planner → Dispatcher →
Capability → Model Adapter → AI → Result). Không code.

## PHASE 4 — WORKFLOW

Vẽ toàn bộ pipeline (ví dụ Task → Planner → Readiness → Policy → Context
→ Prompt Builder → Adapter → AI → Review → Memory → Notebook).

## PHASE 5 — READINESS

Mỗi capability phải kiểm tra **Readiness Matrix** (10 mục, mở rộng từ 5
mục cũ — xem bảng dưới). Readiness < 80% → **Block**, chỉ được
Research/ADR/Design, không code.

## PHASE 6 — ADR

Template: Decision / Problem / Alternatives / Tradeoffs / Reason /
Consequence.

## PHASE 7 — RESEARCH

Không viết code. Nguồn: GitHub, Papers, Documentation, Anthropic, OpenAI,
Apple, Google, Microsoft, AWS, MCP, A2A, OpenAPI, LSP...

## PHASE 8 — DESIGN REVIEW

Checklist: Architecture / Naming / Dependency / Duplicate / Security /
Maintainability / Performance / Scalability / Governance.

## PHASE 9 — IMPLEMENTATION PLAN

Chia phase triển khai thực tế (Research → Prototype → Alpha → Beta →
Stable) — chỉ lúc này mới lập plan, không sớm hơn.

## PHASE 10 — IMPLEMENTATION

Mới được code.

## PHASE 11 — REVIEW

Architecture / Performance / Security / Documentation / Cost.

## PHASE 12 — BENCHMARK

Đo: Latency / Token / Cost / Memory / CPU / Cache / Accuracy.

## PHASE 13 — EVALUATION

So sánh Before → After.

## PHASE 14 — DOCUMENTATION

Sinh: README / ADR / Capability Docs / Architecture / Tutorial.

## PHASE 15 — CONTINUOUS IMPROVEMENT

Lưu: Lessons Learned / Notebook / Memory / Knowledge Graph.

---

## DECISION WORKFLOW (6 bước, bắt buộc trước mọi thay đổi)

```
1. Problem
2. Existing Solution
3. Duplicate Check
4. Readiness
5. Cost vs Value
6. Decision
```

(Thay thế Decision Workflow 6-câu-hỏi cũ trong `docs/VISION-2.4.md` —
cùng tinh thần, tách rõ "Existing Solution" và "Duplicate Check" thành 2
bước riêng thay vì gộp chung.)

## READINESS MATRIX (10 mục, thay cho 5 mục cũ)

```
Repository · Knowledge · Notebook · Memory · Runtime ·
Governance · Security · Benchmark · Cost · Context
```

## OUTPUT CUỐI CÙNG

Mỗi Program phải sinh được:

```
PROGRAM_X.md · ADR · Architecture Diagram · Capability Matrix ·
Workflow Diagram · Implementation Roadmap · Readiness Report ·
Risk Register · Benchmark Plan · Documentation Plan
```

---

## Cách dùng Gemini (hoặc bất kỳ AI nào) cho Program mới

1. Đọc `docs/VISION-2.4.md` (MASTER_ROADMAP tương đương trong repo này)
   và toàn bộ Program hiện có trong `docs/programs/`.
2. Không được tự suy diễn nếu thiếu thông tin — đánh dấu
   `Specification Required`.
3. Thực hiện tuần tự PHASE 0 → PHASE 15, không bỏ bước.
4. Mỗi kết luận phải chỉ rõ nguồn: dựa trên roadmap / dựa trên repo /
   dựa trên tài liệu nghiên cứu / hay là đề xuất mới.
5. Không được viết code khi Readiness < 80%.
6. Mọi Capability phải có: Vision, Problem, Goal, Architecture, Workflow,
   ADR, Readiness, Deliverables, DoD, Risk, Benchmark.
7. Kết quả cuối cùng phải là tài liệu kiến trúc hoàn chỉnh, sẵn sàng để
   Claude/Codex/Cursor triển khai mà không cần hỏi lại các quyết định
   nền tảng.

## Nguồn triết lý

Tổng hợp từ: "Architecture First", "Verify Before Implement",
"Human-in-the-Loop", "Cost-aware AI" (Program F), "Universal AI
Platform" (Program G/J), bài học từ các buổi audit repo trong session
này, và các video tham khảo về Claude Code, MCP, AI Safety, Vibe Coding,
vấn đề token/quota. Phù hợp với định hướng Yana là lớp điều phối trung
lập, không phụ thuộc một nhà cung cấp AI duy nhất.
