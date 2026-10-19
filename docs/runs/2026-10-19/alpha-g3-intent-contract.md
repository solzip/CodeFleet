# G3 — Intent & Contract Engine

- 일시: 2026-10-19, Asia/Seoul
- 작업 기준: `feature/alpha-g0-refresh`, HEAD `c61e9b829b62dd41336a7225bf3b9165136484db`
- 작업 공간: `.codefleet/worktrees/alpha-g0`, G1·G2 미커밋 작업 위에 추가
- 유형: 분석·구현·검증. 대상 저장소 커밋·푸시·배포·모델 호출 없음.
- 선행: [G1](alpha-g1-contract-preservation.md), [G2](alpha-g2-provider-integration.md), `docs/implementation/codefleet-implementation-v1/`

## 선행 분석과 보존

실제 cwd, branch, HEAD, status를 확인했다. G1·G2 변경과 설계·실행 기록을 보존했다. 기존 Alpha Controller, Judge, V1 Validator, Store, G2 Adapter 및 Legacy task-ledger/task-revision/workspace/required-gates의 의존성을 검토했다.

decision-debt 스킬의 directory 조회 두 번은 경로 설정 불일치와 파일 미발견으로 실패했다. 이를 감사 성공으로 세지 않고 사용자가 지정한 문서 11개의 실제 내용을 files 입력으로 전달했다. 결과 후보 2개·제외 9개·warnings 0. G2의 과거 링크 실패는 수정 후 full log 성공과 대조했고 Live 미검증을 완료로 주장하지 않았음을 확인했다. G1 완료·반증 기록을 정체로 본 후보도 원문·로그로 해소했다. 제외 후보는 주로 근거 부족이며 추가 권한의 근거로 쓰지 않았다. 외부 비교 자료는 구현 사실로 사용하지 않았다.

Legacy 승인 원장은 revisionHash와 guardrailHash를 묶고 현재 상태를 재생한다. Alpha의 계약·상태 형식은 다르다. 이번에는 승인과 관측을 구분하는 불변조건을 재사용하며 Legacy 원장이나 설정을 Alpha에 합치지 않았다. `.codefleet/config.json` 탐색을 요구하는 Legacy workspace API도 Git 기반 Alpha에 그대로 이식하지 않았다.

## 실제 수정 파일

| 파일 | 변경 |
| --- | --- |
| `src/intent/discovery.mjs` | 제한된 읽기 전용 Git 기준선·파일 후보 탐색 |
| `src/intent/contract.mjs` | TaskDraft 스키마·의미 검사, Capability Gap, V2→V1 컴파일 |
| `src/intent/engine.mjs` | 원문 보존, 로컬 초안, G2 Provider seam, 명시적 승인·고정 |
| `src/alpha/cli.mjs` | 별도 plan 명령, JSON 출력, bounded draft 입력 |
| `test/intent.test.mjs` | 신규 계약·부정 경로·CLI 통합 14개 |
| `package.json` | Intent 테스트를 기존 전체 테스트에 추가 |
| `docs/product-completion/progress.md`, `docs/INDEX.md`, 두 README | 결과 링크와 문서 수 갱신 |
| 이 문서 및 G3 로그·해시 기록 | 실제 실행 근거 |

Alpha의 `git`, `requireSuccess`, 제한된 `command` 실행, `filePath`, `hash`, `validateContract`를 재사용했다. G2의 Registry·Selection·ProviderExecutionResult·ProviderError를 사용한다. G1 Judge 및 G2 코드·기록은 수정하지 않았다. [소스 해시](alpha-g3-source-evidence.json)는 미커밋 소스를 식별하며 기준 커밋에 신규 코드가 이미 있었다는 뜻이 아니다.

## Intent·Draft와 CLI

```text
node src/alpha/cli.mjs plan "챗봇 세션 저장의 동시성 문제를 분석해" <repository>
node src/alpha/cli.mjs plan "Fix subtraction in src/math.js using test/math.test.js" <repository> --draft draft.json
```

설치 명령은 `codefleet-alpha plan`이다. Legacy `codefleet run <task-id>`와 기존 Alpha `run contract.json repository`는 변경하지 않았다. plan은 Store를 열지 않으며 코드를 수정하거나 Provider 모델을 호출하지 않는다. 종료 코드: 0=Draft 구조·컴파일 가능성 검증, 2=NEEDS_INPUT/CAPABILITY_GAP/Planner 차단, 1=입력·탐색 오류. 모두 plan 결과는 JSON이며 executable=false다. exit 0도 승인·테스트 통과·실행 완료를 뜻하지 않는다.

