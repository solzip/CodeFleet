# 통합 오케스트레이션 CLI — 개발 브랜치

이 안내는 아직 배포하지 않은 G6 작업 트리용이다. 공개 alpha.4에 이 명령이 포함되었다는 뜻이 아니다. 기존 사용법은 [알파 실행 안내](alpha-quickstart.md), 검증 범위와 제한은 [G6 기록](../runs/2026-10-19/alpha-g6-product-integration.md)을 따른다.

**현재 Live 운영 상태: BLOCKED_OR_UNSUPPORTED.** 로컬 계획·검토·승인·보고는 사용할 수 있다. 새 Workflow 실행은 Provider의 필수 Capability가 검증되지 않아 차단된다. `--allow-model`은 호출 동의이며 Capability 검사를 우회하는 옵션이 아니다. Codex 실행 차단은 유지한다. 기존 Claude V1 경로의 권한을 새 Workflow로 자동 이관하지 않는다.

## 명령과 호환성

기존 `codefleet run <task-id>`와 `codefleet-alpha run <contract.json> <repository>`는 그대로다. 자연어 통합 흐름은 충돌을 피하기 위해 `codefleet-alpha objective` 아래에 둔다. 개발 작업 트리에서는 다음처럼 실행한다.

```sh
node src/alpha/cli.mjs objective help
node src/alpha/cli.mjs objective plan "subtract 함수의 계산 오류를 수정하고 검증해" /target/repository
```

대상은 기존 Alpha가 지원하는 깨끗한 Git 저장소다. 기본 상태 저장소는 사용자 홈의 `.codefleet-alpha`이며 `--state <directory>`로 별도 경로를 선택할 수 있다. 상태 디렉터리를 대상 저장소의 추적되지 않은 파일로 만들면 clean baseline 검사를 통과하지 못하므로 저장소 밖에 둔다. 저장된 내용에는 코드 문맥·Provider 출력이 포함될 수 있다.

새 자연어 계약 컴파일은 현재 G3의 제한된 Node 경로를 사용한다. Java verification 설정을 생성하는 objective 옵션은 제공하지 않는다. Java 작업은 기존 Alpha V1의 명시적 Java 계약 경로를 유지하며 새 Planner가 실행 가능하다고 추정하지 않는다.

계획 응답은 `taskId`, 원본 목표, 후보 범위·테스트·관측된 코드 인용, 추론, 미해결 조건을 포함한다. 기본 Planner는 코드 내용과 테스트 import를 읽는 제한적인 문맥 도우미다. 의미 분석이나 목표 달성 증거로 표시하지 않는다. 외부 모델이나 저장소 코드를 실행하지 않는다.

## 검토와 승인

계획이 제안한 파일·테스트와 완료 기준을 확인한 뒤 CLI로 명시한다. JSON 파일이나 DB를 수동 편집할 필요가 없다.

```sh
node src/alpha/cli.mjs objective review <task-id> --files src/math.js --tests test/math.test.js --criterion "기존 subtraction 회귀 테스트가 통과한다"
node src/alpha/cli.mjs objective run <task-id>
```

`run`은 검증된 계획으로 Workflow를 만들고 `WAITING_APPROVAL`과 `workflowHash`를 출력한다. 계획 생성이나 범위 검토만으로 실행 승인되지 않는다. 승인할 범위·예산·완료 조건을 전체 응답에서 확인한다.

```sh
node src/alpha/cli.mjs objective approve <task-id> --hash <workflowHash> --actor <operator>
node src/alpha/cli.mjs objective run <task-id> --allow-model
```

현재 마지막 명령은 Capability 부족으로 종료 코드 2를 반환한다. 도구를 허용하거나 Codex 차단을 해제하여 진행하지 않는다. 안전한 실행 환경과 Live 검증은 별도 준비 대상이다. `actor`는 로컬 운영자의 감사 표기이며 원격 사용자 인증 시스템은 아니다.

거절은 다음 명령으로 기록한다. 거절·취소한 Task를 되살리지 않고 새 계획을 만든다.

```sh
node src/alpha/cli.mjs objective reject <task-id> --actor <operator>
```

미실행 Task를 다시 `review`하면 기존 Workflow 승인을 철회하고 취소한다. 새 Workflow hash를 다시 승인해야 한다. 이미 Attempt가 시작된 Task는 덮어쓰지 않으며 새 계획이 필요하다. 위험 작업이나 검증 방법 누락을 단순 검토 옵션으로 면제할 수 없다.

## 명시적 병렬 계획

기본 동시성은 하나이며 상한은 세 개다. 여러 WorkItem을 원하면 각 파일·테스트·의존성과 충분한 시도 예산을 검토 시 명시한다.

