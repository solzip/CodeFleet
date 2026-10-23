# CodeFleet

**Autonomous Execution. Controlled Process. Verified Results.**

CodeFleet은 **기존 Codex CLI와 Claude Code 안에서 사용하는 AI 개발 오케스트레이션 확장 도구**입니다. Host의 인증·모델·세션·도구를 활용하면서 자연어 목표를 Task와 Workflow/DAG로 정리하고, 역할·정책·승인·복구·독립 검증을 관리합니다.

기본 계획·분석에는 **Node.js와 Git, 사용하는 Host**가 필요합니다. Docker·WSL·별도 Linux 계정·직접 모델 API Key는 기본 설치 요건이 아닙니다. Docker는 기존 Alpha의 보호된 검증 Backend로 유지합니다.

Host-Native Core는 main에 통합되어 오프라인 회귀 검증을 거쳤습니다. **실제 Host 세션의 수용 상태는 `HOST_LIVE_NOT_VERIFIED`입니다.** 설치·계획 경로와 보호 실행 경로의 준비 상태를 구분합니다.

[Host 설치·사용](docs/product-completion/host-native-guide.md) · [Core와 검증 Backend](docs/product-completion/host-core-guide.md) · [문서 색인](docs/INDEX.md) · [English archive](README.en.md)

## 해결하려는 문제

AI가 코드를 작성하는 것과 합의한 범위 안에서 작업을 끝내고 검증하는 것은 다릅니다. CodeFleet은 목표·변경 범위·완료 기준을 계약으로 고정하고, 진행 가능한 작업과 아직 검증되지 않은 항목을 드러냅니다.

**AI의 자기 보고는 독립 검증 증거가 아닙니다.** “테스트가 통과했다”는 응답만으로 승인이나 완료 상태를 만들 수 없습니다. 실행 권한은 Policy·Capability·승인으로 제한하고, 완료 여부는 계약과 실제 증거를 대조하는 Judge가 판단합니다.

## 주요 기능

| 기능 | 현재 제공하는 범위 |
| --- | --- |
| 목표와 Task | 자연어 목표 접수, 구조화된 Draft, 파일·테스트·기준 검토, 기존 Contract Validator 검사 |
| Workflow/DAG | 작업 분해, 의존 관계, 조회, 실행 가능성 설명, 승인 요청 |
| 역할과 협업 | Planner·Architect·Executor·Reviewer 역할, 단일 Agent 기본, 기존 Hybrid Scheduler의 제한된 병렬 후보 검증 |
| 실행 제어 | Policy·Capability·승인 Revision, Lease, 재시도 예산, 취소·복구·중복 요청 처리 |
| 검증 | Local / Container Backend, 계약·후보 Tree에 결합된 Evidence, 독립 Judge |
| Host 연동 | Codex·Claude 프로젝트 Skill 설치와 로컬 준비 경로. 실제 Live 호출과 자동 Host Agent 위임은 미검증 |

일반 목표를 접수할 수 있지만 실행 가능한 계약은 현재의 **제한된 Node·Java 수정 범위**를 따릅니다. 지원하지 않는 목표는 `NEEDS_INPUT` 또는 `CAPABILITY_GAP`으로 남습니다. 역할 이름이 있다는 사실은 여러 독립 Agent가 실제 실행됐다는 증거가 아닙니다.

## 작동 원리

```text
Host에서 목표 분석 → Task Draft → Validator → Workflow/DAG
 → 정책·Capability 확인 → 승인 요청 → 허용된 실행 경로
 → 검증 Backend → Evidence → Judge
```

Draft 작성과 DAG 준비는 실행 승인이 아닙니다. 필요한 Capability가 없는 WorkItem은 차단되고 후속 의존 작업은 기다립니다. 독립적으로 실행 가능한 작업은 계속 진행할 수 있지만 필수 검증이 남으면 전체 Workflow를 완료하지 않습니다.

