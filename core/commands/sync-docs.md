---
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(git:*)
description: prompt_plan.md, spec.md, CLAUDE.md + rules/ 문서 동기화 (v7)
argument-hint: [--check-only]
---

# /sync-docs - 문서 동기화 (v7)

---

## 0단계: 작업 설명 확인

인자로 전달된 작업 설명을 확인한다.
인자가 없으면 최근 커밋 메시지에서 작업 내용을 추론한다.

```bash
git log --oneline -5
```

---

## 1단계: 모드 결정 (CRITICAL)

인자에 `--check-only`가 포함되어 있으면:
- **모든 Write/Edit 도구 호출을 금지한다.**
- 각 단계에서 "변경이 필요한 항목"만 수집한다.
- 9단계의 --check-only 출력 형식을 사용한다.

이 판단은 이후 **모든 단계에 적용**된다. `--check-only` 모드에서는 Read/Glob/Grep/Bash(git)만 사용한다.

---

## 2단계: 변경된 코드 분석

현재 브랜치에서 변경된 파일과 내용을 파악한다.

**diff 범위 자동 감지:**

```bash
# main/master 브랜치와의 분기점 기반 (우선)
BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null)
if [ -n "$BASE" ] && [ "$BASE" != "$(git rev-parse HEAD)" ]; then
  git diff --name-only "$BASE"..HEAD
  git diff --stat "$BASE"..HEAD
else
  # 분기점이 없으면 (main 브랜치 자체) 최근 커밋 기반
  COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo "0")
  if [ "$COMMIT_COUNT" -eq 0 ]; then
    echo "NO_COMMITS"
  elif [ "$COMMIT_COUNT" -ge 3 ]; then
    git diff --name-only HEAD~3..HEAD
    git diff --stat HEAD~3..HEAD
  else
    git diff --name-only HEAD~1..HEAD
    git diff --stat HEAD~1..HEAD
  fi
fi
```

`NO_COMMITS`가 출력되면 동기화할 변경사항이 없으므로 사용자에게 알리고 종료한다.

---

## 충돌 해결 원칙

소스 코드(git diff)가 최우선 진실 소스(source of truth)이다.
문서 간 불일치가 발견되면, 코드 상태를 기준으로 모든 문서를 일관되게 업데이트한다.

---

## 3단계: prompt_plan.md 동기화

Glob 패턴으로 `prompt_plan.md`를 탐색한다:
- `./prompt_plan.md`
- `./.claude/prompt_plan.md`
- `./docs/prompt_plan.md`

업데이트 항목:
- 완료된 작업 항목 체크 (`- [x]`)
- 진행 상황 갱신
- 다음 단계 업데이트

파일이 없으면 건너뛴다.

---

## 4단계: spec.md 동기화

Glob 패턴으로 `spec.md`를 탐색한다:
- `./spec.md`
- `./docs/spec.md`
- `./.claude/spec.md`

업데이트 항목:
- 구현된 기능 반영
- API 변경사항 반영
- 데이터 모델 변경 반영

파일이 없으면 건너뛴다.

---

## 5단계: CLAUDE.md 동기화 (60줄 제한)

Glob 패턴으로 `CLAUDE.md`를 탐색한다:
- `./CLAUDE.md`
- `./.claude/CLAUDE.md`

발견된 경로를 이후 단계에서도 일관되게 사용한다.

### 60줄 제한 규칙 (CRITICAL)

CLAUDE.md는 **60줄 이하**를 유지한다. 이를 초과하면 Claude가 규칙을 무시하기 시작한다.

**CLAUDE.md에 허용되는 내용 (Core 정보만):**
- 프로젝트 개요 (1-3줄)
- 기술 스택 (5-10줄)
- 필수 명령어 (5-10줄)
- 핵심 디렉토리 구조 (5-8줄)
- Git 워크플로우 (3-5줄)
- Rules 참조 안내 (1-2줄)

**CLAUDE.md에 넣으면 안 되는 내용 → rules/로 이동:**
- 코딩 스타일/컨벤션 상세
- 테스트 규칙 상세
- API 설계 규칙
- 보안 체크리스트
- DB 패턴
- 프론트엔드/백엔드 패턴 상세

### 동기화 동작

1. CLAUDE.md를 Read로 읽는다.
2. 줄 수를 카운트한다.
3. 변경된 코드에 따라 업데이트할 항목을 결정한다:
   - 새로운 빌드/실행 명령어 → CLAUDE.md에 추가
   - 파일 구조 변경 → CLAUDE.md에 반영
   - 새로운 의존성 → CLAUDE.md에 기록
   - 코딩 규칙/패턴 상세 → **rules/ 파일로 라우팅** (6단계로)
4. 업데이트 후 **60줄 초과 여부**를 검증한다.
5. 초과하면 상세 내용을 rules/ 파일로 분리한다.

---

## 6단계: rules/ 동기화

`.claude/rules/` 디렉토리의 규칙 파일을 코드 변경에 맞게 동기화한다.

### 6-1. 기존 rules 탐색

```
Glob: .claude/rules/**/*.md
```

기존 rules 파일 목록과 각 파일의 주제를 파악한다.

### 6-2. 변경 내용 → rules 매핑