Intent는 원문과 USER_REQUEST_ONLY 권한을 보존한다. Discovery는 명시한 Git root의 HEAD 객체 목록만 읽는다. 최대 1,500 tracked entries, Git 출력 cap, source/test 확장자와 안전 경로 제한을 적용한다. symlink/submodule은 따라가지 않고 Capability Gap으로 남긴다. 파일 본문·스크립트·설정의 명령은 실행하지 않는다. dirty 작업 공간도 계획은 가능하지만 승인 가능한 계약으로 컴파일하지 않는다.

기본 로컬 초안은 자연어에서 명시한 기존 경로와 이름 기반 관련 후보를 보여준다. 의미적 코드 분석이나 테스트 커버리지 증명이 아니다. 필수 완료 조건은 원문으로 생성하되 method=unresolved, unknowns에 사용자 확인을 요구한다. 모호한 목표를 임의의 테스트에 연결해 VALIDATED로 만들지 않는다.

TaskDraft 필드: schemaVersion=2, objective, base, files, tests, criteria, risks, unknowns, effects. 각 criterion은 description/method/tests를 가진다. 모든 criterion은 필수다. 알 수 없는 최상위 필드·승인 필드·baseline 불일치·원문 대체·경로 탈출·미발견 검증 파일·criterion의 테스트 범위 확대를 거절한다. 배열·텍스트·입력 바이트를 제한한다. `protected-tests`로 명시된 기존 테스트만 컴파일 가능하며 테스트와 목표의 의미적 대응은 인간 검토가 필요하다.

예시 draft.json (base는 해당 저장소에서 실제 조회한 HEAD로 지정):

```json
{
  "schemaVersion": 2,
  "objective": "Fix subtraction in src/math.js using test/math.test.js",
  "base": "<actual HEAD>",
  "files": ["src/math.js"],
  "tests": ["test/math.test.js"],
  "criteria": [{"description": "Subtraction regression passes", "method": "protected-tests", "tests": ["test/math.test.js"]}],
  "risks": [], "unknowns": [], "effects": ["local-edit"]
}
```

## 승인·실행 권한 경계

INTENT_RECEIVED → DISCOVERED → DRAFTED → VALIDATED는 계획 단계다. 미해결 조건이 있으면 VALIDATED로 이동하지 않는다. AUTHORIZED는 trusted host가 별도 인간 검토 결과를 authorize에 전달한 경우에만 발급하는 프로세스 내부 토큰이다. Planner의 serialized approval 필드는 토큰이 아니다.

컴파일된 V2 TaskContract는 원문, discovery/repository identity/baseline, Draft·완료 방법, 고정 policyHash, 예산과 V1 계약을 함께 해시한다. authorize는 actor, 정확한 계약 해시, 최대 한 시간의 만료를 요구한다. pin은 전체 재탐색 결과와 해시, 현재 dirty 상태, 만료를 재검사하고 한 번만 소비한다. 비동기 재탐색 후 재사용 검사로 동시에 두 번 pin할 수 없다. 계약·기준선·정책 내용 변경, 다른 저장소, 위조·직렬화·만료 토큰은 거절한다.

이는 로컬 trusted-host 승인 경계이지 사용자 신원 인증 서비스가 아니다. 프로세스 재시작 시 토큰은 사라지며 재검토가 필요하다. SQLite 승인 원장·영속 허가·CLI approve/run 연결은 제공하지 않는다. PINNED는 executionStarted=false와 V1 payload를 반환한다. G3 경로는 실행하지 않는다. 기존 V1 CLI로 명시적으로 실행하는 행위는 기존 계약의 별도 권한 부여이며 plan의 승인을 자동 재사용하는 것이 아니다.

기존 Alpha 실행 시에는 baseline failing regression, Docker 독립 검증, Judge, Lease·Recovery·Delivery 경계가 그대로 적용된다. V2가 V1 검증을 완화하거나 Provider의 테스트 성공 주장을 증거로 바꾸지 않는다.

## Capability Gap과 Provider

