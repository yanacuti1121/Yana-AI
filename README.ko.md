```
$ yana-ai
╭────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│                                                                                                                                            │
│   ██╗   ██╗ █████╗ ███╗   ██╗ █████╗     █████╗ ██╗                                                                                       │
│   ╚██╗ ██╔╝██╔══██╗████╗  ██║██╔══██╗   ██╔══██╗██║                                                                                       │
│    ╚████╔╝ ███████║██╔██╗ ██║███████║   ███████║██║                                                                                       │
│     ╚██╔╝  ██╔══██║██║╚██╗██║██╔══██║   ██╔══██║██║                                                                                       │
│      ██║   ██║  ██║██║ ╚████║██║  ██║   ██║  ██║██║                                                                                       │
│      ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝  ╚═╝╚═╝                                                                                       │
│                                                                                                                                            │
│ v1.0.0 · AI 코딩 에이전트를 위한 안전 방화벽         │ 시작하기 팁                                                                         │
│ 101 agents · 2,025 skills                        │ yana-ai doctor                                                                         │
│ 71 rules · 61 hooks · 113 scripts                │ yana-ai init                                                                           │
│ 170 commands                                     │                                                                                       │
│                                                   │ 새 소식                                                                              │
│                                                   │ v1.0.0 — skill-quality ledger, 하니스 어댑터 15개 → 4개로 축소                        │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

<h1 align="center">Yana AI</h1>

<p align="center">
  <strong>AI 코딩 에이전트와 셸(shell) 사이의 안전 방화벽.</strong>
</p>

<p align="center">
  <em>Vũ Văn Tâm 제작 · 17세 · 베트남</em>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.vi.md">🇻🇳 Tiếng Việt</a> · <strong>🇰🇷 한국어</strong> · <a href="README.zh.md">🇨🇳 中文</a>
</p>

<p align="center">
  <a href="https://github.com/yanacuti1121/yana-ai/actions/workflows/ci.yml">
    <img src="https://github.com/yanacuti1121/yana-ai/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <img src="https://img.shields.io/badge/version-v1.0.0-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-Apache_2.0-blue?style=for-the-badge" />
  <a href="https://www.npmjs.com/package/yana-ai">
    <img src="https://img.shields.io/npm/v/yana-ai?style=for-the-badge&logo=npm&color=cb3837" />
  </a>
  <a href="https://crates.io/crates/yana-rt">
    <img src="https://img.shields.io/crates/v/yana-rt?style=for-the-badge&logo=rust&color=ce422b" />
  </a>
  <a href="https://pypi.org/project/yana-ai/">
    <img src="https://img.shields.io/pypi/v/yana-ai?style=for-the-badge&logo=pypi&color=3775a9" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/🇻🇳_made_in-Vietnam-da251d?style=flat-square" />
</p>

---

에이전트가 위험한 작업을 시도하면 Yana가 가로채고, 이유를 설명하고, 기록합니다. Claude Code, Cursor, Windsurf, Antigravity, Kiro, OpenCode, Zed, Gemini, GitHub Copilot, Aider 등과 함께 작동합니다.

```bash
npm install -g yana-ai && npx yana-ai-install   # 훅 연결 (60초)
```

> **⚠️ 알려진 문제: `yana-rt`가 자기 자신을 재귀 호출하여 CPU 100%로 무한히 도는 경우가 있습니다** — 영향받은 한 기기에서는 강제 종료 전 CPU가 116°C까지 올라갔습니다. 근본 원인: `yana-rt` 진입점 스크립트가 `$PATH`/`which`를 통해 실제 바이너리를 찾는데, 일부 설치 환경에서는 이 조회가 진입점 스크립트 자기 자신을 찾아버려 무한 재귀가 발생합니다. 이는 **현재 배포된 npm 패키지(v0.43.1)**에 영향을 미치며, 2026-07-25까지는 배포된 모든 PyPI 릴리스에도 영향을 미쳤습니다(같은 버그, 다른 래퍼 파일, 수정은 됐지만 이 글을 쓰는 시점까지 PyPI에 재배포되지 않음).
>
> **`cargo install yana-rt`는 영향받지 않습니다** — 컴파일된 Rust 바이너리를 직접 설치하므로 재귀를 일으킬 래퍼 스크립트가 없습니다:
> ```bash
> cargo install yana-rt
> ```
> npm과 PyPI 모두 최신 배포 릴리스에 이 버그를 갖고 있습니다; 수정 사항은 이 저장소에 머지되었지만 npm 배포가 동결되어 있고(위 빠른 설치의 참고 사항 참조 — 이 수정과 무관한, 동일한 npm 계정 수준 문제입니다), 아직 새 PyPI 릴리스로 잘리지도 않았습니다. npm이나 pip로 설치했고 `yana-rt`가 CPU를 폭주시키는 것을 발견했다면, 프로세스를 종료하고, `YANA_RT_BIN`을 설정했다면 해제하고, 이 경고가 릴리스 공지로 사라질 때까지 `yana-rt`를 직접 호출하지 마세요 — 또는 이미 수정 사항이 반영된 `cargo`로 설치하세요.

이제 에이전트에게 나쁜 짓을 시켜보고 지켜보세요.

<p align="center">
  <img src="docs/assets/demo.gif" alt="Yana AI blocking a force-push, an rm -rf, and a disguised python3 -c inline-script destructive command in real time, entirely locally with no LLM call" width="700" />
</p>

아래 모든 예시는 2026-07-04에 `core/hooks/guard-destructive.sh`를 실제로 실행한 결과를 그대로 붙여넣은 것이며, 홍보용 문구가 아닙니다 (이 가드가 아직 잡아내지 못하는 것은 [알려진 한계](docs/reference/known-limitations.md) 참고):

```bash
# Agent tries: git push --force origin main
Blocked: 'git push --force' (any flag spelling) is not allowed. The
orchestrator pushes branches; force-pushing risks overwriting shared history.

