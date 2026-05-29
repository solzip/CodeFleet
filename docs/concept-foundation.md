# CodeFleet Concept Foundation

이 문서는 CodeFleet의 제품 정의, 핵심 개념, 설계 원칙, 앞으로 논의해야 할 항목을 정리한 기준 문서다.

목적은 단순 구현 메모가 아니다. 다른 컴퓨터나 다른 작업 세션에서도 이 문서만 읽고 CodeFleet의 오케스트레이션 방향을 이어갈 수 있게 하는 것이다.

## 0. 설계 기준

CodeFleet 설계는 항상 최종 목표를 기준으로 시작한다.

v0.2 같은 초기 버전은 최종 구조를 향한 최소 구현일 뿐이다. 설계를 초기 구현 편의에 맞춰 축소하지 않는다. 먼저 최종적으로 사용자가 실제로 쓸 제품의 작업 흐름과 안전 모델을 정의하고, 그다음 현재 버전에서 구현할 범위를 작게 자른다.

핵심 원칙:

```text
Design from the final workflow.
Implement in small versions.
```

한국어로는 다음과 같다.

```text
최종 사용 흐름을 기준으로 설계한다.
작게 나눈 버전으로 구현한다.
```

따라서 CodeFleet의 개념, 스키마, 명령어, 파일 구조는 v0.2에서 모두 구현되지 않더라도 최종 모델과 충돌하지 않아야 한다. 초기 구현이 최종 개념의 이름, 책임 경계, 안전 모델을 왜곡하면 안 된다.

### 0.1 목표 경계

CodeFleet의 최종 목표는 현재 정의에서 더 넓히지 않는다.

앞으로의 설계 확장은 최종 목표를 구현하기 위한 내부 구조, 안전 장치, 사용자 흐름을 구체화하는 방향으로만 진행한다. CodeFleet을 프로젝트 관리 도구나 범용 에이전트 플랫폼으로 확장하지 않는다.

고정된 최종 목표:

```text
CodeFleet은 사용자의 개발/운영 Objective를 하나 이상의 Task로 구조화하고,
백엔드/인프라 작업을 역할·범위·가드레일·검증 조건이 포함된 Task로 정의하며,
사람이 승인한 Task를 AI 에이전트에게 역할 기반으로 위임하고,
실행 결과를 로그·diff·테스트·리뷰 기준으로 추적하는
AI-native 개발 오케스트레이션 CLI다.
```

이 목표 안에 포함되는 축:

```text
Objective
= 왜/어떤 맥락의 작업인가

Task
= 무엇을 어떤 조건으로 시킬 것인가

Human Approval
= 사람이 실행 계약을 확정했는가

Harness
= 범위/권한/검증을 어떻게 통제할 것인가

Agent Adapter
= 어떤 AI 도구에 위임할 것인가

Run Trace
= 실제 실행 증거는 무엇인가

Run Summary
= 사람이 어떻게 결과를 이어받을 것인가
```

확장하지 않을 범위:

```text
- Jira/Notion 같은 프로젝트 관리 도구
- 중앙 작업 DB
- 웹 대시보드
- CI/CD 대체재
- 배포 자동화 플랫폼
- Secret manager
- 완전한 샌드박스
- 일반 목적 에이전트 OS
```

Objective / Task Queue / ledger / Mutation Engine 같은 논의는 목표 확장이 아니라, 이 최종 목표를 안정적으로 구현하기 위한 내부 구조 논의다.

### 0.2 Mutation Engine의 위치

Mutation Engine은 CodeFleet의 사용자-facing 목표를 넓히는 기능이 아니다.

Mutation Engine은 CodeFleet의 Objective, Task Queue, Task relation 상태를 직접 파일 수정이 아니라 검증 가능한 상태 전이로 바꾸는 내부 계층이다.

정의:

```text
Mutation Engine
= CodeFleet 상태 변경 창구
= Objective / Queue / Task relation 변경을 lock, validation, ledger, rebuild를 통해 안전하게 처리하는 내부 처리기
```

Mutation Engine이 필요한 이유:

```text
- Task가 승인되지 않았는데 run되는 것을 막는다.
- Task revision이 바뀌었는데 예전 approval로 실행되는 것을 막는다.
- proposed Objective relation이 Harness prompt에 들어가는 것을 막는다.
- CLOSED Objective에 새 Task가 붙는 것을 막는다.
- Run result와 Objective snapshot이 충돌하는 것을 validate/rebuild로 감지한다.
```

최종 목표와의 대응:

```text
사용자의 개발/운영 Objective를 하나 이상의 Task로 구조화
-> Objective 생성, Task attach, queue 상태 변경을 안전하게 처리

Task를 역할·범위·가드레일·검증 조건이 포함된 계약으로 정의
-> Task Draft / Revision과 approval 상태가 깨지지 않게 관리

사람이 승인한 Task를 AI 에이전트에게 위임
-> accepted/approved Objective relation과 approved Task revision 없이는 run을 막음

실행 결과를 로그·diff·테스트·리뷰 기준으로 추적
-> 실행 결과는 Run Trace에 남기고, Mutation Engine은 Objective snapshot과의 일관성을 검증
```

상태 변경 흐름:

```text
Command
  -> Mutation Engine
  -> Lock
  -> Validate Current State
  -> Append Ledger Event
  -> Update Related Contract
  -> Rebuild Snapshot
  -> Validate Result
  -> Release Lock
```

Mutation 후 rebuild / validate 흐름:

```text
1. workspace lock 획득
2. 현재 상태 읽기
3. 현재 상태 validate
4. transition 가능 여부 확인
5. ledger event append
6. 필요한 경우 Task Spec 갱신
7. ledger + Task Spec + Run Trace + Summary를 기준으로 objective.json rebuild
8. 결과 validate
9. lock 해제
```

핵심 원칙:

```text
Rebuild over patch.
```

한국어:

```text
부분 수정보다 전체 재생성을 우선한다.
```

Mutation Engine은 objective.json을 부분 수정하지 않는다. 상태 변경 후에는 ledger, Task Spec, Run Trace, Summary를 기준으로 objective.json snapshot을 다시 만든다.

`rebuild`의 책임:

```text
- ledger.jsonl을 seq 순서로 읽는다.
- OBJECTIVE_CREATED로 기본 Objective를 만든다.
- TASK_ATTACHED로 queue item을 추가한다.
- QUEUE_* 이벤트로 storedState를 적용한다.
- QUEUE_REORDERED로 future segment 순서를 적용한다.
- Task Spec을 읽어 taskRevision, approval, relation을 검증한다.
- Run Trace를 읽어 DONE / ACTIVE 같은 derivedState를 계산한다.
- Summary / Decision 연결을 반영한다.
- objective.json snapshot을 생성한다.
```

`validate`의 책임:

```text
- ledger seq가 끊기지 않는지 확인한다.
- event schema가 맞는지 확인한다.
- TASK_ATTACHED 없이 relation event가 나오지 않는지 확인한다.
- taskId가 실제 tasks/*.yaml에 존재하는지 확인한다.
- taskRevision이 실제 Task revision과 맞는지 확인한다.
- proposed relation이 실행에 쓰이지 않았는지 확인한다.
- accepted/approved relation 없이 approved Revision 또는 Run이 없는지 확인한다.
- objective.json이 rebuild 결과와 같은지 확인한다.
- raw log/diff가 Objective context에 들어가지 않았는지 확인한다.
- CLOSED Objective에 NEXT가 남아 있지 않은지 확인한다.
```

실패 처리 원칙:

```text
No silent rollback.
No ledger rewrite.
Explicit repair only.
```

한국어:

```text
조용한 rollback은 하지 않는다.
ledger 중간 수정은 하지 않는다.
명시적 repair만 허용한다.
```

Mutation Engine은 이벤트 append 전에 강한 validation을 수행한다. Append 후 rebuild / validate가 실패하면 ledger를 자동 수정하거나 rollback하지 않고 corruption 상태로 보고 명령을 실패시킨다. 복구는 별도 validate / rebuild / repair 명령으로 수행한다.

최종 모델에서도 이 원칙은 유지한다. 최종 모델은 자동 rollback을 추가하는 것이 아니라 진단과 복구 도구를 강화한다.

```text
v0.2
- append 전 강한 validation
- append 후 rebuild / validate 실패 시 command fail
- 수동 rebuild / repair 안내

최종 모델
- append 전 강한 validation
- atomic append / atomic file replace
- append 후 rebuild / validate
- 실패 시 corruption marker 기록
- objective validate가 문제 위치를 설명
- objective repair가 명시적 보정 이벤트를 만들거나 snapshot을 재생성
- ledger 중간 줄 직접 수정 금지
```

Corruption marker 예시:

```json
{
  "markerId": "corr-20260529-001",
  "status": "ACTIVE",
  "scope": "OBJECTIVE",
  "target": {
    "objectiveId": "auth-error-response"
  },
  "findings": [
    "finding-20260529-001"
  ],
  "createdAt": "2026-05-29T11:00:00+09:00",
  "updatedAt": "2026-05-29T11:00:00+09:00",
  "detectedBy": "codefleet-validate",
  "ruleSetVersion": 1
}
```

CorruptionMarker는 원인을 복사하지 않는다. 원인은 expected / actual / evidence를 가진 finding에 남기고, marker는 active finding bundle로 동작한다.

Repair 원칙:

```text
- snapshot만 깨졌으면 ledger / task / run을 기준으로 objective.json을 rebuild한다.
- ledger 이벤트가 잘못됐으면 중간 줄을 수정하지 않고 보정 이벤트를 append한다.
- Task relation이 꼬였으면 relation invalidation 같은 명시적 이벤트를 append한다.
- repair는 사람이 실행한 명시적 명령이어야 한다.
```

중복 mutation과 rollback 방지 원칙:

```text
No overwrite of truth.
No silent rollback.
No duplicate mutation.
All correction is explicit.
```

한국어:

```text
진실을 덮어쓰지 않는다.
조용한 rollback은 하지 않는다.
중복 mutation을 막는다.
모든 보정은 명시적 이벤트로 남긴다.
```

완전히 충돌 가능성을 0으로 만들 수는 없다. 파일 기반 로컬 시스템에서는 수동 파일 수정, 명령 실패, 도구 버그, 동시 실행으로 불일치가 생길 수 있다. 대신 CodeFleet은 충돌과 중복을 구조적으로 만들기 어렵게 하고, 생기면 반드시 감지하도록 설계한다.

중복 mutation 방지:

```text
- 모든 mutation command는 mutationId를 가진다.
- Mutation Engine은 ledger에 같은 mutationId가 이미 있는지 먼저 확인한다.
- 같은 mutationId가 이미 적용되어 있으면 새 이벤트를 append하지 않고 no-op으로 끝낸다.
- 사용자에게는 already applied / already approved 같은 결과를 보여준다.
```

예시:

```json
{
  "mutationId": "mut_task-001_rev2_approve_20260529_001",
  "eventId": "evt_20260529_103000_001",
  "seq": 12,
  "type": "TASK_APPROVED",
  "taskId": "task-001",
  "taskRevision": 2,
  "actor": "user",
  "at": "2026-05-29T10:30:00+09:00"
}
```

같은 명령이 반복 실행되면 두 번째 실행은 다음처럼 처리한다.

```text
already approved for task-001 revision 2
no new ledger event appended
```

Immutable 기록 원칙:

```text
- ledger는 append-only다.
- Task revision file은 생성 후 직접 수정하지 않는다.
- Run Trace directory는 생성 후 덮어쓰지 않는다.
- 새로운 실행은 새 runId를 만든다.
- Task 내용이 바뀌면 새 revision을 만든다.
- 기존 approval / relation / summary는 새 revision에 자동 승계하지 않는다.
```

Retry는 rollback이 아니다.

```text
revision 1 APPROVED
-> run-001 FAILED
-> run-002 DONE
```

위 흐름에서 revision 1의 계약은 그대로 유지된다. 실패와 성공은 각각 별도 Run Trace에 남는다. 현재 실행 상태는 run history를 기준으로 계산하고, 과거 실패 기록은 덮어쓰지 않는다.

Rollback 대신 명시적 보정 이벤트를 사용한다.

```text
잘못 승인함
-> approval record 삭제 금지
-> TASK_APPROVAL_INVALIDATED 같은 명시적 이벤트 append

잘못 relation accept함
-> relation record 삭제 금지
-> TASK_RELATION_INVALIDATED append

잘못 carry-forward attach함
-> summary / decision 파일 직접 삭제로 해결하지 않음
-> CARRY_FORWARD_REVOKED append
```

최종 안전장치:

```text
- mutationId로 중복 mutation 방지
- eventId / seq 중복 방지
- immutable Task revision files
- immutable Run Trace directories
- append-only ledger
- terminal state는 일반 명령으로 되살리지 않음
- rollback 대신 explicit invalidation / reopen / repair 이벤트 사용
- validate가 cross-file 충돌 감지
```

Transition validation은 상위 상태 도메인을 7개로 구분한다.

```text
1. Objective State
2. Queue Item State
3. Task Relation State
4. Task Draft / Revision State
5. Context Carry-forward State
6. Run-derived State
7. Corruption / Repair State
```

이 7개는 CodeFleet 상태 검증의 책임 경계다. 최종 모델에서도 상위 상태 도메인은 이 범위를 넘겨 더 잘게 쪼개지 않는다. 더 자세한 규칙이 필요하면 각 도메인 내부의 세부 규칙으로 확장한다.

이유:

```text
- 상태 도메인이 더 많아지면 전이 조합이 폭증한다.
- validate 규칙이 여러 곳에 흩어진다.
- 하나의 command가 너무 많은 상태 머신을 동시에 건드리게 된다.
- 사용자가 상태를 이해하기 어려워진다.
- CodeFleet의 범위가 프로젝트 관리 시스템 쪽으로 넓어질 위험이 있다.
```

상위 도메인은 7개로 유지하고, 세부 규칙만 내부에서 나눈다.

예시:

```text
Context Carry-forward State
- Decision
- Summary

Run-derived State
- NO_RUN
- ACTIVE
- DONE
- FAILED
- VERIFIED

Corruption / Repair State
- Snapshot corruption
- Ledger correction
- Task relation fix
```

도메인별 책임:

```text
Objective State
= Objective 자체가 열려 있는가, 닫혔는가, 취소됐는가

Queue Item State
= Objective 안에서 이 Task를 대기, 차단, 스킵, 취소 중 무엇으로 취급하는가

Task Relation State
= 이 Task가 이 Objective에 proposed / accepted / approved / rejected / invalidated 중 어떤 관계로 연결됐는가

Task Draft / Revision State
= Draft가 승인 가능한 상태인지, Revision이 실행 가능한 계약 상태인지

Context Carry-forward State
= 어떤 Decision / Summary를 다음 Task에 넘겨도 되는가

Run-derived State
= 실제 실행 기록을 기준으로 ACTIVE / DONE / FAILED / VERIFIED를 어떻게 계산하는가

Corruption / Repair State
= 현재 상태를 신뢰할 수 있는가, 어떤 명시적 repair가 필요한가
```

최종 원칙:

```text
Keep state domains few.
Keep rules precise inside each domain.
```

한국어:

```text
상태 도메인은 적게 유지한다.
세부 규칙은 각 도메인 안에서 정확히 정의한다.
```

상위 상태 도메인은 7개로 고정한다. 세부 전이 규칙은 각 도메인 내부에서 확정하고 확장한다.

도메인별 세부 규칙 범위:

```text
Objective State
- OPEN -> CLOSED 가능 조건
- CLOSED -> REOPENED 가능 조건
- CANCELED terminal 여부
- CORRUPTED 상태에서 허용되는 명령

Queue Item State
- WAITING -> BLOCKED 가능 조건
- SKIPPED -> WAITING 허용 여부
- ACTIVE / completed item의 skip, cancel, reorder 금지 조건

Task Relation State
- proposed -> accepted
- proposed -> approved
- proposed -> rejected
- rejected / invalidated terminal 여부
- revision 변경 시 invalidation 처리

Task Draft / Revision State
- Draft가 READY_FOR_APPROVAL이 되기 위한 조건
- Draft approve 시 Revision 생성 조건
- 승인 후 edit 시 새 Draft / 새 Revision 처리
- 실행 중인 Run이 있을 때 edit / revision 생성 제한

Context Carry-forward State
- Summary sanitized 조건
- Decision revoke 조건
- carry-forward 포함 가능 조건

Run-derived State
- DONE 계산 기준
- ACTIVE 계산 기준
- Run Trace와 derived state 불일치 처리

Corruption / Repair State
- Finding / Severity / Category / Marker 판정 조건
- rebuild만으로 복구 가능한 경우
- repair가 보정 이벤트를 append해야 하는 경우
```

세부 규칙 논의 순서:

```text
1. Objective State
2. Queue Item State
3. Task Relation State
4. Task Draft / Revision State
5. Context Carry-forward State
6. Run-derived State
7. Corruption / Repair State
```

Objective와 Queue부터 확정해야 Task relation, approval, run-derived state가 자연스럽게 이어진다.

### 0.3 Objective State 규칙

Objective State는 Objective 자체의 생명주기 상태를 관리한다.

상태:

```text
OPEN
- 진행 가능한 Objective
- Task attach 가능
- Task review / run 가능

BLOCKED
- 외부 결정, 정보, 선행 조건 때문에 멈춘 Objective
- Task attach / review / relation accept / approve는 가능
- run은 기본 금지
- close / cancel / unblock 가능

CLOSED
- 정상적으로 완료된 Objective
- 기본적으로 Task attach / run 금지
- 명시적 reopen 가능

CANCELED
- 의도적으로 폐기한 Objective
- terminal
- reopen 불가
- 다시 하려면 새 Objective 생성

CORRUPTED
- ledger / task / run / snapshot 불일치로 신뢰할 수 없는 Objective
- 일반 mutation 금지
- investigation / recovery capability만 허용
- 정확한 허용 범위는 finding severity, scope impact set, capability gating으로 결정
```

전이:

```text
OBJECTIVE_CREATED -> OPEN

OPEN
-> BLOCKED
-> CLOSED
-> CANCELED
-> CORRUPTED

BLOCKED
-> OPEN
-> CLOSED
-> CANCELED
-> CORRUPTED

CLOSED
-> OPEN       via OBJECTIVE_REOPENED
-> CORRUPTED

CANCELED
-> CORRUPTED  diagnostic only

CORRUPTED
-> previous valid status only via explicit repair
```

