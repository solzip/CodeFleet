# G1 — Alpha 계약 보호와 판정 경계

- 작업 일시: 2026-10-19 (Asia/Seoul)
- 대상 커밋: `c61e9b829b62dd41336a7225bf3b9165136484db` 위의 미커밋 G1 변경
- 브랜치: `feature/alpha-g0-refresh`
- 작업 유형: 분석·수정·실행·결정
- 선행 문서: `docs/runs/2026-10-19/alpha-baseline-refresh.md`, `docs/implementation/codefleet-implementation-v1/05-implementation/PHASED_WORK.md`, `docs/product-completion/architecture.md`, `CLAUDE.md`
- 번호 실측 최대값: P0-17 / P1-61. 기존 동결 등재부의 ID·등급·상태 변경 없음.

## 작업 전 확인과 문서 판단

작업 디렉터리의 Git branch/HEAD를 위 값과 대조했다. G0가 남긴 README 두 파일, INDEX 변경과 미추적 implementation/runs 문서를 보존했다. 기존 브랜치나 기록을 덮어쓰지 않았다.

선택한 운영 문서 14개를 decision-debt 검사기에 전달했다. 최종 후보 4개, 제외 후보 10개였다. 구현 전 원문과 실행 기록을 대조해 네 후보를 다음과 같이 해소했다. 검사기 결과를 그대로 구현 허가나 제품 사실로 사용하지 않았다.

| 후보 | 확인 근거와 처리 |
| --- | --- |
| progress 실행 불일치 | 과거 실패를 수정한 뒤 재검증한 기록이다. 과거 배포 실적을 현재 G1 증거로 사용하지 않으며 이번 테스트를 별도로 실행한다. |
| G0 실행 불일치 | 실패 로그를 보존하고 수정 후 종료 코드 0을 명시한 기록이다. 남은 경고와 미실행 범위도 구분돼 있다. 미해결 실패로 판정할 근거가 없다. |
| architecture 정체 | 금지되는 결합과 격리 한계를 정체로 오인했다. 목표 제약은 유지하며 새 권한 부여 근거로 삼지 않는다. |
| CLAUDE 결정 번복 | ID 유지·정정 기록 규칙은 상호 보완 규칙이며 충돌한 결정이 아니다. |

제외 후보는 대부분 근거 부족 또는 민감 맥락 휴리스틱이었다. 검사기의 POSSIBLE_SENSITIVE_CONTEXT 경고는 공개 전 검토 대상으로 기록한다. 이번 작업은 공개·전송을 수행하지 않으며 새 기록에 로컬 사용자 이름이나 인증정보를 넣지 않는다. 이 문서 감사는 전체 설계 정합성 인증이 아니다.

## 변경 전 구조와 문제

Controller는 이미 `execute(store, id, dependencies, options)`로 Snapshot/Context/Provider/Verifier/Delivery를 주입받는다. 별도 scheduler나 실행 엔진을 추가할 이유가 없다. Store는 owner와 lease 조건으로 상태·이벤트를 원자 저장하고, Verifier는 Node TAP 또는 Java JUnit을 Harness 실행 증거로 반환한다. Delivery는 판정과 분리돼 PR 의도·내용을 재조정한다.

반면 판정 함수는 contract 모듈에 있고, 기준선 판정은 Controller 안에 있었다. 기존 `judge`는 수치·무결성·테스트 동일성을 확인하지만 authority는 확인하지 않았다. 실제 Provider 경로가 검증기를 우회한다는 뜻은 아니다. 현재 Provider는 편집 제안이고 Controller는 별도로 verify를 호출한다. 문제는 향후 연결점이나 복구 입력에 Provider 보고를 넘겼을 때 판정 함수 자체가 이를 거부하지 않는다는 것이다.

반증 테스트를 먼저 실행해 4개 실패를 관측했다: 누락/Provider authority의 ACCEPT, 미관측 기준선에서 시도 소비, Provider 전용 후보로 COMPLETED, Provider 전용 증거의 전달 재조정 완료. 나머지 새 반증은 기존 보호 동작을 확인했다.

## 실제 수정 파일과 책임

