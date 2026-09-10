# Yana AI — Build Journey / Origin Story (DRAFT — NOT APPROVED)

**Trạng thái: DRAFT, CHƯA DUYỆT ĐỂ DÙNG CÔNG KHAI.** Anh Tâm gửi nguyên khối
nội dung dưới đây ngày 2026-09-09 làm ngữ cảnh nền cho việc thiết kế
`yana.vutam.link`, đồng thời nói rõ: *"nói trước là chưa xong đâu vẫn còn
phần tích [phân tích/rà soát] kỹ trước khi làm được"* và ở cuối khối gốc:
*"Nhưng trước khi sử dụng public copy, hãy kiểm tra lại với tôi."*

**Vì vậy:** không agent/session nào được lấy nguyên văn hoặc diễn giải nội
dung dưới đây thành copy công khai trên website mà không quay lại xác nhận
với anh Tâm trước — kể cả khi nội dung đọc có vẻ đã hoàn chỉnh. Đây là chỉ
dẫn `context` (bối cảnh để hiểu vì sao kiến trúc hiện tại tồn tại), không
phải `copy` đã sẵn sàng publish. Phân biệt này quan trọng — xem
`core/rules/owasp-llm-output-law.md` và `70-context-faithfulness-law.md`
cho lý do agent phải giữ nguyên author's word, không tự "cải thiện" câu chữ.

**Ràng buộc do chính anh Tâm đặt ra khi viết bản này** (giữ lại để agent sau
không vô tình phá vỡ khi chỉnh sửa):
- Không bịa ngày/tháng cho các mốc đầu đời không có bằng chứng truy xuất
  được — mốc nào có evidence thì ghi cụ thể, mốc nào không có thì để mờ.
- KHÔNG viết theo tông "cậu bé không biết Linux → thiên tài xây 700K LOC" —
  anh Tâm chủ động từ chối tông này, coi nó "làm giảm độ tin cậy kỹ thuật".
- Tông đúng: trưởng thành qua **problem → failure → engineering response**,
  không phải khoe thành tích cá nhân.
- Không exaggerate, không fake scale/enterprise adoption/users/benchmark,
  không biến founder thành hero — "để engineering nói thay."
- Homepage không nên trở thành "personal-brand landing page" hay "motivational
  story sáo rỗng" — đây là trang chủ Yana AI, origin story chỉ để giải thích
  vì sao architecture hiện tại tồn tại.

**Cách dùng cho lần thiết kế web tiếp theo:** mỗi "failure" trong khối dưới
đây map trực tiếp sang một cơ chế kiến trúc thật đã audit được ở
`YANA-ECOSYSTEM-MAP.md` — ví dụ token/cost runaway → Token Budget Guard
(`token-budget-policy.md`, đã xác nhận có hook thật), silent hook skip →
Truth Gate + entry-point verify law (`71-entry-point-verify-law.md`, cũng
sinh ra từ một incident thật, đã audit). Khi viết copy public, mỗi câu
claim nên trỏ về đúng file/rule tương ứng thay vì lặp lại nguyên văn cảm
xúc trong bản draft này.

---

## Nguyên văn anh Tâm gửi (2026-09-09, chưa chỉnh sửa)

> Đọc phần này trước khi thiết kế trang chủ Yana AI.
> Đây không chỉ là lịch sử của một repository. Tôi muốn website phản ánh được vì sao Yana tồn tại, vì Yana được hình thành từ chính những vấn đề tôi gặp khi học Linux, Git, coding, dùng AI coding agent, CI/CD và vận hành một codebase ngày càng lớn.

### 1. Điểm xuất phát — không phải từ một AI research lab

Tôi không bắt đầu bằng việc nghiên cứu model hay huấn luyện AI. Điểm xuất
phát của tôi thực tế hơn nhiều: Linux, Terminal, Git, GitHub, CI, Deployment,
các lỗi hệ thống, và việc học cách điều khiển máy tính bằng command line.

Ban đầu rất nhiều thứ đối với tôi đều mới. Tôi học theo kiểu thực chiến: gặp
vấn đề, tìm hiểu, thử, làm hỏng, sửa, tiếp tục. Tôi không đi theo con đường
học hết lý thuyết rồi mới xây sản phẩm. Tôi xây trước, va vào giới hạn
trước, rồi học thứ cần thiết để vượt qua giới hạn đó.

