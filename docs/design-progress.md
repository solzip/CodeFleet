# CodeFleet Design Progress

Last updated: 2026-08-07

이 문서는 CodeFleet 설계가 어떤 순서로 확정됐고 지금 어디를 진행 중인지 기록한다.

문서 역할 구분:

```text
docs/concept-foundation.md   확정된 설계 내용 자체 (정본)
docs/design-progress.md      확정 순서와 현재 위치 (이 문서)
docs/session-handoff.md      다음 세션이 이어받을 최소 상태
README.md                    현재 구현 사용법
```

이 문서는 설계 *내용*을 담지 않는다. 규칙 본문은 항상 `docs/concept-foundation.md`가 정본이다.

## 진행 요약

```text
Phase 0-9    완료      76단계
Phase 10     진행 중   5단계 중 2단계 완료, 남은 설계 3단계 (전부 문법 계층)
Phase 11     대기      설계 확정 후 구현 재개
```

```text
전체 84단계 중 78단계 완료
FINAL RULE 73개
설계 진행도: 약 91%
구현 진행도: 약 25-35%
```

방침:

```text
설계를 먼저 모두 확정한 뒤 구현을 순차적으로 재개한다.
```

---

## Phase 0. 씨앗

```text
[x] 1. v0.1 CLI seed 구현
[x] 2. concept foundation 최초 캡처
```

## Phase 1. 목표 경계 확정

```text
[x]  3. Harness intent transformation
[x]  4. Safe Orchestration 모델
[x]  5. Draft Harness bounded discovery
[x]  6. 최종 workflow 설계 원칙
[x]  7. Task review / approval 흐름
[x]  8. Objective 연속성 모델
[x]  9. OMX 레퍼런스와의 차이 규정
[x] 10. Objective Queue 설계 체크포인트
[x] 11. Objective relation review 상태
[x] 12. Objective Queue cursor
[x] 13. Objective Queue derived states
[x] 14. 최종 목표 경계 FREEZE
```

14번이 이후 모든 논의의 기준선이다. 이 시점부터 설계 확장은 목표를 넓히는 방향이 아니라 목표를 구현하는 내부 구조 방향으로만 진행한다.

## Phase 2. Mutation Engine 위치와 ledger 기반

```text
[x] 15. Mutation Engine 역할
[x] 16. Mutation command 범위와 lock scope
[x] 17. 보수적 queue reorder semantics
[x] 18. Objective ledger event 모델
[x] 19. Mutation rebuild / validate 흐름
[x] 20. Transition validation 도메인 7개 확정
```

## Phase 3. 7개 State 도메인 규칙

```text
[x] 21. 도메인 규칙 작성 계획
[x] 22. Objective State 전이
[x] 23. Queue Item State 전이
[x] 24. Task Relation State 전이
[x] 25. Task Revision lineage
[x] 26. 멱등 mutation 안전 규칙
[x] 27. Task Draft / immutable Revision 분리
[x] 28. Draft / Revision / Run 정의
[x] 29. Task Draft·Revision State
[x] 30. Run-derived State
[x] 31. Risk policy ownership
[x] 32. DONE / VERIFIED / queue progression 정리
[x] 33. Carry-forward State
```

## Phase 4. Corruption / Repair 모델

```text
[x] 34. Corruption invariant check
[x] 35. Severity capability gating
[x] 36. Finding category taxonomy
[x] 37. CORRUPTED 상태와 capability gating 정합
[x] 38. Invariant Core / Extensible Layer
[x] 39. Scoped CorruptionMarker 모델
[x] 40. RepairKind / RepairMode taxonomy
[x] 41. Rebuild repair 전제조건
[x] 42. Corrective event effective state
[x] 43. 확정 규칙 작성 기준
```

43번 이후의 모든 FINAL RULE은 sourceOfTruth / inputs / preconditions / condition / allowedEffect / deniedEffect / evidence 형식을 따른다.

## Phase 5. 문서 기준 정비

```text
[x] 44. 전 구간 FINAL RULE 기준 재보강
[x] 45. session-handoff 도입
```

## Phase 6. Project Profile / 최종 모델 계층

```text
[x] 46. Project Profile 구조
[x] 47. Profile / Workspace 모델 분리
[x] 48. 최종 모델 실행 계층 10단계
[x] 49. Run Plan과 effective policy 분리
[x] 50. Explicit defaults selection
[x] 51. 최종 모델 아키텍처 스냅샷
[x] 52. Gate 결정 정합
[x] 53. Lifecycle 다이어그램
[x] 54. Task workflow defaults
[x] 55. Agent Adapter selection 모델
[x] 56. 아키텍처 다이어그램 (spine / structure)
[x] 57. 개념 모델 자체 리뷰
```

