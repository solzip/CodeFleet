# Host-Native 기준선 감사 및 첫 수용 계획

- 작업 일시: 2026-10-20 (Asia/Seoul)
- 대상 커밋: `c3bca1e8b3481a1a3e6dff1cc7e1e8ef5c72bc03` 및 미커밋 작업 트리
- 작업 유형: 감사·실행·결정 (제품 소스 변경 없음)
- 선행 문서: [구현 검증](host-native-core-verification.md), [사용 안내](../../product-completion/host-core-guide.md), [H6](alpha-h6-host-planning-isolation.md), [H8](alpha-h8-linux-host-preparation.md)
- 번호 실측 최대값: REGISTER의 P0-17 / P1-61. 새 결함 ID나 기존 등급 변경 없음.

## 기준선과 감사 범위

소스 줄 번호는 HEAD가 아닌 현재 작업 트리 기준이며, 해당 내용은 파일 hash로
식별한다. 이전 구현 manifest의 소스·테스트 144개와 기존 G1~H8 기록 39개를
비교한 결과 변경·누락은 각각 0개였다.

작업 위치는 `.codefleet/worktrees/alpha-g0`, 브랜치는
`feature/alpha-g0-refresh`다. HEAD만으로 새 기능을 재현할 수 없다.
추가 소스·테스트·문서·증거를 포함한 미커밋 작업 트리가 검증 대상이다.
이번 작업에서는 제품 소스, 테스트, 아키텍처, 기존 실행 기록을 수정하지 않는다.
Git staging/commit/push/PR/deploy, 실제 모델 호출 및 인증정보 조회도 수행하지 않는다.

[체크포인트 목록](host-native-baseline-inventory.json)은 상대 경로·SHA-256,
분류 및 제한된 보안 패턴 검사의 범위를 기록한다. 런타임 데이터는 내용 대신
제외 개수만 기록한다. 이 문서와 마지막 문서 검사 로그는 자체 해시 순환을 피하기
위해 목록에서 제외한다.

| 감사 항목 | 현재 판정과 근거 |
| --- | --- |
| Legacy·Alpha | Legacy TypeScript 변경 없음. 기존 계약의 Evidence는 원래 Judge 조건 유지. 새 envelope 일부만 제공하면 거절. `src/alpha/verification-evidence.mjs` (working-tree line 10), `src/alpha/judge.mjs` (working-tree line 17) |
| Host 기본 경로 | 계획·Draft 검증·DAG 준비·조회는 모델/컨테이너 없이 동작. Node와 Git 필요. `src/hosts/cli.mjs` (working-tree line 49), `src/product/tasks.mjs` (working-tree line 72) |
| 보호 검증 | 기존 Docker Verifier를 감싼 Backend가 기본. Docker 실패를 Local로 대체하지 않음. `src/alpha/controller.mjs` (working-tree line 45), `src/verification/backends.mjs` (working-tree line 8) |
| WorkItem | 독립 준비 작업은 진행, 승인/Capability 부족 작업과 그 후속은 차단. 전체 성공과 최종 통합 검증 전 COMPLETED 불가. `src/alpha/controller.mjs` (working-tree line 305) |
| 승인·복구 | 선택적 정책은 hash 고정, 재개 때 누락/변조 거절. 기존 Workflow 승인·Lease·artifact 검증 유지. `src/alpha/controller.mjs` (working-tree line 239), `src/hosts/workflow-authorization.mjs` (working-tree line 65) |
| Host 권한 | 공개 requests/submit/run/resume는 생산 격리 미검증으로 차단. 신뢰된 테스트 seam을 사용자 경로로 제시하지 않음. `src/hosts/cli.mjs` (working-tree line 109) |
| 설치 | 기본 Skill과 엄격한 계획 Skill은 별개. 기존 설치 내용 자동 덮어쓰기 없음. `src/hosts/install.mjs` (working-tree line 33), `src/hosts/planning.mjs` (working-tree line 20) |

G1 계약 보존, G4 DAG, G5 Hybrid, G6 제품 통합, H1 설치,
H2/H3 승인 경계, H4 IPC, H5 Live 차단, H6 계획 격리, H7/H8 환경
기록을 현재 소스·테스트와 대조했다. 과거 테스트 횟수는 당시 결과로 보존한다.
이번 회귀가 과거 Host Live 실행이나 실제 사람의 승인 입력을 입증하지는 않는다.

