# Hybrid 동시성 관측 수정과 Git 체크포인트 준비

- 작업 일시: 2026-10-20 (Asia/Seoul)
- 대상 커밋: `c3bca1e8b3481a1a3e6dff1cc7e1e8ef5c72bc03` 및 미커밋 작업 트리
- 작업 유형: 조사·수정·실행
- 선행 문서: [기준선 기록](host-native-baseline-readiness.md), [기준선 manifest](host-native-baseline-inventory.json)
- 번호 실측 최대값: REGISTER P0-17 / P1-61. 등급 변경·신규 ID 없음.

기준선 및 G1~H8 감사를 다시 수행하지 않았다. 이번 범위는 최초 Hybrid 실패,
해당 테스트의 수정, 회귀, 누적 변경의 공개 체크포인트 준비다.
아래 소스 줄은 HEAD가 아니라 현재 작업 트리 기준이며 manifest의 hash로 식별한다.

## 최초 실패와 재현

원본은 [최초 전체 테스트 로그](host-native-baseline-test-first.log)에 보존되어 있다.
테스트명은 `hybrid independent work overlaps, isolates candidates and integrates deterministically`.
수정 전 `test/hybrid.test.mjs` line 62에서 `assert.equal(peak, 2)`가
actual 1 / expected 2로 실패했다. 바로 앞 `r.state === 'COMPLETED'`는 통과했다.
따라서 최초 로그는 Workflow 완료 실패나 Lease 소실을 입증하지 않는다.

기존 관측은 매 fake Verifier 진입 때 active를 증가시키고 30ms를 기다린 뒤
감소시켰다. 동시 예약된 작업이라도 실제 Verifier 진입 간격이 그보다 길면
peak 1이 가능하다. Node의 비동기 동시 실행은 모든 하위 단계의 동시 진입을
보장하지 않는다.

원본 테스트 단독 실행 5회는 모두 exit 0였다. 자연 발생 실패는 이번에는
재현되지 않았다. [반복 집계](hybrid-investigation-repeats.json)는 실행별 건수를
분리하며, 이 횟수를 확률적 안정성 보장으로 사용하지 않는다.

별도 진단 복사본에서 기존 trusted `collaborate` seam으로 b의 진입을
a의 두 번째 fake verification 종료까지 기다리게 했다. 프로덕션 소스는
변경하지 않았다. 두 작업의 callback 진입은 `["a","b"]`, 모든 attempt
`a,b,final`은 SUCCEEDED, Run은 COMPLETED였지만 peak 1로 원래 assertion이
실패했다. [제어된 phase-skew 로그](hybrid-phase-skew.log), exit 1.
이는 시간 창 관측의 거짓 실패 가능성을 재현한 것이며, 최초 실행 당시 OS/I/O
지연을 동일하게 재현하거나 그 발생원을 확정한 것은 아니다.

## 조사한 경로

| 항목 | 코드 및 관측 | 판단 |
| --- | --- | --- |
| Scheduler | `src/workflow/definition.mjs` line 68: 의존성·공유 자원·parallel limit에 따라 readyBatch 선택. `src/alpha/controller.mjs` line 336: 모든 child 예약 후 line 344의 Promise.allSettled/map으로 실행 | batch 내 순차 await 실행으로 바뀐 증거 없음 |
| 상태 전이 | READY→예약/STARTED→child 실행→예약 순서대로 결과 반영. 모든 child 성공 후 final 통합 | 최초 및 phase-skew 진단은 COMPLETED; 잘못된 상태 전이 재현 없음 |
| SQLite | `src/alpha/store.mjs` line 13: DatabaseSync, WAL, busy_timeout. `src/workflow/persistence.mjs` line 76: BEGIN IMMEDIATE 내 예약·중복·limit 검사 후 COMMIT | 동기 DB 작업은 event loop를 지연시킬 수 있으나 최초 DB 대기 시간은 수집되지 않음. DB 잠금 원인 확정 불가 |
| Lease | Store line 71의 owner claim/30초 lease, line 89의 heartbeat, line 90의 owner/expiry 조건부 save. 부모 heartbeat는 Controller line 225 | 최초 테스트 약 4.7초, 성공 상태이며 lease 오류 없음. 이것만으로 모든 lease race 부재를 증명하지 않음 |
| Fencing | Controller line 34: parent owner/lease, revision/graph/fence, STARTED 확인. reserve/finish도 owner/revision 검사 | 기존 stale coordinator·Recovery 반증을 유지하고 회귀 실행. fence 완화 없음 |
| Fixture | `test/hybrid.test.mjs` setup은 매번 mkdtemp와 별도 SQLite, 후보는 child별 경로. repo는 두 child가 읽기 공유 | DB/후보 디렉터리를 다른 테스트가 공유하는 근거 없음. CPU·디스크·Git subprocess 부하는 공유 |
| I/O·타이밍 | `src/alpha/workspace.mjs` line 16 snapshot은 여러 git/file await를 거침. 각 child는 별도로 snapshot/context를 거쳐 verify 진입 | 30ms Verifier 겹침 가정은 보장된 실행 계약이 아님 |