Đây là một chi tiết quan trọng để hiểu Yana. Yana không sinh ra từ câu hỏi
"How do I build another AI chatbot?" Nó dần sinh ra từ câu hỏi "How do I
safely control increasingly capable AI systems while they are working on
real computers and real codebases?"

### 2. Từ Linux đến tư duy system

Linux khiến tôi bắt đầu hiểu rằng một sản phẩm phần mềm không chỉ là source
code. Đằng sau một chương trình còn có: process, filesystem, permissions,
environment variables, shell, package managers, services, networking, logs,
dependencies, lifecycle, operating system behavior.

Terminal ban đầu chỉ là nơi chạy command. Sau đó nó trở thành nơi tôi hiểu
hệ thống thực sự hoạt động như thế nào.

Tôi bắt đầu đụng đến Git và GitHub. Từ `git add`/`git commit`/`git push`,
tôi dần phải hiểu thêm: branches, merge, conflicts, pull requests,
worktrees, GitHub Actions, CI, release, package publishing, dependency
management.

Một repository càng lớn thì những vấn đề này càng không còn là "phụ".
Chúng trở thành một phần của kiến trúc.

### 3. AI bắt đầu trở thành công cụ lập trình

Khi coding agents ngày càng mạnh, tôi bắt đầu dùng AI nhiều hơn để xây phần
mềm. Điều này làm tốc độ phát triển tăng rất mạnh. Một người có thể giao
cho AI: viết code, refactor, tạo tests, đọc repository, chạy terminal, sửa
CI, thiết kế architecture, tạo documentation, xử lý nhiều file.

Nhưng tôi cũng bắt đầu nhận ra mặt còn lại. AI có thể làm rất nhanh. AI
cũng có thể làm sai rất nhanh. Một agent có terminal access không còn đơn
giản là chatbot. Nó có khả năng tác động vào hệ thống thật. Nó có thể: sửa
nhầm file, chạy command không nên chạy, thay đổi quá nhiều code, làm mất
context, báo rằng test đã chạy trong khi verification không đủ, tạo một
implementation trông đúng nhưng thực tế chưa được wiring, tạo technical
debt rất nhanh, tiêu tốn lượng token rất lớn.

Từ đây tôi bắt đầu thay đổi cách nhìn. Tôi không còn muốn "tin AI". Tôi
muốn kiểm chứng AI.

### 4. Những lần hệ thống dạy tôi bằng cách khó nhất

Rất nhiều kiến trúc sau này của Yana xuất phát từ failure thật. Không phải
feature được nghĩ ra để README trông hay.

**Token / cost.** AI coding có thể tiêu thụ lượng context cực lớn. Trong
quá trình phát triển, lượng token được xử lý đã lên tới quy mô rất lớn. Có
thời điểm phân tích usage cho thấy khoảng 18B token ở một luồng sử dụng
Claude, trong khi ước tính chi phí thực tế theo subscription/workflow khác
hoàn toàn chi phí nếu quy đổi thô sang API. Điều này khiến cost control
không còn là chuyện phụ. Từ đó hình thành tư duy: Token Budget, Cost Guard,
Context management. Không dùng model đắt tiền cho mọi việc. Không chạy
nhiều agent vô nghĩa. Không để E2E loop chạy không kiểm soát.

Tháng 5/2026, constraint tài chính rất thực tế: tôi không có tiền để chạy
hai AI mạnh song song một cách lãng phí. Vì vậy workflow phải tiết kiệm. AI
mạnh dành cho việc khó. AI/model khác dành cho việc nhẹ. Không spawn agent
vô tội vạ. Không chạy loop qua đêm không kiểm soát. Cost trở thành một
engineering constraint.

**E2E / runaway execution.** Tôi từng gặp những workflow test/E2E có thể
treo hoặc chạy lâu hơn dự kiến. Điều đó dẫn tới một bài học: một autonomous
system cần giới hạn tài nguyên và thời gian. Không thể chỉ nói "run until
finished." Phải có: timeout, budget, cancellation, resource ceilings,
evidence, failure states. Sau này những tư tưởng này đi vào safety
architecture của Yana.

**AI claims vs reality.** Một trong những bài học quan trọng nhất: code tồn
tại không có nghĩa feature hoạt động. Hook tồn tại không có nghĩa hook
đang chạy. Test tồn tại không có nghĩa test thực sự kiểm tra thứ nó tuyên
bố. CI màu xanh không luôn đồng nghĩa hệ thống đúng.

