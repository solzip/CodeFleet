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
정책상 유효한 approval decision이 있는 Task를 AI 에이전트에게 역할 기반으로 위임하고,
실행 결과를 로그·diff·테스트·리뷰 기준으로 추적하는
AI-native 개발 오케스트레이션 CLI다.
```

이 목표 안에 포함되는 축:

```text
Objective
= 왜/어떤 맥락의 작업인가

Task
= 무엇을 어떤 조건으로 시킬 것인가

Approval Decision
= 정책상 허용된 actor가 실행 계약을 확정했는가

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

정책상 유효한 approval decision이 있는 Task를 AI 에이전트에게 위임
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
  "revisionHash": "sha256:revision-2",
  "approvalTargetHash": "sha256:revision-2",
  "actorKind": "HUMAN",
  "actorId": "user",
  "reason": "Reviewed and approved revision 2 contract.",
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

이 7개는 CodeFleet 상태 검증의 책임 경계다. 최종 모델에서도 상위 상태 도메인은 이 범위를 넘겨 더 잘게 쪼개지 않는다. 더 자세한 규칙은 각 도메인 내부의 세부 규칙으로 확장한다.

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
BLOCKED / SKIPPED / CANCELED item을 run하면 정책상 허용된 actor가 내린 흐름 결정과 실행이 충돌한다.
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
정책상 허용된 actor가 수락 / 승인한 것은 특정 Task revision이다.
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
- 다시 작업하려면 새 draft id 생성
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
- 유효한 approval decision이 있는 immutable contract
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

승인 취소 / 무효화 / 대체 처리 원칙:

```text
No rewrite.
No delete.
No hidden rollback.
Append corrective decision event.
```

승인이나 승인 취소는 Revision 파일을 직접 수정해서 표현하지 않는다. 기존 approval event는 삭제하거나 수정하지 않고, 취소 / 무효화 / 대체가 필요하면 새 corrective decision event를 append한다.

예:

```text
seq 10 TASK_APPROVED revision 1
seq 14 TASK_APPROVAL_INVALIDATED revision 1
seq 20 TASK_APPROVED revision 2
```

replay 결과:

```text
revision 1
= 승인된 적 있음
= seq 14에서 무효화됨
= 현재 실행 불가

revision 2
= 현재 승인됨
= 실행 가능
```

approval decision / correction event 공통 필드:

```text
taskId
taskRevision
revisionHash
actorKind
actorId
reason
at
```

event별 추가 필드:

```text
TASK_APPROVED
- approvalTargetHash

TASK_APPROVAL_INVALIDATED
- targetApprovalEventId

TASK_REVISION_SUPERSEDED
- supersededByTaskRevision
- supersededByRevisionHash
```

권위 원칙:

```text
TASK_APPROVED
-> 해당 revision이 실행 가능한 승인 상태가 됨

TASK_APPROVAL_INVALIDATED
-> 기존 approval을 무효화함
-> 과거 TASK_APPROVED event를 삭제하지 않음

TASK_REVISION_SUPERSEDED
-> 새 revision이 기존 revision을 대체함
-> 기존 revision 파일을 수정하지 않음
```

현재 approval state는 Revision 파일 안의 mutable field가 아니라 Task ledger의 approval decision event replay로 계산한다.

Task approval event 소유권:

```text
Task ledger
= .codefleet/tasks/<task-id>/task-ledger.jsonl
= draft edit, revision creation, approval, invalidation, supersede decision을 소유

Objective ledger
= .codefleet/objectives/<objective-id>/ledger.jsonl
= Objective relation, queue, review, carry-forward decision을 소유
```

승인 취소 / 무효화 / 대체는 반드시 Task ledger의 append-only event로 기록한다.

Draft를 approve해서 Revision을 만들기 위한 조건:

```text
- Draft schema valid
- intent 있음
- objectiveContext가 review에서 concrete objective target과 relation intent로 resolved 됨
- scope 있음
- guardrails 있음
- verification 있음
- doneCriteria 있음
- blocking needsReview 없음
- Project Profile보다 권한 완화 없음
- draft content hash 계산됨
```

Draft approval은 Objective relation 권위 상태를 Revision 파일에 쓰지 않는다. Revision 생성 후 해당 Revision을 Objective 흐름에 붙이는 relation / queue decision은 Objective ledger에 append한다. Revision이 실행 가능하려면 Task ledger의 유효한 `TASK_APPROVED`와 Objective ledger의 유효한 relation / queue decision을 모두 만족해야 한다.

생성되는 Revision은 다음을 포함한다.

```text
- immutable Task contract
- contentHash
- approval target hash / approval decision reference
- objective relation snapshot / reference
```

Revision 파일의 `approval decision reference`와 `objective relation snapshot / reference`는 권위 상태가 아니다. Approval의 현재 상태와 Objective relation의 현재 상태는 durable ledger event replay로 계산한다. Revision 파일은 어떤 계약 내용이 승인 대상이었는지 고정하기 위한 source이고, 승인 취소 / 무효화 / 대체 같은 decision 흐름을 직접 수정해서 표현하지 않는다.

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

Run-derived State는 저장 원본이 아니다. 특정 `objectiveQueueItemId + taskId + taskRevision`에 연결된 Run Trace, normalized Run result, durable Review Decision을 읽어 계산한다.

중요한 분리:

```text
DONE / FAILED
= 실행 증거와 normalized Run result를 해석한 상태

VERIFIED
= durable Review Decision과 verification gate를 해석한 queue progression state
```

정의:

```text
Run-derived State
= approved Revision에 대한 실행 시도와 review decision의 현재 해석
= Run Trace 단독이 아니라 Run Trace + Objective ledger decision에서 계산되는 상태
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
- agent error, command error, verification fail, guardrail violation 포함
- 최신 effective Review Decision이 REJECTED 또는 NEEDS_CHANGES이면 VERIFIED가 아니며 FAILED로 해석

DONE
- 최신 유효 terminal Run이 성공함
- 필요한 자동 검증이 통과함
- Review Decision이 아직 ACCEPTED가 아닐 수 있음

VERIFIED
- 최신 effective RUN_REVIEW_DECIDED가 ACCEPTED임
- verification gate가 만족됨
- queue completion의 가장 강한 근거
```

DONE과 VERIFIED의 Queue 진행 의미:

```text
DONE
= 실행 성공 증거
= review 대기
= 기본적으로 Queue를 자동 진행시키지 않음

VERIFIED
= 정책상 허용된 actor가 결과를 받아들임
= Queue progression을 만족시키는 상태
= SEQUENCE Objective에서 다음 item을 NEXT로 계산할 수 있는 기본 근거
```

Objective 전체 완료는 Run-derived State로 표현하지 않는다.

```text
DONE
= objectiveQueueItemId + taskId + taskRevision 단위의 실행 성공

VERIFIED
= 해당 queue item 결과를 정책상 허용된 actor가 받아들인 상태

CLOSED
= Objective 전체를 사람이 명시적으로 닫은 상태
```

따라서 `DONE`이나 `VERIFIED`는 Objective State가 아니다. Objective 완료 상태는 `CLOSED`이며, 모든 queue item이 VERIFIED여도 Objective는 자동으로 CLOSED가 되지 않는다. `OBJECTIVE_CLOSED` 이벤트가 필요하다.

기본 Queue 진행 정책:

```text
SEQUENCE Objective:
- previous item VERIFIED -> next item can become NEXT
- previous item DONE only -> stop and wait for review
- previous item DONE + reviewNotRequiredProgressionCondition -> next item can become NEXT
- previous item FAILED -> stop
- previous item NO_RUN / ACTIVE -> stop
```

정책 예외:

```text
LOW risk + Project Profile explicitly allows autoAdvanceOnDone
-> DONE을 직접 progression 근거로 쓰지 않음
-> SYSTEM_POLICY auto review 조건을 만족하면 RUN_REVIEW_DECIDED(ACCEPTED)를 append
-> 그 결과 VERIFIED가 계산되면 다음 item 진행 가능

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
Review Decision records durable acceptance / rejection.
Run-derived State interprets evidence and durable decisions.
Queue State decides workflow control.
```

한국어:

```text
Run Trace는 실행 증거를 남긴다.
Review Decision은 정책상 허용된 actor가 결과를 받아들였는지에 대한 durable decision을 남긴다.
Run-derived State는 실행 증거와 durable decision을 해석한다.
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
- VERIFIED는 runId 단위가 아니라 objectiveQueueItemId + taskId + taskRevision 단위로 계산한다.
- runId는 VERIFIED의 identity가 아니라 Review Decision이 참조한 evidence link다.
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

VERIFIED 이후 같은 Revision을 다시 실행하려면 기존 VERIFIED를 조용히 덮어쓰지 않는다. 새 Run을 만들고, retry / reopen reason을 남긴다. 새 Run이 존재한다는 사실만으로 기존 VERIFIED를 자동 무효화하지 않는다. 같은 `objectiveQueueItemId + taskId + taskRevision`에 대해 더 최신의 effective Review Decision이 기록되면 그 decision이 VERIFIED 계산의 기준이 된다.

#### Review Decision / VERIFIED 권위 규칙

최종 정리:

```text
Run Trace
= evidence truth
= stdout, stderr, diff, command log, verification raw output
= .codefleet/runs/<runId>/
= git 제외 가능

Run Summary / result.json
= normalized execution summary
= 실행 결과를 짧게 정규화한 파일

Objective ledger
= decision truth
= 정책상 허용된 actor가 내린 durable decision 저장

Run-derived State
= evidence + decision을 해석한 derived state

VERIFIED
= 최신 ACCEPTED Review Decision + verification gate에서 계산
```

핵심 문장:

```text
DONE은 실행 성공이다.
VERIFIED는 정책상 허용된 actor가 받아들인 성공이다.
```

`RUN_REVIEW_DECIDED`는 실행 이벤트가 아니다. `RUN_REVIEW_DECIDED`는 정책상 허용된 actor가 특정 Run 결과를 보고 받아들였는지, 거절했는지, 수정이 필요한지 결정한 durable decision event다.

최소 필드:

```text
objectiveQueueItemId
taskId
taskRevision
runId
decision
observedResultSnapshot
observedCheckSnapshot
verificationGateResult
evidenceRef optional
evidenceHash optional
actorKind
actorId
reason
decisionBasis
policyRuleRefs optional
at
```

`decision` allowed values:

```text
ACCEPTED
REJECTED
NEEDS_CHANGES
```

Review Decision actor:

```text
actorKind
= HUMAN | SYSTEM_POLICY

actorId
= user id, local username, or stable system actor id such as codefleet-policy

decisionBasis
= HUMAN_REVIEW | SYSTEM_POLICY_AUTO_ACCEPT
```

`actorKind`가 `requiredGates.resultReview.allowedActors`와 맞지 않으면 Review Decision은 effective decision이 될 수 없다. `actorId`는 감사 추적용 식별자이고, gate 판정에는 `actorKind`를 사용한다.

Review Decision 결과:

```text
ACCEPTED
-> verification gate 충족 시 VERIFIED

REJECTED
-> VERIFIED 불가
-> Run-derived State는 FAILED로 해석
-> QueueState.BLOCKED로 자동 변경하지 않음

NEEDS_CHANGES
-> VERIFIED 불가
-> Run-derived State는 FAILED로 해석
-> 새 Revision 생성은 자동이 아니라 별도 Draft / Revision flow에서 처리
```

SYSTEM_POLICY auto review 조건:

```text
SYSTEM_POLICY가 RUN_REVIEW_DECIDED(ACCEPTED)를 자동 append하려면:

1. effectivePolicy.requiredGates.resultReview.required == true
2. SYSTEM_POLICY가 effectivePolicy.requiredGates.resultReview.allowedActors에 포함됨
3. effectivePolicy.requiredGates.resultReview.explicit == false
4. effectivePolicy.autoAdvanceOnDone == true임
5. normalized Run result가 DONE임
6. verificationGateResult가 SATISFIED 또는 WAIVED_ALLOWED임
7. computedRisk가 LOW임
8. unknown risk가 아님
9. blocking finding이 없음
10. unresolved required field가 없음
11. blocking needsReview가 없음
12. run evidenceRef와 evidenceHash가 decision 시점에 존재함
13. decisionBasis = SYSTEM_POLICY_AUTO_ACCEPT로 기록됨
```

SYSTEM_POLICY auto review는 `ACCEPTED`만 append할 수 있다. `REJECTED`와 `NEEDS_CHANGES`는 HUMAN Review Decision 또는 별도 policy rule이 명시적으로 정의된 뒤에만 허용한다.

`autoAdvanceOnDone`은 DONE 상태를 직접 Queue progression 근거로 쓰라는 뜻이 아니다. `autoAdvanceOnDone`은 위 조건을 만족할 때 CodeFleet이 SYSTEM_POLICY Review Decision을 자동 append할 수 있다는 Project Profile 정책이다. 따라서 자동 진행이 일어나도 progression의 durable source는 여전히 `RUN_REVIEW_DECIDED(ACCEPTED)`다.

`resultReview.required=false` 의미:

```text
resultReview.required=false
= Queue progression에 별도 Review Decision을 요구하지 않음
= Review Decision 생성을 금지한다는 뜻은 아님
= verification gate와 normalized Run result 조건은 여전히 적용됨
```

`resultReview.required=false`일 때:

```text
DONE + computedRisk LOW + verificationGateResult SATISFIED
-> reviewNotRequiredProgressionCondition satisfied

DONE + computedRisk LOW + verificationGateResult WAIVED_ALLOWED
-> reviewNotRequiredProgressionCondition satisfied

DONE + computedRisk MEDIUM / HIGH / unknown
-> progression blocked until effective resultReview requires Review Decision

DONE + verificationGateResult NOT_SATISFIED
-> progression blocked

FAILED
-> progression blocked
```

이 경우 `VERIFIED`라는 이름을 사용하지 않는다. `VERIFIED`는 durable Review Decision이 있는 경우의 가장 강한 progression state다. Review가 필요 없는 LOW risk 경우에만 Queue policy는 `DONE + verificationGateResult`를 보고 다음 item을 계산할 수 있지만, 이 상태를 Review acceptance로 과장하지 않는다.

`reviewNotRequiredProgressionCondition`은 저장 상태가 아니고 ledger event도 아니다. Queue policy가 NEXT 계산 시 사용하는 derived condition이다.

따라서 SEQUENCE progression의 기본 규칙은 다음처럼 해석한다.

```text
previous item VERIFIED
-> next item can become NEXT

previous item DONE + resultReview.required=false + computedRisk LOW + verificationGateResult in {SATISFIED, WAIVED_ALLOWED}
-> next item can become NEXT

previous item DONE + resultReview.required=true
-> stop and wait for Review Decision or bounded SYSTEM_POLICY auto review

previous item DONE + verificationGateResult NOT_SATISFIED
-> stop
```

`resultReview.required=false`는 `autoAdvanceOnDone`과 다르다. `resultReview.required=false`는 애초에 review gate를 요구하지 않는 Task 계약이다. `autoAdvanceOnDone`은 review gate가 필요한 경우에도 엄격한 조건 아래 SYSTEM_POLICY가 durable Review Decision을 자동 append할 수 있게 하는 정책이다.

Risk-to-review-gate elevation:

```text
computedRisk LOW
-> resultReview.required=false can remain false when no stricter source requires review

computedRisk MEDIUM
-> effectivePolicy.requiredGates.resultReview.required=true

computedRisk HIGH
-> effectivePolicy.requiredGates.resultReview.required=true

computedRisk unknown
-> effectivePolicy.requiredGates.resultReview.required=true
```

즉 Task/Profile이 `resultReview.required=false`를 요청해도 Run Planning에서 risk가 MEDIUM / HIGH / unknown으로 계산되면 effectivePolicy는 review gate를 다시 요구한다.

SYSTEM_POLICY Review Decision FINAL RULE:

```text
ruleId: SYSTEM_POLICY_AUTO_REVIEW_DECISION_IS_BOUNDED
status: FINAL
scope: REVIEW
sourceOfTruth:
- Run Plan effectivePolicy.autoAdvanceOnDone
- Run Plan effectivePolicy.requiredGates.resultReview
- Run Plan computedRisk
- Run Trace
- Run Summary / result.json
- validation findings
- Objective ledger RUN_REVIEW_DECIDED
inputs:
- effectivePolicy.autoAdvanceOnDone
- effectivePolicy.requiredGates.resultReview
- normalized Run result
- observedCheck
- verificationGateResult
- computedRisk
- unresolved required fields
- needsReview
- findings
- evidenceRef
- evidenceHash
preconditions:
- Run has terminal normalized result
- Run Summary has been normalized
- verificationGateResult has been computed by CodeFleet
- resultReview.required == true
condition:
- effectivePolicy.autoAdvanceOnDone == true
- SYSTEM_POLICY is in resultReview.allowedActors
- resultReview.explicit == false
- normalized Run result == DONE
- verificationGateResult is SATISFIED or WAIVED_ALLOWED
- computedRisk == LOW
- computedRisk is not unknown
- no blocking finding exists
- no unresolved required field exists
- no blocking needsReview exists
- evidenceRef exists at decision time
- evidenceHash exists at decision time
- RUN_REVIEW_DECIDED.actorKind == SYSTEM_POLICY
- RUN_REVIEW_DECIDED.decision == ACCEPTED
- RUN_REVIEW_DECIDED.decisionBasis == SYSTEM_POLICY_AUTO_ACCEPT
allowedEffect:
- CodeFleet may append RUN_REVIEW_DECIDED(ACCEPTED)
- VERIFIED may be calculated from the appended decision and verification gate
- Queue progression may use VERIFIED
deniedEffect:
- CodeFleet must not append SYSTEM_POLICY ACCEPTED review decision
- Queue progression must not use DONE alone
evidence:
- runPlanId
- runId
- objectiveQueueItemId
- taskId
- taskRevision
- resultReview gate snapshot
- effectivePolicy.autoAdvanceOnDone
- computedRisk
- verificationGateResult
- finding ids considered
- evidenceRef
- evidenceHash
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- require HUMAN Review Decision or fix the unmet evidence / policy condition
```

VERIFIED 계산 규칙:

```text
VERIFIED =
  같은 objectiveQueueItemId + taskId + taskRevision에 대해
  최신 effective RUN_REVIEW_DECIDED.decision == ACCEPTED
  AND verificationGateResult in {SATISFIED, WAIVED_ALLOWED}
```

`verificationGateResult`는 사람이 자유롭게 입력하는 값이 아니다. CodeFleet이 `requiredGates.verification`, observed check, waiver policy를 기준으로 계산한다.

검증 관련 값의 권위:

```text
observedCheck
= Run Summary / Run Trace에서 나온 실제 검증 결과
= PASS | FAIL | SKIP | NONE

verificationGateResult
= CodeFleet이 requiredGates와 observedCheck를 비교해 계산
= SATISFIED | NOT_SATISFIED | WAIVED_ALLOWED
```

verificationGateResult 계산:

```text
verification.required == false
-> SATISFIED

verification.required == true + observedCheck == PASS
-> SATISFIED

verification.required == true + observedCheck in {FAIL, NONE}
-> NOT_SATISFIED

verification.required == true + observedCheck == SKIP + valid waiver decision
-> WAIVED_ALLOWED

verification.required == true + observedCheck == SKIP + no valid waiver decision
-> NOT_SATISFIED
```

규칙:

```text
- PASS는 사람이 적는 값이 아니다.
- PASS는 evidence에서만 나온다.
- WAIVED는 policy가 허용한 경우에만 가능하다.
- WAIVED는 actorKind, actorId, reason, risk condition, approver evidence를 가져야 한다.
- requiredGates.verification.required=true이고 observedCheck != PASS이면 기본적으로 VERIFIED가 될 수 없다.
```

`BLOCKED` namespace 분리:

```text
RunSummary.result.BLOCKED
= 실행 요약상 외부 요인으로 막힘
= Queue item을 자동 BLOCKED로 만들지 않음

QueueState.BLOCKED
= 정책상 허용된 actor가 queue item을 막아둔 결정 상태
= QUEUE_ITEM_BLOCKED decision event 필요

PlanningBlock.BLOCKED_UNTIL_POLICY
= Run Planning이 정책 충돌이나 unresolved field 때문에 실행을 막은 파생 결과
```

따라서 `RunSummary.result = BLOCKED`라고 해서 `QueueState = BLOCKED`가 되지 않는다. Queue item을 BLOCKED로 바꾸려면 반드시 `QUEUE_ITEM_BLOCKED` decision event가 필요하다.

Run Trace 부재 처리:

```text
evidenceRef missing
-> EVIDENCE_ABSENT warning
-> 기존 Review Decision 유지
-> VERIFIED 자동 무효화 금지

evidenceRef exists but hash mismatch
-> EXECUTION_EVIDENCE_INTEGRITY finding
```

raw evidence 부재는 audit 약화다. 과거 decision의 자동 무효화 사유는 아니다.

이 규칙으로 확정되는 범위:

```text
VERIFIED 권위 source
-> 닫힘

Run Trace 휘발성과 queue progression 복원성
-> progression은 복원 가능
-> raw DONE / FAILED evidence 재계산은 여전히 local evidence에 의존

Draft -> Revision approval event 위치
-> Task ledger가 소유
-> Task ledger / Objective ledger cross-ledger validation은 별도 규칙으로 검증
```

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

판단 근거 입력:

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

Risk level 계산은 max-severity 방식이다.

```text
riskOrder:
LOW < MEDIUM < HIGH

baseRisk:
LOW

computedRisk:
max(
  Project Profile rule matches,
  Task Spec declared riskSignals,
  File path rule matches,
  Command rule matches,
  Diff / changedFiles rule matches,
  LLM-proposed riskSignals,
  Human-raised risk
)
```

Risk rule 최소 필드:

```text
ruleId
= stable risk rule id

