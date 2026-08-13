# 결함 등재부

작성 기준: 2026-08-13, 커밋 `097681b` 이후. 번호 실측 최대값 **P0-16 / P1-61**.

## 읽는 법

- **상태**는 `최종 갱신 문서`가 내린 판정을 그대로 옮긴 것이다. **그 문서 이후 재확인하지 않았다.**
- **★** 표시는 2026-08-13 이 세션에서 코드 또는 실행으로 직접 확인한 것이다. 나머지는 문서 인용이다.
- 확인되지 않은 것은 **[미확인]**으로 둔다. 추측으로 채우지 않는다.
- 상태값: `미해소` / `부분해소` / `해소` / `재현안됨` / `정의확정필요` / `미확인`
- **등급이 바뀌어도 ID는 유지한다** (`CONVENTIONS.md` §7). 등급은 아래 「현재 등급」 열이 유일한 근거다.

## 현황 요약

아래 표의 행을 직접 세어 채웠다. `P0-17`(미사용)은 결함이 아니므로 제외한다.

| 상태 | 건수 | 내역 |
| --- | --- | --- |
| 해소 | **25** | P0-2·4·5·7·8·9·10·11·12·13·14·15·16 + P1-4·34·37·38·40·42·43·44·48·49·53·61 |
| 부분해소 | 8 | P0-1·3·6 + P1-3·32·35·41·60 |
| 재현안됨 | 1 | P1-27 |
| 미해소 | **15** | P1-2·15·17·45·46·47·50·51·52·54·55·56·57·58·59 |
| 미해소(수용된 한계) | 1 | P1-28 |
| **미확인** | **27** | P1-1·5·6·7·8·9·10·11·12·13·14·16·18·19·20·21·22·23·24·25·26·29·30·31·33·36·39 |
| 합계 | 77 | P0 16 + P1 61 |

건수는 표의 행을 파싱해 센 값이다(`P0-17` 미사용 제외). 「수용된 한계」를 미해소와 섞지 않고 분리한 것은 둘이 다른 것이기 때문이다 — 하나는 고칠 대상이고 하나는 고치지 않기로 한 결정이다.

**77건 중 27건(35%)이 [미확인]이다.** 앞선 집계는 39건(51%)이었고, `runs/2026-08-13/stranded-findings-triage.md`가 12건을 확정해 줄였다.

그 조사의 결과가 이 등재부의 성격을 보여준다 — **방치된 11건 중 8건은 이미 해소돼 있었다.** 고친 커밋은 `38cf9c9`(S3)와 `5055cf3`(리뷰)이고, 둘 다 등재부를 갱신하지 않아 8건이 [미확인]으로 남아 있었다. 남은 [미확인] 27건도 같은 상태일 수 있으며, **확인하지 않은 것과 유효한 것은 다르다.**

우선순위는 `runs/2026-08-13/stranded-findings-triage.md` §B-3에 4개 군으로 정렬돼 있다.

---

## P0

