# YAMTAM — Vision

**Author:** Vũ Văn Tâm  
**Written:** 2026-06-07  
**Rule:** Đây không phải docs. Đây là la bàn.

---

## YAMTAM là gì?

YAMTAM là **lớp điều phối giữa con người và AI**.

Không phải agent. Không phải chatbot. Không phải framework.

Một lớp mỏng, đứng giữa ý định của con người và hành động của AI —
routing đúng task, giữ safety, quản lý context, và phối hợp nhiều model.

Bốn thứ đó là lõi. Không thêm.

```
Con người
    ↓
[ Routing · Safety · Orchestration · Context ]   ← YAMTAM core
    ↓
AI (Claude · GPT · Gemini · bất kỳ model nào)
    ↓
Kết quả
```

---

## YAMTAM không phải là gì?

- Không phải một AI coding assistant
- Không phải một framework để thêm agent và skill vô tận
- Không phải một sản phẩm dành riêng cho developer
- Không phải một bản copy của LangChain, AutoGPT, hay CrewAI
- Không phải thứ cần AI để chạy — lõi phải chạy được mà không cần LLM

---

## 5 năm nữa

Nếu YAMTAM thành công, người dùng sẽ không biết họ đang dùng YAMTAM.

Họ chỉ biết:

> "Tôi nói điều tôi cần. AI hiểu. Việc được làm. Không có gì bị phá."

Cụ thể hơn — năm 2031, YAMTAM core chạy bên dưới:

- **Trợ lý cá nhân** — task, lịch, email, quyết định nhỏ hàng ngày
- **Công cụ học tập** — AI dạy theo cách người học cần, không phải cách AI muốn nói
- **Hệ thống doanh nghiệp** — workflow tự động, human-in-the-loop đúng chỗ
- **Nền tảng cho developer** — vẫn là người dùng đầu tiên, nhưng không còn là người duy nhất

Coding là ứng dụng đầu tiên. Không phải cuối cùng.

---

## Người dùng là ai?

**Bây giờ:** Developer dùng AI coding agent và cần kiểm soát.

**12 tháng tới:** Người dùng phổ thông muốn AI làm việc cho họ mà không cần biết prompt engineering.

**5 năm tới:** Bất kỳ ai cần một lớp tin cậy giữa mình và AI — dù là học sinh, kỹ sư, hay người không biết code.

---

## Giá trị cốt lõi

**1. Tin cậy trước, tính năng sau.**  
Một hệ thống ít tính năng nhưng không bao giờ làm hỏng dữ liệu của anh —
đáng giá hơn một hệ thống nhiều tính năng nhưng đôi khi `rm -rf` nhầm.

**2. Lõi gọn, surface rộng.**  
Routing · Safety · Orchestration · Context — bốn thứ này làm thật sâu.
Mọi domain bên trên chỉ là application layer, không cần viết lại core.

**3. Con người luôn giữ quyền kiểm soát.**  
AI thực thi. Người quyết định. Không có gì không thể rollback.

**4. Một thứ chạy thật tốt hơn mười thứ chạy tạm được.**

---

## Các khái niệm — định nghĩa một lần, dùng mãi

### Yana là gì?

Yana là **giao diện đầu tiên của YAMTAM** — một ứng dụng web cho phép người dùng chat với AI, chọn provider, và dùng skill routing mà không cần biết gì về hạ tầng bên dưới.

Yana **không phải** YAMTAM. Yana là một application chạy *trên* YAMTAM core.

```
Người dùng → Yana Web → YAMTAM core → Model
```

Nếu YAMTAM là hệ điều hành, thì Yana là ứng dụng đầu tiên chạy trên đó.  
Ngày mai có thể có Yana Mobile, Yana CLI — cùng core, khác surface.

---

### Agent là gì?

Trong YAMTAM, agent **không phải** một process chạy độc lập.

Agent là **một persona pattern** — một tập hướng dẫn, style, và behavior được inject vào context của LLM khi cần.

```
User: "Review code của tôi theo kiểu security-focused"
  → Router: chọn agent "security-auditor"
  → Inject persona + context vào prompt
  → LLM trả lời theo style đó
```

Agent không có RAM riêng. Agent không chạy song song. Agent là config, không phải process.

Đó là lý do 95 agent **không tốn resource** — chúng chỉ là file `.md` nằm trong `core/agents/`.

---

### Skill là gì?

Skill là **plugin cho routing layer** — định nghĩa khi nào được kích hoạt và tool nào được gọi.

```yaml
# Ví dụ đơn giản
trigger: ["review code", "xem code", "kiểm tra code"]
description: "Code review với checklist chuẩn"
tools: [Read, Grep]
gate: L2
```

Khi user gõ "xem code của tôi", router match trigger → load skill → thực thi.

Skill không phải code chạy trực tiếp. Skill là instruction được load vào context khi cần.  
3,498 skill không tốn RAM — chúng chỉ tốn disk space (< 50MB toàn bộ).

---

### 95 agent có còn cần thiết không?

**Câu trả lời thật:** Không — không phải cùng một lúc.

Trong Yana Web MVP, chỉ 3–5 agent quan trọng:
- `code-reviewer` — review code
- `debugger` — debug
- `planner` — lập kế hoạch
- `backend-developer` / `frontend-developer` — implement

95 agent còn lại là **thư viện** — sẵn sàng khi cần, không ảnh hưởng performance khi không dùng.

Nếu ngày mai 90 agent biến mất, Yana Web vẫn chạy bình thường.

---

### Đâu là lõi không được đụng tới?

Ba thứ này không được rewrite, không được bỏ, không được "cải tiến" nếu không có lý do rất rõ ràng:

```
Router    — routing request đúng agent/skill
Safety    — gate, injection protection, scope guard  
Context   — memory (L1/L2), session state
```

Mọi thứ còn lại — agent, skill, Yana Web, hooks, scripts — đều là **application layer**.  
Application layer có thể thay đổi. Core thì không.

---

## Câu nhắc — đọc trước khi bắt đầu ngày mới

> **"Hôm nay tôi chỉ làm sâu hơn lớp cốt lõi — không mở rộng."**

---

## Thước đo thành công — 12 tháng tới

Một người không phải developer tải YAMTAM về, nhập API key, và dùng được.  
Không cần đọc docs. Không cần hỏi ai.

Nếu làm được điều đó — mọi thứ còn lại sẽ tự nhiên đến.

---

*File này là la bàn, không phải roadmap. Roadmap thay đổi. La bàn không.*
