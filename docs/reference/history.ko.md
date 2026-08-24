# 프로젝트 히스토리 — Claude 템플릿에서 Yana 생태계까지

이 프로젝트가 거쳐온 모든 버전/상태의 계보: 시작점이었던 Claude Code 계열, "YAMTAM Engine" 시대, 제품형 `v0.x` 번호 체계로의 리셋, Yana AI로의 리네이밍, 그리고 거기서 뻗어나간 가지들(`yana-rt`, `yana-web`, Desktop, `yana-robot`).

## 검증 상태 — 먼저 읽어주세요

이 문서는 아카이브된 버전 이름과 릴리스 노트를 바탕으로 정리된 것이며, `git log`를 한 줄씩 다시 파헤쳐 재구성한 것이 아닙니다. 여기에 추가하기 전, 핵심 주장들을 이 저장소의 실제 커밋/태그 히스토리와 대조 확인했습니다:

- **사실로 확인됨.** "YAMTAM"은 이 프로젝트의 실제 옛 이름입니다 — 실제 커밋 메시지에서 그대로 발견됩니다 (`docs: clarify YAMTAM scaffold roadmap status`, `feat: import YAMTAM runtime assets`). 전체적인 흐름 — YAMTAM Engine `v1.x` → 제품형 `v0.x` 번호로 리셋 → Yana AI로 리네이밍 — 은 이 저장소의 실제 태그 순서와 일치합니다.
- **수정됨: 실제 속도는 서술보다 훨씬 빨랐습니다.** 아래 I–VI절은 몇 주 또는 몇 달에 걸친 여정처럼 읽힙니다. 하지만 실제 태그 타임스탬프를 보면 첫 커밋부터 `v0.x` 제품 리셋까지 전체 구간이 약 **13일**(2026-05-17 ~ 2026-05-30) 안에 들어갑니다. 각 "시대"는 느리고 신중한 서사가 아니라, 아마도 AI 지원을 받은 매우 빠른 반복 주기로 보는 것이 맞습니다.
- **사소한 날짜 오차.** `v1.0.0` 태그의 실제 커밋 날짜는 2026-07-26(일본 시간)이며, 아래 기재된 27일이 아닙니다 — 시간대 차이로 인한 하루 차이로 보입니다.
- **독립적으로 검증되지 않음.** `v1.3.0`–`v1.3.11`, `v1.3.40`–`v1.3.53`, 제품 `v0.6`–`v0.13`의 기능 단위 상세 내역 — 문서 스스로도 이 버전들이 *존재했다*는 것만 확인했을 뿐, *무엇을 했는지*는 확인하지 못했다고 밝히고 있습니다. 해당 행들은 "이 버전이 존재했다"로 읽어야지, "이 버전이 정확히 이걸 했다"로 읽으면 안 됩니다.
- **이 저장소의 git 히스토리 밖에 있음.** `yana-web`, Chat Terminal, capability-runtime 실험, 로보틱스 분기(XII–XV절)는 별도의 저장소/아티팩트에 존재하며 이 저장소의 `git log`로는 확인도 반박도 할 수 없습니다.

## I. Pre-YAMTAM — Claude Code 계열

