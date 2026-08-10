# CodeFleet Design Progress

Last updated: 2026-08-07

이 문서는 CodeFleet 설계가 어떤 순서로 확정됐고 지금 어디를 진행 중인지 기록한다.

문서 역할 구분:

```text
docs/concept-foundation.md   확정된 설계 내용 자체 (정본)
docs/design-progress.md      확정 순서와 현재 위치 (이 문서)
docs/session-handoff.md      다음 세션이 이어받을 최소 상태
docs/spine-pass-*.md         SPINE 한 바퀴 검증 기록 (날짜별)
docs/implementation-audit-*.md  규칙 대 코드 대조 기록 (날짜별)
README.md                    현재 구현 사용법
```

이 문서는 설계 *내용*을 담지 않는다. 규칙 본문은 항상 `docs/concept-foundation.md`가 정본이다.

## 진행 요약

```text
Phase 0-9    완료      76단계
Phase 10     완료      8단계 전부 완료
Phase 11     대기      설계 확정 후 구현 재개
```

```text
전체 93단계 중 90단계 완료
FINAL RULE 82개
설계 진행도: 100% (미고정 항목 없음)
구현 진행도: 약 60-70%
```

방침:

```text
설계를 먼저 모두 확정한 뒤 구현을 순차적으로 재개한다.
설계는 84번에서 완료됐다. 이제 Phase 11 구현으로 넘어간다.
```

최종 검증 결과:

```text
FINAL RULE            82개
YAML 파싱 실패        0
필수 섹션 누락        0
id 형식 위반          0
id 중복               0
status != FINAL       0
taxonomy 밖 category  0
taxonomy 밖 severity  0
DESIGN CANDIDATE      0
NOT_FINAL_YET         0
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

## Phase 10. 남은 문법 계층 (완료)

```text
[x] 77. Verification command allowlist / commands policy matcher 문법
        - command normalization (argv only, shell 경유 금지)
        - matcher (argv prefix / exact, 정규식·glob 없음, case 비대칭)
        - destructive command categoryId 승인 단위
[x] 78. Run Summary export adapter별 field allowlist schema
        - exposure tier (PUBLIC / INTERNAL_SHARED / LOCAL_PRIVATE) + target 선언
        - leaf field path, 와일드카드 없음
        - 미지 필드 DROP + SCHEMA_UNKNOWN_FIELD 기록