| ID | 요약 | 현재 등급 | 상태 | 최초 등재 | 최종 갱신 |
| --- | --- | --- | --- | --- | --- |
| P0-1 | 에이전트 실행 강제 (파일 범위·명령 정책·자격증명) | P0 | 부분해소 | `2026-08-10/SUMMARY.md` | `2026-08-12/SUMMARY.md` |
| P0-2 | Objective 큐 게이트 | P0 | 해소 | `2026-08-10/SUMMARY.md` | `2026-08-12/SUMMARY.md` |
| P0-3 | 중복·동시 실행 | P0 | 부분해소 | `2026-08-10/SUMMARY.md` | `2026-08-12/SUMMARY.md` |
| P0-4 | 실행 격리·롤백 | P0 | 해소 | `2026-08-10/SUMMARY.md` | `2026-08-12/SUMMARY.md` |
| P0-5 | taskRevision 추적 체인 | P0 | 해소 | `2026-08-10/SUMMARY.md` | `2026-08-12/SUMMARY.md` |
| P0-6 | 타임아웃·출력 상한 (win32 한정 검증) | P0 | 부분해소 | `2026-08-10/SUMMARY.md` | `2026-08-12/SUMMARY.md` |
| P0-7 | 격리 시 증거가 엉뚱한 트리에서 수집됨 | P0 | 해소 ★ | `2026-08-11/07-new-defects.md` | `runs/2026-08-13/first-full-loop.md` |
| P0-8 | 격리 트리 미폐기·미반영 | P0 | 해소 ★ | `2026-08-11/07-new-defects.md` | `runs/2026-08-13/first-full-loop.md` |
| P0-9 | 큐 게이트 fail-open | P0 | 해소 | `2026-08-11/07-new-defects.md` | `2026-08-12/SUMMARY.md` |
| P0-10 | Harness 자식 프로세스에 경계 없음 | P0 | 해소 | `2026-08-11/07-new-defects.md` | `2026-08-12/SUMMARY.md` |
| P0-11 | 신규 파일 내용 소실 | P0 | 해소 | `2026-08-11/07-new-defects.md` | `2026-08-12/SUMMARY.md` |
| P0-12 | 프로파일 가드레일이 승인 해시 밖에 있어, 승인자가 본 것과 다른 가드레일로 실행된다 | P0 | 해소 ★ | `2026-08-12/11-model-conformance.md` | `runs/2026-08-13/first-full-loop.md` |
| P0-13 | Objective relation 없이 Run이 실행된다 | P0 | **해소** ★ | `2026-08-12/11-model-conformance.md` | `runs/2026-08-13/stranded-findings-triage.md` |
| P0-14 | Objective relation이 실행되는 revision을 가리키지 않는다 | P0 | **해소** ★ | `2026-08-12/12-model-conformance-recheck.md` | `runs/2026-08-13/stranded-findings-triage.md` |
| P0-15 | relation의 revision·hash가 Task 원장과 대조되지 않는다 | P0 | **해소** ★ | `2026-08-12/12-model-conformance-recheck.md` | `runs/2026-08-13/stranded-findings-triage.md` |
| P0-16 | 읽을 수 없는 Task 원장이 빈 원장으로 읽혀 승인이 그 위에 쌓인다 | P0 | **해소** ★ | `2026-08-12/15-new-module-review.md` | `runs/2026-08-13/stranded-findings-triage.md` |
| **P0-17** | **미사용** — P1-50 승급 시 ID를 유지했으므로 비어 있다 | — | — | — | `2026-08-13/13-output-fidelity.md` |

### ★ 근거

- **P0-7·P0-8**: `runs/2026-08-13/first-full-loop.md` — 격리 Run의 `changedFiles`가 워크스페이스가 아니라 worktree를 관측했고(`src/math.js` 1건), 트리는 디스크·`git worktree list` 양쪽에서 폐기 확인.
- **P0-12**: 같은 문서 — `run-plan.json`의 `approval`에 `revisionHash`와 `guardrailHash`가 **둘 다** 있고 `approvalTargetHash`가 그 둘을 덮는다. `src/run.ts:529-532`가 Run 시작 시 재계산·대조.

---

## P1 — 2026-08-10 등재 (P1-1 ~ P1-19)

전건 [미확인]이다. `2026-08-12/SUMMARY.md`가 P0 잔여로 P1-12·P1-15·P1-16·P1-17을 언급하나, 개별 재판정 문서는 없다.