matchTarget
= PATH | COMMAND | AGENT_ROLE | TASK_SCOPE | DIFF | FILE_CONTENT | RUN_EVIDENCE | HUMAN_OVERRIDE | LLM_SIGNAL

matchCondition
= glob / exact command / structured field predicate

riskLevel
= LOW | MEDIUM | HIGH

requiredGates
= optional DecisionGate / EvidenceGate requirements
= runApproval / resultReview / verification

evidence
= matched path / command / field / run evidence id
```

`BLOCKED_UNTIL_POLICY`는 Risk rule 최소 필드가 아니다. `BLOCKED_UNTIL_POLICY`는 unresolved explicit field, policy conflict, invalid local overlay, denied capability 같은 Run Planning 조건에서 계산되는 derived planning block result다.

Risk lowering 규칙:

```text
- LLM signal은 risk를 낮출 수 없다.
- Review Decision은 risk를 낮출 수 없다.
- Project Profile의 explicit risk exemption만 risk를 낮출 수 있다.
- exemption은 ruleId, matchCondition, maxAllowedRisk, reason, approver를 가져야 한다.
- exemption도 matched evidence가 없으면 적용되지 않는다.
- HIGH destructive command는 exemption으로 LOW가 될 수 없다. 최소 MEDIUM이다.
```

Risk 계산 불변식:

```text
- 같은 Project Profile, Task Spec, Run evidence, rule set이면 같은 riskLevel이 계산된다.
- riskLevel이 unknown이면 MEDIUM이 아니라 HIGH로 취급한다.
- risk rule 충돌 시 더 높은 riskLevel이 이긴다.
- requiredGates 충돌 시 DecisionGate / EvidenceGate field별 더 엄격한 gate가 이긴다.
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
Decision = policy-authorized approved intent
Current workspace = execution ground truth
```

따라서 raw Run Trace를 다음 prompt에 직접 넣지 않는다. Carry-forward에 포함 가능한 것은 정책상 허용된 actor가 승인한 Decision과 정제된 Summary뿐이다.

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
= 정책상 허용된 actor가 승인한 의도 / 방향 / 제약

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
- 정책상 허용된 actor가 승인해 Objective context에 붙인 상태
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
PROPOSED -> discarded
PROPOSED -> rejection event recorded

ATTACHED -> REVOKED
ATTACHED -> EXPIRED

EXPIRED -> ATTACHED   only after recheck / review

REVOKED -> terminal
```

CarryForwardItem의 장기 상태에는 `REJECTED`를 두지 않는다. 거절은 상태가 아니라 처리 결과다.

거절 처리 방식:

```text
discarded
= 장기 상태 / ledger event 없이 후보를 폐기

rejection event recorded
= CARRY_FORWARD_REJECTED 이벤트를 기록하고 후보를 context에 포함하지 않음
```

discard 가능 조건:

```text
1. item.state == PROPOSED
2. item이 Harness prompt에 포함된 적 없음
3. item이 ATTACHED 된 적 없음
4. item이 정책상 허용된 actor가 명시적으로 승인 / 거절한 review 대상이 아니었음
5. Project Profile carryForwardAuditMode == MINIMAL
```

`CARRY_FORWARD_REJECTED` event가 필요한 조건:

```text
다음 중 하나라도 참이면 CARRY_FORWARD_REJECTED event가 필요하다.

1. item이 Task Review 화면에 표시됨
2. 사람이 명시적으로 reject를 선택함
3. item이 Objective decision과 충돌한다고 판정됨
4. Project Profile carryForwardAuditMode == STRICT
5. item.sourceRunId가 존재하고 이후 Summary / Decision 판단 근거로 사용될 수 있음
```

discard와 rejected event의 공통 효과:

```text
- Harness context 포함 금지
- ATTACHED 전이 금지
- 같은 sourceRunId / sourceTaskRevision에서 다시 제안하려면 새 CarryForwardItem id 필요
```

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
- 정책상 허용된 actor가 명시적으로 승인
- actorKind / actorId 있음
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
- riskRecheckRequired == false 또는 risk recheck 통과
```

risk recheck 필요 조건:

```text
riskRecheckRequired == true if
  any sourceRun.changedFiles path has current hash != recorded postRun hash
  OR sourceTaskRevision file hash != recorded sourceTaskRevision hash
  OR sourceRiskLevel in {MEDIUM, HIGH}
  OR Project Profile carryForwardRecheck == ALWAYS
```

risk recheck 통과 조건:

```text
1. sourceRunId가 존재한다.
2. sourceRun의 retained evidence를 읽을 수 있다.
3. sourceRun.changedFiles의 현재 hash가 Run Summary에 기록된 postRun hash와 일치한다.
4. sourceTaskRevision file hash가 CarryForwardItem에 기록된 revision hash와 일치한다.
5. current riskLevel이 source riskLevel보다 낮아지지 않았다.
6. recheck result가 Run Summary에 기록된다.
```

꼬임 방지 불변식:

```text
- PROPOSED는 Harness context에 포함 금지
- ATTACHED만 Harness context에 포함 가능
- REVOKED / EXPIRED는 포함 금지
- state 변경은 직접 수정이 아니라 ledger event로만 처리
- Summary는 sourceRunId / sourceTaskId / sourceTaskRevision 필수
- Decision은 actorKind / actorId / reason / source 필수
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

이후 AuthController가 수동 수정됨
-> CARRY_FORWARD_EXPIRED
   reason: "changedFiles hash mismatch"
```

Decision 흐름 예:

```text
user decision record
-> CARRY_FORWARD_ATTACHED
   type: DECISION
   text: "DB schema 변경은 이번 Objective에서 제외"

이후 범위 변경
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
= 정책상 허용된 actor가 흐름을 멈추기로 결정함
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

`relatedCategories`는 부가 설명용 optional field다. 하지만 gating과 기본 repair 방향은 primary category를 따른다.

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

EVIDENCE_ABSENT:

```text
check target:
- optional local evidence reference
- evidenceRef inside durable decision event

expected:
- referenced Run Trace may exist on the current machine when available
- missing local evidence does not invalidate durable decision by itself

actual:
- reference resolution result on current machine

source of truth:
- 깨지지 않음
- raw local evidence가 현재 machine에 없음

default repair:
- emit warning
- restore Run Trace from backup if available
- keep durable Review Decision and derived progression unless another integrity rule fails
```

severity / gating:

```text
severity:
- WARNING

does not block:
- objective replay
- queue progression based on durable Review Decision
- Task planning
- Run Planning
- carry-forward of approved Decision / sanitized Summary

may block or degrade:
- raw Run Trace inspection
- raw diff / stdout / stderr export
- evidence hash revalidation
- audit report that requires local raw evidence
```

`EVIDENCE_ABSENT`는 raw evidence가 현재 machine에 없다는 뜻이다. source-of-truth corruption이 아니며, durable Review Decision이나 VERIFIED를 자동 무효화하지 않는다.

REVIEW_INTEGRITY:

```text
check target:
- Review Decision record

expected:
- Review Decision schema
- Review Decision reference validity
- actorKind present
- actorId present
- timestamp present
- Review Decision consistency

actual:
- Review Decision record

source of truth:
- 리뷰 결정이 의심됨

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
5. EVIDENCE_ABSENT
6. REVIEW_INTEGRITY
7. CARRY_FORWARD_INTEGRITY
8. POLICY_ENFORCEMENT_INTEGRITY
9. WORKSPACE_GROUNDING
10. SNAPSHOT_CONSISTENCY
11. READ_MODEL_CONSISTENCY
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

EVIDENCE_ABSENT vs EXECUTION_EVIDENCE_INTEGRITY
- durable Review Decision의 evidenceRef가 현재 machine에 없으면 EVIDENCE_ABSENT
- referenced Run Trace가 존재하지만 hash / schema / result consistency가 깨졌으면 EXECUTION_EVIDENCE_INTEGRITY
- EVIDENCE_ABSENT는 기본적으로 WARNING이며 과거 Review Decision이나 VERIFIED를 자동 무효화하지 않는다

REVIEW_INTEGRITY vs EXECUTION_EVIDENCE_INTEGRITY
- run result 자체가 이상하면 EXECUTION_EVIDENCE_INTEGRITY
- VERIFIED / Review Decision record가 이상하면 REVIEW_INTEGRITY

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
- Review Decision record
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
- missing Review Decision record
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
- actorKind required
- actorId required
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
- do not edit Review Decision record

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
- 초기 설계에서는 병렬 mutation 최적화보다 일관성을 우선한다.
```

Lock 확장 계획은 VERSION_PLAN이다.

```text
final default:
- workspace-level mutation lock

future optimization:
- objective-level lock은 성능 병목이 측정되고, cross-objective mutation conflict rule이 먼저 정의된 뒤에만 보조로 도입할 수 있다.
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

evidence
= 판정 결과를 재현하고 설명하기 위해 남기는 구조화 증거

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
7. evidence가 없으면 machine-checkable FINAL RULE이 될 수 없다.
```

문서 작성 규칙:

```text
- "후보", "예시", "초기에는", "장기적으로", "가능하면", "필요하면"은 FINAL RULE 문장에 쓰지 않는다.
- 이런 표현이 필요한 내용은 DESIGN CANDIDATE, EXAMPLE, VERSION_PLAN으로 명시한다.
- FINAL RULE은 사람이 읽는 설명과 별개로 machine-checkable form으로 옮길 수 있어야 한다.
- LLM이 해석해야만 판정 가능한 규칙은 FINAL RULE이 아니다.
- 사람이 감으로 승인해야만 판정 가능한 규칙은 FINAL RULE이 아니다.
```

설계 논의 반영 규칙:

```text
- 하나의 설계 항목이 결정되면 대화에만 남기지 않고 source of truth 문서에 즉시 반영한다.
- CodeFleet 최종 모델의 source of truth 문서는 docs/concept-foundation.md다.
- 다음 세션 연결에 필요한 진행 상태와 다음 논의 항목은 docs/session-handoff.md에 함께 갱신한다.
- 미확정 항목은 FINAL RULE처럼 쓰지 않고 DESIGN CANDIDATE 또는 다음 논의 항목으로 남긴다.
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
0.x의 Objective / Queue / Task relation / Draft-Revision / Run-derived / Risk / Carry-forward / Corruption-Repair 모델은 FINAL RULE 기준으로 정리한다.

Risk는 Project Profile + Task Spec + Run evidence + rule set 기반 max-severity 계산으로 정리한다.

Carry-forward는 ATTACHED만 전달 가능하며, discard / rejected event / recheck 조건을 deterministic하게 분리한다.

Policy merge는 More restrictive wins를 deterministic meet operation으로 정리한다.

Harness, Project Profile, Run Summary, AgentRole, Guardrail, Verification 섹션은 FINAL RULE과 DESIGN CANDIDATE / VERSION_PLAN을 명시적으로 분리한다.
```

### 0.13 현재 고정 항목 기준 적용 상태

현재까지 고정한 항목은 다음 상태로 본다.

```text
PASS:
- 최종 목표와 목표 경계
- Objective / Task / Run 계층
- Objective / Task Queue / ledger / Mutation Engine이 내부 구조라는 점
- Mutation Engine 역할, command 범위, workspace-level lock 원칙
- Mutation 후 rebuild / validate / explicit repair 원칙
- Transition validation 상위 도메인 7개
- Objective State 규칙
- Queue Item State 규칙
- Task Relation State 규칙
- Task Draft / Revision State 규칙
- Run-derived State 규칙
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
- 확정 규칙 작성 기준

PASS_AFTER_REINFORCEMENT:
- Risk 판단 원칙
- Policy 병합 원칙
- Safe Orchestration isolation 조건
- Run Summary sanitization boundary

NOT_FINAL_YET:
- Project Profile 최종 JSON schema
- Harness enforcement 구현 방식
- AgentRole taxonomy
- Guardrail taxonomy
- Verification command allowlist
- Run Summary export adapter별 schema
- Workspace discovery 버전별 구현 범위
```

`NOT_FINAL_YET` 항목은 확정 규칙이 아니다. 이 항목들은 다음 논의에서 같은 기준으로 하나씩 FINAL RULE로 승격하거나 VERSION_PLAN으로 남긴다.

## 1. 최종 지향 정의

위 고정 목표를 오케스트레이션 흐름으로 풀면 다음과 같다.

> CodeFleet은 사용자의 개발/운영 Objective를 하나 이상의 AI-generated Task Draft로 구조화하고, 정책상 유효한 approval decision이 있는 Task를 Harness를 통해 역할·범위·가드레일·검증 조건 안에서 AI Agent에게 위임하며, 결과를 로그·diff·테스트·리뷰 기준으로 추적하는 AI-native 개발 오케스트레이션 CLI다.

이 정의에서 중요한 점은 CodeFleet이 단순한 AI CLI 래퍼가 아니라는 것이다.

CodeFleet의 중심은 AI 모델 호출이 아니라 다음 구조다.

```text
Intent
  -> Objective
  -> Task Draft
  -> Approval Decision
  -> Harness Execution
  -> Agent Adapter
  -> Run Trace
  -> Run Summary
```

핵심 문장:

```text
Objective frames the work.
AI drafts executable tasks.
Policy-authorized actor approves the work.
Harness controls the work.
Agent executes the work.
Trace records the work.
Summary communicates the work.
```

한국어로는 다음과 같다.

```text
Objective는 작업의 맥락과 연속성을 정의한다.
AI는 실행 가능한 작업 초안을 만든다.
정책상 허용된 actor는 실행 가능한 작업으로 승인한다.
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

LLM은 현재 요청이 일회성인지, 이전 작업의 연속인지, 장기 workstream의 일부인지 스스로 단정하면 안 된다. CodeFleet은 이 연속성을 Objective 자료구조에 기록하고, 정책상 허용된 actor는 review 단계에서 그 연속성 제안을 수락하거나 수정한다.

핵심 원칙:

```text
LLM decides nothing about continuity.
CodeFleet records continuity.
Policy-authorized actor accepts or approves continuity.
Harness supplies accepted or approved context.
```

한국어:

```text
LLM이 작업의 연속성을 단정하지 않는다.
CodeFleet이 연속성을 기록한다.
정책상 허용된 actor가 연속성 제안을 수락하거나 수정한다.
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

Workspace discovery는 VERSION_PLAN이다.

```text
v0.x:
- 현재 cwd에 .codefleet이 있어야 workspace로 인정한다.

final:
- 하위 디렉터리에서 명령을 실행해도 부모 방향으로 올라가며 .codefleet을 찾을 수 있다.
- --workspace 옵션이 주어지면 해당 경로를 우선한다.
- 여러 .codefleet이 발견되면 가장 가까운 부모를 기본값으로 선택하되, 명령 출력에 선택 경로를 표시한다.
```

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

Project Profile은 `.codefleet/config.json`에 저장되는 공유 가능한 Workspace Policy Contract다.

정의:

> Project Profile은 프로젝트별 Harness 정책을 선언하는 Workspace Contract다.

최종 모델에서 Project Profile 주변 파일 구조:

```text
.codefleet/
  config.json          # Project Profile / shared workspace policy contract
  local.json           # local-only overlay, git 제외, 권한 완화 불가
  context/             # 사람이 작성한 프로젝트 맥락 문서
  templates/           # prompt / review / summary template
```

Project Profile은 단순 기본값 파일이 아니다. 해당 workspace에서 AI 에이전트가 어떤 조건 안에서 일해야 하는지를 선언하는 공유 정책 계약이다.

분리 원칙:

```text
Project Profile
= 공유 정책 계약

Local Overlay
= 개인 환경 보정, 권한 완화 불가

Effective Policy
= Run Plan 내부의 capability / risk / gate policy snapshot
= Core Policy Defaults + Project Profile policies + Local Overlay restrictions + Task Guardrails + policy-affecting Run Options의 병합 결과

Task Spec
= 개별 작업 계약

Run Trace
= 실행 증거
```

정책 계층:

```text
Core Policy Defaults
  -> Project Profile policies
     -> Local Overlay
        -> Task Guardrails / policy-affecting Run Options
           -> Effective Policy
```

Project Profile은 원본 정책 / 기본값 계약이고, Effective Policy는 Run Plan 내부의 계산 결과다. Run Trace는 실행 증거이고, Task Spec은 개별 작업 계약이다. 이 네 가지를 한 파일에 섞지 않는다.

우선순위:

```text
1. Policy declaration
2. Defaults
3. Context/template references
```

### 5.1 최종 Top-level 구조

```text
.codefleet/config.json

schemaVersion

project
  id
  name
  domains
  stackTags

workspace
  id
  name
  components
  sharedPaths

defaults
  task
    agentRole
    harnessMode
    requiredGates
      runApproval
      resultReview
      verification
    workflow
  run
    agentAdapter
    isolationMode

policies
  harness
  agentAdapters
  files
  commands
  risk
  verification
  redaction
  carryForward
  agentRoles

references
  contextFiles
  promptTemplates
  reviewTemplates
  summaryTemplates

localPolicy
  overlayPath
  mergeMode
  allowedLocalKeys
```

JSON skeleton:

```json
{
  "schemaVersion": "1.0.0",
  "project": {},
  "workspace": {},
  "defaults": {},
  "policies": {
    "harness": {},
    "agentAdapters": {},
    "files": {},
    "commands": {},
    "risk": {},
    "verification": {},
    "redaction": {},
    "carryForward": {},
    "agentRoles": {}
  },
  "references": {},
  "localPolicy": {}
}
```

각 블록의 책임:

```text
schemaVersion
= 이 config.json을 어떤 Project Profile schema와 validation rule set으로 해석할지 결정한다.

project
= 프로젝트 식별용 메타데이터다.
= 권한 판정의 직접 규칙이 아니라, domain / risk / role preset 선택의 입력이 될 수 있다.

workspace
= 현재 Project Profile이 통제하는 하나의 로컬 repo/root 경계다.
= workspace 내부 component 분류와 공유 path 분류를 결정한다.
= workspaceRoot 계산과 path normalization은 config 필드가 아니라 CodeFleet Core invariant다.

defaults
= Task가 생략했을 때 적용되는 기본 실행값이다.
= policies보다 우선하지 못한다.
= Task 계약 생략값은 defaults.task에 두고, Run 계획 생략값은 defaults.run에 둔다.

policies
= Project Profile의 핵심이다.
= adapter 허용, 파일, 명령, risk, 검증, redaction, carry-forward, role 권한을 판정한다.

references
= context / template 파일 경로만 가진다.
= 긴 지식 문서 본문을 config.json 안에 넣지 않는다.

localPolicy
= .codefleet/local.json 같은 local-only overlay의 허용 범위만 선언한다.
= local overlay는 Project Profile보다 권한을 넓힐 수 없다.
```

### 5.1.1 schemaVersion / project / workspace 확정

`schemaVersion`은 Project Profile schema version이다. CodeFleet 앱 버전, 프로젝트 앱 버전, 기능 플래그, migration 상태가 아니다.

```json
{
  "schemaVersion": "1.0.0"
}
```

`project`는 논리적 제품 / 시스템 identity다. Project Profile 하나에는 `project` block이 정확히 하나만 존재한다. `project`는 배열이 될 수 없다.

```json
{
  "project": {
    "id": "hunik-platform",
    "name": "Hunik Platform",
    "domains": ["backend-platform"],
    "stackTags": ["java", "spring", "maven"]
  }
}
```

`workspace`는 현재 Project Profile이 실제로 통제하는 하나의 로컬 repo/root 경계다. Project Profile 하나는 하나의 `workspaceRoot`만 책임진다.

```json
{
  "workspace": {
    "id": "gateway",
    "name": "Gateway Workspace",
    "components": [
      {
        "id": "gateway-service",
        "name": "Gateway Service",
        "kind": "SERVICE",
        "ownedPaths": {
          "include": ["src/**"],
          "exclude": ["target/**"]
        },
        "relatedPaths": {
          "include": ["pom.xml", "README.md", "docs/**"],
          "exclude": []
        },
        "stackTags": ["java", "spring", "gateway"]
      }
    ],
    "sharedPaths": {
      "include": ["README.md", ".github/**", "docker-compose.yml"],
      "exclude": []
    }
  }
}
```

Core invariant:

```text
- workspaceRoot는 <workspaceRoot>/.codefleet/config.json의 부모 디렉터리다.
- Project Profile의 모든 path는 workspaceRoot 기준 POSIX relative path다.
- Project Profile은 workspaceRoot 밖 path를 참조하거나 소유할 수 없다.
- absolute path, drive path, `..` segment는 Project Profile path에 사용할 수 없다.
```

Project / Workspace / Component 경계:

```text
project
= 논리적 제품 / 시스템 identity

workspace
= 현재 Project Profile이 통제하는 하나의 로컬 repo/root

component
= workspace 내부의 소유 / 분류 단위

sharedPaths
= 특정 component가 소유하지 않는 workspace 공용 path
```

Monorepo / multirepo 처리:

```text
- Monorepo는 하나의 Project Profile과 여러 components로 표현한다.
- Multirepo는 repo마다 하나의 Project Profile을 가진다.
- Multirepo의 각 repo는 같은 project.id를 공유할 수 있고, 서로 다른 workspace.id를 가진다.
- Project Profile은 sibling repo 목록, sibling repo path, local clone path를 저장하지 않는다.
- Cross-workspace 작업은 Project Profile이 아니라 상위 Objective / Orchestration layer가 여러 workspace Task로 분해한다.
```

권한 금지 원칙:

```text
- project 값은 파일 수정, 명령 실행, risk lowering, approval skip을 직접 발생시킬 수 없다.
- workspace와 component는 권한 정책이 아니다.
- ownedPaths / relatedPaths / sharedPaths는 read 또는 write 권한을 부여하지 않는다.
- component.kind와 stackTags는 command 권한을 부여하지 않는다.
- 파일 / 명령 권한과 risk는 policies.files, policies.commands, policies.risk에서만 판정한다.
- AgentAdapter 허용 여부는 policies.agentAdapters에서 판정한다.
```

### 5.1.2 최종 모델 계층과 실행 단계

Project Profile의 `defaults`, `policies`, Task 계약, Run 실행을 논의하기 전에 최종 모델의 계층과 실행 단계를 고정한다. 이 기준은 source, derived artifact, evidence, decision이 섞이는 것을 막기 위한 상위 규칙이다.

정책 / 계약 계층:

```text
1. Core Invariants
   = CodeFleet이 항상 적용하는 불변 규칙
   = workspaceRoot 계산, POSIX relative path, source-of-truth 경계

2. Project Profile
   = workspace 공유 정책 계약
   = project, workspace, defaults, policies, references, localPolicy 선언

3. Local Overlay
   = 개인 로컬 환경 보정
   = RESTRICT_ONLY로만 병합되며 권한을 넓힐 수 없음

4. Task Draft
   = 사람이 검토 / 수정할 수 있는 작업 초안
   = defaults.task는 Draft 생성 시 생략값으로 적용될 수 있음

5. Task Revision
   = 유효한 approval decision이 있는 불변 실행 계약
   = 승인 이후 직접 수정하지 않고 새 Revision으로 전진함

6. Run Plan
   = 특정 Run 직전에 생성되는 derived execution contract
   = Task Revision, Project Profile defaults/policies, Local Overlay, Run Options에서 계산됨
```

Run Plan은 source of truth가 아니다. Run Plan은 특정 Run을 위한 파생 실행 계약이다.

Run Plan includes:

```text
- selected Task Revision
- selected agentAdapter
- selected isolationMode
- Run Options snapshot
- effectivePolicy
- computedRisk
- requiredGates
- verificationPlan
```

`effectivePolicy`는 Run Plan 전체가 아니다. `effectivePolicy`는 Run Plan 안에 포함되는 capability / risk / gate policy snapshot이다. selected `agentAdapter`, retry reason, run request id, selected Task Revision은 Run Plan 필드일 수 있지만 `effectivePolicy` 자체는 아니다.

`Run Options`는 특정 Run 요청에 붙는 명시적 실행 입력이다. 예를 들어 사용자가 run command에서 선택한 agentAdapter override, isolation override, verification override, retry reason 같은 값이 Run Options가 될 수 있다. Run Options는 Project Profile에 저장하지 않는다. Run Options는 Run Plan 생성 입력으로만 쓰이며, Run Plan이 생성된 뒤 기존 Task Revision이나 Project Profile을 수정하지 않는다.

`Core Policy Defaults`, `Project Profile defaults`, `Run Options`의 경계:

```text
Core Policy Defaults
= CodeFleet runtime이 가진 최후의 보수적 기본값
= Project Profile이 없거나 불완전한 권한을 보완하지 않음

Project Profile defaults
= .codefleet/config.json defaults block
= Task Draft 또는 Run Planning 생략값
= 권한 정책이 아니며 policies보다 우선하지 못함
= Run Plan 선택값을 채울 수 있지만 effectivePolicy 자체가 아님

Run Options
= 특정 Run 요청의 명시적 입력
= Project Profile에 저장하지 않음
= Run Plan 입력이며 source input으로 기록될 수 있음
= policy-affecting Run Options만 effectivePolicy 계산에 참여할 수 있음
```

실행 생명주기:

```text
1. Intent
   = 사용자의 자연어 의도

2. Objective
   = 상위 목적과 Task들의 연결 맥락

3. Task Draft
   = 실행 전 검토 가능한 작업 초안

4. Task Review / Approval
   = 정책상 허용된 actor가 Task 계약과 Objective relation을 검토 / 승인

5. Task Revision
   = 승인된 불변 작업 계약

6. Queue / Scheduling
   = 어떤 Revision을 어떤 순서로 실행할지 결정

7. Run Planning
   = Run Plan, effectivePolicy, risk, gate, isolation, verificationPlan 계산

8. Harness Execution
   = Project Profile과 Run Plan 경계 안에서 agentAdapter 호출

9. Evidence / Verification
   = stdout, stderr, diff, changedFiles, command log, verification result 기록

10. Review / Close
   = Evidence에 대한 review, close, retry, reject, corrective decision 기록
```

Source / Derived / Evidence / Decision 경계:

```text
Source of Truth:
- Core Invariants
- Project Profile
- Local Overlay
- Objective / Queue Ledger
- Task Ledger
- Task Draft
- Task Revision
- Run Options

Derived Artifact:
- Run Plan
- Effective Policy
- Computed Risk
- Verification Plan
- Run Summary

Evidence Truth:
- Run Trace

Decision Record:
- Approval decision in Task Ledger
- Objective relation / queue decision in Objective Ledger
- Review Decision
- Close / Retry / Reject
- Corrective Event
```

꼬임 방지 불변식:

```text
1. Draft만 mutable이다.
2. Revision은 immutable이다.
3. Run Plan은 derived artifact다.
4. Effective Policy는 Run Plan 내부의 derived snapshot이다.
5. Run Trace는 execution evidence truth다.
6. Review / Close는 Run Trace를 수정하지 않고 decision event를 추가한다.
7. 과거 객체를 고치지 않고 새 Draft, 새 Revision, 새 Run, corrective event로 전진한다.
```

주의해야 할 경계:

```text
- defaults는 생략값이며 권한 정책이 아니다.
- Project Profile 변경은 과거 Task Revision / Run Plan / Run Trace를 재해석하지 않는다.
- Run Plan을 수정해서 Project Profile이나 Task Revision을 바꾸지 않는다.
- effectivePolicy를 .codefleet/config.json에 authoritative block으로 저장하지 않는다.
- Review는 Run Trace 원본을 수정하지 않는다.
- Risk lowering은 LLM이나 일반 human review로 수행하지 않는다.
- Local Overlay는 권한을 넓히지 않는다.
- component ownedPaths / relatedPaths / sharedPaths는 read/write 권한을 부여하지 않는다.
- multirepo sibling path는 Project Profile에 저장하지 않는다.
- validation failure, execution failure, corruption은 서로 다른 실패 범주로 다룬다.
```

최종 원칙:

```text
Source는 수정 / 승인 / 정책의 원본이다.
Derived는 source로부터 재계산 가능해야 한다.
Evidence는 실행 사실이며 수정하지 않는다.
Decision은 evidence에 대한 사람 / 정책의 판단이다.
```

### 5.1.3 Project Profile defaults 진행 결정

`defaults`는 Task 또는 Run이 값을 생략했을 때 사용하는 기본값 계약이다. `defaults`는 권한 정책이 아니며 `policies`보다 우선하지 못한다.

최종 모델의 `defaults`는 flat 구조가 아니라 `task`와 `run`으로 분리한다.

```json
{
  "defaults": {
    "task": {
      "agentRole": "REQUIRE_EXPLICIT",
      "harnessMode": "REQUIRE_EXPLICIT",
      "requiredGates": {
        "runApproval": {
          "required": false,
          "allowedActors": [],
          "explicit": false
        },
        "resultReview": {
          "required": true,
          "allowedActors": ["SYSTEM_POLICY", "HUMAN"],
          "explicit": false
        },
        "verification": {
          "required": "REQUIRE_EXPLICIT",
          "waiver": {
            "allowed": false,
            "allowedActors": [],
            "explicit": true
          }
        }
      },
      "workflow": {
        "stages": ["PLAN", "INSPECT", "APPLY", "VERIFY", "REVIEW"]
      }
    },
    "run": {
      "agentAdapter": "REQUIRE_EXPLICIT",
      "isolationMode": "REQUIRE_EXPLICIT"
    }
  }
}
```

`REQUIRE_EXPLICIT`은 config 파일을 직접 수정하라는 뜻이 아니다. `REQUIRE_EXPLICIT`은 해당 Task Draft / Review / Approval 흐름에서 사용자가 concrete value를 명시적으로 선택해야 한다는 뜻이다. 선택 결과는 Project Profile이 아니라 해당 Task Draft에 저장한다.

#### defaults.task.agentRole

`defaults.task.agentRole`은 Task가 `agentRole`을 명시하지 않았을 때 Draft 생성에 사용하는 기본 작업 역할이다.

허용값:

```text
- concrete AgentRole ID
- REQUIRE_EXPLICIT
```

역할별 경계:

```text
policies.agentRoles.allowedRoles
= constraint
= 허용 가능한 역할 목록

defaults.task.agentRole
= creation default
= Task Draft 생성 시 생략값

Task Draft.agentRole
= mutable candidate value
= 승인 전 사람이 수정 가능

Task Revision.agentRole
= immutable authoritative value
= 승인된 실행 계약의 원본 역할 값

Run Plan agentRole
= derived reference / snapshot only
= Task Revision.agentRole을 참조하거나 기록할 수 있지만 권위 원본은 아님
```

꼬임 방지 규칙:

```text
1. defaults.task.agentRole은 Draft 생성 시에만 적용된다.
2. Profile defaults 변경은 기존 Draft / Revision에 자동 반영되지 않는다.
3. Draft에는 REQUIRE_EXPLICIT 또는 concrete agentRole이 있을 수 있다.
4. Revision에는 concrete agentRole만 허용된다.
5. Revision.agentRole은 policies.agentRoles.allowedRoles 안에 있어야 한다.
6. Run Plan은 Revision.agentRole을 수정하지 않는다.
7. policies.agentRoles.allowedRoles는 검증 기준이지 선택값이 아니다.
```

Draft 생성 처리:

```text
- default가 concrete value면 Draft.agentRole에 복사한다.
- default가 REQUIRE_EXPLICIT이면 Draft.agentRole은 unresolved required field로 남긴다.
```

Approval / Revision 처리:

```text
- Draft.agentRole이 unresolved이면 approval blocked.
- 사람은 policies.agentRoles.allowedRoles 중 하나를 선택해야 한다.
- Task Revision에는 concrete agentRole만 저장된다.
```

#### defaults.task.harnessMode

`defaults.task.harnessMode`는 Task가 `harnessMode`를 명시하지 않았을 때 Draft 생성에 사용하는 requested harness mode 기본값이다.

허용값:

```text
- DRY_RUN
- SUGGEST_ONLY
- WORKSPACE_EDIT
- COMMAND_EXEC
- REQUIRE_EXPLICIT
```

모드 설명:

```text
DRY_RUN
= 실행하지 않고 계획 / 프롬프트 / Run Plan만 생성한다.

SUGGEST_ONLY
= 파일 수정 없이 분석과 수정 제안만 수행한다.

WORKSPACE_EDIT
= Project Profile과 Task scope가 허용한 파일 범위 안에서 수정할 수 있다.

COMMAND_EXEC
= 허용된 파일 수정과 허용된 명령 실행까지 수행할 수 있다.
```

`defaults.task.harnessMode = REQUIRE_EXPLICIT`이면 CodeFleet은 사용자에게 객관식 선택지를 제시해야 한다. 사용자는 config 파일을 직접 열어 Project Profile을 바꾸는 것이 아니라, 해당 Task Draft의 concrete `harnessMode`를 선택한다.

사용자 선택 UX:

```text
이 작업의 harnessMode를 선택하세요.

1. DRY_RUN
   실행하지 않고 계획/프롬프트/Run Plan만 생성합니다.

2. SUGGEST_ONLY
   파일을 수정하지 않고 분석과 수정 제안만 수행합니다.

3. WORKSPACE_EDIT
   Project Profile과 Task scope가 허용한 파일만 수정할 수 있습니다.

4. COMMAND_EXEC
   허용된 파일 수정과 허용된 명령 실행까지 수행할 수 있습니다.
```

Draft unresolved field 구조:

```json
{
  "field": "harnessMode",
  "source": "defaults.task.harnessMode",
  "reason": "REQUIRE_EXPLICIT",
  "allowedValues": [
    "DRY_RUN",
    "SUGGEST_ONLY",
    "WORKSPACE_EDIT",
    "COMMAND_EXEC"
  ],
  "optionDescriptions": {
    "DRY_RUN": "실행하지 않고 계획/프롬프트/Run Plan만 생성한다.",
    "SUGGEST_ONLY": "파일 수정 없이 분석과 수정 제안만 수행한다.",
    "WORKSPACE_EDIT": "Project Profile과 Task scope가 허용한 파일 범위 안에서 수정할 수 있다.",
    "COMMAND_EXEC": "허용된 파일 수정과 허용된 명령 실행까지 수행할 수 있다."
  },
  "blockingStage": "APPROVAL"
}
```

중요한 제한:

```text
- harnessMode는 권한이 아니다.
- WORKSPACE_EDIT를 선택해도 파일 수정 권한이 자동으로 생기지 않는다.
- COMMAND_EXEC를 선택해도 명령 실행 권한이 자동으로 생기지 않는다.
- 실제 허용은 policies.harness / policies.files / policies.commands / effectivePolicy.requiredGates가 결정한다.
- Task Revision에는 REQUIRE_EXPLICIT이 남을 수 없다.
- Revision.harnessMode가 policies.harness보다 넓으면 Run Planning은 blocked 된다.
- 자동 downgrade는 금지한다.
```

#### defaults.task.requiredGates

`defaults.task.requiredGate` 단일 필드는 사용하지 않는다. 최종 모델은 `defaults.task.requiredGates` object를 사용한다.

최종 모델의 기본 목표는 `policy-governed automated orchestration`이다.

```text
AUTOMATED
= 정책, risk, scope, verification evidence가 충분해 CodeFleet이 자동 진행할 수 있음

HUMAN_GATED
= 정책상 사람 decision이 필요함

BLOCKED
= 정책 충돌, unresolved field, adapter unavailable, required evidence missing 등으로 진행 불가
```

따라서 `requiredGates`는 사람 중심 enum이 아니라 actor-neutral decision requirement 구조를 사용한다.

Decision actor:

```text
HUMAN
= 사용자 또는 권한 있는 사람이 명시적으로 내린 decision

SYSTEM_POLICY
= CodeFleet이 deterministic policy / evidence / risk rule로 내린 decision

AGENT
= approval / review decision actor가 될 수 없음

LLM
= approval / review decision actor가 될 수 없음
```

`SYSTEM_POLICY`는 LLM 판단이 아니다. `SYSTEM_POLICY` decision은 machine-checkable rule, evidence, risk result, gate result를 가져야 한다.

추천 기본값:

```json
{
  "requiredGates": {
    "runApproval": {
      "required": false,
      "allowedActors": [],
      "explicit": false
    },
    "resultReview": {
      "required": true,
      "allowedActors": ["SYSTEM_POLICY", "HUMAN"],
      "explicit": false
    },
    "verification": {
      "required": "REQUIRE_EXPLICIT",
      "waiver": {
        "allowed": false,
        "allowedActors": [],
        "explicit": true
      }
    }
  }
}
```

`requiredGates`는 실행 전 decision, 실행 후 review decision, 검증 evidence 요구를 분리한다.

```text
runApproval
= Run 실행 전에 approval decision이 필요한가

resultReview
= Run 결과를 close / advance 하기 전에 review decision이 필요한가

verification
= 테스트 / 빌드 / 검증 evidence가 필요한가
```

DecisionGate 구조:

```text
required
= true | false | REQUIRE_EXPLICIT

allowedActors
= ["SYSTEM_POLICY", "HUMAN"] 중 0개 이상을 담은 unique array

explicit
= true | false | REQUIRE_EXPLICIT
```

EvidenceGate 구조:

```text
required
= true | false | REQUIRE_EXPLICIT

waiver.allowed
= true | false

waiver.allowedActors
= ["SYSTEM_POLICY", "HUMAN"] 중 0개 이상을 담은 unique array

waiver.explicit
= true | false | REQUIRE_EXPLICIT
```

예전 scalar label은 최종 schema 값이 아니다. 다음 매핑은 마이그레이션 설명용으로만 사용한다.

```text
HUMAN_REVIEW
~= { required: true, allowedActors: ["HUMAN"], explicit: false }

EXPLICIT_APPROVAL
~= { required: true, allowedActors: ["HUMAN"], explicit: true }
```

`BLOCKED_UNTIL_POLICY`는 `defaults` 값이 아니다. `BLOCKED_UNTIL_POLICY`는 policy merge 입력값이나 gate enum 값이 아니라, unresolved explicit field, policy conflict, invalid overlay, denied capability 같은 조건을 Run Planning이 평가한 뒤 생성하는 derived blocking state다.

Draft / Revision 규칙:

```text
- defaults.task.requiredGates의 required / explicit field는 concrete value 또는 REQUIRE_EXPLICIT을 가질 수 있다.
- Task Draft에는 REQUIRE_EXPLICIT이 unresolved required field로 남을 수 있다.
- Task Revision에는 REQUIRE_EXPLICIT이 남을 수 없다.
- Task Revision에는 concrete requiredGates만 저장된다.
- REQUIRE_EXPLICIT 질문은 한 번의 review step에서 다른 unresolved fields와 함께 묶어서 처리한다.
```

Gate 병합 규칙:

```text
- gate 병합은 dimension별 more restrictive wins다.
- DecisionGate.required는 OR 병합이다. 하나라도 true면 true다. REQUIRE_EXPLICIT이 남아 있으면 Run Planning 전에 resolution으로 보낸다.
- DecisionGate.allowedActors는 required=true인 source들끼리 intersection한다.
- DecisionGate.explicit은 OR 병합이다. 하나라도 true면 true다. REQUIRE_EXPLICIT이 남아 있으면 Run Planning 전에 resolution으로 보낸다.
- EvidenceGate.required는 OR 병합이다. 하나라도 true면 true다. REQUIRE_EXPLICIT이 남아 있으면 Run Planning 전에 resolution으로 보낸다.
- EvidenceGate.waiver.allowed는 AND 병합이다. 하나라도 false면 false다.
- EvidenceGate.waiver.allowedActors는 waiver.allowed=true인 source들끼리 intersection한다.
- EvidenceGate.waiver.explicit은 OR 병합이다. 하나라도 true면 true다. REQUIRE_EXPLICIT이 남아 있으면 Run Planning 전에 resolution으로 보낸다.
- allowedActors intersection이 비면 Run Planning은 blocked 된다.
```

Run Summary `Check`와의 관계:

```text
requiredGates.verification
= 실행 전에 정한 검증 요구 정책

RunSummary.check
= 실행 후 실제 검증 결과
```

검증 gate 판정:

```text
verification.required true + check PASS
= gate satisfied

verification.required true + check FAIL
= gate failed

verification.required true + check NONE
= gate unsatisfied

verification.required true + check SKIP
= allowed waiver decision이 없으면 gate unsatisfied
```

8개 꼬임 방지 규칙:

```text
1. Task Revision approval과 runApproval은 다른 단계다.
   이유: Revision approval은 작업 계약 승인이고, runApproval은 지금 이 조건으로 실행해도 되는지에 대한 실행 시도 승인이다.

2. runApproval 기본값은 required=false로 둔다.
   이유: Task Revision approval이 이미 기본 안전장치이므로 모든 Run마다 추가 승인을 요구하면 오케스트레이션이 과도하게 무거워진다.

3. resultReview와 verification은 다른 gate다.
   이유: 테스트 / 빌드 검증 증거와 결과를 수용 / 거절 / 재시도 판단하는 decision은 다른 판단이다.

4. verification.required=true인데 check PASS가 아니면 close / advance 불가.
   이유: 검증이 필수인데 검증 증거가 없거나 실패했으면 성공으로 과장하면 안 된다.

5. REQUIRE_EXPLICIT 질문은 한 번의 review step에서 묶어서 처리한다.
   이유: agentRole, harnessMode, verification 같은 질문을 따로따로 물으면 오케스트레이션이 설문지처럼 무거워진다.

6. BLOCKED_UNTIL_POLICY는 defaults 값이 아니라 derived planning block result다.
   이유: 기본값은 생략값 계약이고, policy 충돌 / 차단은 Run Planning에서 계산되는 결과다.

7. gate 병합은 dimension별 more restrictive wins다.
   이유: runApproval, resultReview, verification은 서로 다른 축이므로 하나의 선형 enum으로 덮어쓰면 의미가 섞인다.

8. autoAdvance는 resultReview gate를 조용히 우회할 수 없다.
   이유: resultReview.required=true이면 유효한 Review Decision 없이 자동 진행할 수 없다. 다만 allowedActors에 SYSTEM_POLICY가 있으면 CodeFleet이 policy evidence로 Review Decision을 자동 append할 수 있다.
```

Required Gates FINAL RULES:

```text
ruleId: PROFILE_DEFAULTS_REQUIRED_GATES_SCHEMA
status: FINAL
scope: POLICY
sourceOfTruth:
- <workspaceRoot>/.codefleet/config.json defaults.task.requiredGates
inputs:
- parsed Project Profile defaults.task.requiredGates
- CodeFleet Project Profile schemaVersion
- requiredGates allowed value set
preconditions:
- Project Profile validation has reached defaults.task validation
- defaults.task.requiredGates is present or defaulted by Core Policy Defaults
condition:
- requiredGates has exactly runApproval, resultReview, verification keys
- runApproval matches DecisionGate schema
- resultReview matches DecisionGate schema
- verification matches EvidenceGate schema
- DecisionGate.required is true, false, or REQUIRE_EXPLICIT
- DecisionGate.allowedActors is a unique array containing only HUMAN or SYSTEM_POLICY
- DecisionGate.explicit is true, false, or REQUIRE_EXPLICIT
- a DecisionGate with required=false has allowedActors=[] and explicit=false
- EvidenceGate.required is true, false, or REQUIRE_EXPLICIT
- EvidenceGate.waiver.allowed is true or false
- EvidenceGate.waiver.allowedActors is a unique array containing only HUMAN or SYSTEM_POLICY
- EvidenceGate.waiver.explicit is true, false, or REQUIRE_EXPLICIT
- a DecisionGate with required=true has at least one allowedActor
- an EvidenceGate waiver with allowed=true has at least one waiver.allowedActor
- scalar gate labels such as NONE, HUMAN_REVIEW, EXPLICIT_APPROVAL, REQUIRED are not accepted as final schema values
- BLOCKED_UNTIL_POLICY is not accepted as a defaults.task.requiredGates value
allowedEffect:
- Task Draft creation may use defaults.task.requiredGates as default gate values
deniedEffect:
- Project Profile validation fails
- Task Draft creation from this Project Profile is blocked
evidence:
- profilePath
- defaults.task.requiredGates JSON pointer
- invalid or missing key when present
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- manual Project Profile defaults correction is required
```

```text
ruleId: TASK_REVISION_REQUIRED_GATES_ARE_CONCRETE
status: FINAL
scope: TASK_REVISION
sourceOfTruth:
- Task Draft unresolved fields
- Task Revision requiredGates
inputs:
- Task Draft.requiredGates
- Task Draft unresolved required fields
- selected policy-authorized choices during Task Review / Approval
- Task Revision.requiredGates
preconditions:
- Task Draft is being approved into a Task Revision
condition:
- Task Revision.requiredGates has runApproval, resultReview, verification keys
- Task Revision.requiredGates contains no REQUIRE_EXPLICIT value anywhere
- runApproval matches concrete DecisionGate schema
- resultReview matches concrete DecisionGate schema
- verification matches concrete EvidenceGate schema
- DecisionGate.required is true or false
- DecisionGate.allowedActors is a unique array containing only HUMAN or SYSTEM_POLICY
- DecisionGate.explicit is true or false
- a DecisionGate with required=false has allowedActors=[] and explicit=false
- EvidenceGate.required is true or false
- EvidenceGate.waiver.allowed is true or false
- EvidenceGate.waiver.allowedActors is a unique array containing only HUMAN or SYSTEM_POLICY
- EvidenceGate.waiver.explicit is true or false
- a DecisionGate with required=true has at least one allowedActor
- an EvidenceGate waiver with allowed=true has at least one waiver.allowedActor
- scalar gate labels such as NONE, HUMAN_REVIEW, EXPLICIT_APPROVAL, REQUIRED are not accepted
- Task Revision stores gate requirements, not the approval or review decision event that satisfies them
allowedEffect:
- Task Revision may be created
- Run Planning may read Task Revision.requiredGates as an authoritative source input
deniedEffect:
- Task Revision creation is blocked
- Run Planning from this Draft is blocked
evidence:
- taskDraftId
- unresolved required fields
- selected requiredGates objects
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- ask the user to resolve requiredGates in the bundled review step
```

```text
ruleId: EFFECTIVE_REQUIRED_GATES_MERGE_BY_DIMENSION
status: FINAL
scope: POLICY
sourceOfTruth:
- Core Policy Defaults
- Project Profile policies
- Local Overlay restrictions
- Task Revision.requiredGates
- Task guardrails
- policy-affecting Run Options
- Run Plan computedRisk
inputs:
- candidate runApproval DecisionGate objects
- candidate resultReview DecisionGate objects
- candidate verification EvidenceGate objects
- requiredGates merge rule definitions
- computedRisk
preconditions:
- Project Profile validation passed
- Task Revision.requiredGates is concrete
- Local Overlay, if present, is valid and restrict-only
- computedRisk has been calculated
condition:
- no REQUIRE_EXPLICIT value reaches effectivePolicy.requiredGates
- unresolved required / explicit fields block Run Planning before merge completion
- effectivePolicy.requiredGates.runApproval.required is OR(candidate required)
- effectivePolicy.requiredGates.resultReview.required is OR(candidate required)
- if computedRisk is MEDIUM, HIGH, or unknown, effectivePolicy.requiredGates.resultReview.required is true
- effectivePolicy.requiredGates.runApproval.explicit is OR(candidate explicit)
- effectivePolicy.requiredGates.resultReview.explicit is OR(candidate explicit)
- required DecisionGate allowedActors are intersected across required sources
- if a merged DecisionGate has required=true, its allowedActors intersection is non-empty
- effectivePolicy.requiredGates.verification.required is OR(candidate required)
- effectivePolicy.requiredGates.verification.waiver.allowed is AND(candidate waiver.allowed)
- effectivePolicy.requiredGates.verification.waiver.explicit is OR(candidate waiver.explicit)
- waiver.allowedActors are intersected across sources that allow waiver
- if merged waiver.allowed=true, its waiver.allowedActors intersection is non-empty
- no dimension is overwritten by a less restrictive gate object
allowedEffect:
- Run Plan may include effectivePolicy.requiredGates
- Execution Harness may evaluate runApproval, resultReview, and verification gates independently
deniedEffect:
- Run Planning fails
- Execution Harness is blocked
evidence:
- runPlanId
- source gate objects per requiredGates dimension
- merged effectivePolicy.requiredGates
- computedRisk
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- rebuild Run Plan from source policies and Task Revision
- correct invalid source policy before execution
```

#### policies.autoAdvanceOnDone

`policies.autoAdvanceOnDone`은 `DONE`을 직접 Queue progression 근거로 쓰게 하는 권한이 아니다. 이 값은 `SYSTEM_POLICY_AUTO_REVIEW_DECISION_IS_BOUNDED` 조건이 모두 만족될 때 CodeFleet이 `RUN_REVIEW_DECIDED(ACCEPTED)`를 자동 append할 수 있는지를 정하는 Project Profile policy다.

기본값:

```json
{
  "policies": {
    "autoAdvanceOnDone": false
  }
}
```

의미:

```text
false
= SYSTEM_POLICY auto review decision append 금지

true
= bounded SYSTEM_POLICY auto review 조건을 모두 만족할 때만 자동 review decision append 허용
```

병합 규칙:

```text
autoAdvanceOnDone
= Project Profile boolean policy
= absent이면 Core Policy Defaults가 false를 넣음
= Project Profile이 명시적으로 true를 설정하면 candidate true가 될 수 있음
= Local Overlay, Task guardrails, Run Options는 restrict-only source임
= restrict-only source는 true를 false로 낮출 수만 있음
= false가 이긴다는 말은 effective/restricting source 사이의 규칙이지, Core default false가 Project Profile의 명시적 true를 영구 veto한다는 뜻이 아님
```

Auto Advance Policy FINAL RULE:

```text
ruleId: PROFILE_POLICY_AUTO_ADVANCE_ON_DONE_IS_BOOLEAN
status: FINAL
scope: POLICY
sourceOfTruth:
- <workspaceRoot>/.codefleet/config.json policies.autoAdvanceOnDone
- Core Policy Defaults
inputs:
- parsed Project Profile policies.autoAdvanceOnDone
- local overlay restrictions
- Task guardrails
- policy-affecting Run Options
preconditions:
- Project Profile validation has reached policies validation
condition:
- policies.autoAdvanceOnDone is absent or boolean
- projectPolicy.autoAdvanceOnDone is parsed Project Profile value when present
- projectPolicy.autoAdvanceOnDone is false when Project Profile value is absent
- Project Profile explicit true may set projectPolicy.autoAdvanceOnDone=true
- effectivePolicy.autoAdvanceOnDone starts from projectPolicy.autoAdvanceOnDone
- effectivePolicy.autoAdvanceOnDone becomes false if any restrict-only source sets false
- effectivePolicy.autoAdvanceOnDone remains true only when projectPolicy.autoAdvanceOnDone is true and no restrict-only source sets false
- Local Overlay, Task guardrails, and Run Options cannot set true when projectPolicy.autoAdvanceOnDone is false
allowedEffect:
- Run Planning may include effectivePolicy.autoAdvanceOnDone
- SYSTEM_POLICY auto review rule may read effectivePolicy.autoAdvanceOnDone
deniedEffect:
- Project Profile validation fails for non-boolean value
- Run Planning blocks if a lower-precedence source attempts to relax false to true
evidence:
- profilePath
- policies.autoAdvanceOnDone JSON pointer
- source values
- effectivePolicy.autoAdvanceOnDone
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- set policies.autoAdvanceOnDone to true or false
- remove relax-only override from Local Overlay, Task guardrails, or Run Options
```

#### defaults.task.workflow

`defaults.task.workflow`는 Task Draft 생성 시 사용하는 기본 작업 절차 템플릿이다.

`workflow`는 권한이 아니고, gate가 아니고, Run Summary 통계 분류가 아니며, 최종 모델의 10단계 Execution Lifecycle을 대체하지 않는다.

추천 기본값:

```json
{
  "workflow": {
    "stages": ["PLAN", "INSPECT", "APPLY", "VERIFY", "REVIEW"]
  }
}
```

WorkflowStage:

```text
PLAN
= 작업 접근 방향 / 계획 정리

INSPECT
= 코드, 로그, 구조, 설정 분석

APPLY
= Task의 주 작업 수행
= 코드 수정, 버그 수정, 문서 수정, 인프라 작업 등
= 파일 수정 권한을 뜻하지 않음

VERIFY
= 테스트, 빌드, 검증 시도 또는 검증 계획 처리

REVIEW
= 결과, diff, risk, next action 검토
```

`workflow.stage`와 `RunSummary.type`은 같은 enum이 아니다.

```text
workflow.stage
= 실행 전 절차 언어

RunSummary.type
= 실행 후 결과 분류 언어
```

관계는 있을 수 있지만 동일하지 않다.

```text
PLAN    -> RunSummary.type PLAN 가능
INSPECT -> RunSummary.type INSPECT 가능
APPLY   -> RunSummary.type BUILD / FIX / DOCS / OPS 가능
VERIFY  -> RunSummary.type CHECK 가능
REVIEW  -> RunSummary.type REVIEW 가능
```

꼬임 방지 규칙:

```text
1. workflow는 권한을 부여하지 않는다.
2. workflow는 harnessMode를 바꾸지 않는다.
3. workflow는 requiredGates를 우회하지 않는다.
4. workflow는 RunSummary.type을 강제하지 않는다.
5. workflow는 10단계 Execution Lifecycle을 대체하지 않는다.
6. workflow 변경은 기존 Task Draft / Revision / Run Plan에 자동 반영되지 않는다.
7. workflow에는 REQUIRE_EXPLICIT을 사용하지 않는다.
8. Task Revision에는 concrete workflow.stages만 저장된다.
```

Workflow FINAL RULES:

```text
ruleId: PROFILE_DEFAULTS_TASK_WORKFLOW_SCHEMA
status: FINAL
scope: POLICY
sourceOfTruth:
- <workspaceRoot>/.codefleet/config.json defaults.task.workflow
inputs:
- parsed Project Profile defaults.task.workflow
- CodeFleet Project Profile schemaVersion
- WorkflowStage allowed value set
preconditions:
- Project Profile validation has reached defaults.task validation
condition:
- defaults.task.workflow is absent or an object with a stages array
- when present, workflow.stages is a non-empty ordered array
- every workflow.stages item is one of PLAN, INSPECT, APPLY, VERIFY, REVIEW
- workflow.stages contains no REQUIRE_EXPLICIT value
- workflow.stages contains no RunSummary-only value such as BUILD, FIX, CHECK, DOCS, OPS
allowedEffect:
- Task Draft creation may copy workflow.stages into the Task Draft
- when defaults.task.workflow is absent, Core default workflow.stages may be used
deniedEffect:
- Project Profile validation fails
- Task Draft creation from this Project Profile is blocked
evidence:
- profilePath
- defaults.task.workflow JSON pointer
- invalid stage value when present
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- manual Project Profile defaults correction is required
```

```text
ruleId: TASK_WORKFLOW_IS_DRAFT_TEMPLATE_NOT_EXECUTION_POLICY
status: FINAL
scope: TASK
sourceOfTruth:
- Project Profile defaults.task.workflow
- Task Draft.workflow
- Task Revision.workflow
inputs:
- defaults.task.workflow.stages
- Task Draft.workflow.stages
- Task Revision.workflow.stages
- Execution Lifecycle rule set
- RunSummary.type allowed value set
preconditions:
- Task Draft is being created or approved into a Task Revision
condition:
- workflow is used only as a Task Draft procedure template
- workflow does not modify harnessMode
- workflow does not modify requiredGates
- workflow does not grant file, command, or adapter capability
- workflow does not force RunSummary.type
- workflow does not replace the 10-step Execution Lifecycle
- Task Revision.workflow contains concrete workflow.stages only
allowedEffect:
- Task Draft and Task Revision may record workflow.stages as procedural guidance
- Execution Harness may include workflow.stages as instruction context within policy limits
deniedEffect:
- using workflow as an authority for permission, gate bypass, lifecycle replacement, or summary type coercion is blocked
evidence:
- taskDraftId or taskRevisionId
- workflow.stages
- attempted policy, gate, lifecycle, or summary effect when present
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- remove policy-like workflow effect
- move permission or gate behavior to policies, requiredGates, or Run Planning rules
```

#### defaults.run.agentAdapter

`defaults.run.agentAdapter`는 Run Planning에서 사용할 기본 AgentAdapter 선택값이다.

AgentAdapter는 CodeFleet Core와 AI 실행 도구를 연결하는 provider-agnostic adapter id다.

```text
agentRole
= 어떤 역할로 일할 것인가

agentAdapter
= 어떤 AI 실행 도구 / provider adapter를 통해 일할 것인가

model
= adapter 또는 provider 내부에서 사용할 모델 선택값

harnessMode
= 어떤 실행 능력을 요청하는가

policies
= 실제로 무엇을 허용하는가
```

`defaults.run.agentAdapter`는 권한이 아니고, 역할이 아니고, 모델명이 아니며, provider-specific 실행 설정이 아니다. `defaults.run.agentAdapter`는 Run Plan 선택값을 채우는 기본값일 뿐이다.

추천 기본값:

```json
{
  "agentAdapter": "REQUIRE_EXPLICIT"
}
```

Project Profile의 adapter 설계는 A+ 구조를 사용한다.

```text
defaults.run.agentAdapter
= 기본 adapter 선택값
= concrete AdapterId 또는 REQUIRE_EXPLICIT

policies.agentAdapters.allowedAdapters
= 프로젝트 정책상 허용되는 AdapterId 목록
= 설치됨을 의미하지 않음

local adapter registry / .codefleet/local.json
= 이 로컬 환경에서 실제 실행 가능한 adapter command / path / 개인 설정
= 공유 Project Profile에 저장하지 않음

RunPlan.selectedAgentAdapter
= 이번 Run에서 최종 선택된 adapter snapshot

RunPlan.adapterResolution
= policy allow check, local availability check, selection source를 설명하는 Run Planning evidence
```

예:

```json
{
  "defaults": {
    "run": {
      "agentAdapter": "REQUIRE_EXPLICIT"
    }
  },
  "policies": {
    "agentAdapters": {
      "allowedAdapters": ["codex", "claude-code"]
    }
  }
}
```

로컬 실행 설정 예:

```json
{
  "agentAdapters": {
    "codex": {
      "command": "codex"
    },
    "claude-code": {
      "command": "claude"
    }
  }
}
```

위 local 설정은 `.codefleet/config.json`에 저장하지 않는다. Project Profile은 공유 정책이고, command path / token / API key / model / provider-specific CLI option / transcript parsing rule은 로컬 환경 또는 adapter layer의 책임이다.

Local adapter registry는 Project Profile 정책을 넓히지 않는다. Local adapter registry는 이미 `policies.agentAdapters.allowedAdapters`로 허용된 AdapterId에 대해 이 로컬에서 실행 가능한 command / path / 개인 설정을 제공할 뿐이다. local availability는 adapter allowlist를 추가하거나 우회할 수 없다.

선택 / 검증 흐름:

```text
1. Run Planning은 Run Options agentAdapter override를 먼저 확인한다.
2. Run Options가 없으면 defaults.run.agentAdapter를 확인한다.
3. 값이 REQUIRE_EXPLICIT이면 사용자에게 선택을 요구한다.
4. 사용자가 선택할 수 있는 후보는 policy allow + local availability를 모두 통과한 adapter다.
5. concrete AdapterId는 policies.agentAdapters.allowedAdapters 안에 있어야 한다.
6. concrete AdapterId는 local adapter registry에서 실행 가능해야 한다.
7. 최종 선택은 Project Profile을 수정하지 않고 RunPlan.selectedAgentAdapter에 기록한다.
8. 선택 근거는 RunPlan.adapterResolution에 기록한다.
```

차단 결과:

```text
selectedAgentAdapter not in policies.agentAdapters.allowedAdapters
-> POLICY BLOCK

selectedAgentAdapter allowed but not available locally
-> LOCAL AVAILABILITY BLOCK

defaults.run.agentAdapter concrete value not in allowedAdapters
-> Project Profile validation failure

defaults.run.agentAdapter REQUIRE_EXPLICIT and no allowed+available adapter exists
-> Run Planning blocked
```

AgentAdapter FINAL RULES:

```text
ruleId: PROFILE_POLICY_AGENT_ADAPTERS_BLOCK
status: FINAL
scope: POLICY
sourceOfTruth:
- <workspaceRoot>/.codefleet/config.json policies.agentAdapters
inputs:
- parsed Project Profile policies.agentAdapters
- CodeFleet Project Profile schemaVersion
- AdapterId syntax rule set
preconditions:
- PROFILE_POLICY_BLOCK_KEYS_FIXED passed
- policies.agentAdapters is an object
condition:
- policies.agentAdapters.allowedAdapters is a non-empty array
- every allowedAdapters item is a stable provider-agnostic AdapterId
- allowedAdapters contains no model name, command path, executable path, token, API key, CLI option, or transcript parsing rule
allowedEffect:
- Run Planning may use policies.agentAdapters.allowedAdapters for adapter policy allow checks
deniedEffect:
- Project Profile validation fails
- Run Planning and Execution Harness are blocked
evidence:
- profilePath
- policies.agentAdapters JSON pointer
- allowedAdapters
- invalid adapter entry when present
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- remove provider-specific execution detail from Project Profile
- move local execution settings to .codefleet/local.json or adapter registry
- correct allowedAdapters to stable AdapterId values
```

```text
ruleId: PROFILE_DEFAULTS_RUN_AGENT_ADAPTER_SCHEMA
status: FINAL
scope: POLICY
sourceOfTruth:
- <workspaceRoot>/.codefleet/config.json defaults.run.agentAdapter
- <workspaceRoot>/.codefleet/config.json policies.agentAdapters.allowedAdapters
inputs:
- parsed Project Profile defaults.run.agentAdapter
- parsed Project Profile policies.agentAdapters.allowedAdapters
- AdapterId syntax rule set
preconditions:
- Project Profile validation has reached defaults.run validation
- PROFILE_POLICY_AGENT_ADAPTERS_BLOCK passed
condition:
- defaults.run.agentAdapter is either REQUIRE_EXPLICIT or a stable AdapterId
- if concrete, defaults.run.agentAdapter is in policies.agentAdapters.allowedAdapters
- defaults.run.agentAdapter is not a model name, command path, executable path, token, API key, CLI option, or provider-specific setting
allowedEffect:
- Run Planning may use defaults.run.agentAdapter as the default adapter selection input
deniedEffect:
- Project Profile validation fails
- Run Planning from this Project Profile is blocked
evidence:
- profilePath
- defaults.run.agentAdapter JSON pointer
- policies.agentAdapters.allowedAdapters
- invalid default adapter value when present
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- set defaults.run.agentAdapter to REQUIRE_EXPLICIT or an allowed AdapterId
- move provider-specific execution detail to local config or adapter layer
```

```text
ruleId: RUN_PLAN_AGENT_ADAPTER_RESOLUTION
status: FINAL
scope: RUN
sourceOfTruth:
- Run Options agentAdapter override
- Project Profile defaults.run.agentAdapter
- Project Profile policies.agentAdapters.allowedAdapters
- local adapter registry / .codefleet/local.json
- Run Plan
inputs:
- requested adapter from Run Options when present
- defaults.run.agentAdapter
- allowedAdapters
- locally available adapters
- user selection when REQUIRE_EXPLICIT is unresolved
preconditions:
- Project Profile validation passed
- local adapter registry has been loaded
- Task Revision is selected for Run Planning
condition:
- selectedAgentAdapter is concrete
- selectedAgentAdapter is in policies.agentAdapters.allowedAdapters
- selectedAgentAdapter is available in the local adapter registry
- RunPlan.adapterResolution records selectionSource, policyAllowed, locallyAvailable, and evidence references
- Run Planning does not modify Project Profile, Local Overlay, or Task Revision while selecting an adapter
allowedEffect:
- Run Plan may record selectedAgentAdapter
- Execution Harness may instantiate the selected AgentAdapter
deniedEffect:
- Run Planning is blocked
- Execution Harness is not called
evidence:
- runPlanId
- selectedAgentAdapter
- selectionSource
- policyAllowed
- locallyAvailable
- adapterResolution
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- choose an allowed and locally available adapter
- install or configure the selected adapter locally
- update Project Profile allowedAdapters only through Project Profile review
```

#### AgentAdapter invocation contract

AgentAdapter 선택은 호출 계약의 전부가 아니다. 최종 모델은 선택된 adapter에게 무엇을 넘기고, 무엇을 회수하며, 무엇을 Core가 다시 판정하는지를 분리한다.

핵심 경계:

```text
Execution Harness owns orchestration.
AgentAdapter owns provider execution.
Core owns normalization.
Review Decision owns acceptance.
```

한국어:

```text
Execution Harness는 실행 절차와 경계를 소유한다.
AgentAdapter는 provider-specific 실행만 담당한다.
Core는 결과 정규화와 정책 판정을 소유한다.
Review Decision은 결과 수용 여부를 소유한다.
```

AdapterRequest:

```text
AdapterRequest
= Execution Harness가 AgentAdapter에 넘기는 provider-agnostic 실행 요청
= Run Plan과 Task Revision에서 파생됨
= Project Profile, Task Revision, Local Overlay를 수정하지 않음
= Run Trace에 durable artifact로 저장됨
```

AdapterRequest 최소 필드:

```yaml
schemaVersion: "1.0"
runId: ""
runPlanId: ""
taskId: ""
taskRevision: 1
objectiveId: ""
objectiveQueueItemId: ""
selectedAgentAdapter: "codex"
agentRole: "BACKEND_IMPLEMENTER"
harnessMode: "WORKSPACE_EDIT"
workspace:
  workspaceRoot: ""
  workingDirectory: ""
  pathStyle: "POSIX_RELATIVE"
taskContractRef:
  revisionPath: ""
  contentHash: ""
promptRef:
  promptPath: ""
  contentHash: ""
policySnapshotRef:
  runPlanPath: ""
  effectivePolicyHash: ""
capabilities:
  fileEdit: false
  commandExecution: false
  allowedPaths: []
  deniedPaths: []
  allowedCommands: []
  deniedCommands: []
isolation:
  mode: "NONE | GIT_WORKTREE | TEMP_WORKSPACE | CONTAINER"
  reason: ""
verificationPlanRef:
  path: ""
  contentHash: ""
trace:
  runTracePath: ""
  stdoutPath: ""
  stderrPath: ""
  artifactRoot: ""
```

AdapterResult:

```text
AdapterResult
= AgentAdapter가 Execution Harness에 돌려주는 provider-agnostic 실행 관찰 결과
= evidence input이지 final decision이 아님
= Run Trace에 durable artifact로 저장됨
= provider report이지 Harness-owned observation이 아님
```

AdapterResult 최소 필드:

```yaml
schemaVersion: "1.0"
runId: ""
adapterId: "codex"
adapterExecutionStatus: "COMPLETED | ADAPTER_FAILED | CANCELED | TIMEOUT"
synthetic: false
startedAt: ""
endedAt: ""
exitCode: 0
stdoutRef: ""
stderrRef: ""
artifactRefs: []
providerReportedChangedFiles: []
providerReportedCommands: []
providerMetadataRef: ""
adapterError:
  code: ""
  message: ""
```

AdapterResult의 `providerReportedChangedFiles`와 `providerReportedCommands`는 provider가 보고한 참고 정보다. Core는 이 값을 changed-files truth나 command execution truth로 사용하지 않는다. 최종 권위 증거는 Execution Harness가 직접 수집한 HarnessObservation에 있다.

AdapterResult의 `stdoutRef`와 `stderrRef`는 Harness가 캡처한 stdio artifact를 가리키는 참조일 수 있다. 그러나 stdio capture의 존재 여부와 경로 권위는 AdapterResult가 아니라 HarnessObservation이 소유한다.

HarnessObservation:

```text
HarnessObservation
= Execution Harness가 provider 실행 전후 workspace와 실행 경계를 직접 관측한 증거
= changed files, diff, command log, policy violation finding의 권위 evidence
= adapter가 주장하거나 요약한 정보가 아님
```

HarnessObservation 최소 필드:

```yaml
schemaVersion: "1.0"
runId: ""
runPlanId: ""
startedAt: ""
endedAt: ""
workspace:
  workspaceRoot: ""
  workingDirectory: ""
  preRunStateRef: ""
  postRunStateRef: ""
stdio:
  stdoutRef: ""
  stderrRef: ""
changes:
  diffRef: ""
  changedFiles: []
  unavailableReason: ""
commands:
  authority: "NONE | PROVIDER_REPORTED_ONLY | HARNESS_OBSERVED | HARNESS_EXECUTED"
  commandLogRef: ""
  providerReportedCommandsRef: ""
  commandsObserved: []
  commandsExecutedByHarness: []
  unavailableReason: ""
policyChecks:
  pathViolations: []
  commandViolations: []
  capabilityViolations: []
observationSource:
  kind: "HARNESS"
  method: "GIT_DIFF | FILE_SNAPSHOT | SANDBOX_LOG | COMMAND_PROXY | NONE"
```

`preRunStateRef`와 `postRunStateRef`는 HarnessWorkspaceSnapshot을 참조한다. 둘은 "workspace가 깨끗했다"는 주장이나 단일 hash가 아니라, Run 시작 전후의 관측 가능한 workspace 상태 증거다.

HarnessWorkspaceSnapshot:

```text
HarnessWorkspaceSnapshot
= Execution Harness가 특정 시점의 workspace 상태를 기록한 Run Trace artifact
= git status, git diff, scoped file snapshot, state hash를 역할별로 분리한다
= Run 전후 상태 비교와 path policy / corruption check의 입력이다
```

역할 분리:

```text
git status
= changed / added / deleted / renamed 파일 목록 증거

git diff
= 사람이 검토할 내용 변경 증거

scoped file snapshot
= Git이 놓칠 수 있는 파일과 path policy 증거
= untracked / gitignored / symlink / nested repo / path escape 검사의 입력

state hash
= 무결성 / 재검증 / corruption check 증거
= 사람 review용 내용 증거가 아님
```

HarnessWorkspaceSnapshot 최소 필드:

```yaml
schemaVersion: "1.0"
runId: ""
phase: "PRE_RUN | POST_RUN"
workspaceRoot: ""
workingDirectory: ""
git:
  headRef: ""
  statusRef: ""
  diffRef: ""
  untrackedPolicy: "IGNORE | LIST | SNAPSHOT"
scopedFiles:
  snapshotRef: ""
  scopeBasis: "EFFECTIVE_ALLOWED_PATHS | CHANGED_PATHS | BOTH"
stateHash:
  algorithm: "sha256"
  value: ""
```

pre-run workspace가 clean일 필요는 없다. `preRunStateRef`는 Run 시작 전 상태이고, `postRunStateRef`는 Run 종료 후 상태다. Run이 만든 변화는 `postRunState - preRunState`로 해석한다.

Command observation authority:

```text
NONE
= commandExecution=false이거나 command observation이 필요 없는 Run

PROVIDER_REPORTED_ONLY
= provider / adapter transcript나 AdapterResult가 보고한 명령만 있음
= command truth가 아니라 degraded evidence / hint

HARNESS_OBSERVED
= command proxy, sandbox log, container exec log 같은 Harness-visible channel로 관찰됨
= command observation truth

HARNESS_EXECUTED
= Execution Harness가 직접 실행한 명령
= verification evidence 또는 Harness-owned command evidence
```

최종 모델에서 command execution truth는 provider transcript가 아니라 Harness-visible command channel에서만 나온다. Provider-reported command는 저장할 수 있지만 verification, command policy compliance, VERIFIED 계산을 만족시키는 증거로 사용할 수 없다.

Path policy evaluation:

```text
PathPolicyEvaluation
= HarnessWorkspaceSnapshot의 pre/post delta에서 나온 각 path change에 대한 policy 판정
= adapter report가 아니라 Harness-owned path evidence에서 계산한다
= allowedPaths / deniedPaths / workspace boundary / path kind / change kind를 함께 판정한다
```

PathPolicyEvaluation 최소 필드:

```yaml
schemaVersion: "1.0"
runId: ""
originalPath: ""
normalizedPath: ""
realPath: ""
changeKind: "ADD | MODIFY | DELETE | RENAME | TYPECHANGE | SYMLINK"
pathKind: "FILE | DIR | SYMLINK | SUBMODULE | NESTED_REPO | UNKNOWN"
withinWorkspace: true
matchedAllowedPath: ""
matchedDeniedPath: ""
violation: false
violationCode: ""
```

Path policy 판정 순서:

```text
1. originalPath를 workspaceRoot 기준 normalized relative path로 변환한다.
2. absolute path, drive escape, UNC path, `..` escape를 검사한다.
3. lstat / realpath / snapshot evidence로 pathKind와 real target을 확인한다.
4. deniedPaths match를 먼저 검사한다.
5. allowedPaths match를 검사한다.
6. changeKind별 source / target 추가 검사를 수행한다.
7. violationCode를 기록한다.
```

핵심 원칙:

```text
deniedPaths wins over allowedPaths.
generated / untracked / gitignored files are still path policy subjects.
delete checks deleted source path.
rename checks both source and target paths.
symlink checks both link path and target path.
nested repo and submodule changes require explicit allow.
stateHash is not path violation evidence by itself.
```

Synthetic AdapterResult:

```text
Synthetic AdapterResult
= AgentAdapter가 structured AdapterResult를 남기지 못했을 때 Execution Harness가 생성하는 failure evidence
= adapter crash, launch failure, timeout, malformed adapter output을 Run Trace에 남기기 위한 최소 결과
```

Synthetic AdapterResult 생성 조건:

```text
adapter process launch failed
-> adapterExecutionStatus = ADAPTER_FAILED
-> synthetic = true

adapter process timeout
-> adapterExecutionStatus = TIMEOUT
-> synthetic = true

adapter output malformed / unreadable
-> adapterExecutionStatus = ADAPTER_FAILED
-> synthetic = true
```

Synthetic AdapterResult도 final decision이 아니다. Core normalizer는 synthetic AdapterResult를 evidence로 사용해 RunSummary.result를 FAILED 또는 BLOCKED로 계산할 수 있지만, Review Decision이나 VERIFIED를 직접 만들 수는 없다.

AdapterResult가 직접 소유하지 않는 것:

```text
- RunSummary.result
- RunSummary.check
- verificationGateResult
- computedRisk
- changed-files truth
- command execution truth
- policy violation truth
- Review Decision
- DONE / FAILED / VERIFIED
- Objective Queue progression
```

Provider-specific transcript parsing, CLI option, command path, model name, token, API key는 Core 도메인에 들어가지 않는다. 이런 값은 local adapter registry 또는 adapter layer 내부 설정으로만 다룬다. Adapter가 transcript를 읽어 요약 후보를 만들 수는 있지만, Core가 받아들이는 것은 provider-agnostic AdapterResult와 Run Trace artifact뿐이다.

S2 Adapter seam 최종 계약:

```text
AdapterRequest -> AgentAdapter -> AdapterResult
```

이 계약은 최종 아키텍처의 S2 실행 경계다. `codex exec -` 같은 특정 호출 방식은 이 계약 아래의 transport 구현일 뿐이다. v0.2에서 Codex adapter를 먼저 구현하더라도 최종 계약은 provider-agnostic AdapterRequest와 AdapterResult를 기준으로 유지한다.

최종 계약에서 durable artifact로 고정하는 파일:

```text
- adapter-request.json 또는 adapter-request.yaml
- adapter-result.json 또는 adapter-result.yaml
- harness-observation.json 또는 harness-observation.yaml
- prompt.md
- stdout.log
- stderr.log
- git-diff.patch 또는 equivalent changed-files evidence
- commands.log 또는 explicit command observation unavailable reason
```

AdapterRequest, AdapterResult, HarnessObservation은 Run Trace evidence다. 이 artifact들은 Review Decision, VERIFIED, Objective Queue progression을 직접 만들지 않는다.

증거 권위 분리:

```text
AdapterResult
= provider execution report
= adapter status, exitCode, provider metadata reference, provider-reported observations

HarnessObservation
= harness-owned execution observation
= stdout / stderr refs, diff / changed files, command log, policy violation evidence

RunSummary
= Core normalizer가 AdapterResult + HarnessObservation + verification evidence를 해석한 derived artifact

ReviewDecision
= 정책상 허용된 actor가 evidence를 보고 남기는 durable decision
```

S2 Run attempt lifecycle:

```text
1. Run Trace directory 생성
2. prompt artifact 생성
3. AdapterRequest artifact 생성
4. pre-run workspace observation 생성
5. AgentAdapter process launch 시도
6. stdout / stderr capture 시작
7. provider execution 종료 / 실패 / timeout
8. stdout / stderr artifact flush
9. post-run workspace observation 생성
10. diff / changed files 계산
11. command observation 계산 또는 unavailableReason 기록
12. HarnessObservation artifact 생성
13. AdapterResult artifact 생성 또는 synthetic AdapterResult 생성
14. Core normalizer 대기
15. Review 대기
```

S2 실패 케이스별 artifact 원칙:

```text
normal adapter completion:
- AdapterResult.synthetic = false
- AdapterResult.adapterExecutionStatus = COMPLETED or ADAPTER_FAILED
- HarnessObservation records stdio, diff / changed files, command observation or unavailableReason

adapter launch failure:
- AdapterResult.synthetic = true
- AdapterResult.adapterExecutionStatus = ADAPTER_FAILED
- AdapterResult.adapterError.code = LAUNCH_FAILED
- HarnessObservation still records pre/post observation and unavailable command observation reason

adapter timeout:
- AdapterResult.synthetic = true
- AdapterResult.adapterExecutionStatus = TIMEOUT
- AdapterResult.adapterError.code = TIMEOUT
- HarnessObservation records stdio captured until timeout and post-timeout diff / changed files

malformed adapter output:
- AdapterResult.synthetic = true
- AdapterResult.adapterExecutionStatus = ADAPTER_FAILED
- AdapterResult.adapterError.code = MALFORMED_ADAPTER_OUTPUT
- HarnessObservation preserves stdio, diff / changed files, and available command observation

harness observation failure:
- HarnessObservation records the failed observation field with unavailableReason
- AdapterResult is still preserved if adapter execution result exists
- Run Summary normalization treats fields requiring missing HarnessObservation evidence as blocked or unknown
```

핵심 원칙:

```text
Adapter failure does not erase HarnessObservation.
Harness observation failure does not erase AdapterResult.
Neither artifact can replace the other.
```

S2 v0.2 Codex transport slice는 VERSION_PLAN이다.

v0.2 Codex adapter는 최종 S2 아키텍처 자체가 아니라, `AdapterRequest -> AgentAdapter -> AdapterResult` 계약 아래의 첫 concrete transport 구현이다. v0.2 구현 편의를 이유로 provider-specific 설정, provider transcript, command claims, path claims를 Core truth로 승격하지 않는다.

v0.2 Codex transport does:

```text
- selectedAgentAdapter = codex
- prompt artifact를 생성한다.
- AdapterRequest artifact를 최소 형태로 생성한다.
- Codex transport는 prompt 본문을 stdin으로 넘긴다.
- 기본 transport command는 local adapter registry / local config의 command + args를 사용한다.
- cwd는 Run Plan workingDirectory 또는 v0.x task projectPath를 사용한다.
- stdout.log / stderr.log를 Harness가 capture한다.
- git status / git diff 기반 HarnessWorkspaceSnapshot 최소 형태를 생성한다.
- HarnessObservation 최소 형태를 생성한다.
- adapter-result.json 또는 synthetic adapter-result.json을 생성한다.
- command observation authority는 NONE 또는 PROVIDER_REPORTED_ONLY로 기록한다.
- commandLogRef unavailableReason은 COMMAND_CHANNEL_NOT_HARNESS_VISIBLE을 허용한다.
- path policy는 normalized path escape, allowedPaths / deniedPaths, delete / rename source-target 최소 검사를 우선 구현한다.
- symlink / nested repo / submodule은 감지 가능한 경우 warning 또는 violation으로 기록한다.
```

v0.2 Codex transport does not:

```text
- final Harness sandbox enforcement를 제공하지 않는다.
- command proxy / sandbox log / container exec log를 제공하지 않는다.
- provider transcript를 command truth로 사용하지 않는다.
- provider-reported changed files를 changed-files truth로 사용하지 않는다.
- full path policy enforcement를 제공하지 않는다.
- symlink target, case-insensitive collision, gitignored snapshot coverage를 완전하게 보장하지 않는다.
- automatic VERIFIED decision을 만들지 않는다.
- Review Decision을 AdapterResult에서 만들지 않는다.
- Project Profile에 Codex command path, token, model, provider CLI option, transcript parser를 저장하지 않는다.
```

v0.2 degraded evidence rule:

```text
If Codex may have executed commands outside a Harness-visible channel,
command evidence authority = PROVIDER_REPORTED_ONLY or NONE.
This cannot satisfy verification, command policy compliance, or automatic VERIFIED calculation.
Human resultReview is required for accepting such Run results.
```

AgentAdapter Invocation FINAL RULES:

```text
ruleId: ADAPTER_REQUEST_IS_PROVIDER_AGNOSTIC
status: FINAL
scope: RUN
sourceOfTruth:
- Run Plan
- Task Revision
- Project Profile policies
- Local Overlay restrictions
- local adapter registry
inputs:
- selectedAgentAdapter
- Task Revision contract
- Run Plan effectivePolicy
- verificationPlan
- runTracePath
preconditions:
- RUN_PLAN_AGENT_ADAPTER_RESOLUTION passed
- Task Revision is approved
- effectivePolicy has been computed
condition:
- AdapterRequest contains stable CodeFleet ids and references
- AdapterRequest contains no provider model name
- AdapterRequest contains no provider-specific CLI option
- AdapterRequest contains no token, API key, secret, or credential value
- AdapterRequest capabilities do not exceed effectivePolicy
- AdapterRequest prompt and policy refs point inside the Run Trace or workspace contract
- AdapterRequest does not modify Project Profile, Local Overlay, or Task Revision
- AdapterRequest is stored as a durable Run Trace artifact before AgentAdapter execution starts
allowedEffect:
- Execution Harness may call the selected AgentAdapter with AdapterRequest
deniedEffect:
- Execution Harness must not call AgentAdapter
evidence:
- runPlanId
- runId
- selectedAgentAdapter
- adapterRequest path or hash
- effectivePolicy hash
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- rebuild AdapterRequest from Run Plan and Task Revision
- move provider-specific settings to local adapter registry or adapter layer
```

```text
ruleId: ADAPTER_CANNOT_EXPAND_CAPABILITIES
status: FINAL
scope: RUN
sourceOfTruth:
- Run Plan effectivePolicy
- AdapterRequest capabilities
- Execution Harness policy enforcement result
inputs:
- effectivePolicy capabilities
- AdapterRequest capabilities
- selectedAgentAdapter
- local adapter registry
preconditions:
- ADAPTER_REQUEST_IS_PROVIDER_AGNOSTIC passed
- effectivePolicy has been computed
condition:
- AdapterRequest fileEdit does not exceed effectivePolicy file edit permission
- AdapterRequest commandExecution does not exceed effectivePolicy command execution permission
- AdapterRequest allowedPaths are equal to or narrower than effectivePolicy allowed paths
- AdapterRequest deniedPaths are equal to or broader than effectivePolicy denied paths
- AdapterRequest allowedCommands are equal to or narrower than effectivePolicy allowed commands
- AdapterRequest deniedCommands are equal to or broader than effectivePolicy denied commands
- AgentAdapter does not add permissions that are absent from AdapterRequest
allowedEffect:
- Execution Harness may continue to AgentAdapter invocation
deniedEffect:
- Execution Harness must not call AgentAdapter
- Run Planning or preflight is blocked with a policy enforcement finding
evidence:
- runPlanId
- runId
- selectedAgentAdapter
- effectivePolicy hash
- adapterRequest path or hash
- capability comparison result
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- rebuild AdapterRequest from effectivePolicy
- remove adapter-layer permission expansion
- require Project Profile or Task Revision review for any intended permission change
```

```text
ruleId: ADAPTER_RESULT_IS_EVIDENCE_NOT_DECISION
status: FINAL
scope: RUN
sourceOfTruth:
- AdapterResult
- Run Trace
- HarnessObservation
- Run Summary normalizer
- Review Decision ledger
inputs:
- AdapterResult
- stdout / stderr refs
- artifact refs
- provider-reported changed files when present
- provider-reported command observations when present
- HarnessObservation
preconditions:
- AgentAdapter returned a structured AdapterResult or Execution Harness created a synthetic AdapterResult
condition:
- AdapterResult records adapterExecutionStatus
- if AgentAdapter failed before returning structured output, Execution Harness creates synthetic=true AdapterResult
- synthetic AdapterResult records adapterError.code and adapterError.message
- AdapterResult may reference provider metadata but does not inline provider-specific transcript as Core state
- AdapterResult is stored as a durable Run Trace artifact after AgentAdapter execution or synthetic result creation
- AdapterResult provider-reported changed files are non-authoritative
- AdapterResult provider-reported command observations are non-authoritative
- AdapterResult does not override HarnessObservation changed-files evidence
- AdapterResult does not override HarnessObservation command evidence
- AdapterResult does not set RunSummary.result directly
- AdapterResult does not set RunSummary.check directly
- AdapterResult does not set verificationGateResult
- AdapterResult does not set path, command, or capability violation truth directly
- AdapterResult does not write Review Decision
- AdapterResult does not write DONE, FAILED, VERIFIED, NEXT, or Queue State
- Core normalizer derives Run Summary from Run Trace, AdapterResult, HarnessObservation, and verification evidence
allowedEffect:
- Core may use AdapterResult as evidence input for Run Summary normalization
- Run Trace may store AdapterResult and referenced artifacts
- Execution Harness may create synthetic AdapterResult for adapter crash, timeout, launch failure, or malformed output
deniedEffect:
- adapter output is rejected as a decision source
- Run Summary normalization is blocked until provider-specific data is normalized
evidence:
- runId
- adapterId
- adapterExecutionStatus
- adapterResult path or hash
- normalization result
failureFinding:
- category = EXECUTION_EVIDENCE_INTEGRITY
- severity = WARNING
repairBehavior:
- normalize adapter output through adapter layer
- store raw provider output only as Run Trace artifact
```

