# Architecture Layer Lineage — investigation prompt

**Status: PENDING — not yet executed.** This is the task brief for an
architecture-archaeology investigation anh drafted (refined with 3
additions — cross-link to `LINEAGE.md`, a context-budget note, and a
fresh-recount instruction for the hook-wiring number — during a review
pass before running it). It is not a report; running it is expected to
produce `docs/history/ARCHITECTURE-LAYER-LINEAGE.md` as a separate file.

Kept here (rather than only in a session scratchpad) so it survives
across machines/sessions until it's actually run.

---

TASK: Architecture archaeology — truy nguồn layer model cũ của YAMTAM/Yana AI
và xác định nó đã tiến hóa thành kiến trúc Yana hiện tại như thế nào.

BỐI CẢNH

Yana AI hiện tại đã trải qua rất nhiều vòng refactor từ YAMTAM ENGINE.
Một kiến trúc layer rất cũ từng được dùng để phân chia trách nhiệm của hệ thống.

Theo các cuộc thảo luận cũ, model này KHÔNG đơn giản là L1 → L9 tuyến tính.
Nó từng sử dụng interleaved layers, bao gồm cả các lớp .5/.8.

Bản được nhớ lại gần nhất:

Sovereign Identity Gate
        ↓
L0    Audit
        ↓
L0.5  Spec Gate
        ↓
L1    Scope Guard
        ↓
L1.5  Validate
        ↓
L2    Context Governance Gate
        ↓
L2.5  Skill Routing Gate
        ↓
L3    Truth Gate
        ↓
L3.5  Prompt Injection Guard
        ↓
L3.8  Memory Hygiene Gate
        ↓
L4    Runtime & Cost Gate
        ↓
L4.5  Supply Chain Guard
        ↓
L5    Destructive Guard

Ngoài ra từng tồn tại một memory/evidence pipeline khác:

L0_RAW_LOG
    ↓
L1_ATOMIC_MEMORY
    ↓
L2_PROJECT_STATE
    ↓
L3_TRUTH_GATE
    ↓
L4_ACTION_GATE

KHÔNG được mặc định rằng hai hệ layer này là cùng một kiến trúc.
Có thể chúng liên quan, chồng lấn hoặc được tạo ở các thời điểm khác nhau.

GIẢ THUYẾT CẦN KIỂM CHỨNG

Layer architecture cũ có thể KHÔNG bị xóa.

Thay vào đó, responsibility của từng layer đã dần được hấp thụ vào
kiến trúc hiện tại và đổi vocabulary thành:

- guard
- gate
- capability
- evidence
- audit
- memory
- router
- runtime
- governor
- supervisor
- policy
- adapter
- hook

Do đó hiện nay không còn thấy một folder/module "9 layers", nhưng DNA của
kiến trúc này có thể đang phân tán trên hàng nghìn file của repo.

Đây chỉ là GIẢ THUYẾT. Không được xác nhận nó nếu evidence không đủ.

BƯỚC 0 — ĐỌC TRƯỚC KHI BẮT ĐẦU (bổ sung)

