# P0-C Recovery 이후 A 적용 승인 준비

- 일시: 2026-10-27; Windows Native / PowerShell / Node v24.14.1.
- 대상: detached `core-p0-1`, `19ddf671410e92fc9d9e4fa423aeb829981c5bfa`; 기존 미커밋 변경 보존. 루트 main `4477e4426960af46076d3aa29808201c1c8911a6`; 원격 동일성은 미확인.
- 유형: 읽기 전용 상태 감사 및 승인 요청 작성. 실행 권한 없음.
- 선행: [Session 1과 Recovery 기록](codex-host-session1-recovery.md), [Recovery 계약](../../implementation/objective-recovery.md), [제품 원칙](../../PRODUCT_VISION.md).
- 번호: 기존 P0-17 / P1-61 유지. 신규 Legacy 번호 없음. 이번 결함은 이 문서의 `RECOVERY_INIT_WRITE`로 추적.

## 판정

**A 실행 BLOCKED / 승인 패킷 REQUEST_ONLY.** 동일 Objective와 제안은 보존됐다.
Recovery 조회 경로의 불필요한 쓰기 초기화가 확인돼 실행 준비 완료로 승인하지 않는다.
가치는 재생성·중복 실행 없이 같은 목표를 이어가는 것이며, Controlled Process와
Verified Results 원칙에 따라 저장된 효과·권한·후보를 대조했다.

## 영속 상태 대조

권위 있는 Fixture는 worktree 상대 경로
`.codefleet/p0-c-evidence/host-recovery-fixture/{repo,state}`다.
기존 `session1-approved-02/recovery-before.json`, `recovery-stdout.json`,
`recovery-result.json`, `record-receipt.json`과 현재 SQLite를 대조했다.
원본 DB를 연결하지 않고 DB/WAL/SHM의 바이트 안정성을 확인한 복사본에
`DatabaseSync({readOnly:true})` 및 `PRAGMA query_only=ON`으로 SELECT만 수행했다.
복사본은 관측용이며 실행 State로 사용하지 않는다. Recovery 명령·테스트는 재실행하지 않았다.

| 항목 | 관측 |
| --- | --- |
| Objective / Task | `task-8f9e7574-8485-48d9-b441-09a559dcc521` |
| 목표 | 제목 정규화와 Todo 생성 기능을 구현하고 실제 테스트로 검증 |
| Task revision | 7; 제안 생성 revision 6과 구분 |
| A | `normalize`, FILESET_PROPOSED; run WAITING_APPROVAL |
| DAG | fixed-tests → normalize → verify-normalize → todo → verify-integrated → protected-review |
| Local 예산 | 0/3 소비, 3회 남음; 예약 시간 0, 잔여 120000 ms; 초기화 없음 |
| Lease / 미확정 효과 | 두 run 모두 owner/pid null, leaseUntil 0; A results 빈 객체; 활성/미확정 효과 없음 |
| 승인 / Decision | fixed-tests 과거 승인 1행만 존재. A 승인 없음. Decision/Reservation 테이블 자체가 아직 없음; 새로 초기화하지 않음 |
| Evidence | fixed-tests materialization receipt 존재; A/B 검증 Evidence 없음 |
| 전체 논리 상태 | 9개 테이블 모두 Recovery 전 snapshot과 동일. events 17행, Task Work Log 8개 / 마지막 seq 17 |
| Artifact | 8개 모두 파일명 digest와 내용 SHA-256 일치; 이전 Artifact 보존 |
| 원본 보존 | 이번 검사 전후 Fixture repo 및 State 전체 파일 해시 동일 |

전체 행 digest는 `57bf7bf8df3b0d8a81b45c31794ad14dbd60b3349b7a1085b680318918a93f96`.
Work Log digest는 `4ed91c8e6b4c66e36a4c90fa615fe9d308dbc5dab2d7d15bcb5149bf1d2ab22a`.
Host Session 1 종료와 별도 Recovery exit 0은 기존 기록의 근거를 재사용했다.
이번에 새로운 Host 호출이나 Recovery 성공 관측을 만들지 않았다.