```text
ruleId: HARNESS_OBSERVATION_OWNS_EXECUTION_EVIDENCE
status: FINAL
scope: RUN
sourceOfTruth:
- Execution Harness
- Run Trace
- HarnessObservation
- workspace pre-run and post-run observation
- command proxy / sandbox log when available
inputs:
- runId
- runPlanId
- runTracePath
- workspaceRoot
- workingDirectory
- pre-run workspace state
- post-run workspace state
- stdout / stderr capture result
- command proxy or sandbox command log when available
- effectivePolicy capabilities
preconditions:
- AdapterRequest artifact exists
- Execution Harness has started Run execution
condition:
- Execution Harness creates a HarnessObservation artifact for every Run attempt
- HarnessObservation records stdoutRef and stderrRef or an explicit unavailableReason
- HarnessObservation records diffRef / changedFiles or an explicit unavailableReason
- HarnessObservation records commandLogRef / commandsObserved or an explicit unavailableReason
- HarnessObservation records pathViolations, commandViolations, and capabilityViolations from Harness-owned checks
- HarnessObservation evidence is not sourced from provider transcript claims alone
- AdapterResult provider-reported observations cannot replace missing HarnessObservation evidence
allowedEffect:
- Core normalizer may use HarnessObservation as the authority for changed files, command observations, and policy violation evidence
- Review may inspect HarnessObservation as execution evidence
deniedEffect:
- Run Summary normalization is blocked for fields that require missing HarnessObservation evidence
- Review / Close cannot calculate VERIFIED from adapter-reported observations alone
evidence:
- runId
- runPlanId
- harnessObservation path or hash
- stdoutRef
- stderrRef
- diffRef or changedFiles unavailableReason
- commandLogRef or commands unavailableReason
- policy violation check result
failureFinding:
- category = EXECUTION_EVIDENCE_INTEGRITY
- severity = WARNING
repairBehavior:
- preserve raw stdout / stderr / provider artifacts
- create synthetic AdapterResult when adapter failure is known
- record unavailableReason for evidence that cannot be reconstructed
- rerun through a new Run if required HarnessObservation evidence is missing
```

```text
ruleId: HARNESS_WORKSPACE_SNAPSHOT_IS_STATE_EVIDENCE
status: FINAL
scope: RUN
sourceOfTruth:
- Execution Harness
- Run Trace
- HarnessWorkspaceSnapshot
- HarnessObservation preRunStateRef
- HarnessObservation postRunStateRef
inputs:
- runId
- workspaceRoot
- workingDirectory
- effectivePolicy allowed paths
- effectivePolicy denied paths
- git status capture
- git diff capture
- scoped file snapshot capture
- state hash calculation
preconditions:
- Run Trace directory has been created
- workspaceRoot and workingDirectory have been resolved
condition:
- preRunStateRef references a HarnessWorkspaceSnapshot with phase = PRE_RUN
- postRunStateRef references a HarnessWorkspaceSnapshot with phase = POST_RUN
- HarnessWorkspaceSnapshot records git status evidence or an explicit unavailableReason
- HarnessWorkspaceSnapshot records git diff evidence or an explicit unavailableReason
- HarnessWorkspaceSnapshot records scoped file snapshot evidence or an explicit unavailableReason
- HarnessWorkspaceSnapshot records stateHash or an explicit unavailableReason
- git status is used as changed-file list evidence
- git diff is used as human-reviewable content evidence
- scoped file snapshot is used for Git-missed files and path policy evidence
- stateHash is used for integrity / replay / corruption checks, not as the only review evidence
- Run delta is interpreted as postRunState minus preRunState
allowedEffect:
- HarnessObservation may reference preRunStateRef and postRunStateRef
- Core normalizer may compute changed files, path findings, and state consistency from the snapshots
- Review may inspect git diff and scoped file snapshot evidence
deniedEffect:
- Run Summary normalization is blocked for state-derived fields whose snapshot evidence is missing
- Review / Close cannot calculate VERIFIED from stateHash alone
evidence:
- runId
- preRunStateRef
- postRunStateRef
- git status refs
- git diff refs
- scoped file snapshot refs
- stateHash values
- unavailableReason fields when present
failureFinding:
- category = EXECUTION_EVIDENCE_INTEGRITY
- severity = WARNING
repairBehavior:
- preserve available git status / diff / snapshot artifacts
- record unavailableReason for missing snapshot components
- rerun through a new Run if required state evidence cannot be reconstructed deterministically
```

```text
ruleId: COMMAND_TRUTH_REQUIRES_HARNESS_VISIBLE_CHANNEL
status: FINAL
scope: RUN
sourceOfTruth:
- Execution Harness
- HarnessObservation commands
- command proxy log
- sandbox log
- container exec log
- Harness-executed verification command log
- Run Plan effectivePolicy
inputs:
- effectivePolicy commandExecution permission
- HarnessObservation.commands.authority
- HarnessObservation.commands.commandLogRef
- HarnessObservation.commands.commandsObserved
- HarnessObservation.commands.commandsExecutedByHarness
- AdapterResult providerReportedCommands when present
- Project Profile policies.commands
- Project Profile policies.harness
preconditions:
- HarnessObservation artifact exists
- effectivePolicy has been computed
condition:
- command truth is recognized only when commands.authority is HARNESS_OBSERVED or HARNESS_EXECUTED
- HARNESS_OBSERVED command truth must come from a Harness-visible channel such as command proxy, sandbox log, or container exec log
- HARNESS_EXECUTED command truth must come from Execution Harness direct command execution
- PROVIDER_REPORTED_ONLY commands are not command truth
- AdapterResult providerReportedCommands are not command truth
- provider transcript claims are not command truth
- command policy compliance cannot be satisfied from PROVIDER_REPORTED_ONLY
- verification command evidence cannot be satisfied from PROVIDER_REPORTED_ONLY
- VERIFIED cannot be calculated from PROVIDER_REPORTED_ONLY command claims
allowedEffect:
- Core normalizer may use HARNESS_OBSERVED and HARNESS_EXECUTED command evidence for command policy, verification, and Run Summary fields
- Review may inspect PROVIDER_REPORTED_ONLY commands as hints with degraded authority
deniedEffect:
- command policy compliance is unknown or blocked when command truth is required but only provider-reported commands exist
- verification evidence is unsatisfied when it depends on provider-reported command claims only
- automatic VERIFIED calculation is blocked when required command evidence is PROVIDER_REPORTED_ONLY
evidence:
- runId
- harnessObservation path or hash
- command authority
- commandLogRef
- commandsObserved
- commandsExecutedByHarness
- providerReportedCommandsRef when present
- command evidence degradation reason when present
failureFinding:
- category = EXECUTION_EVIDENCE_INTEGRITY
- severity = WARNING
repairBehavior:
- rerun through Harness-visible command channel
- run verification through Execution Harness
- record PROVIDER_REPORTED_ONLY as degraded evidence, not truth
```

```text
ruleId: COMMAND_EXECUTION_REQUIRES_OBSERVABLE_AUTHORITY_OR_DEGRADED_POLICY
status: FINAL
scope: RUN
sourceOfTruth:
- Run Plan effectivePolicy
- Project Profile policies.harness
- Project Profile policies.commands
- HarnessObservation commands
- Run Summary normalizer
inputs:
- effectivePolicy commandExecution permission
- task or Run requested command capability
- commands.authority
- policies.harness allowDegradedCommandObservation when present
- computed risk
- requiredGates.resultReview
preconditions:
- Run Planning is evaluating execution feasibility or Core normalizer is evaluating command evidence
- effectivePolicy has been computed
condition:
- if commandExecution is false, adapter / agent must not be granted command execution capability
- if commandExecution is true, final command truth requires commands.authority = HARNESS_OBSERVED or HARNESS_EXECUTED
- if commandExecution is true and no Harness-visible command channel exists, Run Planning is blocked by default
- degraded command observation may be allowed only by explicit policy
- degraded command observation uses commands.authority = PROVIDER_REPORTED_ONLY or NONE
- degraded command observation cannot lower risk
- degraded command observation requires risk HIGH or higher when command execution may have occurred outside Harness-visible channel
- degraded command observation requires human resultReview
- degraded command observation blocks automatic VERIFIED calculation
allowedEffect:
- Run Planning may proceed with commandExecution only when Harness-visible command channel exists or explicit degraded policy allows it
- Core normalizer may mark command observation as DEGRADED when explicit policy allows degraded execution
deniedEffect:
- Execution Harness must not call AgentAdapter with command execution capability when required observable authority is absent and degraded policy is not explicit
- Run Summary must not claim command truth from degraded evidence
- Review / Close must not auto-verify from degraded command evidence
evidence:
- runPlanId
- runId
- effectivePolicy commandExecution
- command authority
- degraded policy reference when present
- computed risk
- resultReview requirement
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- use command proxy, sandbox, container, or Harness-executed command path
- disable commandExecution capability
- explicitly accept degraded command observation policy with HIGH risk and human review
```

```text
ruleId: V0_2_CODEX_SLICE_MUST_NOT_WEAKEN_FINAL_S2_CONTRACT
status: FINAL
scope: RUN
sourceOfTruth:
- S2 final contract
- AdapterRequest
- AdapterResult
- HarnessObservation
- HarnessWorkspaceSnapshot
- v0.2 Codex transport VERSION_PLAN
inputs:
- selectedAgentAdapter
- local adapter registry
- AdapterRequest artifact
- AdapterResult artifact
- HarnessObservation artifact
- HarnessWorkspaceSnapshot artifacts
- command observation authority
- path policy evaluation result
preconditions:
- v0.2 Codex transport implementation is selected
- Run has reached AdapterRequest creation
condition:
- v0.2 Codex transport is treated as transport implementation, not as Core architecture
- v0.2 still writes AdapterRequest, HarnessObservation, and AdapterResult artifacts
- provider-specific Codex command path, model, token, CLI option, and transcript parser remain outside Project Profile
- provider transcript is not command truth
- provider-reported changed files are not changed-files truth
- command authority is NONE, PROVIDER_REPORTED_ONLY, HARNESS_OBSERVED, or HARNESS_EXECUTED
- if no Harness-visible command channel exists, command authority is NONE or PROVIDER_REPORTED_ONLY
- automatic VERIFIED is blocked when required evidence is degraded
- Review Decision is not created from AdapterResult
allowedEffect:
- v0.2 may implement a smaller S2 slice while preserving final contract boundaries
- Core may mark unsupported final features as unavailable or degraded
deniedEffect:
- v0.2 implementation must not store provider-specific execution detail in Project Profile
- v0.2 implementation must not claim command truth from provider report
- v0.2 implementation must not auto-verify from degraded evidence
evidence:
- runId
- selectedAgentAdapter
- adapterRequest path or hash
- adapterResult path or hash
- harnessObservation path or hash
- command authority
- degraded evidence fields when present
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- move provider-specific settings to local adapter registry or adapter layer
- downgrade provider-reported observations to degraded evidence
- require human Review Decision for degraded runs
```

```text
ruleId: PATHS_ARE_WORKSPACE_RELATIVE_AND_CANONICAL
status: FINAL
scope: RUN
sourceOfTruth:
- Execution Harness
- HarnessWorkspaceSnapshot
- HarnessObservation policyChecks
- Project Profile policies.files
- Run Plan effectivePolicy
inputs:
- workspaceRoot
- workingDirectory
- changed paths from Run delta
- original path strings
- normalized path strings
- realpath / lstat / snapshot evidence
- effectivePolicy allowedPaths
- effectivePolicy deniedPaths
preconditions:
- HarnessWorkspaceSnapshot preRunStateRef and postRunStateRef exist
- Run delta has been computed
condition:
- every changed path is evaluated as a workspace-relative normalized path
- absolute paths are rejected as policy targets
- drive-qualified paths are rejected as policy targets
- UNC paths are rejected as policy targets
- `..` path escape outside workspaceRoot is rejected
- realpath escape outside workspaceRoot is rejected
- original path casing and raw path string are preserved as evidence
allowedEffect:
- PathPolicyEvaluation may continue to allowedPaths / deniedPaths matching
deniedEffect:
- changed path is recorded as path violation
- Run Summary normalization records path policy failure
evidence:
- runId
- originalPath
- normalizedPath
- realPath when available
- workspaceRoot
- violationCode
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- move change inside workspace
- remove absolute / escaped path from task scope
- rerun through a new Run after path correction
```

```text
ruleId: DENIED_PATHS_OVERRIDE_ALLOWED_PATHS
status: FINAL
scope: RUN
sourceOfTruth:
- Run Plan effectivePolicy
- Project Profile policies.files
- HarnessObservation policyChecks
- PathPolicyEvaluation
inputs:
- normalizedPath
- realPath when available
- effectivePolicy allowedPaths
- effectivePolicy deniedPaths
- path matcher result
preconditions:
- PATHS_ARE_WORKSPACE_RELATIVE_AND_CANONICAL passed for the path
condition:
- deniedPaths are evaluated before allowedPaths
- any deniedPaths match creates a violation even when allowedPaths also match
- absence of allowedPaths match creates a violation unless policy explicitly allows the path class
allowedEffect:
- path change may be accepted only when no deniedPaths match and an allowed policy permits it
deniedEffect:
- denied path change is recorded as DENIED_PATH_CHANGED
- not-allowed path change is recorded as PATH_OUTSIDE_ALLOWED_PATHS
evidence:
- runId
- normalizedPath
- matchedAllowedPath
- matchedDeniedPath
- violationCode
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- remove denied path change
- narrow task scope
- update Project Profile policy only through review
```

```text
ruleId: SYMLINK_TARGET_MUST_NOT_ESCAPE_PATH_POLICY
status: FINAL
scope: RUN
sourceOfTruth:
- HarnessWorkspaceSnapshot
- scoped file snapshot
- lstat / realpath evidence
- effectivePolicy files policy
- PathPolicyEvaluation
inputs:
- symlink link path
- symlink target path
- normalized link path
- target realPath when resolvable
- effectivePolicy allowedPaths
- effectivePolicy deniedPaths
preconditions:
- changed path is a symlink or symlink target can affect changed path resolution
- PATHS_ARE_WORKSPACE_RELATIVE_AND_CANONICAL has evaluated the link path
condition:
- symlink link path must be allowed
- symlink target must be resolvable or recorded as violation
- symlink target realPath must remain inside workspaceRoot
- symlink target must not match deniedPaths
- symlink target must match allowedPaths when target is inside workspace policy scope
allowedEffect:
- symlink change may be accepted only when link and target both satisfy path policy
deniedEffect:
- symlink change is recorded as path violation
evidence:
- runId
- symlink path
- symlink target
- target realPath when available
- matchedAllowedPath
- matchedDeniedPath
- violationCode
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- remove unsafe symlink
- point symlink target inside allowed workspace scope
- explicitly deny broken or unverifiable symlink targets
```

```text
ruleId: CASE_INSENSITIVE_PATH_MATCH_USES_CANONICAL_KEY
status: FINAL
scope: RUN
sourceOfTruth:
- Execution Harness filesystem capability detection
- HarnessWorkspaceSnapshot
- effectivePolicy files policy
- PathPolicyEvaluation
inputs:
- workspace filesystem case sensitivity
- original path casing
- normalized path
- case-folded comparison key when applicable
- effectivePolicy allowedPaths
- effectivePolicy deniedPaths
preconditions:
- changed path has been normalized
- filesystem case sensitivity has been detected or declared
condition:
- case-insensitive filesystems use case-folded comparison keys for policy matching
- original path casing is preserved as evidence
- deniedPaths matching uses the same filesystem sensitivity semantics as allowedPaths
- case-only rename is recorded as evidence
- case collision is recorded as finding
allowedEffect:
- policy matching may proceed using canonical comparison key
deniedEffect:
- denied match on case-insensitive filesystem is recorded as CASE_INSENSITIVE_DENY_MATCH
- path collision is recorded as CASE_COLLISION_DETECTED
evidence:
- runId
- filesystem case sensitivity
- originalPath
- canonicalComparisonKey
- matchedAllowedPath
- matchedDeniedPath
- violationCode or warningCode
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- rename paths to non-conflicting names
- correct policy casing or path patterns
- rerun after case collision is resolved
```

```text
ruleId: GENERATED_UNTRACKED_AND_GITIGNORED_FILES_ARE_POLICY_SUBJECTS
status: FINAL
scope: RUN
sourceOfTruth:
- HarnessWorkspaceSnapshot
- scoped file snapshot
- git status evidence
- effectivePolicy files policy
- PathPolicyEvaluation
inputs:
- generated file paths when known
- untracked file paths
- gitignored file paths inside snapshot coverage
- effectivePolicy allowedPaths
- effectivePolicy deniedPaths
- scoped file snapshot coverage
preconditions:
- scoped file snapshot has been collected or unavailableReason recorded
- Run delta has been computed
condition:
- generated files do not bypass path policy
- untracked files do not bypass path policy
- gitignored files inside scoped snapshot coverage do not bypass path policy
- generated / untracked / gitignored files matching deniedPaths are violations
- generated / untracked / gitignored files outside allowedPaths are violations unless explicitly allowed by policy
allowedEffect:
- generated / untracked / gitignored changes may be accepted only when allowed by effective files policy
deniedEffect:
- unauthorized generated / untracked / gitignored changes are recorded as path violations
evidence:
- runId
- path
- file class
- snapshot coverage
- matchedAllowedPath
- matchedDeniedPath
- violationCode
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- remove unauthorized generated output
- add explicit generated output policy through review
- extend scoped snapshot coverage when evidence is insufficient
```

```text
ruleId: DELETE_AND_RENAME_CHECK_SOURCE_AND_TARGET
status: FINAL
scope: RUN
sourceOfTruth:
- HarnessWorkspaceSnapshot
- git status evidence
- scoped file snapshot
- PathPolicyEvaluation
- effectivePolicy files policy
inputs:
- changeKind
- delete source path
- rename source path
- rename target path
- effectivePolicy allowedPaths
- effectivePolicy deniedPaths
preconditions:
- Run delta has identified delete or rename change
- source and target paths have been normalized when present
condition:
- DELETE evaluates the deleted source path
- RENAME evaluates both source path and target path
- source path matching deniedPaths creates violation
- target path matching deniedPaths creates violation
- target path outside allowedPaths creates violation
- rename cannot be used to move denied content into allowed scope without violation
allowedEffect:
- delete or rename may be accepted only when all relevant paths satisfy effective files policy
deniedEffect:
- delete or rename is recorded as path violation
evidence:
- runId
- changeKind
- sourcePath
- targetPath
- matchedAllowedPath
- matchedDeniedPath
- violationCode
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- revert unauthorized delete or rename
- restrict task scope
- update policy only through review when intended
```

```text
ruleId: NESTED_REPO_AND_SUBMODULE_REQUIRE_EXPLICIT_ALLOW
status: FINAL
scope: RUN
sourceOfTruth:
- HarnessWorkspaceSnapshot
- scoped file snapshot
- git status evidence
- effectivePolicy files policy
- Project Profile workspace components
inputs:
- pathKind
- nested .git directory evidence
- gitfile evidence
- submodule status evidence
- changed paths under nested repo or submodule
- explicit policy allow when present
preconditions:
- scoped file snapshot or git status evidence can identify nested repo / submodule boundary
condition:
- nested repo changes are blocked by default
- submodule pointer changes require explicit allow
- submodule internal file changes are not treated as current workspace evidence by default
- nested .git directory or gitfile boundary is recorded as NESTED_REPO or SUBMODULE
- explicit allow must identify the nested repo or submodule boundary
allowedEffect:
- nested repo or submodule change may be accepted only when explicit policy allows the boundary and change kind
deniedEffect:
- nested repo or submodule change is recorded as path violation
evidence:
- runId
- path
- pathKind
- boundaryPath
- submodule or nested repo evidence
- explicit allow reference when present
- violationCode
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- remove nested repo / submodule modification
- model the repo as a separate workspace or component
- add explicit policy only through review
```

```text
ruleId: S2_RUN_ATTEMPT_ALWAYS_LEAVES_THREE_ARTIFACTS
status: FINAL
scope: RUN
sourceOfTruth:
- Run Trace directory
- AdapterRequest
- HarnessObservation
- AdapterResult
- Execution Harness lifecycle log when available
inputs:
- runId
- runPlanId
- runTracePath
- prompt artifact
- adapter launch result
- stdout / stderr capture result
- pre-run workspace observation
- post-run workspace observation
- diff / changed files capture result
- command observation result
preconditions:
- Run Trace directory has been created
- AdapterRequest artifact has been created
condition:
- every Run attempt that reaches AdapterRequest creation leaves an AdapterRequest artifact
- every Run attempt that reaches AdapterRequest creation leaves a HarnessObservation artifact
- every Run attempt that reaches AdapterRequest creation leaves an AdapterResult artifact or synthetic AdapterResult artifact
- adapter launch failure produces synthetic AdapterResult with adapterExecutionStatus = ADAPTER_FAILED and adapterError.code = LAUNCH_FAILED
- adapter timeout produces synthetic AdapterResult with adapterExecutionStatus = TIMEOUT and adapterError.code = TIMEOUT
- malformed adapter output produces synthetic AdapterResult with adapterExecutionStatus = ADAPTER_FAILED and adapterError.code = MALFORMED_ADAPTER_OUTPUT
- HarnessObservation records unavailableReason for any required observation field that cannot be collected
- adapter failure does not erase HarnessObservation
- Harness observation failure does not erase AdapterResult
- AdapterResult and HarnessObservation do not replace each other
allowedEffect:
- Run Summary normalization may inspect the three artifacts and calculate derived result fields from available evidence
- Review may inspect the three artifacts before making a Review Decision
deniedEffect:
- Run Summary normalization is blocked for missing required artifact references
- Review / Close cannot calculate VERIFIED from this Run when any of the three artifacts is missing
evidence:
- runId
- runPlanId
- runTracePath
- adapterRequest path or hash
- harnessObservation path or hash
- adapterResult path or hash
- adapterExecutionStatus
- synthetic flag
- adapterError.code when synthetic
- unavailableReason fields when observation failed
failureFinding:
- category = EXECUTION_EVIDENCE_INTEGRITY
- severity = WARNING
repairBehavior:
- preserve all existing raw artifacts
- create synthetic AdapterResult only when failure condition is known from Harness evidence
- record unavailableReason for missing HarnessObservation fields
- rerun through a new Run if any required artifact cannot be reconstructed deterministically
```