Một ví dụ thực tế: `tool-validator.sh` từng có lỗi Bash quoting khiến
null-byte check match sai và về thực tế có thể deny Bash tool calls. Có
những trường hợp hooks bị skip âm thầm. Có những workflow dùng
`continue-on-error` hoặc `|| true` khiến failure không còn được phản ánh
trung thực. Có job được gọi là "test" nhưng thực tế gần với compile/check
hơn.

Những sự cố như vậy làm tôi ngày càng quan tâm đến một từ: TRUTH. Yana
không chỉ cần safety. Yana cần truthful execution. Nếu một component không
chạy, phải nói nó không chạy. Nếu test bị skip, phải nói test bị skip. Nếu
provider fail, không được biến failure thành một empty state trông vô hại.
Nếu evidence không đủ, không được tuyên bố success.

### 5. Yana dần hình thành

Yana ban đầu không xuất hiện ngay lập tức dưới hình dạng ecosystem hiện
nay. Nó phát triển dần cùng với những vấn đề tôi gặp khi dùng AI để xây
phần mềm. Câu hỏi chuyển từ "AI có viết được code không?" sang "AI được
phép làm gì?" rồi "Nếu AI làm sai thì ai dừng nó?" và cuối cùng "Làm thế
nào để kiểm soát blast radius của một autonomous agent?"

### 6. Yana không được thiết kế để tin model

Một nguyên tắc dần trở nên rất rõ: MODEL IS NOT THE AUTHORITY. Model có thể
đề xuất hành động. Nhưng model không nên tự quyết định quyền của chính nó.

Vì vậy Yana phát triển theo hướng deterministic governance. Decision path
quan trọng không phụ thuộc vào việc một LLM "cảm thấy" command có an toàn
hay không. Yana bắt đầu có các lớp kiểm soát như: Destructive guards,
TokenBudget, BlastRadius, SelfMod protection, EntryPoint checks,
permissions, audit, human override, HALT mechanisms.

Shell guard bắt đầu quan tâm tới các thao tác nguy hiểm như `rm -rf`, force
push, `git reset --hard`, publish, SQL DROP, brace expansion, và các
destructive operations khác.

Triết lý cốt lõi: AI proposes. Yana governs. The system verifies. Human
retains authority.

### 7. Từ script thành runtime

Khi project lớn hơn, một tập hợp shell scripts không còn đủ. Yana bắt đầu
phát triển runtime riêng. Rust trở nên phù hợp với những thành phần cần:
deterministic behavior, performance, strong typing, system integration,
reliability.

Yana dần có: `yana-rt`, Python package, CLI, rules, hooks, scripts,
commands, agents, skills. Architecture tiếp tục tiến hóa về một canonical
Capability Runtime. Các khái niệm như SessionContext, typed errors,
capability control, golden E2E tests, unified Rust workspace, dần xuất
hiện.

Sau đó scope mở rộng sang OS-level operation: Host-Native OS Program,
resident service, OS Service Supervisor. Yana không còn chỉ là một script
chạy cạnh coding agent. Nó bắt đầu trở thành control plane.

### 8. Quy mô tăng rất nhanh

Đến giữa năm 2026, repository đã phát triển rất nhanh. Một snapshot của
Yana 1.0.0 có khoảng: 101 agents, 2,025 skills, 71 rules, 62 hooks, 113
scripts, 170 commands.

Project là một project một maintainer. Điều này tạo ra một nghịch lý. AI
cho phép một người xây hệ thống có scope rất lớn. Nhưng chính scope đó lại
tạo ra một vấn đề mới: Làm sao một người có thể biết tất cả những gì AI
vừa thay đổi vẫn đúng? Đây là một trong những lý do audit, evidence và
verification trở nên quan trọng.

### 9. 16/06/2026 — một ví dụ rất đúng về hành trình

Có thời điểm Yana server chạy được ở `127.0.0.1:8081` và index khoảng 3,438
skills. Trong khi đó Claude CLI lại không chạy trong Firebase Studio/Nix vì
thiếu native dependency `@anthropic-ai/claude-code-linux-x64`.

Đây là loại tình huống tôi gặp rất nhiều: một layer chạy, một layer khác
chết. Không thể đánh giá toàn bộ system bằng việc nhìn một component.

### 10. July 2026 — tiến tới Yana 1.0

Cuối tháng 7, development tăng tốc. PR #85 (`feat/build-your-own-x-skills`)
có 31 commits và thay đổi hàng nghìn dòng. Nó liên quan tới: skill quality,
RTK token reduction, Cursor support, Codex support, Antigravity support,
Program J MCP architecture/prototype, release preparation.