### 증거 등급과 남은 제약

- Local: 정확한 실행 파일·인자·스냅샷에 대한 일회성 신뢰, 실제 실행 출력 및
  전후 hash. `LOCAL_EXECUTED`, 최대 `LOCAL_PASSED`, `complete:false`.
  동일 사용자 프로세스이며 파일/네트워크/자원 격리나 보호된 Evidence가 아니다.
- Container: 기존 보호 테스트·네트워크 거절·자원 제한 및 Harness 관측 유지.
  Coordinator가 contract/tree/test identity를 묶은 뒤 Judge를 통과해야 한다.
  Backend 이름이나 자체 주장만으로 보호 상태가 되지 않는다.
- Host Sandbox: `NOT_VERIFIED`; 사용 불가. Skill 지침은 격리 장치가 아니다.
- `policyAdmission`은 신뢰된 embedding의 추가 제한이다. 범용 Host 작업 실행 엔진이
  아니며 기본 준비 경로가 모든 WorkItem 종류를 실행한다는 뜻도 아니다.
- `host workflow/explain`의 작업 평가는 기존 Alpha의 보호 검증 계약을 설명한다.
  실제 Host Capability 자동 발견이나 범용 위험 분류로 해석하지 않는다.

삭제하지 않고 남긴 검토 항목: Host CLI의 `execute` 관련 보호 경로를 포함한
내부 dispatch seam과 공개 차단 경계는 구분해서 보아야 한다. `hostSandboxBackend`의
거절 메서드와 no-op cleanup은 미구현 플랫폼의 의도적 자리표시자다.
`src/hosts/cli.mjs`의 `requireProductionHostIsolation`은 실제 공개 경계에서 사용한다.
`Store` import도 hostCli에서 사용하므로 미사용으로 분류하지 않는다.
`dispatchHost`의 TaskReport `nextAction`은 requests/run을 안내하지만 공개 ingress는
차단되어 있어 사용자가 혼동할 수 있다 (`src/hosts/cli.mjs` (working-tree line 33)).
중복된 계획 진입점은 H6의 세션/hash/expiry 계약과 기본 Task revision 계약이
다르므로 이번에 통합하거나 삭제하지 않는다. 전체 정적 미사용 분석을 했다는
주장은 하지 않는다.

## 이번 검증

첫 전체 실행은 exit 1: Legacy 324 통과, Alpha 210 통과/1 실패이며
Host Core와 posttest는 앞 단계 실패로 실행되지 않았다.
실패는 `test/hybrid.test.mjs` (working-tree line 62)의 동시 실행 peak 기대 2 / 실측 1이다.
바로 앞 COMPLETED assertion은 통과했다. 30ms 지연으로 동시성을 관측하는
테스트이므로 스케줄링 민감성이 의심되지만 원인이 확정된 것은 아니다.
단독 Hybrid는 exit 0, 18 통과/1 제외(Docker gate 미활성)/0 실패다.
변경 없는 전체 재실행은 exit 0, 547 통과(Legacy 324 + Alpha 211 + Core 12),
실패/제외 0이며 posttest도 통과했다. 최초 실패는 삭제하지 않는다.
재실행은 timing flake 가능성을 뒷받침하지만 원인 해결을 뜻하지 않는다.
[첫 실패 로그](host-native-baseline-test-first.log), [단독 Hybrid 로그](host-native-baseline-hybrid.log).

전체 명령·종료 코드와 각 suite 집계는 [검증 결과](host-native-baseline-results.json)에
기록한다. [전체 로그](host-native-baseline-test.log), [Alpha Doctor](host-native-baseline-doctor.log),
[Host Doctor](host-native-baseline-host-doctor.log), [최종 문서 검사](host-native-baseline-docs.log)를 함께 보존한다.

`npm.cmd test`는 기존 Docker·Java/Maven·Operator·Host IPC 환경 변수를 활성화해 실행한다.
모델 응답은 fake이며 Node/Java 테스트, Docker 격리와 로컬 명령은 실제 실행이다.
Docker 없는 테스트는 Docker가 없는 PATH를 구성해 CLI 계획·Draft·DAG·조회와
보호 실행 거절을 확인한다. Docker를 시스템에서 제거한 실험은 아니다.
SQLite 재개, Lease, Recovery, 승인/Evidence 위조 거절, H3/H4/H6 반증도 기존 suite에 포함된다.

