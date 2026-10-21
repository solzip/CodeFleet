# G5 — Controlled Hybrid 협업과 병렬 실행

- 일시: 2026-10-19 (Asia/Seoul)
- Worktree: `.codefleet/worktrees/alpha-g0`
- 브랜치: `feature/alpha-g0-refresh`
- HEAD: `c61e9b829b62dd41336a7225bf3b9165136484db`
- 선행: [G4 기록](alpha-g4-workflow-dag.md), 구현 설계 패키지, CLAUDE.md, concept-foundation, 제품 architecture/progress.
- G1~G4 미커밋 변경·기존 기록을 보존했다. 대상 저장소 커밋·푸시·PR·배포·실제 모델 호출은 하지 않았다. 임시 Git fixture commit만 테스트에 사용했다.

## 선행 확인

실제 cwd, branch, HEAD, 미커밋 파일 목록을 확인했다. Controller/Judge/Store/Provider/Verifier/Delivery 및 G4 scheduler와 persistence를 분석했다. 별도 실행·판정 엔진이나 Legacy 교체를 만들지 않았다.

decision-debt preflight는 G4 기록 및 실행 계약·단계·수용 문서 네 개를 대상으로 했다. 후보 1개, 제외 3개, warning 0. 과거 실패 반증과 성공 범위 구분을 충돌로 읽은 후보는 원문과 G4 최종 로그를 대조해 해소했다. 이는 Live Provider 안전성 인증이 아니다.

## 실제 수정·추가 파일

| 파일 | 책임 |
| --- | --- |
| `src/workflow/definition.mjs` | 순차 형식 보존, hybrid 계약·역할·resource locks·결정적 batch 선택 |
| `src/workflow/persistence.mjs` | 병렬 예약·충돌 검사·승인 철회·재계획 제안의 읽기 전용 평가 |
| `src/workflow/collaboration.mjs` | 신규 역할 위임 토큰, 구조화 메시지 송수신·영속화·중복 처리 |
| `src/alpha/controller.mjs` | 같은 Controller의 병렬 조정, 부모 fencing, 직렬 수집·통합, 최종 tree 재검사 |
| `src/alpha/store.mjs` | 선택적 메시지 및 확장 버전 테이블 추가 |
| `test/hybrid.test.mjs` | 신규 G5 테스트 19개 |
| `package.json` | 전체 테스트에 hybrid suite 추가 |
| README 두 개, `docs/INDEX.md`, `docs/product-completion/progress.md` | 현재 상태 링크·문서 수 |
| 이 문서, G5 로그·source evidence | 구현·실행 근거 |

[소스 해시](alpha-g5-source-evidence.json)는 이전 단계 manifest와의 비교를 포함한다. G1 Judge/Validator/테스트, G2 Provider, G3 모듈/CLI/테스트, G4 테스트 파일의 해시는 유지했다. Controller/Store/Workflow/package는 의도적으로 확장했다. 최초 evidence 작성 스크립트는 G1의 배열 형식을 object map으로 잘못 읽어 실패했고 형식을 구분해 다시 작성했다. 기존 manifest를 수정하지 않았다.

## G4와의 통합 구조

기존 Workflow schemaVersion 1은 순차 상한 1이다. 새 hybridDefinition만 schemaVersion 2이며 maxParallel 기본 1, 허용 범위 1~3이다. Alpha V1 Contract의 schemaVersion은 그대로다. 역할 assignments, resource locks, maxParallel, policySnapshotRef 모두 workflowHash와 승인에 묶인다.

Scheduler는 priority 오름차순, 동률 id 순서다. 선행 작업이 SUCCEEDED인 READY 항목만 선택한다. 공유 resource가 있으면 같은 batch에서 제외한다. 동일 파일 수정은 그래프 검증에서 차단한다. 원본 maxAttempts·시간·비용·기존 Docker 자원 제한을 유지한다. 동일 Store의 다른 Workflow는 활성 Attempt와 동시에 예약할 수 없다. 기존 독립 V1 실행에 전역 스케줄러를 추가하지는 않았다.

외부 호출 전에 SQLite 트랜잭션으로 각 Attempt를 예약하고, Promise.allSettled로 batch 전체 종료를 기다린다. 결과는 예약 순서로 반영한다. Provider 호출/응답 도착 순서는 통합 순서가 아니다. 한 작업이 실패해도 이미 실행 중인 무관한 작업의 검증된 성공은 보존하며 다음 batch·최종 통합은 차단한다.

Batch 예약 도중 중단되면 일부 STARTED가 남을 수 있다. 실행하지 않았다고 추정해 자동 재예약하지 않는다. 상태 변경의 최종 소유자는 기존 Controller다. Provider와 메시지는 직접 성공이나 권한을 확정하지 못한다.

## 역할과 메시지 계약

