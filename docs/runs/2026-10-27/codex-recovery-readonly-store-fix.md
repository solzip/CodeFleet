# P0-C RECOVERY_INIT_WRITE 최소 수정

- 일시: 2026-10-27. Windows Native / PowerShell / Node v24.14.1.
- 대상 기준: detached `core-p0-1`, `19ddf671410e92fc9d9e4fa423aeb829981c5bfa`와 기존 미커밋 P0 변경. root main `4477e4426960af46076d3aa29808201c1c8911a6`; 원격 동일성은 미확인.
- 작업 유형: Recovery/Store 최소 수정 및 격리 내부 반증·회귀. 실제 모델·Live 적용·Session 2·Git 게시 금지 유지.
- 선행: [A 승인 준비와 결함 판정](codex-recovery-resume-preparation.md), [Recovery 계약](../../implementation/objective-recovery.md), [제품 원칙](../../PRODUCT_VISION.md).
- 결함 식별: 기존 `RECOVERY_INIT_WRITE` 후속. Legacy P0-17 / P1-61 번호와 과거 판정 보존.
- 사용자 가치: 저장된 Objective·제안·소비 기록을 바꾸지 않고 복구해 중복 실행과 승인 재사용을 막는다. Controlled Process / Verified Results 원칙 적용.

## 원인과 최소 변경

기존 `productCli`는 recover에도 일반 writable Store를 생성했다. 생성자는 디렉터리 생성,
WAL 모드 설정과 CREATE TABLE을 수행했고, dispatch는 recover 분기보다 먼저 enableTasks를
호출했다. enableTasks → enableCollaboration → enableWorkflows 경로는 BEGIN IMMEDIATE,
DDL, INSERT OR IGNORE, PRAGMA user_version=2를 수행했다.

또한 기존 Decision이 있으면 Recovery → continuationSnapshot → taskReport →
reservationStatus가 enableReservations와 쓰기 트랜잭션을 호출했다. 첫 수정 후보의
Recovery 테스트에서 이 두 번째 원인으로 4건 실패했다. 해당 실패와 로그는 보존했다.

| 제품 파일 | 이번 변경만의 diff | 변경 |
| --- | --- | --- |
| src/alpha/store.mjs | +19 / -7 | 선택적 readOnly 연결, 생성/초기화 분리, quick_check, 실패 시 close, migration/artifact 쓰기 거부 |
| src/product/cli.mjs | +2 / -2 | recover만 readOnly Store로 열고 enableTasks보다 먼저 분기 |
| src/product/recovery.mjs | +27 / -0 | 기존 V2 테이블/필수 열/extension 버전 검사; 없는 기능 자동 설치 금지 |
| src/product/reservations.mjs | +2 / -0 | readOnly Store에서는 기존 committedStatus만 읽음; writable 경로는 기존 트랜잭션 유지 |

제품 소스는 4개 파일, +50 / -9로 제한했다. 세션 시작 시 저장한 실제 working-tree 파일과의
차이이며, HEAD와의 diff에 섞이는 이전 P0 작업을 이번 수정으로 계산하지 않았다.
테스트는 기존 `test/recovery.test.mjs` 확장 및 `test/fixtures/recovery-worker.mjs`의
recover 연결 옵션 변경이다. 새 엔진·권위 State·스케줄러·런타임 의존성은 없다.
정확한 diff는 로컬 `.codefleet/p0-c-evidence/init-write-fix-01/change.patch`에 있다.

## 읽기와 쓰기 분리

`new Store(directory, { readOnly: true })`는 mkdir 없이 기존 DB만 연다.
SQLite native readOnly flag가 없는 DB의 생성과 쓰기를 거부하며, connection-local
query_only는 추가 방어다. query_only를 꺼도 native flag의 쓰기 거부가 유지되는지 검사했다.
읽기 연결에서 WAL 모드 변경이나 초기화/마이그레이션은 하지 않는다.