# Agent tries: rm -rf /some/path
Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible.
Use targeted 'rm' with explicit paths, or ask the human to confirm first.

# Agent tries: git clean -f
Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked
files. Ask the human to confirm before running this.
```

이것이 전체 핵심입니다: 결정론적(deterministic) 규칙, 로컬 실행, 판단 경로에 LLM 없음, 어떤 데이터도 당신의 컴퓨터를 벗어나지 않습니다.

---

## 문제

AI 코딩 에이전트는 실수를 합니다. 잘못된 디렉토리를 `rm -rf`하고, main에 force push하고, 테스트 결과를 지어냅니다. 알아챘을 때는 이미 피해가 발생한 뒤입니다.

Yana AI는 에이전트와 시스템 사이에 위치합니다: 위험할 수 있는 모든 명령은 실행 전에 결정론적 검사 체인을 거칩니다.

---

## 무엇을 막는가

파괴적인 git 작업, 워크스페이스 밖의 `rm`, 인터넷 콘텐츠를 bash로 파이프하는 행위, 검증되지 않은 패키지 설치를 Rust 런타임(`yana-rt`)이 뒷받침하는 에이전트 훅으로 막습니다.

## 작동 방식

```
Agent가 명령을 실행하려 함
         ↓
Anti-evasion scan      — base64 디코드+실행, 셸 인터프리터로의 파이프 차단
Shell sanitization     — 모든 변수를 quote 처리, 셸 특수문자 제거
Egress / SSRF policy   — 알려진 메타데이터 엔드포인트, 사설 IP 대역 차단
Supply-chain vetting   — 패키지 설치 전 typosquat/CVE 체크리스트
Blast-radius cap       — 파괴적 명령이 건드릴 수 있는 파일/범위 제한
Merkle audit log       — 허용/차단된 모든 행동을 기록, 위변조 감지
Human gate             — 되돌릴 수 없는 작업(push, publish, delete)은 명시적 확인 필요
         ↓