각 WorkItem은 Planner, Architect, Executor, Reviewer 역할별 agent identity를 갖는다. 역할을 Provider에 고정하지 않는다. Executor는 기존 PROPOSAL_ONLY 편집 요청만 수행하고 나머지는 읽기·제안 계약이다. trusted host의 collaborate 연결점과 Fake Provider로 위임을 검증했다. 역할별 모델을 자율 실행하는 기능은 없다.

QUESTION, FINDING, PROPOSAL, REVIEW_FEEDBACK, RESULT_SUBMITTED를 지원한다. sender, role, runId, workItemId, attemptId, revision, correlationId, messageId, payload를 저장한다. 정확한 envelope 키·ID 형식·payload 32 KiB 상한을 검사한다. 역할 채널은 같은 Run의 correlation 메시지를 읽는다.

위임 토큰은 호스트가 발급하는 프로세스 내부 WeakMap identity다. AI JSON으로 sender나 토큰을 복원하지 못한다. 송신 시 owner/lease/control, 승인, graph hash/revision, STARTED Attempt를 재검사한다. 동일 messageId·payload는 중복 삽입하지 않으며 다른 payload는 거절한다. 이는 로컬 호스트 연결점이며 인증된 원격 transport가 아니다.

모든 메시지는 PROVIDER_REPORTED_ONLY다. RESULT_SUBMITTED나 payload의 COMPLETED·권한 요청은 Judge 증거가 아니다. 메시지와 이벤트는 같은 트랜잭션이며 SQL trigger 실패 시 함께 rollback되는 것과 재오픈 후 보존을 검증했다.

SQLite user_version은 기존 2를 유지한다. enableCollaboration은 agent_messages 및 workflow_extensions를 추가하고 controlled-hybrid 확장 버전 1을 확인한다. 기존 Run/Event/Artifact/Graph row를 변환·삭제하지 않는다. V1→V2 호환 회귀도 통과했다. 운영 사용자 DB를 직접 마이그레이션한 것은 아니다.

## Workspace 격리와 ChangeSet 통합

자식별로 기존 Alpha snapshot의 고유한 임시 candidate directory를 사용한다. 디렉터리 복사나 Git worktree를 OS sandbox라고 취급하지 않는다. 원본 repo·미커밋 변경은 수정하지 않고 기존 clean repository 요구를 유지한다. Provider는 구조화 편집을 제안하며 호스트 applyEdits가 범위를 검사한다. 기존 격리 Verifier와 Judge를 재사용한다.

ChangeSet은 base, parent, workflow revision/hash, 정확한 WorkItem V1 계약, baseline·accepted·evidence artifact 해시, Judge ACCEPT에 묶인다. 미검증 결과·다른 revision·범위 밖 파일을 수집하지 않는다. 파일 충돌을 다시 검사하고 예약 순서대로 직렬 수집하여 integration artifact를 만든다. 마지막 synthetic child는 모델 호출 없이 합친 변경에 원본 계약의 모든 보호 테스트를 실행한다. 서로 다른 파일도 통합 검증을 생략하지 않는다.

최종 tracked Git snapshot 파일 내용 hash를 다시 계산한 뒤 부모 완료를 판정한다. 별도 Git commit을 생성하지 않는다. 검증 후 candidate 내용이 달라지면 WAITING_HUMAN으로 전환하고 부모 accepted/evidence 참조를 제거한다. 완료 Run의 execute 재조회도 같은 검사를 수행한다. 과거 자식 artifact는 감사용으로 남긴다. 임시 후보 디렉터리를 외부에서 삭제한 경우에도 완료 재확인은 차단된다.

## 재계획·복구·취소

PROPOSAL은 제안으로만 저장된다. reviewRevisionProposal은 revision, scope, budget, DAG, identity를 검사해 BLOCKED 또는 REQUIRES_APPROVAL을 반환하며 승인·활성화하지 않는다. 미실행 그래프는 기존 reviseWorkflow CAS와 새 hash 승인으로 변경한다. Hybrid에 Attempt가 이미 있으면 revision 혼합을 피하기 위해 새 Workflow를 요구한다. 실행 중 계약 변경·권한/예산 확대의 자동 재계획은 없다.

승인 철회/만료, pause/cancel, 예산 만료, lease 상실을 모든 활성 자식에 전달한다. 자식도 실행 경계마다 부모 owner/revision/control/승인을 확인한다. 과거 fencing 또는 이미 실행한 Hybrid 자식을 직접 재실행할 수 없다. 종료된 Attempt는 재사용하지 않는다.

실제 로컬 Node Coordinator를 GENERATING과 final VERIFYING에서 process.exit(91)로 종료했다. 다시 열면 RECONCILING이며 모델 재호출·새 예약이 없었다. 종료가 불명확한 STARTED를 자동 재실행하지 않는다. 이미 COMPLETED인 자식은 기존 G4 증거 기반 읽기 전용 대조를 재사용한다. 오래된 lease 결과 커밋 거절, 로컬 자식 프로세스 timeout, 병렬 취소와 승인 철회를 검증했다. 전원 차단·원격 프로세스 트리·Live 모델 세션 복구는 미검증이다.