```text
ruleId: ADAPTER_REQUEST_AND_RESULT_ARE_RUN_TRACE_ARTIFACTS
status: FINAL
scope: RUN
sourceOfTruth:
- Run Trace directory
- AdapterRequest
- AdapterResult
- HarnessObservation
- prompt artifact
- stdout / stderr artifacts
- changed files or diff evidence
- command observation evidence
inputs:
- runId
- runTracePath
- adapterRequest artifact
- adapterResult artifact
- harnessObservation artifact
- prompt artifact
- stdout artifact
- stderr artifact
- diff or changed-files evidence
- command log or command observation unavailable reason
preconditions:
- Run Trace directory has been created
- selectedAgentAdapter is resolved
condition:
- AdapterRequest artifact exists before provider execution starts
- AdapterResult artifact exists after provider execution completes or fails
- HarnessObservation artifact exists after provider execution completes or fails
- prompt artifact is referenced by AdapterRequest
- stdout and stderr artifacts are referenced by HarnessObservation or Run Trace
- changed-files or diff evidence is stored in HarnessObservation or explicitly recorded as unavailable with failure reason
- command observation evidence is stored in HarnessObservation or explicitly recorded as unavailable with failure reason
- artifact paths are inside the Run Trace or allowed workspace evidence location
allowedEffect:
- Run Summary normalization may read AdapterRequest, AdapterResult, and HarnessObservation as evidence inputs
- Review may inspect AdapterRequest, AdapterResult, HarnessObservation, prompt, stdio, and diff evidence
deniedEffect:
- Run Summary normalization is blocked
- Review / Close cannot calculate VERIFIED from this Run
evidence:
- runId
- runTracePath
- adapterRequest path or hash
- adapterResult path or hash
- harnessObservation path or hash
- prompt path or hash
- stdoutRef
- stderrRef
- diffRef or changedFiles
- commandLogRef or commands unavailableReason
failureFinding:
- category = EXECUTION_EVIDENCE_INTEGRITY
- severity = WARNING
repairBehavior:
- preserve existing raw artifacts
- create missing synthetic AdapterResult when failure condition is known
- rerun only through a new Run when required evidence cannot be reconstructed deterministically
```

### 5.2 Project Profile 구조 FINAL RULE

```text
ruleId: PROFILE_CONFIG_IS_WORKSPACE_CONTRACT
status: FINAL
scope: POLICY
sourceOfTruth:
- <workspaceRoot>/.codefleet/config.json
inputs:
- resolved workspaceRoot
- parsed .codefleet/config.json
- CodeFleet Project Profile schemaVersion
preconditions:
- workspaceRoot is resolved
- .codefleet/config.json exists
- .codefleet/config.json is valid JSON
condition:
- config file path equals <workspaceRoot>/.codefleet/config.json
- parsed document contains schemaVersion
- schemaVersion is supported by the running CodeFleet validation rule set
allowedEffect:
- Project Profile may participate in policy merge
- Task review, validation, draft, and run planning may read Project Profile as workspace policy
deniedEffect:
- Project Profile validation fails
- Task review, approval, Execution Harness, and policy merge are blocked
evidence:
- profilePath
- schemaVersion
- workspaceRoot
- validationRuleSetVersion
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = CORRUPTION
repairBehavior:
- manual edit of .codefleet/config.json or CodeFleet version/schema migration is required
```

```text
ruleId: PROFILE_TOP_LEVEL_KEYS_FIXED
status: FINAL
scope: POLICY
sourceOfTruth:
- <workspaceRoot>/.codefleet/config.json
inputs:
- parsed Project Profile top-level object
- Project Profile schemaVersion
preconditions:
- PROFILE_CONFIG_IS_WORKSPACE_CONTRACT passed
condition:
- top-level keys are exactly:
  schemaVersion, project, workspace, defaults, policies, references, localPolicy
allowedEffect:
- Project Profile block-level validation may continue
- policy merge may read declared top-level blocks
deniedEffect:
- Project Profile validation fails
- policy merge is blocked
evidence:
- actualTopLevelKeys
- expectedTopLevelKeys
- missingKeys
- unexpectedKeys
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = CORRUPTION
repairBehavior:
- manual Project Profile schema correction is required
```

```text
ruleId: PROFILE_POLICY_BLOCK_KEYS_FIXED
status: FINAL
scope: POLICY
sourceOfTruth:
- <workspaceRoot>/.codefleet/config.json policies
inputs:
- parsed Project Profile policies object
- Project Profile schemaVersion
preconditions:
- PROFILE_TOP_LEVEL_KEYS_FIXED passed
- policies is an object
condition:
- policies keys are exactly:
  harness, agentAdapters, files, commands, risk, verification, redaction, carryForward, agentRoles
allowedEffect:
- policy block validators may run
- policy merge may read the validated policies block
deniedEffect:
- Project Profile validation fails
- policy merge is blocked
evidence:
- actualPolicyKeys
- expectedPolicyKeys
- missingPolicyKeys
- unexpectedPolicyKeys
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = CORRUPTION
repairBehavior:
- manual Project Profile policy block correction is required
```

```text
ruleId: PROFILE_DOES_NOT_STORE_RUNTIME_OR_LOCAL_STATE
status: FINAL
scope: POLICY
sourceOfTruth:
- <workspaceRoot>/.codefleet/config.json
- Core secret pattern rule set
- Core forbidden Project Profile key rule set
inputs:
- parsed Project Profile
- all JSON pointers and string values in Project Profile
- normalized path-valued fields in Project Profile
preconditions:
- PROFILE_CONFIG_IS_WORKSPACE_CONTRACT passed
- Core secret pattern rule set is loaded
- Core forbidden Project Profile key rule set is loaded
condition:
- no JSON pointer or key name matches the forbidden runtime-state key set
- no string value matches the Core secret pattern rule set
- all path-valued fields are workspace-relative paths
- config.json does not contain raw stdout, stderr, diff, run result, approval history, execution evidence, secret, token, password, private key, session cookie, operating server connection detail, adapter command path, provider-specific CLI option, provider-specific model setting, transcript parsing rule, or personal local absolute path
allowedEffect:
- Project Profile may be committed and shared as workspace policy
- references may point to context/template files
deniedEffect:
- Project Profile validation fails
- Run Summary export, policy merge, and Execution Harness are blocked until corrected
evidence:
- matchedJsonPointer
- matchedKey
- matchedPatternId
- matchedValueKind
- pathValue
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = CORRUPTION
repairBehavior:
- move runtime evidence to Run Trace
- move execution summary to Run Summary
- move local-only values to .codefleet/local.json
- remove secrets and rotate exposed credentials outside CodeFleet
```

```text
ruleId: PROFILE_LOCAL_OVERLAY_RESTRICT_ONLY
status: FINAL
scope: POLICY
sourceOfTruth:
- <workspaceRoot>/.codefleet/config.json localPolicy
- <workspaceRoot>/.codefleet/local.json when present
- Core Policy Defaults
inputs:
- Project Profile localPolicy
- parsed Local Overlay when present
- policy order tables
- permission merge result before and after Local Overlay
preconditions:
- PROFILE_CONFIG_IS_WORKSPACE_CONTRACT passed
- localPolicy is an object
- if localPolicy.overlayPath exists, it is workspace-relative
condition:
- localPolicy.mergeMode == RESTRICT_ONLY
- localPolicy.overlayPath == ".codefleet/local.json"
- Local Overlay modifies only keys listed in localPolicy.allowedLocalKeys
- effective policy after applying Local Overlay is not less restrictive than effective policy before applying Local Overlay
allowedEffect:
- Local Overlay may participate in effectivePolicy calculation
- personal environment differences may be represented outside config.json
deniedEffect:
- Local Overlay is ignored for execution
- policy merge fails for runs that require invalid Local Overlay values
- Project Profile validation fails if localPolicy itself is invalid
evidence:
- overlayPath
- mergeMode
- changedLocalKeys
- violatingLocalKeys
- beforeEffectivePolicyHash
- afterEffectivePolicyHash
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = WARNING
repairBehavior:
- remove relaxing Local Overlay keys
- move unsupported local values outside CodeFleet
- update localPolicy.allowedLocalKeys only through Project Profile review
```

```text
ruleId: PROFILE_EFFECTIVE_POLICY_IS_DERIVED
status: FINAL
scope: POLICY
sourceOfTruth:
- Core Policy Defaults
- Project Profile policies
- Local Overlay
- Task Guardrails
- policy-affecting Run Options
inputs:
- Core Policy Defaults
- parsed Project Profile policies
- parsed Local Overlay when present
- Task Guardrails
- policy-affecting Run Options
- policy order tables
preconditions:
- Project Profile validation passed
- Task Guardrails are parsed
- Run Options are parsed
condition:
- effectivePolicy is computed by meet(Core Policy Defaults, Project Profile policies, Local Overlay restrictions, Task Guardrails, policy-affecting Run Options)
- effectivePolicy is a capability / risk / gate policy snapshot inside Run Plan
- effectivePolicy does not contain selected agentAdapter, selected Task Revision, retry reason, run request id, or non-policy run metadata
- effectivePolicy is not stored as an authoritative block inside .codefleet/config.json
- Project Profile values are not overwritten during effectivePolicy calculation
allowedEffect:
- Execution Harness may use effectivePolicy for capability gating
- Run Plan and Run Trace may record effectivePolicy hash or snapshot for evidence
deniedEffect:
- direct execution using unmerged Project Profile is blocked
- persisting effectivePolicy as Project Profile source of truth is blocked
evidence:
- inputPolicyHashes
- effectivePolicyHash
- mergeOrder
- policyOrderTablesVersion
failureFinding:
- category = POLICY_ENFORCEMENT_INTEGRITY
- severity = CORRUPTION
repairBehavior:
- rebuild effectivePolicy from source policies
- remove derived policy state from config.json if present
```

### 5.3 DESIGN CANDIDATE / VERSION_PLAN 분리

```text
DESIGN CANDIDATE:
- defaults 내부 enum 전체
- harness policy 내부 schema
- files policy 내부 glob schema
- commands policy 내부 command matcher schema
- risk policy 내부 rule schema
- verification policy 내부 preset schema
- redaction policy 내부 pattern/action schema
- carryForward policy 내부 audit/recheck 세부 기본값
- agentRoles 내부 role taxonomy
- profile rule id 세부 네이밍 체계
```

```text
VERSION_PLAN:
v0.1:
- 기존 config.json의 version / defaultAgent / mode / agents 형식을 유지한다.
- Project Profile 최종 schema와 직접 호환되지 않는다.

v0.2:
- schemaVersion, defaults, policies.harness, policies.files, policies.commands의 최소 subset을 도입한다.
- 기존 version / defaultAgent / mode / agents는 migration 대상으로 읽는다.

final:
- .codefleet/config.json은 Project Profile schemaVersion 기반 Workspace Policy Contract다.
- v0.1 legacy config 형식은 migration 없이 FINAL schema validation을 통과할 수 없다.
```

### 5.4 Profile이 담으면 안 되는 것

```text
- 비밀 정보
- 다른 프로젝트 목록
- 실행 로그 원문
- 중앙 run history
- 운영 서버 접속 정보
- 프로젝트 전체 지식 문서의 본문 전체
- 개인별 local path 강결합
```

긴 설명과 프로젝트 지식은 `config.json`에 몰아넣지 않고 context 파일로 분리한다. 이 항목은 `PROFILE_DOES_NOT_STORE_RUNTIME_OR_LOCAL_STATE`의 사람이 읽기 쉬운 요약이다.

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
= 실행 증거의 진실

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
- DONE이 reviewNotRequiredProgressionCondition을 만족하면 지나간다.
- Project Profile이 LOW risk autoAdvanceOnDone을 명시적으로 허용해도 DONE을 직접 지나가지 않는다.
- autoAdvanceOnDone 조건으로 SYSTEM_POLICY RUN_REVIEW_DECIDED(ACCEPTED)가 append되고 VERIFIED가 계산된 경우에만 지나간다.
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

`NEXT`, `ACTIVE`, `DONE`, `VERIFIED`는 approved Revision, Run Trace, durable Review Decision, Queue policy에서 계산할 수 있으므로 원본 진실로 저장하지 않는다. snapshot에는 표시할 수 있지만, 불일치가 생기면 재계산 결과가 우선한다.

여기서 "저장 가능한 상태"와 "계산해야 하는 상태"의 차이는 다음과 같다.

```text
저장 가능한 상태
= 정책상 허용된 actor가 명시적으로 결정하거나 외부 근거가 필요해서 파일/ledger에 기록해야 알 수 있는 상태

계산해야 하는 상태
= 이미 존재하는 Task Revision, Run Trace, durable Review Decision, Queue 순서를 보면 자동으로 판단할 수 있는 상태
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
= durable Review Decision을 보고 판단할 수 있음
= 정책상 허용된 actor가 해당 queue item 결과를 받아들였다는 증거에서 계산 가능
```

반대로 `SKIPPED`는 저장해야 한다.

```text
SKIPPED
= 정책상 허용된 actor가 이 queue item을 건너뛰기로 결정한 상태
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
- durable Review Decision을 보면 계산 가능
- 저장하지 않음
```

나쁜 상태 예시:

```text
objective.json: task-001 is DONE
task revision:  task-001 revision 1 is APPROVED
run/result:     task-001 failed
```

이런 상태가 생기면 무엇을 믿어야 할지 애매해진다. 따라서 Objective Queue에는 `DONE`이나 `VERIFIED`를 원본 진실로 저장하지 않고, approved Revision, Run Trace, durable Review Decision을 기준으로 계산한다.

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
- Objective snapshot은 ledger, Task Revision, Run Trace, durable Review Decision에서 재생성 가능해야 한다.
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
  "actorKind": "HUMAN",
  "actorId": "user",
  "at": "2026-05-29T10:30:00+09:00"
}
```

Ledger event 최소 세트는 owner별로 구분한다.

Task ledger events:

```text
Draft / Revision events
- TASK_DRAFT_UPDATED
- TASK_REVISION_CREATED

Approval events
- TASK_APPROVED
- TASK_APPROVAL_INVALIDATED
- TASK_REVISION_SUPERSEDED
```

Objective ledger events:

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

Review events
- RUN_REVIEW_DECIDED
```

Objective ledger는 제안 로그가 아니라 결정 로그다. Task ledger는 draft mutation, revision creation, approval decision을 append-only로 남기는 Task-level audit ledger다.

따라서 `TASK_RELATION_PROPOSED`는 ledger에 남기지 않는다. Proposed relation은 Draft Task 안의 제안일 뿐이며, 실행에는 사용할 수 없다. 정책상 허용된 actor가 review 단계에서 accept / approve / reject한 순간부터 ledger에 기록한다.

예시:

```yaml
objective:
  proposed:
    objectiveId: auth-error-response
    relation: CONTINUATION
    confidence: 0.82
    reason: "사용자가 이어서 에러 응답 통일 작업을 요청했고 열린 Objective가 일치함"
```

위 proposed relation은 Task Draft에만 존재한다. 정책상 허용된 actor가 수락하면 ledger에는 다음처럼 결정 이벤트가 남는다.

```json
{
  "eventId": "evt_20260529_103000_001",
  "seq": 12,
  "type": "TASK_RELATION_ACCEPTED",
  "objectiveId": "auth-error-response",
  "taskId": "task-signup-error-implementation",
  "taskRevision": 1,
  "relation": "CONTINUATION",
  "actorKind": "HUMAN",
  "actorId": "user",
  "at": "2026-05-29T10:30:00+09:00"
}
```

Ledger event 공통 필드:

```text
eventId
seq
type
actorKind
actorId
at
reason optional
```

`actorKind`는 decision gate의 `allowedActors`와 대조하는 권위 필드다. `actorId`는 감사 추적용 식별자다.

owner별 필수 식별자:

```text
Task ledger event
-> taskId

Objective ledger event
-> objectiveId
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

이 이벤트들은 Objective / Queue 결정이 아니라 실행 결과에 속한다. 실행 원본 증거의 진실은 Run Trace에 남긴다.

Approval event는 실행 이벤트가 아니다.

```text
TASK_APPROVED
= 특정 Task Revision content hash를 정책상 허용된 actor가 실행 가능하다고 승인한 decision event
= Task ledger event

TASK_APPROVAL_INVALIDATED
= 기존 approval decision을 append-only로 무효화하는 corrective decision event
= Task ledger event

TASK_REVISION_SUPERSEDED
= 새 Revision이 기존 Revision을 대체했음을 남기는 corrective decision event
= Task ledger event
```

이 이벤트들은 과거 Revision 파일이나 과거 approval event를 수정하지 않는다. 현재 approval state는 Task ledger의 approval decision event replay로 계산한다. Objective ledger는 approval state를 소유하지 않고, approved Revision을 Objective relation / queue decision의 대상으로 참조한다.

단, review decision event는 실행 이벤트가 아니다.

```text
RUN_REVIEW_DECIDED
= 정책상 허용된 actor가 특정 Run 결과를 보고 받아들였는지 결정한 Objective ledger event
= Queue progression을 계산하기 위한 durable decision
```

`RUN_REVIEW_DECIDED`는 decision audit을 위해 frozen evidence snapshot을 포함할 수 있다. 이 snapshot은 실행 결과의 원본 진실이 아니라, 정책상 허용된 actor가 결정을 내린 시점에 어떤 Run result / check를 보고 판단했는지 설명하는 audit context다.

따라서 Objective ledger는 여전히 `TASK_DONE`, `TASK_FAILED`, `TEST_PASSED`, `TEST_FAILED` 같은 실행 이벤트를 저장하지 않는다.

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

TASK_DRAFT_UPDATED
- taskId
- draftHash
- changedFields
- reason

TASK_REVISION_CREATED
- taskId
- taskRevision
- revisionHash
- sourceDraftHash

TASK_APPROVED
- taskId
- taskRevision
- revisionHash
- approvalTargetHash

TASK_APPROVAL_INVALIDATED
- taskId
- taskRevision
- revisionHash
- targetApprovalEventId
- reason

TASK_REVISION_SUPERSEDED
- taskId
- taskRevision
- revisionHash
- supersededByTaskRevision
- supersededByRevisionHash
- reason

RUN_REVIEW_DECIDED
- objectiveQueueItemId
- taskId
- taskRevision
- runId
- decision: ACCEPTED | REJECTED | NEEDS_CHANGES
- observedResultSnapshot
- observedCheckSnapshot
- verificationGateResult
- actorKind: HUMAN | SYSTEM_POLICY
- actorId
- reason
- decisionBasis
- policyRuleRefs optional
- evidenceRef optional
- evidenceHash optional
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
- TASK_APPROVED
- TASK_APPROVAL_INVALIDATED
- TASK_REVISION_SUPERSEDED
- RUN_REVIEW_DECIDED
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
= task-ledger.jsonl로 변경 이력을 남긴다.
= 실행 불가

Task Revision
= 실행 가능한 계약 단위
= 특정 시점의 Task Spec 내용
= approval decision, objective relation decision, run, summary가 참조하는 단위
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
= 유효한 approval decision이 있는 Task 계약의 특정 버전
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
- objective context snapshot / reference
- scope
- guardrails
- verification
- doneCriteria
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
Run은 실행 증거의 진실이다.
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

이 정의는 README 사용자 설명 반영 대상이다.

최종 파일 구조:

```text
.codefleet/tasks/
  <task-id>/
    task.json
    draft.yaml
    task-ledger.jsonl
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

task-ledger.jsonl
= draft가 언제, 왜, 어떻게 바뀌었는지 기록
= revision 생성, approval, invalidation, supersede decision 기록

revisions/<n>.yaml
= 특정 revision의 실행 계약
= intent, objective, scope, guardrails, verification, doneCriteria
= approval과 objective relation decision이 참조하는 immutable contract
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

`objectiveId`와 `objectiveQueueItemId`는 Run Trace 안에서는 실행 당시 snapshot이다. Objective relation과 queue binding의 권위는 Objective ledger에 있다. Task Revision은 Objective context snapshot / reference를 가질 수 있지만 Objective relation state를 소유하지 않는다. validate는 Run Trace의 snapshot이 Objective ledger의 권위 상태와 충돌하지 않는지 확인한다.

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
- revision별 immutable contract
- approval / relation decision이 참조하는 revision hash

objective ledger
- 어떤 revision이 Objective에 붙었는지
- 어떤 relation이 accepted / approved / invalidated 됐는지
- 어떤 approval / invalidation / supersede decision이 현재 유효한지

runs/<run-id>/result.json
- 어떤 taskId / taskRevision을 실행했는지
- 실행 결과가 무엇인지
```

꼬임 방지 규칙:

```text
- Task ID는 논리적 작업 단위로 유지한다.
- Task Draft는 수정 가능하지만 task-ledger로 변경 이력을 남긴다.
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
Draft는 수정 가능하지만 Task ledger에 변경 이력을 남긴다.
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