## Phase 7. S1-S5 시임 계약

```text
[x] 58. Task Spec + Review Decision authority        (S1 / S4)
[x] 59. Actor-neutral required gates
[x] 60. Auto progression policy
[x] 61. S2 Adapter seam 최종 계약
[x] 62. Adapter path policy + v0.2 slice
[x] 63. S4 Review Decision 계약
[x] 64. Goal loop artifact 계약
[x] 65. Manual SPINE 검증 흐름
[x] 66. S5 Export seam + Profile policy
[x] 67. Harness enforcement + AgentRole / Guardrail
[x] 68. S3 Verification 실행 정책
```

## Phase 8. Workspace / 버전 슬라이싱

```text
[x] 69. Workspace discovery 계약
[x] 70. v0.1 / v0.2 / final implementation slicing
```

## Phase 9. 리뷰 마이그레이션 / ledger replay / Mutation 계약

```text
[x] 71. [구현] run-plan.json + S2 아티팩트 분리
[x] 72. 코드 검증된 프로젝트 개요 문서
[x] 73. [구현] run-summary normalization + VerificationEvidence
[x] 74. Local review 마이그레이션 + Objective ledger replay 모델
[x] 75. Mutation Engine minimum contract
[x] 76. README 고정 범위 정합
```

---

## Phase 10. 남은 문법 계층 (현재 위치)

```text
[x] 77. Verification command allowlist / commands policy matcher 문법
        - command normalization (argv only, shell 경유 금지)
        - matcher (argv prefix / exact, 정규식·glob 없음, case 비대칭)
        - destructive command categoryId 승인 단위
[x] 78. Run Summary export adapter별 field allowlist schema
        - exposure tier (PUBLIC / INTERNAL_SHARED / LOCAL_PRIVATE) + target 선언
        - leaf field path, 와일드카드 없음
        - 미지 필드 DROP + SCHEMA_UNKNOWN_FIELD 기록
[ ] 79. files policy glob matcher 문법                                  <- 다음, 미착수
[ ] 80. 나머지 DESIGN CANDIDATE 문법 항목
        - risk policy rule expression
        - redaction policy pattern language
        - agentRoles 내부 role taxonomy
        - profile rule id 네이밍 체계
[ ] 81. 0.13 상태 목록 최종 재감사
```

논의 순서 이유:

```text
- 77은 Verification allowlist와 files glob matcher가 공유하는 기반이라 먼저 고정했다.
- 78은 S5 경계가 이미 고정돼 있어 matcher 문법과 독립적으로 먼저 끝냈다.
- 79는 77이 정한 결정론 기준과 case 비대칭 원칙을 그대로 이어받는다.
- 80은 위 항목들이 고정된 뒤 같은 형식을 따라간다.
```

남은 설계의 성격:

```text
Phase 1-9는 "무엇이 진실인가"를 정했다.
Phase 10은 "그 판정을 어떤 표기로 쓰는가"를 정한다.
구조, 경계, 권한은 이미 끝났고 남은 것은 표기 계층이다.
```

## Phase 11. 구현 재개 (설계 확정 후)

```text
[ ] 82. codefleet review (v0.2 local review)   <- 유일하게 남은 v0.2 구현 슬라이스
[ ] 83. SPINE 한 바퀴 수동 검증
[ ] 84. 이후 final 슬라이스
```

82번의 상세 슬라이스는 `docs/session-handoff.md`의 held implementation slice에 있다.

---

## 이 문서 갱신 규칙

```text
- 설계 항목을 하나 확정하면 해당 줄을 [x]로 바꾸고 Phase 요약과 진행도를 함께 갱신한다.
- [x] 항목의 번호는 바꾸지 않는다. 완료 번호는 커밋 메시지와 논의 기록이 참조하는 고정 식별자다.
- 아직 [ ]인 항목은 새 항목이 끼어들 때 다시 매길 수 있다. 다시 매기면 그 Phase 전체를 한 번에 정리한다.
- 이 문서는 확정 순서만 기록한다. 규칙 본문을 여기에 복사하지 않는다.
- concept-foundation.md의 0.13 상태 목록과 15절 다음 논의 항목을 함께 갱신한다.
```

마지막 항목이 중요하다. `0.13` 상태 목록은 뒤쪽 절에서 FINAL RULE이 추가되는 동안 갱신되지 않아 한 차례 낡은 상태로 남았고, 이미 고정된 항목 3개를 미고정으로 계속 표시했다. 진행 상태를 여러 곳에 나눠 적는 이상 함께 갱신하지 않으면 같은 문제가 반복된다.
