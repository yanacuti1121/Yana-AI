<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/yana-banner-dark.svg">
    <img src="docs/yana-banner-light.svg" alt="Yana AI" width="760">
  </picture>
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.vi.md">Tiếng Việt</a> · <a href="README.ko.md"><strong>한국어</strong></a> · <a href="README.zh.md">中文</a>
</p>

<h1 align="center">Yana AI 🐰</h1>

<p align="center">
  <a href="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml"><img src="https://github.com/yanacuti1121/Yana-AI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://crates.io/crates/yana-rt"><img src="https://img.shields.io/crates/v/yana-rt?logo=rust&color=ce422b" alt="yana-rt on crates.io"></a>
  <a href="https://pypi.org/project/yana-ai/"><img src="https://img.shields.io/pypi/v/yana-ai?logo=pypi&color=3775a9" alt="yana-ai on PyPI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-2563eb" alt="Apache 2.0 license"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contributions-welcome-2e8b75" alt="Contributions welcome"></a>
</p>

<p align="center"><em>Vũ Văn Tâm 제작 · 베트남</em></p>

---

## 모델은 제안하고, Yana가 결정하며, 사람이 주도권을 가집니다.

Yana는 AI와 실제 권한 사이에 놓인 컨트롤 플레인입니다. 모델은 무엇을 하고
싶은지 말할 수 있습니다. 그 일이 허용되는지는 Yana가 결정하고, 사람은
언제든 멈출 수 있습니다.

```text
Model        행동을 제안한다
   |
Authority    이 에이전트가 요청할 수 있는가?
   |
Capability   정확히 어떤 권한인가?  (작고 고정된 집합)
   |
Policy       지금 실행해도 되는가?  규칙이 먼저, 그다음 사람
   |
Executor     허용된 작업만 수행한다
```

모든 모델이 같은 경로를 거칩니다. Claude, GPT, Gemini, DeepSeek, 또는 내
컴퓨터에서 돌아가는 모델 모두 마찬가지입니다. 스킬은 에이전트에게 일하는
방법을 가르치고, 행동할 권한을 주는 것은 capability뿐입니다.

## 시스템 구조