Alpha `doctor --no-auth` exit 2는 인증 실패가 아니라 **인증 검사를 생략한 불완전한
준비 확인**이다. 소스는 다른 검사에 false가 있으면 exit 1, 그렇지 않고 no-auth이면
exit 2를 반환한다 (`src/alpha/cli.mjs` (working-tree line 79)). 이번 인증 값은 `ok:null`,
`NOT_CHECKED`; 나머지 검사는 true였다. 전체 Alpha 성공으로 표시하지 않는다.
Host Doctor exit 0은 기본 Core 사용 가능을 뜻하며 실제 Skill 발견/호출 성공이 아니다.

제외: 인증을 읽는 기본 Alpha Doctor, 실제 Codex/Claude 모델·직접 API, Host Live,
새로운 H8 설치, 새로운 플랫폼/Host Sandbox, 실제 인간 승인, 원격 PR·배포.
역사적 citation 경고는 새 문서로 소급 수정하거나 검사 기준을 낮추지 않는다.

## 커밋 계획 — 아직 실행하지 않음

목록의 파일별 분류를 기준으로 다음 논리 단위를 제안한다. 의존 관계 때문에
앞 단계가 없는 뒤 단계만 cherry-pick하는 계획은 아니다.

1. 소스 + 대응 테스트 + package.json: Evidence/Judge/Backend, WorkItem,
   Host 준비 경로를 함께 보존한다. 기존 테스트 변경과 신규 테스트 모두 포함한다.
2. 설계·사용 문서: Host core 안내와 기존 안내/progress의 차이 설명.
3. 실행 증거: Host core 실패·중간·최종 로그와 manifest, 이번 기준선 기록.
   INDEX/README의 실측 카운터는 해당 문서가 추가되는 커밋에 같이 둔다.
4. 기존 H7/H8 미추적 기록은 이번 실행 결과와 별도 묶음으로 검토한다.
   출처와 이전 승인 범위를 확인한 뒤 관련 INDEX 행과 함께 포함한다.
5. `.gitignore`의 좁은 로컬 checkpoint/config 제외 규칙은 유지 후보다.

제외 대상: `.trials/` 내용 전체, `.codefleet/` 상태, SQLite/Lease/Run/승인 원장,
설치된 Host 홈, 인증·환경 파일, 임시 fixture, 원시 개인 경로 로그.
`git add .` 또는 미추적 디렉터리 통째 추가는 사용하지 않는다.
공개 로그는 개인 경로를 치환한 사본이며 fake 키 문자열을 실제 자격증명으로
오인하지 않도록 문맥을 검토한다. 제한된 패턴 검사는 비밀 부재의 완전한 증명이 아니다.
최종 승인 시 정확한 staged diff와 staged 파일 집합을 다시 검토해야 한다.

확인한 Git identity는 `sol <solarchive.dev@gmail.com>`, LICENSE는 MIT / solzip이다.
현재 설정을 변경하지 않았다. 사용자의 별도 승인 전 commit/push는 없다.

## 첫 Host 수용 계획

### 두 경로를 혼동하지 않는 판정

요청된 `$codefleet-plan` / `/codefleet-plan`은 H6의 엄격한 계획 프로필이다.
현재 `requirePlanningLive()`는 무조건 BLOCKED를 반환한다
(`src/hosts/planning.mjs` (working-tree line 17)). H8 오프라인 실행은 모델 네트워크까지 차단했으며
Claude 발견, 실제 모델 전송·인증과 read/search allowlist 증거를 대신하지 않는다.
따라서 이 이름으로 실제 Live 성공을 지금 약속할 수 없다.

Docker 없는 기본 경로의 별도 수용 이름은 `$codefleet` / `/codefleet`이다.
실제 Host 권한 하에서 CLI로 계획을 준비하며, H6 격리 통과로 기록하지 않는다.
이번에는 어느 쪽도 호출하지 않는다. 기본 경로의 사용성 수용을 먼저 선택하더라도
요청된 `codefleet-plan` 수용 항목은 별도 미충족으로 남긴다.

### 준비할 공개 가능 fixture