| ID | 요약 | 현재 등급 | 상태 | 최초 등재 | 최종 갱신 |
| --- | --- | --- | --- | --- | --- |
| P1-1 | 자유 텍스트 `doneCriteria`가 필수이고 실행 가능한 `verification`이 선택이다 | P1 | 미확인 | `2026-08-10/SUMMARY.md` | — |
| P1-2 | 파괴적 명령 승인 경로가 막다른 길. `approvedCategoryIds: []` 하드코딩 | P1 | 미해소 ★ | `2026-08-10/SUMMARY.md` | `2026-08-13/13-output-fidelity.md` |
| P1-3 | 선언만 되고 소비되지 않는 정책 플래그 5종 | P1 | 부분해소 ★ | `2026-08-10/SUMMARY.md` | `2026-08-13/13-output-fidelity.md` |
| P1-4 | 승인 해시가 Task 파일만 덮고 프로파일을 포함하지 않는다 | P1→P0-12 | 해소 ★ | `2026-08-10/SUMMARY.md` | `runs/2026-08-13/first-full-loop.md` |
| P1-5 | actor 신원이 자기 신고 문자열. 승인자=검토자 허용 | P1 | 미확인 | `2026-08-10/SUMMARY.md` | — |
| P1-6 | 실행 중 계획 이탈 시 재승인 트리거 없음 | P1 | 미확인 | `2026-08-10/SUMMARY.md` | — |
| P1-7 | 원자적 롤백 부재 | P1 | 미확인 | `2026-08-10/SUMMARY.md` | — |
| P1-8 | Run 아티팩트에 `objectiveId` 없음 | P1 | 미확인 | `2026-08-10/SUMMARY.md` | — |
| P1-9 | `objective attach`가 승인 여부·revision·유효성을 검증하지 않는다 | P1 | 미확인 | `2026-08-10/SUMMARY.md` | — |
| P1-10 | 무작업 Run이 ACCEPTED 가능 | P1 | 미확인 | `2026-08-10/SUMMARY.md` | — |
| P1-11 | 비용·토큰 상한 부재 | P1 | 미확인 | `2026-08-10/SUMMARY.md` | — |
| P1-12 | `appendCorrectiveEvent`에 CLI 경로 없음 | P1 | 미확인 | `2026-08-10/SUMMARY.md` | `2026-08-12/SUMMARY.md` |
| P1-13 | `AgentRunInput.limits`를 채우는 코드가 없다 | P1 | 미확인 | `2026-08-10/SUMMARY.md` | — |
| P1-14 | 모든 테스트 픽스처가 `isolationMode: NONE` | P1 | 미확인 | `2026-08-10/SUMMARY.md` | — |
| P1-15 | 어댑터 capabilities 거부에 테스트 0건 | P1 | 미해소 | `2026-08-10/SUMMARY.md` | `2026-08-12/SUMMARY.md` |
| P1-16 | `status: DONE` Task의 순차 재실행이 경고뿐 | P1 | 미확인 | `2026-08-10/SUMMARY.md` | `2026-08-12/11-model-conformance.md` |
| P1-17 | SIGTERM 후 자식 프로세스 잔존 (SIGKILL 부재) | P1 | 미해소 | `2026-08-11/06-p0-6-limits.md` | `2026-08-12/SUMMARY.md` |
| P1-18 | `SUMMARY.md` P1 표 + 상세 절 (문서 정합) | P1 | 미확인 | `2026-08-11/SUMMARY.md` | — |
| P1-19 | fail-closed는 "안전하다"이지 "쓸 수 있다"가 아니다 | P1 | 미확인 | `2026-08-11/08-regression-and-coverage.md` | — |

### ★ 근거

- **P1-2**: `src/run.ts:1630`이 `approvedCategoryIds: []`를 여전히 하드코딩. `2026-08-13/13-output-fidelity.md` §4-2에서 재확인.
- **P1-3**: 같은 문서 §4-2 — 5종 중 3종(`allowedModes`, `allowProviderReportedCommandTruth`, `approvalRequiredForDestructiveCommands`)이 아직 미소비, 2종(`requireIsolationForMutation`, `allowDegradedCommandObservation`)은 소비됨. **P1-57·P1-58로 분할 재등재.**
- **P1-4**: P0-12로 승격된 뒤 해소. P0-12 항목 참조.