| 버전 | 변경 사항 |
|---|---|
| Claude Development Template | 초기 기반: agents, hooks, rules, MCP, PRD/프로젝트 워크플로. |
| GitNexus integration | 코드 인텔리전스/컨텍스트 추가; pre-YAMTAM 계열의 핵심 요소가 됨. |
| claude-code v3.0 | 초기 디버그 규율, 워크플로/가드 기초; 약 69개 파일. |
| v4.0 | 자동화 레이어: Context Synthesizer, BRAIN_DUMP, Auto-QA. |
| v5.0 | spec-driven development로 크게 전환: spec planner → executor → verifier; context monitoring 추가. |
| v6.0 | Tool-attention 레이어; MCP/tool 사용과 "MCP Tax" 컨텍스트 비용 관리. |
| v7.0 | Persistent memory; 코딩 가이드라인/엔지니어링 규칙 추가. |
| v8.0 | Memory architecture가 다층 시스템으로 발전. |
| v9.0 | 품질 관리 에이전트 레이어: prompt-firewall, token-guard, tool-router, config-doctor, agent-gardener 등. |
| v9 GitNexus variants | GitNexus 통합/감사 스냅샷; `gitnexus-v9`, `v9-real` 및 전용 에이전트 팩 포함. |
| v10.0 | 에이전트 수를 늘리는 것보다 신뢰성에 집중: `/resume`, `/route`, `/verify-pack`, memory router, session checkpoint, audit/fix. |
| `gitnexus-v10-audited` | 감사를 마친 v10 스냅샷; YAMTAM ENGINE v1.0의 직접적인 기반이 됨. |
| `claude-code-v1.2-enhanced` | Claude 시대와 YAMTAM 시대 사이의 브랜치; 아직 구체적인 기능이 확인되지 않음. |

**전환점:** `claude-code-v10.0` → `YAMTAM_ENGINE_v1.0_school-stable_from-gitnexus-v10-audited`. 두 아카이브 아티팩트가 동일한 크기/스냅샷 계보를 공유하며, 이 지점이 "Claude Code"에서 "YAMTAM Engine"으로 정체성이 바뀐 시점으로 보입니다.

## II. YAMTAM Genesis — v1.0 → v1.2.9

| 버전 | 기능 |
|---|---|
| YAMTAM ENGINE v1.0 | Claude/GitNexus 시스템을 YAMTAM ENGINE으로 패키징. |
| v1.1 | 아키텍처 개발 지속; 아카이브에 `v1.0_v1.1_plans` 통합본도 존재. |
| v1.2 | 단순한 에이전트 팩을 넘어선 별도의 safety/control 시스템이 형성되기 시작. |
| v1.2.1 | Truthful Cost Guard — 신뢰할 수 있는 비용 추적/표시. |
| v1.2.2 | Budget Mode Switch — 예산 기반 모드 전환. |
| v1.2.3 | Scope Lock — AI가 변경할 수 있는 범위 제한. |
| v1.2.4 | Local Audit Log — 로컬 활동 기록. |
| v1.2.5 | E2E Safety — end-to-end 흐름에 대한 안전성. |
| v1.2.6 | Handoff Mode — 세션/에이전트 간 컨텍스트/작업 인계. |
| v1.2.7 | Replit Incident Defense / Production Protection — 위험한 프로덕션 작업 방지. |
| v1.2.8 | PocketOS Incident Defense / API Destruction Guard — 파괴적 API 작업에 대한 보호 확장. |
| v1.2.8-fixed | v1.2.8 수정/하드닝. |
| v1.2.9 | standalone 전환 전 이 안전성 라운드 마무리. |
| v1.2.9-fixed | Hook Test Suite + Release QA, 이 단계의 마지막 빌드; 옛 문서에 13/13 테스트 통과 기록. |

옛 핸드오버 문서에 이 `1.2.1 → 1.2.9-fixed` 체인이 그대로 기록되어 있으며, 내부 `v10`/`v11`/`v12`는 별개의 번호 체계라는 경고도 함께 있습니다 (`JNMT_YAMTAM_HANDOVER_ALL_IN_ONE_v2.md`).

## III. YAMTAM이 독립 엔진으로 분리

정확한 SemVer 릴리스라기보다는 아키텍처적 상태들입니다:

| 상태 | 내용 |
|---|---|
| repo-scaffold | 이전 프로젝트의 `.claude/`에서 YAMTAM을 분리해 독립 저장소/엔진으로. |
| scaffold update #1 | 로드맵과 standalone 상태 명확화. |
| scaffold update #2 | Agent OS gates, prompts, behavior examples. |
| scaffold metadata | 메타데이터/체인지로그 완성. |
| `yamtam-engine-main` 스냅샷 | standalone 엔진의 연속 스냅샷; 같은 이름이지만 크기가 다른 아카이브가 다수. |