실행 (또는 차단 + 로그)
```

어떤 것이 실제로 연결된 훅이고 어떤 것이 에이전트가 관례적으로 따르는 정책 문서인지는 [알려진 한계](docs/reference/known-limitations.md)에서 코드 자체를 직접 검증한 내용으로 확인하세요.

---

## 빠른 설치

**→ [npm install](https://www.npmjs.com/package/yana-ai)** — `npm install -g yana-ai`

> **참고 (2026-07-26): npm 패키지는 현재 v0.43.1에서 동결되어 있습니다.** 새 버전 배포가 npm 계정 수준의 문제로 막혀 있습니다 — 이쪽 설정 문제가 아님을 확인했습니다(같은 계정의 여러 패키지에서 CI의 OIDC trusted publishing과 브라우저 수동 로그인 양쪽 모두 동일한 403이 재현되며, npm 자체 `access list`는 모든 패키지에 read-write 권한이 있다고 보고합니다). npm 지원팀에 여러 차례 신고했지만 해결되지 않았습니다. 이 문제가 해결될 때까지 최신 버전은 아래 `pip install yana-ai` 또는 `cargo install yana-rt`를 사용하세요.

```bash
# Claude Code 플러그인 — npx yana-ai-install 이 훅을 연결합니다
# (필수: npm v12+ 는 기본적으로 postinstall 스크립트를 더 이상 실행하지 않음)
npm install yana-ai && npx yana-ai-install

# Python CLI
pip install yana-ai

# Rust 런타임 (범위가 제한된 명령에서 최대 ~12배 빠름 — BENCHMARK.md 참고)
cargo install yana-rt
```

```bash
# 모든 것이 제대로 연결되었는지 확인
yana-ai doctor .
```

### 요구 사항

- Node.js 18+ (npm 패키지용)
- Git
- 어떤 AI 코딩 도구든: [Claude Code](https://claude.ai/code), Cursor, Windsurf, Aider 등

### 소스에서 클론하기

```bash
git clone https://github.com/yanacuti1121/yana-ai.git
cd yana-ai
npm install
bash install.sh                 # 훅 + 설정을 프로젝트에 복사
yana-ai doctor                  # 확인
```

---

## 멀티 하니스 지원

Yana AI는 사용하는 도구에 맞춰 적응합니다:

```bash
bash core/scripts/switch-engine.sh cursor      # .cursorrules + 실제 beforeShellExecution 훅
bash core/scripts/switch-engine.sh codex       # AGENTS.md
bash core/scripts/switch-engine.sh antigravity # .agent/rules/yana-ai.md
bash core/scripts/switch-engine.sh status      # 4개 어댑터 전체 확인
```

---

## GitHub Action

모든 PR에서 리포지토리의 AI 에이전트 설정을 스캔합니다: secrets, 권한, 훅 인젝션, MCP 취약점.

```yaml
# .github/workflows/yana-ai-scan.yml
- uses: yanacuti1121/yana-ai/.github/actions/scan@main
  with:
    fail-on: 'high'       # HIGH 또는 CRITICAL 발견 시 CI 실패
    diff-only: 'true'     # PR에서 변경된 파일만 스캔
    comment-on-pr: 'true' # 결과 요약을 PR 코멘트로 게시
```

모든 PR에 코멘트를 게시합니다:

```
🟠 Yana AI Security Scan — HIGH