---

## P1 — 2026-08-12 등재 (P1-20 ~ P1-49)

| ID | 요약 | 현재 등급 | 상태 | 최초 등재 | 최종 갱신 |
| --- | --- | --- | --- | --- | --- |
| P1-20 | 타임아웃으로 죽은 어댑터가 `ADAPTER_FAILED`로만 기록된다 | P1 | 미확인 | `2026-08-12/SUMMARY.md` | — |
| P1-21 | 폐기 실패 회귀 테스트가 win32 동작에 의존한다 | P1 | 미확인 | `2026-08-12/SUMMARY.md` | — |
| P1-22 | `--no-index` 경로의 잘림 우선순위 규칙이 도달 불가 | P1 | 미확인 | `2026-08-12/03-slice-interactions.md` | — |
| P1-23 | `isolation.ts`의 `run()`이 `scanScope`를 버린다 | P1 | 미확인 | `2026-08-12/03-slice-interactions.md` | — |
| P1-24 | 검증 커맨드가 POST_RUN 스냅샷 이후 실행되어 증거에 안 나타난다 | P1 | 미확인 | `2026-08-12/SUMMARY.md` | — |
| P1-25 | `QUEUE_ITEM_CANCELED`가 `runTask` 종단으로 검증되지 않는다 | P1 | 미확인 | `2026-08-12/01-p0-verdicts.md` | — |
| P1-26 | 격리 모드 unavailable이 리뷰 게이트로 승격되지 않는다 | P1 | 미확인 | `2026-08-12/02-handoff-inventory.md` | — |
| P1-27 | ACCEPTED 시 격리 트리 반영 경로가 설계되지 않았다 | P1 | **재현안됨** ★ | `2026-08-12/09-registration-check.md` | `runs/2026-08-13/first-full-loop.md` |
| P1-28 | Objective 디렉터리 삭제로 큐 결정이 소실된다 (수용된 한계) | P1 | 미해소(수용) | `2026-08-12/02-handoff-inventory.md` | `2026-08-12/SUMMARY.md` |
| P1-29 | 타임아웃 메시지가 모든 자식에 "Adapter"라고 말한다 | P1 | 미확인 | `2026-08-12/03-slice-interactions.md` | — |
| P1-30 | `--no-index`의 `/dev/null` 처리가 git 구현에 의존한다 | P1 | 미확인 | `2026-08-12/04-platform-qualification.md` | — |
| P1-31 | 격리 트리 경로 접두가 Windows 260자 한계 여유를 줄인다 | P1 | 미확인 | `2026-08-12/09-registration-check.md` | — |
| P1-32 | Core 역할 7개 중 5개로는 어댑터가 실행되지 않는다. `init` 기본값이 그중 하나 | P1 | **부분해소** ★ | `2026-08-12/10-first-real-run.md` | `runs/2026-08-13/first-full-loop.md` |
| P1-33 | 어댑터 거부 메시지가 원인·조치를 말하지 않는다 | P1 | 미확인 | `2026-08-12/10-first-real-run.md` | — |
| P1-34 | win32에서 Gradle/Maven wrapper를 검증 커맨드로 쓸 수 없다 | P1 | 해소 | `2026-08-12/10-first-real-run.md` | `2026-08-12/12-orchestration-roadmap.md` |
| P1-35 | `run-record.md`가 실행된 검증 커맨드를 이름으로 적지 않는다 | P1 | **부분해소** ★ | `2026-08-12/10-first-real-run.md` | `2026-08-13/13-output-fidelity.md` |
| P1-36 | 승인이 계약의 실행 가능성을 검사하지 않는다 | P1 | 미확인 | `2026-08-12/11-model-conformance.md` | — |
| P1-37 | Run 산출물 7개 중 `taskRevision`을 담은 것이 1개뿐 | P1 | 해소 ★ | `2026-08-12/11-model-conformance.md` | `runs/2026-08-13/first-full-loop.md` |
| P1-38 | Task 원장이 계약 본문을 보관하지 않는다 | P1 | 해소 | `2026-08-12/11-model-conformance.md` | `2026-08-12/12-orchestration-roadmap.md` |
| P1-39 | Draft / Revision 상태 기계가 코드에 없다 | P1 | 미확인 | `2026-08-12/11-model-conformance.md` | — |
| P1-40 | 실행 결과 상태(`status`)가 계약 문서 안에 있어 승인 해시에 포함된다 | P1 | 해소 | `2026-08-12/11-model-conformance.md` | `src/task.ts:6-13` (RETIRED_TASK_STATUSES) |
| P1-41 | Revision 산출물이 존재하지 않는다 (P1-37·38·39의 공통 원인) | P1 | 부분해소 ★ | `2026-08-12/11-model-conformance.md` | `runs/2026-08-13/first-full-loop.md` |
| P1-42 | `TASK_REVISION_SUPERSEDED`가 선언·replay되지만 append 코드가 0곳 | P1 | **해소** ★ | `2026-08-12/12-model-conformance-recheck.md` | `runs/2026-08-13/stranded-findings-triage.md` |
| P1-43 | `resume.sourceHashPolicy`를 읽는 코드·테스트가 없다 | P1 | **해소** ★ | `2026-08-12/12-model-conformance-recheck.md` | `runs/2026-08-13/stranded-findings-triage.md` |
| P1-44 | invalidate 이후 승계 없는 revision이 3개 상태 중 무엇도 아니다 | P1 | **해소** ★ | `2026-08-12/12-model-conformance-recheck.md` | `runs/2026-08-13/stranded-findings-triage.md` |
| P1-45 | Draft `REJECTED`를 만드는 이벤트가 없다 | P1 | **미해소** ★ | `2026-08-12/12-model-conformance-recheck.md` | `runs/2026-08-13/stranded-findings-triage.md` |
| P1-46 | `OBJECTIVE_CLOSED`를 append하는 코드가 0곳이다 | P1 | **미해소** ★ | `2026-08-12/12-model-conformance-recheck.md` | `runs/2026-08-13/stranded-findings-triage.md` |
| P1-47 | `deriveLocalReviewStatus`가 비수용 결정을 잘못 분류한다 | P1 | **미해소** ★ | `2026-08-12/12-model-conformance-recheck.md` | `runs/2026-08-13/stranded-findings-triage.md` |
| P1-48 | replay 실패 Objective가 Revision 스냅샷에 "relation 없음"으로 기록된다 | P1 | **해소** ★ | `2026-08-12/12-model-conformance-recheck.md` | `runs/2026-08-13/stranded-findings-triage.md` |
| P1-49 | `apply.ts`의 주석·거부문이 코드가 하지 않는 drift 검사를 주장한다 | P1 | **해소** ★ | `2026-08-12/12-model-conformance-recheck.md` | `runs/2026-08-13/stranded-findings-triage.md` |