금지 전이:

```text
CANCELED -> OPEN 금지
CANCELED -> CLOSED 금지
CANCELED -> REOPENED 금지
CORRUPTED 상태에서 일반 mutation 금지
```

BLOCKED 처리 원칙:

```text
BLOCKED는 Objective가 폐기됐다는 뜻이 아니다.
BLOCKED는 실행을 멈추고 추가 정보, 외부 결정, 선행 조건을 기다린다는 뜻이다.
```

따라서 BLOCKED Objective에서도 다음은 허용한다.

```text
- Task attach
- Task review
- relation accept / approve / reject
- close
- cancel
- unblock
```

하지만 run은 기본 금지한다.

이유:

```text
BLOCKED 상태에서 실행을 허용하면 왜 blocked인지 흐려진다.
막힌 이유를 해결하기 위한 조사/정리 Task는 만들 수 있지만,
실제 실행은 Objective가 OPEN으로 돌아온 뒤 수행하는 것이 기본이다.
```

OBJECTIVE_CLOSED 가능 조건:

```text
- ACTIVE Run 없음
- CORRUPTED 아님
- close reason 있음
- 필요한 summary / decision 정책 충족
- 남은 NEXT / WAITING Task가 있으면 close reason에 남은 Task 처리 방침 기록
```

OBJECTIVE_CANCELED 가능 조건:

```text
- ACTIVE Run 없음
- CORRUPTED 아님
- cancel reason 필수
```

OBJECTIVE_REOPENED 가능 조건:

```text
- 현재 상태가 CLOSED
- reopen reason 필수
- CORRUPTED 아님
```

Objective State 최종 원칙:

```text
CLOSED can reopen.
CANCELED cannot reopen.
CORRUPTED requires repair.
ACTIVE work blocks close / cancel / reorder.
BLOCKED allows planning, but blocks execution by default.
```

한국어:

```text
CLOSED는 다시 열 수 있다.
CANCELED는 다시 열 수 없다.
CORRUPTED는 repair가 필요하다.
실행 중인 작업이 있으면 close / cancel / reorder를 막는다.
BLOCKED는 계획은 허용하지만 실행은 기본적으로 막는다.
```

### 0.4 Queue Item State 규칙

Queue Item State는 Objective 안에서 특정 Task를 어떻게 취급하는지를 관리한다.

Queue Item State는 실행 결과를 표현하지 않는다. 실행 중인지, 완료됐는지, 실패했는지는 Run-derived State에서 계산한다.

저장 상태:

```text
WAITING
- Objective queue에 들어왔지만 아직 진행 대상이 아닌 상태
- 기본 상태

BLOCKED
- 이 queue item을 진행하려면 추가 정보, 결정, 선행 조건이 필요한 상태
- reason 필수

SKIPPED
- 이 Objective에서는 해당 Task를 건너뛰기로 결정한 상태
- reason 필수
- 기본적으로 run 불가

CANCELED
- 이 queue item을 취소한 상태
- terminal
- reason 필수
- run 불가
```

저장하지 않는 계산 상태:

```text
NEXT
= queue policy와 앞 item 상태로 계산

ACTIVE
= 현재 실행 중인 Run이 있는지로 계산

DONE / FAILED
= Run Trace와 Queue policy로 계산
```

전이:

```text
TASK_ATTACHED -> WAITING

WAITING
-> BLOCKED
-> SKIPPED
-> CANCELED

BLOCKED
-> WAITING      via QUEUE_ITEM_UNBLOCKED
-> SKIPPED
-> CANCELED

SKIPPED
-> WAITING      via QUEUE_ITEM_UNSKIPPED
-> CANCELED

CANCELED
-> terminal
```

`SKIPPED -> WAITING`은 최종 모델에서 허용한다. 다만 명시적 unskip 이벤트와 reason이 필요하다.

```text
SKIPPED -> WAITING 가능 조건:
- QUEUE_ITEM_UNSKIPPED 이벤트 사용
- reason 필수
- ACTIVE Run 없음
- Objective 상태가 OPEN 또는 BLOCKED
- Task revision 변동 없음
```

v0.2 같은 초기 구현에서는 `QUEUE_ITEM_UNSKIPPED`를 제외하고 SKIPPED를 사실상 terminal에 가깝게 처리해도 된다. 최종 모델에서는 사람이 실수로 skip했거나 상황이 바뀐 경우를 위해 명시적 unskip을 허용한다.

금지 규칙:

```text
- CANCELED item은 일반 전이 금지
- ACTIVE item은 block / skip / cancel / reorder 금지
- DONE / VERIFIED item은 block / skip / cancel / reorder 금지
- SKIPPED item은 run 금지
- BLOCKED item은 run 금지
- CANCELED item은 run 금지
```

이유:

```text
ACTIVE item을 skip / cancel하면 실행 중인 Agent 결과와 queue 결정이 충돌한다.
DONE / VERIFIED item을 skip / cancel하면 과거 실행 이력을 왜곡한다.
BLOCKED / SKIPPED / CANCELED item을 run하면 사람이 내린 흐름 결정과 실행이 충돌한다.
```

Objective State와의 관계:

```text
OPEN
- queue item mutation 가능

BLOCKED
- queue item mutation 가능
- run은 기본 금지

CLOSED
- queue item mutation 금지

CANCELED
- queue item mutation 금지

CORRUPTED
- queue item mutation 금지
- investigation / recovery capability만 허용
- 정확한 허용 범위는 finding severity, scope impact set, capability gating으로 결정
```

최종 원칙:

```text
Queue item state controls flow, not execution result.
```

한국어:

```text
Queue Item State는 흐름을 제어하지, 실행 결과를 표현하지 않는다.
```

### 0.5 Task Relation State 규칙

Task Relation State는 Task가 어떤 Objective에 어떤 관계로 연결되어 있는지를 관리한다.

상태는 5개로 고정한다.

```text
proposed
accepted
approved
rejected
invalidated
```

5개보다 줄이면 UX와 audit 의미가 섞이고, 5개보다 늘리면 상태 관리가 과해진다.

상태 의미:

```text
proposed
- Draft Harness가 제안한 Objective relation
- Task Draft 안에만 존재
- ledger에는 기록하지 않음
- 실행 불가

accepted
- 낮은 위험의 명확한 제안을 사용자가 review에서 그대로 수락
- 실행 가능

approved
- 모호하거나 위험한 relation을 사용자가 명시적으로 선택 / 확정
- 실행 가능

rejected
- 사용자가 relation 제안을 거절
- 같은 Task revision에서는 terminal

invalidated
- 이전에는 accepted / approved였지만 Task revision 변경 등으로 무효화됨
- terminal
```

`accepted`와 `approved`는 둘 다 실행 가능하지만 audit 의미가 다르다.

```text
accepted
= 사용자가 낮은 위험 제안을 수락했다.

approved
= 사용자가 명시적으로 판단해 확정했다.
```

`rejected`와 `invalidated`도 분리한다.

```text
rejected
= 사용자가 의도적으로 거절했다.

invalidated
= 원래는 유효했지만 Task revision 변경 등으로 조건이 바뀌어 무효화됐다.
```

전이:

```text
proposed -> accepted
proposed -> approved
proposed -> rejected

accepted -> invalidated
approved -> invalidated

rejected -> terminal
invalidated -> terminal
```

금지 전이:

```text
rejected -> accepted 금지
rejected -> approved 금지
invalidated -> accepted 금지
invalidated -> approved 금지
```

다시 연결하고 싶으면 새 Task revision을 만들거나 새 proposed relation을 생성해야 한다.

실행 가능 조건:

```text
- relationState가 accepted 또는 approved
- relation의 taskRevision이 현재 Task revision과 일치
- Objective 상태가 OPEN
- Queue item이 BLOCKED / SKIPPED / CANCELED 아님
- approved Revision이 존재하고 실행 가능한 상태
- Project Profile과 guardrails 통과
```

Task revision과 relation의 핵심 규칙:

```text
Task revision이 바뀌면 기존 accepted / approved relation은 invalidated 된다.
```

이유:

```text
사람이 수락 / 승인한 것은 특정 Task revision이다.
Task 내용이 바뀌면 Objective 연결의 의미도 달라질 수 있다.
```

예시:

```text
task-001 revision 1
-> relation accepted

task edit
-> task-001 revision 2
-> revision 1 relation invalidated
-> revision 2는 다시 proposed / accepted / approved 필요
```

최종 원칙:

```text
Proposed relation cannot drive execution.
Accepted or approved relation can drive execution.
Rejected and invalidated relations are terminal for the same task revision.
```

한국어:

```text
proposed relation만으로는 실행할 수 없다.
accepted 또는 approved relation만 실행에 사용할 수 있다.
rejected와 invalidated relation은 같은 Task revision에서는 terminal이다.
```

### 0.6 Task Draft / Revision State 규칙

Task Draft와 Task Revision은 상태 모델도 분리한다.

```text
Draft State
= 검토 / 승인 준비 여부를 관리

Revision State
= 불변 실행 계약의 유효성을 관리

Run-derived State
= 실제 실행 결과를 관리
```

Draft State:

```text
EDITING
- Draft 생성 / 수정 중
- review / edit 가능
- validate 통과 전 approve 불가

READY_FOR_APPROVAL
- review와 validate를 통과한 승인 후보
- approve 가능
- approve하면 immutable Revision 생성

REJECTED
- 사용자가 이 draft를 폐기
- run 불가
- approve 불가
- 필요하면 새 draft 생성
```

Draft 전이:

```text
draft created -> EDITING

EDITING
-> READY_FOR_APPROVAL
-> REJECTED

READY_FOR_APPROVAL
-> EDITING       if edited again
-> approved      creates Revision
-> REJECTED

REJECTED
-> terminal
```

`approved`는 Draft State가 아니다. `approved`는 Draft를 immutable Revision으로 만드는 이벤트다.

Revision State:

```text
APPROVED
- 사람이 승인한 immutable contract
- 실행 가능
- accepted / approved Objective relation 필요

SUPERSEDED
- 새 revision이 생겨 대체됨
- 실행 불가
- 기록 보존

CANCELED
- 이 revision을 폐기함
- 실행 불가
- terminal
```

Revision 전이:

```text
approve draft -> APPROVED

APPROVED
-> SUPERSEDED   when newer revision approved
-> CANCELED     if explicitly canceled

SUPERSEDED
-> terminal

CANCELED
-> terminal
```

Draft를 approve해서 Revision을 만들기 위한 조건:

```text
- Draft schema valid
- intent 있음
- objective relation이 accepted 또는 approved로 확정되어 있음
- scope 있음
- guardrails 있음
- verification 있음
- doneCriteria 있음
- blocking needsReview 없음
- Project Profile보다 권한 완화 없음
- draft content hash 계산됨
```

생성되는 Revision은 다음을 포함한다.

```text
- immutable Task contract
- approval
- relationState accepted 또는 approved
- contentHash
```

Revision State에 실행 결과를 넣지 않는다.

```text
Revision State에 넣지 않음:
- RUNNING
- DONE
- FAILED
- BLOCKED
```

실행 결과는 Run-derived State에서 계산한다.

예:

```text
revision 1 APPROVED
run-001 FAILED
run-002 DONE
```

이 경우 Revision은 계속 APPROVED다. 실패와 성공은 각각 Run Trace에 남고, 현재 실행 상태는 Run history를 기준으로 계산한다.

최종 원칙:

```text
Draft state controls review readiness.
Revision state controls contract validity.
Run-derived state controls execution result.
```

한국어:

```text
Draft 상태는 검토 / 승인 준비 여부를 관리한다.
Revision 상태는 계약의 유효성을 관리한다.
Run-derived 상태는 실행 결과를 관리한다.
```

### 0.7 Run-derived State 규칙

Run-derived State는 저장 원본이 아니다. 특정 `objectiveQueueItemId + taskId + taskRevision`에 연결된 Run Trace들을 읽어 계산한다.

정의:

```text
Run-derived State
= approved Revision에 대한 실행 시도들의 현재 해석
= Run Trace에서 계산되는 상태
= Queue State를 자동 변경하지 않는 상태
```

계산 단위:

```text
objectiveQueueItemId
+ taskId
+ taskRevision
```

`taskId`만으로 계산하지 않는다. 같은 Task라도 Revision이 다르면 실행 계약이 다르고, 같은 Revision이라도 Objective queue item이 다르면 실행 맥락이 다를 수 있다.

상태:

```text
NO_RUN
- 해당 approved Revision에 대한 Run이 아직 없음

ACTIVE
- 시작된 Run이 있고 아직 terminal result가 없음

FAILED
- 최신 유효 terminal Run이 실패함
- agent error, command error, verification fail, guardrail violation, review rejected 포함

DONE
- 최신 유효 terminal Run이 성공함
- 필요한 자동 검증이 통과함
- human review가 아직 최종 승인되지 않았을 수 있음

VERIFIED
- 성공한 Run을 사람이 리뷰하고 받아들임
- queue completion의 가장 강한 근거
```

DONE과 VERIFIED의 Queue 진행 의미:

```text
DONE
= 실행 성공 증거
= review 대기
= 기본적으로 Queue를 자동 진행시키지 않음

VERIFIED
= 사람이 결과를 받아들임
= Queue progression을 만족시키는 상태
= SEQUENCE Objective에서 다음 item을 NEXT로 계산할 수 있는 기본 근거
```

Objective 전체 완료는 Run-derived State로 표현하지 않는다.

```text
DONE
= objectiveQueueItemId + taskId + taskRevision 단위의 실행 성공

VERIFIED
= 해당 queue item 결과를 사람이 받아들인 상태

CLOSED
= Objective 전체를 사람이 명시적으로 닫은 상태
```

따라서 `DONE`이나 `VERIFIED`는 Objective State가 아니다. Objective 완료 상태는 `CLOSED`이며, 모든 queue item이 VERIFIED여도 Objective는 자동으로 CLOSED가 되지 않는다. `OBJECTIVE_CLOSED` 이벤트가 필요하다.

기본 Queue 진행 정책:

```text
SEQUENCE Objective:
- previous item VERIFIED -> next item can become NEXT
- previous item DONE only -> stop and wait for review
- previous item FAILED -> stop
- previous item NO_RUN / ACTIVE -> stop
```

정책 예외:

```text
LOW risk + Project Profile explicitly allows autoAdvanceOnDone
-> DONE만으로 다음 item 진행 가능

MEDIUM / HIGH risk
-> VERIFIED 필요

unknown risk
-> VERIFIED 필요
```

`BLOCKED`는 Run-derived State에 넣지 않는다.

이유:

```text
BLOCKED는 Objective / Queue 흐름에 대한 명시적 사람 결정이다.
Run은 막힌 이유를 증거로 남길 수 있지만, Queue item을 BLOCKED로 바꾸지는 않는다.
Queue item을 BLOCKED로 바꾸려면 QUEUE_ITEM_BLOCKED 이벤트가 필요하다.
```

분리 원칙:

```text
Run Trace records execution evidence.
Run-derived State interprets that evidence.
Queue State decides workflow control.
```

한국어:

```text
Run Trace는 실행 증거를 남긴다.
Run-derived State는 그 증거를 해석한다.
Queue State는 Objective 흐름 제어를 담당한다.
```

불변식:

```text
- Run-derived State는 Queue State를 자동 변경하지 않는다.
- Queue State는 Run-derived State를 원본 진실로 저장하지 않는다.
- Run은 objectiveQueueItemId + taskId + taskRevision에 묶인다.
- Revision이 바뀌면 Run-derived State는 새로 계산한다.
- 이전 Revision의 Run 결과는 새 Revision에 승계되지 않는다.
- terminal Run은 수정하지 않고 새 Run을 만든다.
- ACTIVE Run이 있으면 같은 Revision의 새 Run을 기본적으로 막는다.
- VERIFIED 이후 재실행은 명시적 reason이 필요하다.
```

자동 전파 금지:

```text
Run 실패 -> Queue BLOCKED 자동 변경 금지
Run 성공 -> Objective CLOSED 자동 변경 금지
새 Revision 생성 -> 이전 Run 결과 자동 승계 금지
최신 Run 존재 -> 기존 VERIFIED 자동 무효화 금지
```

예:

```text
task-001 revision 1
run-001 FAILED
run-002 DONE
run-002 VERIFIED

task-001 revision 2
run-003 FAILED
```

이 경우 revision 1의 VERIFIED와 revision 2의 FAILED는 서로 다른 계산 단위에 속한다. revision 2의 실패가 revision 1의 검증된 성공을 덮어쓰지 않는다.

VERIFIED 이후 같은 Revision을 다시 실행하려면 기존 VERIFIED를 조용히 덮어쓰지 않는다. 새 Run을 만들고, retry / reopen reason을 남기며, 필요하면 별도 review로 다시 판단한다.

### 0.8 Risk 판단 원칙

Risk는 LLM의 감이 아니다. Risk는 Project Profile과 Task / Run 증거를 기준으로 CodeFleet이 계산하는 정책 결과다.

정의:

```text
Risk
= CodeFleet policy가 계산한 작업 위험도
= required gate를 결정하는 입력
= LLM의 자유 판단이 아님
```

역할 분리:

```text
LLM
= risk signal을 제안할 수 있음

CodeFleet
= Project Profile + Task Spec + Run evidence를 기준으로 riskLevel 계산

Human
= review에서 risk를 높일 수 있음

Policy
= riskLevel에 따라 recheck / approval / verification gate 결정
```

핵심 원칙:

```text
LLM proposes risk signals.
CodeFleet computes riskLevel.
Human can raise risk.
Policy decides required gates.
```

한국어:

```text
LLM은 위험 신호를 제안한다.
CodeFleet은 riskLevel을 계산한다.
사람은 위험도를 높일 수 있다.
정책은 필요한 gate를 결정한다.
```

보수적 규칙:

```text
Risk can be raised by LLM or human.
Risk can only be lowered by explicit policy, not by LLM.
```

한국어:

```text
위험도는 LLM이나 사람이 올릴 수 있다.
위험도는 LLM이 낮출 수 없다.
낮추려면 Project Profile의 명시 정책이 필요하다.
```