- 신규 파일·미발견 파일: NEW_FILE_OR_OUTSIDE_DISCOVERY.
- 테스트 수정: PROTECTED_TEST_EDIT.
- shell·배포·원격 효과: 별도 승인 요구 및 G3 미지원. 위험 표현은 Planner가 risks를 비워도 원문에서 재검사한다. 키워드 탐지는 완전한 의미적 위험 분류가 아니므로 인간 검토가 필수다.
- 검증 방법 없음·human review만 있음·모호한 목표·dirty tree: NEEDS_INPUT.
- Java 이미지·모듈 지정, 일반 분석 전용 작업, 예산 사용자화, 새 명령·테스트 생성: 현재 G3 compiler는 제공하지 않으며 V1 검사 실패를 Capability Gap으로 표시한다. 기존 Alpha Java 실행은 그대로 지원된다.

G2 공통 envelope를 사용하되 편집 Adapter에 계획 요청을 잘못 전달하지 않도록 trusted adapter의 intent-planning task 지원도 확인한다. Fake Planner만 이 경로를 검증했다. 실제 Codex는 기존 capability 필터에서 차단되고 Claude 편집 호환 경로는 변경하지 않았다. 실 Planner Adapter는 등록하지 않았으며 Live 검증은 미완료다. PROPOSAL_ONLY/PROPOSED, 정상 process, 원본 JSON 및 별도 Draft 검증을 모두 확인한다. 출력에 포함된 승인·상태는 권한을 부여하지 않는다.

## 실행 검증

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| `node --test test/intent.test.mjs` | 0 | 14/14, 제외 0 |
| `npm.cmd test` | 0 | Legacy 324 + Alpha 39 + Provider 15 + Intent 14 = 392, 제외 0; posttest 포함 |
| `node src/alpha/cli.mjs doctor` | 0 | 5/5, Node v24.14.1, Claude 2.1.303 |
| `node src/alpha/cli.mjs plan "챗봇 세션 저장의 동시성 문제를 분석해" .` | 2 | 실제 작업 공간에서 NEEDS_INPUT, 원문 보존·dirty 상태·경로/검증 방법 미결 확인 |

전체 테스트 환경: CODEFLEET_TEST_DOCKER=1, CODEFLEET_TEST_JAVA=(Get-Command java).Source, CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45. Node/Maven 격리 검증 및 JDK parser 4건을 포함했다. 신규 테스트는 임시 Git fixture에만 합성 기준 커밋을 만들며 작업 대상 브랜치에는 커밋하지 않는다.

근거: [전체 검증](codefleet-g3-full.log), [Intent 집중 검증](codefleet-g3-intent.log), [Doctor](codefleet-g3-doctor.log), [실제 plan CLI](codefleet-g3-cli.log). G2에서 남은 과거 인용 경고 11개는 그대로이며 테스트 기준·문서 검사기를 완화하지 않았다.

| 수용 조건 | 근거 |
| --- | --- |
| CF-GATE-04 범위 확대 차단 | scope escape/new file/protected-test 및 잘못된 criterion 테스트 |
| CF-GATE-05 검증 방법 누락 | NEEDS_INPUT, compile 거절 |
| CF-GATE-15/16 권한·Provider 제한 | Codex 차단, symlink 미탐색, Planner 장애 안전 종료 |
| CF-GATE-17 비대화형 JSON | 실제 CLI 및 Fake draft CLI 통합 테스트 |
| CF-GATE-18/19 기존 호환 | Alpha·Legacy 전체 회귀, V1 컴파일 출력 재검증 |
| 승인 변경·재사용 | digest/expiry/dirty/다른 저장소/직렬화/동시 pin 반증 |

## 완료 판정과 G4 조건

G3의 로컬 Intent → Draft → 스키마·의미 검증 → 실행 가능성 출력과 승인·계약 고정 API를 구현·검증했다. G3 CLI에서 자동 코드 수정·실제 모델 실행은 제공하지 않는다. G2의 Codex Live 미검증 상태는 별도 미해결로 유지한다.

미검증: 실 Planner 모델 응답, 자연어 의미 이해 품질, 목표와 테스트의 실제 의미적 충족, 다른 OS, Gradle Docker 재실행, 원격 PR·배포. 테스트 통과는 이 항목들의 성공을 의미하지 않는다. G3 승인 토큰은 영속 실행 권한이 아니며 G4가 실행에 연결하려면 기존 Store 기반 원자적 승인 소비·baseline 재검사·재시작/회복 계약이 필요하다.

G4는 사용자 후속 지시 후 시작한다. 기존 SQLite 데이터를 보존하는 마이그레이션·승인 원장·DAG 원자화·중복 실행 방지 수용 기준을 먼저 검증해야 한다. 실 Provider 활성화에는 별도의 no-tool·보안 capability 근거와 Live 호출 승인이 필요하다. 이번 작업은 G3까지만 수행했다.