## 기본 설치

Node.js **24.14.1 이상**, Git, 기존 Codex CLI 또는 Claude Code를 준비합니다. 아래는 소스 checkout 기준이며 npm 레지스트리 배포를 가정하지 않습니다. 런타임 의존성 설치를 위한 `npm install`은 필요하지 않습니다.

```sh
git clone https://github.com/solzip/CodeFleet.git
cd CodeFleet
node --version
node src/alpha/cli.mjs host codex doctor
```

신뢰할 수 있는 checkout에서 사용할 프로젝트 경로를 지정합니다. `PROJECT`는 이미 존재하는 프로젝트 디렉터리로 바꾸고 사용하는 Host의 설치 명령을 선택하세요.

```text
node scripts/host-install.mjs install codex PROJECT
node scripts/host-install.mjs install claude PROJECT
node scripts/host-install.mjs status codex PROJECT
```

| Host | 설치 위치 | 세션에서 호출 |
| --- | --- | --- |
| Codex | `PROJECT/.agents/skills/codefleet/SKILL.md` | `$codefleet` |
| Claude Code | `PROJECT/.claude/skills/codefleet/SKILL.md` | `/codefleet` |

설치기는 프로젝트 내부에 Skill·런타임 snapshot·라이선스를 추가합니다. 전역 설정을 변경하지 않으며 기존 설치를 덮어쓰지 않습니다. 필요시 Host 세션을 다시 열어 Skill을 발견하게 하세요. 발견과 실제 모델을 통한 Skill 수행은 별개의 검증입니다.

설치 파일을 검토하고 프로젝트의 추적·제외 정책을 정한 뒤 깨끗한 Git 기준선을 준비하세요. 계획 대상 저장소에는 기존 HEAD가 필요합니다. 상태 DB와 응답 JSON은 대상 저장소 밖에 둡니다. 인증정보를 복사하지 않습니다.

Windows Fixture는 LF 줄바꿈으로 준비하세요. CodeFleet은 Git을 `core.autocrlf=false`로 관측하므로 일반 `git status`가 깨끗해도 줄바꿈 차이로 기준선 검사가 차단될 수 있습니다. 정책을 우회하지 말고 Fixture의 줄바꿈과 기준선을 확인합니다.

관리 명령은 `status`, `disable`, `enable`, `remove`이며 두 Host 모두 지원합니다. 수정된 설치 파일은 자동 삭제하지 않습니다. 업데이트는 기존 설치를 검토한 뒤 재설치하며 snapshot은 자동 갱신되지 않습니다.

## Quick Start: 먼저 계획만 만들기

공개 가능한 작은 Fixture 프로젝트의 새 Host 세션에서 `$codefleet` 또는 `/codefleet`을 호출하고 다음과 같이 요청합니다.

```text
중복 이벤트가 두 번 처리되는 원인을 분석해 주세요.
파일을 수정하거나 명령으로 테스트를 실행하지 말고,
Task Draft와 Workflow/DAG를 작성한 뒤 미검증 항목을 표시해 주세요.
```

이 예시는 첫 Live 수용 시나리오이며 실제 성공 기록이 아닙니다. Host 도구 권한과 허용된 상태 기록 경로를 먼저 정하세요. Skill의 자연어 지침 자체는 보안 Sandbox가 아닙니다.

모델 호출 없이 준비 경로를 직접 확인할 수도 있습니다. 아래 명령은 신뢰할 수 있는 CodeFleet checkout에서 실행합니다. `STATE`는 대상 저장소 밖의 준비 상태 디렉터리, `REPO`는 깨끗한 Fixture Git 저장소, `TASK`는 `plan` 결과의 taskId로 바꾸세요. 파일 경로와 기준은 실제 Fixture에 맞게 검토합니다.