| 파일 | 책임과 변경 |
| --- | --- |
| `src/alpha/judge.mjs` | 신규 순수 `judge(evidence)`와 `isFailingBaseline(evidence)`. HARNESS_EXECUTED만 판정 입력으로 수용. 상태·파일·프로세스·원격 쓰기 없음. |
| `src/alpha/contract.mjs` | V1 스키마와 편집 검증을 그대로 유지. 기존 judge import는 재export로 호환. |
| `src/alpha/controller.mjs` | 기준선과 후보 판정을 Judge에 위임. 실행 순서·상태 저장·계약/시간/시도 guard·lease·복구·전달 의도 관리는 계속 Controller가 소유. |
| `test/alpha.test.mjs` | authority 및 실패·복구 반증, lease 교체 fencing, Node/Maven 실제 검증 루프를 추가. 기존 성공 fixture에는 실제 Verifier가 반환하는 authority를 명시. 누락 authority 거부 테스트를 별도로 둠. |
| `docs/product-completion/progress.md` | G1 현행 증거 링크. 과거 배포 기록 보존. |
| `docs/INDEX.md`, `README.md`, `README.en.md` | 신규 기록 색인과 실측 기록 수 반영. 검사 baseline 완화 없음. |
| 이 문서와 G1 로그 | 실패→수정→재검증 증거 및 한계 기록. |

구현 근거(현재 미커밋 트리): `src/alpha/judge.mjs:5`, `src/alpha/judge.mjs:11`, `src/alpha/controller.mjs:23`, `src/alpha/contract.mjs:70`. 주요 반증: `test/alpha.test.mjs:49`, `test/alpha.test.mjs:116`, `test/alpha.test.mjs:130`, `test/alpha.test.mjs:191`. 이 위치는 기준 커밋에 새 코드를 소급해 주장하는 인용이 아니다.

## 최소 연결 계약

`execute`는 신뢰된 호스트 코드의 연결점이며 Provider가 설정할 수 있는 플러그인 권한이 아니다. 새 Provider 연결은 기존 `propose({contract, files, feedback, timeoutMs, cancelled})`의 편집 제안·비용 반환 범위 안에서만 가능하다. Provider의 state/outcome/evidence 필드는 완료 판정에 사용하지 않는다.

`verify({directory, contract, tests, timeoutMs, cancelled, containerName})`는 Harness 소유다. Controller가 후보 해시·계약 해시·검증 전후 무결성·테스트 동일성을 결합하고 Store에 기록한 후 Judge를 호출한다. authority 문자열 자체가 진위 서명은 아니다. 신뢰된 verifier 출처, 해시 확인과 기존 실행 경계가 함께 필요하다.

Judge의 ACCEPT는 검증 판정이다. Controller가 local 산출물을 확정하거나 DELIVERING을 먼저 저장하고 Delivery 확인 후에만 COMPLETED로 진행한다. 전달 불확실성은 RECONCILING으로 남고 검증 성공으로 원격 효과 성공을 추정하지 않는다. 이 연결점 외의 런타임 프레임워크·Provider API·DAG는 추가하지 않았다.

## 호환성

V1 계약 필드·예산·경로·보호 테스트·CLI 명령은 동일하다. SQLite user_version 1과 기존 테이블/lease/owner/복구 로직, Provider no-tool 옵션, Docker 격리, Delivery API는 수정하지 않았다. `contract.mjs`의 judge 재export는 기존 진입점과 같은 함수임을 검사한다.

유효한 기존 Node/Java Verifier 산출물은 이미 HARNESS_EXECUTED를 포함하므로 정상 판정과 reason은 유지된다. authority가 없거나 Provider 전용인 입력은 이제 명시적으로 거부한다. 과거 증거를 고쳐 권한을 덧씌우거나 DB를 마이그레이션하지 않는다. 완결된 기존 run을 재실행하지 않는 동작도 유지한다.

## 검증 명령과 범위

Windows / Node v24.14.1. 모든 종료 코드는 명령 직후 저장했으며 로그 출력의 종료 코드로 대체하지 않았다.

