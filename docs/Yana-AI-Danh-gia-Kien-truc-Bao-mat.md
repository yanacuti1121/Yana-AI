# Yana‑AI — Đánh giá Kiến trúc AI & Bảo mật

> Đối chiếu trực tiếp với mã nguồn giải nén từ `Yana-AI-main` (repo `yanacuti1121/yana-ai`, README ghi v0.43.2).
> Vai trò: Chuyên gia Kiến trúc AI + Kỹ sư Bảo mật. Mọi kết luận đều dẫn chiếu file/dòng thực tế để tránh báo cáo ảo.
> Ngày: 2026‑07‑11.

---

## 0. Bức tranh kiến trúc thực tế (để đặt đúng ngữ cảnh)

Yana‑AI **không phải một app chatbot** — nó là một "safety firewall / Agent OS" bọc quanh Claude Code, gồm nhiều thành phần rời:

| Thành phần | File thực tế | Vai trò |
|---|---|---|
| Lõi hook/gate (bash) | `.claude/hooks/*.sh`, `.claude/gates/*` | Chặn lệnh nguy hiểm, injection, RBAC, budget… ở tầng Claude Code |
| Runtime Rust `yana-rt` | `src/*.rs` (`cost.rs`, `route.rs`, `scanner/`, `guard/`) | Port hiệu năng của một số hook, cost ledger, router |
| Cloudflare Worker (chatbot "Yana AI IO") | `worker.js` | Proxy chat công khai qua Groq |
| Node server (desktop/web) | `tools/yana-web/server.js` (2070 dòng) | Multi‑provider LLM gateway chạy local/Railway |
| GitHub App | `github-app/src/*.ts` | Tự mở PR cài config vào repo người dùng |
| Site tài liệu | `site/` (Astro) | Tĩnh, chỉ fetch JSON nội bộ |

**Điểm mấu chốt cần nhớ:** chất lượng bảo mật **rất không đồng đều** giữa các thành phần. `tools/yana-web/server.js` được làm rất kỹ (có CSRF, DNS‑rebinding defense, rate‑limit, AUTH‑01 fix). Ngược lại `worker.js` — thứ **đang public ra Internet** — gần như trần trụi. Đây là bất đối xứng nguy hiểm nhất của dự án.

---

## 1. RÀ SOÁT BẢO MẬT (đã đối chiếu mã nguồn)

### 1.1 Lỗ hổng NGHIÊM TRỌNG — `worker.js` là một open proxy tới Groq

**Bằng chứng (`worker.js`):**
```js
const CORS = { 'Access-Control-Allow-Origin': '*', ... };   // dòng 1‑4
// POST /api/chat: không có auth, không có rate-limit, không kiểm origin
'Authorization': `Bearer ${env.GROQ_API_KEY}`               // key server-side
```
`grep -c "limit|throttle|rate" worker.js` → **0**.

**Vấn đề:**
- API key **không** bị lộ ra client (điểm tốt — nằm trong `env`), NHƯNG endpoint `/api/chat` mở cho *mọi* origin, *không* xác thực, *không* giới hạn tần suất → bất kỳ ai cũng dùng nó làm **free Groq proxy**. Hậu quả trực tiếp: **cạn hạn mức / cháy hóa đơn Groq**, và địa chỉ Worker của bạn trở thành relay ẩn danh cho người khác.
- Đây là dạng "API key abuse" gián tiếp: kẻ tấn công không cần lấy được key, chỉ cần gọi proxy.

**Khắc phục cụ thể:**
1. Bật **Cloudflare Rate Limiting** hoặc tự đếm theo IP bằng **Workers KV / Durable Object** (ví dụ 20 req/phút/IP như `rate-limits.json` đã định nghĩa cho tầng tool nhưng chưa áp cho worker).
2. Siết CORS: thay `*` bằng allowlist origin thật (`https://<domain-site>`), kiểm `request.headers.get('Origin')`.
3. Thêm **Cloudflare Turnstile** (captcha) hoặc token ký ngắn hạn cho trang web hợp lệ.
4. Đặt **daily budget cap** ở phía Groq và alert khi vượt ngưỡng.