Linux build chạy. Windows build chạy. Release build chạy. Nhưng mac build
và npm publish gặp vấn đề. README translations còn conflict.

Đây lại là một bài học: cross-platform support không thể được tuyên bố
chỉ vì một OS chạy.

### 11. npm publishing failure

Ngày 25/07/2026, npm authentication nhìn bề ngoài hoàn toàn đúng. `npm
ping`: PONG. `npm whoami`: yanacuti. Collaborator permission: read-write.
Nhưng publish `yana-ai` 0.43.2 và 0.43.3 vẫn trả 403 Forbidden.

Auth đúng. Ownership đúng. Registry đúng. Permission nhìn thấy đúng. Nhưng
system vẫn không publish. Nó nhắc tôi rằng: Observed state > assumed
state. Một hệ thống không được đánh giá dựa trên những gì configuration
"có vẻ" nói. Phải kiểm tra outcome thực tế.

### 12. August 2026 — stabilization thay vì chỉ thêm feature

Đến tháng 8, Yana đã đủ lớn để việc tiếp tục thêm feature không còn là lựa
chọn tốt nhất. Một stabilization effort tập trung vào những vấn đề như:
Unicode, hook truth, Discord queue, evidence loss, concurrency, Ollama,
AirLLM, Secrets, CI, SSRF, Verify Gate.

CI assurance được xem lại sâu hơn. Các vấn đề được tìm kiếm bao gồm: silent
skips, `continue-on-error`, `|| true`, compile-only jobs được mô tả như
tests, missing prerequisites, feature/release mismatches, resource
runaway, cross-platform overclaims, release provenance.

Nguyên tắc trở thành: EVIDENCE BEFORE VERDICT. Không mở thêm một feature
program lớn nếu foundation chưa đáng tin.

### 13. Providers cũng không được phép "nói dối"

Một ví dụ khác là Ollama. Failure và empty state phải khác nhau. Nếu local
model server chết: đó là failure. Không phải "0 models found."

Tương tự với AirLLM: admission limits, 503 behavior, read timeout, context
ceilings đều cần semantics rõ ràng.

Đây nghe có vẻ là implementation detail. Nhưng thực ra nó phản ánh
philosophy lớn hơn của Yana: System state phải trung thực.

### 14. Yana không cần cạnh tranh với coding agents

Một turning point khác là nhận ra: không cần xây "coding agent mạnh nhất
thế giới." Có Claude Code. Có Codex. Có Cursor. Có nhiều agent khác. Yana
có thể đứng ở một layer khác.

Coding agent = workload. Yana = governance/control plane. Agent có thể
thay đổi. Model có thể thay đổi. Provider có thể thay đổi. Nhưng policy,
authority, audit và evidence không nên phụ thuộc vào một model cụ thể.
Đây là lý do Yana có thể hỗ trợ nhiều harness: Claude Code, Cursor, Codex,
Antigravity, và về sau có thể mở rộng thêm.

### 15. Yana Studio

Khi Yana runtime ngày càng mạnh, CLI không phải cách duy nhất con người
muốn tương tác với nó. Từ đó xuất hiện Yana Studio.

Nhưng: YANA STUDIO != YANA AI. Yana Studio chỉ là một product branch /
visual surface của ecosystem. Studio hướng tới việc gom: Workspace, Files,
Editor, Terminal, Git, Tasks, Design, Models, Context, Permissions,
Devices, Agents vào một graphical environment.

Điểm quan trọng: Studio không thay thế Yana Runtime. Studio sử dụng /
điều khiển / visualize những capability bên dưới. Yana Runtime vẫn là
foundation quan trọng.

### 16. Xây Desktop app cũng không hề suôn sẻ

Desktop development đem đến một nhóm failure mới. macOS signing trở thành
vấn đề. Không có Apple Developer certificate khiến app gặp
Gatekeeper/signature problems. Có lỗi: "code has no resources but
signature indicates they must be present."

Electron cũng từng có activate/loadURL bug. Windows portable path từng cần
fix riêng. macOS build trong CI từng fail lặp lại nhiều lần trước khi
green. Có lần build macOS thất bại khoảng 9 lần. CI từ khoảng 13 checks
tăng lên khoảng 18 checks.

Điều này tiếp tục củng cố một nguyên tắc: Desktop software không chỉ là
UI. Packaging, signing, paths, lifecycle và OS behavior đều là product.