Trước Phase 1, đọc `docs/history/LINEAGE.md` (đã có sẵn trong repo — viết
2026-08-11/12). File đó là lineage của *code/artifact* (zip scaffold
YAMTAM, git history nhúng trong zip, SHA-256, mốc 2026-05-05/16/17) —
đã verify độc lập một phần chuỗi YAMTAM → Yana AI, KHÔNG phải toàn bộ
chuỗi (mốc 05/05 và bước "GitNexus v10" còn ghi là "reported, chưa
verify" trong chính file đó).

Investigation này (layer/responsibility lineage) là một trục KHÁC,
bổ sung cho LINEAGE.md, không phải làm lại từ đầu. Nếu tìm thêm bằng
chứng củng cố/phủ định phần "chưa verify" trong LINEAGE.md, ghi chú lại
để nối vào file đó sau — không bắt buộc sửa LINEAGE.md trong lần chạy
này.

NGÂN SÁCH CONTEXT (bổ sung)

Task này rất lớn — đọc L1/L2 memory, toàn bộ git history, đối chiếu
hàng chục subsystem hiện tại. Áp dụng đúng "Context 50% Rule" đã có sẵn
trong golden-principles của repo: nếu context window vượt ~50%, dừng lại,
checkpoint tiến độ đã có (kể cả report còn dở), báo cáo phase nào đã xong/
chưa xong, rồi mới tiếp tục ở session mới. Không cố nhồi cả 8 phase liên
tục trong 1 lần chạy nếu điều đó buộc phải cắt bớt bằng chứng.

PHASE 1 — MEMORY ARCHAEOLOGY

Đọc kỹ:

- core/memory/L1_atomic/**
- core/memory/L2_session/**
- memory/archive nếu tồn tại
- ADR
- HISTORY
- LINEAGE
- PHILOSOPHY
- architecture docs
- old design docs
- program docs
- archived/deprecated docs

Search các keyword:

layer
L0
L0.5
L1
L1.5
L2
L2.5
L3
L3.5
L3.8
L4
L4.5
L5
truth gate
action gate
scope guard
spec gate
memory hygiene
context governance
skill routing
runtime cost
supply chain
destructive guard
sovereign identity

Không được chỉ grep literal names.
Search cả responsibility/concept tương đương.

PHASE 2 — GIT ARCHAEOLOGY

Dùng git history để tìm:

1. commit đầu tiên xuất hiện từng layer;
2. file đầu tiên định nghĩa architecture;
3. rename/move/refactor;
4. commit xóa terminology layer;
5. commit mà responsibility chuyển sang module mới;
6. YAMTAM → Yana transition;
7. code/file đã bị xóa nhưng còn trong git history.

Dùng khi cần:

git log --all
git log -S
git log -G
git show
git blame
git diff
git rev-list

Không kết luận "deleted" chỉ vì file không còn ở HEAD.

PHASE 3 — RESPONSIBILITY MAPPING

Với MỖI layer tìm được, lập mapping:

OLD LAYER
↓
original responsibility
↓
original implementation
↓
important historical commits
↓
modern subsystem(s)
↓
modern implementation paths
↓
current enforcement mechanism
↓
tests/evidence
↓
status

Status chỉ được dùng:

INTACT
RENAMED
MERGED
SPLIT
EVOLVED
SUPERSEDED
DEAD
UNKNOWN

PHASE 4 — CROSS-CUTTING ANALYSIS

Kiểm tra giả thuyết rằng layer model đã trở thành cross-cutting architecture.

Ví dụ cần kiểm chứng, KHÔNG mặc định đúng:

L0 Audit
→ audit/evidence/hash-chain

L0.5 Spec Gate
→ specification/governance

L1 Scope Guard
→ scope/blast-radius/capability boundaries

L1.5 Validate
→ validation/gates

L2 Context Governance
→ context/memory governance

L2.5 Skill Routing
→ skill router / skill index

L3 Truth Gate
→ truth_gate / evidence verification

L3.5 Prompt Injection Guard
→ prompt/tool injection protections

L3.8 Memory Hygiene
→ atomic/session memory controls

L4 Runtime & Cost
→ token budget/runtime controls

L4.5 Supply Chain
→ dependency/supply-chain guards

L5 Destructive Guard
→ guard-destructive / Rust guards

Đối với mỗi mapping:
CONFIRMED / PARTIAL / FALSE / UNKNOWN

và phải có evidence.

PHASE 5 — CHECK FOR ARCHITECTURAL DRIFT

Tìm xem responsibility nào:

- hiện không còn owner;
- có nhiều module cùng enforce gây duplication;
- implementation tồn tại nhưng không wired;
- file tự khai "active" nhưng không có execution path;
- layer boundary cũ bị phá;
- responsibility bị đổi nghĩa;
- docs nói còn nhưng code đã supersede;
- implementation mới mạnh hơn architecture ban đầu.

Đặc biệt liên hệ với phát hiện gần đây (bổ sung: đây là số liệu tại
thời điểm 2026-08-11/12 — TỰ ĐẾM LẠI FRESH ngay đầu phase này bằng
cùng phương pháp dưới đây, không lấy số cũ làm mặc định đúng, vì repo
này đổi ~18 commit/ngày và có thể đã đổi qua đêm):

Phương pháp đếm lại: liệt kê toàn bộ `core/hooks/*.sh` + `*.js`, đối
chiếu với mọi tên file thực sự xuất hiện trong `.claude/settings.json`
(quét cả 6 event type: SessionStart/PreCompact/PreToolUse/
UserPromptSubmit/Stop/PostToolUse, không chỉ PreToolUse), rồi `comm -23`
hai danh sách đã sort. Tại lần đo gần nhất: 63 file tồn tại, 23 file
được wire, 39 file không xuất hiện ở đâu trong settings.json (gồm
`tool-validator.sh`, `dependency-safety-gate.sh`, `supply-chain-guard.sh`
— cả 3 đều tự ghi "Status: active" trong header nhưng không có gì gọi
tới, xác nhận bằng cách grep trực tiếp `.claude/settings.json`,
`.codex/hooks.json`, `.cursor/hooks.json`, không dựa vào header của
chính 3 file đó).

KHÔNG được mặc định 39 hook đó (hay số mới tự đếm được) là dead.

Phân biệt:

WIRED
INDIRECT
ENGINE_SPECIFIC
REFERENCE_ONLY
SUPERSEDED
DEAD
UNKNOWN

PHASE 6 — GIÁM THỊ / SUPERVISOR

Điều tra riêng Giám thị.

Không được coi Giám thị chỉ là một hook.

Kiểm tra:

- host-level/user-space daemon architecture;
- macOS LaunchAgent / scheduler;
- lifecycle độc lập với Claude/Codex session;
- HALT authority;
- quarantine modes;
- human-only recovery;
- core integrity monitoring;
- audit integrity monitoring;
- security-sensitive path monitoring;
- trigger/event/scheduled behaviour;
- relationship với old layer model.

Xác định Giám thị là:

evolution của layer cũ,
cross-layer supervisor,
hay subsystem hoàn toàn mới.

Phải dựa trên provenance.

PHASE 7 — OLD SECURITY / FILE SCANNER

Tìm một subsystem cũ mà owner nhớ từng tồn tại:

- scan files;
- security scan;
- malware/virus-like detection;
- không chạy continuous 24/24;
- có thể trigger theo event/schedule/state;
- có khả năng liên quan tới Giám thị hoặc security pipeline.

Owner không nhớ tên.

Search theo behavior, không chỉ "virus"/"malware".

Có thể tìm:

scan
hunt
integrity
suspicious
quarantine
watch
file change
security monitor
scheduler
periodic
supply chain
artifact
download
filesystem

Xác định:

FOUND / POSSIBLE MATCH / NOT FOUND

Nếu found:
origin → implementation → trigger → evolution → current status.

PHASE 8 — FINAL REPORT

Tạo:

docs/history/ARCHITECTURE-LAYER-LINEAGE.md

Không thay đổi runtime code trong investigation này.

Report phải có:

1. Original architecture
2. Timeline
3. Layer-by-layer evidence table
4. Old → current mapping
5. Memory pipeline relationship
6. Giám thị relationship
7. Old security scanner investigation
8. Dead/superseded responsibilities
9. Current architectural drift
10. Unknown/unverified claims

Cuối report, thêm 1 mục ngắn: liên kết với `docs/history/LINEAGE.md`
(link 2 chiều — LINEAGE.md nên trỏ sang file mới này sau khi report
xong, nếu report tìm ra gì củng cố/phủ định phần "chưa verify" của
LINEAGE.md).

QUAN TRỌNG

Không được cố chứng minh giả thuyết của owner.

Nếu lịch sử Git/L1 chứng minh owner nhớ sai, ghi thẳng là nhớ sai.

Không lấy README hiện tại làm source of truth.

Ưu tiên:

actual code
> tests
> git history
> L1 historical memory
> ADR
> docs
> README
> recollection

Mọi claim quan trọng phải kèm:

path
symbol/section
commit SHA khi có thể
evidence

Không sửa architecture để làm nó khớp với model cũ.

Mục tiêu là tìm sự thật lịch sử:

"Kiến trúc layer cũ đã biến mất, hay đã trở thành DNA của Yana AI hiện tại?"

Đây nên giống khảo cổ repo: L1 + Git history + deleted files +
implementation hiện tại, rồi mới dựng lineage — không bắt đầu bằng việc
sửa code.

Nếu giả thuyết đúng: layer model không còn tồn tại dưới dạng một
component, vì nó đã trở thành cách toàn bộ Yana phân chia responsibility.
Nếu một vài layer thực sự chết, report phải chỉ ra chính xác layer nào
chết ở commit nào, thay vì dựa vào trí nhớ.