### 1.2 Lỗ hổng — Prompt Injection & System‑role smuggling trong `worker.js`

**Bằng chứng:**
```js
const { messages: bodyMessages, lang } = body;
const messages = [
  { role: 'system', content: `${SYSTEM}\n\n${langInstruction}` },
  ...(bodyMessages ?? []),          // ← spread nguyên si, không lọc role, không giới hạn
];
```
`bodyMessages` do client kiểm soát hoàn toàn và được ghép thẳng vào mảng gửi cho Groq.

**Vấn đề:**
- Client có thể **chèn thêm message `role:"system"` của riêng mình**, hoặc dùng nhiều turn giả để ghi đè `SYSTEM` (chỉ 2‑4 câu, rất yếu). System prompt trong `worker.js` là plaintext, **trivially override được** và **không có giá trị bảo mật** (nó không chứa secret, nên rò rỉ system prompt ở đây rủi ro thấp — nhưng override hành vi thì có thật).
- **Không giới hạn số message / độ dài** → khuếch đại rủi ro cháy token ở mục 1.1.

**Khắc phục:**
1. **Lọc role phía server:** chỉ chấp nhận `role ∈ {user, assistant}` từ `bodyMessages`, ép bỏ mọi `system` do client gửi.
2. Giới hạn cứng: `bodyMessages.length ≤ N` (vd 20) và tổng ký tự ≤ ngưỡng; trả 400 nếu vượt.
3. Kẹp lại system prompt ở **cả đầu và cuối** ("sandwich") để khó override.
4. Quan trọng: **`prompt-injection-guard.sh` chỉ bảo vệ tầng Claude Code agent, KHÔNG chạm tới `worker.js`.** Cần port bộ pattern injection đó (hoặc một guardrail nhẹ) vào worker.

### 1.3 Lỗ hổng — Rò rỉ chi tiết lỗi upstream ra client (`worker.js`)

**Bằng chứng:**
```js
if (!upstream.ok) {
  const err = await upstream.text();
  return new Response(err, { status: upstream.status, headers: CORS }); // ← trả nguyên body lỗi Groq
}
```
**Vấn đề:** body lỗi của Groq có thể tiết lộ model, cấu hình, quota, thậm chí một phần request → hỗ trợ reconnaissance. **Khắc phục:** log lỗi chi tiết ở server, trả cho client một thông báo generic (`{"error":"upstream_unavailable"}`) + status chuẩn hóa.

### 1.4 GitHub App — so sánh chữ ký webhook không constant‑time

**Bằng chứng (`github-app/src/index.ts`):**
```js
return signature === expected;   // so sánh chuỗi thường → timing side-channel
```
**Vấn đề:** về lý thuyết cho phép timing attack để dò chữ ký HMAC. Rủi ro thực tế thấp (mạng nhiễu lớn) nhưng là chuẩn mực bắt buộc. **Khắc phục:** dùng so sánh hằng thời gian — trên Workers có thể so sánh bằng `crypto.subtle.timingSafeEqual` (qua WebCrypto) hoặc thuật toán XOR‑accumulate độ dài cố định. Thêm kiểm tra độ dài trước.

### 1.5 Quyền của GitHub App quá rộng + auto‑commit vào repo người dùng

**Bằng chứng (`installer.ts`):** app tự `createOrUpdateFileContents`, tạo branch, mở PR, và khi repo rỗng còn **tự khởi tạo README + commit** vào repo người dùng ngay khi cài.
**Vấn đề:** đây là hành vi ghi tự động dựa trên webhook `installation`. Nếu private key (`GITHUB_APP_PRIVATE_KEY`) lộ, kẻ tấn công ghi được vào mọi repo đã cài. **Khắc phục:** (a) tối thiểu hóa scope app xuống `contents:write` + `pull_requests:write` trên repo được chọn; (b) idempotency/guard chống loop; (c) lưu private key trong secret manager, xoay vòng định kỳ; (d) cân nhắc **chỉ mở PR, không bao giờ commit trực tiếp** kể cả với repo rỗng.

