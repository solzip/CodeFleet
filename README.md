# CodeFleet

Codex CLI·Claude Code의 기존 모델·인증·세션을 활용하는 **Host-Native 개발 오케스트레이션 확장 도구**입니다. 자연어 목표를 검토 가능한 작업으로 만들고, 승인된 변경과 검증·복구·완료 판정을 연결합니다. 단일 Agent가 기본이며 필요한 경우 Host의 Agent/Subagent 기능을 활용합니다.

**현재는 개발·수용 검증 단계입니다.** 계획·검토, 감독형 Local 변경, 별도 프로세스 복구를 구현했습니다. 제한된 Windows Codex 감독형 실행 관측은 있지만 공개 인증 위임·보호 실행·전체 OS 수용·외부 사용자 생산성은 아직 검증이 끝나지 않았습니다. 최신 결과와 한계는 [진행 현황](project/PROGRESS.md)을 따릅니다.

현재 Live 후보는 실제 호환 시험을 통과한 Codex CLI `0.167.0`과 CI 고정 `0.167.1`만 허용합니다. `0.167.0`에서 공식 MCP 등록·발견, 제안 전용 도구 7개, Goal 영속화와 소스 불변을 모델 호출 없이 확인했습니다. 이후 실제 모델 Turn 1회를 관측했지만 첫 Goal MCP 호출이 실패해 `HUMAN_RECONCILIATION_REQUIRED`로 종결했고 소스·Owner 권한·Protected Evidence는 생성되지 않았습니다. Host Live 수용과 Compaction은 여전히 미완료입니다.

[문서 안내](docs/README.md) · [제품 원칙](docs/PRODUCT_VISION.md) · [로드맵](docs/product-completion/roadmap.md) · [아키텍처](docs/product-completion/architecture.md) · [English](README.en.md)

## 무엇을 할 수 있나요?

| 작업 | 현재 제공하는 범위 |
| --- | --- |
| 개발 목표 정리 | Draft·완료 기준·파일 범위·Validator·Workflow/DAG 검토 |
| 기존 프로젝트 개선 | 제안 검토, 정확한 Fileset 승인·적용, Local 테스트와 완료 판정 |
| 신규 프로젝트 Bootstrap | 승인된 파일 생성·검증·Repair·재개 구현. 실제 Host 전체 수용은 미완료 |
| 중단 후 재개 | 영속 Goal·계약·Work Log·Evidence 조회와 별도 프로세스 Recovery |
| 실패 후 수정 | 실패 근거와 별도 승인에 결합된 제한적 Repair·재검증 |

기본 흐름은 `목표 → Draft → Validator → DAG → 승인 → 실행 → Evidence → Judge`입니다. 계획 통과는 실행 승인이 아니며, AI의 성공 보고는 독립 검증 증거가 아닙니다. 완료한 뒤 소스가 바뀌면 기존 Local 완료도 다시 확인해야 합니다.

## 설치와 시작

Node.js **24.14.1 이상**, Git, 사용하는 Host가 필요합니다. 기본 계획에는 Docker·WSL·별도 OS 계정·직접 모델 API 키가 필요하지 않습니다. 소스 checkout에는 런타임 의존성 설치가 필요 없습니다.

```sh
git clone https://github.com/solzip/CodeFleet.git
cd CodeFleet
node --version
node src/alpha/cli.mjs --help
```

기존 프로젝트 경로 `PROJECT`를 지정하고 사용할 Host를 선택합니다.

```text
node scripts/host-install.mjs install codex PROJECT
node scripts/host-install.mjs install claude PROJECT
```

| Host | 프로젝트 설치 위치 | Host 세션에서 호출 |
| --- | --- | --- |
| Codex CLI | `.agents/skills/codefleet/` | `$codefleet` |
| Claude Code | `.claude/skills/codefleet/` | `/codefleet` |

설치기는 Skill·런타임 snapshot·라이선스를 추가합니다. 기존 설치는 덮어쓰지 않으며 자동 업데이트되지 않습니다. 관리 명령은 `status`, `disable`, `enable`, `remove`입니다. 설치·발견과 실제 모델 수행은 별도입니다. [설치·사용 안내](guides/host-native-guide.md)를 확인하세요.

처음에는 작은 작업의 계획만 검토하세요.

```text
완료한 할 일을 숨기는 필터를 추가하려고 합니다.
변경 범위와 완료 기준, 필요한 테스트를 제안하고 승인을 기다려 주세요.
```

명령으로 계획 경로를 확인할 때는 `STATE`를 대상 프로젝트 밖의 준비 상태 경로로, `REPO`를 검토할 저장소로 바꿉니다. 이 명령은 모델 호출과 소스 변경 없이 준비 상태를 기록합니다. 입력 보완이 필요하면 exit 2로 종료할 수 있습니다.