### ★ 근거

- **P1-27** [재현안됨]: `src/apply.ts`가 구현돼 있었고 실제로 동작했다. `codefleet apply`가 워크스페이스를 바꾸고 `RUN_RESULT_APPLIED`를 원장에 남겼다.
- **P1-32** [부분해소]: 등재 당시 증상(늦은 `LAUNCH_FAILED`)은 재현되지 않았으나, **`init` 기본 역할이 여전히 `BACKEND_IMPLEMENTER`**이고 코드 작성 역할로는 검증 커맨드가 붙은 Task를 실행할 수 없다. 우회로 `INFRA_OPERATOR`를 썼다.
- **P1-35** [부분해소]: `run-record.md`가 커맨드 이름을 적는 것은 확인했으나, **리뷰 후 그 절이 거짓 문장으로 대체된다**(P1-50). 테스트 0건(`grep "rests on" test/` → 0). `CONVENTIONS.md` §10에 따라 [해소] 아닌 [부분해소].
- **P1-37** [해소]: Run 산출물 전체에 `taskId`+`taskRevision`이 실려 있다 (`contractRef` 스프레드, `src/run.ts:766`).
- **P1-41** [부분해소]: `.codefleet/task-revisions/`에 계약 본문이 저장된다(`codefleet task revision` 동작 확인). 다만 P1-39(상태 기계)는 미확인.