### 1.6 PII — email cá nhân hardcode làm default

**Bằng chứng:** `phamlongh230@gmail.com` xuất hiện trong `tools/check-mail.py` (`GMAIL_USER default`), và rải rác `README*.md`, `SECURITY.md`, `.claude/MEMORY_BACKUP.md`.
**Vấn đề:** không phải secret, nhưng là PII gắn cứng, dễ thành mục tiêu spam/social‑engineering và làm lộ danh tính owner trong mọi fork. **Khắc phục:** bỏ default, bắt buộc set qua `GMAIL_USER` env; xóa khỏi tài liệu công khai.

### 1.7 Những điểm LÀM ĐÚNG (ghi nhận để không "báo động giả")

- **Không có secret hardcode** trong toàn repo. Các match `sk-`/`gsk_` khi grep đều nằm trong **tài liệu skill bảo mật** (ví dụ `secrets-scan.md`, skill canary‑token), không phải key thật. `.gitignore` đã loại `*.env`, `*.key`, `*private-key*`, `.claude/state/`.
- `worker.js`: GROQ key nằm server‑side, **không** stream ra client — đúng chuẩn.
- `NINE_ROUTER_KEY` (`server.js:48`) đọc key từ SQLite local của 9router, **không** nhúng cứng.
- `tools/yana-web/server.js` là bài mẫu tốt: CSRF (`originAllowed`), DNS‑rebinding (`hostAllowed` + `ALLOWED_HOSTS`), per‑IP rate‑limit có sweep chống memory‑leak, validate IP chống header‑injection (`AUTH-01`), CSP/HSTS headers, body size cap 16KB.
- `guard-destructive.sh` trung thực về giới hạn của chính nó (comment thừa nhận không phải full shell parser, còn gap mid‑token quote‑splice) — tư duy bảo mật chín chắn.

**Kết luận mục 1:** rủi ro tập trung ở **thành phần public‑facing `worker.js`** và **GitHub App**, không phải ở lõi. Ưu tiên vá theo thứ tự: 1.1 → 1.2 → 1.3 → 1.4/1.5.

---

## 2. THÀNH PHẦN CỐT LÕI CÒN THIẾU ĐỂ VẬN HÀNH THỰC TẾ

### 2.1 Quản lý token / chi phí — hiện chỉ là "policy‑level", chưa đo thật

**Bằng chứng:**
- `.claude/config/budget.json` ghi thẳng: *"Token budget is policy‑level only. This pack does not claim real token metering."*
- `src/cost.rs`: `track_from_payload` chỉ ghi ledger **nếu payload đã sẵn `input_tokens`/`output_tokens`** — tức là phụ thuộc thứ khác đếm hộ; bản thân nó không tokenize. `tier_rates` có bảng giá nhưng là ước lượng tĩnh.
- `model-router.sh`: ước lượng token bằng heuristic **"4 ký tự ≈ 1 token"** (`TOKEN_ESTIMATE=$((CHAR_COUNT/4))`).

**Thiếu:** đo token thật (tokenizer thực), gộp chi phí đa provider, hạn mức cứng theo phiên/ngày, cảnh báo real‑time.
**Đề xuất:**
1. Tích hợp tokenizer thật: `tiktoken`/`@anthropic-ai/tokenizer` cho ước lượng trước gọi; đọc `usage` trả về từ API để ghi chính xác sau gọi (Groq/OpenAI/Anthropic đều trả `usage`).
2. Chuẩn hóa để mọi provider trong `server.js` bơm `usage.{input,output}_tokens` vào bus → `cost.rs` ghi ledger đúng.
3. Bảng giá **theo model cụ thể** (không chỉ 3 tier) + tự cập nhật từ file config, có version.
4. **Hard budget enforcement:** khi vượt ngưỡng ngày → chuyển tier rẻ hoặc chặn, không chỉ "warn".