판단 근거 우선순위:

```text
1. Project Profile 정책
   repo별 high-risk path / command / domain 선언

2. Task Spec
   agentRole, scope, guardrails, verification, declared riskSignals

3. File path rules
   예: terraform/**, migrations/**, auth/**, security/**, .github/workflows/**

4. Command rules
   예: terraform apply, kubectl, docker push, destructive command

5. Diff / changedFiles
   실제 변경된 파일이 고위험 경로에 걸리는지

6. Human override
   사용자는 risk를 낮추지 않고 높일 수만 있음
```

riskLevel은 최소 3단계로 둔다.

```text
LOW
- 일반 코드 수정
- 문서 / 테스트 / 내부 리팩토링

MEDIUM
- 여러 모듈 영향
- public API 변경
- config 변경
- shared library 변경
- 에러 처리 흐름 변경

HIGH
- auth / security
- payment / billing
- DB migration
- infra / terraform / k8s / nginx
- deployment / CI/CD
- secret / credential
- data deletion / destructive command
```

예:

```yaml
risk:
  level: HIGH
  computedBy: codefleet-policy
  reasons:
    - path: terraform/**
    - command: terraform plan required
  llmSignals:
    - infra-related change
  humanOverride:
    raisedBy: user
    reason: production 영향 가능
```

최종 원칙:

```text
risk는 LLM의 감이 아니라,
Project Profile과 Task / Run 증거를 기준으로
CodeFleet이 계산하는 정책 결과다.
```

### 0.9 Context Carry-forward State 규칙

Context Carry-forward State는 이전 Task의 어떤 맥락을 다음 Task에 넘길 수 있는지 관리한다.

최종 원칙:

```text
Run Trace = evidence truth
Run Summary = sanitized pointer / hint
Decision = human-approved intent
Current workspace = execution ground truth
```

따라서 raw Run Trace를 다음 prompt에 직접 넣지 않는다. Carry-forward에 포함 가능한 것은 사람이 승인한 Decision과 정제된 Summary뿐이다.

Decision과 Summary는 의미가 다르지만, 다음 Task에 포함 가능한지 판단하는 상태 흐름은 같다. 따라서 하나의 Carry-forward state machine을 공유하고, type만 나눈다.

```text
CarryForwardItem
- type: DECISION | SUMMARY
- state: PROPOSED | ATTACHED | REVOKED | EXPIRED
```

구분:

```text
type
= 이 항목의 성격

state
= 이 항목을 다음 Task context에 포함할 수 있는지
```

type 의미:

```text
DECISION
= 사람이 승인한 의도 / 방향 / 제약

SUMMARY
= Run Trace에서 만든 정제된 전달 맥락
= retained evidence를 가리키는 pointer / hint
```

state 의미:

```text
PROPOSED
- Agent 또는 CodeFleet이 제안한 후보
- 자동 포함 불가
- review 대상

ATTACHED
- 사람이 승인해 Objective context에 붙인 상태
- 다음 Draft Harness / Execution Harness에 포함 가능

REVOKED
- 이전에 붙였지만 더 이상 사용하지 않기로 한 상태
- 기록은 보존
- prompt / context 포함 금지

EXPIRED
- sourceRun / sourceRevision / workspace 상태와 맞지 않을 수 있는 상태
- 자동 포함 금지
- recheck 또는 review 필요
```

상태 전이:

```text
PROPOSED -> ATTACHED
PROPOSED -> REJECTED or discarded

ATTACHED -> REVOKED
ATTACHED -> EXPIRED

EXPIRED -> ATTACHED   only after recheck / review

REVOKED -> terminal
```

`REJECTED`는 장기 보존 상태로 두지 않아도 된다. 사람이 후보를 채택하지 않은 것은 audit 필요성이 낮으면 discard해도 된다. 단, 사용자 결정을 감사해야 하는 모드에서는 `CARRY_FORWARD_REJECTED` 이벤트로 남길 수 있다.

핵심 규칙:

```text
Only ATTACHED context can be forwarded.
```

포함 가능:

```text
- state == ATTACHED
- policy / risk check 통과
- expired 아님
```

포함 금지:

```text
- PROPOSED
- REVOKED
- EXPIRED
```

상태 머신은 공유하되, ATTACHED validation은 type별로 다르게 둔다.

DECISION이 ATTACHED 되기 위한 조건:

```text
- 사람이 명시적으로 승인
- actor 있음
- reason 또는 근거 있음
- sourceObjectiveId 또는 sourceTaskId 있음
- 충돌하는 기존 ATTACHED Decision이 없거나 supersedes / revoke 처리됨
```

SUMMARY가 ATTACHED 되기 위한 조건:

```text
- sourceRunId 있음
- sourceTaskId 있음
- sourceTaskRevision 있음
- objectiveQueueItemId 있음
- changedFiles 있음
- sanitization 통과
- raw log / raw diff / agent scratchpad 직접 포함 없음
- 필요한 경우 risk 기반 recheck 통과
```

꼬임 방지 불변식:

```text
- PROPOSED는 Harness context에 포함 금지
- ATTACHED만 Harness context에 포함 가능
- REVOKED / EXPIRED는 포함 금지
- state 변경은 직접 수정이 아니라 ledger event로만 처리
- Summary는 sourceRunId / sourceTaskId / sourceTaskRevision 필수
- Decision은 actor / reason / source 필수
- 충돌하는 Decision은 동시에 ATTACHED 불가
- EXPIRED Summary는 recheck 없이 다시 ATTACHED 불가
- raw log / raw diff / agent scratchpad는 carry-forward 금지
```

처리 흐름 예:

```text
run-002 끝남
-> CARRY_FORWARD_PROPOSED
   type: SUMMARY
   text: "AuthController 에러 응답을 ErrorResponse로 변경함"

user review
-> CARRY_FORWARD_ATTACHED
   reason: "다음 login API 작업에서도 같은 응답 포맷을 써야 함"

다음 Task 생성
-> ATTACHED Summary 포함

나중에 AuthController가 수동 수정됨
-> CARRY_FORWARD_EXPIRED
   reason: "changedFiles hash mismatch"
```

Decision 흐름 예:

```text
user decision record
-> CARRY_FORWARD_ATTACHED
   type: DECISION
   text: "DB schema 변경은 이번 Objective에서 제외"

나중에 범위 변경
-> CARRY_FORWARD_REVOKED
   reason: "Objective scope expanded to include migration"
```

최종 구조:

```text
CarryForwardItem은 내용이다.
CarryForwardState는 ledger event로 변한다.
Snapshot은 ledger replay로 계산된다.
```

### 0.10 Corruption 판정 원칙

Corruption은 사람이나 LLM의 감으로 판정하지 않는다. Corruption은 정의된 invariant check의 기계적 결과다.

최종 정의:

```text
Corruption
= CodeFleet의 원본 진실들 사이에서 발생한 invariant violation
= deterministic rebuild, validation, safe state transition을 수행할 수 없는 상태
= failed invariant check의 결과
```

한국어:

```text
Corruption은 CodeFleet의 원본 진실들 사이에서 발생한 불변식 위반이며,
그 결과 rebuild, validate, 안전한 상태 전이를 결정론적으로 수행할 수 없는 상태다.
```

Corruption은 작업 실패가 아니다.

```text
FAILED
= 작업 실행 결과가 실패함
= 상태 시스템은 정상

BLOCKED
= 사람이 흐름을 멈추기로 결정함
= 상태 시스템은 정상

CORRUPTED
= 상태 시스템의 불변식이 깨짐
= 새 실행 / 결정 누적 금지
```

예:

```text
테스트 실패
-> FAILED
-> corruption 아님

Task가 guardrail 때문에 실행 거절
-> FAILED 또는 policy block
-> corruption 아님

ledger가 없는 taskRevision을 참조
-> reference invariant 위반
-> corruption

VERIFIED인데 review evidence가 없음
-> evidence invariant 위반
-> corruption
```

판정 원칙:

```text
Corruption is machine-determined.
Not LLM-determined.
Not human-opinion-determined.
```

한국어:

```text
Corruption은 기계적으로 판정된다.
LLM의 감으로 판정하지 않는다.
사람의 느낌으로 판정하지 않는다.
```

최종 원칙:

```text
Corruption is not a judgment.
Corruption is a failed invariant check.
```

한국어:

```text
Corruption은 판단이 아니다.
Corruption은 실패한 불변식 검사 결과다.
```

같은 파일과 같은 validation rule set이 주어지면 같은 corruption 결과가 나와야 한다.

```text
same files
+ same validation rules
= same corruption result
```

LLM과 사람의 역할:

```text
LLM
- finding을 사람이 이해하기 쉽게 요약 가능
- repair option을 설명 가능
- corruption 여부 결정 불가
- 원인 추론 / 추측 금지

Human
- repair option 선택 가능
- repair reason 작성 가능
- corruption 여부를 낮출 수 없음
- invariant 위반을 무시하고 run 강행 불가
```

추론 / 추측 금지:

```text
No inferred corruption reason.
No guessed missing event.
No guessed user intent.
No guessed repair cause.
```

한국어:

```text
Corruption 원인은 추론하거나 추측하지 않는다.
누락된 이벤트를 추측하지 않는다.
사용자의 의도를 추측하지 않는다.
복구 원인을 추측하지 않는다.
```

Corruption이 나타났다면 반드시 구조화된 finding을 남긴다.

```text
corruption finding
= 실패한 invariant check의 structured finding
= expected / actual / evidence를 포함
= 사람이 쓴 감상이 아님
```

finding 최소 필드:

```text
- checkId
- severity
- category
- scope
- target
- message
- expected
- actual
- evidence path / object id
- suggestedRepair.kind
- suggestedRepair.mode
```

예:

```yaml
corruptionId: corr-20260529-001
scope: objective
objectiveId: auth-error-response
status: ACTIVE
createdAt: 2026-05-29T14:20:00+09:00
detectedBy: codefleet-validate
ruleSetVersion: 1

findings:
  - checkId: LEDGER_SEQ_CONTIGUOUS
    severity: CORRUPTION
    category: LEDGER_INTEGRITY
    scope: OBJECTIVE
    target:
      objectiveId: auth-error-response
    message: "Objective ledger seq is not contiguous."
    expected:
      seq: [1, 2, 3, 4]
    actual:
      seq: [1, 2, 4]
    evidence:
      ledgerPath: .codefleet/objectives/auth-error-response/ledger.jsonl
      missingSeq: [3]
    suggestedRepair:
      kind: RESTORE_SOURCE
      mode: MANUAL
      reason: "Missing ledger event cannot be reconstructed safely."
```

LLM이 reason을 만들어내면 안 된다. reason은 validate engine이 만든 expected / actual / evidence를 기반으로 생성되어야 한다.

Finding 구조:

```text
Finding
= checkId + severity + category + scope + target + expected + actual + evidence
```

역할:

```text
checkId
= 어떤 정량 규칙이 실패했는가

severity
= CodeFleet이 지금 무엇을 허용 / 차단할 것인가

category
= 무엇이 깨졌는가, 어떤 repair 방향인가

scope
= finding이 직접 발생한 위치

target
= finding이 직접 가리키는 객체

expected / actual
= 기준값과 실제값

evidence
= 판단 근거 파일 / 객체 / ID
```

severity와 category는 사람이 고르지 않는다. LLM도 고르지 않는다. Validation Rule이 결정한다.

### 0.11 Invariant Core / Extensible Layer 원칙

불변성을 유지하는 것은 맞다. 다만 불변 대상은 모든 규칙 내용이 아니라 판정 구조와 안전 원칙이다.

최종 원칙:

```text
Core semantics are invariant.
Rule catalog is extensible.
```

한국어:

```text
핵심 의미론은 불변이어야 한다.
규칙 목록은 확장 가능해야 한다.
```

Invariant Core:

```text
- Corruption은 failed invariant check다.
- Finding structure는 고정된다.
- Finding은 expected / actual / evidence를 가져야 한다.
- Severity semantics는 capability gating을 결정한다.
- Category assignment는 checkId의 rule definition이 결정한다.
- Scope impact gating은 deterministic해야 한다.
- LLM / 사람은 severity나 category를 임의로 고르지 않는다.
- LLM / 사람은 corruption 원인을 추론하거나 추측하지 않는다.
- deny wins.
- most restrictive applicable finding wins.
- UNKNOWN category 금지.
- UNCLASSIFIED finding 금지.
- No inferred category.
- No guessed severity.
- No unclassified finding.
```

Extensible Layer:

```text
- Validation rule catalog
- Project-specific checks
- checkId 목록
- condition type
- suggestedRepair.kind
- suggestedRepair.mode
- Project Profile별 policy rule
- repair option catalog
- category taxonomy addition through taxonomy review
```

확장 가능한 규칙도 schema-bound여야 한다. rule을 추가하려면 반드시 Validation Rule schema를 따라야 한다.

```text
Extensible does not mean arbitrary.
Extensible means schema-bound.
```

한국어:

```text
확장 가능하다는 것은 임의로 추가할 수 있다는 뜻이 아니다.
정해진 schema 안에서 확장할 수 있다는 뜻이다.
```

Validation Rule 최소 schema:

```text
- checkId
- category
- severity
- scope
- condition
- expectedType
- actualType
- evidenceType
- suggestedRepair.kind
- suggestedRepair.mode
```

프로젝트별 rule 예:

```yaml
checkId: DJANGO_MIGRATION_APPLIED_WITHOUT_PLAN
category: POLICY_ENFORCEMENT_INTEGRITY
severity: CORRUPTION
scope: WORKSPACE
condition:
  type: command_requires_prior_evidence
  commandPattern: "python manage.py migrate"
  requiredEvidence: "migration plan reviewed"
expectedType:
  requiredEvidencePresent: boolean
actualType:
  requiredEvidencePresent: boolean
evidenceType:
  commandLogPath: path
  projectProfilePath: path
suggestedRepair:
  kind: APPEND_CORRECTIVE_EVENT
  mode: ASSISTED
```

불변성과 확장성의 경계:

```text
불변:
- 판정 방식
- finding 구조
- severity/category/scope의 의미
- evidence requirement
- no inference / no guessing
- gating 원칙

확장:
- 어떤 check를 추가할지
- 어떤 project-specific policy를 둘지
- 어떤 condition type을 지원할지
- 어떤 repair option을 제공할지
```

최종 결론:

```text
불변성을 유지한다.
하지만 불변 대상은 모든 rule 내용이 아니라 판정 구조와 안전 원칙이다.
```

Category 정의:

```text
Category
= failed check가 어떤 source-of-truth boundary 또는 invariant family를 위반했는지 나타내는 deterministic classification value
```

한국어:

```text
Category는 실패한 check가 어떤 원본 진실 경계 또는 불변식 계열을 위반했는지 나타내는 결정론적 분류값이다.
```

Category는 선택되는 값이 아니다.

```text
Category is not selected.
Category is declared by checkId.
```

한국어:

```text
Category는 사람이 선택하는 값이 아니다.
Category는 checkId의 규칙 정의에 선언된 값이다.
```

Validation Rule은 최소한 다음을 가져야 한다.

```text
- checkId
- category
- severity
- scope
- condition
- expectedType
- actualType
- evidenceType
- suggestedRepair.kind
- suggestedRepair.mode
```

예:

```yaml
checkId: RUN_REVISION_EXISTS
category: REFERENCE_INTEGRITY
severity: CORRUPTION
scope: RUN
condition:
  type: file_exists
  path: ".codefleet/tasks/{taskId}/revisions/{taskRevision}.yaml"
expectedType:
  exists: boolean
actualType:
  exists: boolean
evidenceType:
  runId: string
  resultPath: path
suggestedRepair:
  kind: RESTORE_SOURCE
  mode: MANUAL
```

하나의 checkId는 정확히 하나의 primary category를 가진다.

```text
One checkId has exactly one primary category.
```

부가 설명이 필요하면 `relatedCategories`를 둘 수 있다. 하지만 gating과 기본 repair 방향은 primary category를 따른다.

```yaml
checkId: VERIFIED_REVIEW_EXISTS
category: REVIEW_INTEGRITY
relatedCategories:
  - EVIDENCE_CONFLICT
severity: CORRUPTION
```

최종 category:

```text
SNAPSHOT_CONSISTENCY
READ_MODEL_CONSISTENCY
LEDGER_INTEGRITY
REFERENCE_INTEGRITY
STATE_TRANSITION_INTEGRITY
EXECUTION_EVIDENCE_INTEGRITY
REVIEW_INTEGRITY
CARRY_FORWARD_INTEGRITY
POLICY_ENFORCEMENT_INTEGRITY
WORKSPACE_GROUNDING
```

SNAPSHOT_CONSISTENCY:

```text
check target:
- rebuildable snapshot
- objective.json 같은 공식 snapshot

expected:
- ledger / task / run / review replay 결과

actual:
- snapshot 파일 내용

source of truth:
- 깨지지 않음

default repair:
- rebuild snapshot
```

READ_MODEL_CONSISTENCY:

```text
check target:
- cache
- derived index
- cursor cache
- risk cache
- search index

expected:
- source-of-truth 재계산 결과

actual:
- cached / indexed value

source of truth:
- 깨지지 않음

default repair:
- rebuild index / cache
```

LEDGER_INTEGRITY:

```text
check target:
- ledger file itself

expected:
- ledger structural rules
- contiguous seq
- unique eventId
- valid event schema
- append-only integrity
- mutationId idempotency

actual:
- parsed ledger structure

source of truth:
- ledger 자체가 의심됨

default repair:
- manual repair 또는 event repair
```

REFERENCE_INTEGRITY:

```text
check target:
- id / reference edge

expected:
- referenced object exists
- referenced object type matches
- referenced revision / run / carryForwardId is valid

actual:
- reference resolution result

source of truth:
- 참조 관계가 깨짐

default repair:
- restore missing source
- or invalidate / expire referencing item
```

STATE_TRANSITION_INTEGRITY:

```text
check target:
- event sequence
- state machine replay

expected:
- allowed transition table

actual:
- replayed transition

source of truth:
- event sequence가 허용 전이를 위반

default repair:
- corrective event append
- affected item block / cancel / invalidate
```

EXECUTION_EVIDENCE_INTEGRITY:

```text
check target:
- Run Trace

expected:
- run evidence schema
- run hash / immutability
- command log / result consistency
- changedFiles / diff consistency
- approved revision reference

actual:
- run evidence files

source of truth:
- 실행 증거가 의심됨

default repair:
- run evidence invalidation
- restore evidence from backup
- rerun only after explicit approval
```

REVIEW_INTEGRITY:

```text
check target:
- review record

expected:
- review schema
- review reference validity
- actor present
- timestamp present
- review result consistency

actual:
- review record

source of truth:
- 리뷰 증거가 의심됨

default repair:
- review invalidation
- review re-record
```

CARRY_FORWARD_INTEGRITY:

```text
check target:
- CarryForwardItem
- harness context inclusion

expected:
- state/type/source rules
- sanitization rules
- conflict rules
- only ATTACHED items included

actual:
- carry-forward item
- generated context

source of truth:
- 전달 맥락이 오염됨

default repair:
- carry-forward revoke / expire
- conflicting decision resolution
```

POLICY_ENFORCEMENT_INTEGRITY:

```text
check target:
- Project Profile
- guardrail
- risk policy
- command policy
- harness policy application

expected:
- policy-required result

actual:
- task / run / harness evidence

source of truth:
- policy 적용 결과가 실행 증거와 충돌

default repair:
- policy violation review
- run invalidation
- stricter gate required
```

WORKSPACE_GROUNDING:

```text
check target:
- current workspace grounding edge

expected:
- referenced file / hash / path still matches
- task scope still matches current file tree
- sourceRun changedFiles can be rechecked

actual:
- current workspace filesystem state

source of truth:
- 현재 workspace 기준 실행 근거가 drift됨

default repair:
- mark carry-forward EXPIRED
- rerun bounded discovery
- require review
```

Category 우선순위:

```text
1. LEDGER_INTEGRITY
2. REFERENCE_INTEGRITY
3. STATE_TRANSITION_INTEGRITY
4. EXECUTION_EVIDENCE_INTEGRITY
5. REVIEW_INTEGRITY
6. CARRY_FORWARD_INTEGRITY
7. POLICY_ENFORCEMENT_INTEGRITY
8. WORKSPACE_GROUNDING
9. SNAPSHOT_CONSISTENCY
10. READ_MODEL_CONSISTENCY
```

우선순위 원칙:

```text
먼저 source-of-truth 자체가 깨졌는지 본다.
그 다음 관계 / 전이 / 증거 / 리뷰 / 전달맥락을 본다.
마지막으로 재생성 가능한 snapshot / read model drift를 본다.
```

경계 규칙:

```text
SNAPSHOT_CONSISTENCY vs READ_MODEL_CONSISTENCY
- objective.json 같은 공식 snapshot이면 SNAPSHOT_CONSISTENCY
- 검색 index, cache, cursor cache, risk cache면 READ_MODEL_CONSISTENCY

REFERENCE_INTEGRITY vs EXECUTION_EVIDENCE_INTEGRITY
- Run이 없는 revision을 참조하면 REFERENCE_INTEGRITY
- Run Trace 내부 파일 / result / command log가 깨지면 EXECUTION_EVIDENCE_INTEGRITY

REVIEW_INTEGRITY vs EXECUTION_EVIDENCE_INTEGRITY
- run result 자체가 이상하면 EXECUTION_EVIDENCE_INTEGRITY
- VERIFIED / review record가 이상하면 REVIEW_INTEGRITY

CARRY_FORWARD_INTEGRITY vs WORKSPACE_GROUNDING
- CarryForwardItem 자체의 상태 / 내용 / sanitization 위반이면 CARRY_FORWARD_INTEGRITY
- Summary가 가리키는 changedFiles가 현재 workspace와 달라졌으면 WORKSPACE_GROUNDING
```

Validation Rule 생성 규칙:

```text
1. validation engine loads rule table
2. executes check condition
3. if failed:
   - emits finding
   - category = rule.category
   - severity = rule.severity
   - scope = rule.scope
   - expected / actual / evidence = computed by rule
4. no human / LLM classification step exists
```

금지:

```text
UNKNOWN category 금지.
UNCLASSIFIED finding 금지.
No inferred category.
No guessed severity.
No unclassified finding.
```

한국어:

```text
category를 추론하지 않는다.
severity를 추측하지 않는다.
분류되지 않은 finding을 허용하지 않는다.
```

새 check가 필요한데 category가 없다면 finding을 생성하지 않는다. 그 경우 validation rule definition 자체가 invalid이며, category taxonomy review가 필요하다.

Severity 정의:

```text
Severity
= finding의 직접 scope와 그 scope impact set 안에서
  CodeFleet capability를 제한하는 deterministic policy value
```

한국어:

```text
Severity는 validation finding의 직접 scope와 그 의존 대상 전체에 대해
어떤 CodeFleet capability를 제한할지 결정하는 정책값이다.
```

Severity는 문제의 심각도 설명이 아니라 capability restriction policy다.

최종 구성:

```text
1. severity
   어떤 capability를 제한하는가

2. scope
   finding이 직접 발생한 위치

3. scope impact set
   그 finding이 영향을 미치는 상위 / 하위 / 의존 대상

4. capability
   command가 수행하려는 행위 유형
```

Capability Set:

```text
READ
= 상태 조회

INSPECT
= 상세 증거 조회

VALIDATE
= invariant check 실행

REBUILD
= snapshot / index / cache 재생성
= source of truth 변경 없음

REPAIR
= 명시적 repair 수행
= correction event append 가능

EXPORT
= evidence / report / backup export

DRAFT_STANDALONE
= 특정 corrupted Objective에 붙지 않는 독립 Draft 생성

REVIEW_READ
= review 대상 조회
= 상태 변경 없음

REVIEW_WRITE
= review 결과 기록

MUTATE_OBJECTIVE
= Objective state 변경

MUTATE_QUEUE
= queue item 변경

MUTATE_TASK_CONTRACT
= Task 계약 변경

MUTATE_CARRY_FORWARD
= carry-forward attach / revoke / expire

EXECUTE
= Agent 실행 / task run / command execution / verification execution

POLICY_UPDATE
= Project Profile / policy 변경

RISK_RAISE
= risk를 더 높게 override

RISK_LOWER
= risk를 낮추는 변경
```

Severity별 capability policy:

```text
INFO
allowed:
- ALL
denied:
- none
```

```text
WARNING
allowed:
- ALL
required:
- warning display
denied:
- none
```

```text
REBUILD_REQUIRED
allowed:
- READ
- INSPECT
- VALIDATE
- REBUILD
- EXPORT
- REVIEW_READ
- POLICY_UPDATE
- RISK_RAISE

conditional:
- DRAFT_STANDALONE
  only if it does not attach to affected scope

denied:
- REVIEW_WRITE
- REPAIR
- MUTATE_OBJECTIVE
- MUTATE_QUEUE
- MUTATE_TASK_CONTRACT
- MUTATE_CARRY_FORWARD
- EXECUTE
- RISK_LOWER
```

`REBUILD_REQUIRED`로 분류되려면 원본 진실이 정상이어야 한다. 따라서 repair가 아니라 rebuild로 해결해야 한다. rebuild 전 source-of-truth validation이 실패하면 finding은 `CORRUPTION`으로 승격될 수 있다.

```text
CORRUPTION
allowed:
- READ
- INSPECT
- VALIDATE
- REPAIR
- EXPORT
- REVIEW_READ
- RISK_RAISE

conditional:
- REBUILD
  only if finding.suggestedRepair.kind == REBUILD_ALLOWED
- POLICY_UPDATE
  only if changing validation rules / profile does not suppress existing finding without revalidation
- DRAFT_STANDALONE
  only if outside affected scope

denied:
- REVIEW_WRITE
- MUTATE_OBJECTIVE
- MUTATE_QUEUE
- MUTATE_TASK_CONTRACT
- MUTATE_CARRY_FORWARD
- EXECUTE
- RISK_LOWER
```

RepairKind / RepairMode:

```text
category
= 무엇이 깨졌는가

severity
= 무엇을 막는가

repairKind
= 무엇을 변경하는가

repairMode
= 누가 / 어떤 승인 수준으로 수행하는가
```

RepairKind 정의:

```text
RepairKind
= finding을 해소하기 위해 CodeFleet이 어떤 대상을 어떤 방식으로 다룰 수 있는지 나타내는 deterministic repair class
```

RepairKind는 실제 변경 대상 기준으로 나눈다.

```text
REBUILD_DERIVED
RESTORE_SOURCE
APPEND_CORRECTIVE_EVENT
INVALIDATE_EVIDENCE
EXPIRE_CONTEXT
UPDATE_POLICY
```

공통 실행 원칙:

```text
No precondition, no action.
```

한국어:

```text
전제가 없으면 실행도 없다.
```

모든 repair / rebuild action은 전제를 명시해야 한다. 전제가 검증되지 않으면 실행하지 않는다.

```text
Preconditions must be explicit.
Preconditions must be checked.
Failed precondition blocks the action.
```

`rebuild`는 상태를 한번 고쳐보는 명령이 아니다.

```text
rebuild
= 원본 진실이 정상임을 확인한 뒤 파생물을 재생성하는 명령
```

원본이 잘못된 경우에는 rebuild를 실행하지 않는다. repair planner로 전환한다.

```text
source-of-truth invariant violation
-> rebuild denied
-> repair planner
```

REBUILD_DERIVED:

```text
target:
- objective.json
- snapshot
- cache
- index
- derived cursor
- generated context cache

changes:
- derived artifact 재생성

does not change:
- ledger
- Task Revision
- Run Trace
- review record
- CarryForward event
- Project Profile

preconditions:
- source of truth validation clean
- category is SNAPSHOT_CONSISTENCY or READ_MODEL_CONSISTENCY
- severity is REBUILD_REQUIRED

records:
- repair log required
- ledger correction event not required
```

REBUILD_DERIVED allowed iff:

```text
1. finding.category in {SNAPSHOT_CONSISTENCY, READ_MODEL_CONSISTENCY}
2. finding.severity == REBUILD_REQUIRED
3. all source-of-truth validation checks pass
4. target artifact is derived
5. rebuild can deterministically regenerate the artifact
6. rebuilt output can be validated against source of truth
```

REBUILD_DERIVED flow:

```text
1. validate source-of-truth checks
2. if source-of-truth finding exists:
     stop rebuild
     emit / keep source-of-truth finding
     hand off to repair planner
3. rebuild derived artifact
4. validate rebuilt artifact
5. write repair log
6. resolve REBUILD_REQUIRED finding / marker only if validation is clean
```

최종 원칙:

```text
Rebuild repairs derived artifacts only.
Rebuild never repairs source-of-truth inconsistency.
```

한국어:

```text
rebuild는 파생물만 고친다.
rebuild는 원본 진실 간 불일치를 고치지 않는다.
```

RESTORE_SOURCE:

```text
target:
- missing Task Revision file
- missing Run Trace file
- missing review record
- missing ledger file
- missing policy file

changes:
- restore original file from VCS / backup / user-provided source

does not change:
- do not infer missing content
- do not synthesize missing ledger event
- do not fabricate run result

preconditions:
- restore source specified
- restored file hash recorded
- validate before and after restore

records:
- repair log required
- ledger event usually not required
- if domain state changes after restore, separate correction event required
```

APPEND_CORRECTIVE_EVENT:

```text
target:
- Objective ledger
- queue relation
- task relation
- carry-forward state
- objective state

changes:
- append-only correction event 추가

does not change:
- do not edit / delete past ledger event
- do not edit Task Revision
- do not edit Run Trace

preconditions:
- correction event type defined
- reason required
- actor required
- affected findingId required

records:
- ledger correction event required
- repair log required
```

Corrective Event 정의:

```text
Corrective Event
= append-only event that changes the effective state
  of a domain object from the corrective event's sequence onward,
  without rewriting or reinterpreting prior events
```

한국어:

```text
Corrective Event는 해당 이벤트의 seq 이후부터
도메인 객체의 유효 상태를 변경하는 append-only 이벤트다.
과거 이벤트를 수정하거나 재해석하지 않는다.
```

핵심 구분:

```text
historical event
= 과거에 무엇이 기록되었는가

effective state
= 특정 seq 시점에서 무엇이 유효한가
```

Replay 규칙:

```text
Replay does not reinterpret history.
Replay applies events in order to compute effective state at a target sequence.
```

한국어:

```text
Replay는 과거를 재해석하지 않는다.
Replay는 이벤트를 순서대로 적용해 특정 seq의 유효 상태를 계산한다.
```

예:

```text
seq 10: CARRY_FORWARD_ATTACHED cf-001
seq 18: CARRY_FORWARD_REVOKED cf-001
```

의미:

```text
seq 10 ~ 17:
- cf-001 effective state = ATTACHED

seq 18 이후:
- cf-001 effective state = REVOKED
```

이 뜻이 아니다:

```text
cf-001은 처음부터 ATTACHED가 아니었다.
seq 10 event를 없는 것으로 본다.
```

INVALIDATE_EVIDENCE:

```text
target:
- Run evidence
- review evidence
- summary evidence
- verification evidence

changes:
- mark evidence as unusable for derived state / carry-forward / review computation

does not change:
- do not delete evidence file
- do not edit run result
- do not edit review record

preconditions:
- invalidation reason required
- affected evidence id required
- replacement evidence linked if present

records:
- invalidation record or correction event required
- repair log required
```

EXPIRE_CONTEXT:

```text
target:
- CarryForwardItem
- Run Summary
- Decision applicability

changes:
- mark context EXPIRED so it cannot be included in the next Harness prompt

does not change:
- do not delete source Run Trace
- do not edit summary text silently
- do not delete Decision silently

preconditions:
- drift evidence required
- sourceRunId / changedFiles / hash mismatch or equivalent structured evidence required
- reason required

records:
- CARRY_FORWARD_EXPIRED event required
- repair log required
```

UPDATE_POLICY:

```text
target:
- Project Profile
- validation rule table
- command policy
- risk policy
- guardrail policy

changes:
- update policy definition
- add / update validation rule

does not change:
- do not silently suppress existing finding
- do not resolve marker by policy change alone

preconditions:
- policy diff required
- reason required
- revalidate required
- relationship to existing finding recorded

records:
- policy change record required
- repair log required
- revalidation result required
```

RepairMode 정의:

```text
RepairMode
= repair option을 CodeFleet이 어떤 자동화 / 승인 수준으로 수행할 수 있는지 나타내는 deterministic execution class
```

RepairMode:

```text
AUTOMATED
- CodeFleet이 deterministic하게 실행 가능
- 사람의 선택 없이도 안전한 경우
- 예: REBUILD_DERIVED on clean source of truth

ASSISTED
- CodeFleet이 repair option을 제안
- 사람이 승인해야 실행
- 예: APPEND_CORRECTIVE_EVENT, EXPIRE_CONTEXT

MANUAL
- CodeFleet은 finding과 요구조건만 제공
- 사람의 외부 조치 필요
- 예: RESTORE_SOURCE from external backup
```

금지:

```text
LLM picks no RepairKind.
LLM picks no RepairMode.
Human invents no RepairKind at runtime.
Human invents no RepairMode at runtime.
```

한국어:

```text
LLM은 RepairKind / RepairMode를 고르지 않는다.
사람은 runtime에서 새로운 RepairKind / RepairMode를 만들지 않는다.
CodeFleet은 finding을 기준으로 가능한 repair options를 제시하고, 사람은 승인 / 거절 / 수동 처리만 한다.
```

RepairKind / RepairMode 예:

```yaml
repairKind: REBUILD_DERIVED
repairMode: AUTOMATED
```

```yaml
repairKind: APPEND_CORRECTIVE_EVENT
repairMode: ASSISTED
```

```yaml
repairKind: RESTORE_SOURCE
repairMode: MANUAL
```

Scope:

```text
WORKSPACE
OBJECTIVE
TASK
QUEUE_ITEM
TASK_REVISION
RUN
CARRY_FORWARD
SNAPSHOT
POLICY
```

Scope impact set:

```text
WORKSPACE
-> 모든 것에 영향

OBJECTIVE
-> 해당 Objective, queue items, attached task relations, carry-forward, runs에 영향

QUEUE_ITEM
-> 해당 queue item, 연결된 taskRevision, runs, carry-forward에 영향

TASK
-> 해당 task의 drafts / revisions / runs에 영향

TASK_REVISION
-> 해당 revision, 그 revision을 참조하는 queue items / runs / carry-forward에 영향

RUN
-> 해당 run, 그 run을 근거로 한 review / summary / carry-forward에 영향

CARRY_FORWARD
-> 해당 carry-forward item, 그 item을 포함하려는 draft / execution context에 영향

SNAPSHOT
-> snapshot / read model에 영향
-> source of truth에는 영향 없음

POLICY
-> policy를 참조하는 task / run / harness decision에 영향
```

명령 허용 공식:

```text
A command is allowed only if
no applicable finding in its scope impact set
denies the command capability.
```

한국어:

```text
명령은 그 명령의 대상에 영향을 미치는 어떤 finding도
해당 capability를 거부하지 않을 때만 허용된다.
```

더 정확히:

```text
For target T and command capability C:

applicableFindings =
  findings where affects(finding.scope, finding.target, T)

allowed(T, C) =
  C is allowed by every applicable finding severity policy
  AND C is not denied by any applicable finding severity policy
  AND all conditional requirements are satisfied
```

불변 규칙:

```text
deny wins.
most restrictive applicable finding wins.
```

예:

```text
Objective A = CORRUPTION
-> Objective A run / approve / attach / close 차단
-> Objective B는 영향 없음

Run run-002 = CORRUPTION
-> run-002 review write 차단
-> run-002를 source로 한 carry-forward attach 차단
-> 같은 Objective의 무관한 다른 queue item은 영향 없을 수 있음

Workspace = CORRUPTION
-> 전체 mutation / execution 차단
```

CorruptionMarker:

```text
CorruptionMarker
= active corruption findings를 scope / target 단위로 묶는 operational index
= gating truth가 아님
= 원인 truth가 아님
```

CorruptionMarker는 하나의 자료구조다. Workspace / Objective / Run / CarryForward별로 다른 marker 모델을 만들지 않는다. 구분은 `scope`와 `target`으로 한다.

