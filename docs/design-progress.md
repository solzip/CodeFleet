# CodeFleet Design Progress

Last updated: 2026-08-10

이 문서는 CodeFleet 설계가 어떤 순서로 확정됐고 지금 어디를 진행 중인지 기록한다.

문서 역할 구분:

```text
docs/concept-foundation.md   확정된 설계 내용 자체 (정본)
docs/design-progress.md      확정 순서와 현재 위치 (이 문서)
docs/session-handoff.md      다음 세션이 이어받을 최소 상태
docs/spine-pass-*.md         SPINE 한 바퀴 검증 기록 (날짜별)
docs/implementation-audit-*.md  규칙 대 코드 대조 기록 (날짜별)
README.md                    현재 구현 사용법 (한글 기준, 영문은 README.en.md)
```

이 문서는 설계 *내용*을 담지 않는다. 규칙 본문은 항상 `docs/concept-foundation.md`가 정본이다.

## 진행 요약

```text
Phase 0-9    완료      76단계
Phase 10     완료      8단계 전부 완료
Phase 11     진행 중   97단계 완료, 98번 진행 중
```

방침:

```text
설계를 먼저 모두 확정한 뒤 구현을 순차적으로 재개한다.
설계는 84번에서 완료됐다. 이제 Phase 11 구현으로 넘어간다.
```

측정값 (2026-08-10, `npm test` 로 재현 가능):

```text
FINAL RULE                    83개
condition 줄                  545줄
scanScope 를 요구받는 규칙    27개 / 누락 0
enum 필드                     52개 / 값 집합 분기 8개 (0.13 에 선언, 미수정)
YAML 파싱 실패                0
id 형식 위반 / 중복           0
status != FINAL               0
taxonomy 밖 category/severity 0

테스트                        128 pass / 0 fail

설계 대비 검증 커버리지
  claim 이 붙은 condition       155 / 545  (28.4%)
  한 줄이라도 검증되는 규칙     42 / 83
  전부 검증되는 규칙            2 / 83
  claim 이 하나도 없는 규칙     41 (condition 246줄)

완전 구성 Run 의 남은 gap     adapter 가 무엇을 내놓느냐에 달려 있다
  구조화 transcript 를 냄        1건 (COMMAND_CHANNEL_NOT_HARNESS_VISIBLE)
  산문만 냄                      2건 (+ PROVIDER_TRANSCRIPT_NOT_STRUCTURED)
  모르는 형식을 냄               2건 (+ PROVIDER_TRANSCRIPT_FORMAT_UNRECOGNIZED)
```

이 3분기는 이제 1회성 수동 측정이 아니라 테스트로 고정돼 있다. 1건 경우는
`test/run.test.ts`, 나머지 2건은 `test/provider-transcript.test.ts` 가 재현한다.
policies.commands 로 verification 이 전량 차단된 Run 에서만 나타나는
`VERIFICATION_BLOCKED_BY_COMMAND_POLICY:n` 는 완전 구성 Run 에 도달하지 않으므로
위 표에 없다.

이 수치는 손으로 세지 않는다. `npm test` 가 매 실행마다 출력하고, 검사 대상이
0건이면 통과가 아니라 실패한다.

## 설계 대비 검증 커버리지를 어떻게 세는가

```text
단위는 규칙이 아니라 condition 줄이다.
= 규칙 하나에 condition 이 11줄인데 테스트 하나 붙였다고 "그 규칙 검증됨" 이 되면
  숫자가 실제보다 커진다.

claim 은 통과한 테스트만 남긴다.
= 테스트 본문 안에서 coversRule(ruleId, "condition 원문") 을 호출한다.
= 실패하거나 실행되지 않은 테스트는 아무것도 남기지 않는다.
= 주석이나 표는 의도를 기록하고, 이건 실행을 기록한다.

지어낸 claim 은 즉시 실패한다.
= 없는 ruleId -> 실패
= 규칙에 없는 condition 인용 -> 실패
= claim 0건 -> 실패 (검사 대상 0건은 통과가 아니다)
= baseline 보다 낮아지면 실패 (docs/rule-coverage-baseline.json)

검사기 자신도 검사받는다.
= test/rule-coverage.test.ts 가 위 4가지 실패를 각각 재현한다.
```

