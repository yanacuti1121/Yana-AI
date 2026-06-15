# Yana AI — Architecture

**Author:** Vũ Văn Tâm  
**Rule:** Đây là sơ đồ hệ thống, không phải tài liệu kỹ thuật đầy đủ.

---

## Sơ đồ tổng thể

```
┌─────────────────────────────────────────────────────────┐
│                       User                              │
└─────────────────────────┬───────────────────────────────┘
                          │ intent (text / action)
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Interface Layer                       │
│                                                         │
│   Yana Web   │   Yana Mobile *   │   CLI   │   API *    │
│   (chat UI)  │   (tương lai)     │         │ (tương lai)│
└─────────────────────────┬───────────────────────────────┘
                          │ request
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Yana AI Core  ← KHÔNG ĐƯỢC ĐỤNG        │
│                                                         │
│   Router          Safety Gate        Context / Memory   │
│   ─────────       ──────────────     ─────────────────  │
│   • skill match   • injection scan   • L1 atomic facts  │
│   • agent select  • scope guard      • L2 session state │
│   • provider pick • blast radius     • session history  │
│   • fallback      • permission tier  • memory persist   │
│                                                         │
│   [ Orchestration — chạy tool, manage multi-step flow ] │
└─────────────────────────┬───────────────────────────────┘
                          │ prompt + context
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Model Providers                        │
│                                                         │
│   Claude (Anthropic)   │   GPT (OpenAI)   │   Gemini   │
│   Llama (local) *      │   Mistral *      │   any API  │
└─────────────────────────────────────────────────────────┘

* = tương lai, chưa làm
```

---

## Yana AI Core — chi tiết 3 trụ

### 1. Router

> Nhận ý định → tìm đúng skill/agent → chọn provider → dispatch

```
Input: "review code của tôi"
  → match trigger phrases: code-reviewer skill
  → load agent persona: code-reviewer
  → select provider: Claude (default)
  → pass context + tools: [Read, Grep]
  → output to interface
```

**File quan trọng:**
- `core/config/skills-lock.json` — registry 3,498 skills
- `core/agents/*.md` — 95 agent personas
- `core/scripts/model-router.sh` — provider selection logic

---

### 2. Safety Gate

> Mọi tool call phải qua gate trước khi execute

```
Tool call intent
    ↓
injection-scan  →  blast-radius  →  permission-check  →  egress-check
    ↓                                                         ↓
  BLOCK                                                    ALLOW
    ↓                                                         ↓
log + deny                                              execute tool
                                                             ↓
                                              output-sanitize → pii-scrub → audit-log
```

**File quan trọng:**
- `core/rules/` — 40+ rules
- `core/scripts/safe-run.sh` — command validation
- `core/scripts/tool-proxy.sh` — middleware pipeline
- `.git/hooks/pre-commit`, `pre-push` — git gate

---

### 3. Context / Memory

> Thông tin persist qua sessions, không bị mất khi context window reset

```
L1 Atomic (permanent)
  → facts về project, architecture, decisions
  → không xóa được, chỉ deprecate

L2 Session (ephemeral)
  → context hiện tại, task đang làm
  → tự xóa sau session

L3 Working Memory (in-context)
  → những gì đang trong conversation window
  → mất khi compact
```

**File quan trọng:**
- `core/memory/L1_atomic/` — permanent facts
- `core/scripts/add-fact.sh` — write to L1
- `core/scripts/session-checkpoint.sh` — snapshot L2

---

## Những thứ KHÔNG nằm trong hot path

Các thứ này tồn tại nhưng **không ảnh hưởng performance** khi không được dùng:

| Thứ | Bao nhiêu | Ảnh hưởng lúc idle |
|-----|-----------|-------------------|
| Skills | 3,498 | 0 — chỉ load khi trigger match |
| Agents | 95 | 0 — chỉ inject khi được chọn |
| Hooks | 46 | nhỏ — chỉ chạy khi event fire |
| Rules | 40+ | 0 — chỉ đọc khi cần validate |

**Skills và agents là config, không phải process.**  
Chúng nằm trong disk, không trong RAM.

---

## Luồng Yana Web MVP

Luồng đơn giản nhất — Phase 2:

```
1. User mở Yana Web
2. Nhập Anthropic API key (lưu localStorage)
3. Gõ tin nhắn
4. Yana gửi request đến Yana AI Router
5. Router: không có trigger match → pass thẳng đến Claude
6. Claude trả lời → Yana hiển thị
```

Không cần 95 agents. Không cần 3,498 skills.  
Chỉ cần: UI → Router → Claude.

---

## Yana Web — tech stack dự kiến

```
Frontend: Vanilla JS / lightweight framework (không React cho MVP)
         → anime.js cho animation nhỏ (nếu cần)

Backend:  Node.js / Express
         → Yana AI core imported as module

Deploy:   Railway (hiện tại đã có)
         → https://yamtam-engine-production.up.railway.app
```

---

## Định hướng tích hợp tương lai (Phase 4)

**Nhóm 1 — Tích hợp trực tiếp (tính năng / cổng kết nối)**

| Repo | Mục đích | Tích hợp vào đâu |
|------|----------|-----------------|
| [n8n](https://github.com/n8n-io/n8n) | Workflow automation cho non-dev | Yana surface mới |
| [OpenWork](https://github.com/different-ai/openwork) | AI Agent Framework | Yana AI Core orchestration |
| [Graphify](https://github.com/safishamsi/graphify) | Graph data visualization | Context/Memory layer |
| [VNPay](https://github.com/lehuygiang28/vnpay) | Payment cho Vietnam market | Application layer |

**Nhóm 2 — Hỗ trợ Frontend & Tài liệu**

| Repo | Mục đích | Tích hợp vào đâu |
|------|----------|-----------------|
| [anime.js](https://github.com/juliangarnier/anime) | Hiệu ứng chuyển động | Yana Web frontend |
| [Google Labs design.md](https://github.com/google-labs-code/design.md) | Mẫu tài liệu thiết kế | Yana AI documentation |

Những thứ này **không làm ngay** — chỉ để biết phase 4 trông như thế nào.

---

*Sơ đồ này mô tả hệ thống như nó* **nên** *là, không nhất thiết như nó đang là. Sự khác biệt giữa hai thứ đó là việc cần làm.*