```text
single CorruptionMarker model + scoped target
```

Finding과 Marker의 차이:

```text
Finding
= 무엇이 왜 깨졌는가
= expected / actual / evidence를 가진다
= capability gating의 입력이다

Marker
= 어디가 active corrupted 상태인가
= findingId 목록을 가진다
= 운영상 상태 추적과 resolve 관리를 위한 index다
```

중요:

```text
Marker가 capability를 직접 결정하지 않는다.
Capability gating은 active finding의 severity / scope impact set으로 계산한다.
Marker는 active finding bundle이다.
```

생성 규칙:

```text
if finding.severity == CORRUPTION:
    markerKey = finding.scope + stableTargetKey(finding.target)
    upsert CorruptionMarker(markerKey)
    add findingId
```

동일성 규칙:

```text
same scope + same stableTargetKey
-> same marker

same markerKey
-> active marker 최대 1개
```

marker 최소 필드:

```yaml
markerId: corr-20260529-001
status: ACTIVE
scope: OBJECTIVE
target:
  objectiveId: auth-error-response
findings:
  - finding-001
  - finding-002
createdAt: 2026-05-29T14:20:00+09:00
updatedAt: 2026-05-29T14:25:00+09:00
detectedBy: codefleet-validate
ruleSetVersion: 1
```

marker에는 expected / actual / evidence를 복사하지 않는다. 원인은 finding에 있으며, marker는 findingId를 참조한다.

상태:

```text
ACTIVE
- 해당 scope / target에 active CORRUPTION finding이 있음

RESOLVED
- repair / rebuild / validation으로 active CORRUPTION finding이 없어짐
- repair log 또는 validate clean 근거 필요

ARCHIVED
- resolved marker를 장기 보존 상태로 이동
```

resolve 규칙:

```text
- validate clean 없이 marker resolve 금지
- repair log 없이 marker resolve 금지
- linked active finding이 남아 있으면 marker resolve 금지
- marker 삭제로 corruption을 해결한 것처럼 처리 금지
```

AI 오케스트레이션 관점의 목적:

```text
1. 오염된 context가 다음 Agent prompt에 들어가지 못하게 막는다.
2. 깨진 Task / Run / CarryForward만 실행 / 승인 흐름에서 제외한다.
3. 무관한 Objective나 Task는 계속 진행 가능하게 한다.
4. repair 후 어떤 맥락을 다시 사용할 수 있는지 명확히 한다.
```

예:

```text
scope: RUN
target: run-002

차단:
- run-002 review write
- run-002를 source로 한 carry-forward attach
- run-002 기반 VERIFIED 계산

허용 가능:
- 같은 Objective의 다른 독립 queue item inspect
- 무관한 run show
- 다른 Objective 진행
```

Carry-forward 오염 예:

```text
scope: CARRY_FORWARD
target: cf-007

차단:
- cf-007 포함 prompt 생성
- cf-007 attach / re-attach

허용 가능:
- cf-008 사용
- 다른 Decision 사용
- 해당 Objective의 unrelated Task review
```

Execution Harness의 사전 gating 흐름:

```text
1. Task Revision 확인
2. Objective relation 확인
3. CarryForward context 구성 후보 확인
4. 관련 active finding / marker 조회
5. scope impact set이 execution target에 닿는지 계산
6. EXECUTE capability가 deny되면 실행 중단
```

원칙:

```text
Objective 상태 변경은 파일 수정이 아니라 event transition이다.
```

따라서 `task review`, `objective skip`, `objective close`, `carry-forward attach` 같은 상태 변경 명령은 최종적으로 Mutation Engine을 거쳐야 한다. 반면 `objective show`, `task show`, `run show` 같은 조회 명령은 상태를 바꾸지 않으므로 Mutation Engine을 거치지 않아도 된다.

Mutation Engine을 반드시 거치는 변경:

```text
Objective 생성/변경
- objective create
- objective close
- objective reopen
- objective cancel

Task와 Objective 연결
- task attach
- task relation accept
- task relation approve
- task relation reject
- task relation invalidate

Queue 상태 변경
- objective block <task>
- objective unblock <task>
- objective skip <task>
- objective unskip <task>
- objective cancel-item <task>

Carry-forward context 변경
- carry-forward propose
- carry-forward attach
- carry-forward revoke
- carry-forward expire

Task Draft / Revision approval 관련
- task approve
- task edit after approval
- task invalidate approval
```

Mutation Engine을 거치지 않아도 되는 조회:

```text
- objective show
- objective list
- task show
- run show
- summary show
```

조회 명령은 상태를 변경하지 않으므로 Mutation Engine을 거치지 않아도 된다. 단, 조회 중 objective.json snapshot이 rebuild 결과와 다르다는 것을 감지하면 warning을 출력할 수 있다.

Lock 원칙:

```text
One writer at a time.
Many readers allowed.
```

한국어:

```text
상태 변경 writer는 한 번에 하나만 허용한다.
조회 reader는 여러 개가 동시에 가능하다.
```

최종형에서도 기본 lock은 workspace-level mutation lock이다.

```text
.codefleet/locks/workspace.lock
```

이유는 Task relation 변경이 여러 Objective에 동시에 영향을 줄 수 있기 때문이다. 예를 들어 같은 Task를 두 Objective에 동시에 attach하면 안 된다. Objective-level lock만으로는 이런 충돌을 막기 어렵다.

따라서 기본 원칙은 다음과 같다.

```text
- 모든 상태 변경은 workspace-level mutation lock을 잡고 수행한다.
- 조회는 lock 없이 가능하다.
- 나중에 성능 필요가 명확해지면 objective-level lock을 보조로 도입할 수 있다.
- 초기 설계에서는 병렬 mutation 최적화보다 일관성을 우선한다.
```

### 0.12 확정 규칙 작성 기준

CodeFleet 문서의 모든 내용이 같은 성격은 아니다. 최종 모델의 실행 규칙, 불변식, 상태 전이, policy gate, repair rule은 확정 규칙이어야 한다. 반면 예시, 후보 목록, 버전별 구현 계획, 장기 발전 방향은 확정 규칙이 아니다.

따라서 문서의 내용을 다음 4가지로 구분한다.

```text
FINAL RULE
= 최종 모델에서 흔들리면 안 되는 실행 / 검증 / 차단 규칙

DESIGN CANDIDATE
= 아직 확정 전인 설계 후보

EXAMPLE
= 규칙을 설명하기 위한 예시이며, 그 자체가 판정 기준은 아님

VERSION PLAN
= FINAL RULE을 어떤 버전에서 얼마나 구현할지 나눈 구현 계획
```

확정 규칙은 구체적이어야 한다.

```text
구체적
= 적용 대상, 입력, 출력, 상태 변화, 금지 동작이 명시되어 있음
```

확정 규칙은 정량적이어야 한다.

```text
정량적
= 사람이나 LLM의 감이 아니라, 같은 입력과 같은 rule set에서 같은 결과가 나오는 deterministic / machine-checkable condition을 가짐
```

확정 규칙은 전제를 가져야 한다.

```text
전제
= 해당 규칙이나 action을 적용하기 전에 반드시 참이어야 하는 조건
```

확정 규칙 최소 필드:

```text
ruleId
= 규칙을 식별하는 stable id

status
= FINAL | CANDIDATE | EXAMPLE | VERSION_PLAN

scope
= WORKSPACE | OBJECTIVE | TASK | QUEUE_ITEM | TASK_REVISION | RUN | CARRY_FORWARD | SNAPSHOT | POLICY

sourceOfTruth
= 판정에 사용하는 원본 진실

inputs
= 판정에 필요한 구조화 입력

preconditions
= 실행 / 판정 전에 만족해야 하는 조건

condition
= deterministic 판정식

allowedEffect
= 통과 시 허용되는 상태 변화나 capability

deniedEffect
= 실패 시 차단되는 상태 변화나 capability

failureFinding
= 실패 시 생성할 finding category / severity / evidence

repairBehavior
= repair / rebuild / corrective event / manual action 중 어떤 흐름으로 연결되는지
```

규칙 확정 기준:

```text
1. sourceOfTruth가 없으면 FINAL RULE이 될 수 없다.
2. preconditions가 없으면 action rule이 될 수 없다.
3. condition이 deterministic하지 않으면 validation rule이 될 수 없다.
4. failureFinding이 없으면 corruption / policy / validation rule이 될 수 없다.
5. allowedEffect와 deniedEffect가 없으면 capability gating rule이 될 수 없다.
6. repairBehavior가 없으면 repair rule이 될 수 없다.
```

문서 작성 규칙:

```text
- "후보", "예시", "초기에는", "장기적으로", "가능하면", "필요하면"은 FINAL RULE 문장에 쓰지 않는다.
- 이런 표현이 필요한 내용은 DESIGN CANDIDATE, EXAMPLE, VERSION_PLAN으로 명시한다.
- FINAL RULE은 사람이 읽는 설명과 별개로 machine-checkable form으로 옮길 수 있어야 한다.
- LLM이 해석해야만 판정 가능한 규칙은 FINAL RULE이 아니다.
- 사람이 감으로 승인해야만 판정 가능한 규칙은 FINAL RULE이 아니다.
```

검증 기준:

```text
same workspace state
+ same CodeFleet version
+ same Project Profile
+ same validation rule set
= same validation result
```

최종 원칙:

```text
Final rules must be concrete.
Final rules must be deterministic.
Final rules must declare preconditions.
Examples and candidates must not masquerade as rules.
```

한국어:

```text
확정 규칙은 구체적이어야 한다.
확정 규칙은 결정론적이어야 한다.
확정 규칙은 전제를 명시해야 한다.
예시와 후보가 규칙처럼 보이면 안 된다.
```

현재 문서에 대한 적용:

```text
0.x의 Objective / Queue / Task relation / Draft-Revision / Run-derived / Risk / Carry-forward / Corruption-Repair 모델은 FINAL RULE로 정리해 간다.

Harness, Project Profile, Run Summary, AgentRole, Guardrail, Verification 섹션은 아직 일부가 DESIGN CANDIDATE 또는 EXAMPLE 수준이다.

따라서 다음 논의에서는 이 후반 섹션들을 위 확정 규칙 작성 기준에 맞춰 하나씩 FINAL RULE로 승격한다.
```

## 1. 최종 지향 정의

위 고정 목표를 오케스트레이션 흐름으로 풀면 다음과 같다.

> CodeFleet은 사용자의 개발/운영 Objective를 하나 이상의 AI-generated Task Draft로 구조화하고, 사람이 승인한 Task를 Harness를 통해 역할·범위·가드레일·검증 조건 안에서 AI Agent에게 위임하며, 결과를 로그·diff·테스트·리뷰 기준으로 추적하는 AI-native 개발 오케스트레이션 CLI다.

이 정의에서 중요한 점은 CodeFleet이 단순한 AI CLI 래퍼가 아니라는 것이다.

CodeFleet의 중심은 AI 모델 호출이 아니라 다음 구조다.

```text
Intent
  -> Objective
  -> Task Draft
  -> Human Approval
  -> Harness Execution
  -> Agent Adapter
  -> Run Trace
  -> Run Summary
```

핵심 문장:

```text
Objective frames the work.
AI drafts executable tasks.
Human approves the work.
Harness controls the work.
Agent executes the work.
Trace records the work.
Summary communicates the work.
```

한국어로는 다음과 같다.

```text
Objective는 작업의 맥락과 연속성을 정의한다.
AI는 실행 가능한 작업 초안을 만든다.
사람은 실행 가능한 작업으로 승인한다.
Harness는 작업 조건을 통제한다.
Agent는 작업을 수행한다.
Trace는 실행을 기록한다.
Summary는 사람이 읽을 수 있게 전달한다.
```

CodeFleet의 가장 작은 실행 단위는 Task지만, 최종 사용자 흐름의 기준 단위는 Objective다.

```text
Objective
  -> Task
     -> Run
```

의미:

```text
Objective
= 사용자가 달성하려는 상위 목적
= 일회성인지, 연속 작업인지, 장기 workstream인지 정의하는 단위

Task
= AI에게 위임 가능한 실행 계약
= 역할, 범위, 가드레일, 검증, 완료 기준을 명시하는 단위

Run
= 특정 Task를 실제로 실행한 시도와 증거
= 로그, diff, 검증 결과, 리뷰 결과가 남는 단위
```

LLM은 현재 요청이 일회성인지, 이전 작업의 연속인지, 장기 workstream의 일부인지 스스로 단정하면 안 된다. CodeFleet은 이 연속성을 Objective 자료구조에 기록하고, 사람은 review 단계에서 그 연속성 제안을 수락하거나 수정한다.

핵심 원칙:

```text
LLM decides nothing about continuity.
CodeFleet records continuity.
Human accepts or approves continuity.
Harness supplies accepted or approved context.
```

한국어:

```text
LLM이 작업의 연속성을 단정하지 않는다.
CodeFleet이 연속성을 기록한다.
사람이 연속성 제안을 수락하거나 수정한다.
Harness가 수락된 맥락만 전달한다.
```

연속성 처리의 목적은 LLM 기억에 의존하지 않고, 승인된 요약과 결정사항만 다음 Task의 컨텍스트로 전달하는 것이다.

## 2. CodeFleet이 아닌 것

CodeFleet은 다음이 아니다.

```text
- 단순 Codex 실행기
- 프롬프트 생성기
- AI CLI 래퍼
- 중앙 프로젝트 관리 도구
- 웹 대시보드
- DB 기반 작업 관리 시스템
- CI/CD 대체재
- 배포 도구
- Secret manager
- 완전한 샌드박스
```

CodeFleet은 AI를 직접 믿고 실행시키는 도구가 아니라, AI 작업을 정의·제한·추적·검증하기 위한 로컬 오케스트레이션 도구다.

## 3. Core와 Workspace

CodeFleet은 프로젝트 정보를 중앙으로 가져와 소유하지 않는다.

대신 각 프로젝트가 `.codefleet` workspace를 통해 CodeFleet 규약을 채택한다.

핵심 원칙:

```text
CodeFleet Core owns behavior.
CodeFleet Workspace owns state.
```

한국어:

```text
CodeFleet Core는 동작 규약을 제공한다.
CodeFleet Workspace는 프로젝트별 상태를 소유한다.
```

### 3.1 CodeFleet Core

CodeFleet Core는 공통 오케스트레이션 엔진이다.

Core가 책임지는 것:

```text
- CLI 명령 체계
- Task Schema
- Harness Pipeline
- Prompt Builder
- Run Trace Format
- Agent Adapter Interface
- Workspace Metadata 해석 규칙
```

Core가 소유하면 안 되는 것:

```text
- 프로젝트 목록
- 프로젝트별 중앙 설정
- 사용자별 작업 DB
- 원격 workspace registry
- 비밀 정보
- 프로젝트별 업무 지식
- 실행 결과 중앙 저장소
```

정리:

> CodeFleet Core는 전역 상태를 갖지 않는다. 상태는 각 프로젝트의 `.codefleet` workspace 안에만 존재한다.

### 3.2 CodeFleet Workspace

CodeFleet Workspace는 `.codefleet` metadata directory를 가진 프로젝트 루트다.

정의:

> CodeFleet Workspace는 CodeFleet이 Task scope, Agent cwd, git diff, Run Trace를 해석하는 로컬 경계다.

구분:

```text
Workspace Root
= 실제 프로젝트 루트
= 소스코드, 테스트, 인프라 설정이 있는 기준 경로
= Task scope, git diff, Agent 실행 cwd 기준

Workspace Metadata Directory
= .codefleet/
= Profile, Task, Run Trace, 향후 Template/Policy 저장 위치
```

예시:

```text
hunik-msa/
  svc-gateway/
  svc-auth/
  docker-compose.yml
  infra/
  .codefleet/
    config.json
    tasks/
    runs/
```

이 경우:

```text
Workspace Root: hunik-msa/
Metadata Dir:   hunik-msa/.codefleet/
Scope 기준:     hunik-msa 기준 상대 경로
Run 저장:       hunik-msa/.codefleet/runs/*
```

장기적으로는 Git처럼 하위 디렉터리에서 명령을 실행해도 부모 방향으로 올라가며 `.codefleet`을 찾는 workspace discovery를 지원할 수 있다. 단, 초기 구현에서는 현재 cwd에 `.codefleet`이 있다고 가정해도 된다.

## 4. Metadata

CodeFleet Metadata는 프로젝트 코드 자체가 아니다.

정의:

> CodeFleet Metadata는 프로젝트 안에서 AI 작업을 정의·통제·실행·추적하기 위해 사용하는 로컬 운영 데이터다.

예시:

```text
프로젝트 코드:
- src/
- pom.xml
- Dockerfile
- terraform/*.tf
- nginx.conf

CodeFleet Metadata:
- .codefleet/config.json
- .codefleet/tasks/*.yaml
- .codefleet/runs/*
- .codefleet/context/*
- .codefleet/templates/*
- .codefleet/policies/*
```

권장 구조:

```text
.codefleet/
  config.json          # Project Profile / Workspace Contract
  local.json           # 개인 로컬 설정, git 제외
  tasks/               # Task Spec
  runs/                # Run Trace, git 제외
  context/             # 프로젝트별 AI 작업 컨텍스트
  templates/           # 역할별/출력별 템플릿
  policies/            # guardrail, verification 정책
```

Metadata 원칙:

```text
- Metadata는 프로젝트 안에 있다.
- Metadata는 프로젝트별이다.
- Metadata는 CodeFleet Core가 해석한다.
- Metadata는 비밀 정보를 담지 않는다.
- Metadata는 중앙으로 수집되지 않는다.
```

## 5. Project Profile

Project Profile은 `.codefleet/config.json`에 저장되는 개념이다.

정의:

> Project Profile은 프로젝트별 Harness 정책을 선언하는 Workspace Contract다.

즉 단순 기본값 파일이 아니라, 해당 프로젝트에서 AI 에이전트가 어떤 조건 안에서 일해야 하는지를 선언하는 정책 파일이다.

우선순위:

```text
1. Policy declaration
2. Defaults
3. Context/template references
```

### 5.1 Profile의 책임

1차 책임: Policy Declaration

```text
- 이 프로젝트에서 금지되는 파일/명령은 무엇인가
- 어떤 작업 모드는 기본인가
- 어떤 명령은 승인 없이 실행하면 안 되는가
- 어떤 검증 절차를 따라야 하는가
- secret이나 운영 설정을 어떻게 다뤄야 하는가
```