```text
node src/alpha/cli.mjs --state STATE host codex plan "Fix duplicate event handling" REPO
node src/alpha/cli.mjs --state STATE host codex status TASK
node src/alpha/cli.mjs --state STATE host codex review TASK --files src/events.js --tests test/events.test.js --criterion "Duplicate event is handled once"
node src/alpha/cli.mjs --state STATE host codex prepare TASK
node src/alpha/cli.mjs --state STATE host codex workflow TASK
node src/alpha/cli.mjs --state STATE host codex explain TASK
node src/alpha/cli.mjs --state STATE host codex approval-request TASK
```

Claude에는 `codex` 대신 `claude`를 사용합니다. 위 준비 명령은 모델을 호출하거나 소스를 수정하지 않으며 `STATE`에 준비 상태를 기록합니다. `plan`은 입력 보완이 필요할 때, `prepare`와 `approval-request`는 승인 대기 상태에서 exit 2를 반환할 수 있습니다. 이는 검증된 완료가 아닙니다.

Host가 작성한 의미 기반 Draft는 `host codex draft TASK proposal.json`으로 제출합니다. 필수 schema·revision·base·정확한 파일 인용은 [Draft 계약 안내](docs/product-completion/host-core-guide.md)에 있습니다. 임의의 승인·Evidence 필드를 제출할 수 없습니다.

## Skills와 Single-Agent / Hybrid

- **일반 `codefleet`**: Docker 없는 계획·분석·Draft·DAG 조회와 승인 요청의 기본 경로입니다.
- **엄격한 H6 `codefleet-plan`**: 별도의 격리 프로필입니다. 일반 Skill과 혼동하지 마세요. [H6 구현과 자원 검증](docs/runs/2026-10-21/h6-uid-resource-recovery.md)을 참고하세요.
- **Single-Agent / Hybrid**: 기본은 하나의 Host Agent가 역할을 나눠 추론하는 방식입니다. Hybrid는 계약에 명시된 WorkItem·의존성·예산에 따라 제한된 병렬 실행을 관리합니다. [오케스트레이션 안내](docs/product-completion/orchestration-guide.md)에 세부 계약이 있습니다.

현재 공개 Host 경로의 `requests`·`submit`·`run`·`resume`은 보호 실행 게이트에 의해 차단됩니다. 내부 오프라인 Fixture에서 검증한 H4 Linux IPC 경로를 일반 사용자 Live 실행 지원으로 해석하지 마세요. [Host 설치·실행 경계](docs/product-completion/host-native-guide.md)를 따르며 내부 모듈이나 Legacy 명령으로 우회하지 않습니다.

## Verification Backend와 Evidence

| Backend | 용도와 보장 | 한계 |
| --- | --- | --- |
| Local Verification | 명시적으로 신뢰한 정확한 명령·인자·snapshot의 실행 결과 수집 | 동일 사용자 권한의 실행. OS 격리·네트워크 차단·보호된 독립 검증을 보장하지 않음 |
| Container Verification | 기존 Alpha Docker Harness, 고정 이미지·보호 테스트 입력·네트워크 제한·자원 제한 | Docker 필요. 검증된 범위와 신뢰 경계 안에서만 보장하며 임의의 적대적 코드를 모두 안전하게 실행한다는 뜻이 아님 |
| Host Sandbox | 플랫폼·도구별 보안 검증이 필요한 확장 지점 | 현재 `NOT_VERIFIED`, 활성화되지 않음 |

저장소의 테스트·빌드도 부작용을 일으킬 수 있습니다. 명령 이름만 보고 Local 실행을 안전하다고 판단하지 않습니다. Container가 필요한 계약에서 Docker가 없으면 해당 검증을 차단하며 Local로 자동 대체하지 않습니다.

Evidence는 Backend 이름뿐 아니라 실행 권한, 격리 Capability, 검증자 독립성, 무결성, Contract Hash, Candidate Tree Hash, 필수 게이트 결과를 구분합니다. `PROVIDER_REPORTED_ONLY`는 AI의 보고, `LOCAL_EXECUTED`는 로컬 관측, 기존 `HARNESS_EXECUTED`는 보호된 Harness 실행 의미를 유지합니다. **Local 성공은 Protected VERIFIED로 승격되지 않습니다.**

