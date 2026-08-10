# Implementation Audit — 2026-08-10

이 문서는 v0.2 구현이 고정 설계를 실제로 따르는지 대조한 기록이다. `docs/spine-pass-2026-08-07.md`와 같은 성격이며, 그 문서가 SPINE 한 바퀴를 검증했다면 이 문서는 규칙과 코드의 대응을 검증한다.

## 왜 했는가

v0.2 구현 슬라이스와 S3, path policy까지 끝난 시점에서 다음 두 가지를 확인할 필요가 있었다.

```text
1. 설계가 내부적으로 정합한가
2. 구현이 그 설계대로 되었는가
```

두 번째가 이 감사의 주 대상이다. 첫 번째는 아래 "확인할 수 없는 것"에 한계를 적었다.

## 무엇을 대조했는가

전체 82개 FINAL RULE 중 현재 구현 범위에 해당하는 21개를 골라 테스트와 대조했다.

```text
WORKSPACE_DISCOVERY_RESOLVES_SINGLE_WORKSPACE_CONTRACT
RUN_PLAN_IS_IMMUTABLE_RESUME_BOUNDARY
S2_RUN_ATTEMPT_ALWAYS_LEAVES_THREE_ARTIFACTS
ADAPTER_REQUEST_IS_PROVIDER_AGNOSTIC
ADAPTER_RESULT_IS_EVIDENCE_NOT_DECISION
HARNESS_OBSERVATION_OWNS_EXECUTION_EVIDENCE
COMMAND_TRUTH_REQUIRES_HARNESS_VISIBLE_CHANNEL
VERIFICATION_EVIDENCE_IS_HARNESS_OWNED
PATHS_ARE_WORKSPACE_RELATIVE_AND_CANONICAL
DENIED_PATHS_OVERRIDE_ALLOWED_PATHS
FILES_POLICY_MATCHER_IS_BOUNDED_GLOB_SUBSET
GENERATED_UNTRACKED_AND_GITIGNORED_FILES_ARE_POLICY_SUBJECTS
DELETE_AND_RENAME_CHECK_SOURCE_AND_TARGET
SYMLINK_TARGET_MUST_NOT_ESCAPE_PATH_POLICY
NESTED_REPO_AND_SUBMODULE_REQUIRE_EXPLICIT_ALLOW
COMMAND_NORMALIZATION_IS_ARGV_BASED_AND_SHELL_FREE
COMMAND_MATCHER_IS_ARGV_PREFIX_WITHOUT_PATTERN_LANGUAGE
DESTRUCTIVE_COMMAND_CATEGORY_IS_APPROVAL_UNIT
REVIEW_MODEL_V02_IS_LOCAL_MIGRATION_PATH
LOCAL_REVIEW_MIGRATION_STATUS_IS_DERIVED
RUN_SUMMARY_VERIFICATION_AND_LOCAL_REVIEW_LAYOUT_FIXED
```

## 결과

```text
검증 공백 3건 발견, 3건 모두 테스트로 해소
그 과정에서 실제 우회 경로 1건 발견, 수정
단위 테스트 부재 모듈 2개 발견, 19개 테스트 추가
테스트 28개 -> 50개
```

### 검증 공백 3건

```text
RUN_PLAN_IS_IMMUTABLE_RESUME_BOUNDARY
- run-plan 이 생성 후 다시 쓰이지 않는지 확인하는 테스트가 없었다
- 모든 아티팩트가 같은 run-plan hash 를 참조하는지 검사하도록 추가

DELETE_AND_RENAME_CHECK_SOURCE_AND_TARGET
- git porcelain 출력을 손으로 확인했을 뿐 테스트가 없었다
- 삭제와 rename 양쪽 경로가 증거에 남는지 검사하도록 추가

SYMLINK_TARGET_MUST_NOT_ESCAPE_PATH_POLICY
- 순수 평가기만 테스트했고 파일시스템 해석은 미검증이었다
- 실제 링크를 만들어 검사하도록 추가했고, 그 과정에서 결함이 드러났다
```