[Node 공식 문서](https://nodejs.org/download/release/v22.12.0/docs/api/sqlite.html)의
readOnly 옵션은 없는 DB 열기를 실패시킨다. 프로젝트 engines는 Node >=24.14.1이며
실제 설치된 v24.14.1에서 동작을 시험했다. 다른 OS/미래 런타임 검증을 대신하지 않는다.

Recovery는 V2와 필수 기존 테이블/열, controlled-hybrid/product-tasks version 1을 요구한다.
Decision이 없던 State에는 Reservation 테이블이 둘 다 없어도 된다. 일부만 있거나
extension 버전이 다르면 실패한다. V1은 Store의 일반 읽기 가능성과 별개로 Recovery에서는
명시적인 migration 필요 상태로 거부하며 자동 승격하지 않는다. V0·미지원 버전·손상 DB도
차단한다. 생성 중 검증 실패는 catch에서 close하고, CLI 성공/오류는 finally에서 close한다.

예약 조회는 기존 consumed/revoked/expired 판정과 Evidence 검사를 재사용한다.
읽기 연결에서 초기화·쓰기 트랜잭션을 생략할 뿐 승인·Attempt·Lease를 생성하지 않는다.
관측은 잠금이나 원자적인 전체 파일시스템 스냅샷이 아니며, 후속 실행의 기존 승인·후보·
Lease fence는 그대로 필요하다. RECONCILE/HUMAN_HANDOFF와 budget 소비 보존을 유지한다.

## 검증과 실패 보존

모든 기능 테스트는 임시 격리 Fixture를 사용했다. clone 검사에서도 임시 Fixture의 State를
복사했고 embedded repo identity는 해당 임시 Fixture만 가리킨다. Live State는 열지 않았다.
테스트의 Local 명령은 이 격리 Fixture의 명령이며 Live A 적용이나 Live 검증이 아니다.

| 실행 | 결과 |
| --- | --- |
| 최초 `node --test test/recovery.test.mjs` | exit 1; 28건 중 24 pass / 4 fail / 0 skip. 예약 조회의 숨은 초기화 때문에 readonly 오류; 기준 약화 없이 수정 |
| 최초 관련 회귀 6 suites | exit 0; 123 pass / 0 fail / 0 skip |
| 최종 `node --test test/recovery.test.mjs` | exit 0; 30 pass / 0 fail / 0 skip |
| 최종 관련 회귀 | exit 0; 123 pass / 0 fail / 0 skip |
| `node --test --test-name-pattern='leases\|stale worker\|creation is atomic\|failed resume transaction' test/alpha.test.mjs` | exit 0; 선택한 4 pass / 0 fail. 전체 Alpha suite 통과 주장이 아님 |
| 문서 links / citations / facts, diff whitespace | 소유 계정에서 모두 exit 0. 최초 sandbox 문서 검사는 Git 소유권 오류로 각각 exit 1; 기존 역사 인용 경고 보존 |

관련 회귀 명령:

```text
node --test test/bootstrap-reservations.test.mjs test/continuation.test.mjs test/native-local.test.mjs test/development-loop.test.mjs test/bootstrap-process.test.mjs test/time-safety.test.mjs
```

Recovery 반증은 r7 FILESET_PROPOSED 복원, 전체 논리 테이블·Event·예산·Artifact 보존,
SQL 추적상 initialization/write transaction 없음, INSERT/UPDATE/DDL/BEGIN IMMEDIATE 거부,
없는 DB/디렉터리 미생성, V0/V1/future 및 누락 table/column/extension·손상 파일의 fail-closed,
성공·오류 시 close, 기존 writable 생성·migration, consumed reservation 관측을 다룬다.
별도 프로세스 복구와 crash/expiry/revocation/변조 및 중복 실행 차단의 기존 테스트도 유지했다.

WAL reader 테스트에서는 별도 writer가 BEGIN IMMEDIATE를 보유한 상태에서 Recovery가
committed rows만 읽는지 검사한다. 운영 WAL/SHM의 바이트 불변을 요구하지 않으며,
동결된 손상/구버전 Fixture에서는 파일 바이트가 자동 수정되지 않는지도 검사한다.

명령 종료 코드는 stdout tail 등의 결과와 분리해 즉시 저장했다. npm test/posttest 전체,
Docker protected suite, 실제 Codex 호출, Session 2, macOS/Linux는 NOT_RUN이다.
범위 제한 내부 검증이며 Protected/Host Live 수용을 의미하지 않는다.

사전 Decision Debt 점검은 이번 사용자 지시 1건만 사용했다. 근거 있는 차단 카드 0,
근거 부족 제외 후보 1이었다. 최초 입력은 확장자 누락으로 도구가 거부했고 .md 명칭으로
정정했다. 이는 실행 권한이나 전체 문서 무결성 인증이 아니다.

## Live 보존과 A 승인 패킷 재검토

`review-live.mjs` exit 0. P0-C와 P0-B Live Fixture의 repo/State 모든 파일 해시가
작업 전과 동일하다. 원본 Live DB를 연결하지 않고 DB/WAL/SHM 복사본만 읽어
기존 Recovery 이전 전체 논리 행과 대조했다. 모든 Artifact digest도 보존됐다.

| 항목 | 최종 확인 |
| --- | --- |
| Task | task-8f9e7574-8485-48d9-b441-09a559dcc521 |
| Revision / WorkItem | 7 / normalize FILESET_PROPOSED |
| Fileset run | WAITING_APPROVAL; 적용 결과 없음 |
| Local 예산 | 0/3 소비, 3회 남음; 120000 ms 남음 |
| 승인 / Decision / Lease | A 승인 없음; Decision 테이블 없음; 두 run owner/pid null, leaseUntil 0 |
| Fileset hash | `086603b543afec439464699f09c989384f274954786fa4eb8f2ce105096e7123` |
| 내용 Artifact | `cd9f30e85eced576e389aad412915adc2abe8a86143247fa15f985c12783041a` |
| 전체 논리 행 hash | `57bf7bf8df3b0d8a81b45c31794ad14dbd60b3349b7a1085b680318918a93f96` |

기존 A 승인 패킷은 덮어쓰지 않았다. 재검토 요청은 로컬
`.codefleet/p0-c-evidence/init-write-fix-01/a-fileset-approval-request-reviewed.json`에
`REVIEWED_AWAITING_FRESH_EXPLICIT_APPROVAL`로 기록했다. `approvalIssued=false`,
`executionGranted=false`; actor/발급 시각/절대 만료 시각은 아직 null이다.
기존 파일 내용·Task/Workflow/Candidate/Fileset binding을 유지한다.
대상 `src/normalize-title.mjs`는 여전히 없으며 제안은 UTF-8 LF 168 bytes,
SHA-256 `1de99612644ad675a36e16a8d1a0a9c8a1e1c7db10ebf6ff5b9adb99be9c13d4`다.

RECOVERY_INIT_WRITE로 인한 내부 차단은 해소됐다. **새 명시적 승인을 받는 단계로
재개 가능**하며 실제 A 적용은 아직 허가되지 않았다. 기존 요청대로 발급 후 최대 1시간,
A create 1회만 대상으로 한다. 당시 Task/후보·대상 부재·Dependency·Lease·예산 및
Fixture 소유 계정의 실제 scoped-write Capability를 실행 직전 재확인해야 한다.
계정·소유권·safe.directory 변경은 하지 않았다. 이번 내부 검사 시간은 Live Local 예산을
소비하거나 초기화하지 않는다. 원본 State/Evidence 삭제, 모델 호출, Live 적용/테스트 및 Git 게시는 없다.

## 결론

읽기 전용 Recovery와 기존 writable 경로의 내부 검증은 통과했다.
P0-C r7 및 P0-B Live 상태·제안·Evidence를 보존한 채 A 요청을 재검토했다.
실제 A 적용은 새 명시적 승인 대기이며, Host Live/Protected 수용은 주장하지 않는다.

## 다음 작업

내부 검증과 Live 보존 확인을 완료했으며 기존 Revision 7의 A Fileset 요청을 재검토했다.
새 명시적 A 적용 승인 없이는 적용하지 않는다. A Local 검증과 Session 2 모델 호출은
각각 별도 exact 승인 및 당시 바인딩으로 진행해야 한다.

## 미해소

Live A 적용·Local 검증·실제 두 Codex 세션 연속성, 실제 compaction, Protected Evidence,
macOS/Linux 및 Host 내부 요청 수/USD 측정. 기존 Fixture Git 소유 계정 조건은 유지된다.