---

### ★ 근거 (P1-42 ~ P1-49) — `runs/2026-08-13/stranded-findings-triage.md`

- **P1-42** [해소]: `task-ledger.ts:484`가 `TASK_REVISION_SUPERSEDED`를 append한다. 선언·replay·생산 모두 존재.
- **P1-43** [해소]: `run.ts:908-915` + `test/approval-contract.test.ts:273`이 `sourceHashPolicy`를 단언. 로드맵 `[x] S6-5`.
- **P1-44** [해소]: `task-ledger.ts:249`가 `INVALIDATED`를 정의하고 `:285-292`가 승계 없을 때만 매긴다. **단서** — 코드는 `INVALIDATED`, 등재문은 설계의 `CANCELED`를 인용했는데 설계에서 `CANCELED`는 큐 아이템 상태로 나타난다. enum 정합은 **정의 확정 필요**로 남겼다.
- **P1-45** [미해소]: `task-ledger.ts:308-311` 주석이 "no event produces it"이라 적고 `DraftState`가 2개뿐이다.
- **P1-46** [미해소]: `OBJECTIVE_CLOSED`가 `ledger.ts:20`(타입)·`:242`(replay)에만 있고 **생산 0곳**.
- **P1-47** [미해소]: `review.ts:632` — `ACCEPTED`가 아니면서 번들이 `DEGRADED`가 아니면 `MIGRATION_READY`로 떨어진다. 실행 확인 가능(원장 직접 수정 필요).
- **P1-48** [해소]: `task-revision.ts:64-68,124`가 replay 실패 Objective를 `scanScope`에 분리 기록해 "relation 없음"과 "읽지 못함"을 구분한다. 커밋 `5055cf3`.
- **P1-49** [해소]: `apply.ts:205-208` 주석이 "This is not the drift check, and an earlier comment here said it was"로 정정됐다.

---

## P1 — 2026-08-13 등재 (P1-50 ~ P1-61)

