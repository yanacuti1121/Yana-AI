---
allowed-tools: Bash(git:*), Bash(npm:*), Bash(pnpm:*), Bash(npx:*), Read, Write, Edit, Glob, Grep, Task
description: 빌드/테스트/린트를 한 번에 자동 검증합니다.
argument-hint: [--once] [--loop N] [--security] [--coverage] [--extract] [--skip-handoff]
---

# /handoff-verify - 핸드오프 + 자동 검증 통합 (v6)

v5의 `/handoff` + `/clear` + `/verify`를 **하나의 커맨드**로 통합.
핵심 변경: `/clear` 불필요 — Task 도구로 생성한 **서브에이전트가 fresh context**를 자동으로 제공한다.

## v5 대비 변경사항

| v5 | v6 |
|----|-----|
| /handoff → /clear → /verify (3단계, 수동) | /handoff-verify (1단계, 자동) |
| /clear로 컨텍스트 초기화 필요 | 서브에이전트가 fresh context 제공 |
| 부모 컨텍스트 손실 | 부모 컨텍스트 보존 |
| /context-status로 사용량 확인 | 빌트인 /cost 사용 |

## 0단계: 인자 파싱

$ARGUMENTS에서 플래그를 파싱한다.

| 플래그 | 기본값 | 설명 |
|--------|--------|------|
| `--once` | false | 단발 검증 (루프 없음) |
| `--loop N` | 5 | 최대 재시도 횟수 |
| `--security` | false | 보안 리뷰 포함 |
| `--coverage` | false | 테스트 커버리지 분석 모드 |
| `--extract` | false | 에러 추출 모드 |
| `--skip-handoff` | false | handoff.md 생성 건너뛰기 (이미 있을 때) |
| `--effort` | high | 검증 깊이: low / medium / high / max |
| `--only` | all | 특정 단계만: build / test / lint / type |

플래그를 제외한 나머지 텍스트 = 의도 설명(intent).

### effort별 동작 차이

| effort | 코드 리뷰 범위 | thinking 수준 | 자동 수정 범위 | 보안 검토 |
|--------|---------------|--------------|---------------|-----------|
| low | 변경 파일만 빠른 스캔 | 기본 | import/lint만 | 건너뜀 |
| medium | 변경 파일 + 직접 의존성 | think hard | Fixable 전체 | 패턴 매칭만 |
| high | 변경 파일 + 의존성 그래프 | think harder | Fixable 전체 + 리팩토링 제안 | 주요 패턴 검사 |
| max | 전체 프로젝트 영향 분석 | ultrathink | Fixable 전체 + 아키텍처 검토 | security-reviewer 에이전트 |

## 1단계: 환경 수집

다음을 병렬로 수집한다:

1. `git status --short` — 변경 파일 목록
2. `git diff --name-only` — 스테이징 전 변경사항
3. `git log --oneline -10` — 최근 커밋
4. `.claude/handoff.md` 읽기 (존재 시)
5. 프로젝트 문서 읽기 (존재 시): `CLAUDE.md`, `spec.md`, `prompt_plan.md`
6. 프로젝트 타입 감지:
   - `package.json` → Node.js (npm/pnpm/yarn 자동 감지)
   - `go.mod` → Go
   - `Cargo.toml` → Rust
   - `pyproject.toml` / `requirements.txt` → Python
   - `Makefile` → Make 기반

**패키지 매니저 감지 순서:**
1. `pnpm-lock.yaml` 존재 → pnpm
2. `yarn.lock` 존재 → yarn
3. `bun.lockb` 존재 → bun
4. 기본값 → npm

git 레포가 아니면 → "git init 필요" 안내 후 중단.
변경사항 없으면 → "변경사항 없음" 안내 후 중단.

## 2단계: Handoff 문서 자동 생성

> `--skip-handoff` 플래그가 있으면 이 단계를 건너뛴다.
> `.claude/handoff.md`가 이미 있으면 → 기존 내용에 누적 추가 (append).

`.claude/` 디렉토리 없으면 `mkdir -p .claude` 실행.
`.claude/handoff.md`에 다음 템플릿으로 작성한다:

```markdown
# Handoff Document
생성일시: [YYYY-MM-DD HH:MM KST]
effort: [현재 세션에서 사용된 effort level, 없으면 "default"]

## 1. 완료한 작업
- [작업 1: 구현/수정한 기능과 의도]
- [작업 2: 구현/수정한 기능과 의도]

## 2. 변경 파일 요약
| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| src/xxx.ts | 수정 | [변경 내용] |
| src/yyy.ts | 신규 | [파일 목적] |

## 3. 테스트 필요 사항
- [ ] [테스트 항목 1: 시나리오 및 기대 결과]
- [ ] [테스트 항목 2: 엣지 케이스]

## 4. 알려진 이슈 / TODO
- [ ] [이슈 1: 미완성 부분]

## 5. 주의사항
- [다음 세션에서 주의할 점]

## 6. 검증 권장 설정
- effort: [다음 검증에 권장하는 effort level]
- security: [true/false]
- coverage: [true/false]
- only: [특정 검증만 필요하면 명시, 없으면 all]
- loop: [권장 재시도 횟수]
```

### security 판단 기준
- `auth`, `login`, `session`, `token`, `password`, `secret`, `key`, `credential`, `middleware` 포함 파일 변경 시 → true
- `.env`, `.env.*` 관련 변경 시 → true
- 그 외 → false

### effort 권장 기준
- 단순 수정 (1~3 파일, 린트/포맷) → low
- 기능 수정 (4~10 파일) → medium
- 기능 추가/리팩토링 (10+ 파일) → high
- 아키텍처 변경, 보안 관련, DB 스키마 변경 → max

### coverage 판단 기준
- 테스트 파일 (`*.test.*`, `*.spec.*`) 변경 시 → true
- 비즈니스 로직 파일 변경이 있으나 대응 테스트 변경 없을 시 → true
- 그 외 → false

## 3단계: 의도 병합

handoff.md의 검증 권장 설정과 CLI 플래그를 병합한다.
**CLI 플래그가 우선.** handoff.md는 CLI에서 명시하지 않은 항목만 적용.

의도 우선순위:
1. `$ARGUMENTS`에서 파싱한 의도 설명
2. `.claude/handoff.md`의 검증 권장 설정
3. 둘 다 없으면 → 일반 검증 진행

## 4단계: 서브에이전트 검증 실행 (핵심)

> 이것이 v6의 핵심 혁신이다.
> Task 도구로 `verify-agent` 서브에이전트를 생성하여 **fresh context에서 검증**한다.
> 부모 컨텍스트는 보존되면서 /clear 효과를 얻는다.

### 모드 분기

플래그에 따라 서브에이전트에 전달할 모드를 결정한다:

- `--extract` → 에러 추출 모드 (루프 없음)
- `--coverage` → 커버리지 모드 (루프 없음)
- `--security` → security-reviewer 에이전트 호출 포함
- `--once` → 단발 검증 (1회)
- 기본 → 검증 루프 (최대 N회)

### 서브에이전트 호출

Task 도구로 `verify-agent`를 호출한다:

```
Task (subagent_type: general-purpose, model: sonnet)

지시:
1. .claude/handoff.md를 읽어 변경 의도를 파악하라
2. 프로젝트 타입: [감지된 타입]
3. 패키지 매니저: [감지된 PM]
4. 검증 모드: [mode]
5. effort: [level]
6. 최대 재시도: [N]
7. --only: [all 또는 특정 단계]
8. --security: [true/false]

검증 파이프라인을 실행하고 결과를 반환하라.
실패 시 Fixable 에러는 자동 수정을 시도하고 재검증하라.
Non-fixable 에러는 보고만 하라.
```

서브에이전트가 실행하는 검증 파이프라인:

**A. 코드 리뷰 (effort 기반 adaptive thinking)**

effort에 따라 thinking 깊이를 조절한다:
- low: 변경 파일의 명백한 오류만 체크
- medium: think hard — 변경 파일과 직접 참조 파일 분석
- high: think harder — 의존성 그래프 따라 영향 범위 분석
- max: ultrathink — 전체 아키텍처 영향, 엣지 케이스, 성능 영향 분석

리뷰 체크리스트:
- [ ] 변경된 코드가 의도와 일치하는가
- [ ] 뮤테이션 없이 불변성 패턴 사용
- [ ] 에러 핸들링 존재
- [ ] 하드코딩된 비밀값 없음
- [ ] console.log 없음 (디버깅용 제외)
- [ ] 함수 50줄 이하
- [ ] 파일 800줄 이하
- [ ] 입력값 검증 (사용자 입력 경로)

**B. 자동 검증 실행**

프로젝트 타입별 검증 커맨드 (`[pm]` = 감지된 패키지 매니저):