변경된 코드의 성격에 따라 대상 rules 파일을 결정한다:

| 변경 성격 | 대상 rules 파일 | 동작 |
|----------|----------------|------|
| API 엔드포인트 추가/변경 | `rules/api-design.md` | 엔드포인트 목록 업데이트 |
| DB 스키마/마이그레이션 | `rules/database.md` | 테이블/컬럼 변경 반영 |
| 컴포넌트 패턴 변경 | `rules/frontend.md` | 패턴 규칙 업데이트 |
| 테스트 설정 변경 | `rules/testing.md` | 테스트 규칙 업데이트 |
| 인증/보안 변경 | `rules/security.md` | 보안 규칙 업데이트 |
| 빌드/CI 변경 | `rules/build.md` | 빌드 규칙 업데이트 |

### 6-3. Path-Specific frontmatter 유지

rules 파일에 `paths` frontmatter가 있으면 유지한다. 새 파일 생성 시 적절한 paths를 추가한다:

```markdown
---
paths:
  - "src/api/**/*.ts"
---
```

### 6-4. 판단 기준

- 기존 rules 파일에 해당 주제가 있으면 → **해당 파일 업데이트**
- 해당 주제의 rules 파일이 없으면 → **새 rules 파일 생성하지 않음** (알림만)
- CLAUDE.md에서 분리해야 할 내용이 있으면 → 기존 rules 파일에 이동하거나, 없으면 알림
- **예외:** 7단계에서 CLAUDE.md가 80줄을 초과하여 분리가 필수인 경우, 적절한 이름으로 새 rules 파일을 생성할 수 있다. 이 경우 paths frontmatter를 포함한다.

---

## 7단계: CLAUDE.md 줄 수 검증

5단계에서 발견한 CLAUDE.md 경로를 사용하여 줄 수를 최종 검증한다.

| 줄 수 | 상태 | 동작 |
|-------|------|------|
| ≤ 60 | 정상 | 완료 |
| 61-80 | 경고 | 출력에 경고 표시, 분리 제안 |
| > 80 | 초과 | 상세 내용을 rules/로 분리 실행 (6-4 예외 조항 적용) |

---

## 8단계: 커밋 안내

동기화로 파일이 변경된 경우 다음 액션을 안내한다:
- `--check-only` 모드 → "적용하려면: /sync-docs"
- 변경 있음 → "다음: /quick-commit"
- 변경 없음 → 안내 생략

---

## 9단계: 출력

### 동기화 완료 시

```
════════════════════════════════════════════════════════════════
  Sync Docs v7 (문서 동기화)
════════════════════════════════════════════════════════════════

  작업: [완료한 작업 설명]

  동기화 결과:
    prompt_plan.md  [업데이트 / 없음 / 변경없음]
    spec.md         [업데이트 / 없음 / 변경없음]
    CLAUDE.md       [업데이트 / 없음 / 변경없음] (N줄)
    rules/          [N개 업데이트 / 변경없음]

  변경 요약:
    - [변경 항목 1]
    - [변경 항목 2]

  CLAUDE.md: N줄 (정상 / 경고: 60줄 초과)

  다음: /quick-commit

════════════════════════════════════════════════════════════════
```

### --check-only 모드 출력

```
════════════════════════════════════════════════════════════════
  Sync Docs v7 (check-only)
════════════════════════════════════════════════════════════════

  변경 필요 사항:

  prompt_plan.md:
    - [ ] → [x] Task 3: API 엔드포인트 구현
    - 진행률: 3/7 → 4/7

  spec.md:
    - API 섹션에 POST /api/users 추가 필요

  CLAUDE.md (현재 N줄):
    - 새 명령어 추가 필요: pnpm db:migrate
    - 경고: 80줄 초과 → rules/ 분리 필요
      → 코딩 컨벤션 (15줄) → rules/code-style.md로 이동 제안

  rules/:
    - rules/api-design.md: POST /api/users 엔드포인트 추가 필요
    - rules/database.md: users 테이블 스키마 변경 반영 필요

  적용하려면: /sync-docs (--check-only 없이 실행)

════════════════════════════════════════════════════════════════
```

### 동기화할 문서가 없는 경우

```
════════════════════════════════════════════════════════════════
  Sync Docs v7 (문서 동기화)
════════════════════════════════════════════════════════════════

  동기화 대상 문서를 찾을 수 없습니다.

  확인할 위치:
    - prompt_plan.md (프로젝트 루트, .claude/, docs/)
    - spec.md (프로젝트 루트, docs/, .claude/)
    - CLAUDE.md (프로젝트 루트, .claude/)
    - .claude/rules/*.md

════════════════════════════════════════════════════════════════
```

### CLAUDE.md 초과 분리 시

```
════════════════════════════════════════════════════════════════
  Sync Docs v7 (CLAUDE.md 분리)
════════════════════════════════════════════════════════════════

  CLAUDE.md가 N줄 → 60줄로 축소

  분리된 내용:
    → rules/code-style.md (15줄 이동, 신규 생성)
    → rules/testing.md (12줄 이동, 기존 파일)

  CLAUDE.md: N줄 → 60줄 (정상)

════════════════════════════════════════════════════════════════
```