### 2.2 Guardrails nội dung — chỉ có injection‑guard đầu vào cho agent, thiếu bộ lọc đầu ra

**Bằng chứng:** `prompt-injection-guard.sh` mạnh nhưng **chỉ** chạy PreToolUse trong Claude Code (Bash/Write/Edit/WebFetch). Không có:
- Bộ lọc **output** (moderation) trước khi trả lời người dùng ở `worker.js`/`server.js`.
- **Redaction PII/secret trong output** (quét `sk-`, email, token trong câu trả lời trước khi gửi).
- Kiểm duyệt nội dung độc hại/không phù hợp.

**Đề xuất:**
1. Guardrail đầu ra: quét response bằng regex secret/PII (tái dùng `scanner/env-secret-checks.yml`, `auth-credential-checks.yml`) trước khi trả về.
2. Content moderation layer: gọi model moderation nhẹ hoặc rule‑based cho cả input lẫn output của chatbot public.
3. Đưa injection‑guard thành **thư viện dùng chung** (đã có bản Rust ở `src/guard/`), cho worker/server gọi được — không để bash‑only.

### 2.3 Xử lý lỗi / Fallback — thiếu failover và retry ở tầng public

**Bằng chứng:**
- `worker.js`: Groq lỗi → trả thẳng lỗi, **không retry, không provider dự phòng**.
- `server.js` có bảng `PROVIDERS` đa nhà cung cấp nhưng **không thấy cơ chế tự động failover** khi một provider chết (chỉ chọn theo cấu hình).
- `model-router.sh` chọn tier nhưng không có nhánh "nếu tier chính fail thì hạ cấp".

**Đề xuất:**
1. **Circuit breaker + retry với backoff** cho mọi lời gọi upstream (đã có ý tưởng `per-tool-circuit-breaker.sh` cho tool — cần bản cho LLM call).
2. **Provider failover chain:** Groq → (fallback) provider khác/Ollama local; cấu hình thứ tự trong `router/model-routing-policy.yml`.
3. **Graceful degradation:** khi hết budget/timeout → trả câu trả lời rút gọn từ model rẻ thay vì lỗi cứng.
4. Streaming resilience: `worker.js` stream trực tiếp `upstream.body` — nếu đứt giữa chừng client không biết; thêm heartbeat/error‑frame trong SSE.

### 2.4 Các mảnh vận hành khác còn thiếu

- **Observability tập trung:** telemetry hiện chỉ ghi `.jsonl` local (`telemetry-sender.sh`), không có tracing/aggregation. → tích hợp OpenTelemetry hoặc Langfuse (đã có skill `langfuse` sẵn trong môi trường) cho trace + cost + eval.
- **Secret rotation & vault runtime:** có `src/vault/` nhưng cần chính sách xoay vòng key GitHub App/Groq định kỳ.
- **Kiểm thử injection tự động (red‑team):** chưa thấy test‑suite tấn công injection cho worker; nên có.
- **Health/SLO cho worker:** GitHub App có `/health`, worker `/api/chat` thì không có health/metric endpoint.

---

## 3. GIẢI PHÁP NÂNG TẦM (danh sách mở rộng, không giới hạn)

> Nhóm theo góc độ để tiện đưa vào roadmap. Đánh dấu ⭐ = tác động cao/khả thi sớm.