**Node.js:**
```bash
# 1. 타입 체크 (tsconfig.json 존재 시)
[pm] run typecheck || npx tsc --noEmit

# 2. 린트
[pm] run lint || npx eslint .

# 3. 빌드
[pm] run build

# 4. 테스트
[pm] run test || npx vitest run || npx jest
```

**Go:**
```bash
go build ./...
go vet ./...
go test ./...
golangci-lint run  # 설치 시
```

**Rust:**
```bash
cargo check
cargo clippy -- -D warnings
cargo test
```

**Python:**
```bash
python -m py_compile [changed files]
ruff check . || flake8 .
pytest
```

`--only` 플래그가 있으면 해당 단계만 실행:
- `--only build` → 빌드만
- `--only test` → 테스트만
- `--only lint` → 린트만
- `--only type` → 타입 체크만

**C. 결과 표시**

각 검증 단계별 상태:
```
  [attempt 1/5]
  ──────── ────────── ────────
  TypeCheck    PASS
  Lint         FAIL    2 errors (fixable)
  Build        PASS
  Test         PASS    42 passed
  ──────── ────────── ────────
```

상태 분류:
- PASS: 통과
- FAIL: 실패
- SKIP: 해당 없음 (설정 파일 없음 등)
- WARN: 경고 (non-blocking)

**D. 실패 시 자동 수정 (루프 모드)**

Fixable 에러 목록:

| 에러 유형 | 자동 수정 방법 | effort 최소 |
|-----------|--------------|-------------|
| import missing | 올바른 import 문 추가 | low |
| lint format | `eslint --fix` / `prettier --write` | low |
| unused imports | import 문 자동 제거 | low |
| missing semicolons | 자동 추가 | low |
| trailing whitespace | 자동 제거 | low |
| unused variables | 삭제 또는 `_` prefix | medium |
| type simple errors | 타입 추론으로 수정 | medium |
| missing return types | 반환 타입 자동 추가 | medium |
| simple null checks | optional chaining (`?.`) 적용 | medium |

Non-Fixable 에러 (수동 개입 필요):
- 로직 오류
- 아키텍처 문제
- 테스트 실패 (비즈니스 로직)
- 순환 의존성
- 런타임 에러

수정 절차:
1. 에러를 Fixable / Non-Fixable로 분류
2. Fixable 에러 자동 수정 시도 (effort 최소 조건 충족 시)
3. Non-Fixable 에러가 있으면:
   - effort가 high/max: 수정 시도 후 재검증
   - effort가 low/medium: 에러 보고 후 루프 계속
4. 수정 후 다음 attempt로 진행
5. 최대 attempt 도달 시 → 최종 실패 보고

### --extract 모드 (에러 추출)

에러를 파싱하고 분류한다 (루프 없음):

```
════════════════════════════════════════════════════════════════
  Error Extraction (effort: [level])
════════════════════════════════════════════════════════════════

CRITICAL (즉시 수정):
  1. [file:line] [error message]

HIGH (수정 권장):
  1. [file:line] [error message]

MEDIUM (개선 권장):
  1. [file:line] [error message]

LOW (선택적):
  1. [file:line] [error message]

────────────────────────────────────
요약: CRITICAL [N] | HIGH [N] | MEDIUM [N] | LOW [N]
Fixable: [N]/[total] ([%])
────────────────────────────────────

다음 단계:
  - /handoff-verify (자동 수정 포함 루프 검증)
  - /handoff-verify --effort max (최대 깊이 분석)
════════════════════════════════════════════════════════════════
```

severity 분류 기준:
- CRITICAL: 빌드 실패, 런타임 크래시, 보안 취약점
- HIGH: 타입 에러, 테스트 실패
- MEDIUM: 린트 에러, 코드 스타일, unused variables
- LOW: 경고, 최적화 제안, 문서 누락

### --coverage 모드 (커버리지)

커버리지 도구 실행 (루프 없음):
- Node.js: `[pm] run test -- --coverage` 또는 `npx vitest run --coverage`
- Go: `go test -coverprofile=coverage.out ./...`
- Rust: `cargo tarpaulin`
- Python: `pytest --cov`

```
════════════════════════════════════════════════════════════════
  Coverage Analysis (effort: [level])
════════════════════════════════════════════════════════════════

전체 커버리지: [X]% (목표: 80%)

커버리지 부족 파일 (80% 미만):
  File                          Lines    Covered   %
  ─────────────────────────────────────────────────────
  src/api/payment.ts            120      45        37.5%

미커버 주요 라인:
  src/api/payment.ts:45-67    결제 실패 핸들링

테스트 생성 제안:
  1. payment.test.ts - 결제 실패 시나리오 (예상 +15%)

────────────────────────────────────
다음 단계: /handoff-verify --effort high (수정 후 재검증)
════════════════════════════════════════════════════════════════
```

