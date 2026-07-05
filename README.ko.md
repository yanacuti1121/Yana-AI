<h1 align="center">Yana AI</h1>

<p align="center">
  <strong>AI 코딩 에이전트와 셸 사이의 안전 방화벽.</strong>
</p>

<p align="center">
  <em>제작: Vũ Văn Tâm · 17세 · 베트남</em>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.vi.md">🇻🇳 Tiếng Việt</a> · <strong>🇰🇷 한국어</strong> · <a href="README.zh.md">🇨🇳 中文</a>
</p>

<p align="center">
  <a href="https://github.com/yanacuti1121/yana-ai/actions/workflows/ci.yml">
    <img src="https://github.com/yanacuti1121/yana-ai/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <img src="https://img.shields.io/badge/version-v0.43.0-orange?style=for-the-badge" />
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

에이전트가 위험한 작업을 시도하면 Yana가 가로채고, 이유를 설명하고, 기록합니다. Claude Code, Cursor, Windsurf, Antigravity, Kiro, OpenCode, Zed, Gemini, GitHub Copilot, Aider 등과 함께 작동합니다.

```bash
npm install -g yana-ai && npx yana-ai-install   # 훅 연결 (60초)
```

에이전트에게 위험한 명령을 시켜보고 결과를 확인하세요. 아래 예시는 모두 2026-07-04에 실제로 실행한 `core/hooks/guard-destructive.sh`의 결과를 그대로 복사한 것이며, 홍보용 예시가 아닙니다 (이 가드가 아직 잡아내지 못하는 부분은 [Known Limitations](docs/reference/known-limitations.md) 참고):

```bash
# 에이전트 시도: git push --force origin main
Blocked: 'git push --force' (any flag spelling) is not allowed. The
orchestrator pushes branches; force-pushing risks overwriting shared history.

# 에이전트 시도: rm -rf /some/path
Blocked: 'rm -rf' (recursive + force, any flag spelling) is irreversible.
Use targeted 'rm' with explicit paths, or ask the human to confirm first.

# 에이전트 시도: git clean -f
Blocked: 'git clean -f' (any flag spelling) permanently deletes untracked
files. Ask the human to confirm before running this.
```

이것이 전부입니다. 결정론적 규칙, 완전히 로컬에서 실행, 의사결정 경로에 LLM 없음, 어떤 데이터도 사용자의 컴퓨터를 벗어나지 않습니다.

## 무엇을 잡아내는가

파괴적인 git 작업, 워크스페이스 밖의 `rm`, 인터넷 스크립트를 bash로 파이프하는 행위, 검증되지 않은 패키지 설치까지, Rust 런타임(`yana-rt`)이 뒷받침하는 55개의 에이전트 훅으로 차단합니다. 내부적으로는 101개의 전문 에이전트, 1,989개의 스킬, 70개의 시행 규칙이 있으며 CI에서 826가지 방식으로 검사됩니다. 게이트별 전체 구조는 [아키텍처 문서](docs/reference/architecture.md)를 참고하세요.

## 정상 작동 확인하기

```bash
yana-ai doctor .      # 훅 연결, 설정 무결성, 게이트 상태 확인
yana-ai audit .       # 저장소의 에이전트 설정에서 위험 요소 스캔
```

## 방화벽 그 너머

이 엔진은 [작업 라우터, 미션 디스패처, 멀티 에이전트 런처가 포함된 CLI](docs/reference/cli-reference.md), 모든 PR을 스캔하는 [GitHub Action](docs/reference/github-action.md), 그리고 같은 코어 위에 만들어진 채팅 UI인 [Yana](docs/reference/yana-web.md)도 함께 제공합니다.

**→ [전체 문서 및 데모](https://yanacuti1121.github.io/Yana-AI/)** · [Architecture](ARCHITECTURE.md) · [Vision](VISION.md) · [Roadmap](ROADMAP.md) · [Versioning](VERSIONING.md)

## 솔직한 한계

규칙은 결정론적 패턴입니다. 알려진 위험 형태는 잡아내지만 새로운 유형의 공격은 잡아내지 못합니다. 어떤 부분이 문서상의 정책이고 어떤 부분이 실제로 작동하는지에 대한 전체 내용은 [Known Limitations](docs/reference/known-limitations.md)에 있습니다. 게이트가 너무 많이 또는 너무 적게 차단한다면 [이슈를 열어주세요](https://github.com/yanacuti1121/yana-ai/issues). 실제 사용 후기가 게이트를 더 정교하게 만드는 방법입니다.

---

**Vũ Văn Tâm** · 베트남 · 17세

| | |
|---|---|
| Email | phamlongh230@gmail.com |
| Website | [yanacuti1121.github.io/Yana-AI](https://yanacuti1121.github.io/Yana-AI/) |
| GitHub | [yanacuti1121/Yana-AI](https://github.com/yanacuti1121/Yana-AI) |
| Yana | [yanai-production.up.railway.app](https://yanai-production.up.railway.app) |

Apache-2.0. 이 프로젝트는 Apache 2.0, MIT 및 기타 관대한 라이선스로 배포된 프로젝트를 포함하여 오픈소스 커뮤니티의 아이디어, 패턴, 도구를 기반으로 만들어졌으며, 모든 요소는 각 라이선스에 맞게 사용되었습니다. 설계 결정에 직접적인 영향을 준 프로젝트는 관련 소스 파일과 규칙 문서에 명시되어 있습니다.
