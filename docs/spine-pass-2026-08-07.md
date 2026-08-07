# SPINE Manual Validation Pass — 2026-08-07

이 문서는 `MANUAL_SPINE_PASS_IS_EVIDENCE_CHECKLIST` 기준으로 수행한 첫 SPINE 한 바퀴
검증 기록이다. 판정 근거는 durable artifact의 refs/hash이며 육안 확인만으로 통과시키지
않는다.

## 판정

```text
result: BLOCKED
blockedBoundaries: S3, S4-final
```

`BLOCKED`는 실패가 아니다. v0.2가 구현하지 않기로 한 경계가 남아 있다는 뜻이며,
각 경계는 아래에 unavailableReason과 함께 명시된다.

## 검증 환경

```text
workspace: 임시 git 저장소 (리포 외부)
task: greet (scope include src/**, exclude src/secrets/**)
adapter: 실제로 파일을 수정하는 stand-in agent
mode: execute  (dry-run만으로는 S2 증거를 검증할 수 없다)
```

`mode: execute`로 돌린 것이 이번 검증의 핵심이다. 그 전까지 모든 실행이 dry-run이어서
S2 증거 경로가 한 번도 실제로 동작한 적이 없었다.

## 경계별 결과

```text
S1 Task Revision            PASS
- task validate 통과
- run-plan.json sourceRefs.taskRevisionRef / taskSnapshotRef 존재, hash 기록됨

S2 Adapter seam             PASS (수정 후)
- adapter-request.json / harness-observation.json / adapter-result.json 모두 생성
- changedFiles가 실제 파일시스템 상태와 일치함을 대조로 확인
- commandEvidenceAuthority NONE, 이유 명시됨

S3 Verification             BLOCKED
- unavailableReason: NO_VERIFICATION_COMMANDS_CONFIGURED
- unavailableReason: COMMAND_CHANNEL_NOT_HARNESS_VISIBLE
- observedCheck NONE, verificationGateResult NOT_SATISFIED (MISSING)
- Harness-visible command channel 미구현이 원인이며 v0.2 범위 밖이다

S4 Review record            PASS (local), BLOCKED (final)
- ReviewEvidenceBundle 생성됨, 참조 아티팩트 hash 재검증 수행됨
- review-decision.local.json finalDecisionTruth false, migrationTarget RUN_REVIEW_DECIDED
- localReviewStatus DEGRADED_RECORDED
- final RUN_REVIEW_DECIDED는 Objective ledger 미구현으로 BLOCKED
```

## 파생 상태가 refs/hash로 설명되는가

```text
result DONE                 <- adapter-result.json ref
observedCheck NONE          <- verification/verify-001.json
verificationGate MISSING    <- verificationPlan 부재
computedRisk UNKNOWN        <- risk rule 미구현, 미해결 상태로 기록됨
pathViolation evaluated:false <- PATH_POLICY_EVALUATION_NOT_IMPLEMENTED_V02
```

모든 파생 상태가 참조 또는 명시적 unavailableReason으로 설명된다.

## degraded 증거가 결정론적 거부를 만드는가

`ACCEPTED`를 시도했을 때 다음과 같이 거부됐다.

```text
ACCEPTED local review is not allowed for 2026-08-07_001.
  - bundle is DEGRADED: RUN_SUMMARY_NORMALIZATION:PARTIAL
  - verification gate is NOT_SATISFIED (MISSING)
  - path violation was not evaluated
```

거부 사유가 조건별로 열거되며 재현 가능하다. 사람이 승인하겠다고 해도 검증 증거가
없으면 ACCEPTED가 되지 않는다.

## 이 검증에서 찾은 결함

```text
결함: changed-files 증거가 untracked 파일을 누락했다
심각도: CORRUPTION 급
상태: 수정 완료
```

`captureGitChangedFiles`가 `git diff --name-only`를 사용해 추적 중인 파일의 수정만
보고했다. stand-in agent가 다음 두 파일을 새로 만들었을 때:

```text
infra/deploy.sh        task scope(src/**) 밖
src/secrets-leak.txt   자격증명 형태 문자열 포함
```

HarnessObservation은 다음과 같이 기록했다.

```json
{ "changedFiles": ["src/greet.js"], "unavailableReason": "" }
```

scope 밖 인프라 스크립트와 자격증명 파일이 생성됐는데도 변경 파일 하나만 보고하면서
`unavailableReason`을 비워 **관측이 완전하다고 주장**했다. 이는 다음 고정 규칙 위반이다.

```text
GENERATED_UNTRACKED_AND_GITIGNORED_FILES_ARE_POLICY_SUBJECTS
- untracked files do not bypass path policy
- generated / untracked / gitignored files outside allowedPaths are violations
```

누락 자체보다 `unavailableReason: ""`가 더 큰 문제다. 증거가 불완전할 때 불완전하다고
말하는 것이 이 설계의 핵심인데, 여기서는 불완전한 증거가 완전한 것으로 보고됐다.

수정 후 changedFiles가 실제 파일시스템 상태와 일치한다.

```text
fake-agent.mjs
infra/deploy.sh
src/added.js
src/greet.js
src/secrets-leak.txt
```

회귀 테스트를 추가했다. CodeFleet 자신의 `.codefleet/` 아티팩트는 agent 변경이 아니므로
증거에서 제외한다.

## 다음 검증에서 확인할 것

```text
- path policy evaluation 구현 후 scope 밖 변경이 실제로 violation으로 기록되는지
- Harness-visible command channel 구현 후 observedCheck가 PASS로 계산되는지
- Objective ledger 구현 후 MIGRATION_READY local review가 RUN_REVIEW_DECIDED로 import되는지
```