```text
node src/alpha/cli.mjs --state STATE host codex plan "Fix duplicate event handling" REPO
```

후속 Draft·계약 검토·승인 요청은 [Core 안내](guides/host-core-guide.md)를 따릅니다. 기존 프로젝트는 검토한 Git 기준선을, 신규 프로젝트는 Bootstrap 계약을 사용합니다. 인증정보나 세션을 복사하지 않습니다.

## 검증 수준과 제한

Local Verification은 사용자가 신뢰한 정확한 명령을 로컬 권한으로 실행합니다. `COMPLETE_LOCAL`은 해당 계약·후보의 Local 수락입니다. OS 격리나 Protected Verification을 보증하지 않습니다.

Container Verification은 Docker와 고정 검증 입력·격리 조건이 필요한 별도 Backend입니다. 해당 Backend가 필수인 계약은 Local 성공으로 대체하지 않습니다. Host Sandbox는 `NOT_VERIFIED`, 공개 인증 위임은 `PUBLIC_DELEGATION_BLOCKED`입니다. 완전 무인 Repair, Host Compaction과 장기 실행의 전체 수용, Multi-Agent의 시간·비용 이점은 미입증입니다.

기존 Node·Java Alpha 경로는 [Alpha 안내](guides/alpha-quickstart.md), Backend별 보장은 [Core 안내](guides/host-core-guide.md)에서 확인합니다. main의 코드와 기존 공개 Alpha 패키지의 지원 범위는 같다고 가정하지 않습니다.

## 개발·저장소 구조

| 위치 | 책임 |
| --- | --- |
| `src/` | [제품 모듈과 Legacy 호환 경로](src/README.md) |
| `test/`, `tools/proofs/` | 기능 회귀·부정 사례·Host 프로토콜 검증 |
| `scripts/`, `.github/` | 설치·진단·검증·패키지·CI |
| `examples/` | Legacy Task·Java 계약 예제 |
| `docs/` | 공식 제품 문서·현행 구현 계약·검사 기준선 |

Docker 없는 기본 회귀는 아래 순서로 실행합니다. Windows PowerShell에서는 `npm.cmd`를 사용합니다.

```sh
npm run pretest
npm run test:legacy
npm run test:host-core
npm run posttest
```

설치 제품의 Local 흐름은 `npm run test:installed-goal-loop`로 확인합니다. 실제 패키지를 설치하지만 제안은 합성 데이터이며 모델을 호출하지 않습니다. 전체 `npm test`에는 Docker 보호 시험이 포함되므로 [.github/workflows/alpha.yml](.github/workflows/alpha.yml)의 환경 준비가 필요합니다. 기본 회귀 통과는 전체 보호 검증 통과가 아닙니다.

기여 시 [작업 규칙](CLAUDE.md)을 따르고 실행 명령·종료 코드·제외·미검증 범위를 남겨 주세요. 보안 문제는 [SECURITY.md](SECURITY.md)를 통해 보고하고, 개인 경로·인증정보·세션 대화·실행 DB는 공개하지 마세요.

<details>
<summary>Legacy 자동 검사 수치</summary>

동결된 등재부의 77건은 현재 제품의 미해결 결함 수가 아닙니다. <!-- fact: registered-findings = 77 --> [과거 기록](test/contracts/legacy/INDEX.md)의 범위와 함께 읽습니다.

| 검사 대상 | 수치와 범위 |
| --- | --- |
| 동결된 등재부 전체 | 77건 <!-- fact: registered-findings = 77 --> |
| 당시 해소 / 부분해소 | 25 / 8건 <!-- fact: findings-resolved = 25 --> <!-- fact: findings-partial = 8 --> |
| 당시 재현 안 됨 / 미해소 | 1 / 15건 <!-- fact: findings-not-reproduced = 1 --> <!-- fact: findings-open = 15 --> |
| 당시 수용된 한계 / 미확인 | 1 / 27건 <!-- fact: findings-accepted-limit = 1 --> <!-- fact: findings-unchecked = 27 --> |
| 현재 Legacy 테스트 | 통과 327 / 실패 0 <!-- fact: tests-passing = 327 --> <!-- fact: tests-failing = 0 --> |
| 규칙 조건 인용 커버리지 | 545줄 중 345줄, 63.3%. 구현 완성률이 아님 <!-- fact: condition-lines = 545 --> <!-- fact: conditions-covered = 345 --> <!-- fact: coverage-percent = 63.3 --> |
| 현재 트리의 감사·실행 기록 | 0편. 원본은 Git 이력에 보존 <!-- fact: audit-run-records = 0 --> |

수치는 생성된 Legacy 시험 결과·등재부·디스크와 대조하며 새 환경의 실행 증거를 대신하지 않습니다.

</details>

[MIT License](LICENSE). 사용 허용은 제품 완성이나 운영 적합성을 보증하지 않습니다.