| 명령 | 종료 코드 | 결과 |
| --- | --- | --- |
| `node --test test/alpha.test.mjs` (수정 전 반증) | 1 | 새 테스트 4개 실패 확인 |
| `node --test test/alpha.test.mjs test/alpha-java.test.mjs` (초기 수정 후) | 0 | 35 통과, JDK opt-in 1 제외 |
| 동일 명령, Docker/Maven/JDK opt-in 활성화 | 0 | 39/39 통과, 제외 0 |
| `node src/alpha/cli.mjs doctor` | 0 | Git/Claude/gh/Claude 인증/격리 검증기 5/5 |
| `node scripts/alpha-verifier-smoke.mjs` | 0 | Node 경계 1건 통과, 잘못된 구현 exit 1, 시간 초과 interrupted=true |
| `npm.cmd test` (동일 opt-in을 켠 전체 필수 게이트) | 0 | Legacy 324/324, Alpha 39/39, 제외 0, posttest 완료 |
| `npm.cmd run posttest` (최종 결과 문서 갱신 후) | 0 | coverage/link/citation/fact 검사 재통과 |

opt-in 환경: CODEFLEET_TEST_DOCKER=1, CODEFLEET_TEST_JAVA=(Get-Command java).Source, CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45. 로컬에 이미 준비된 불변 Maven 이미지만 사용했고 새 이미지 다운로드·빌드·네트워크 준비는 하지 않았다.

Node/Maven 루프는 고정 Provider 제안과 임시 소스 snapshot을 사용한다. 실제 Controller·Store·후보 쓰기·Docker Verifier·Judge를 거쳐 각각 실패 기준선에서 1/1, 2/2 통과로 전환하고 보호 테스트 불변, accepted artifacts, 재실행 시 Provider 추가 호출 없음을 확인했다. Git createRun 및 실제 모델/PR 전달까지 포함한 전체 제품 E2E로 확대 해석하지 않는다. Java JUnit 파서 4/4 검사는 G0와 동일한 별도 실행 조건을 포함했다.

실행 로그: [실패 재현](codefleet-g1-red.log), [초기 집중 검사](codefleet-g1-focused.log), [격리·JDK 검사](codefleet-g1-isolated.log), [전체 필수 게이트](codefleet-g1-full.log). 미커밋 코드의 정확한 대상은 [SHA-256 기록](alpha-g1-source-evidence.json)으로 고정했다.

전체 posttest는 링크 111개 문서·142개 링크 오류 0, 현행 인용 오류 0, 선언 사실 42개 불일치 0이다. 과거 인용 의심 경고는 11개다: 기존 8개와 이번 미커밋 코드 인용을 기준 커밋으로 검사한 3개. 새 judge 파일과 수정된 테스트 위치는 기준 커밋에 없으므로 현재 트리와 해시 기록으로 확인했다. 이를 숨기기 위해 검사기나 역사 기록을 바꾸지 않았다.

## 남은 위험과 미검증

- authority 확인은 형식 방어이며 임의 호스트 코드나 악성 in-process 테스트에 대한 보안 인증이 아니다.
- 실제 Claude/Codex 호출, 원격 PR 생성·배포, Gradle 실제 Docker 실행, 다른 OS와 패키지 설치는 재실행하지 않았다. PR 응답 유실·중복 방지는 기존 모의 API 테스트로 검증한다.
- Store의 UUID owner와 lease fencing을 보존했다. 외부 프로세스 중단 보장이나 일반화된 분산 fencing epoch를 추가한 것이 아니다.
- 기존 문서의 과거 인용 경고는 별도이며 동결 기록을 수정하지 않는다.

## 결론

G1 완료: 전체 필수 게이트 exit 0, Legacy와 Alpha 합계 363개 통과·제외 0.
유효한 V1 실행을 보존하고 Provider 전용 증거의 판정·복구 수락을 차단했다.
G2 진행을 막는 이번 범위의 실패는 없으며, 구현은 사용자 후속 지시까지 시작하지 않는다.

## 다음 작업

G2는 기술적으로 착수 가능하다. 실제 Provider capability를 별도로 입증해야 하며 G1 결과가 이를 대신하지 않는다. 이번 실행에서 G2–G6 구현·커밋·푸시는 수행하지 않았다.

## 미해소로 남긴 것

위 미검증 항목. 필수 검증 실패는 남아 있지 않다.