2차 책임: Defaults

```text
- 기본 agent
- 기본 agentRole
- 기본 workflow
- 기본 harness mode
```

3차 책임: References

```text
- context 파일 참조
- prompt template 참조
- review/summary template 참조
```

### 5.2 장기 예시

```json
{
  "version": "1.0.0",
  "workspace": {
    "name": "hunik-msa",
    "domains": ["BACKEND", "INFRA", "IAC"]
  },
  "policies": {
    "guardrails": {
      "defaultMode": "SUGGEST_ONLY",
      "blockedFilePatterns": [
        "**/.env",
        "**/application-prod.yml",
        "**/secrets/**"
      ],
      "blockedCommands": [
        "rm",
        "terraform apply",
        "kubectl delete",
        "systemctl restart"
      ],
      "approvalRequiredCommands": [
        "docker compose down",
        "kubectl rollout restart"
      ]
    },
    "verification": {
      "presets": {
        "backend:maven": ["mvn test"],
        "terraform:plan": [
          "terraform fmt -check",
          "terraform validate",
          "terraform plan"
        ]
      }
    }
  },
  "defaults": {
    "agent": "codex",
    "agentRole": "BACKEND_REVIEWER",
    "workflow": ["PLAN", "REVIEW"]
  },
  "references": {
    "contextFiles": [
      ".codefleet/context/architecture.md",
      ".codefleet/context/ops-rules.md"
    ],
    "templates": {
      "review": ".codefleet/templates/review.md",
      "summary": ".codefleet/templates/summary.md"
    }
  }
}
```

### 5.3 Profile이 담으면 안 되는 것

```text
- 비밀 정보
- 다른 프로젝트 목록
- 실행 로그 원문
- 중앙 run history
- 운영 서버 접속 정보
- 프로젝트 전체 지식 문서의 본문 전체
- 개인별 local path 강결합
```

긴 설명과 프로젝트 지식은 `config.json`에 몰아넣지 않고 context 파일로 분리한다.

```text
.codefleet/context/architecture.md
.codefleet/context/ops-rules.md
```

## 6. Objective와 Task Spec

Objective와 Task Spec은 CodeFleet의 작업 계약을 이루는 핵심 자료구조다.

### 6.1 Objective

Objective는 Task보다 상위에 있는 작업 맥락 단위다.

정의:

> Objective는 사용자가 달성하려는 상위 목적과 그 목적에 속한 Task들의 연속성을 기록하는 로컬 자료구조다.

Task가 실행 가능한 계약이라면, Objective는 여러 Task가 왜 이어지는지 설명하는 목적 계약이다.

Objective가 책임지는 것:

```text
- 이 작업이 일회성인지 연속 작업인지 장기 workstream인지 구분
- 관련 Task Queue와 순서
- 승인된 결정사항
- 다음 Task에 전달할 sanitized context
- 완료/보류/취소 상태
```

Objective가 책임지면 안 되는 것:

```text
- 원본 stdout/stderr 전체
- 원본 git diff 전체
- secret, token, env 값
- Agent 실행 prompt 원문 전체
- Task별 실제 실행 증거
```

이런 실행 증거는 Run Trace에 남긴다.

초기 Objective 종류:

```text
ONE_OFF
- 한 번 실행하고 닫는 작업
- 이전 Run Summary를 다음 작업에 자동 연결하지 않는다.

SEQUENCE
- 정해진 목표를 여러 Task로 나눠 순차 진행하는 작업
- 이전 Task의 승인된 Summary와 결정사항을 다음 Task에 전달할 수 있다.

WORKSTREAM
- 장기간 이어지는 열린 주제
- 매 Task마다 어떤 context를 이어받을지 review 단계에서 확인한다.
```

중요한 점은 모든 Task가 Objective 없이 떠다니면 안 된다는 것이다.

최종 모델에서는 Task가 항상 다음 중 하나에 속한다.

```text
- 명시적인 ONE_OFF Objective
- 순차적인 SEQUENCE Objective
- 장기적인 WORKSTREAM Objective
```

Task Review 화면은 Objective 연결을 확인해야 한다.

예시:

```text
Work Context
Objective: CodeFleet Task Review UX
Kind: SEQUENCE
Relation: CONTINUATION

Carry Forward:
- approved decisions
- sanitized summaries
- no raw logs
- no raw diffs

Actions:
- Treat as one-off
- Attach to existing objective
- Start new sequence
- Convert to workstream
```

최소 Objective 예시:

```yaml
id: codefleet-task-review-ux
title: Task Review 인터랙티브 UX 설계
kind: SEQUENCE
status: OPEN

continuity:
  carryForward:
    decisions: true
    summaries: true
    rawLogs: false
    rawDiffs: false

queue:
  policy: SEQUENTIAL
  cursor: task-review-interactive-session
  items:
    - taskId: task-review-minimal-flow
      position: 1
      relation: START
      storedState: null
    - taskId: task-review-edit-approval
      position: 2
      relation: CONTINUATION
      storedState: null
    - taskId: task-review-interactive-session
      position: 3
      relation: CONTINUATION
      storedState: WAITING
```

Objective의 핵심은 LLM에게 "기억하라"고 요구하는 것이 아니라, CodeFleet이 로컬 자료구조로 연속성을 명시하고 Harness가 accepted 또는 approved 맥락만 전달하게 만드는 것이다.

### 6.1.1 OMX 레퍼런스와 CodeFleet의 차이

CodeFleet의 Objective 모델은 `oh-my-codex`의 durable workflow 아이디어에서 힌트를 얻을 수 있다.

OMX의 `$ultragoal` 흐름은 approved plan을 durable goals로 만들고, `.omx/ultragoal` 아래에 계획과 ledger checkpoint를 남기는 방식이다.

개념적으로는 다음 구조에 가깝다.

```text
brief
  -> ordered goals
  -> active goal cursor
  -> ledger checkpoints
```

OMX에서 CodeFleet이 참고할 점:

```text
- 대화 안의 계획을 휘발성으로 두지 않고 repo-native artifact로 남긴다.
- 여러 goal/task를 순서 있는 durable plan으로 관리한다.
- 현재 진행 중인 항목을 cursor로 표시한다.
- 각 진행 checkpoint와 상태 변경을 ledger에 남기는 아이디어를 참고한다.
- 재시작/재개를 고려한 상태 파일을 둔다.
- HUD나 표시용 상태와 판단용 authoritative state를 구분한다.
- mutation lock과 atomic write 같은 상태 갱신 안전장치를 둔다.
```

하지만 CodeFleet은 OMX를 그대로 복제하지 않는다.

OMX의 goal은 Codex goal mode에 넘길 실행 목표에 가깝지만, CodeFleet의 Task는 역할, 범위, 가드레일, 검증, 승인 revision을 포함하는 실행 계약이다.

따라서 CodeFleet은 다음처럼 더 보수적으로 분리한다.

```text
Objective
= 상위 목적과 Task Queue의 연속성

Task Spec
= AI에게 위임 가능한 승인 대상 실행 계약

Run Trace
= 실제 실행 증거

Run Summary
= sanitized carry-forward 대상
```

OMX에서 가져오지 않을 것:

```text
- Codex goal mode 중심 모델
- goals.json 하나에 계약/실행/진행 상태를 과도하게 모으는 구조
- LLM이나 active thread가 completion의 최종 근거가 되는 구조
- 원본 로그/diff를 다음 작업 맥락으로 넘기는 흐름
- Objective 간 자유 graph / parent-child graph
- 실행 중 steering으로 승인된 Task 계약을 우회하는 방식
```

CodeFleet의 보수적 원칙:

```text
Use durable queue ideas.
Do not collapse contracts, execution evidence, and summaries into one file.
```

한국어:

```text
durable queue 아이디어는 가져온다.
계약, 실행 증거, 요약을 한 파일에 합치지 않는다.
```

권위 상태는 다음처럼 나눈다.

```text
.codefleet/tasks/<task-id>.yaml
= Task 계약의 진실

.codefleet/runs/<run-id>/*
= 실행 결과의 진실

.codefleet/objectives/<objective-id>/ledger.jsonl
= Objective / Queue 변경 이력의 진실

.codefleet/objectives/<objective-id>/objective.json
= ledger, task, run에서 재생성 가능한 snapshot
```

즉 `objective.json`은 빠른 조회를 위한 현재 상태 파일이지, 단독 권위 상태가 아니다. 손상되거나 불일치가 생기면 ledger, Task Spec, Run Trace를 기준으로 재생성할 수 있어야 한다.

Objective 안의 Task Queue는 다음 구조를 따른다.

```text
Objective
  -> Task Queue
     -> Task
        -> Run
```

Queue는 Task의 순서, 현재 cursor, block/skip 같은 진행 상태를 관리한다. 다만 Task의 계약 상태와 Run의 실행 결과를 대신 소유하지 않는다.

Cursor 정의:

```text
cursor
= Objective의 Task Queue 안에서 현재 주목해야 하는 Task 위치
= "이 Objective에서 지금 다음으로 봐야 할 Task가 무엇인가"를 가리키는 포인터
```

예시:

```text
Objective: 회원가입/로그인 API 에러 응답 통일

Queue:
1. 현재 에러 응답 구조 조사
2. 공통 응답 포맷 설계
3. 회원가입 API 수정
4. 로그인 API 수정
5. 테스트 추가

1번이 끝났고 2번을 봐야 한다면 cursor는 2번 Task를 가리킨다.
```

하지만 cursor는 단독 권위 상태가 되면 안 된다. 예를 들어 cursor는 2번을 가리키는데 2번 queue item의 Run-derived State가 이미 VERIFIED이고 3번이 NEXT여야 한다면 상태가 꼬인다.

따라서 CodeFleet은 cursor를 다음처럼 취급한다.

```text
- cursor는 objective.json snapshot에 표시할 수 있다.
- cursor는 빠른 조회와 UX focus를 위한 값이다.
- cursor만으로 실행 가능 Task를 판단하지 않는다.
- 실행 가능 여부는 approved Revision, Run Trace, Queue policy를 기준으로 계산한다.
```

Objective kind에 따른 cursor 원칙:

```text
SEQUENCE
- 순서가 엄격하다.
- cursor는 앞에서부터 queue items를 스캔해 계산할 수 있어야 한다.
- VERIFIED / SKIPPED는 지나간다.
- DONE은 기본적으로 review 대기이므로 멈춘다.
- Project Profile이 LOW risk autoAdvanceOnDone을 명시적으로 허용한 경우에만 DONE을 지나갈 수 있다.
- BLOCKED를 만나면 멈춘다.
- 처음 만나는 실행 후보가 NEXT가 된다.
- snapshot의 cursor가 계산 결과와 다르면 계산 결과가 우선한다.

WORKSTREAM
- 순서가 엄격하지 않은 장기 작업 흐름이다.
- cursor는 사람이 선택한 현재 focus에 가깝다.
- focus 변경은 ledger event로 남긴다.
- 그래도 실행 가능 여부는 approved Revision과 guardrail을 기준으로 다시 검증한다.

ONE_OFF
- queue item이 하나이므로 cursor가 사실상 그 Task를 가리킨다.
```

Queue 상태 원칙:

```text
저장 가능한 상태:
- WAITING
- BLOCKED
- SKIPPED
- CANCELED

계산해야 하는 상태:
- NEXT
- ACTIVE
- DONE
- VERIFIED
```

`NEXT`, `ACTIVE`, `DONE`, `VERIFIED`는 approved Revision, Run Trace, review result, Queue policy에서 계산할 수 있으므로 원본 진실로 저장하지 않는다. snapshot에는 표시할 수 있지만, 불일치가 생기면 재계산 결과가 우선한다.

여기서 "저장 가능한 상태"와 "계산해야 하는 상태"의 차이는 다음과 같다.

```text
저장 가능한 상태
= 사람이 명시적으로 결정하거나 외부 근거가 필요해서 파일/ledger에 기록해야 알 수 있는 상태

계산해야 하는 상태
= 이미 존재하는 Task Revision, Run Trace, Queue 순서를 보면 자동으로 판단할 수 있는 상태
```

핵심 원칙:

```text
Do not store the same truth twice.
```

한국어:

```text
같은 사실을 두 군데에 원본 진실로 저장하지 않는다.
```

예를 들어 `DONE`과 `VERIFIED`는 Objective Queue에 원본 상태로 저장하지 않는다.

```text
DONE
= Run Trace의 result를 보고 판단할 수 있음
= 이미 존재하는 실행 증거에서 계산 가능

VERIFIED
= Run review result를 보고 판단할 수 있음
= 사람이 해당 queue item 결과를 받아들였다는 증거에서 계산 가능
```

반대로 `SKIPPED`는 저장해야 한다.

```text
SKIPPED
= 사람이 이 queue item을 건너뛰기로 결정한 상태
= Task/Run 기록만 봐서는 자동으로 알 수 없음
= ledger event로 남겨야 함
```

상태별 기준:

```text
WAITING
- queue에 들어왔지만 아직 진행 대상이 아님
- queue item의 기본 저장 상태로 둘 수 있음

BLOCKED
- 외부 정보, 사람 결정, 선행 작업 문제 등으로 막힌 상태
- 막힌 이유를 사람이 기록해야 하므로 저장

SKIPPED
- 이 Objective 안에서는 해당 Task를 건너뛰기로 한 상태
- 명시적 결정이므로 저장

CANCELED
- queue item을 취소한 상태
- 명시적 결정이므로 저장

NEXT
- queue policy와 앞 item 상태를 보면 계산 가능
- 저장하지 않음

ACTIVE
- 현재 실행 중인 run이 있는지 보면 계산 가능
- 저장하지 않음

DONE
- Run Trace의 result를 보면 계산 가능
- 저장하지 않음

VERIFIED
- Run review result를 보면 계산 가능
- 저장하지 않음
```

나쁜 상태 예시:

```text
objective.json: task-001 is DONE
task revision:  task-001 revision 1 is APPROVED
run/result:     task-001 failed
```

이런 상태가 생기면 무엇을 믿어야 할지 애매해진다. 따라서 Objective Queue에는 `DONE`이나 `VERIFIED`를 원본 진실로 저장하지 않고, approved Revision, Run Trace, review result를 기준으로 계산한다.

좋은 상태 예시:

```text
objective ledger:
- task-001 attached
- task-002 skipped by human

task revision:
- task-001 revision 1: APPROVED

run/result:
- run-002 for task-001 revision 1: success

review/result:
- run-002 accepted by human

derived queue state:
- task-001 = VERIFIED
- task-002 = SKIPPED
- task-003 = NEXT
```

꼬임을 막기 위한 불변식:

```text
- 승인 시점의 Task는 정확히 하나의 Objective queue item에 속한다.
- queue item은 taskId, taskRevision, relationState(accepted 또는 approved)를 함께 가리킨다.
- Task revision이 바뀌면 기존 approval과 queue relation은 무효화되거나 새 item으로 기록된다.
- SEQUENCE Objective는 derived NEXT가 최대 1개다.
- 기본 정책에서 ACTIVE Run은 Objective당 최대 1개다.
- Queue position은 직접 수정하지 않고 reorder 이벤트로만 바꾼다.
- Objective snapshot은 ledger, Task Revision, Run Trace, review result에서 재생성 가능해야 한다.
- raw stdout/stderr/diff는 Objective나 carry-forward context에 들어가지 않는다.
```

최종 모델의 `QUEUE_REORDERED`는 보수적으로 처리한다.

원칙:

```text
QUEUE_REORDERED는 queue item의 position을 직접 수정하지 않는다.
QUEUE_REORDERED는 ledger에 새로운 future order를 선언하는 이벤트다.
이미 완료, 스킵, 취소된 history segment는 재정렬하지 않는다.
아직 실행되지 않은 future segment만 reason과 함께 재정렬할 수 있다.
Snapshot은 ledger를 재생할 때 이 이벤트를 적용해 objective.json의 queue order를 재생성한다.
```

즉 reorder는 과거 실행 순서를 고치는 기능이 아니라, 앞으로 진행할 queue item의 순서를 바꾸는 기능이다.

구분:

```text
History segment
- DONE
- SKIPPED
- CANCELED

Future segment
- WAITING
- BLOCKED
- NEXT 후보
- 아직 실행되지 않은 approved Revision이 연결된 queue item
```

Task Draft는 아직 승인된 실행 계약이 아니므로 queue history를 재정렬하는 기준으로 사용하지 않는다.

`QUEUE_REORDERED` 검증 규칙:

```text
- CLOSED / CANCELED Objective에서는 reorder할 수 없다.
- ACTIVE Run이 있으면 reorder할 수 없다.
- history segment item은 위치를 바꿀 수 없다.
- futureOrder에는 재정렬 대상 future item이 정확히 한 번씩 포함되어야 한다.
- 존재하지 않는 taskId를 포함할 수 없다.
- 다른 Objective의 taskId를 포함할 수 없다.
- reason은 필수다.
```

예시:

```json
{
  "seq": 12,
  "type": "QUEUE_REORDERED",
  "objectiveId": "auth-error-response",
  "futureOrder": [
    "task-common-error-design",
    "task-signup-error-implementation"
  ],
  "reason": "공통 응답 포맷 설계를 먼저 확정해야 구현 Task를 안전하게 진행할 수 있음",
  "actor": "user",
  "at": "2026-05-29T10:30:00+09:00"
}
```

Ledger event 최소 세트:

```text
Objective events
- OBJECTIVE_CREATED
- OBJECTIVE_UPDATED
- OBJECTIVE_CLOSED
- OBJECTIVE_REOPENED
- OBJECTIVE_CANCELED

Queue events
- TASK_ATTACHED
- QUEUE_ITEM_BLOCKED
- QUEUE_ITEM_UNBLOCKED
- QUEUE_ITEM_SKIPPED
- QUEUE_ITEM_UNSKIPPED
- QUEUE_ITEM_CANCELED
- QUEUE_REORDERED

Relation events
- TASK_RELATION_ACCEPTED
- TASK_RELATION_APPROVED
- TASK_RELATION_REJECTED
- TASK_RELATION_INVALIDATED

Context events
- CARRY_FORWARD_PROPOSED
- CARRY_FORWARD_ATTACHED
- CARRY_FORWARD_REVOKED
- CARRY_FORWARD_EXPIRED
```