| Metric  | Value  |
|---------|--------|
| Risk    | HIGH   |
| Score   | 58/100 |
| Findings| 3      |
```

→ [전체 워크플로 템플릿](docs/install/github-action.yml) · [전체 레퍼런스](docs/reference/github-action.md)

---

## Rust 런타임 — `yana-rt`

27개 서브커맨드. Python 의존성 없음.

```bash
yana-ai chat                          # 대화형 채팅 REPL — 클라우드(Anthropic/OpenAI) 또는 로컬(Ollama)
yana-ai audit .                       # 보안 스캔 — secrets, CVE, 공급망 위험
yana-ai graph .                       # 지식 그래프 — 파일 의존성, import 해석
yana-ai vault search Q                # 2,025개 스킬을 키워드로 검색
yana-ai hunt .                        # 보안 패턴 탐지 (OWASP, injection, SSRF)
yana-ai fix .                         # 규칙 위반 자동 수정
yana-ai doctor .                      # 전체 시스템 상태 점검
yana-ai map .                         # blast radius 맵 — 에이전트가 건드릴 수 있는 범위
yana-ai ci                            # 모든 게이트 검사 실행 (CI에서 사용)
yana-ai route classify "fix auth bug" # 작업 분류 → simple/complex/external
yana-ai mission create "add-auth"     # 병렬 에이전트 미션 생성
```

**벤치마크** (2026-07-23 측정, 전체 방법론은 `BENCHMARK.md` 참고):
`doctor`/`ci` 같이 범위가 제한된 명령은 Python보다 약 ~2–12배 빠릅니다
(시작 시간이 지배적); 전체 리포지토리 `scan`은 19,000개 파일 규모에서 ~1.1배로 수렴합니다
(그 규모에서는 시작 시간이 아니라 작업량이 지배적). 이 줄이 예전에 주장했던 `1256배`라는
수치는 이미 한 번 검증되지 않은 것으로 밝혀졌고(2026-05-31, 커밋 `fb6a0cd7`)
관련 없는 README 복원(2026-07-07)으로 다시 들어왔습니다 — 그때나 지금이나
`BENCHMARK.md`의 어떤 측정으로도 재현되지 않습니다.

---

## 버전 관리

Yana AI는 3개의 독립된 레지스트리에 배포되며, 각각 자체 버전 번호를 가집니다 — 의도된 설계이지 혼란이 아닙니다 (Kubernetes나 LLVM처럼: 독립된 컴포넌트, 독립된 릴리스 주기).

| 축 | 버전 | 레지스트리 |
|---|---|---|
| Product (rules/hooks/skills/agents/CLI) | **1.0.0** | [npmjs.com/package/yana-ai](https://www.npmjs.com/package/yana-ai) |
| Rust 런타임 (`yana-rt`) | **1.3.3** | [crates.io/crates/yana-rt](https://crates.io/crates/yana-rt) |
| Python 패키지 | **0.42.3** | [pypi.org/project/yana-ai](https://pypi.org/project/yana-ai/) |

이 저장소에서 3개의 서로 다른 버전 번호를 보게 되더라도(`git tag`, 2026-07-05 축 분리 이전에 작성된 `ROADMAP.md`의 옛 항목, 위 배지 포함) — 정상입니다. 전체 이유는 [VERSIONING.md](VERSIONING.md)에서 확인하세요.

---

## 안전 아키텍처

```
core/
├── hooks/          # 57개 PreToolUse / PostToolUse / Stop 훅
├── rules/          # 71개 시행 규칙 (보안, 정확성, UI, git)
├── scripts/        # safe-run.sh, verify-core-lock.sh, secure-logger.sh
├── gates/          # truth_gate.md, action_gate.md
├── agents/         # 101개 전문 에이전트 정의
├── skills/         # 2,016개 SKILL.md 파일
├── config/
│   ├── core-lock.json    # SHA-256 매니페스트 — 핵심 파일 240개 고정
│   └── skills-lock.json  # 스킬 콘텐츠 해시
└── memory/
    ├── L1_atomic/  # 영구 사실 — 세션 간 유지
    └── L2_session/ # 세션 상태 — 자동 만료
