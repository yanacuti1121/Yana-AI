# Yana AI — Vision 2.4 (cleaned up)

> Nguồn: tổng hợp từ phiên thảo luận 2026-07-23. Bản gốc do anh Tâm phác thảo
> (30 capability + Program H "Safety" + Program H/I "Universal Runtime" từ 2
> video tham khảo). Bản này sửa 6 vấn đề tìm thấy khi review, không đổi
> triết lý gốc — chỉ dọn trùng lặp, đặt lại tên, gắn số liệu có căn cứ.
>
> Quan hệ với `ROADMAP.md` (gốc, ở repo root): file đó là roadmap chiến
> thuật, version-by-version, đã có sẵn và đang chạy ("Stable before
> powerful"). File này là tầm nhìn dài hạn hơn — không thay thế
> `ROADMAP.md`, chưa merge vào đó. Việc reconcile 2 file (đặc biệt việc
> `ROADMAP.md` từng nói "L3/L4 memory tiers — no need until L1 proves
> insufficient" trong khi vision này xếp Memory ⭐⭐⭐⭐⭐) để dành, chưa xử lý.

---

## 7 nguyên tắc (giữ nguyên từ bản gốc)

1. AI là cộng sự, không phải người thay thế.
2. Một capability, nhiều AI cùng dùng — không khoá vào Claude/Cursor/Gemini.
3. Tri thức phải được tổ chức trước khi dùng (Notebook → Knowledge Graph → Memory → Retrieval).
4. Mọi hành động đều có governance và khả năng kiểm toán.
5. Hiệu quả quan trọng không kém sức mạnh (Cost/Token/Latency là chỉ số hạng nhất).
6. AI phải học từ kinh nghiệm, cải thiện liên tục.
7. Con người luôn là người quyết định cuối cùng.

**Câu hỏi chưa trả lời (không tự resolve — cần anh chốt):** Nguyên tắc #1
nói "AI chỉ là engine cắm được, không tự tạo AI mới" — nhưng mục Local LoRA
bên dưới là tự huấn luyện hành vi model. Hai hướng cần đội ngũ/hạ tầng khác
hẳn nhau (ML/GPU vs orchestration/governance). Cần quyết định: Yana có bao
giờ tự train gì không, hay tuyệt đối chỉ điều phối?

---

## Sửa 6 vấn đề

### 1. Trùng tên "Program H"
Bản gốc dùng "Program H" cho 2 chương trình khác nhau. Đổi tên:
- **Program H — Autonomous Safety & Execution Assurance** (giữ nguyên, từ thảo luận GPT-5.6 Sol)
- **Program J — Universal Capability Runtime** (đổi từ "Program H" thứ 2, ý tưởng từ video InsForge/MCP)

### 2. Gộp nhóm "universal abstraction" — không phải 7 capability riêng
Các mục sau trong bản gốc đều là **cùng 1 lõi** (lớp trừu tượng vendor-neutral
giữa AI và hạ tầng), gộp thành 1 capability lớn có nhiều phần con thay vì
đếm riêng:

**Universal Capability Layer** (gộp #1 Universal AI Platform, #8 Prompt
Translation Engine, #9 Capability Engine, #18 Model Router, #19 AI
Marketplace, #20 Extension SDK, Program J)
- Adapter tầng AI (Claude/Cursor/Gemini/Codex — không vendor lock-in)
- Prompt AST → dịch sang từng AI
- Capability Registry + Dynamic Discovery (agent hỏi "what can I do?" thay vì hardcode if/else theo provider)
- Model Router (Simple→Haiku, Medium→Sonnet, Hard→Opus)
- Marketplace + Extension SDK là **lớp phân phối** của capability, không phải capability riêng

### 3. Gộp 3 bản mô tả pipeline thực thi thành 1
Bản gốc có Planning Engine (#5), Execution Workflow 30-bước, và Program I
"AI Execution OS" — cùng mô tả 1 luồng ở 3 mức chi tiết khác nhau, chưa
thống nhất. Dùng **Execution Workflow 30-bước làm bản chuẩn duy nhất**
(chi tiết nhất, có Phase 0-5 rõ ràng); Planning Engine và Program I là
tên gọi/góc nhìn khác của cùng luồng đó, không phải hệ thống riêng.

### 4. Local LoRA — gắn cờ, không âm thầm xếp vào roadmap
Xem mục "Câu hỏi chưa trả lời" ở trên. Giữ ⭐⭐⭐⭐☆ nhưng **block cho tới
khi có quyết định rõ** về việc Yana có train model hay không.

### 5. Repository Intelligence — không phải ý mới, là nâng cấp thứ đã có
`src/graph/` đã tồn tại và đã được audit (2026-07-22-23): không có khái
niệm subsystem, import resolver dùng substring match sai (`k.contains(imp)`,
không anchor), ~95% node là rác từ thư mục skill mirror. Có 1 bản Python cũ
(`graph_builder.py`/`graph_query.py`, đã mồ côi) từng có AST-level analysis
mạnh hơn bản Rust hiện tại. Capability #11 = **nâng cấp `src/graph/`**, có
điểm khởi đầu thật, không phải viết từ đầu.

### 6. Cost Engineering — số liệu chưa có căn cứ
"Giảm 70-95% token" trong bản gốc không có baseline. Đổi thành: **mục tiêu
đo sau khi có Cost Baseline (Wave 0)** — không cam kết % cụ thể tới khi có
số đo thật.

---

## Readiness Assessment / Decision Workflow — SUPERSEDED 2026-07-24

**Nâng cấp lên ADS v1** (`docs/programs/ADS-v1.md`) — sau ~2 ngày anh Tâm
nghiên cứu tổng hợp, thay cho bản phác thảo ban đầu dưới đây. Giữ lại
nguyên văn bản cũ để tham khảo lịch sử, KHÔNG dùng làm quy trình hiện
hành nữa:

- Readiness Assessment (5 mục) → **Readiness Matrix (10 mục)**: thêm
  Knowledge, Notebook, Security, Benchmark, Context — xem `ADS-v1.md`
  Phase 5.
- Decision Workflow (6 câu hỏi: Need/Existing Solution/Ownership/
  Readiness/Cost vs Value/Decision) → **Decision Workflow ADS v1** (6
  bước: Problem/Existing Solution/Duplicate Check/Readiness/Cost vs
  Value/Decision) — tách "Existing Solution" và "Duplicate Check" thành
  2 bước riêng, đổi "Need" thành "Problem".

<details>
<summary>Bản gốc 2026-07-23 (lịch sử, không dùng nữa)</summary>

```
Vision → Program → Capability → Readiness Assessment → Implementation
```

5 mục kiểm tra trước mỗi capability ⭐⭐⭐⭐⭐: Repository / Memory / Runtime /
Governance / Cost Readiness. Readiness < 80% → chỉ được Research/ADR/Design,
không được code.

Decision Workflow (6 câu hỏi, trước mọi capability):
1. Need — có thực sự cần không?
2. Existing Solution — đã có gì rồi (Duplicate Check)?
3. Ownership — capability nào chịu trách nhiệm?
4. Readiness — Repository/Memory/Runtime/Governance/Cost đạt chuẩn chưa?
5. Cost vs Value — có đáng token/thời gian không?
6. Decision — làm / không làm / để dành, kèm lý do.

</details>

---

## Thứ tự triển khai đã chốt (2026-07-23)

```
Wave 0 — Platform Readiness Audit
  Tái dùng finding đã có (route.rs bug, graph noise, L3 dead,
  hook drift, mission vocabulary collision) — không audit lại từ đầu.

Wave 1 — MỘT việc nhỏ nhất, rẻ nhất, rủi ro thấp nhất trước
  route.rs classify bug (đã biết root cause, sửa nhỏ, không đụng
  kiến trúc) — làm trọn 1 vòng audit→fix→test→review→ship để
  chứng minh quy trình chạy được.

Wave 2 — Program H / Program J
  Mở 2026-07-23 sau khi Wave 1 xong (route.rs bug: fix + 20 test + push,
  commit fddbb8ec). Chặn ngay ở bước Specification — Program H/J chưa có
  đặc tả gốc lưu trong repo. Theo Program D §D7 (Specification-first
  Development, xem docs/programs/PROGRAM-D-ENGINEERING-EXCELLENCE.md):
  Implementation BLOCKED cho tới khi có specification. Đã tạo Architecture
  Backlog (docs/programs/) — skeleton rỗng cho H và J, chờ điền từ đặc tả
  gốc, KHÔNG phải AI tự suy diễn nội dung.
```

**Không làm song song nhiều Wave — làm hết 1 việc rồi mới sang việc kế.**

**Trạng thái Program (bổ sung 2026-07-23):** xem `docs/programs/README.md`
cho vocabulary trạng thái đầy đủ (Draft / Specification Required /
Architecture Review / Ready for Implementation) và bảng trạng thái hiện
tại của từng Program.