외부 서비스·의존성·개인 데이터 없는 작은 Node 저장소를 사용한다.
`package.json`, `src/events.js`, `test/events.test.js`, 설명 README만 둔다.
실제 저장소 생성과 파일 hash는 아직 수행하지 않았으므로 실행 승인의 특정
대상으로 취급하지 않는다. 코드·테스트를 사람이 먼저 검토하고 clean base를 고정한다.
fixture Git 초기 커밋이 필요하면 제품 저장소 커밋과 구별해 별도로 승인받는다.
Skill 설치 위치와 prep STATE는 시험 저장소의 코드 baseline과 분리한다.
설치할 Skill/runtime receipt hash, fixture base/tree, Host 버전을 측정한 뒤 요청을 발행한다.

양 Host에 동일한 목표를 준다:
“같은 이벤트 ID를 다시 받으면 부수효과가 중복 실행되지 않도록 수정 계획을
만들어라. 다른 ID는 처리하고, 처리 중 실패한 ID는 다음 호출에서 재시도할 수
있어야 한다. 이번에는 코드 수정이나 테스트 실행 없이 계획만 제시하라.”

### 엄격한 codefleet-plan 수용 순서

1. 실측한 Host/플랫폼의 read/search-only, fixture-only, fresh session,
   credential-inaccessible tools, 모델 전송과 도구 네트워크 분리, supervisor 및
   자원 제한을 먼저 증명한다. 미충족이면 모델 호출 전 BLOCKED.
2. 신뢰된 collector가 `beginPlanning`으로 pinned context/request를 만든다.
   현재 고정 프로필은 요청 1회, 도구 16회, 30초, 출력 65536 bytes다.
   장시간 수동 대기 후 제출해 expiry를 우회하지 않는다.
3. Codex에서 `$codefleet-plan`, Claude Code에서 `/codefleet-plan`을 호출한다.
   정확한 Skill 발견/선택과 세션 응답을 각각 관측한다. 한 Host 성공을 다른 Host에 전파하지 않는다.
4. Host는 fixture read/search만 사용하고 `{sessionId,requestHash,proposal}`를 응답한다.
   Draft의 objective/base 및 모든 source/test의 실제 path/line/quote가 있어야 한다.
   추론·unknowns를 분리한다. Host가 Validator CLI를 실행하거나 응답 파일을 쓰면 실패다.
5. collector가 새로 측정한 context/profile/skill hash로 `submitPlanning`을 호출한다.
   기존 `validateSemanticProposal`의 schema/reference/base 검사를 사용한다.
   성공 결과는 `VALIDATED`, `approved:false`, `executable:false`, `complete:false`다.
6. `workflowPreview`의 노드·의존 관계·scope를 조회한다. 이것은 영속 실행 DAG나
   승인된 Run이 아니다. 영속 DAG 수용은 별도의 신뢰된 준비 단계로 진행한다.
7. 같은 clean base에서 기존 `host HOST plan`, `draft TASK`로
   `{revision,proposal}`를 제출해 다시 검증하고 `prepare TASK`, `workflow TASK`,
   `status TASK`, `explain TASK`를 조회한다. H6 envelope를 draft CLI에 그대로 넣지 않는다.
   prepare의 exit 2는 승인 대기이며 complete가 아니다. request hash와 새 Task
   revision의 연결을 기록하고 base 변경 시 재계획한다.
8. 출력에 미검증 테스트·코드 변경·Host 격리·인증/전송·비용과 승인 없음이 명시되어야 한다.
   허위 승인/Evidence, 임의 shell, 범위 밖 읽기, 세션/내용 변경, 만료는 거절한다.

이 절차에는 현재 없는 자동 Live runner/collector를 있다고 가정하지 않는다.
관측·collector 운영 절차가 준비되지 않으면 실행 단계는 차단 상태다.

### 기본 codefleet 별도 수용 순서

기존 `scripts/host-install.mjs`로 각 Host용 기본 Skill을 설치하고 receipt를 확인한다.
실제 Host에서 기본 Skill을 발견·호출한 후, 위 목표로 plan → draft → prepare →
workflow/status/explain/approval-request를 수행한다. 명령과 데이터 형식은
[현재 안내](../../product-completion/host-core-guide.md)를 따른다.
Docker 없는 환경에서 DAG가 영속화되고 재조회되며 승인 원장은 비어 있어야 한다.
Host의 실제 도구 허용 범위만 주장한다. CLI 오프라인 회귀와 Live 호출을 별도로 기록한다.

## 후속 개발 사례와 수용 기준