이 시점부터 `core/ gates/ prompts/ docs/ releases/` 형태의 구조가 예전 `.claude/` 구조보다 더 중요해지기 시작했습니다.

## IV. YAMTAM v1.3.x — 폭발적 확장기

버전이 매우 빠르게 진행되고 하나의 SemVer에 여러 리빌드가 있을 수 있어 추적이 가장 어려운 구간입니다.

| 버전 | 확인된 내용 |
|---|---|
| 1.3.0-fixed | Early standalone stabilization. |
| 1.3.1 | standalone 이후 반복. |
| 1.3.2–1.3.10 | 매우 빠른 fixed/stabilization 체인; 버전별로 정확한 기능을 지정할 증거 부족. |
| 1.3.11-fixed | 동일 버전에 여러 빌드/리빌드 존재; 단일 아티팩트로 간주하면 안 됨. |
| 1.3.12 | Superpowers integration. |
| 1.3.13 | TDD workflow. |
| 1.3.14 | Checkpoint + Handoff. |
| 1.3.15-clean | Clean distribution/build. |
| 1.3.16 | Claude Code Harness. |
| 1.3.16-fixed | Harness 릴리스 수정. |
| 1.3.17 | Command Suite; 에이전트 수 급증, 약 19 → 42. |
| 1.3.18 | 대규모 에이전트/스킬 임포트; 약 42 → 83 에이전트. |
| 1.3.19 | Command import/expansion. |
| 1.3.20 | YAMTAM-native governance. |
| 1.3.21 | Conflict Resolution. |
| 1.3.22 | Skill + hook 리뷰/하드닝. |
| 1.3.23-clean | Clean build. |
| 1.3.23-fixed | Fixed build. |
| 1.3.24 | Claude Forge. |
| 1.3.25-clean | Clean distribution. |
| 1.3.25 rebuild | 동일 SemVer 리빌드. |
| 1.3.26 | 확장 지속. |
| 1.3.26-fixed | 복구된 아카이브 중 하나. |
| 1.3.27 | 엔진 개발 지속. |
| 1.3.27-fixed | 복구된 아티팩트. |
| 1.3.28 | 엔진 개발 지속. |
| 1.3.28-fixed | 복구된 아티팩트. |
| 1.3.28 rebuild | 같은 1.3.28 계열이지만 다른 아티팩트. |
| 1.3.29 | 다음 반복. |
| 1.3.30 | 다음 반복. |
| 1.3.31 | 32–56 초고속 릴리스 구간 이전 지점. |
| 1.3.32–1.3.38 | 존재했지만 태그가 나중에 소급 부여됨. |
| 1.3.39 | 1.3.32–1.3.38의 소급 태그. |
| 1.3.40–1.3.48 | 빠른 반복; 증거 부족으로 기능 미지정. |
| 1.3.49 → 1.3.50 | 두 버전 상태가 매우 근접하거나 동일 커밋 컨텍스트 안에 있을 가능성. |
| 1.3.51–1.3.53 | 빠른 진화. |
| 1.3.54 | 에이전틱 AI 스킬 +15개, 총 스킬 수 약 306 → 321. |
| 1.3.55 | 다음 반복. |
| 1.3.56 | 확인된 1.3.x 체인의 끝. |

이후 진행된 보존 정리 커밋에서 오래된 v1.3.x ZIP 아카이브 다수가 삭제되어, Git에는 히스토리가 남아 있지만 아티팩트 자체는 남아 있지 않은 경우가 많습니다 — 이 시기에 "유실된 빌드"가 많이 보이는 가장 큰 이유입니다.

## V. Late YAMTAM