**이 수치가 말하지 않는 것**: claim 은 "통과한 테스트가 이 condition 을 검사한다고
주장했다" 는 뜻이지 "그 condition 이 올바르게 구현됐다" 는 뜻이 아니다.

목록은 `npm run coverage:uncovered` 로 뽑는다.

## 미claim 규칙의 분류 (2026-08-10)

`docs/rule-implementation-status.json` 이 정본이다. 규칙마다 status / evidence
경로 / detail 을 적고, 체커가 다음을 강제한다:

```text
- 83개 규칙은 claim 이 있거나 status 항목이 있어야 한다. 둘 다 없으면 실패.
- status 가 붙은 규칙에 claim 이 생기면 항목이 낡은 것이므로 실패 (갱신 강제)
- evidence 경로가 실제로 없으면 실패 (없는 근거를 적을 수 없음)
- status 값이 4종 밖이거나 detail 이 비면 실패
```

IMPLEMENTED_UNMAPPED 16개(148줄)는 2026-08-10 에 claim 을 붙여 해소했다. 커버리지
15.8% -> 27.5%. 제품 코드는 한 줄도 쓰지 않았다. 표시 작업이었기 때문이다.

```text
status                 규칙  condition 줄
NOT_IMPLEMENTED          32      198   코드 0줄
IMPLEMENTED_UNTESTED      6       31   코드 있음, 테스트 없음
NOT_CODE_VERIFIABLE       3       17   설계 문서·슬라이싱 규율 규칙
claim 있음 (검증됨)      42      155
claim 있음 (남은 줄)             144
합계                     83      545
```

읽는 법:

```text
198줄  진짜 미구현. 여기가 남은 구현 작업의 크기다.
        분류는 command policy 작업(3380691, 0724e18) 이후 다시 뽑은 값이다.

        Project Profile 스키마·overlay·adapter   52   12개 규칙
        requiredGates 구체화·병합                48    3개 규칙
        Export / Redaction / S5                  32    7개 규칙
        시스템 자동 리뷰 bound + actor gate      23    2개 규칙
        AgentRole / Guardrail                    23    4개 규칙
        Risk engine                              16    3개 규칙
        ledger corrective event                   4    1개 규칙

144줄  이미 claim 이 붙은 42개 규칙 안에서 아직 검증 안 된 나머지 줄.
        여기가 지금 가장 큰 단일 덩어리이고, 대부분 미구현 조건이 섞여 있다.
        (예: Task Revision 에 agentRole / guardrails / requiredGates 필드가 없음)

31줄   코드는 있는데 그 규칙을 검사하는 테스트가 없다.

17줄   런타임 대상이 아니다. 영원히 미구현으로 남겨두면 거짓 부채가 된다.
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
[x] 91. Run 자체 기록과 Export 분리
        - run-record.md 를 Run 마다 항상 생성 (export 여부와 무관)
        - exports/summary.md 는 sanitized 외부용으로 유지
        - unavailableReason 을 분류와 함께 전부 나열, 요약으로 덮지 않음
        - 리뷰가 기록되면 같은 파일에 결과가 합류
[x] 92. 값 집합 발산 선언
        - 같은 이름·다른 값 집합 8건을 0.13 NOT_FINAL_YET 에 선언
        - 완전성 어휘가 관측/수락/재생 세 축 다섯 필드로 나뉜 것도 함께 선언
        - 검사기 한계(다른 이름·같은 개념은 못 잡음)를 명시
        - authority 외 7건은 실해 미확인이므로 추측으로 순위 매기지 않고 목록으로 유지
[x] 93. Mutation Engine + Objective ledger (append / replay)
        - M0~M7 단계, M4 커밋 지점, lock fail-fast, mutationId 멱등성
        - OBJECTIVE_CREATED append -> replay -> objective.json 재생
        - 구조 손상 시 replay BLOCKED, snapshot drift 는 rebuild 로만 복구
        - CLI: objective create|status|rebuild, lock status|break
[x] 94. Task attach + Queue
        - TASK_ATTACHED + queue 상태 이벤트 5종 + QUEUE_REORDERED
        - 전이표 강제: CANCELED terminal, SKIPPED->WAITING 은 명시 unskip 만
        - reason 필수, 같은 전이 반복은 no-op
        - SEQUENCE 는 derived NEXT 최대 1개, reorder 는 future segment 만
        - CLI: objective attach|block|unblock|skip|unskip|cancel-item|reorder
[x] 95. Task approval — 승인된 것만 run
        - Task ledger 별도 파일, approval 은 revision 에 바인딩
        - 승인 없는 Task 는 run 거부, Run Trace 를 남기지 않음
        - 편집하면 content hash 가 바뀌어 기존 승인이 덮지 않음
        - 재승인은 명시적 invalidate 이후에만 가능
        - run-plan.json 에 어느 승인으로 실행됐는지 기록
        - CLI: task approve|invalidate|status
        - 승인 검사는 projectPath 해석보다 먼저 (실행 자격이 실행 방법보다 앞선다)
        - 픽스처 전수 검사 추가 — 승인 없이 runTask 를 부르면 테스트가 깨진다
        - 모든 검사기가 측정값을 보고하도록 변경 (판정만으로는 0건 검사와 구분 불가)
        - 설계 정합성 검사를 임시 스크립트에서 테스트로 이관 (design-rules.test.ts)
        - 0.12 에 "검사 범위 보고" 원칙 추가 — 결정론적인 것과 범위를 밝히는 것은 다르다
        - 집합을 한정하는 규칙 27개에 scanScope evidence 추가 (기계적 판별, 단일 대상 규칙은 제외)
        - 런타임 산출물에 건수 노출 (pathPolicy / verification / reviewBundle)
[x] 96. RUN_REVIEW_DECIDED 이관
        - MIGRATION_READY / _WAIVED 만 이관 가능, 나머지 3종은 거부
        - 제자리 승격 없음 — 새 event append, 로컬 파일·bundle·Run Trace 불변
        - migrationSource / migrationSourceRef+hash 기록
        - waive 한 gap 목록이 ledger 로 함께 넘어감
        - 같은 reviewDecisionId 에 다른 bundle hash 면 이관 차단
        - CLI: objective import-review <id> <run-id>
[x] 97. VERIFIED 계산 + Queue 진행 — 루프가 닫혔다
        - ledger 의 latest effective RUN_REVIEW_DECIDED 에서 VERIFIED 파생
        - ACCEPTED + gate SATISFIED/WAIVED_ALLOWED + result DONE 셋 다 필요
        - 하나라도 빠지면 미검증으로 남고 커서가 넘어가지 않음
        - supersedes/invalidates 참조가 먼저 적용됨
        - evidence bundle hash 없는 결정은 effective 가 되지 않음
[~] 98. 이후 (carry-forward / export / CAPABILITY_GAP)                 <- 진행 중
        [x] HarnessWorkspaceSnapshot — PRE_RUN/POST_RUN 상태 증거
            - adapter 에 제어를 넘기기 전에 PRE_RUN, 끝난 뒤 POST_RUN
            - git headRef/status/diff, scoped file snapshot, stateHash 를 구간별로 분리
            - 구간마다 자기 unavailableReason — 부분 스냅샷이 완전한 것처럼 통과할 수 없음
            - changes.workspaceDelta = post - pre (scoped snapshot 기준)
            - git 이 무시하도록 설정된 파일도 delta 에 잡힘 (e2e 로 증명)
            - 완전 구성 Run 기준 gap 3건 -> 2건 (2026-08-10 측정)
        [x] PROVIDER_TRANSCRIPT_PARSING — provider 보고 명령 기록
            - 파싱 규칙은 adapter layer 에만 (Core 는 provider-agnostic 결과만 받음)
            - 아는 event type 밖은 추측하지 않고 unrecognizedJsonLines 로 셈
            - shell 문자열은 argv 로 쪼개지 않고 raw 유지
            - 읽기 실패 3종 구분: NOT_PROVIDED / NOT_STRUCTURED / FORMAT_UNRECOGNIZED
            - authority = PROVIDER_REPORTED_ONLY, command truth 아님
            - 구조화 transcript 를 내는 adapter 기준 gap 2건 -> 1건 (2026-08-10 측정)
        [x] command policy 를 Run 이 실제로 강제
            - policies.commands 를 읽어 effectivePolicy 에 실제 matcher 를 실음
            - preflight 가 빈 리스트가 아니라 그 matcher 로 판정
            - BLOCKED 시도를 commandViolations 로 기록 (HARNESS_EXECUTED,
              scanScope 는 HARNESS_EXECUTED_COMMANDS_ONLY 로 명시)
            - 패턴 문자가 섞인 matcher / policies.commands 의 미지 키 /
              categoryId 없는 destructive entry 는 profile 자체를 실패시킴
              (셋 다 "가득 찬 것처럼 보이는 빈 denylist" 를 만들기 때문)
            - 전량 차단된 verification 은 VERIFICATION_BLOCKED_BY_COMMAND_POLICY:n
              으로 기록 (matcher 가 항상 비어 있던 동안 도달 불가였던 결함)
        [x] policies.harness — 관측 불가능한 명령의 Run 은 계획 단계에서 차단
            - execute 모드인데 Harness 가 볼 수 있는 채널이 없으면 Run 디렉터리
              생성 전에 거부
            - 진행하려면 allowDegradedCommandObservation 를 profile 에 명시
              (플래그는 관측을 만들지 않는다. gap 은 그대로 남고 사람 리뷰 필요)
            - HARNESS_VISIBLE_COMMAND_CHANNEL 는 단일 상수 (src/run.ts)
            - 기존 테스트 13개가 깨졌고, 13개 전부 같은 원인임을 메시지로 확인
            - policies 블록 없는 config 가 거부되고 .codefleet/runs 가 비는지
              보는 테스트를 따로 추가 (픽스처 수정이 규칙 무력화와 구분되도록)
        [ ] COMMAND_CHANNEL_NOT_HARNESS_VISIBLE
            - 미구현 규칙이 아니라 채널 부재다. command proxy / sandbox log /
              container exec log 중 무엇도 없어 읽을 대상이 없다.
        [ ] carry-forward
        [ ] Export (S5)
[ ] 99. 이후 final 슬라이스
```