| ID | 요약 | 현재 등급 | 상태 | 최초 등재 | 최종 갱신 |
| --- | --- | --- | --- | --- | --- |
| **P1-50** | 리뷰가 `run-record.md`를 다시 쓰며 검증 증거를 넘기지 않아 **거짓 문장**이 생긴다 | **P0** | 미해소 ★ | `2026-08-13/12-waiver-conformance.md` | `2026-08-13/13-output-fidelity.md` |
| P1-51 | waiver 정당화가 강제되지 않는다. 가드가 CLI 경로에서 발동 불가 | P1 | 미해소 ★ | `2026-08-13/12-waiver-conformance.md` | — |
| P1-52 | 검증 waiver(`WAIVED_ALLOWED`)가 소비만 되고 생산 코드가 0곳 | P1 | 미해소 ★ | `2026-08-13/12-waiver-conformance.md` | `2026-08-13/13-output-fidelity.md` |
| P1-53 | `codefleet prompt`가 Run이 실제로 보내는 프롬프트와 다른 문서를 쓴다 | P1 (유지) | **해소** ★ | `2026-08-13/13-output-fidelity.md` | `runs/2026-08-13/p1-53-contract-delivery.md` |
| P1-54 | `captureWorkspaceSnapshot`의 옵셔널 3필드가 부재를 값으로 날조한다 (잠복) | P1 | 미해소 ★ | `2026-08-13/13-output-fidelity.md` | — |
| P1-55 | `WAIVED_BY_POLICY`·`WAIVER`가 선언만 있고 생산·소비 0곳 | P1 | 미해소 ★ | `2026-08-13/13-output-fidelity.md` | — |
| P1-56 | `LocalReviewStatus`의 `SUPERSEDED`가 생산되지 않는다 | P1 | 미해소 ★ | `2026-08-13/13-output-fidelity.md` | — |
| P1-57 | `policies.harness.allowedModes`가 검증까지 받고 어디서도 읽히지 않는다 | P1 | 미해소 ★ | `2026-08-13/13-output-fidelity.md` | — |
| P1-58 | `allowProviderReportedCommandTruth`·`approvalRequiredForDestructiveCommands` 미소비 | P1 | 미해소 ★ | `2026-08-13/13-output-fidelity.md` | — |
| P1-59 | export/redaction 서브시스템 전체가 프로덕션 미연결 | P1 | 미해소 ★ | `2026-08-13/13-output-fidelity.md` | — |
| P1-60 | 검증 절·`renderPrompt` 경로를 단언하는 테스트가 0개 | P1 | **부분해소** ★ | `2026-08-13/13-output-fidelity.md` | `runs/2026-08-13/p1-53-contract-delivery.md` |
| **P1-61** | `npm test`의 posttest(rule coverage 체커)가 실패한다. 테스트 255건은 전부 통과하는데 주장 1건이 규칙 본문과 불일치 | P1 | **해소** ★ | `runs/2026-08-13/p1-53-contract-delivery.md` | `runs/2026-08-13/p1-61-posttest-green.md` |

### ★ 근거 (P1-50 ~ P1-61)

- **P1-53** [해소]: `test/prompt.test.ts` 3건이 수정 전 전부 실패하고 수정 후 전부 통과. fixture에서 preview와 Run 프롬프트가 `diff` 결과 바이트 동일.
- **P1-60** [부분해소]: `renderPrompt` 경로는 테스트가 생겼다(`test/prompt.test.ts`, 이 저장소의 첫 `renderPrompt` 테스트). **`run-record.md`의 검증 절은 여전히 테스트 0건** — `grep -rn "rests on\|What was verified" test/` → 0건.
- **P1-61** [해소]: 최초 실패 커밋은 `3db7d64`(S4) — worktree로 부모 `38cf9c9`(초록)와 대조해 실측. 원인은 조건 줄이 아닌 단어 하나를 인용한 주장이었고, 규칙(`788524d` 이후 불변)과 코드(`run.ts:808-820`) 모두 옳았다. 주장 제거 후 `npm test > /dev/null 2>&1; echo $?` → **0**, 커버리지 345/545(63.3%) 불변.
  재발 방지는 `runs/2026-08-13/p1-61-prevention.md`에서 구현했다 — 실패 배너(표 앞·무색·stdout), `.github/workflows/test.yml`(**러너 동작 미검증**), 규약 §11. 오염 구간은 `3db7d64`~`d697aa2` **9개 커밋**으로 한정됐다: 문서가 인용한 대상 커밋 8개(`754acea`·`6a458eb`·`244fac7`·`9bbfcbf`·`b750e9e`·`5d989f1`·`57a80de`·`38cf9c9`)를 실측해 전부 exit=0.

---

## 등급 변경 이력

| ID | 변경 | 사유 | 문서 |
| --- | --- | --- | --- |
| P1-4 → P0-12 | P1 → P0 | 승인 해시 누락이 I-3(승인이 실행을 구속한다)를 무효화 | `2026-08-12/11-model-conformance.md` |
| P1-50 | P1 → **P0** (ID 유지) | 산출물에 거짓 문장을 만드는 결함은 미구현보다 무겁다 | `2026-08-13/13-output-fidelity.md` |