| 버전 | 역할 |
|---|---|
| v1.4.00 | 1.3.x 초고속 릴리스 라인에서 벗어남. |
| v1.4.20 | 히스토리에 여전히 언급되는 릴리스 아티팩트. |
| v1.5.0 | 엔진 진화. |
| v1.6.0 | 주요 반복. |
| v1.6.1 | 패치. |
| v1.7.0 | 주요 반복. |
| v1.7.1 | 패치. |
| v1.7.2 | 패치. |
| v1.7.3 | 후기 1.7 아티팩트. |
| v1.8.0 | 옛 YAMTAM release-pack 번호 체계의 마지막 지점 중 하나. |

> 여기의 YAMTAM `1.4.x`는 8월의 Yana Product `1.4.x`와 **다릅니다** — 완전히 별개의 버전 축입니다.

## VI. 제품화 — v0.x로 리셋

```
YAMTAM Engine v1.x
        │
   Product architecture
        │
        v0.1.x
```

| 버전 | 내용 |
|---|---|
| v0.1–0.2 | 초기 제품화. |
| v0.3 | Policy Kit. |
| v0.4 | Guard Installer. |
| v0.5 | Runtime/task/eval 개발. |
| v0.6–0.13 | 제품 아키텍처가 빠르게 발전; 개별 기능을 확인하려면 추가 커밋 고고학 필요. |
| v0.14.0 | 그래프 관련 개발. |
| v0.14.1 | 약 +423 스킬 임포트. |
| v0.14.2 | 약 +1,048 스킬 임포트. |
| v0.15.0 | 스킬/디자인/헌트 확장; 일부 컴포넌트에서 `2.0.0` 메타데이터 발견 → 버전 드리프트. |
| v0.16.0 | 제품 라인 지속 안정화. |
| v0.17.0 | CLI/제품이 `yamtam-rt v1.0.0`과 연결됨. |
| v0.18.0 | 일시적/미출시 상태; 이후 공식적으로 SKIPPED 처리. |
| v0.22.4 | 버전 흔적은 있지만 product/component/internal 중 어느 축인지 아직 불명확. |
| v0.40.0 | v0.18.0을 대체; 제품 번호 체계가 크게 도약. |

## VII. `yamtam-rt` → `yana-rt`

Rust 런타임이 독립된 버전 축이 된 시점입니다:

| 런타임 | 의미 |
|---|---|
| `yamtam-rt` 0.7 | 초기 Rust 런타임. |
| 0.8 | 런타임 반복. |
| 0.9 | 1.0 이전 런타임. |
| 1.0.0 | 런타임 안정 경계; Product 0.17에서 CLI에 연결됨. |
| → `yana-rt` | YAMTAM → Yana와 함께 리네이밍. |
| `yana-rt` 1.1.x | 독립적인 런타임 개발. |
| 1.3.2 | 런타임 축이 Product와 계속 독립적으로 진행. |
| 1.3.3 | Product 1.0.0과 같은 시기의 런타임 릴리스. |
| 1.4.0 | 새로운 런타임 세대; Product 1.3.2가 런타임 1.4.0을 탑재할 수도 있음. |

이것이 Product 버전으로 런타임 버전을 유추하면 안 되는 구체적인 이유입니다 — 이 저장소가 오늘날 버전 축을 독립적으로 유지하는 방식은 [`VERSIONING.md`](../../VERSIONING.md)를 참고하세요.

## VIII. Proto-Yana / 리네이밍 시대

"Yana"라는 이름은 정식 리네이밍보다 먼저 등장했습니다. 대략 6월 초~중순:

```
yana-router → yana-web → yana-desktop
```

그리고 정식 리네이밍, **2026-06-15**:

```
YAMTAM ENGINE → Yana AI
yamtam-engine → yana-ai
yamtam-rt     → yana-rt
YAMTAM_*      → YANA_*
.yamtam/      → .yana/
bin/yamtam    → bin/yana
```