### 발견한 우회 경로

`git status`는 링크된 디렉터리 **안의 내용**을 보고하고 링크 자체는 보고하지 않는다.

```text
워크스페이스 안에 바깥을 가리키는 junction 생성
-> git status 가 보고하는 것: ?? src/escape-dir/secret.txt
-> escape 검사는 말단 경로만 lstat
-> 말단은 링크 너머의 평범한 파일이므로 심볼릭 링크가 아님
-> 탐지 실패
-> 게다가 src/** 에 매칭되어 허용됨
```

동작하는 우회다. 에이전트가 워크스페이스 안에 링크를 만들면 바깥에 쓰면서도 보고되는 모든 경로가 scope 안으로 보인다.

수정: 변경 경로의 **모든 조상 세그먼트**를 검사한다. 말단만 보지 않는다.

### 단위 테스트가 없던 모듈

```text
src/path-policy.ts     260줄, 단위 테스트 0개
src/command-policy.ts  151줄, 단위 테스트 0개
```

변경과 명령의 허용 여부를 판정하는 두 모듈이 통합 테스트로만 간접 검증되고 있었다. matcher 규칙 자체가 한 번도 단언된 적이 없었다. 19개 테스트를 추가했다.

테스트를 쓰다 잘못된 단언을 하나 잡았다. `**/.env`가 저장소 루트의 `.env`에 매칭되지 않는다고 단언했는데, 그랬다면 시크릿을 잡으려고 쓴 denied 패턴이 가장 흔한 위치를 놓친다. 선행 `**`는 0개 세그먼트를 소비할 수 있어야 하고, 후행 `**`만 최소 1개를 요구한다. 구현이 맞았고 단언이 틀렸다.

## 반복된 패턴

이 감사 이전에도 같은 일이 세 번 있었다.

```text
path matcher 규칙 부합 15개 항목   손으로 확인, 스크립트 삭제
git porcelain 삭제/rename 동작      손으로 확인, 기록 없음
심볼릭 링크 탈출 검사               손으로 확인, 기록 없음
```

매번 "확인했다"고 보고했지만 다음 사람은 그 검증이 있었는지조차 알 수 없었다. 그리고 세 번째 건에서 실제 결함이 나왔으므로, 남기지 않은 검증은 검증이 아니었다는 것이 사후에 증명됐다.

```text
검증이 산출물을 남기지 않으면 검증하지 않은 것과 구분되지 않는다.
```

## 확인할 수 없는 것

이 감사가 답하지 못하는 것을 명시한다.

```text
설계가 목적을 달성하는가
= "Harness 관측만 진실로 인정한다"가 실제로 오통과를 막는지는 논증만 가능하다.

도메인에 적합한가
= CodeFleet 은 아직 실제 업무에 쓰인 적이 없다. 사용 없이는 알 수 없다.

정합성 측정이 완전한가
= 2026-08-07 최종 재감사는 규칙 블록만 검사해 인라인 스키마의 값 집합 발산 8건을 놓쳤다.
= 이 감사도 같은 종류의 사각을 가질 수 있다.
```

## 미해소로 남긴 것

```text
값 집합 발산 8건
= 같은 필드명이 서로 다른 값 집합을 갖는 경우
= authority 는 실해가 확인되어 해소, 나머지 7건은 미선언 상태
= docs/concept-foundation.md 0.13 에 선언 필요

run.ts 크기
= 1,333줄. 실행 오케스트레이션과 증거 수집이 한 파일에 있다.
= 다음 슬라이스(workspace snapshot)가 같은 파일에 들어간다.

CodeFleet 자신의 사람용 산출물
= Run 이 만드는 12개 아티팩트 중 사람이 읽는 형식은 prompt.md 뿐이다.
= 설계가 규정한 summary.md 는 미구현이다.
```