Ledger는 제안 로그가 아니라 결정 로그다.

따라서 `TASK_RELATION_PROPOSED`는 ledger에 남기지 않는다. Proposed relation은 Draft Task 안의 제안일 뿐이며, 실행에는 사용할 수 없다. 사람이 review 단계에서 accept / approve / reject한 순간부터 ledger에 기록한다.

예시:

```yaml
objective:
  proposed:
    objectiveId: auth-error-response
    relation: CONTINUATION
    confidence: 0.82
    reason: "사용자가 이어서 에러 응답 통일 작업을 요청했고 열린 Objective가 일치함"
```

위 proposed relation은 Task Draft에만 존재한다. 사람이 수락하면 ledger에는 다음처럼 결정 이벤트가 남는다.

```json
{
  "eventId": "evt_20260529_103000_001",
  "seq": 12,
  "type": "TASK_RELATION_ACCEPTED",
  "objectiveId": "auth-error-response",
  "taskId": "task-signup-error-implementation",
  "taskRevision": 1,
  "relation": "CONTINUATION",
  "actor": "user",
  "at": "2026-05-29T10:30:00+09:00"
}
```

Ledger event 공통 필드:

```text
eventId
seq
type
objectiveId
actor
at
reason optional
```

공통 규칙:

```text
- eventId는 중복되면 안 된다.
- seq는 1부터 시작하고 끊기면 안 된다.
- ledger는 append-only다.
- 중간 줄은 수정하지 않는다.
- 잘못된 이벤트는 보정 이벤트로 처리한다.
- Task 실행 시작/성공/실패는 ledger에 기록하지 않는다.
```

실행 이벤트는 Objective ledger에 넣지 않는다.

```text
넣지 않음:
- TASK_STARTED
- TASK_DONE
- TASK_FAILED
- TEST_PASSED
- TEST_FAILED
```

이 이벤트들은 Objective / Queue 결정이 아니라 실행 결과에 속한다. 실행 결과의 진실은 Run Trace에 남긴다.

이벤트별 주요 추가 필드:

```text
TASK_ATTACHED
- taskId
- taskRevision
- relation
- position

TASK_RELATION_ACCEPTED / APPROVED / REJECTED / INVALIDATED
- taskId
- taskRevision
- relation
- relationState

QUEUE_ITEM_BLOCKED / UNBLOCKED / SKIPPED / UNSKIPPED / CANCELED
- taskId
- taskRevision

QUEUE_REORDERED
- futureOrder

CARRY_FORWARD_PROPOSED / ATTACHED / REVOKED / EXPIRED
- carryForwardId
- type: DECISION | SUMMARY
- state
- text 또는 targetCarryForwardId
- sourceObjectiveId optional
- sourceTaskId
- sourceTaskRevision optional
- sourceRunId optional
- objectiveQueueItemId optional
- changedFiles optional
```

`reason`이 필수인 이벤트:

```text
- QUEUE_ITEM_BLOCKED
- QUEUE_ITEM_SKIPPED
- QUEUE_ITEM_CANCELED
- QUEUE_REORDERED
- OBJECTIVE_CLOSED
- OBJECTIVE_CANCELED
- CARRY_FORWARD_ATTACHED
- CARRY_FORWARD_REVOKED
- CARRY_FORWARD_EXPIRED
```

이 설계의 목적은 OMX의 durable workflow 장점을 가져오되, CodeFleet의 핵심인 승인 가능한 Task 계약과 검증 가능한 실행 증거를 흐리지 않는 것이다.

### 6.2 Task Spec

Task Spec은 이번에 AI에게 맡길 작업을 정의하는 파일이다.

Task와 Task Revision은 구분한다.

```text
Task
= 논리적 작업 단위
= 사용자가 맡기려는 하나의 작업 흐름
= 안정적인 taskId를 가진다.

Task Draft
= 승인 전 수정 가능한 계약 후보
= draft.yaml에 저장된다.
= draft-ledger.jsonl로 변경 이력을 남긴다.
= 실행 불가

Task Revision
= 실행 가능한 계약 단위
= 특정 시점의 Task Spec 내용
= approval, objective relation, run, summary가 묶이는 단위
= immutable
```

Draft / Revision / Run 정의:

```text
Draft
= 승인 전 작업 계약 후보
= 수정 가능
= 실행 불가

Revision
= 승인된 불변 실행 계약
= 사람이 승인한 Task 계약의 특정 버전
= 실행 가능

Run
= 특정 Revision을 실제로 실행한 시도와 증거
```

각 책임:

```text
Draft
- intent
- proposed objective relation
- scope 후보
- guardrails 후보
- verification 후보
- doneCriteria 후보
- needsReview

Revision
- intent
- accepted / approved objective relation
- scope
- guardrails
- verification
- doneCriteria
- approval
- content hash

Run
- taskId
- taskRevision
- objectiveId snapshot
- queueItemId snapshot
- prompt
- stdout / stderr
- command log
- changed files
- git diff
- verification result
- review
- result.json
```

핵심 분리:

```text
Draft는 수정 가능하지만 실행 불가하다.
Revision은 불변이며 실행 가능하다.
Run은 실행 결과의 진실이다.
```

최종 원칙:

```text
Draft is for shaping.
Revision is for approval and execution.
Run is for evidence.
```

한국어:

```text
Draft는 작업 계약을 다듬기 위한 것이다.
Revision은 승인과 실행을 위한 것이다.
Run은 실행 증거를 남기기 위한 것이다.
```

이 정의는 나중에 README 사용자 설명에도 짧게 반영한다.

최종 파일 구조:

```text
.codefleet/tasks/
  <task-id>/
    task.json
    draft.yaml
    draft-ledger.jsonl
    revisions/
      1.yaml
      2.yaml
      3.yaml
```

역할:

```text
task.json
= Task head / index
= 현재 revision
= revision lineage
= 전체 Task 흐름 요약

draft.yaml
= 현재 편집 중인 Task 계약 후보
= 승인 전이므로 수정 가능
= proposed relation만 가질 수 있음

draft-ledger.jsonl
= draft가 언제, 왜, 어떻게 바뀌었는지 기록

revisions/<n>.yaml
= 특정 revision의 실행 계약
= intent, objective, scope, guardrails, verification, doneCriteria
= approval과 objective relation 상태
```

연결 규칙:

```text
Objective queue item
-> taskId + taskRevision + relationState

Run Trace
-> taskId + taskRevision

Approval
-> taskId + taskRevision

Run Summary
-> taskId + taskRevision + runId
```

revision 없이 taskId만으로 승인, 실행, summary를 연결하지 않는다. revision이 빠지면 어떤 계약을 승인했는지, 어떤 계약을 실행했는지 알 수 없다.

하위로 내려가는 실행 경로:

```text
Objective
-> queue item
-> taskId + taskRevision
-> revisions/<n>.yaml
-> approved contract
-> Run
```

상위로 올라가는 추적 경로:

```text
Run
-> taskId + taskRevision
-> revisions/<n>.yaml
-> objective relation
-> objective ledger / queue item
-> Objective
```

Run Trace는 실행 당시의 연결 snapshot을 가진다.

```json
{
  "runId": "run-002",
  "taskId": "signup-error-response",
  "taskRevision": 2,
  "objectiveId": "auth-error-response",
  "objectiveQueueItemId": "qitem-003"
}
```

`objectiveId`와 `objectiveQueueItemId`는 Run Trace 안에서는 실행 당시 snapshot이다. 권위는 Objective ledger와 Task Revision의 relation에 있으며, validate는 Run Trace의 snapshot이 이 권위 상태와 충돌하지 않는지 확인한다.

처리 흐름 예시:

```text
task signup-error-response 생성
-> draft.yaml 생성
-> draft edit
-> approve draft
-> revision 1 생성
-> relation accepted
-> revision 1 approved
-> run-001 실행
-> run-001 FAILED
-> task edit
-> revision 1 기반 새 draft 생성
-> draft edit
-> approve draft
-> revision 2 생성
-> revision 1 approval invalidated
-> revision 1 relation invalidated
-> revision 2 relation proposed / accepted / approved
-> revision 2 approved
-> run-002 실행
-> run-002 DONE
```

이 흐름은 다음 자료구조로 재구성 가능해야 한다.

```text
task.json
- 현재 revision
- revision lineage
- superseded 관계

revisions/<n>.yaml
- revision별 계약과 approval / relation 상태

objective ledger
- 어떤 revision이 Objective에 붙었는지
- 어떤 relation이 accepted / approved / invalidated 됐는지

runs/<run-id>/result.json
- 어떤 taskId / taskRevision을 실행했는지
- 실행 결과가 무엇인지
```

꼬임 방지 규칙:

```text
- Task ID는 논리적 작업 단위로 유지한다.
- Task Draft는 수정 가능하지만 draft-ledger로 변경 이력을 남긴다.
- Task Revision은 실행 계약 단위다.
- Task Revision은 생성 후 직접 수정하지 않는다.
- 승인, relation, run, summary는 모두 revision에 묶인다.
- 승인 전 변경은 draft를 수정한다.
- 승인 후 Task 내용이 바뀌면 새 draft를 만들고 새 revision을 생성한다.
- approval은 revision을 넘어 승계되지 않는다.
- relation도 revision을 넘어 승계되지 않는다.
- run result도 revision을 넘어 승계되지 않는다.
- objective queue는 taskId만 가리키지 않고 taskId + taskRevision을 가리킨다.
- 이전 revision은 직접 수정하지 않고 invalidation / superseded 기록만 남긴다.
- 처리 흐름은 task lineage + objective ledger + run trace로 재구성 가능해야 한다.
```

최종 원칙:

```text
Drafts are editable and audited.
Revisions are immutable and executable.
Approvals bind only to revisions.
Runs bind only to revisions.
Objective queue items point to revisions.
```

한국어:

```text
Draft는 수정 가능하지만 변경 이력을 남긴다.
Revision은 불변 실행 계약이다.
승인은 revision에만 묶인다.
Run은 revision에만 묶인다.
Objective queue item은 revision을 가리킨다.
```

Project Profile이 프로젝트별 정책이라면:

```text
Project Profile
= 이 프로젝트에서 AI가 일할 때 지켜야 하는 기본 정책

Task Spec
= 이번에 AI에게 맡길 구체적인 일
```

Task가 정의해야 하는 것:

```text
- 무엇을 하려는가
- 왜 하는가
- 어디까지 봐도 되는가
- 어디를 수정해도 되는가
- 무엇은 하면 안 되는가
- 어떤 역할로 판단해야 하는가
- 완료 기준은 무엇인가
- 검증은 어떻게 할 것인가
```

Task Spec은 최종적으로 단순 작업 메모가 아니라 승인 가능한 실행 계약서다.

즉 Task Spec은 다음 계층이 함께 사용하는 기준이다.

```text
Draft Harness
= 사용자의 Intent를 Task Draft로 구조화할 때 사용하는 출력 모델

Human Approval
= 사람이 실행 가능한 작업인지 검토하고 승인하는 계약

Execution Harness
= 승인된 Task를 Project Profile과 병합해 실행 조건으로 바꾸는 입력

Run Trace
= 실제 실행이 Task 계약을 지켰는지 확인하는 기준
```

Task Spec의 1차 필드에는 다음 항목을 포함한다.

```text
intent
objective
scope
guardrails
verification
doneCriteria
needsReview
```

이 필드는 v0.2 편의를 위한 임시 구조가 아니라 최종 모델의 핵심 필드다.

`objective` 필드는 Task가 어떤 Objective queue item에 속하는지 표현한다. Draft 단계에서는 proposed relation일 수 있고, Task Review 단계에서 사람이 이를 accepted / approved / rejected 중 하나로 확정하거나 수정한다.

최종 모델에서는 여기에 다음 실행 계약 필드가 더해질 수 있다.

```text
approval
discovery
review
run
```

경계는 다음과 같다.

```text
Task Spec
= 실행을 허용하기 위한 계약

Run Trace
= 실제 실행 증거

Run Summary
= 사람이 읽을 수 있게 정리한 sanitized 결과
```

## 7. AI-generated Task Draft

CodeFleet의 목표에 더 부합하는 Task 작성 흐름은 사람이 YAML을 처음부터 쓰는 방식이 아니다.

권장 흐름:

```text
User Intent
  -> Objective Selection / Creation
  -> Draft Harness
  -> AI-generated Task Draft
  -> Human Review / Approval
  -> Execution Harness
  -> Agent Adapter
  -> Run Trace
  -> Run Summary
```

핵심 원칙:

> AI may draft tasks, but only humans can approve executable tasks.

한국어:

> AI는 Task 초안을 작성할 수 있지만, 실행 가능한 Task로 승인하는 권한은 사람에게만 있다.

Objective 연결도 마찬가지다.

> AI may suggest continuity, but proposed continuity cannot drive execution until it is accepted or approved during review.

한국어:

> AI는 작업의 연속성을 제안할 수 있지만, proposed relation만으로는 실행할 수 없다. Task Review 단계에서 사용자가 제안을 수락하거나 수정해야 한다.

Objective relation 상태:

```text
proposed
- Draft Harness가 제안한 Objective 연결
- 실행에는 사용할 수 없음

accepted
- 사용자가 review 화면에서 낮은 위험의 제안을 그대로 수락한 연결
- 실행에 사용할 수 있음

approved
- 사용자가 명시적으로 선택/확정한 연결
- 모호하거나 위험한 경우 필요
- 실행에 사용할 수 있음

rejected
- 사용자가 거절한 연결
- 실행에 사용할 수 없음
```

UX 원칙:

```text
- 낮은 위험의 명확한 relation은 사용자가 빠르게 accept할 수 있어야 한다.
- Objective 후보가 여러 개이거나 위험한 carry-forward가 있으면 explicit approval이 필요하다.
- proposed relation은 Harness prompt에 포함하지 않는다.
- Execution Harness는 accepted 또는 approved relation만 사용한다.
```

### 7.1 상태 흐름

```text
Task Draft
  -> review / edit
  -> READY_FOR_APPROVAL
  -> approve
  -> Task Revision
  -> Run
  -> Run-derived State
```

상태 의미:

```text
Task Draft
- AI가 만든 작업 계약 후보
- 수정 가능
- 실행 불가
- 사람이 검토해야 함

READY_FOR_APPROVAL
- Draft가 review와 validate를 통과한 상태
- approve 가능
- 아직 실행 불가

Task Revision
- 승인된 불변 실행 계약
- 실행 가능
- approval / relation / run / summary가 묶이는 단위

Run
- 특정 Revision을 실행한 시도와 증거

Run-derived State
- Run Trace를 기준으로 계산한 실행 상태
- NO_RUN / ACTIVE / FAILED / DONE / VERIFIED
```

### 7.2 Drafting 규칙

Task Drafting은 보수적으로 동작해야 한다.

```text
- 생성 Task는 항상 Task Draft로 시작
- 기본 guardrails.mode는 SUGGEST_ONLY
- allowFileEdit 기본 false
- allowCommandExecution 기본 false
- scope가 불확실하면 needsReview 표시
- 위험 명령은 verification.commands에 직접 넣지 않음
- 위험 명령은 suggestedCommands 또는 notes로 분리
- doneCriteria는 검토 가능한 문장으로 작성
```

### 7.3 Task Review / Edit

CodeFleet의 최종 사용자 흐름은 사용자가 YAML을 처음부터 직접 작성하는 방식이 아니다. 사용자는 자연어 Intent를 입력하고, CodeFleet은 Task Draft를 생성하며, 사용자는 보조 명령을 통해 그 Draft를 검토·수정·승인한다.

초기부터 YAML 직접 편집만을 1차 UX로 두지 않는다. YAML은 저장 형식일 수 있지만, 사용자의 기본 흐름은 Task Review 중심이어야 한다.

권장 최소 흐름:

```text
codefleet draft "<user intent>"
codefleet task review <task-id>
codefleet task approve <task-id>
codefleet run <task-id>
```

최종 흐름에서 `task review`는 Task 내용뿐 아니라 Objective 연결도 검토한다.

```text
codefleet draft "<user intent>"
  -> Objective 후보 제안
  -> Task Draft 생성

codefleet task review <task-id>
  -> Draft 계약 검토
  -> Objective 연결 검토
  -> continuity accept / approve / reject / 수정

codefleet task approve <task-id>
  -> Draft를 immutable Task Revision으로 생성
  -> Revision approval 기록
  -> accepted 또는 approved Objective relation 확인

codefleet run <task-id>
  -> accepted 또는 approved Objective context만 Harness prompt에 포함
  -> approved Revision만 실행
```

`task review`의 책임:

```text
- 사람이 읽기 좋은 Task 요약을 보여준다.
- intent, scope, guardrails, verification, doneCriteria, needsReview를 강조한다.
- Objective 연결과 carry-forward context를 보여준다.
- 위험하거나 불확실한 항목을 눈에 띄게 보여준다.
- 필요한 경우 안전한 수정 흐름으로 연결한다.
```

`task edit` 또는 review 안의 수정 기능은 Task Draft만 수정한다.

금지 사항:

```text
- 프로젝트 소스 파일 수정 금지
- shell command 실행 금지
- 테스트 실행 금지
- Agent에게 코드 수정 지시 금지
```

즉 Task Draft 수정 명령은 실행 명령이 아니라 계약 후보 수정 명령이다.

핵심 안전 원칙:

```text
Approval is bound to a task revision.
```

한국어:

```text
승인은 특정 Task revision에만 유효하다.
```

따라서 승인된 Revision을 직접 수정하지 않는다. 승인 후 Task 내용을 바꾸려면 기존 Revision을 기반으로 새 Draft를 만들고, 다시 approve하여 새 Revision을 생성한다.

상태 흐름:

```text
Task Draft
  -> review/edit
  -> validate
  -> READY_FOR_APPROVAL
  -> approve
  -> immutable Revision

approved Revision
  -> edit
  -> new Draft from Revision
  -> approve
  -> new immutable Revision
  -> previous approval/relation invalidated or superseded
```

Task Review / Edit 안전 규칙:

```text
- Task Draft는 수정 가능하지만 draft-ledger에 변경 이력을 남긴다.
- approved Revision은 직접 수정하지 않는다.
- 승인 후 수정은 새 Draft를 만들고 새 Revision을 생성한다.
- approval 정보는 새 Revision에 자동 승계되지 않는다.
- Project Profile 정책을 완화하는 변경은 저장하지 못한다.
- More restrictive wins 원칙을 따른다.
- 저장 전/후 Draft diff를 보여준다.
```

이 흐름의 목적은 YAML 작성 능력을 사용자에게 요구하는 것이 아니라, AI가 만든 작업 계약을 사람이 안전하게 검토하고 승인할 수 있게 하는 것이다.

## 8. Harness

Harness는 CodeFleet의 차별점이다.

정의:

> Harness는 AI 에이전트가 Task를 수행할 때 역할·범위·권한·검증·수집 규칙을 적용하는 통제된 실행 껍질이다.

더 직접적인 정의:

> CodeFleet Harness는 사용자의 의도를 AI가 실행 가능한 작업으로 바꾸되, 프로젝트 정책과 안전 조건을 씌워서 Agent에게 전달하는 통제 계층이다.

사용자의 자연어 요청은 바로 Agent에게 전달되지 않는다.

예를 들어 사용자가 다음과 같이 말해도:

```text
"이 프로젝트 고쳐줘"
```

CodeFleet은 이 요청을 그대로 Codex나 다른 AI Agent에게 넘기지 않는다. 먼저 현재 Workspace의 Project Profile을 읽고, Harness 정책을 적용해 통제된 Task Draft 또는 실행 Prompt로 변환한다.

Agent에게 전달되는 지시는 다음처럼 조건을 가진 형태가 되어야 한다.

```text
너는 BACKEND_REVIEWER 역할이다.

이 작업은 SUGGEST_ONLY 모드다.
파일을 수정하지 마라.

분석 허용 범위:
- src/main/java/**
- src/test/java/**

제외 범위:
- **/.env
- **/application-prod.yml
- **/target/**
- **/build/**

금지 조건:
- 운영 설정을 수정하지 마라.
- JWT 토큰 원문을 로그에 남기지 마라.
- 무관한 리팩토링을 하지 마라.
- 위험 명령을 실행하지 마라.

검증 관점:
- 테스트 실행 가능 여부를 판단하라.
- 필요한 경우 실행할 테스트 명령을 제안하라.

응답 형식:
- 요약
- 분석한 파일
- 발견한 문제
- 수정 제안
- 테스트/검증 방법
- 위험 요소
- 다음 단계
```

핵심 원칙:

```text
사용자 자연어 요청은 바로 Agent에게 가지 않는다.
Harness가 Project Profile과 결합해 통제된 Task/Prompt로 바꾼다.
Agent는 그 통제된 지시 안에서만 일한다.
```

Agent Adapter와 Harness의 차이:

```text
Agent Adapter
= 특정 AI 도구를 어떻게 호출할지 아는 계층
= Codex, Claude Code, Gemini CLI 등

Harness
= AI가 어떤 조건 안에서 일해야 하는지 통제하는 계층
= role, scope, guardrail, verification, trace collection
```

구조:

```text
Task
  -> Harness
  -> Agent Adapter
  -> AI Coding Tool
```

### 8.1 Draft Harness

Draft Harness는 사용자의 자연어 Intent를 Task Draft로 구조화한다.

Task는 단순한 작업 메모가 아니다.

> Task는 AI에게 위임할 작업의 목표, 범위, 권한, 검증 기준, 완료 조건을 명시한 실행 전 계약서다.

따라서 코드 수정 Task를 제대로 정의하려면 Draft 단계에서도 프로젝트를 어느 정도 읽어야 할 수 있다. 예를 들어 "회원가입 API 에러 응답을 통일해줘"라는 Intent를 Task로 만들려면 회원가입 API가 어느 Controller에 있는지, 에러 응답이 어디서 만들어지는지, 공통 응답 타입이 이미 있는지, 테스트 위치가 어디인지 정도는 파악해야 한다.

하지만 Draft Harness는 실행 계층이 아니다.

핵심 원칙:

```text
Draft Harness performs bounded discovery, not execution.
```

한국어:

```text
Draft Harness는 제한된 사전 조사를 수행하지만, 작업 실행은 수행하지 않는다.
```

bounded discovery는 Task를 정의하는 데 필요한 범위 안에서만 제한적으로 프로젝트를 탐색하고 읽는 것을 의미한다.

책임:

```text
- Intent + Project Profile을 읽음
- AI Task Drafter에게 초안 생성을 위임
- 보수적인 guardrail 기본값 적용
- Draft State: EDITING으로 저장
- 실행하지 않음
```

Draft Harness가 할 수 있는 것:

```text
- Project Profile 읽기
- .codefleet/context 읽기
- 파일 트리 탐색
- 관련 파일 후보 검색
- 관련 소스 일부 읽기
- scope 후보 제안
- agentRole 제안
- verification 후보 제안
- needsReview 기록
```

Draft Harness가 하면 안 되는 것:

```text
- 파일 수정
- shell command 실행
- 테스트 실행
- terraform plan/apply 실행
- Agent에게 코드 수정 지시
```

읽기와 실행은 분리한다.

```text
User Intent
  -> Draft Harness
     - read-only bounded discovery
     - Task Draft 생성
  -> Human Approval
  -> Execution Harness
     - approved Revision 실행
     - 수정/검증/로그 수집
  -> Run Trace
```

### 8.2 Execution Harness

Execution Harness는 사람이 승인한 Task Revision만 실행한다.

책임:

```text
- approved Revision만 실행
- Project Profile 정책과 Task를 병합
- 역할/범위/가드레일/검증 조건을 prompt에 반영
- Agent Adapter 호출
- stdout/stderr/diff/result를 수집
- Run Trace 저장
```

### 8.3 Harness 단계별 발전

초기 Harness는 실행을 완전히 막는 샌드박스가 아니다.

Guardrail 단계:

```text
1. Instruction Guardrail
   프롬프트에 하지 말라고 명시

2. Detection Guardrail
   실행 후 diff, changed-files, command log를 보고 위반 감지

3. Enforcement Guardrail
   실행 중 실제로 막음
```

초기에는 Prompt-level Harness와 Trace-level Harness가 현실적이다.

```text
Prompt-level Harness
- 역할 지시
- 파일 수정 가능 여부
- 명령 실행 가능 여부
- 위험 명령 금지
- 검증 방법 안내

Trace-level Harness
- prompt 저장
- task 복사
- stdout/stderr 저장
- diff 저장
- result.json 저장
```

장기적으로는 Sandbox-level Harness와 Command-policy Harness로 확장할 수 있다.

## 8.4 Safe Orchestration

CodeFleet이 말하는 "안전한 오케스트레이션"은 AI가 실수하지 않도록 보장한다는 뜻이 아니다. AI가 실수할 수 있다는 전제 위에서, 실수의 범위와 영향을 제한하고 검토 가능한 기록을 남기는 운영 구조를 뜻한다.

최종 정의:

> 안전한 오케스트레이션이란 사용자의 의도를 명시적 Objective와 Task로 구조화하고, 사람이 Task revision을 승인하고 Objective relation을 수락 또는 승인한 뒤, Workspace 정책과 Harness가 허용한 권한 안에서만 AI Agent가 작업하게 하며, 모든 실행 결과를 검증 가능하고 되돌릴 수 있고 감사 가능한 기록으로 남기는 것이다.

짧게 표현하면:

> AI가 마음대로 일하지 못하게 하고, 승인된 작업·허용된 범위·검증된 결과 안에서만 일하게 만드는 운영 구조다.

최종 실행 흐름:

```text
User Intent
  -> Objective Selection / Creation
  -> Draft Harness
  -> Task Draft
  -> Task Review / Edit
  -> Draft READY_FOR_APPROVAL
  -> Human Approval creates Task Revision
  -> Accept / Approve Objective Relation
  -> Approved Task Revision
  -> Objective Queue Update
  -> Execution Harness
  -> Isolated / Controlled Agent Run
  -> Diff + Logs + Verification
  -> Review
  -> Close / Retry / Reject
```

최종 안전 조건:

```text
1. Explicit Objective and Task
   모든 AI 작업은 명시적 Objective와 Task에서 시작한다.

2. Human Approval
   AI가 만든 Task Draft는 사람이 승인해야 실행 가능하다.
   Objective relation은 review에서 accepted 또는 approved 상태여야 실행 가능하다.

3. Non-relaxable Workspace Policy
   Project Profile 정책은 Task가 완화할 수 없다.
   더 엄격해지는 것만 허용한다.

4. Least Privilege
   Agent는 필요한 최소 read/write/command 권한만 가진다.

5. Isolation
   가능하면 git worktree, temp workspace, container 등 격리된 실행 환경에서 작업한다.

6. Verification Gate
   테스트, lint, build, terraform plan, nginx -t 같은 검증 결과 없이는 성공으로 닫지 않는다.

7. Auditable Trace
   prompt, policy snapshot, commands, stdout/stderr, diff, changed files, verification, review, result를 남긴다.
```

최종 안전 모델:

> CodeFleet에서 안전한 오케스트레이션은 AI Agent에게 작업을 직접 맡기는 것이 아니라, accepted 또는 approved Objective relation, 승인된 Task revision, 비완화 Workspace Policy를 바탕으로 Harness가 최소 권한·격리·검증·추적 조건을 적용해 실행하고, 그 결과를 사람이 검토 가능한 Run Trace로 남기는 것이다.

안전 철학:

```text
Trust the process, not the agent.
```

한국어로는:

```text
AI를 신뢰하는 것이 아니라, AI가 일하는 절차와 경계를 신뢰한다.
```

## 9. Policy 병합 원칙

정책 병합 방향:

```text
Core defaults
  -> Project Profile policies
  -> Task guardrails
  -> Run options
```

하지만 권한은 넓어지면 안 된다.

핵심 원칙:

```text
More restrictive wins.
```

예:

```text
Profile:
allowCommandExecution: false

Task:
allowCommandExecution: true

결과:
불허. Task는 Profile 정책을 완화할 수 없다.
```

반대로 더 엄격해지는 것은 허용된다.

```text
Profile:
defaultMode: WORKSPACE_EDIT

Task:
mode: SUGGEST_ONLY

결과:
허용. Task가 더 보수적이다.
```

## 10. Run Trace와 Run Summary

Run Trace는 원본 실행 기록이다.

```text
.codefleet/runs/<run-id>/
  task.yaml
  prompt.md
  agent-role.md
  stdout.log
  stderr.log
  commands.log
  git-diff.patch
  changed-files.txt
  verification/
  review.md
  result.json
```

Run Trace는 기본적으로 git에 올리지 않는다.

이유:

```text
- 로그와 diff가 클 수 있음
- 민감 정보가 포함될 수 있음
- 실행 산출물이지 공유해야 하는 정책이 아님
```

반면 외부 작업일지에는 원본 로그가 아니라 Sanitized Run Summary를 남긴다.

원칙:

> CodeFleet은 Run Metadata를 로컬 원본 기록으로 보관하고, 외부 작업일지에는 민감 정보가 제거된 Run Summary만 내보낸다.

Notion, Obsidian, Markdown diary 등은 Run Trace 원본 저장소가 아니라 summary export 대상이다.

Notion에 올리지 말아야 하는 것:

```text
- stdout/stderr 원문 전체
- git diff 원문 전체
- secret, token, env 값
- 내부 URL / 운영 서버 정보
- 개인/회사 민감 경로
- 실패 로그에 포함된 인증 정보
```

Notion에 올려도 되는 것:

```text
- runId
- taskId
- task title
- agentRole
- harness mode
- status
- 요약
- 변경 파일 목록
- 실행한 검증 명령과 결과
- 발견한 문제
- 결정 사항
- 다음 액션
- 로컬 run path
```

장기 구조:

```text
Run Trace
  -> Run Summary
     -> Markdown
     -> Notion
     -> Obsidian
     -> GitHub Issue Comment
```

## 11. AgentRole

초기 AgentRole 후보:

```text
BACKEND_IMPLEMENTER
BACKEND_REVIEWER
BACKEND_REFACTORER
INFRA_OPERATOR
INFRA_DEBUGGER
IAC_ENGINEER
DOCS_WRITER
```

역할 의미:

```text
BACKEND_IMPLEMENTER
- API, 서비스 로직, DTO, 예외 처리, 테스트 구현

BACKEND_REVIEWER
- 코드 리뷰, 사이드이펙트 점검, 구조 검토

BACKEND_REFACTORER
- 중복 제거, 계층 분리, 유지보수성 개선

INFRA_OPERATOR
- systemd, Nginx, Docker, 배포 스크립트 작업

INFRA_DEBUGGER
- 로그 분석, 장애 원인 추정, 재현 절차 정리

IAC_ENGINEER
- Terraform, AWS, VPC, RDS, EC2, Security Group 작업

DOCS_WRITER
- README, 운영 문서, 장애 대응 문서 작성
```

역할은 너무 많이 만들면 안 된다. 역할이 많아지면 프롬프트 품질과 정책 관리가 어려워진다.

## 12. Guardrail

Guardrail은 백엔드/인프라 특화 CodeFleet에서 핵심이다.

위험 요소:

```text
- 운영 설정 파일 수정
- DB migration
- terraform apply
- docker compose down
- systemctl restart
- rm -rf
- secret 노출
- prod 환경 접속
- 무관한 리팩토링
```

작업 모드 후보:

```text
DRY_RUN
- 프롬프트와 실행 기록만 생성

SUGGEST_ONLY
- 분석/제안만 허용
- 파일 수정 금지

WORKSPACE_EDIT
- 지정된 scope 안에서 파일 수정 허용

COMMAND_EXEC
- 허용된 명령만 실행 가능

APPROVAL_REQUIRED
- 위험 명령은 사람 승인 필요
```

초기에는 `DRY_RUN`과 `SUGGEST_ONLY`가 가장 안전하다.

## 13. Verification

Verification은 "AI가 했다"가 아니라 "검증까지 추적했다"를 만들기 위한 개념이다.

예시:

```text
Backend:
- mvn test
- gradle test
- npm test
- npm run lint
- npm run typecheck

Docker:
- docker compose config
- docker compose build

Nginx:
- nginx -t

systemd:
- systemd-analyze verify <unit-file>

Terraform:
- terraform fmt -check
- terraform validate
- terraform plan
```

`terraform apply`는 기본 금지다.

Verification은 처음에는 prompt에 포함되는 검증 지시로 시작할 수 있다. 나중에는 Harness가 직접 실행하고 로그를 남길 수 있다.

## 14. 현재 구현과의 관계

현재 레포에는 v0.1 CLI 골격이 있다.

v0.1 구현 내용:

```text
- codefleet init
- codefleet run <task-id>
- codefleet prompt <task-id>
- codefleet task validate <task-id>
- YAML Task 로딩
- Task 검증
- Prompt 생성
- Run 디렉터리 생성
- dry-run 기본 지원
- stdout/stderr/git diff/result 저장
```

중요:

> 현재 v0.1 구현은 최종 아키텍처가 아니라 seed implementation이다. 앞으로의 설계는 이 문서의 Core / Workspace / Profile / Objective / Task Queue / Mutation Engine / Task Draft / Harness / Run Trace / Run Summary 개념을 기준으로 재정렬한다.

## 15. 논의 상태와 남은 항목

현재까지 고정한 항목:

```text
- 최종 목표와 목표 경계
- Objective / Task / Run 계층
- Objective / Task Queue / ledger / Mutation Engine이 목표 확장이 아니라 내부 구조라는 점
- Mutation Engine의 역할, command 범위, workspace-level lock 원칙
- Mutation 후 rebuild / validate / explicit repair 원칙
- Transition validation 상위 도메인 7개
- Objective State 규칙
- Queue Item State 규칙
- Task Relation State 규칙
- Task Draft / Revision State 규칙
- Run-derived State 규칙
- Risk 판단 원칙
- Context Carry-forward State 규칙
- Corruption 판정 원칙
- Invariant Core / Extensible Layer 원칙
- Finding category taxonomy
- Severity capability gating 원칙
- RepairKind / RepairMode taxonomy
- Corrective Event effective state 원칙
- 단일 CorruptionMarker + scope / target 모델
- Task와 Task Revision 분리
- Task revision lineage와 revision-bound approval / relation / run / summary 원칙
- QUEUE_REORDERED의 보수적 future order semantics
- ledger event 최소 세트와 "ledger는 결정 로그" 원칙
- 확정 규칙은 구체적 / 결정론적 / 전제 명시 기준을 만족해야 한다는 문서 작성 기준
```

다음으로 논의할 항목:

```text
1. Corruption / Repair State 세부 규칙
   - rebuild만으로 복구 가능한 경우
   - 보정 이벤트가 필요한 repair 경우
   - repair log와 ledger correction event의 관계

2. Harness 상세 정의
   - Draft Harness
   - Execution Harness
   - Guardrail 단계
   - Policy 병합 방식

3. Project Profile 최종 스키마
   - policies
   - defaults
   - references
   - local-only 설정 분리

4. Workspace discovery
   - 현재 cwd 기준
   - 부모 디렉터리 탐색
   - 명시적 --workspace 옵션

5. Run Summary 설계
   - summary.md 자동 생성
   - sanitization 규칙
   - Notion export adapter

9. Verification 실행 정책
   - prompt-only
   - manual command suggestion
   - allowlist 기반 자동 실행

10. Review 모델
   - AI review.md
   - human review note
   - approval 기록
```

## 16. 다음 세션에서 이어갈 때

다른 컴퓨터나 새 세션에서 이어갈 때는 다음 순서로 보면 된다.

```text
1. 이 문서 전체를 읽는다.
2. docs/architecture.md는 현재 구현 구조 참고용으로 본다.
3. README는 사용자용 현재 사용법 참고용으로 본다.
4. 구현을 바로 하지 말고 최종 목표와 목표 경계를 먼저 확인한다.
5. 현재 논의 상태를 보고 다음 미해결 항목부터 이어간다.
6. 개념 합의 후 v0.2 구현 범위를 작게 자른다.
```

우선순위:

```text
1. 최종 목표 기준 검토
2. 개념 고정
3. 문서 반영
4. 최소 구현
5. 테스트
6. push
```