### 3.1 An toàn & Guardrails (thế mạnh cốt lõi của dự án — nên đào sâu)
1. ⭐ **Unified Guardrail Engine** (Rust, `src/guard/`) làm 1 nguồn sự thật cho: injection in/out, secret‑redaction, PII, moderation — expose qua WASM để `worker.js` gọi được cùng logic.
2. ⭐ **Semantic injection detection**: thay vì chỉ regex, dùng embedding classifier phát hiện injection biến thể (chống obfuscation, unicode homoglyph, zero‑width).
3. **Canary/honeytoken trong context**: nhúng token bẫy vào system prompt; nếu xuất hiện ở output → phát hiện leak (dự án đã có skill canary‑token, hãy dùng thật).
4. **Policy‑as‑code có test**: mỗi rule trong `guards/index.yml` kèm test case tấn công + phòng thủ, chạy trong CI.
5. **Tool sandboxing thực thi thật**: đã có `core/sandbox/` (Firecracker/Docker config) — hoàn thiện để mọi Bash tool chạy trong micro‑VM, không chỉ chặn bằng regex.
6. **Prompt‑firewall gateway** đứng trước mọi provider (worker + server dùng chung), có audit đầy đủ.
7. **Signed audit log** (hash‑chain) để log không sửa được — nâng `audit-log.sh` thành tamper‑evident.

### 3.2 Tối ưu chi phí & hiệu năng
8. ⭐ **Real token metering + per‑model pricing** (mục 2.1) — nền tảng cho mọi tối ưu chi phí.
9. ⭐ **Semantic caching**: cache câu trả lời theo embedding của prompt (ngưỡng cosine) → giảm gọi LLM cho câu hỏi lặp; đặc biệt hữu ích cho chatbot IO.
10. **Prompt compression / context pruning** thật: `tools/headroom-compress.py` đã có mầm — nâng thành nén ngữ cảnh dựa relevance trước khi gửi.
11. **Speculative/cascade routing**: thử model rẻ trước, chỉ escalate lên model mạnh khi confidence thấp (mở rộng `confidence-scorer.sh` + `route.rs`).
12. **Batching & request coalescing** ở `server.js` gateway.
13. **KV‑cache/prefix reuse** cho system prompt cố định (prompt caching của Anthropic/Groq nếu hỗ trợ).
14. **Edge inference**: chạy model nhỏ (guardrail/router) ngay trên Cloudflare Workers AI thay vì gọi ra ngoài.

### 3.3 Kiến trúc AI tiên tiến (thứ thiết kế hiện tại chưa có)
15. ⭐ **RAG cho 2,013 skills**: hiện skill‑routing dựa index tĩnh (`skill-trigger-index.json`). Thay bằng **vector search** (đã có `src/graph/`, `embeddings.js`) để chọn skill/agent theo ngữ nghĩa, giảm nhầm.
16. **Agent memory dài hạn có provenance**: đã có `memory/` + `memory-provenance.sh` — nâng thành memory phân tầng (episodic/semantic) với decay và trích dẫn nguồn.
17. **Multi‑agent orchestration có kiểm chứng chéo**: agent "verifier" độc lập review output agent chính (hiện có `truth-gate-guard.sh`, `claim-audit.js` — ghép thành vòng critic‑actor).
18. **Structured output + schema validation**: đã có `structured-output-validator.js` — chuẩn hóa mọi agent trả JSON theo schema, tự sửa khi lệch.
19. **Eval harness tự động** (`harness_export.py` đã có mầm): bộ eval hồi quy cho từng skill/hook, chạy CI, chống "skill drift".
20. **Tool‑use planning (ReAct/Plan‑Execute)** tường minh có checkpoint, rollback (đã có `session-checkpoint-hook.sh`).
21. **On‑device / local‑first**: hoàn thiện nhánh Ollama (README nhắc "Ollama model‑id fix") để chạy hoàn toàn offline khi cần chủ quyền dữ liệu (khớp `Sovereign` sensitivity tier trong `route.rs`).
22. **Confidential routing thực thi**: `route.rs` đã định nghĩa `Sensitivity {Public, Internal, Confidential, Sovereign}` — hãy **thực sự chặn** dữ liệu Sovereign không rời máy/không gửi cloud, không chỉ khai báo enum.
23. **Fine‑tune tiếng Việt**: đã có `tools/finetune-vi`, `codexmate-vi-patch` — biến thành lợi thế bản địa hóa (model VN‑tuned cho guardrail/routing).