### 17. SSRF / security

Khi Yana bắt đầu kết nối provider và network services, security surface
tiếp tục tăng. SSRF guard được rework. Đến PR #157, test suite đạt
277/277 tests.

Nhưng mỗi lần thêm network capability lại tạo thêm câu hỏi: URL nào được
phép? Redirect xử lý thế nào? Local/private address? Credentials? Provider
trust boundary? Security không thể thêm vào cuối cùng. Nó phải nằm trong
architecture.

### 18. Yana-robot — governance rời khỏi Desktop

Tháng 8/2026 tôi bắt đầu yana-robot. ESP32-S3. Wheels. Servos. TFT face.
Microphone. Speaker. ToF anti-fall. AI có thể đưa semantic command. Nhưng
emergency stop không được phụ thuộc cloud AI. ToF safety phải chạy local.
Connection loss phải auto-stop.

Đây thực chất vẫn là cùng một tư tưởng: high-level intelligence có thể đến
từ AI. Safety-critical authority phải ở local deterministic layer. Yana
Robot vì vậy không hoàn toàn là một project ngẫu nhiên. Nó là một ví dụ
vật lý của philosophy Yana.

### 19. September 2026 — AI continues to find real bugs

Ngay cả khi architecture ngày càng trưởng thành, failures vẫn tiếp tục
xuất hiện.

PR #317: guarded hooks bị skip âm thầm. Fix được thêm để fail loudly /
warning khi hook path thiếu hoặc unreadable. Nhưng automated review lại
phát hiện warning output còn có thể vi phạm hook contract.

PR #319: file mutation/config governance. Review tiếp tục tìm ra: line
diff có nguy cơ OOM, approval preview có thể che mất changes, executable
permission có thể bị mất, symlink backup có vấn đề, headless approval
thiếu write details.

PR #320: Project Workspace Service. Review lại phát hiện: workspace escape
qua absolute/parent paths hoặc symlink, refresh races, flood-diff
suppression chưa hiệu quả.

PR #321: provider identity/runtime/circuit state. Review phát hiện:
credential-disabled provider có thể chuyển HalfOpen sai, provider có thể
không recover đúng khi credentials hợp lệ trở lại.

Hai sự cố riêng biệt, dễ nhầm thành một nếu chỉ nhớ đại khái: đầu tháng 9,
desktop v1.4.4 ship hoàn toàn hỏng (packaged server thiếu node_modules) —
mất 3 bản patch cùng ngày mới sửa xong (PR #305/#306/#307/#308/#312, ngày
01–03/09/2026). Vài ngày sau, PR #323 (`feat(studio): Wave 1 + Wave 2 —
composer, governance telemetry, project memory, diff comments`, merged
08/09/2026) là một câu chuyện khác hẳn — toàn bộ check, kể cả Hook Tests,
đều pass ở bản merge cuối cùng.

Đây vẫn là minh chứng rõ cho Yana philosophy: GREEN SOMEWHERE != CORRECT
EVERYWHERE — chỉ là bài học nằm ở sự cố v1.4.4→v1.4.8, không phải ở PR
Studio Wave.

### 20. Những khó khăn không phải code

Project không được xây bởi một công ty lớn. Không có team engineering
hàng chục người. Không có ngân sách vô hạn. Có giới hạn subscription. Có
token limits. Có API cost. Có CI failures. Có package registry problems.
Có certificate/signing problems. Có hardware constraints. Có thời gian học
ở trường. Có lúc automated code review bị giới hạn usage. Có service
không auto-review vì repository chưa đủ 10 stars.

Project có chất lượng kỹ thuật tăng nhanh hơn mức độ public awareness. Đây
là một vấn đề hoàn toàn khác: build something ≠ people discover it.

Ngày 08/09/2026 tôi bắt đầu kết nối `yana.vutam.link` để chuẩn bị cho một
homepage thực sự của Yana AI.

### 21. Một thứ khác cũng thay đổi: cách tôi nhìn AI

Ban đầu AI là: tool giúp code nhanh. Sau đó: AI coding assistant. Sau đó:
agent. Nhưng khi agent có filesystem, terminal, network, Git, credentials,
tools, computer access, thì vấn đề không còn chỉ là intelligence.

Vấn đề trở thành: AUTHORITY (ai cấp quyền?), CONTEXT (AI đang biết cái
gì?), BLAST RADIUS (nếu nó sai, nó phá được bao nhiêu?), COST (nó được
tiêu bao nhiêu tài nguyên?), EVIDENCE (nó chứng minh công việc bằng gì?),
RECOVERY (có rollback được không?), TRUTH (nó thực sự làm hay chỉ nói
rằng đã làm?).

### 22. Triết lý Yana hiện nay

Tôi không nghĩ rằng cần phải "tin" một model. Model mạnh hơn không giải
quyết trust. Một model cực thông minh vẫn có thể: hallucinate, misunderstand
intent, execute the wrong operation, miss edge cases, produce an
incomplete implementation.

Vì vậy Yana được xây quanh một tư tưởng khác: DON'T TRUST. VERIFY AND
GOVERN. Không phải chống AI. Ngược lại: AI càng mạnh thì governance càng
quan trọng. Yana muốn cho AI nhiều capability hơn nhưng authority phải rõ
ràng.

### 23. Yana AI hôm nay

Yana AI không nên được mô tả đơn giản là "AI coding assistant." Cũng không
phải "desktop AI app." Và Yana Studio không phải toàn bộ Yana.

Yana đang tiến gần hơn tới: AI Agent Governance + Runtime Control Plane +
Developer Ecosystem. Nó nằm giữa AI/Agents và Computer/Code/Tools/Services.

Một abstraction đơn giản:

```
        AI AGENTS
           ↓
        PROPOSAL
           ↓
    ┌───────────────┐
    │     YANA      │
    │               │
    │ Capability    │
    │ Policy        │
    │ Authority     │
    │ Budget        │
    │ Audit         │
    │ Evidence      │
    │ Recovery      │
    └───────────────┘
           ↓
       EXECUTION
           ↓
 Code / Shell / Git / OS / Network / Tools