남은 가설은 원래 전체 suite의 CPU/디스크/Git 스케줄링 지연, 동기 SQLite 작업,
또는 기타 Host 부하다. 최초 로그에 단계별 timestamp가 없으므로 특정 원인을
단정하지 않는다. Scheduler·SQLite·Lease·Fencing 제품 결함은 이번 조사로 확인되지 않았다.

## 최소 변경과 반증

제품 소스 변경은 없다. `test/hybrid.test.mjs`의 해당 테스트만 변경했다.

- 두 독립 child의 첫 Verifier 진입을 rendezvous로 맞춘다. 두 번째 도착 전 첫
  호출을 유지하므로 짧은 시간 창을 우연히 공유해야 한다는 가정을 제거한다.
- 10초 deadline 안에 둘째 도착이 없으면 거절한다. timeout을 늘려 기존 sleep
  assertion을 숨기는 수정이 아니다. 실제 직렬 launcher는 이 조건을 만족하지 못한다.
- 원래 peak 2, 후보 경로 3개, 결정적 attempt 순서, 두 파일 통합, 원본 보존
  assertion을 유지한다. 최종 integration이 child Verifier와 겹치지 않는지도 확인한다.
- 추가 변형은 b의 첫 진입을 a 관측 후 75ms 지연한다. 기존 30ms보다 늦게
  도착하는 경우에도 올바른 병렬 실행을 받아들이는 반증이다.
- 프로덕션 경로를 손대지 않은 별도 진단 복사본에서 graph maxParallel만 1로
  바꾸었다. 정상 이름 테스트는 exit 1이며 WAITING_HUMAN으로 실패했다.
  관측을 추가한 재실행에서도 child의 rendezvous timeout과 final 미실행을
  확인한다. [첫 음성 대조](hybrid-serial-negative.log),
  [child 이유를 포함한 음성 대조](hybrid-serial-negative-v2.log).

진단 복사본과 원시 로그는 ignored `.trials/host-core-checkpoint/`에만 둔다.
수정 전 코드 복사본의 import를 동일 작업 트리 모듈로 연결하고 첫 테스트만
실행했다. serial 음성 대조는 수정된 첫 테스트에 동일 방법을 적용했다.
fake Verifier의 성공은 실제 protected verification 증거로 사용하지 않는다.

## 검증 결과

실행별 명령·exit·통과·제외 건수는 [결과 JSON](hybrid-investigation-results.json)에 기록한다.

| 실행 | 범위 |
| --- | --- |
| 원본 반복 5회 | 해당 이름 테스트 1개씩, 모두 exit 0 |
| 제어된 진입 지연 1회 | 기존 assertion의 peak 1/2 실패, exit 1 (의도된 반증) |
| `node --test test/hybrid.test.mjs` | 수정 후 20개 중 19 통과/1 Docker 제외, exit 0 |
| 수정 후 반복 5회 | 기본·지연 변형 각 1개씩, 합계 10 통과, 모든 명령 exit 0 |
| serial 음성 대조 2회 | 각 1개 실패, exit 1. 둘째는 child 이유 관측만 추가 |
| `npm.cmd test` | exit 0, 548 통과 = Legacy 324 + Alpha 212 + Core 12; 실패/제외 0. Docker·Node·Java/Maven·H3/H4/H6 활성 |
| `npm.cmd run posttest` | exit 0. coverage·link·citation·declared-fact 검사; 선언 42개/불일치 0, 미검사 숫자 539 |
| `git diff --check` | exit 0. 누적 diff whitespace 검사 |

[전체 로그](hybrid-investigation-full.log), [Hybrid 단독 로그](hybrid-fixed.log),
[최종 문서 검사](hybrid-investigation-docs.log). 전 회귀 547개에 지연 변형 1개를
추가해 548개가 되었다. 기존 assertion과 테스트를 삭제하지 않았다.
실제 모델·Host Live·직접 API·인증정보 읽기는 실행하지 않았다.

## 누적 변경과 안전한 커밋 계획

이번 공개 파일 변경은 기존 4개(`test/hybrid.test.mjs`, `README.md`,
`README.en.md`, `docs/INDEX.md`)와 신규 10개다. 신규 파일은 이 기록,
`hybrid-checkpoint-inventory.json`, `hybrid-investigation-results.json`,
`hybrid-investigation-repeats.json`, 위에 연결한 실행 로그 6개다.
README/INDEX는 기록 카운터·색인만 갱신했다. 로컬 진단/수집 스크립트는 제외한다.