## A 적용 승인 요청 — 아직 발급하지 않음

전체 기계 판독 패킷은 로컬
`.codefleet/p0-c-evidence/resume-preparation-01/a-fileset-approval-request.json`에 있다.
개인 경로와 계정 SID가 포함된 로컬 자료는 공개 산출물이 아니다.

| 바인딩 | 정확한 값 |
| --- | --- |
| Task hash | `8dc4614578d5b9edd78fd74831dbe97c541fa6d7b1e108e973a2070704eb06d1` |
| Workflow hash | `6b86ce71bb9f1f1465d0885f050e228201becb5fc63f0f18c3f3f4b6b9041047` |
| 적용 전 Candidate hash | `5c817452787f0760e51cc33799b79821e1bec5f69f761ec8f163a752d31eba29` |
| 기존 run / fileset revision | `task-8f9e7574-8485-48d9-b441-09a559dcc521-normalize-r6` / 1 |
| Fileset hash | `086603b543afec439464699f09c989384f274954786fa4eb8f2ce105096e7123` |
| 내용 Artifact | `cd9f30e85eced576e389aad412915adc2abe8a86143247fa15f985c12783041a` |
| Host 제안 관측 Artifact | `5c610c2be70433ce26e4b50ff53214547760f1c49c4671746cfad6b8a40bb425` |
| 파일 / 연산 | `src/normalize-title.mjs` / create 1회; overwrite 불가 |
| 현재 파일 | 없음; 현재 SHA-256 null (빈 파일 hash가 아님) |
| 제안 파일 | UTF-8, LF, 마지막 LF 포함 168 bytes |
| 제안 SHA-256 | `1de99612644ad675a36e16a8d1a0a9c8a1e1c7db10ebf6ff5b9adb99be9c13d4` |

기존 제안의 정확한 내용:

```js
export function normalizeTitle(input) {
  const title = input.trim();
  if (title.length === 0) {
    throw new Error('Title must not be blank');
  }
  return title;
}
```

원본 A/B 소스는 없다. 현재 존재하는 fixed input은 다음과 같고 이전 digest와 일치한다.

| 파일 | SHA-256 |
| --- | --- |
| package.json | `1239d4d885dcad42201a27ed9324f8f0f760b78700d8db9ced39a511cffe7eae` |
| test/normalize-title.test.mjs | `a1fdf12b8b4ac5c53bd98ffc156224f3a434c579ae749a9f4250c22d28b8777d` |
| test/create-todo.test.mjs | `6b2be09b354ebe7791482302144db35c7d4af4d0da888de2834dd232a0c5cb3c` |

필요 Capability는 `scoped-write`, 승인은 새로운 `HASH_BOUND_FILESET`이다.
`objective approve TASK --hash FILESET_HASH --actor ACTOR --state STATE`의 hash는
Workflow hash가 아닌 위 Fileset hash다. 현재 CLI 유효기간은 발급 시각부터 3600000 ms이며
`--expires`로 이를 조절하는 구현은 없다 (`src/product/cli.mjs:159`).
따라서 요청 범위는 **향후 명시적 승인 시점부터 최대 1시간 내 A create 1회**다.
발급 시각·절대 만료 시각·actor는 아직 미발급이며 null이다. 세션 변경으로 연장하지 않는다.
승인 후 실행은 기존 public materialize의 `freshOnly` 경로를 사용한다.
부분 효과나 중단이 발생하면 자동 재적용하지 않고 RECONCILE한다.
Local 검증, 모델 호출, B 적용, Git 쓰기는 이 요청에 포함되지 않는다.

실행 직전 Task revision/hash, Workflow/Candidate/Fileset hash, 원본 제안 바이트,
대상 부재, fixed-tests receipt/digests, 승인·Lease·예산을 다시 대조해야 한다.
현재 패킷은 잠금이나 권한이 아니다. 파일셋 manifest의 hash만으로 Task revision이
자동 고정된다고 주장하지 않으며, 명시적인 현재 바인딩 대조도 필요하다.