마이그레이션 자체는 이후 며칠 더 걸렸습니다. identifier/패키지/참조에 여전히 YAMTAM 이름이 남아 있었기 때문입니다. `2026-06-15`는 리네이밍 *이벤트*로, 대략 `2026-06-15`~`2026-06-25`는 마이그레이션 *기간*으로 읽는 것이 맞으며, 한 번에 깔끔하게 전환된 것은 아닙니다.

## IX. 초기 Yana v0.x

| 버전 | 내용 |
|---|---|
| 0.40.0 | YAMTAM과 Yana를 잇는 마지막 다리. |
| 0.41.0–0.41.2 | 초기 Yana 제품 개발. |
| 0.41.3 | 2026-06-13 기준 확인된 제품 상태. |
| 0.42.0 | 바이너리 배포 워크플로가 생기기 전 제품 상태. |
| 0.42.1 | 첫 바이너리 릴리스 — 단순 패치가 아니라 Yana 배포 방식 자체를 바꿈. |
| 0.42.2 | WASM + 퍼블리시 파이프라인. |
| 0.42.3 | 안정화/pre-0.43 상태. |
| 0.43.0 | 온보딩 + 대화 히스토리 시대. |
| 0.43.1 | CI가 Product/Rust/Python을 같은 버전 번호로 강제하고 있는 것을 발견 → 독립 버전 축을 공식화. |
| 0.43.2 | 마지막 pre-1.0 제품 상태 중 하나. |

## X. Yana Stable

| Product | 의미 |
|---|---|
| v1.0.0 — 07/26~27 | 첫 안정된 product-axis 1.0 릴리스. 프로젝트가 탄생한 날짜는 아님. |
| v1.1.0 — 07/30 | 다음 안정 product 릴리스 + Desktop 개발. |
| v1.2.0 | product 축은 **건너뜀**. 1.2 버전은 다른 서페이스/컴포넌트에 등장하지만 정식 Product 릴리스는 아님. |
| v1.3.0 — 08/01 | Desktop/버전 표시 드리프트 이후 product 버전 재동기화. |
| v1.3.1 — 08/02 | 안정화/패치. |
| v1.3.2 — 08/11 | Product 1.3.2, `yana-rt` 1.4.0, Python 0.42.5; safety/SSRF/런타임 작업이 상당히 성숙. |
| v1.4.0 — 08/16 | Capability Runtime, OS/서비스/프로바이더 확장 및 safety 하드닝. |
| v1.4.1 — 08/20 | 1.4.0 이후 패치/안정화. |

## XI. Desktop

Desktop은 별도의 축/컴포넌트로 취급해야 합니다:

| 버전 | 역할 |
|---|---|
| 0.1.0 메타데이터 시대 | 패키지 메타데이터가 한동안 매우 오래된 버전에 고정되어 있었음. |
| 1.1.0 | Desktop 릴리스. |
| 1.2.0 | Desktop/릴리스 서페이스 버전 — Product도 1.2.0을 가졌다고 착각하기 쉬운 이유 중 하나. |
| 1.3.0 | Product 표시 버전 동기화보다 앞서/영향을 준 Desktop 버전. |

## XII. Yana-AI-Chat_Terminal

여러 개의 실제 아카이브 아티팩트이며, 단일 저장소가 아닙니다:

| 아티팩트 | 기능 |
|---|---|
| `Yana-AI-Chat_Teminal-main.zip` | 메인 Chat Terminal 스냅샷. |
| `...main (1).zip` | 같은 브랜치의 또 다른 스냅샷. |
| `Yana-AI-Chat-Terminal-14-UI-Engines.zip` | 14개 UI 엔진을 탐구하는 실험/디자인. |
| `...Compose-ZeroMemory.zip` | "Compose/ZeroMemory" 방향. |
| `...Visible-UI-Patch.zip` | UI 가시성 패치. |

## XIII. Capability Runtime 실험

런타임 아키텍처가 최종 구현으로 바로 도약하지 않았음을 보여줍니다:

