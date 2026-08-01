# Platform Readiness Audit — Wave 0

> Theo `docs/VISION-2.4.md`'s "Thứ tự triển khai đã chốt": Wave 0 tái dùng
> finding đã có, không audit lại từ đầu. 5 mục dưới đây là 5 finding được
> liệt kê trong VISION-2.4.md — mỗi mục ghi rõ nguồn/bằng chứng thay vì lặp
> lại nguyên văn không kiểm chứng.

## 1. `route.rs` classify bug

**Xác nhận trực tiếp (2026-07-23, đọc code):** `src/route.rs`'s
`score_patterns()` khớp keyword bằng `lower.contains(p.keyword)` — substring
match không có word-boundary. Một số keyword không có khoảng trắng bao
quanh khớp nhầm bên trong từ khác không liên quan, ví dụ `"test"` (COMPLEX,
weight 0.6) khớp bên trong `"latest"`, `"fastest"`, `"contest"` — một câu
hỏi đơn giản như "phiên bản latest là gì" có thể bị cộng nhầm điểm COMPLEX.

Cùng loại bug với import resolver của `src/graph/` (mục 2 dưới) —
`k.contains(imp)` không anchor. Đây là lý do VISION-2.4.md gọi đây là "đã
biết root cause, sửa nhỏ" — root cause đã xác nhận lại hôm nay, chưa sửa.

**Trạng thái:** Confirmed, chưa fix. Đây là mục tiêu Wave 1.

## 2. `src/graph/` noise / import resolver bug

**Nguồn:** `docs/VISION-2.4.md` mục "5. Repository Intelligence", trích từ
audit 2026-07-22-23 (không audit lại hôm nay). Nội dung: không có khái niệm
subsystem, import resolver dùng substring match sai (`k.contains(imp)`,
không anchor — cùng bug class với mục 1), ~95% node là rác từ thư mục
skill mirror. Có 1 bản Python cũ (`graph_builder.py`/`graph_query.py`, đã
mồ côi) từng có AST-level analysis mạnh hơn bản Rust hiện tại.

**Trạng thái:** Đã biết, chưa fix — nằm trong Wave 2 (Program J / Universal
Capability Layer), không phải Wave 1.

## 3. L3/L4 memory tier — mâu thuẫn giữa 2 tài liệu

**Xác nhận trực tiếp:** `ROADMAP.md:391` liệt L3/L4 memory tiers vào mục
"out of scope" — nguyên văn: *"L3/L4 memory tiers (no need until L1 search
proves insufficient)"*. Ngược lại, `docs/VISION-2.4.md` xếp Memory ở mức
⭐⭐⭐⭐⭐ (ưu tiên cao nhất trong 30 capability).

**Trạng thái:** Mâu thuẫn thật, chưa reconcile — đúng như VISION-2.4.md's
header note đã ghi ("để dành, chưa xử lý"). Cần anh quyết định: L1 đã thật
sự chứng minh "insufficient" chưa, hay ROADMAP.md's điều kiện gate vẫn còn
đúng và VISION-2.4.md's ⭐⭐⭐⭐⭐ cần hạ xuống cho tới khi điều kiện đó được
đáp ứng.

**Candidate công nghệ, ghi lại để không quên (2026-07-23, từ việc review
`vxcontrol/pentagi` cho hàng đợi skill — không phải quyết định, chỉ là
ứng viên khi nào L1-insufficient được xác nhận):** PentAGI dùng
**Graphiti** (`getzep/graphiti`, temporal knowledge graph library mã
nguồn mở) chạy trên Neo4j cho agent memory — theo dõi hành động/quan hệ
theo thời gian, đúng shape của "L3/L4 semantic memory" mà ROADMAP.md's
gate đang chặn. **Không hợp** để thay `src/graph/` (đó là codebase
dependency graph, khác mục đích) — chỉ đáng cân nhắc CHO chính câu hỏi
L1-insufficient này, nếu/khi câu hỏi đó được trả lời "có". Đánh đổi thật
cần cân nhắc lúc đó: Graphiti là Python (cần cầu nối/API từ Rust runtime,
không native), và cần Neo4j làm hạ tầng ngoài — nặng hơn nhiều so với
cách L1 hiện tại (file-based). Không nghiên cứu thêm cho tới khi câu hỏi
ở trên được quyết định trước.

## 4. Hook mirror drift (core/hooks/ vs .claude/hooks/ vs .codex/hooks/)

**Xác nhận trực tiếp (2026-07-23, sự cố thật hôm nay):** Toàn bộ fix
ADR-008 ban đầu chỉ áp dụng vào `core/hooks/`, không tự động sync sang
`.claude/hooks/`/`.codex/hooks/` — 2 mirror này chạy bản cũ, chưa khoá,
trong suốt thời gian giữa lúc merge và lúc phát hiện lại hôm nay. Đã fix
lần này (`docs/adr/ADR-008-shared-locking-infrastructure.md` finding #1),
nhưng cơ chế phòng lặp lại **chưa có** — vẫn là kỷ luật thủ công.

**Trạng thái:** Sự cố cụ thể đã fix; root cause hệ thống (không có gate tự
động kiểm tra mirror parity) vẫn mở, ghi rõ trong ADR-008's "Still open".

## 5. Mission vocabulary collision

**Không xác nhận được qua grep trực tiếp hôm nay** — tìm `mission`/`Mission`
(word-boundary) trong toàn bộ `docs/*.md` và `core/skills/*/SKILL.md`
không ra kết quả nào ngoài `src/mission/mod.rs` (chính cái vừa sửa trong
ADR-008 follow-up). Có thể finding này tham chiếu một cuộc thảo luận trước
đó không còn trong context hiện tại, hoặc một collision không nằm trong
phạm vi grep này (ví dụ: một agent persona hoặc khái niệm nói bằng miệng,
chưa ghi vào file).

**Trạng thái:** Chưa xác nhận được — cần anh chỉ rõ cụ thể là collision
giữa "mission" nào với "mission" nào, nếu không thì mục này không đủ bằng
chứng để đưa vào Wave 1/2.

---

## Kết luận Wave 0

4/5 mục có bằng chứng cụ thể (mục 1, 2, 3, 4), 1/5 chưa xác nhận được
(mục 5). Theo thứ tự đã chốt, bước kế tiếp là **Wave 1: fix route.rs
classify bug (mục 1)** — phạm vi nhỏ nhất, rủi ro thấp nhất, root cause đã
xác nhận. Chưa bắt đầu Wave 1 trong lượt này — dừng ở đây để anh xem lại
Wave 0 trước, đặc biệt mục 3 (cần quyết định) và mục 5 (cần làm rõ).