최종 정의:

```text
Task Spec
= Approval Decision과 Run Planning이 공유하는 실행 계약 source

Task Draft
= mutable contract candidate
= unresolved field 허용
= proposed Objective context 허용
= 실행 불가

Task Revision
= immutable execution contract
= unresolved field 금지
= approval state / Objective relation state를 직접 소유하지 않음
= Run Plan의 primary source input
```

Task Spec은 `Source / Evidence / Decision / Derived` 경계를 섞지 않는다.

```text
Task Spec
= Source

Run Plan / effectivePolicy / computedRisk
= Derived

Run Trace / stdout / stderr / diff / result.json
= Evidence

Approval / Review Decision / Objective relation decision
= Decision

DONE / VERIFIED / NEXT
= Derived State
```

즉 Task Spec은 다음 계층이 함께 사용하는 기준이다.

```text
Draft Harness
= 사용자의 Intent를 Task Draft로 구조화할 때 사용하는 출력 모델

Approval Decision
= 정책상 허용된 actor가 실행 가능한 작업인지 검토하고 승인하는 계약

Execution Harness
= 승인된 Task를 Project Profile과 병합해 실행 조건으로 바꾸는 입력

Run Trace
= 실제 실행이 Task 계약을 지켰는지 확인하는 기준
```

Task Spec의 1차 필드에는 다음 항목을 포함한다.

```text
intent
objectiveContext
agentRole
harnessMode
scope
guardrails
requiredGates
workflow
verification
doneCriteria
riskSignals
needsReview
unresolvedRequiredFields
```

이 필드는 v0.2 편의를 위한 임시 구조가 아니라 최종 모델의 핵심 필드다.

`objectiveContext` 필드는 Task가 어떤 Objective와 관련 있는지 설명하는 context-only snapshot이다. Draft 단계에서는 proposed Objective context일 수 있고, Task Review 단계에서 사람이 이를 수정할 수 있다. 그러나 Objective relation state, queue position, accepted / approved state, NEXT 여부의 권위는 `objectiveContext`가 아니라 Objective ledger에 있다.

`objectiveContext` allowed fields:

```text
objectiveId
relationIntent
rationale
source
```

`objectiveContext` forbidden fields:

```text
relationState
queuePosition
objectiveQueueItemId
acceptedAt
approvedAt
NEXT / ACTIVE / DONE / VERIFIED 같은 derived state
```

Task Revision의 `objectiveContext`는 Objective relation을 소유하지 않는다. Objective ledger의 relation / queue decision이 `taskId + taskRevision + revisionHash`를 참조하고, Task Revision은 사람이 계약을 이해할 수 있는 context만 가진다.

`verification.commands`는 Task가 기대하는 검증 후보 / 요구를 나타낸다. `verification.commands`는 명령 실행 권한이 아니다. 실제 명령 실행은 Project Profile `policies.commands`, effectivePolicy, Run Plan verificationPlan을 통과해야 한다.

Task Spec 최소 schema:

```yaml
schemaVersion: "1.0"
documentKind: "TASK_DRAFT | TASK_REVISION"
taskId: "task-auth-error-response"
taskRevision: 1 # TASK_REVISION only

intent:
  summary: ""
  userRequest: ""
  constraints: []

objectiveContext:
  objectiveId: ""
  relationIntent: "START | CONTINUATION"
  rationale: ""
  source: "USER | DRAFT_HARNESS | REVIEW"

agentRole: "BACKEND_IMPLEMENTER"
harnessMode: "WORKSPACE_EDIT"

scope:
  targetPaths: []
  excludedPaths: []
  components: []
  notes: ""

guardrails:
  doNotTouch: []
  additionalRestrictions: []
  commandRestrictions: []

requiredGates:
  runApproval:
    required: false
    allowedActors: []
    explicit: false
  resultReview:
    required: true
    allowedActors: ["SYSTEM_POLICY", "HUMAN"]
    explicit: false
  verification:
    required: true
    waiver:
      allowed: false
      allowedActors: []
      explicit: true

workflow:
  stages: ["PLAN", "INSPECT", "APPLY", "VERIFY", "REVIEW"]

verification:
  commands: []
  manualChecks: []
  expectedEvidence: []

doneCriteria:
  - ""

riskSignals:
  - ""

needsReview: []              # TASK_DRAFT only
unresolvedRequiredFields: [] # TASK_DRAFT only
```

Task Draft-only fields:

```text
- needsReview
- unresolvedRequiredFields
- REQUIRE_EXPLICIT values
- proposed Objective context
- discovery notes / uncertainty notes
```

Task Revision required fields:

```text
- schemaVersion
- documentKind = TASK_REVISION
- taskId
- taskRevision
- intent
- objectiveContext snapshot / reference
- concrete agentRole
- concrete harnessMode
- scope
- guardrails
- concrete requiredGates
- concrete workflow.stages
- verification
- doneCriteria
- riskSignals
- contentHash
```

Task Revision forbidden fields:

```text
- REQUIRE_EXPLICIT
- unresolvedRequiredFields
- blocking needsReview
- approval state
- current Objective relation state
- queue position authority
- selectedAgentAdapter
- adapter command path
- provider model name
- provider-specific CLI option
- transcript parsing rule
- Run Plan
- effectivePolicy
- computedRisk
- stdout / stderr / diff
- result.json
- Review Decision
- DONE / VERIFIED / NEXT 같은 derived state
```

Task Draft -> Task Revision 승격 조건:

```text
- schema valid
- taskId 있음
- intent 있음
- concrete agentRole
- concrete harnessMode
- concrete requiredGates
- concrete workflow.stages
- scope 있음
- guardrails 있음
- verification 있음
- doneCriteria 있음
- riskSignals 고정
- unresolvedRequiredFields 없음
- blocking needsReview 없음
- provider-specific 실행 설정 없음
- canonical revision hash 계산 가능
```

boundary rules:

```text
1. Task Revision may reference Objective context, but does not own Objective relation state.
2. Objective ledger owns relation and queue decisions.
3. Task Revision content hash is the target of approval.
4. Approval is a ledger decision event, not mutable state inside the revision file.
5. scope and guardrails restrict the task contract, but do not widen Project Profile policy.
6. verification.commands is an execution request / expectation, not a command permission grant.
7. riskSignals are recorded inputs for deterministic risk calculation; computedRisk is not stored as Task Spec source.
```

Task Spec에 넣지 않는 실행 산출물 / 결정 / 파생값은 다음 위치에 둔다.

```text
Approval
= approval decision event

Review
= review decision event

Run
= Run Trace

computedRisk / effectivePolicy / verificationPlan
= Run Plan
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

Task Review 흐름은 VERSION_PLAN이다.

권장 흐름:

```text
User Intent
  -> Objective Selection / Creation
  -> Draft Harness
  -> AI-generated Task Draft
  -> Review / Approval Decision
  -> Execution Harness
  -> Agent Adapter
  -> Run Trace
  -> Run Summary
```

핵심 원칙:

> AI may draft tasks, but executable tasks require an approval decision by a policy-authorized actor.

한국어:

> AI는 Task 초안을 작성할 수 있지만, 실행 가능한 Task가 되려면 정책상 허용된 actor의 approval decision이 필요하다.

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
  -> Task ledger에 Revision approval 기록
  -> Objective ledger의 accepted 또는 approved Objective relation decision 확인

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
- Task Draft는 수정 가능하지만 task-ledger에 변경 이력을 남긴다.
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

현재 상태:

```text
FINAL RULE:
- 사용자 자연어 요청은 바로 Agent에게 전달하지 않는다.
- Draft Harness는 read-only bounded discovery만 수행한다.
- Execution Harness는 approved Revision만 실행한다.
- Harness는 effectivePolicy를 기준으로 Agent에게 전달할 권한을 제한한다.

DESIGN CANDIDATE:
- Sandbox-level Harness 구현 방식
- Command-policy Harness 구현 방식
- agent adapter별 호출 프로토콜
```

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

Bounded discovery budget:

```text
discoveryBudget:
- maxFilesListed
- maxFilesRead
- maxBytesRead
- allowedPathGlobs
- deniedPathGlobs
- allowedFileKinds
- deniedFileKinds
- maxDepth
```

Draft Harness read 허용 조건:

```text
1. path가 Workspace Root 내부에 있음
2. path가 deniedPathGlobs와 매칭되지 않음
3. path가 allowedPathGlobs 중 하나와 매칭됨
4. fileKind가 deniedFileKinds에 포함되지 않음
5. filesRead + 1 <= maxFilesRead
6. bytesRead + fileSize <= maxBytesRead
7. discovery reason이 Task Draft에 기록됨
```

Draft Harness read 금지 조건:

```text
- .env, secret, key, credential pattern match
- Workspace Root 밖의 파일
- Project Profile deniedPathGlobs
- binary file unless allowedFileKinds에 명시
- maxFilesRead / maxBytesRead / maxDepth 초과
```

Budget 초과 효과:

```text
- 추가 read 중단
- Task Draft needsReview에 DISCOVERY_BUDGET_EXCEEDED 기록
- scope를 확정하지 않고 후보로 표시
- Execution Harness로 전환하지 않음
```

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
  -> Approval Decision
  -> Execution Harness
     - approved Revision 실행
     - 수정/검증/로그 수집
  -> Run Trace
```

### 8.2 Execution Harness

Execution Harness는 유효한 approval decision이 있는 Task Revision만 실행한다.

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

이 절은 VERSION_PLAN이다. Harness의 최종 책임은 고정하지만, enforcement 수준은 버전별로 나눠 구현한다.

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

v0.x Harness:

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

final Harness:

```text
- Sandbox-level Harness
- Command-policy Harness
- Profile 기반 command allowlist
- 실행 중 command deny enforcement
```

## 8.4 Safe Orchestration

CodeFleet이 말하는 "안전한 오케스트레이션"은 AI가 실수하지 않도록 보장한다는 뜻이 아니다. AI가 실수할 수 있다는 전제 위에서, 실수의 범위와 영향을 제한하고 검토 가능한 기록을 남기는 운영 구조를 뜻한다.

최종 정의:

> 안전한 오케스트레이션이란 사용자의 의도를 명시적 Objective와 Task로 구조화하고, 정책상 허용된 actor가 Task revision을 승인하고 Objective relation을 수락 또는 승인한 뒤, Workspace 정책과 Harness가 허용한 권한 안에서만 AI Agent가 작업하게 하며, 모든 실행 결과를 검증 가능하고 되돌릴 수 있고 감사 가능한 기록으로 남기는 것이다.

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
  -> Approval Decision creates Task Revision
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

2. Approval Decision
   AI가 만든 Task Draft는 정책상 허용된 actor의 approval decision이 있어야 실행 가능하다.
   Objective relation은 review에서 accepted 또는 approved 상태여야 실행 가능하다.

3. Non-relaxable Workspace Policy
   Project Profile 정책은 Task가 완화할 수 없다.
   더 엄격해지는 것만 허용한다.

4. Least Privilege
   Agent는 필요한 최소 read/write/command 권한만 가진다.

5. Isolation
   Execution Harness는 isolationMode를 기록한다.
   isolationMode는 NONE / GIT_WORKTREE / TEMP_WORKSPACE / CONTAINER 중 하나다.
   파일 수정 또는 명령 실행이 있는 Run에서 isolationMode == NONE이면 reason이 필수이며 riskLevel은 LOW가 될 수 없다.

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
Core Policy Defaults
  -> Project Profile policies
  -> Local Overlay restrictions
  -> Task guardrails
  -> policy-affecting Run options
```

하지만 권한은 넓어지면 안 된다.

핵심 원칙:

```text
More restrictive wins.
```

정책 병합은 deterministic meet operation이다.

```text
effectivePolicy =
  meet(Core Policy Defaults, Project Profile policies, Local Overlay restrictions, Task guardrails, policy-affecting Run options)
```

권한 수준은 순서를 가진다.

```text
modeOrder:
DRY_RUN < SUGGEST_ONLY < WORKSPACE_EDIT < COMMAND_EXEC

boolean permission:
false < true

autoAdvanceOnDone:
Project Profile absent -> false
Project Profile explicit true -> candidate true
restrict-only sources can only lower true to false

DecisionGate.required:
false < true

DecisionGate.explicit:
false < true

DecisionGate.allowedActors:
required=true source들의 intersection

EvidenceGate.required:
false < true

EvidenceGate.waiver.allowed:
true < false

EvidenceGate.waiver.explicit:
false < true

EvidenceGate.waiver.allowedActors:
waiver.allowed=true source들의 intersection

BLOCKED_UNTIL_POLICY:
defaults / policy merge 값이 아니라 Run Planning에서 계산되는 derived planning block result
```

병합 규칙:

```text
- mode는 더 제한적인 값을 선택한다.
- allowFileEdit / allowCommandExecution 같은 boolean permission은 false가 이긴다.
- allowedPaths는 교집합을 선택한다.
- deniedPaths는 합집합을 선택한다.
- allowedCommands는 교집합을 선택한다.
- deniedCommands는 합집합을 선택한다.
- verificationCommands는 profile required commands + task required commands의 합집합이다.
- requiredGates는 DecisionGate / EvidenceGate field별 병합 규칙으로 더 엄격한 object를 계산한다.
- autoAdvanceOnDone은 Project Profile candidate 값을 먼저 정한 뒤 restrict-only source가 true를 false로 낮출 수 있다.
```

병합 실패 조건:

```text
- allowedPaths 교집합이 비어 있는데 파일 수정이 필요한 Task
- allowedCommands 교집합이 비어 있는데 명령 실행이 필요한 Task
- Task가 Profile deniedPaths 안의 파일 수정을 요구
- Task가 Profile deniedCommands 안의 명령 실행을 요구
- Run option이 Project Profile보다 권한을 넓힘
```

병합 실패 효과:

```text
- Execution Harness 실행 금지
- Task Review에서 policy conflict로 표시
- finding.category = POLICY_ENFORCEMENT_INTEGRITY
- finding.severity = WARNING 또는 CORRUPTION 중 rule definition이 선언한 값
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

Sanitized Run Summary 최소 필드:

```text
summaryId
runId
taskId
taskRevision
objectiveId
objectiveQueueItemId
agentRole
harnessMode
riskLevel
resultStatus
changedFiles
verificationResults
reviewStatus
decisions
nextActions
redactionReport
sourceTracePath
sourceTraceHash
```

Sanitization rule:

```text
input:
- Run Trace files
- Project Profile redaction policy
- Core secret patterns

output:
- Sanitized Run Summary
- redactionReport
```

금지 규칙:

```text
- stdout.log / stderr.log 원문 전체 포함 금지
- git-diff.patch 원문 전체 포함 금지
- env dump 포함 금지
- secret pattern match 원문 포함 금지
- token / password / private key / session cookie 포함 금지
- 내부 운영 URL은 Profile allowPublicUrlExport == true가 아니면 포함 금지
- 로컬 절대 경로는 Profile allowLocalPathExport == true가 아니면 상대 경로로 변환
```

redactionReport 최소 필드:

```text
- ruleId
- sourceFile
- matchKind
- action: REDACTED | DROPPED | RELATIVIZED | HASHED
- count
```

Sanitization 통과 조건:

```text
1. 모든 forbidden pattern match가 redactionReport에 기록됨
2. summary body에 forbidden pattern이 남아 있지 않음
3. sourceTraceHash가 기록됨
4. changedFiles는 workspace-relative path만 포함
5. verificationResults는 command, exitCode, passed 여부만 포함하고 raw output은 포함하지 않음
```

Sanitization 실패 효과:

```text
- Run Summary export 금지
- CarryForward SUMMARY ATTACH 금지
- finding.category = EXECUTION_EVIDENCE_INTEGRITY
- finding.severity = WARNING 또는 CORRUPTION은 sanitizer rule definition이 결정
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

현재 상태:

```text
DESIGN CANDIDATE:
- 아래 AgentRole 목록은 초기 후보이며 FINAL RULE이 아니다.

FINAL RULE:
- Task Revision은 agentRole을 명시해야 한다.
- agentRole은 Project Profile의 allowedAgentRoles 안에 있어야 한다.
- agentRole별 권한은 Project Profile과 Task guardrails 병합 결과를 넘을 수 없다.
```

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

현재 상태:

```text
FINAL RULE:
- Guardrail은 effectivePolicy보다 권한을 넓힐 수 없다.
- deniedPaths / deniedCommands는 allow 규칙보다 우선한다.
- destructive command는 기본 차단이며 explicit approval 없이 실행할 수 없다.

DESIGN CANDIDATE:
- 아래 위험 요소와 작업 모드 목록은 초기 후보이며 최종 taxonomy는 Project Profile schema 논의에서 확정한다.
```

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
```

Approval gate 후보:

```text
APPROVAL_REQUIRED
- 위험 명령은 approval decision 필요
```

VERSION_PLAN:

```text
v0.x:
- DRY_RUN과 SUGGEST_ONLY만 기본 실행 모드로 둔다.

final:
- WORKSPACE_EDIT / COMMAND_EXEC는 Project Profile policy와 approval gate를 통과한 경우에만 허용한다.
```

## 13. Verification

Verification은 "AI가 했다"가 아니라 "검증까지 추적했다"를 만들기 위한 개념이다.

현재 상태:

```text
FINAL RULE:
- Verification result는 Run Trace에 남는다.
- required verification이 실패하면 Run-derived State는 DONE 또는 VERIFIED가 될 수 없다.
- command를 실제로 실행하지 않은 경우 result는 PASSED가 아니라 NOT_RUN이다.

DESIGN CANDIDATE:
- 아래 command 목록은 도메인별 기본 후보이며 최종 allowlist는 Project Profile schema 논의에서 확정한다.
```

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

Verification 실행 방식은 VERSION_PLAN이다.

```text
v0.x:
- prompt에 검증 지시를 포함하고, 실행 여부는 Run Trace에 NOT_RUN / PASSED / FAILED로 기록한다.

final:
- Harness가 Project Profile allowlist 안의 verification command를 직접 실행하고, command / exitCode / passed / log path를 Run Trace에 기록한다.
```

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
- 확정 규칙은 구체적 / 결정론적 / 전제 / 증거 기준을 만족해야 한다는 문서 작성 기준
- Risk max-severity 계산과 risk lowering 제한 규칙
- Carry-forward discard / rejected event / risk recheck 조건
- Policy 병합의 deterministic meet operation 원칙
- Safe Orchestration isolationMode 기록과 NONE일 때 risk 제한
- Run Summary sanitization boundary와 export 차단 규칙
- Project Profile top-level 구조와 policy block 구조
- Project Profile에는 project block이 정확히 하나만 존재한다는 원칙
- project는 논리적 제품 / 시스템 identity이고 직접 권한을 부여하지 않는다는 원칙
- workspace는 하나의 로컬 repo/root 경계이며 workspace.id / components / sharedPaths로 표현한다는 원칙
- workspaceRoot와 path normalization은 config 필드가 아니라 Core invariant라는 원칙
- monorepo는 components로, multirepo는 같은 project.id를 공유하는 여러 Project Profile로 표현한다는 원칙
- 최종 모델의 정책 / 계약 계층 6단계
- 최종 모델의 실행 생명주기 10단계
- Source of Truth / Derived Artifact / Evidence Truth / Decision Record 경계
- Draft만 mutable이고 Revision / Run Trace는 직접 수정하지 않는다는 꼬임 방지 원칙
- Local Overlay는 .codefleet/local.json이며 RESTRICT_ONLY로만 병합된다는 원칙
- defaults.task.workflow는 PLAN / INSPECT / APPLY / VERIFY / REVIEW 절차 템플릿이며 권한 / gate / RunSummary.type / Execution Lifecycle을 대체하지 않는다는 원칙
```

다음으로 논의할 항목:

```text
1. Project Profile defaults block 세부 스키마
   - defaults.run.isolationMode

2. Project Profile policy block 세부 스키마
   - harness policy
   - agentAdapters policy
   - files policy
   - commands policy
   - risk policy
   - verification policy
   - redaction policy
   - carryForward policy
   - agentRoles policy

3. Harness enforcement 상세 정의
   - Draft Harness discovery budget 기본값
   - Execution Harness isolationMode
   - Command-policy Harness
   - Sandbox-level Harness

4. AgentRole / Guardrail taxonomy
   - allowedAgentRoles
   - role별 기본 권한
   - destructive command taxonomy

5. Verification 실행 정책
   - prompt-only
   - manual command suggestion
   - allowlist 기반 자동 실행
   - NOT_RUN / PASSED / FAILED 기록 형식

6. Run Summary export adapter
   - summary.md 자동 생성
   - adapter별 필드 제한
   - redactionReport 출력 형식

7. Workspace discovery
   - 현재 cwd 기준
   - 부모 디렉터리 탐색
   - 명시적 --workspace 옵션

8. Review 모델
   - AI review.md
   - human review note
   - approval 기록
```

## 16. 다음 세션에서 이어갈 때

다른 컴퓨터나 새 세션에서 이어갈 때는 다음 순서로 보면 된다.

```text
1. 이 문서 전체를 읽는다.
2. docs/session-handoff.md를 읽고 현재 진행도와 다음 논의 주제를 확인한다.
3. docs/architecture.md는 현재 구현 구조 참고용으로 본다.
4. README는 사용자용 현재 사용법 참고용으로 본다.
5. 구현을 바로 하지 말고 최종 목표와 목표 경계를 먼저 확인한다.
6. 현재 논의 상태를 보고 다음 미해결 항목부터 이어간다.
7. 개념 합의 후 v0.2 구현 범위를 작게 자른다.
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