```

핵심 속성, 설명 문서가 아니라 실제 코드로 검증됨:
- **Merkle audit chain** — 모든 행동이 해시 체인 JSONL 항목으로 기록됨; 기존 라인을 변조하면 체인을 다시 계산할 때 감지됨 (`verify-audit-chain.sh`)
- **Core-lock integrity** — SHA-256 매니페스트(`core-lock.json`)가 `core/rules`, `core/hooks`, `core/gates`, `core/scripts`의 drift, 삭제, 검토 안 된 파일 삽입을 감지
- **인프라 변경 전 리뷰** — `core/rules/**`, `core/hooks/**`, `core/gates/**`, `core/agents/**`에 변경이 들어가기 전, 독립적인 리뷰어 에이전트 두 명(security-auditor와 짝을 이루는 리뷰어)이 디스패치됨; 둘 중 하나라도 Safety 수준의 발견 사항이 있으면 사람이 해결할 때까지 변경이 차단됨
- **Human gate** — 되돌릴 수 없는 작업(force-push, publish, deploy, delete)은 이전 승인이 아니라 현재 세션에서의 명시적인 사람 확인이 필요함

---

## 실제로는 이렇게 동작합니다

아래 모든 예시는 2026-07-04에 `core/hooks/guard-destructive.sh`를 실제로 실행한 결과를 그대로 붙여넣은 것이며, 홍보용 문구가 아닙니다. 이 가드가 *아직* 잡아내지 못하는 것은 아래 "알려진 한계"를 참고하세요.

```bash
# Agent tries: git push --force origin main
Blocked: 'git push --force' (any flag spelling) is not allowed. The
orchestrator pushes branches; force-pushing risks overwriting shared history.

# Agent tries: rm -rf /some/path
Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible.
Use targeted 'rm' with explicit paths, or ask the human to confirm first.

# Agent tries: git clean -f
Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked
files. Ask the human to confirm before running this.
```

## 알려진 한계

과장 없이 솔직하게: 훅을 설명하는 문서가 아니라 실제 살아있는 훅에 대해 직접 검증한 내용입니다.

- **`guard-destructive.sh`는 셸 파서가 아니라 명령 문자열 가드입니다.** 공백 기준으로 토큰을 나누고 알려진 위험한 형태(`rm -rf`, `git push --force`, `git clean -f`, `git reset --hard`, main/master로의 직접 push)를 매칭합니다. 2026-07-05 기준(하루 동안 4차례의 적대적 검토)으로 전체 토큰 quote(`"..."`, `'...'`, `$'...'`), 백슬래시 이스케이프, `${IFS}` 스타일 변수 분할을 정규화하고, git/rm 호출 옆의 brace-expansion 형태는 바로 거부합니다 — 하지만 토큰 중간의 quote 조각 연결(공백 없이 한 단어 안에서 따옴표 있는 부분과 없는 부분이 번갈아 나오는 경우, 예: `--forc"e"` — 실제 셸은 이를 `--force`로 해석하지만 이 가드는 그렇지 않음)은 **아직** 처리하지 못합니다. 이를 닫으려면 토큰 비교를 하나 더 추가하는 게 아니라 문자 단위 quote-상태 파서가 필요합니다: 이는 이미 닫혔다고 조용히 주장할 문제가 아니라 장기적인 설계 과제로 남아 있습니다. 의도적으로 만든 명령은 여전히 이 가드를 피해갈 수 있습니다; 일반적으로 명령을 입력하는 에이전트는 잡힙니다.
- **SSRF/메타데이터 엔드포인트 차단과 typosquatting/미검증 패키지 설치 차단은 문서화된 정책일 뿐, 아직 실제 훅으로 연결되어 있지 않습니다.** 이전 버전의 README는 이를 작동하는 예시로 보여줬습니다 — 직접 검증한 결과(2026-07-04, 2026-07-05 재확인) 현재 연결된 `PreToolUse` 훅 중 어느 것도 메타데이터 엔드포인트로의 `curl`, `.env` 파일의 `Read`, typosquat된 패키지의 `npm install`을 실제로 가로채지 않습니다. 이제 작동하는 데모처럼 보여주는 대신 있는 그대로 명시합니다.
- **`core/`와 `.claude/`는 설계상 같은 소스의 두 사본입니다**, 우발적인 중복이 아닙니다. `core/`가 정본이고 `.claude/`는 Claude Code가 런타임에 읽는 것이며, `core/config/core-lock.json`이 둘의 SHA-256 해시를 고정합니다. 중복된 콘텐츠로 보인다면 그것은 의도된 것이지 "정리해야 할" 버그가 아닙니다.
- **macOS는 기본적으로 GNU `timeout`/`gtimeout`을 제공하지 않습니다.** 이것이 항상 존재한다고 가정했던 훅은 영향받는 기기에서 발견되어 수정될 때까지(2026-07-04) 어떤 보호된 훅도 조용히 실행하지 못했습니다. 이제는 조용히 아무것도 하지 않는 대신 타임아웃 상한 없이 실행하도록 우아하게 저하되지만, 이런 유형의 "환경을 가정한" 버그는 이 훅들을 fork하거나 확장할 때 정확히 주의해야 할 부분입니다.

여기에 없는 문제를 발견하셨나요? [이슈를 열어주세요](https://github.com/yanacuti1121/yana-ai/issues). 실제 사례 보고야말로 이런 가드가 더 날카로워지는 방법이지, 해야 할 일에 대한 문서를 더 추가하는 것이 아닙니다.

---

## Yana AI (웹 제품)

**[라이브 →](https://yanai-production.up.railway.app)** · **[데스크톱 다운로드 →](https://yanacuti1121.github.io/Yana-AI/desktop.html)**

Yana는 Yana AI 코어 위에 구축된 첫 번째 인터페이스입니다: 기반 인프라를 전혀 몰라도 누구나 AI와 채팅하고, 프로바이더를 전환하고, 스킬 라우팅을 사용할 수 있는 웹 UI입니다.

```
사용자 → Yana AI → Yana AI Core (Router · 안전 · 컨텍스트) → 모델
```

- 가입 불필요: 자신의 API 키 사용
- 🔐 **암호화된 키 볼트** — 키는 AES-256-GCM으로 저장, 마스터 키는 추출 불가(WebCrypto + IndexedDB), 절대 평문으로 저장되지 않음
- 멀티 프로바이더: Anthropic · Groq · Gemini · OpenAI · DeepSeek · OpenRouter · 9Router · Ollama

**프로바이더 설정**, 자신의 키를 사용하며 키는 로컬에서 암호화됩니다(Yana AI로 전송되지 않음):

| Provider | 유형 | 설정 |
|----------|------|-------|
| **Claude** | Cloud | API key → [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **OpenAI** | Cloud | API key → [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Gemini** | Cloud | API key → [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| **Groq** | Cloud | API key → [console.groq.com/keys](https://console.groq.com/keys) |
| **DeepSeek** | Cloud | API key → [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) |
| **OpenRouter** | Cloud | API key → [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |
| **9Router** | Local | `npm install -g 9router` → `9router` (`localhost:20128`에서 실행) |
| **Ollama** | Local | [ollama.com/download](https://ollama.com/download) → `ollama serve` → `ollama pull llama3.2` |

- 📊 **100% 실제 데이터** — 실시간 프로바이더 통계, L1 메모리 가든, audit-log 상태 패널; 데모 수치 없음
- 스킬 라우팅 내장, 자연스럽게 입력하면 Yana AI가 올바른 에이전트를 디스패치
- **코딩 외 사용 사례:** 학습(소크라테스식 학습 도우미), 일상 업무(요약 / 계획 / 초안 작성)
- SSE 스트리밍, 모바일 친화적 · **[Electron 데스크톱 앱](https://yanacuti1121.github.io/Yana-AI/desktop.html)** — macOS, Windows, Linux

Yana AI가 전력망이라면, Yana는 거기에 연결된 첫 번째 건물입니다.

---

## 한 사람이 만들었습니다

한 사람. 팀 없음. 투자 없음.

- 훅 아키텍처, 안전 게이트, Python CLI
- Rust 런타임(`yana-rt`), 101개 에이전트, 2,025개 스킬, 멀티 하니스 지원
- 4개 하니스 어댑터 (Claude Code, Cursor, Codex, Antigravity)

2,025개의 스킬은 프론트엔드, 백엔드, AI/LLM, 보안, Kubernetes, WebAssembly, DevOps, 데이터베이스, 테스팅 등을 다룹니다. 코딩 외 사용 사례를 위한 두 개의 에이전트 페르소나: 학습(`hoc-tap`)과 일상 생산성(`daily-assistant`).

---

## 리포지토리에 Yana AI 추가하기

**정적 배지**, README에 붙여넣기:

```markdown
[![Protected by Yana AI](https://img.shields.io/badge/protected%20by-Yana AI%20ENGINE-ff6b35?style=for-the-badge)](https://github.com/yanacuti1121/yana-ai)
```

**동적 감사 배지**, 실시간 보안 점수 표시:

```bash
yana-ai badge .           # 현재 점수로 배지 마크다운 출력
yana-ai badge . --json    # 기계가 읽을 수 있는 출력
```

**GitHub Action**, 모든 PR을 자동으로 스캔:

```yaml
- uses: yanacuti1121/yana-ai/.github/actions/scan@main
  with:
    fail-on: 'high'
```

→ [전체 워크플로 템플릿](docs/install/github-action.yml)

---

## Yana 작업 라우터

모든 작업은 실행 전에 분류됩니다: 인라인으로 처리할지 에이전트를 디스패치할지 더 이상 추측할 필요가 없습니다.

```bash
yana-ai route classify "implement JWT refresh token"
# → { "route": "complex", "gate": "harness", "confidence": 0.36,
#     "suggested_agents": ["security-engineer", "backend-developer"] }

yana-ai route classify "xem git log 10 commit"
# → { "route": "simple", "gate": "auto", "confidence": 0.43 }

yana-ai route classify "deploy to production"
# → { "route": "external", "gate": "confirm", "confidence": 0.30 }
```

다섯 가지 경로:
- **simple** → Yana가 직접 처리 (읽기 전용, 에이전트 불필요)
- **skill** → 2,016개 항목 인덱스와 매칭, 정확한 스킬 에이전트 디스패치
- **learn** → `hoc-tap`(소크라테스식 학습 도우미)로 라우팅 (영어/베트남어로 "learn", "explain", "why" 등에서 트리거)
- **daily** → `daily-assistant`로 라우팅, 요약 / 계획 / 초안 작성 (영어/베트남어로 "summarize", "write an email", "make a plan" 등에서 트리거)
- **complex** → 범위가 지정된 브리프와 함께 전문 에이전트(들) 디스패치
- **external** → 중단하고 진행 전 사람에게 확인

도메인 인식 에이전트 선택: 인증 작업 → `security-engineer`, 데이터베이스 → `database-expert`, UI → `frontend-developer + ui-ux-designer`.

---

## 미션 디스패처

의존성 해결을 갖춘 웨이브 기반 병렬 오케스트레이션, Rust로 작성, Python 없음.

```bash
# 1. 미션 생성
MID=$(yana-ai mission create "implement-auth" | awk '/id:/{print $2}')

# 2. 의존성과 함께 작업 선언
yana-ai mission task $MID "design-schema"   --agent database-expert --produces schema.sql
yana-ai mission task $MID "implement-auth"  --agent backend-developer \
  --consumes schema.sql --produces src/auth.ts
yana-ai mission task $MID "write-tests"     --agent test-engineer \
  --consumes src/auth.ts --produces tests/auth.test.ts

# 3. 웨이브 1 디스패치 — 의존성이 충족된 작업만
yana-ai mission dispatch $MID --max-parallel 3
# → 준비된 각 에이전트를 위한 JSON 브리프

# 4. 완료 표시, 다음 웨이브 디스패치
yana-ai mission done $MID "design-schema" --evidence schema.sql
yana-ai mission dispatch $MID  # → 웨이브 2 잠금 해제

# 멈춘 작업 취소 / 재시도
yana-ai mission cancel $MID "implement-auth"
yana-ai mission retry  $MID "write-tests"
```

디스패치 시 작업은 **Running**으로 표시됨: `dispatch`를 다시 실행해도 같은 작업이 중복 디스패치되지 않습니다.

---

## 멀티 에이전트 런처

강력한 제한과 킬 스위치로 여러 에이전트를 병렬 실행:

```bash
# 에이전트 3개 실행, 최대 3개까지 동시 실행
bash core/scripts/multi-agent-launch.sh start \
  --agents "scanner,auditor,qa-team" \
  --concurrency 3

# 실시간 상태
bash core/scripts/multi-agent-launch.sh status

# 특정 에이전트 하나 중지
bash core/scripts/multi-agent-launch.sh kill scanner

# 킬 스위치 — 즉시 모두 중지
bash core/scripts/multi-agent-launch.sh kill all

# 에이전트 로그 확인
bash core/scripts/multi-agent-launch.sh log auditor
```

또는 작업 목록 파일로 실행:
```bash
# tasks.txt — 한 줄에 작업 하나: agent_name:작업 설명
echo "scanner:scan the whole repo
auditor:check the hooks
qa-team:run the test suite" > tasks.txt

bash core/scripts/multi-agent-launch.sh start --tasks-file tasks.txt --concurrency 4
```

`status`는 6가지 상태를 보여줍니다: `working`(살아있고 로그가 최근에 갱신됨), `blocked`(살아있지만 로그가 `YANA_AGENT_STALE_SECONDS`초, 기본값 30초 동안 변경되지 않아 멈췄을 수 있음), `done`(0으로 종료), `failed`(0이 아닌 값으로 종료), `unknown`(프로세스는 사라졌지만 자체 종료 코드를 기록한 적이 없음, 예: SIGKILL 이후), `killed`(`kill`로 중지됨).

더 자세한 내용과 출력 예시는 [전체 CLI 레퍼런스](docs/reference/cli-reference.md)를 참고하세요.

---

## 연락처

**Vũ Văn Tâm** · 베트남 · 17세

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [yanacuti1121.github.io/Yana-AI](https://yanacuti1121.github.io/Yana-AI/) |
| GitHub | [yanacuti1121/Yana-AI](https://github.com/yanacuti1121/Yana-AI) |
| Yana | [yanai-production.up.railway.app](https://yanai-production.up.railway.app) |

---

## English · 🇻🇳 Tiếng Việt · 🇨🇳 中文

이 문서의 전체 번역본: **[README.md](README.md)** (English) · **[README.vi.md](README.vi.md)** (Tiếng Việt) · **[README.zh.md](README.zh.md)** (中文)

---

## 감사의 말

Yana AI는 오픈소스 커뮤니티의 아이디어, 패턴, 도구를 기반으로 만들어졌으며, Apache 2.0, MIT 및 기타 permissive 라이선스로 배포된 프로젝트들을 포함합니다. 모든 서드파티 소스는 해당 라이선스를 준수하여 사용됩니다. 이 프로젝트는 어떤 개인이나 조직의 지적 재산도 복제, 왜곡, 침해할 의도가 없습니다. 특정 프로젝트가 설계 결정에 직접적인 영향을 준 경우, 관련 소스 파일과 규칙 문서에 그 출처를 명시합니다.