```

### 24. Đây là thứ website phải truyền đạt

Không biến câu chuyện này thành "Teen developer builds huge AI project."
Tôi không muốn một personal-brand landing page. Cũng đừng biến nó thành
một câu chuyện motivational sáo rỗng.

Website là YANA AI homepage. Origin story chỉ nên giúp giải thích tại sao
architecture hiện tại tồn tại. Các failure quan trọng hơn việc khoe số
lượng code.

Token runaway giải thích Budget Guard. Dangerous commands giải thích
deterministic policy. Silent hooks giải thích truthful execution. CI
problems giải thích Evidence. Cross-platform failures giải thích
verification. Agent mistakes giải thích human authority. Provider failures
giải thích state semantics. Robot safety giải thích local deterministic
control. Desktop signing/build problems giải thích tại sao system
engineering quan trọng.

Đó mới là câu chuyện. Yana không được thiết kế trên whiteboard rồi mới đi
tìm problem. Nhiều phần của Yana tồn tại vì problem đã xảy ra trước.

### 25. Website tone

Khi xây homepage, hãy thể hiện: Yana was built through iteration, failure,
verification and system engineering. Không exaggerate. Không fake scale.
Không fake enterprise adoption. Không fake users. Không fake benchmark.
Không biến founder thành hero. Để engineering nói thay.

Một câu có thể dùng làm tư tưởng xuyên suốt: "Every guardrail has a
reason." Hoặc: "Built from failures that should not happen twice."

Nhưng trước khi sử dụng public copy, hãy kiểm tra lại với tôi.

---

## Ghi chú thêm của anh Tâm (ngoài khối gốc, cùng tin nhắn)

> Tôi nghĩ đây mới là phần Claude cần biết trước khi đụng vào homepage.
> Nếu chỉ đưa nó 101 agents · 2,025 skills · Rust runtime · Desktop, nó rất
> dễ dựng ra một trang SaaS kiểu "powerful AI platform ✨". Trong khi điểm
> đáng kể hơn của Yana là mỗi lớp kiến trúc đều có nguyên nhân hình thành.
>
> Có một điểm tôi cố tình không làm: tôi không dựng một câu chuyện kiểu
> "từ cậu bé không biết Linux → thiên tài xây 700K LOC". Nó nghe kịch tính
> nhưng làm giảm độ tin cậy kỹ thuật. Homepage nên để người đọc thấy sự
> trưởng thành qua problem → failure → engineering response, như vậy mạnh
> hơn nhiều.

---

## Kết quả điều tra GitHub (2026-09-09)

Anh Tâm yêu cầu trực tiếp: *"giờ mới đến em điều tra toàn bộ lịch sử của
anh trên GitHub"* — đối chiếu từng claim cụ thể trong bản draft ở trên với
`git log`, `gh pr view`, `gh repo list`, `gh run list` thật. Phương pháp:
mỗi dòng dưới đây là một claim có thể kiểm chứng được, kèm lệnh dùng để
kiểm và kết quả thật — không suy diễn, không đoán.

### ✅ Xác nhận đúng, chính xác đến từng số

- **§8 — Yana 1.0.0 snapshot.** Draft: "101 agents, 2,025 skills, 71 rules,
  62 hooks, 113 scripts, 170 commands." Kiểm bằng `git show
  v1.0.0:MANIFEST.json` → **khớp tuyệt đối từng số**: agents_count=101,
  skills_count=2025, rules_count=71, hooks_count=62, scripts_count=113,
  commands_count=170.
- **§11 — npm 403 ngày 25/07/2026.** `git log --grep="npm" -i` cho thấy
  đúng chuỗi sự kiện: 2026-07-24 fix OIDC publish block → **2026-07-25**
  "debug: add temporary GitHub OIDC identity logging to npm publish job"
  (đúng ngày draft nêu) → 2026-07-26 "freeze npm at v0.43.1, document the
  account-level publish block" → 2026-07-30 "discontinue npm distribution".
  Khớp với `VERSIONING.md`'s "discontinued as of 2026-07-30" và lần thử
  thứ 3 "2026-08-01" đã biết từ trước.
- **§17 — PR #157, "277/277 tests".** Đọc trực tiếp PR body (`gh pr view
  157`): *"11 new permanent regression tests... Full suite: **277/277
  pass**."* Khớp tuyệt đối, kể cả tiêu đề PR ("replace naive-regex WebFetch
  SSRF guard with DNS-resolution-based check") khớp draft "SSRF guard được
  rework."
- **§18 — Yana-robot tháng 8/2026.** `gh repo list yanacuti1121` → repo
  public riêng **`yana-wheelbot`**, tạo **2026-08-23**, mô tả: *"Independent
  ESP32-S3 voice-AI robotics platform derived from XiaoZhi AI Chatbot
  (MIT)"*. Khớp ESP32-S3 + lineage XiaoZhi draft nêu. Có ngày chính xác
  (23/08) để dùng công khai nếu anh muốn, thay vì chỉ nói "tháng 8".
- **§19 — PR #317/#319/#320/#321 có thật, đúng nội dung.** `gh pr view`
  từng PR: #317 "fail-loud missing-hook guard + validate plugin scripts"
  (merged 2026-09-07 — đây chính là PR mở ra branch hiện tại của session
  này), #319 "file-mutation + config governance", #320 "headless Project
  Workspace Service **(unwired)**" (tiêu đề PR tự ghi rõ "chưa nối", khớp
  tinh thần honesty của draft), #321 "unify provider identity, runtime,
  circuit state" — cả 4 khớp đúng nội dung draft mô tả.

### ✅ Sai lệch đã tìm ra và sửa (2026-09-10)

- **§10 — PR #85 số commit. Đã sửa trong §10 ở trên: "28" → "31".** Thật:
  `gh pr view 85`
  → **31 commits** (+1179/-2856, merged 2026-07-27). Sửa số, hoặc dùng
  "hơn 30 commits" để không cần chính xác tuyệt đối.
- **§19 — PR #324 SAI hoàn toàn nội dung. Đã viết lại §19 ở trên: tách
  riêng đúng 2 sự cố thật (v1.4.4→v1.4.8 platform-download #305-312, và
  Studio Wave PR #323 — pass hết check), không còn gọi chung là
  "#324".** Draft gốc: *"PR #324: automated
  review... platform-download regression và vấn đề Intel/macOS installer...
  Studio Wave CI vẫn nhiều lần fail Hook Tests."* Thật: PR #324 là
  `fix(docs): remove gradient-text h1, one clear CTA in the hero` — chính
  PR redesign trang chủ mà Claude vừa làm trong phiên này (docs/CSS thuần,
  không liên quan installer/platform-download). PR thật về "Studio Wave" là
  **PR #323** (`feat(studio): Wave 1 + Wave 2 — composer, governance
  telemetry, project memory, diff comments`, merged 2026-09-08) — kiểm
  `gh pr checks 323` ngay lúc audit: **toàn bộ check đều pass, kể cả Hook
  Tests** (không thấy trạng thái "vẫn fail" ở bản cuối cùng — có thể đã có
  lần fail trước khi xanh, nhưng chưa kiểm sâu run history để xác nhận).
  "Platform-download regression / Intel macOS installer" khớp hơn với đợt
  sự cố Desktop v1.4.4→v1.4.8 đầu tháng 9 (PR #305/#306/#307/#308/#312,
  ngày 01-03/09, không phải 09/09) — đã ghi trong bộ nhớ session trước:
  *"v1.4.4 shipped completely broken (packaged server missing
  node_modules); took 3 patch releases same day to fix."* **Kết luận (đã
  áp dụng ở §19 trên): PR #323 (Studio Wave) tách riêng khỏi đợt sự cố
  #305-312 (platform-download), không còn gộp chung vào "#324".**

### ⚪ Không kiểm chứng được qua GitHub — cần nguồn khác từ anh

- **§4 — "khoảng 18B token ở một luồng sử dụng Claude".** Đây là số liệu
  usage/billing cá nhân, không nằm trong git history hay GitHub API nào em
  truy cập được. Cần anh tự xác nhận từ dashboard/usage log của anh trước
  khi in số này lên web.
- **§9 — "16/06/2026... 127.0.0.1:8081... 3,438 skills... Firebase
  Studio/Nix thiếu `@anthropic-ai/claude-code-linux-x64`".** Đã kiểm
  `git log` đúng ngày 2026-06-16 — commit thật trong ngày đó là về yana-web
  themes/VTuber companion/README, không thấy gì liên quan Firebase
  Studio/Nix hay con số skill 3,438. Có thể sự kiện này nằm trong một
  session chat không commit vào git (terminal log/screenshot anh còn giữ).
  Không kết luận là sai — chỉ là không tự xác minh được qua repo, cần anh
  xác nhận nguồn.
- **§16 — "macOS build fail ~9 lần", "CI 13→18 checks".** `gh run list
  --workflow desktop.yml --status failure` cho tổng **36 lần fail** trên
  toàn lịch sử workflow "Desktop Build" — cao hơn "9" nhiều, nhưng đó là
  tổng CẢ ĐỜI workflow qua nhiều sự cố khác nhau, không phải riêng 1 đợt
  incident macOS-signing mà draft đang nói tới. Không đủ thời gian tách
  riêng đúng 1 đợt/1 job macOS cụ thể để xác nhận đúng số "9" — cần anh xác
  nhận lại nếu số này quan trọng để in công khai, hoặc đổi thành ngôn ngữ
  không cần số chính xác ("nhiều lần", "repeatedly").

### Sự thật thêm tìm được, không có trong draft (có thể dùng)

- **Repo Yana-AI tạo đúng ngày 2026-05-17** (`git log --reverse`, commit
  đầu tiên "scaffold baseline"). Draft cố tình không ghi ngày cho "điểm
  xuất phát" — giờ đã có ngày thật, nếu anh muốn dùng.
- **"jnmt" đã xác định được** (xem `YANA-ECOSYSTEM-MAP.md` §1) —
  `jnmt-claude-code-agenl-21`, app hỗ trợ học sinh trường Jeonnam Future
  International High School, repo private, tạo 2026-04-21 — **trước cả
  Yana AI gần 1 tháng**. Đây có thể là bằng chứng thật cho "Yana chạy
  trong một app thật khác" nếu anh muốn kể, nhưng repo private + có thể
  liên quan dữ liệu học sinh → em không đọc sâu nội dung, chỉ xác nhận nó
  tồn tại và ngày tạo.

---

## Việc cần làm trước khi dùng bất kỳ phần nào của bản này lên web

1. ~~Xác minh từng con số/PR/ngày~~ — **đã làm ở mục "Kết quả điều tra
   GitHub" trên**. ~~Sửa §10 (31 không phải 28 commits) và viết lại §19
   (PR #323 Studio Wave, tách khỏi đợt #305-312 platform-download — không
   phải "#324")~~ — **đã sửa trực tiếp vào §10/§19 ở trên, 2026-09-10.**
2. Anh Tâm duyệt bản rút gọn cuối cùng trước khi publish — không tự suy ra
   "bản đủ tốt rồi" và xuất bản.
3. Map mỗi đoạn failure → đúng rule/file trong `YANA-ECOSYSTEM-MAP.md`
   trước khi viết copy, để mỗi câu trên web trace được về code thật.
4. Anh xác nhận/bổ sung nguồn cho 3 mục "Không kiểm chứng được" ở trên
   (18B token, sự kiện 16/06, số lần fail macOS build) trước khi in số
   cụ thể lên trang public.