| 구성 요소 | 하는 일 | 위치 | 상태 |
| --- | --- | --- | --- |
| **Yana Studio** | 실제 프로젝트에서 AI와 함께 일하기 위한 데스크톱 작업 공간. | [`tools/yana-studio`](tools/yana-studio) | 사용 중 |
| **Runtime (`yana-rt`)** | Rust 엔진: 로컬과 클라우드 모델을 위한 하나의 턴 루프와 하나의 authority 계약, 19개 provider. | [`src/`](src) | 사용 중 |
| **Governance** | Capability manifest, 사람의 승인, 해시 체인 감사 로그, core-lock 무결성 검사, 그리고 모든 세션을 멈출 수 있는 독립 감시자 Giám Thị. | [`core/`](core) | 사용 중 |
| **Harness adapters** | Claude Code, Codex, Cursor, Antigravity를 생성된 hook, rule, gate로 통제합니다. 집행 강도는 호스트마다 다릅니다. | [`adapters/`](adapters) | 사용 중, 호스트별 상이 |
| **지식 계층** | 에이전트에게 일하는 방법을 가르치는 100개 에이전트와 2,026개 스킬. 권한은 부여하지 않습니다. | [`core/agents`](core/agents), [`core/skills`](core/skills) | 사용 중 |
| **Yana OS** | 로컬 관리 계층: 에이전트 신원, 자율 수준, 쿼터, 상태, 격리. | [`src/os`](src/os) | 개발 중 |
| **Yana Wheelbot** | ESP32-S3 기반 로봇 플랫폼, 별도 저장소에 있습니다. | [`yana-wheelbot`](https://github.com/yanacuti1121/yana-wheelbot) | 실험적 |

`사용 중`은 배포되어 실제로 쓰이고 있다는 뜻입니다. `개발 중`은 실제 코드가
있지만 기능이 완성되지 않았다는 뜻입니다. `실험적`은 선택적으로 켜는 기능이며
독립적으로 검증되지 않았다는 뜻입니다.

`yana-rt`는 39개의 서브커맨드를 가지며 Python 의존성이 없습니다. 이 수치는 feature 플래그 뒤에 있는 명령을 포함해 모든 빌드 구성을 소스 기준으로 센 값입니다.

```text
core/
├── hooks/    # 66개 PreToolUse / PostToolUse / Stop hook
├── rules/    # 71개 강제 규칙
├── agents/   # 100개 전문 에이전트
├── skills/   # 2,026개 스킬
└── config/
    └── core-lock.json    # SHA-256 manifest — 287개 핵심 파일 고정
```

## Yana Studio

프로젝트에서 AI와 일할 때 오가야 하는 것들을 하나의 창에 담았습니다.

- **파일과 에디터:** 실제 폴더를 열고, 프로젝트 전체를 검색하고, CodeMirror로 편집합니다. 저장할 때 외부에서 바뀐 내용을 먼저 감지해 덮어쓰지 않습니다.
- **터미널:** 탭으로 나뉜 실제 PTY 세션, 또는 최대 12개의 그리드.
- **Git:** 상태, worktree, diff를 읽기 전용으로 확인합니다.
- **채팅:** `yana-rt`를 통해 스트리밍하며, 로컬 또는 클라우드 모델이 다른 모든 것과 같은 authority 경로를 거칩니다.
- **거버넌스 텔레메트리:** 무엇이 허용되었고, 무엇이 차단되었으며, 그 이유는 무엇인지.

[최신 릴리스](https://github.com/yanacuti1121/Yana-AI/releases/latest) 또는
[yana.vutam.link](https://yana.vutam.link)에서 내려받으세요.

| 플랫폼 | 설치 파일 |
| --- | --- |
| macOS, Apple Silicon | `.dmg` 또는 `.zip` |
| Windows | `.exe`, x64 또는 ARM64 |
| Linux | `.deb` 또는 `.AppImage` |

각 릴리스는 자체 자산 목록을 가지므로 내 플랫폼이 포함되어 있는지 확인하고,
`SHA256SUMS`가 제공되면 대조하세요. macOS 빌드는 ad-hoc 서명이며 Apple의
공증(notarization)을 **받지 않았습니다**(아직 Apple Developer 멤버십이 없음).
그래서 처음 실행할 때 Gatekeeper가 경고합니다.
[docs/MACOS_INSTALL.md](docs/MACOS_INSTALL.md)에 공식적인 두 가지 열기 방법이 있습니다.

## 명령줄

```bash
pip install yana-ai    # Python CLI
yana-ai install        # Yana의 hook과 rule을 내 저장소에 추가
yana-ai doctor .       # 모든 것이 제대로 연결되었는지 확인
cargo install yana-rt  # 네이티브 런타임, Python 불필요
```

Python 3.11+(또는 Rust), Git, 그리고 지원되는 harness 하나가 필요합니다. 모든
명령은 [COMMANDS.md](COMMANDS.md)에 있습니다. Yana는 npm에 배포되지 않습니다.
[VERSIONING.md](VERSIONING.md)를 참고하세요.

## 무엇이 보호하고, 어디까지인가

- **감사 로그:** 해시 체인으로 연결되어 있어 한 줄을 고치거나 지우면 탐지됩니다. 변조를 탐지할 수 있을 뿐, 변조를 원천 차단하지는 않습니다.
- **Core-lock:** SHA-256 manifest가 `core/`의 파일이 바뀌거나, 삭제되거나, 끼워 넣어진 것을 탐지합니다.
- **사람 게이트:** force-push, 배포, 게시, 삭제는 현재 세션에서 확인을 받아야 하며, 이전의 승인은 이어지지 않습니다.
- **Giám Thị:** 선택적으로 켜며, 어떤 AI 세션 밖에서 실행됩니다. 문제를 발견하면 사람이 잠금을 제거할 때까지 이후의 모든 도구 호출을 잠급니다.
- **한계:** `guard-destructive.sh`는 전체 셸 파싱이 아니라 명령 문자열을 매칭하므로, 의도적으로 만든 명령은 통과할 수 있습니다. Rust 런타임 없이 브라우저만으로 배포한 웹은 완전히 통제되지 않습니다. 자세한 내용: [알려진 한계](docs/reference/known-limitations.md).

## 더 보기

[ARCHITECTURE.md](ARCHITECTURE.md) · [PHILOSOPHY.md](PHILOSOPHY.md) · [ROADMAP.md](ROADMAP.md) · [CHANGELOG.md](CHANGELOG.md) · [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [감사의 글](ACKNOWLEDGEMENTS.md) · [계보](docs/history/LINEAGE.md)

한 사람이 만들었습니다. 팀도, 후원도 없습니다: **Vũ Văn Tâm**, 베트남 ·
[yana.vutam.link](https://yana.vutam.link/) · phamlongh230@gmail.com · [Apache 2.0](LICENSE)