### 계정과 Fixture Git 소유권

Fixture repo와 `.git` 소유자는 현재 sandbox 계정(SID 끝 `1004`)이다.
이 계정의 Git status는 exit 0이며 fixed input 3개만 untracked다.
`rev-parse --verify -q HEAD` exit 1, `symbolic-ref -q HEAD` exit 0으로
`refs/heads/master`의 unborn HEAD를 확인했다. 전역 ignore 파일 접근 경고는 있었다.
사용자 계정(SID 끝 `1001`)에서는 Fixture Git이 dubious ownership으로 거부됐다.
root/worktree Git 소유 계정과 Fixture Git 소유 계정은 서로 다르다.

A의 로컬 적용 계정 후보는 **현재 Fixture 소유 계정**이다. Git 읽기 적격성만 확인했으며
실제 쓰기 Capability는 이번 제한상 실행으로 검증하지 않았다. Host 모델 계정과 혼동하지 않는다.
새 Session 2 모델 호출에는 Host 인증 가능한 계정과 별도 승인·읽기 범위가 필요하다.
소유권 변경, safe.directory 설정, 새 계정 또는 인증정보 복사는 수행하지 않았다.

## SQLite 판정: RECOVERY_INIT_WRITE

기존 Recovery 전후 모든 논리 행은 동일하며 현재도 동일하다. 승인·Decision·Attempt·
예산·Event 변경은 관측되지 않았다. 기존 기록에는 DB digest 변경, SHM 생성,
길이 0인 WAL 생성이 있다. 바이트 차이만으로 논리 Recovery 실패를 선언하지 않는다.

그러나 현재 실행 경로는 읽기에 불필요한 초기화 트랜잭션을 포함한다:

1. `src/product/cli.mjs:185`: 일반 Store를 생성.
2. `src/alpha/store.mjs:8`: read-write DB와 WAL/CREATE 초기화.
3. `src/product/cli.mjs:83`: recover 분기 전에 enableTasks 호출.
4. `src/product/tasks.mjs:19`: enableCollaboration 후 BEGIN IMMEDIATE와 INSERT OR IGNORE.
5. `src/alpha/store.mjs:18`: enableWorkflows의 BEGIN IMMEDIATE, DDL, PRAGMA user_version=2 및 COMMIT.
6. `src/alpha/store.mjs:29`: enableCollaboration의 추가 BEGIN IMMEDIATE 및 INSERT OR IGNORE.

따라서 **정상 WAL/SHM 접근만 있었다는 판정은 불가**하며 불필요한 쓰기 초기화는
제품 결함이다. 정확히 어느 페이지 바이트가 어느 SQL로 바뀌었는지는 이전 원본 DB
이미지가 없어 확정하지 않는다. 기존 기록의 logical recovery exit 0은 그대로 보존한다.

수정 방향은 기존 Store에 명시적 read-only 열기와 기존 스키마 확인을 두고,
Recovery 분기가 schema migration/enableTasks를 실행하지 않게 하는 최소 경로다.
별도 권위 DB나 스케줄러를 도입하지 않는다. 이번에는 제품 코드를 수정하지 않았다.
테스트 금지 상태에서 검증하지 못한 수정으로 차단을 해제하지 않는다.
해제에는 기존 State에서 initialization/write transaction 없음, 논리 상태 보존,
누락·비호환 schema의 fail-closed 및 기존 write 경로 회귀에 대한 별도 허용 검증이 필요하다.

## Session 2 실제 수용 조건

1. 위 결함 해소 후 새 A Fileset 승인으로 기존 제안만 1회 적용하고 materialization receipt,
   새 Task revision/Candidate를 기록한다. 기존 제안을 재등록하거나 모델로 재생성하지 않는다.
2. 적용 후 별도 exact Local review/승인과 새 request/Decision 아래 verify-normalize를 실행한다.
   `LOCAL_PASSED` Evidence의 계약·후보·명령·파일 digest·소비 Attempt/시간을 확인한다.