effort에 따른 커버리지 분석 깊이:
- low/medium: 파일별 커버리지 수치만 표시
- high: 미커버 라인 상세 + 테스트 제안
- max: 미커버 라인 상세 + 테스트 코드 자동 생성 제안 + 브랜치 커버리지

## 5단계: 결과 수신 및 처리

서브에이전트의 결과를 수신한다. 부모 컨텍스트에서 처리:

### 통과 시

1. handoff 문서 정리:
```bash
rm .claude/handoff.md  # 존재 시
```

2. v6 표준 푸터 출력:

```
════════════════════════════════════════════════════════════════
  Handoff-Verify Complete (v6)
  attempt [N]/[max] | effort: [level]
════════════════════════════════════════════════════════════════

검증 결과:
  TypeCheck   PASS
  Lint        PASS
  Build       PASS
  Test        PASS (42 passed, 0 failed)

다음 단계:
  1. /commit-push-pr --merge --notify
  2. /sync (커밋 후 문서 동기화 권장)
════════════════════════════════════════════════════════════════
```

### --once 모드 통과 시

```
════════════════════════════════════════════════════════════════
  Handoff-Verify Complete (v6, single run)
  effort: [level]
════════════════════════════════════════════════════════════════

모든 검증 통과.
다음 단계:
  1. /commit-push-pr --merge --notify
  2. /sync (커밋 후 문서 동기화 권장)
════════════════════════════════════════════════════════════════
```

### --once 모드 실패 시

```
════════════════════════════════════════════════════════════════
  Handoff-Verify Incomplete (v6, single run)
  effort: [level]
════════════════════════════════════════════════════════════════

발견된 에러:
  1. [file:line] [error message] (fixable/non-fixable)
  2. [file:line] [error message] (fixable/non-fixable)

권장: /handoff-verify (루프 모드로 자동 수정 시도)
또는: /handoff-verify --extract (에러 분류 상세 확인)
════════════════════════════════════════════════════════════════
```

### Max Retry 실패

```
════════════════════════════════════════════════════════════════
  Handoff-Verify Failed ([N] attempts exhausted)
════════════════════════════════════════════════════════════════

반복 실패 에러:
  1. [file:line] [error message] (attempt 1~[N] 연속 실패)
  2. [file:line] [error message] (attempt [M]부터 발생)

자동 수정 시도 이력:
  attempt 1: [수정 내용] → 실패
  attempt 2: [수정 내용] → 실패
  ...

권장 조치:
  1. /learn --from-error로 교훈 기록
  2. --effort max로 재시도 (현재보다 높은 effort인 경우)
  3. 수동 수정 후 /handoff-verify --skip-handoff
════════════════════════════════════════════════════════════════
```

## 사용 예시

```bash
# 기본 (핸드오프 + 루프 5회 + effort high)
/handoff-verify "결제 로직 리팩토링 검증"

# 단발 검증
/handoff-verify --once "빠른 빌드 확인"

# 최대 깊이 + 보안 포함
/handoff-verify --effort max --security "인증 모듈 변경"

# 에러 추출만
/handoff-verify --extract

# 커버리지 분석
/handoff-verify --coverage

# 루프 3회 + 린트만
/handoff-verify --loop 3 --only lint

# 낮은 effort (빠른 확인)
/handoff-verify --effort low --once

# handoff.md 이미 있을 때 (재검증)
/handoff-verify --skip-handoff

# handoff.md 기반 설정 자동 적용
/handoff-verify
```

## 주의사항

- effort가 max일 때 ultrathink를 사용하므로 토큰 소비가 크다.
- --security는 effort와 무관하게 security-reviewer 에이전트를 호출한다.
- --extract와 --coverage는 루프하지 않는다 (분석 전용 모드).
- 서브에이전트는 Sonnet 모델로 실행되어 비용 효율적이다.
- 부모 컨텍스트가 보존되므로 검증 후 바로 /commit-push-pr 진행 가능.
- handoff.md의 검증 권장 설정은 CLI 플래그보다 낮은 우선순위로 병합된다.
- v5의 /handoff, /verify는 이 커맨드로 대체된다.