계획 수용 후 별도로 승인할 사례는 단일 프로세스·동기 이벤트 처리의 중복 방지다.
같은 ID 재호출의 effect 횟수 1, 다른 ID 각각 처리, effect 예외 후 동일 ID 재시도,
서로 다른 handler 인스턴스의 상태 분리를 고정 테스트로 정한다.
분산 exactly-once, 재시작 후 영속 중복 방지, 동시 비동기 처리는 범위 밖이다.

보호된 baseline에서 중복 처리 테스트 실패를 먼저 관측한다. 소스 변경은
`src/events.js`로 제한하고 protected test identity를 고정한다.
Agent가 테스트나 승인·Evidence·Judge를 수정할 수 없어야 한다.
후속 execution은 현재 공개 Host run이 차단된 상태에서 내부 함수를 호출해 우회하지 않는다.

Local을 선택하면 전체 코드/설정/테스트·명령·실행 파일·tree hash를 사람이 검토하고
동일 사용자 실행 부작용을 별도 허용한 경우에만 실제 실행한다. 모델이 만든 코드는
그 자체로 trusted가 아니다. 결과는 LOCAL_PASSED 또는 INCONCLUSIVE이며 Run 완료 근거가 아니다.
보호 완료를 원하면 Container를 명시하고 image/preflight, 실패 baseline, 동일 test
identity의 전체 통과, contract/candidate hash, gate 결과를 수집한다. Judge ACCEPT와
기존 전체 Workflow 완료 조건을 모두 충족해야 한다. Docker가 없으면 보호 단계만
BLOCKED로 남긴다. 코드는 원본 대신 기존 후보 artifact로 전달한다.

## 모델 호출 전 정확히 승인할 범위

현재는 실행 승인을 요청하지 않는다. 다음 항목을 실제 값으로 채운 요청을 검토해야 한다.

- 경로 선택: 기본 `codefleet`의 비격리 준비 또는 H6 `codefleet-plan`; Host별 별도 승인.
- 공개 fixture 절대 경로/base/tree, Skill/runtime hash, Host 실행 파일·버전,
  사용할 기존 Host 계정의 모델 선택. CodeFleet는 인증정보를 읽거나 복사하지 않는다.
- 위 자연어 목표 1건, 새 계획 세션 1개, 수정/테스트/위임/외부 효과 없음.
  H6는 위 고정 예산을 그대로 적용한다. 기본 경로도 호출/시간/비용 한도를
  실제 Host에서 집행 가능한 값으로 합의하고 미관측 비용을 0으로 표시하지 않는다.
- Host 기존 인증·모델 통신만 허용할 구체적 경로와 제한. 도구 인터넷/직접 API는 불허.
  Host 자체 runtime/scratch 및 prep STATE 쓰기 허용 경로를 명시한다.
  계획 fixture는 읽기 전용이며 준비 metadata 쓰기와 코드 수정은 구별한다.
- 도구 목록, 입력/응답 최대 크기, deadline, 취소 방법과 종료 후 프로세스 확인,
  보존할 비식별 관측 자료를 고정한다. 비밀·세션 토큰·전체 개인 transcript는 수집하지 않는다.
- 별도 후속 승인 없이 개발 실행, Local 명령 신뢰, 위험 동작, Git commit/push/deploy로 확대하지 않는다.

## 결론

현재 기준선은 최종 오프라인 회귀가 통과한 미커밋 Core이며 Hybrid 관측 불안정성이 남는다.
기본 준비와 보호 검증의 구분을 유지하며 Alpha no-auth Doctor는 부분 확인이다.
실제 Host 수용은 미실행이며 HOST_LIVE_VERIFIED가 아니다.

## 다음 작업

커밋 후보 목록을 검토하고, 실제 값이 고정된 fixture/Host 수용 요청을 별도 준비한다.
엄격한 계획 Skill은 미충족 confinement/transport/collector 조건을 먼저 해결한다.

## 미해소로 남긴 것

H6 Live 경계, Claude 실제 Skill 발견, 실제 사람의 승인 입력, Host Sandbox,
자동 Host 위임 및 세션 비용 관측. 기본 Skill의 실제 호출도 이번에는 미실행이다.
내부 seam과 공개 실행 차단의 안내 문구 차이, 첫 Hybrid 동시성 관측 실패는
보고만 하고 소스/테스트를 바꾸지 않았다. 원인 규명 전 반복 안정성을 보장하지 않는다.