[x] 79. files policy glob matcher 문법
        - literal / 단일 세그먼트 * / 전체 세그먼트 ** 만 허용
        - 전체 경로 매칭, 암묵적 서브트리 없음, dir/** 는 dir 자체 미매칭
        - 부정 금지, case는 기존 canonical key 규칙 그대로
[x] 80. redaction policy pattern language
        - 선형 시간 정규식 부분집합 (역참조 / 룩어라운드 금지)
        - action 강도 순서 DROPPED > REDACTED > HASHED > RELATIVIZED
        - 잘못된 rule은 건너뛰지 않고 export 차단
[x] 81. risk policy rule expression 문법
        - matchTarget이 기존 matcher 3종 + 선언적 predicate 중 선택, 새 언어 없음
        - AND는 평면 allOf / OR은 rule 분리 / NOT은 표현 불가
        - UNKNOWN은 HIGH가 아니라 severity 축 밖의 미해결 상태 (기존 모순 해소)
[x] 82. agentRoles 내부 role taxonomy
        - forbiddenByDefault 산문을 defaultMaxMode / deniedCommandCategories / roleGuidance로 분해
        - 전역 Guardrail·harnessMode가 이미 소유한 제약은 role에서 제거
        - role 단위 금지 목록은 diagnosticOnly 파생 read model로
[x] 83. profile rule id 네이밍 체계
        - 형식 [A-Z][A-Z0-9_]* (81/81 이미 준수)
        - Core + Profile 합친 id 공간에서 전역 유일
        - 출처는 접두사가 아니라 definedByRef path/hash로 기록
        - id는 영구 식별자, 재사용 금지
[x] 84. 정합성 최종 재감사
        - dangling categoryId 정의 (Core destructive category 7종)
        - definedByRef를 redaction / risk / destructive entry 스키마에 반영
        - authority 3종이 서로 다른 enum임을 명시
        - 규칙 블록 fence 통일 후 82개 전부 YAML 파싱 검증
```

79번 직후 정합성 감사에서 결함 5건을 찾았고 3건을 즉시 고쳤다.

```text
고침: SanitizedRunSummary에 없는 redactionSummary 경로를 tier가 참조하던 문제
고침: Project Profile에 export 블록이 없는데 Profile 제한 권한을 주장하던 문제
고침: FINAL RULE 4개가 preconditions / allowedEffect / evidence를 빠뜨린 문제
남김: authority 동명 enum 3종 구분 미표기        -> 84번
남김: 규칙 블록 fence 표기 불일치                -> 84번
```

81번에서 모순 1건, 84번에서 결함 2건을 추가로 찾아 고쳤다.

```text
고침: UNKNOWN risk를 0.8은 HIGH로 접고 병합 규칙은 severity 축 밖이라고 해
      정면으로 상충하던 문제. computedRisk enum과 gate 조건 세 곳이
      모두 별도 상태 편이라 0.8을 수정했다.
고침: 82번이 role에서 참조한 categoryId 5종이 어디에도 정의돼 있지 않던 문제.
      Core destructive category 7종을 정의했다.
고침: 83번의 definedByRef가 규칙에만 있고 실제 entry 스키마에 없던 문제.
```

fence 통일이 잠재 결함을 하나 더 드러냈다.

```text
규칙 블록 4개가 YAML로 파싱되지 않았다.
백틱으로 시작하는 스칼라 2건, 콜론으로 끝나고 다음 줄로 이어지는 스칼라 2건.
text fence였을 때는 아무도 파싱하지 않아 드러나지 않던 문제다.
이제 82개 전부 기계로 추출 가능하다.
```

논의 순서 이유:

```text
- 77은 Verification allowlist와 files glob matcher가 공유하는 기반이라 먼저 고정했다.
- 78은 S5 경계가 이미 고정돼 있어 matcher 문법과 독립적으로 먼저 끝냈다.
- 79는 기존 예시와 사용자 Task가 이미 ** 표기를 쓰고 있어 토큰 모델이 아니라 제한된 glob으로 갔다.
- 79의 case 처리는 CASE_INSENSITIVE_PATH_MATCH_USES_CANONICAL_KEY가 이미 고정해 두어 새로 정하지 않았다.
- 80은 남은 문법 중 유일하게 외부로 나가는 데이터를 직접 통제하므로 먼저 고정했다.
- 81은 판정 로직이라 명명 규칙보다 먼저 고정했고, 매칭은 77 / 79 / 80을 재사용해 새 언어를 만들지 않았다.
- 82는 role 목록이 이미 고정돼 있어 forbiddenByDefault 산문 하나만 남아 있었고, 삭제가 아니라 파생 read model로 풀었다.
- 83은 형식이 이미 지켜지고 있어 실제로 빈 곳은 Core / Profile 공유 id 공간의 출처 표기뿐이었고, 접두사가 아니라 ref 필드로 풀었다.
```

남은 설계의 성격:

```text
Phase 1-9는 "무엇이 진실인가"를 정했다.
Phase 10은 "그 판정을 어떤 표기로 쓰는가"를 정했다.
설계는 여기서 끝났다.
```

Phase 10에서 반복된 판단 기준:

```text
- 허용을 결정하는 matcher는 패턴 언어를 두지 않는다. (77, 78, 79)
- 제거를 결정하는 matcher는 패턴 언어를 두되 선형 시간을 문법으로 보장한다. (80)
- 새 matcher를 만들지 않고 이미 고정된 것을 재사용한다. (81, 82)
- 합친 뷰가 필요하면 손으로 쓰지 않고 파생 read model로 만든다. (82)
- 출처는 문자열 접두사가 아니라 ref 필드로 기록한다. (83)
```

## Phase 11. 구현 재개 (현재 위치)

```text
[x] 85. codefleet review (v0.2 local review)
        - ReviewEvidenceBundle 결정론적 조립 + 참조 아티팩트 hash 재검증
        - review-decision.local.json (finalDecisionTruth false)
        - ACCEPTED 5조건 게이트, 파생 migration status
[x] 86. SPINE 한 바퀴 수동 검증
        - execute 모드로 실제 파일 변경을 일으키는 agent로 한 바퀴
        - 판정 BLOCKED (S3 command channel, S4 final ledger 미구현)
        - changed-files 증거가 untracked 파일을 누락하던 결함 발견 및 수정
        - 기록: docs/spine-pass-2026-08-07.md
[x] 87. path policy evaluation
        - bounded glob matcher 구현 (literal / * / **, 전체 경로, 세그먼트 경계)
        - denied 우선, allowlist 미매치는 violation
        - scope 항목이 와일드카드 없는 디렉터리면 Task validation에서 거부
        - changed-files 증거가 degraded면 평가하지 않고 unavailable로 기록
[x] 88. Harness-visible command channel (S3)
        - Task verification.commands (argv 배열) -> run-plan verificationPlan
        - preflight (셸 차단 / denied 우선 / allowed / destructive) 후 Harness 직접 실행
        - HARNESS_EXECUTED authority, exitCode / stdout / stderr refs 기록
        - observedCheck / gate를 Harness 실행 증거에서만 계산
        - YAML 파서에 map 리스트 지원 추가 (설계가 고정한 스키마 요구)
[x] 89. 사람 리뷰 / 자동 수락 게이트 분리
        - unavailableReason 을 CAPABILITY_GAP / EVIDENCE_DEFECT 로 분류
        - 사람은 capability gap 을 항목별 waive 가능, evidence defect 는 누구도 불가
        - 자동 수락은 normalization COMPLETE 를 전제로 강화
        - FINAL RULE 2개 개정 (REVIEW_MODEL_V02 / SYSTEM_POLICY_AUTO_REVIEW)
[x] 90. 구현 감사 — 규칙 21개 대 테스트 대조
        - 검증 공백 3건 해소, 링크 탈출 우회 경로 1건 발견·수정
        - path-policy / command-policy 단위 테스트 19개 추가 (기존 0개)
        - 기록: docs/implementation-audit-2026-08-10.md
[ ] 91. CodeFleet 자신의 사람용 Run 기록 (summary.md)              <- 다음, 미착수
[ ] 92. 값 집합 발산 8건 선언
[ ] 93. 이후 final 슬라이스 (workspace snapshot / provider transcript / agent command 관측)
[ ] 87. 이후 final 슬라이스
```

85번의 상세 슬라이스는 `docs/session-handoff.md`의 held implementation slice에 있다.

---

## 이 문서 갱신 규칙

```text
- 설계 항목을 하나 확정하면 해당 줄을 [x]로 바꾸고 Phase 요약과 진행도를 함께 갱신한다.
- [x] 항목의 번호는 바꾸지 않는다. 완료 번호는 커밋 메시지와 논의 기록이 참조하는 고정 식별자다.
- 아직 [ ]인 항목은 새 항목이 끼어들 때 다시 매길 수 있다. 다시 매기면 그 Phase 전체를 한 번에 정리한다.
- 이 문서는 확정 순서만 기록한다. 규칙 본문을 여기에 복사하지 않는다.
- concept-foundation.md의 0.13 상태 목록과 15절 다음 논의 항목을 함께 갱신한다.
- 검증을 수행하면 날짜별 기록 문서를 남긴다. 무엇을 왜 검증했고, 무엇을 찾았고,
  무엇을 확인할 수 없었는지를 적는다.
```

검증 기록을 남기는 이유는 실증됐다. 2026-08-10 감사 이전에 손으로만 확인하고 아무것도
남기지 않은 검증이 세 건 있었고, 그중 하나를 테스트로 복원하는 과정에서 실제 우회
경로가 드러났다. 남기지 않은 검증은 검증하지 않은 것과 구분되지 않는다.

마지막 항목이 중요하다. `0.13` 상태 목록은 뒤쪽 절에서 FINAL RULE이 추가되는 동안 갱신되지 않아 한 차례 낡은 상태로 남았고, 이미 고정된 항목 3개를 미고정으로 계속 표시했다. 진행 상태를 여러 곳에 나눠 적는 이상 함께 갱신하지 않으면 같은 문제가 반복된다.