3. 그 시점의 Task revision, workflow/task/candidate hashes, A Evidence, 전체 Work Log,
   승인·Lease·남은 예산을 고정한 새 Session 2 요청을 작성한다. 현재 r7 바인딩을 재사용하지 않는다.
4. 실제 새 Codex 세션/프로세스에서 이전 thread resume·대화 요약 없이 원문 Objective와
   해당 권위 State/Artifact로 복구한다. 새로운 thread/process 및 입력 context manifest를 기록한다.
5. A는 MATERIALIZED, verify-normalize는 유효한 LOCAL_PASSED이고 B(todo)의 waitingOn이
   비어 있어야 한다. A 재실행·재승인·예산 초기화가 없음을 Event/receipt로 증명한다.
6. **두 번째 모델 호출의 별도 승인**은 당시 바인딩, B 파일 `src/create-todo.mjs`,
   prompt/schema/executable/input hashes, 모델·추론·인자, 시간/출력/비용 범위를 고정한다.
   현재는 B exact 호출 패킷을 완성할 수 없다. Session 1의 1회 호출 승인은 소비된 역사다.
7. B 제안은 새 Fileset 승인, B 적용은 새 Candidate/materialization receipt,
   통합 검증은 새 Local 승인·Attempt·Evidence로 연결한다. A Evidence는 유효한 의존성/
   LOCAL_CHECKPOINT로만 재사용하며 B 추가 후 통합 후보 성공으로 대신하지 않는다.
8. 실제 두 세션 연속성, Local 결과, Protected 수용과 실제 compaction을 분리한다.
   protected-review는 여전히 필수 Capability가 없으며 Objective complete=false를 유지한다.

## 실행 기록과 한계

- `node .codefleet/p0-c-evidence/inspect-resume.mjs`: exit 0. SELECT 기반 대조 10항목과 원본 보존 확인. 테스트/Recovery 실행이 아님.
- Git 상태·HEAD·소유권 조회 수행. root/worktree 최초 sandbox Git 조회는 ownership 실패;
  소유 계정 조회로 기준 확인. Fixture 사용자 계정 조회는 ownership 실패;
  Fixture 소유 계정 status 0 / unborn HEAD 1 / symbolic-ref 0. 복합 shell 최종 0을 개별 Git 성공으로 계산하지 않음.
- 신규 모델 호출, Fileset 등록/적용, 승인·Decision 발급, 제품 테스트, 문서 검사,
  Commit/Push/PR/Merge: 모두 NOT_RUN. 원본 State/Evidence 삭제 없음.
- 로컬 산출물: inspection.json, rows.json, account-inspection.json, a-fileset-approval-request.json,
  inspection-copy. 마지막 것은 감사 복사본일 뿐이다.
- 문서와 승인 요청만 작성. 제품 source/test 변경 없음. 테스트를 통한 결함 재현·수정 검증을 주장하지 않음.
- 패킷 보완·문서 갱신 복합 명령은 exit 1: PowerShell stdin의 한글 인코딩으로 README 검색 문자열이 손상됐다.
  패킷 보완까지만 완료됐고 문서 변경 전에 중단됐다. 문서는 UTF-8 patch로 반영했으며 검사 통과를 주장하지 않는다.

## 결론

저장된 제안과 동일 Objective는 보존됐고 A 요청은 정확한 바이트와 현재 바인딩으로 작성됐다.
Recovery 초기화의 불필요한 쓰기 때문에 A 실행은 BLOCKED이며 승인·적용은 수행하지 않았다.
실제 Session 2, A/B Local 검증, Protected 완료는 미수용이다.

## 다음 작업

기존 Store/Recovery의 최소 읽기 전용 수정과 별도 허용 검증 후 현재 바인딩을 재확인하고
새 A 적용 승인을 받는다. 그 다음 A 검증, 별도 Session 2 모델 호출 승인 순서로 진행한다.

## 미해소

RECOVERY_INIT_WRITE, 실제 쓰기 Capability 측정, A/B 검증과 두 Codex 세션 연속성,
실제 compaction, Protected Evidence, macOS/Linux, Host 내부 요청 수/USD 측정.