보호된 Judge는 실제 실패 기준선과 후보 테스트, 일치하는 테스트 식별자, 후보·산출물 무결성 및 모든 필수 게이트를 요구합니다. 누락·실패·변조된 증거를 AI의 설명으로 대체할 수 없습니다. 자세한 보장과 한계는 [Core 안내](docs/product-completion/host-core-guide.md), 기존 Node·[Java Gradle/Maven 안내](docs/product-completion/alpha-quickstart.md#java-gradlemaven)를 참고하세요.

## 개발과 테스트

```sh
npm run test:host-core
npm run test:host
npm run check:links
npm run check:citations
npm run check:facts
npm run alpha:package-smoke
```

Host Core 테스트에는 Docker 없는 실제 준비 경로·Local 실행과 명시적인 Fake Backend 반증 시험이 포함됩니다. Host 테스트의 Docker 조건부 시험을 미실행했다면 보호 검증 통과로 계산하지 않습니다. 패키지 Smoke는 기본 옵션에서 모델을 호출하지 않습니다.

전체 회귀는 `npm test`입니다. Legacy·Alpha·Host Core와 문서/규칙 검사를 실행하며 보호 시험에 필요한 Docker 이미지와 JDK/Java fixture 구성을 먼저 준비해야 합니다. Docker 없는 계획 사용자에게 이 전체 개발 검증 환경을 요구하지 않습니다. 정확한 플랫폼별 준비·실행 계약은 [.github/workflows/alpha.yml](.github/workflows/alpha.yml), [CI 준비 스크립트](scripts/prepare-alpha-ci.mjs), [Alpha 실행기](scripts/test-alpha-ci.mjs)에 있습니다. 환경 변수만 켜는 것으로 검증 준비가 끝나지 않습니다.

`node src/alpha/cli.mjs host codex doctor`는 기본 Host 준비 상태를 확인합니다. 기존 `doctor --no-auth`는 Alpha 인증 검사를 생략하며 나머지 검사가 통과해도 exit 2입니다. 전체 사용 준비 성공으로 읽지 않습니다.

## 현재 상태와 다음 수용 검증

Host-Native 계획·DAG·검증 계약의 오프라인 시험과 기존 Legacy·Alpha 경로를 유지합니다. 실제 Host Live, 자동 Host 위임, 일반 사용자 환경의 보호 실행 배포는 별도 수용 검증이 필요합니다. Linux Legacy 탐색 실패는 미해결이며 현재 Linux 필수 CI의 시험 범위와 구분합니다. Alpha 인증 확인도 오프라인 CI 성공에 포함되지 않습니다.

첫 Live 수용은 Codex `$codefleet` 또는 Claude `/codefleet`에서 공개 Fixture를 **분석만** 하고 Draft→Validator→DAG→상태·Evidence 조회를 확인하는 범위입니다. 소스 무변경, 승인·실행 권한 미생성, 미검증 항목 표기가 수용 조건입니다. 실행 전에 Host 버전·모델·Fixture/Skill Hash·읽기와 상태 쓰기 권한·네트워크·예산을 확정하고 별도 승인을 받아야 합니다. [기존 사전 점검](docs/runs/2026-10-20/first-host-native-acceptance-preflight.md)은 당시 기록이며 실행 전 조건을 다시 확인합니다.

## 설계 자료와 역사적 기록

현재 제품 안내와 과거 실험의 결론을 구분합니다. 기존 README 전문과 링크는 [main 통합 시점의 README](https://github.com/solzip/CodeFleet/blob/cd31fdb3810a48b2ae42dc05d1f1e461eb9822bc/README.md)에 보존돼 있습니다. 과거의 종료·미지원 설명을 현재 제품 전체의 상태로 해석하지 마세요.

- [제품 계획](docs/product-completion/README.md) · [진행 기록](docs/product-completion/progress.md) · [Alpha Quick Start](docs/product-completion/alpha-quickstart.md) · [공개 Alpha 릴리스](https://github.com/solzip/CodeFleet/releases/tag/v0.2.0-alpha.4)
- [문서·실행 기록 색인](docs/INDEX.md) · [결함 등재부](docs/REGISTER.md) · [작업 규약](docs/CONVENTIONS.md)
- [설계에서 배운 점](docs/archive/2026-08-13/DESIGN-NOTES.md) · [결함 유형](docs/archive/2026-08-13/LESSONS.md) · [환경 기록](docs/archive/2026-08-13/ENVIRONMENT.md) · [아카이브](docs/archive/2026-08-13/ARCHIVE.md)
- [초기 CI 기록](docs/runs/2026-08-13/ci-first-run.md) · [문서 검사 보완](docs/runs/2026-08-14/unchecked-27-adjudication.md) · [Alpha 검증 보완](docs/runs/2026-09-30/alpha-reconciliation-fixes.md) · [Host-Native 전환 기록](docs/runs/2026-10-20/alpha-host-native-transition.md)

## 기여와 라이선스

<details>
<summary>기존 문서의 기계 검사 대상 수치와 역사적 범위</summary>

기존 문서 검사의 기준을 낮추지 않기 위해 아래 선언을 보존합니다. 동결된 결함 등재부의 77건은 현재 제품의 미해결 결함 수가 아닙니다. <!-- fact: registered-findings = 77 --> 이후 재판정은 위 역사적 기록을 참고하세요.

| 검사 대상 | 수치와 범위 |
| --- | --- |
| 동결된 등재부 전체 | 77건 <!-- fact: registered-findings = 77 --> |
| 당시 해소 / 부분해소 | 25 / 8건 <!-- fact: findings-resolved = 25 --> <!-- fact: findings-partial = 8 --> |
| 당시 재현 안 됨 / 미해소 | 1 / 15건 <!-- fact: findings-not-reproduced = 1 --> <!-- fact: findings-open = 15 --> |
| 당시 수용된 한계 / 미확인 | 1 / 27건 <!-- fact: findings-accepted-limit = 1 --> <!-- fact: findings-unchecked = 27 --> |
| Legacy 테스트 기준 | 통과 324 / 실패 0 <!-- fact: tests-passing = 324 --> <!-- fact: tests-failing = 0 --> |
| 규칙 조건 인용 커버리지 | 545줄 중 345줄, 63.3%. 구현 완성률이 아님 <!-- fact: condition-lines = 545 --> <!-- fact: conditions-covered = 345 --> <!-- fact: coverage-percent = 63.3 --> |
| 동결 아카이브 감사·실행 기록 | 107편 <!-- fact: audit-run-records = 107 --> |

테스트 수치 선언은 문서 검사에서 생성된 Legacy 결과와 대조하며, 새 환경에서 시험을 실행했다는 증거를 대신하지 않습니다.

</details>

문제 보고에는 재현 조건, 실행한 명령, 실제 결과와 미실행 항목을 포함하세요. 인증정보·개인 경로·세션 대화·런타임 DB는 공개하지 마세요. 변경 제안은 기존 계약·보호 테스트를 유지하고 관련 회귀와 문서 검사를 함께 확인합니다. 저장소 작업 규칙은 [CLAUDE.md](CLAUDE.md), 보안 안내는 [SECURITY.md](SECURITY.md)에 있습니다.

[MIT License](LICENSE). 배포 시 저작권과 라이선스 고지를 유지해야 하며 사용 허용은 품질이나 운영 적합성을 보증하지 않습니다. 과거 아카이브의 사용 금지 정책은 현재 배포본에 적용되지 않습니다.