```sh
node src/alpha/cli.mjs objective review <task-id> --files src/a.js,src/b.js --tests test/a.test.js,test/b.test.js --criterion "보호된 회귀 테스트 통과" --item "a|src/a.js|test/a.test.js|" --item "b|src/b.js|test/b.test.js|" --parallel 2 --attempts 2
```

`--item` 형식은 `id|files|tests|dependencies`이며 각 목록은 쉼표로 구분한다. 마지막 목록을 `a`로 설정하면 그 작업은 a의 검증 성공 뒤에만 실행한다. 동일 파일의 다중 수정은 차단한다. 의존성은 실행 선행조건이며 앞 작업의 patch를 다음 모델 문맥에 주입하는 데이터 의존 실행은 지원하지 않는다.

`--attempts`, `--timeout`, `--budget`은 기존 V1 Validator 범위 안에서만 허용한다. `--budget`은 시도별 Provider 비용 상한 요청이며 독립적인 청구 보증이 아니다. 비용 미확인은 0으로 표시하지 않는다. 각 WorkItem의 모델 시도는 한 번이며 실패한 Attempt를 자동 재사용하지 않는다.

## 상태·중단·복구·보고

```sh
node src/alpha/cli.mjs objective status
node src/alpha/cli.mjs objective status <task-id>
node src/alpha/cli.mjs objective pause <task-id>
node src/alpha/cli.mjs objective resume <task-id> --allow-model
node src/alpha/cli.mjs objective cancel <task-id>
node src/alpha/cli.mjs objective report <task-id-or-run-id>
node src/alpha/cli.mjs report <run-id>
node src/alpha/cli.mjs export <run-id> /new/export-directory
```

실행 중 다른 터미널에서 상태·중단 명령을 사용할 수 있다. 보고는 WorkItem, 역할, Provider, Attempt, 비용, 메시지, 이벤트, Artifact 경로와 검증 상태를 구분한다. `VERIFIED`, `FAILED`, `INCONCLUSIVE`, `NOT_RUN`, `INVALID`를 확인한다. `complete`는 저장된 상태 문구만으로 true가 되지 않는다. 증거나 최종 후보가 변조되면 `VERIFICATION_INVALID`이며 원래 저장 상태는 `recordedState`로 남는다. 내보내기도 증거 검사를 통과해야 한다.

STARTED 결과가 불명확하면 `RECONCILING`에서 멈추며 자동 재실행하지 않는다. DB를 고쳐 예약을 지우는 복구는 지원하지 않는다. 독립 검증을 통과한 일부 WorkItem은 표시하지만 전체 완료로 간주하지 않는다. 실패 후 수정은 새 검토된 Task로 수행하며 이전 실행·부작용이 불명확하면 먼저 종료와 안전성을 확인해야 한다.

## Provider 준비 상태와 AI Planner

```sh
node src/alpha/cli.mjs objective readiness
node src/alpha/cli.mjs objective readiness --codex-executable /absolute/path/to/codex.exe
node src/alpha/cli.mjs objective plan "목표" /target/repository --planner claude --allow-model
```

Readiness는 버전·도움말만 읽고 인증이나 모델 호출을 하지 않는다. Windows npm shim만 PATH에 있으면 네이티브 Codex 경로를 진단 옵션으로 지정할 수 있다. 이 옵션은 실행 Adapter를 활성화하지 않는다. 도움말에 옵션이 있어도 실제 보안 집행을 SUPPORTED로 표시하지 않는다.

AI Planner는 고정 Git 문맥을 받아 코드 인용·추론·Draft를 구분하는 구현이 있으며 Fake Adapter로 검증했다. 실제 모델 의미 분석 품질은 미검증이다. 새 strict Provider 경로가 차단되어 마지막 명령도 현재 실행되지 않는다. 잘못된 코드 인용·스키마·범위·완료 기준은 승인으로 연결되지 않는다. Planner 시도는 호출 전에 원본과 미확인 비용을 기록하며 응답 유실 시 자동 재호출하지 않는다.

## JSON과 종료 코드

`objective` 명령은 JSON 객체 하나를 stdout에 출력한다. 별도 `--json`도 허용하며 진단 경고는 stderr에 나온다. 기존 Legacy/Alpha 명령의 출력 형식은 보존한다.

| 코드 | 의미 |
| --- | --- |
| 0 | 요청한 조회·검토·승인·제어 성공 또는 독립 검증 완료. 조회 성공을 Run 성공과 혼동하지 않는다. |
| 2 | 추가 입력·승인·모델 호출 동의·Capability·검증 대기/차단 |
| 1 | 잘못된 명령·입력, 손상된 상태 또는 처리 오류 |

이 CLI는 원격 PR 생성·배포·병합을 추가하지 않는다. 기존 Alpha의 명시적 V1 Delivery 계약은 별도 경로로 유지한다.