현재 branch는 `feature/alpha-g0-refresh`, HEAD는 상단 값 그대로다.
staging/commit/push/배포는 하지 않는다.
[새 파일별 manifest](hybrid-checkpoint-inventory.json)는 이전 manifest를 덮어쓰지 않고
누적 경로를 구현·테스트·문서·증거·설정으로 분류한다.

권장 단위는 다음과 같다. 각 단위의 최종 staged diff 검토와 사용자 승인이
끝나기 전에는 커밋하지 않는다.

1. 기존 Host core 구현 + 대응 테스트 + package.json:
   Evidence/Judge/Backend, WorkItem admission, 준비 경로의 의존 변경을 함께 둔다.
   이 묶음의 소스·테스트는 이번 조사에서 수정하지 않았다.
2. Hybrid 관측 수정: `test/hybrid.test.mjs`와 이번 반증/실행 기록.
   제품 동시성 수정으로 제목을 붙이지 않는다. 기존 전체 회귀를 유지한다.
3. 사용·설계 안내: 기존 Host core guide, host-native guide, progress,
   README의 사용 경로 설명. 기본 준비와 엄격한 H6 계획 이름을 구별한다.
4. 실행 증거: 기존 Host core·기준선 기록과 이번 로그/JSON. 실패 기록도 보존한다.
   H7/H8 미추적 기록은 별도 과거 증거 묶음으로 출처 검토하며 이번에 재감사하지 않는다.
5. INDEX/README 실측 기록 카운터는 기록을 추가하는 최종 문서 묶음과 함께 둔다.
   분할 커밋 사이의 카운터가 아직 없는 문서를 주장하지 않게 최종 순서를 조정한다.
   `.gitignore`의 checkpoint/config 좁은 제외 규칙도 별도 명시한다.

manifest를 경로 allowlist로 사용하고 `git add .`는 사용하지 않는다.
최종 commit identity는 `sol <solarchive.dev@gmail.com>`, 라이선스는 MIT / solzip을 유지한다.
로그·fixture의 `Fixture <fixture@example.invalid>`는 테스트 저장소 identity이며
제품 커밋 작성자로 사용하지 않는다.

공개 제외: `.trials/` 원시 로그/진단/임시 데이터 전부, `.codefleet/` 런타임 상태,
SQLite/WAL/SHM, Lease·승인 원장·Host homes·인증·환경 파일과 개인 절대 경로.
이전 manifest 및 새 후보 파일은 경로/개인명/일반 키 패턴/민감 파일명 검사에
포함한다. 실제 자격증명 파일을 열어 비교하지 않는다. sanitized 공개 로그만 후보로 둔다.
검사 파일 수와 match는 manifest에 남기며, bounded scan을 완전한 Secret 보증으로
표현하지 않는다. 커밋 직전 staged 내용 재검사는 아직 미실행이다.

최종 누적 후보의 검사 대상은 65개: 구현 14, 테스트 6, 문서 11, 증거 32,
설정 2개이며 패턴 일치 0개다. manifest 자체는 자기 hash 순환 때문에 제외한다.
미추적 로컬 데이터 8개는 내용 검사를 위해 열지 않고 제외했다.
전체 기존 소스·테스트 144개 hash 대조에서 이번 변경은 `test/hybrid.test.mjs`
1개뿐이다. staged 경로는 0개이며 HEAD/branch는 유지됐다.

## 다음 Host Live 수용 조건

[기준선 수용 계획](host-native-baseline-readiness.md)의 조건을 변경하지 않는다.
공개 fixture base/tree, Skill/runtime hash, Host 버전·모델, 도구·경로·통신·
시간/비용 범위를 실측해 Host별 별도 승인을 받아야 한다.
`codefleet` 기본 준비와 `codefleet-plan` 엄격한 H6 수용은 별도다.
후자의 실제 confinement/인증·전송/read-search 제한/collector가 미충족이면
모델 호출 전에 BLOCKED다. 이번 테스트 개선은 Live 승인이나 격리 증거가 아니다.

## 결론

30ms Verifier 겹침 관측의 거짓 실패를 제어된 진입 지연으로 확인하고 테스트만 수정했다.
전체 회귀 exit 0이나 최초 지연 발생원은 미확정이며 제품 Scheduler 결함은 확인되지 않았다.
커밋 후보와 제외 범위를 준비했으나 실제 커밋 및 Host Live는 수행하지 않았다.

## 다음 작업

최종 diff·manifest를 검토해 커밋 단위와 명시적 승인을 확정한다.
Host Live는 고정 fixture와 실제 플랫폼 경계의 별도 preflight/승인을 따른다.

## 미해소로 남긴 것

최초 실패 당시 OS/I/O 지연 발생원, 새로운 테스트 deadline 이상의 극단적 부하,
staged 파일 검사 및 실제 Host Live 조건. 자연 재현 0/5는 모든 동시성 결함 부재를 뜻하지 않는다.