### 3.4 Trải nghiệm người dùng (UX/DevEx)
24. ⭐ **Streaming UI có trạng thái**: chatbot IO hiện SSE trần — thêm hiển thị token/chi phí real‑time, nút dừng, retry.
25. **Dashboard chi phí & an toàn**: `core/monitor/live-dashboard.js` — trực quan hóa ledger cost + số injection bị chặn + hook health.
26. **Explainability**: khi hook chặn, hiện "vì sao" + cách bypass an toàn (một số hook đã làm tốt — chuẩn hóa toàn bộ).
27. **`yana-ai doctor` mở rộng**: kiểm tra cấu hình worker/GitHub App (CORS, rate‑limit, signature) và cảnh báo cấu hình public không an toàn.
28. **VS Code / IDE panel** hiển thị trạng thái gate theo thời gian thực.
29. **i18n hoàn chỉnh**: site đã đa ngữ (vi/en/ko/zh) — đồng bộ hóa cho cả CLI output và thông báo hook.
30. **Onboarding 1‑click an toàn hơn**: PR của GitHub App nên kèm checklist bảo mật (bật rate‑limit worker, set allowlist).

### 3.5 Hạ tầng, vận hành & cộng đồng
31. **CI security gate**: chạy `scanner/*.yml` (secret/auth/shell/mcp checks) trên chính repo Yana‑AI mỗi PR (dogfooding).
32. **SBOM + supply‑chain**: đã có `sbom-generator.sh`, `supply-chain-guard.sh` — ký release (sigstore/cosign) và publish SBOM.
33. **Rate‑limit & abuse dashboard cho worker** (Cloudflare Analytics + alert).
34. **Chaos/red‑team CI**: bộ tấn công injection/jailbreak tự động chạy định kỳ.
35. **Marketplace skill có kiểm duyệt**: skill bên thứ ba phải qua guardrail/eval trước khi list (site đã có trang marketplace).
36. **Telemetry opt‑in ẩn danh** để cải thiện routing/eval mà vẫn tôn trọng quyền riêng tư.
37. **Versioned policy migration**: config có `version` — thêm công cụ migrate khi đổi schema (đã có `migrate-agent-identity.sh`, mở rộng cho mọi config).

---

## 4. Ưu tiên hành động (đề xuất 30 ngày đầu)

1. **Vá `worker.js`** (rate‑limit + CORS allowlist + lọc role/giới hạn message + generic error) — chặn open‑proxy & injection cơ bản. *(mục 1.1–1.3, 2.3)*
2. **Constant‑time signature + siết scope GitHub App**. *(1.4–1.5)*
3. **Real token metering** đọc `usage` từ API → ledger đúng, bật hard budget cap. *(2.1)*
4. **Unified guardrail** (Rust→WASM) dùng chung input/output cho worker + server. *(2.2, 3.1)*
5. **Provider failover + circuit breaker** cho LLM calls. *(2.3)*
6. Gỡ PII email default khỏi code/tài liệu. *(1.6)*

---

## Phụ lục — Nguồn tham chiếu trong repo
`worker.js` · `github-app/src/index.ts` · `github-app/src/installer.ts` · `tools/yana-web/server.js` · `tools/check-mail.py` · `src/cost.rs` · `src/route.rs` · `.claude/scripts/model-router.sh` · `.claude/hooks/prompt-injection-guard.sh` · `.claude/hooks/guard-destructive.sh` · `.claude/config/budget.json` · `.claude/config/rate-limits.json` · `.gitignore` · `router/model-routing-policy.yml` · `core/sandbox/` · `scanner/*.yml`