98번 이후 후보 3개와 각각의 측정 크기는 `docs/session-handoff.md`의
Next implementation slice에 있다. 그 항목은 아직 선택되지 않았다.

번호 재부여 1건: 마지막 줄이 `[ ] 87.` 이었는데 87번은 이미 path policy
evaluation 으로 완료된 번호였다. 미완료 항목이므로 이 문서의 갱신 규칙에 따라
99로 다시 매겼다.

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
- 검사기는 판정뿐 아니라 측정값을 보고한다. 무엇을 몇 건 검사했는지 없이는
  0건 발견과 0건 검사를 구분할 수 없다. 검사 대상이 사라지면 실패해야 한다.
```

검증 기록을 남기는 이유는 실증됐다. 2026-08-10 감사 이전에 손으로만 확인하고 아무것도
남기지 않은 검증이 세 건 있었고, 그중 하나를 테스트로 복원하는 과정에서 실제 우회
경로가 드러났다. 남기지 않은 검증은 검증하지 않은 것과 구분되지 않는다.

마지막 항목이 중요하다. `0.13` 상태 목록은 뒤쪽 절에서 FINAL RULE이 추가되는 동안 갱신되지 않아 한 차례 낡은 상태로 남았고, 이미 고정된 항목 3개를 미고정으로 계속 표시했다. 진행 상태를 여러 곳에 나눠 적는 이상 함께 갱신하지 않으면 같은 문제가 반복된다.