## 실행 명령·종료 코드·범위

| 실행 | 종료 코드 | 결과 |
| --- | --- | --- |
| 초기 G4+G5 focused | 1 | 신규 테스트 구성 오류 2건; 기존 G4 회귀 성공, Docker 제외 1 |
| focused 후속 | 0 | 10 통과, Docker 제외 1 |
| 추가 fixture 최초 실행 | 1 | subprocess script 문자열 문법 오류; 수정 후 재실행 |
| Docker sandbox 실행 | 1 | 15 통과, Docker 접근 환경 실패 1; 승인된 재실행으로 확인 |
| Docker focused 재실행 | 0 | 16/16, 제외 0 |
| 최초 npm.cmd test | 1 | Legacy 324 성공, Alpha 계열 107/108; 신규 병렬 호출 순서 가정 실패 |
| 최종 npm.cmd test | 0 | Legacy 324 + Alpha 39 + Provider 15 + Intent 14 + Workflow 21 + Hybrid 19 = 432, 제외 0; posttest 포함 |
| node src/alpha/cli.mjs doctor | 0 | 5/5; Node v24.14.1, Claude 2.1.303; 모델 호출 없음 |
| npm.cmd run posttest (문서 반영 후) | 0 | coverage·링크·인용·선언 사실 검사; 오류 0, 기존 인용 경고 11 |
| git diff --check | 0 | 공백 검사 |

전체 테스트 환경: CODEFLEET_TEST_DOCKER=1, CODEFLEET_TEST_JAVA=(Get-Command java).Source, CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45. 준비된 Node/Maven 이미지를 사용했다. 새 이미지 설치·다운로드는 하지 않았다.

실제 Docker에서 두 독립 WorkItem의 실패 baseline·수정 candidate와 최종 합친 후보의 보호 테스트를 실행했다. 최대 세 작업 동시성, semantic conflict, state/fencing 변조와 취소는 결정적 Fake Harness/Provider 반증이다. Node/Maven 격리·실제 JDK parser 기존 회귀도 포함했다. 다중 Java Workflow 실실행은 별도 미검증이다.

신규 병렬 테스트가 Provider 호출 도착 순서와 영속 예약 순서를 혼동해 최초 전체 실행에서 실패했다. 호출 대상 집합과 예약/통합의 결정적 순서를 각각 검사하도록 고쳤다. 기존 G4 테스트·기대값과 기존 Quality Gate는 변경하지 않았다. 정책·coverage baseline도 약화하지 않았다.

근거: [최종 전체](codefleet-g5-full.log), [초기 전체 실패](codefleet-g5-full-failed.log), [Docker focused](codefleet-g5-focused-docker.log), [초기 실패](codefleet-g5-initial.log), [문법 실패](codefleet-g5-syntax-failed.log), [sandbox 실패](codefleet-g5-sandbox-failed.log), [Doctor](codefleet-g5-doctor.log). 공개 로그의 개인 로컬 프로필 경로는 제거했다. 기존 인용 경고 11개는 과거 기록 경고로 유지했다.

[문서 반영 후 검사](codefleet-g5-docs.log)도 종료 코드 0이다. 최종 소스 8개의 manifest 해시 불일치 0건, 공개 G5 파일 11개의 개인 프로필 경로 검출 0건을 확인했다. 문서 작성 중 sandbox 프로세스 생성 오류 1909가 발생했으며 파일 미생성을 확인하고 승인된 실행 환경에서 마무리했다. 제품 테스트 성공으로 계산하지 않았다.

## 완료 여부와 G6 조건

**G5는 제한된 로컬 계약·Fake 협업·실제 통합 검증 범위에서 완료**했다. 기존 G4 순차 실행, Alpha V1, Judge, Provider, Intent, Legacy, Lease/Recovery/Delivery 회귀를 보존했다. G6은 시작하지 않았다.

남은 Capability Gap:

- Codex PROPOSAL_ONLY 보안 capability 미검증으로 실행 차단 유지. production strict Workflow의 Claude capability도 검증 완료로 승격하지 않았다. 기존 Claude V1 호환 경로만 보존한다.
- Live Codex·Claude 협업, Live Planner, 모델 품질/비용 실측 미검증.
- G3 파일명 기반 분석 한계 유지. NEEDS_INPUT/CAPABILITY_GAP 자동 승인 없음.
- 동일 파일 다중 수정, 선행 patch를 다음 Provider context에 전달하는 데이터 의존 실행, 실행 이력이 있는 Hybrid 그래프의 in-place 재계획은 미지원이다. DAG는 실행 선행조건이다.
- 다중 호스트 메시지 transport·원격 agent 인증·통합 CLI/TUI는 후속 범위다.

G6은 별도 지시와 이 제한을 보존하는 제품 UX·승인/복구 표시 설계를 전제로 한다. Live 호출과 커밋·푸시·PR·배포는 각각 별도 승인이 필요하다. 로컬 테스트 성공은 Live Provider 보안 승인이나 출시 판정이 아니다.