```
yana-local-capability-runtime-design-v1
                ↓
              v2
                ↓
yana-runtime-design-v3
                ↓
              v4
                ↓
yana-runtime-foundation-final
                ↓
yana-program-j-capability-runtime-rust
                ↓
        Yana runtime implementation
```

이들은 아키텍처 프로토타입이며, Product 릴리스로 부르면 안 됩니다.

## XIV. `yana-web`

에코시스템의 Web/UI 브랜치입니다. 정식 리네이밍이 끝나기 전에 등장했습니다 — 즉, core가 여전히 YAMTAM으로 불리던 시기에 이미 새 컴포넌트에 "Yana" 정체성이 쓰이고 있었다는 뜻입니다:

```
YAMTAM core
    │
Proto-Yana
    ├── yana-router
    ├── yana-web
    └── yana-desktop
            │
        Yana AI
```

`Yana 1.0 → yana-web`이 아니라, `yana-web`이 Product 1.0 릴리스보다 먼저 존재했습니다.

## XV. 로보틱스

Yana가 소프트웨어 전용 영역을 벗어난 지점입니다:

```
Yana ecosystem
      │
      └── yana-wheelbot
                │
                └────► yana-robot
                         ▲
                         │
                    xiaozhi-esp32
                    external DNA
```

`yana-wheelbot`은 물리 제어/로보틱스 브랜치입니다. `yana-robot`은 여기서 더 나아가 ESP32-S3 펌웨어, 웹/모바일 제어, 로컬 실시간 안전, ToF 센싱, 모터/서보 제어, LED/디스플레이, AI/MCP 시맨틱 제어까지 포함하며, 외부 `xiaozhi-esp32` 프로젝트의 코드 계보를 가져왔기 때문에 순수 Yana-AI 포크가 아닌 하이브리드 후손입니다.

## 전체 계보, 요약

```
Claude Development Template
        ↓
GitNexus
        ↓
claude-code v3
 ↓ v4
 ↓ v5   Spec-driven
 ↓ v6   Tool attention
 ↓ v7   Persistent memory
 ↓ v8   Memory architecture
 ↓ v9   Quality agents
 ↓ v10  Reliability
        ↓
╔══════════════════╗
║ YAMTAM ENGINE 1.0║
╚══════════════════╝
        ↓
1.1 → 1.2
        ↓
1.2.1 Cost Guard
1.2.2 Budget
1.2.3 Scope Lock
1.2.4 Audit
1.2.5 E2E Safety
1.2.6 Handoff
1.2.7 Production Defense
1.2.8 API Defense
1.2.9 Release QA
        ↓
STANDALONE ENGINE
        ↓
1.3.0 → ... → 1.3.56
        ↓
1.4 → 1.5 → 1.6 → 1.7 → 1.8
        ↓
──────── PRODUCT RESET ────────
        ↓
0.1 → ... → 0.17
        │
        ├──── yamtam-rt
        │
        ↓
0.18 [ephemeral/skipped]
        ↓
0.40 → 0.41 → 0.42 → 0.43
        ↓
════ YAMTAM → YANA ════
        ↓
              YANA AI
      ┌─────────┼─────────┐
      ↓         ↓         ↓
   yana-rt    Python    Desktop
      │
      ├───────────────┐
      ↓               ↓
  yana-web       Chat Terminal
                      │
               runtime experiments
             YANA ECOSYSTEM
                    │
                    ↓
              yana-wheelbot
                    ↓
               yana-robot
                    ↑
              xiaozhi-esp32
```

가장 크게 남아 있는 공백은 `v1.3.0`–`1.3.11`, `1.3.40`–`53`, Product `0.6`–`0.13`의 기능 단위 상세 내역입니다 — 이 버전/상태들이 존재했다는 것은 알지만, 커밋 단위 증거가 뒷받침되지 않는 한 여기 있는 어떤 내용도 "이 버전이 X를 추가했다"로 읽으면 안 됩니다.
