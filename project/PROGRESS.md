# 구현·검증 진행 현황

갱신: 2026-11-13 · 현재 기준: `afe4cbe` + 미커밋 새 세션 수용 도구 후보. 이전 구현 후보 `875182f` (`b3f8b985a903fd255983da01d6f284df3dea14aa` 기준 구현)의 기록은 당시 범위의 근거로 보존한다.
제품 목적은 [제품 원칙](../docs/PRODUCT_VISION.md), 구조는 [아키텍처](../docs/product-completion/architecture.md), 수락 조건과 순서는 [로드맵](../docs/product-completion/roadmap.md)에서 관리한다.

## 현재 결과: Codex 새 세션 통합 Local 수용 완료

기준은 `afe4cbe`와 아래 미커밋 재개 회귀 후보다. 기존 정상 CHANGE 수용과 one-shot/비용 승인 기록은 재실행·재사용·초기화하지 않았다. 준비 이후 사용자가 기능 단위 통합 검증 진행을 요청하여, 동일한 새 Task의 제안 → Owner 소스 적용 → 새 세션 재개 → Owner 검증 → Local 완료를 하나의 수용 흐름으로 관측했다. 최종 `finalize`는 exit 0, `CODEX_TURN_OBSERVED_AND_OBJECTIVE_COMPLETE_LOCAL` / reasons 0건 / `currentTreeComplete=true`였다. 이는 선택한 단일 Codex 경로의 감독형 Local 수용이며 전체 제품·Protected·실제 Compaction 수용이 아니다.

새 fixture `a08a006e`의 첫 proposal-only Codex CLI 0.167.0 Turn은 별도 승인된 실행으로 exit 0, `CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW`였다. 2026-11-13 06:47:59~06:48:49 UTC에 Thread 1개·Turn 시작/완료 각 1회·실패 0회가 관측됐으며 필수 MCP와 중간 상태 조회가 모두 성공했다. Provider 보고 토큰은 input 214,231 / output 1,138이고 금액·잔여 한도는 UNKNOWN이다. 모델은 프로젝트 소스와 테스트를 변경하지 않았다. Task `task-d21b395a-af22-4c1a-9f61-adbfd36053e7`는 이때 revision 6, `implement=FILESET_PROPOSED`, `verify=PENDING_VERIFICATION`이었으며 아래 후속 효과·검증까지 같은 Task로 연결했다.

`review`는 exit 0으로 `src/todo.mjs` 한 파일의 후보를 준비했다. 후보는 입력 자료형을 검사하고 trim 뒤 빈 문자열을 거절하며 trim된 값을 반환한다. Owner가 별도 PowerShell에서 대문자 `APPLY`를 직접 입력해 `MATERIALIZED` exit 0이 됐고, State 재관측과 체크포인트에서 revision 7·`AWAIT_TEST_REVIEW`·효과 `SETTLED`·검증 시도 0건을 확인했다. 적용 receipt는 `70e1af0e68f23eb7135905318a1be8e75d9174539ae91370de9f9e26aa872c4c`, 소스 hash는 `c9e99eb4c2eeec32c27068cd12acfb20e603664be824041a33cb1c9ba9a31e7c`, 후보 tree hash는 `5c3fe8bda4f13dd2d1629c2860b2c50cb1c8e094924ff1f63f7548c7d66cd330`이다. Agent가 Owner 확인 단어를 대신 입력하지 않았다.

실제 사용 중 Host 채팅에 `APPLY` 확인 단어가 입력됐지만, 현 revision 3는 채팅 승인을 Owner TTY 입력으로 전달하는 기능을 제공하지 않는다. 별도 창에서는 최초 리뷰 만료 1회와 소문자 `apply`에 따른 거절 1회가 발생했다. 수락 event가 없는 상태를 적용 완료로 기록하지 않았으며, 현재 후보의 새 리뷰로만 재검토했다. 이후 대문자 `APPLY`와 최종 `VERIFY`는 사용자가 직접 수락했다. 승인 의사 부족과 구분되는 승인 전달·대소문자·만료 안내 UX의 제약으로 남긴다. 실패한 리뷰·거절·기존 모델 Turn과 비용 기록은 보존했다. 실제 사람의 준비/개입/검토 시간을 별도 계측하지 않았으므로 생산성 개선 근거로 사용하지 않는다.

`checkpoint`와 `preflight-recovery`는 각각 exit 0이었다. 두 번째이자 마지막 별도 승인된 Codex Turn은 2026-11-13 07:03:45~07:03:57 UTC에 실행돼 exit 0, `CODEX_NEW_SESSION_CHECKPOINT_RECOVERED_AWAIT_OWNER_TEST_REVIEW`였다. 첫 Thread와 다른 새 Thread에서 대화 이력·Task ID 없이 빈 `goal_status`로 Task를 발견하고 해당 Task를 재조회했다. `checkpointPreserved`, `newThread`, `taskRediscovered`, `nextActionReported`가 모두 true이며 다음 행동은 `REVIEW_TESTS`였다. 원래 후보·계약·제어·예산·event/Run digests는 무변경이었다. Provider 보고 토큰은 input 51,582 / output 162로, 두 Turn 합계는 input 265,813 / output 1,300이다. 금액과 잔여 한도는 UNKNOWN이며 USD 상한은 집행하지 못한다.

이후 별도 Owner 테스트 창에서 대문자 `VERIFY`를 직접 입력해 고정 명령 `node --test --test-reporter=tap test/todo.test.mjs`를 1회 실행했다. 2026-11-13 07:04:51 UTC에 기록된 Local Evidence는 exit 0, 1 PASS / 0 FAIL / 0 SKIP이며 위 동일 candidate tree·Workflow·Task revision 7에 결합됐다. Evidence ref는 `2d88cd9130b457e57c637a73fb434e15fcf134e27453285f85ef28ba77417ef9`이고 최종 Task는 revision 8, `implement=MATERIALIZED`, `verify=LOCAL_PASSED`다. 최종 판정의 `continuation=COMPLETE_LOCAL`, `reportedLocalEvidence=LOCAL_ONLY_UNPROTECTED`, `hostLiveTrust=PROVIDER_REPORTED_ONLY`, `ownerAuthentication=NOT_ESTABLISHED`, `protectedVerification=UNSATISFIED`를 구분한다. 진행 문구에는 완료 후에도 이전 단계의 `next`/`OBSERVED_AWAIT_OWNER_TEST_REVIEW`가 남는 표시 제약이 관측돼 후속 개선 대상으로 남긴다. 최종 수용 판단은 해당 문구가 아니라 현재 후보·Evidence와 최종 verdict에 따른다.

`scripts/codex-live-acceptance.mjs`에 새 fixture 전용 `prepare-recovery`, 확정 적용 뒤의 `checkpoint`, 별도 `preflight-recovery`/`run-recovery`를 연결했다. 기존 Store·WorkReport·프로필·Lease·Native Owner 경계를 유지하고 새 scheduler/권한 issuer/Task 상태 저장소를 만들지 않았다. `src/hosts/codex-mcp.mjs`의 명시 `WORK_REVIEW_V1 --status-only`는 발견·상태 조회만 노출하며 모든 변경/리뷰 생성 호출을 거부한다. 테스트는 별도 Thread의 발견·현재 행동 보고, 체크포인트 무변경, 같은 Thread·소스 drift·예상 밖 도구·계획/체크포인트 변조·PAUSE·lease·손상 증거·누락 계획·부분 receipt의 차단을 포함한다. 계약과 사용 절차는 기존 설계·Host 안내에 반영했다. 오프라인 검증에 더해 위 선택된 실제 Codex 새 세션 통합 Local 경로를 관측했지만, 전체 프로필 수용은 미완료다.

현재 비공개 fixture는 `.codefleet/codex-new-session-20261113-a08a006e/`이며 `manifest.json`과 `recovery-plan.json`에 별도 시나리오·runner/runtime 결합을 고정했다. runner SHA-256은 `2790d9877e23d5df21bb5bd5b554bf2196dfeb55643c801d6a725260409b6cd2`다. 준비 시점에는 exit 0, 모델 Turn·Owner 권한 0건이었으며 이후 두 Turn과 Owner 효과는 위에 별도로 기록했다. 계획의 최대 2개 Turn을 모두 소모했으며 각 300초, 자동 재시도 없음, 비용 UNKNOWN / USD 상한 없음의 경계를 유지했다. 첫 제안과 새 세션의 intent/receipt, `recovery-checkpoint.json`, Task/Run/Event와 Local Evidence를 보존한다. 앞서 준비한 `.codefleet/codex-new-session-20261113-68b93ef0/`는 응답 필드 매핑 전의 후보로 모델 0건 상태를 보존하며 사용하지 않는다. 초기 PATH preflight는 공식 npm shim 대상 불일치로 exit 1이었고, 기존 공식 npm 경로를 명시한 비과금 preflight는 exit 0이었다. 실제 CLI는 0.167.0이며 설치·로그인·전역 설정은 변경하지 않았다. 어느 fixture의 기록도 재실행하거나 초기화하지 않는다.

이번 검증 환경은 Windows x64 / PowerShell / Node v24.14.1이다. `node --test test/codex-live-acceptance.test.mjs test/codex-mcp.test.mjs`는 exit 0, 38 PASS / 0 FAIL / 0 SKIP이었다. 체크포인트의 고정 목표·Git base·소스/테스트 경로 검사 보강 후 양성 새 세션 합성 사례를 다시 실행해 exit 0, 1 PASS를 확인했다. 최종 프롬프트 필드 매핑 보강 뒤 `node --test --test-name-pattern="synthetic new-session discovery|synthetic recovery rejects unexpected-tool" test/codex-live-acceptance.test.mjs`는 exit 0, 2 PASS / 0 FAIL / 0 SKIP이었다. `npm.cmd run test:work-review`는 exit 0, 20 PASS, `npm.cmd run test:host-core`는 exit 0, 135 PASS, `npm.cmd run pretest` 후 `npm.cmd run test:legacy`는 각각 exit 0, 327 PASS였다(각 FAIL/SKIP 0건). `npm.cmd run test:installed-goal-loop`는 sandbox npm 캐시 EPERM으로 최초 exit 1, 1 PASS / 2 FAIL이었으며 승인된 동일 명령 재실행은 exit 0, 3 PASS / 0 FAIL / 0 SKIP이었다.

`npm.cmd run test:codex-mvp` 최초 실행은 exit 1, 318 PASS / 1 FAIL / 4 SKIP이었다. 실패한 `delivered-status` 시험은 `afe4cbe`와 동일한 경로에서 가짜 Store의 `db` 누락으로 공통 Work guard가 중단된 것이다. 제품 guard나 기존 단언을 완화하지 않고 시험 seam에 실제 임시 Store DB를 연결했다. 해당 파일 재검증은 exit 0, 8 PASS / 0 FAIL / 0 SKIP, 전체 동일 명령 재검증은 exit 0, 319 PASS / 0 FAIL / 4 SKIP이었다. 제외 4건은 Windows에서 비이식적인 POSIX 실행 비트와 두 predecessor symlink 경계 시험이다. `npm.cmd run posttest`는 exit 0, Markdown 37개·링크 236개·인용 4개·선언 사실 42건 오류 0이며 `git diff --check`도 exit 0이다. 기존 coverage/anchor 기준선은 변경하지 않았다. 전체 Docker/보호 보안 회귀는 NOT_RUN이며 위 기본 회귀를 보호 수용으로 승격하지 않는다.

이 통합 시나리오의 소스·재개·검증·Local 완료 조건은 충족했다. 남은 우선 개선은 위 승인 전달·입력/만료 안내와 완료 후 상태 문구다. 현재 runner와 runtime은 Live 후보 결합을 보존하므로 후속 변경은 새 후보로 오프라인 검증하고, 이 과거 결과를 새 후보의 Live 수용으로 자동 승계하지 않는다. 실제 Compaction, VERIFY_CURRENT·실패/Repair·미해결 종료의 별도 Host 실증, Claude·Protected·macOS/Linux·6쌍 가치 비교는 여전히 미검증이며 추가 모델 실행은 새 범위와 별도 승인이 필요하다.

## 재개 안전성 회귀 근거

기준은 최신 main `afe4cbe`다. 해당 커밋의 정상 CHANGE Codex Host Live Local 수용은 완료된 기존 근거로 유지하며 재실행하지 않았다. 아래 운영 전 검증 표와 실패 기록은 당시 범위의 이력이다. 현재 전체 프로필 수용은 아직 미완료다.

다음 WorkItem은 revision 3의 UX-03/UX-04/UX-05 재개 안전성 검증으로 선정했다. 정상 CHANGE 이후에도 남은 실패·재개 수용 조건에 대응하며, 새로운 Host·협업·제품 범위 확대보다 기존 단일 Agent 경로의 증거 보존을 먼저 검사한다. 파일 범위는 `test/work-review.test.mjs`와 이 상태 문서이며, 기존 Store·WorkReport·Native 승인·Repair 경로를 재사용한다. 사용자 요청은 저장소 구현·오프라인 검증에 적용하며 실제 모델 Turn·Owner 효과·비용 사용 승인은 부여하지 않는다.

새 임시 시험 State에서 읽기 전용 Store를 여는 별도 Node 프로세스로 Task 발견과 현재 상태를 조회하는 회귀를 구현했다. 실패 Evidence와 소모 예산 보존 후 한 번의 승인된 합성 Repair, PAUSE/UNPAUSE epoch와 구승인 거부, 완료 후 외부 소스 변경의 STALE 판정, 손상 Evidence의 READ_ERROR, Run 완료/Task 연결 중단의 UNRESOLVED와 재실행 거부를 검사한다. 합성 승인은 SYNTHETIC/OFFLINE이며 기존 one-shot fixture·비용 승인 기록은 사용하거나 초기화하지 않는다. 제품 런타임 변경은 필요하지 않았다.

검증 환경은 Windows x64 / PowerShell / Node v24.14.1이다. `node --test --test-name-pattern="fresh-process recovery" test/work-review.test.mjs`는 exit 0, 3 PASS였고, 중단 경계 보강 후 `node --test --test-name-pattern="work Run-completed" test/work-review.test.mjs`는 exit 0, 1 PASS였다. `node --test test/work-review.test.mjs test/codex-mcp.test.mjs`는 exit 0, 22 PASS였다. `npm.cmd run pretest` exit 0 후 `npm.cmd run test:legacy`는 exit 0, 327 PASS, `npm.cmd run test:host-core`는 exit 0, 135 PASS였다. 각 시험의 FAIL/SKIP은 0건이다. `npm.cmd run posttest`는 sandbox 계정의 Git 소유권 제한으로 링크 검사에서 최초 exit 1이었으며, 설정 변경 없이 승인된 동일 명령 재실행은 exit 0이었다(Markdown 37개·링크 234개·인용 4개·선언 사실 42건). `git diff --check`도 exit 0이다. 이는 선택한 기본 회귀의 오프라인 근거이며 전체 보안/보호 수용이 아니다. coverage·anchor 기준선은 변경하지 않았다.

실제 Codex 새 세션·Compaction, VERIFY_CURRENT·실패/Repair·미해결 종료의 Host Live 수용, Claude Host Live, Protected 검증, macOS/Linux와 6쌍 가치 비교는 이번 작업에서 NOT_RUN이다. 다음 허용 작업은 이 오프라인 근거를 유지한 채 아직 관측하지 않은 Host 시나리오의 새 fixture·한도·별도 승인을 준비하는 것이다. 기존 수용 결과나 one-shot 승인을 새 시도에 이전하지 않는다.

## Work review 구현 후보와 운영 전 검증

소유자가 운영 전 작업 2~7 구현과 이어지는 8~10 검증을 요청했다. 범위는 revision 3의 기존 Git/Node 프로젝트·단일 Agent·감독형 LOCAL_ONLY다. 기존 Controller·Task·Store/Event·예약·Lease·Recovery·Evidence/Judge를 재사용한다. Git 공개 작업, 전역 설치/설정 변경, 기존 Task 이관, 별도 모델 프로세스는 범위에 넣지 않았다.

| WorkItem | 파일 범위·의존성 | 수락 조건과 현재 수준 |
| --- | --- | --- |
| 2 프로필·기록 | tasks, work-review. 기존 Task 생성/준비에 의존 | 불변 요청·profile 결합, 기존 event/extension 사용. IMPLEMENTED_CANDIDATE |
| 3 권한 경계 | Native, reservations, CLI, repair, revision, coordination. 2에 의존 | Native 승인 context·controlSeq가 시작/실행/확정 guard까지 전달, raw 효과 우회 차단. IMPLEMENTED_CANDIDATE |
| 4 읽기 보고 | work-report, CLI. 2와 기존 Judge에 의존 | 읽기 전용 상태·현재 후보·P01~P14 우선순위·실패/불명/잔여 예산. IMPLEMENTED_CANDIDATE |
| 5 MCP·Validator | codex-mcp, bootstrap Validator. 2~4에 의존 | 명시 opt-in·고정 한도·Task 탐색·검증 전용 예외, legacy 기본값/거부 보존. IMPLEMENTED_CANDIDATE |
| 6 Owner UX | work-owner, Native, install Skill 안내. 3~5에 의존 | 별도 TTY 검토·확인, 비TTY/거절 차단, 완성 argv. IMPLEMENTED_CANDIDATE |
| 7 중단·종료 | work-review, materializer, reservations. 2~6에 의존 | 두 commit 연결, 제어 epoch, 하위 행 종료 검사·불명 포기. IMPLEMENTED_CANDIDATE |
| 8 시험·회귀 | work-review 및 관련 기존 suite. 2~7에 의존 | 정상/실패/불명과 기존 경계 검증 진행. 보호 전체 수용과 구분 |
| 9 설치·안내 | installer, 설치/패키지 시험, Host guide. 2~8에 의존 | 설치본 CHANGE Local 완료와 수정 설치물 보존 확인. 실제 Host 발견과 구분 |
| 10 Host Live | 실제 Host·Owner·고정 환경. 8~9에 의존 | 실제 CLI 0.167.0 Turn 1회 관측. 첫 Goal MCP 실패로 HUMAN_RECONCILIATION_REQUIRED. Owner 직접 확인·실제 Compaction은 NOT_RUN |

실행 환경은 Windows x64 / PowerShell 5.1 / Node 24.14.1이다. 시험은 임시 저장소와 State를 사용하며 테스트용 승인은 SYNTHETIC/OFFLINE이다. 자동 시험이 Owner를 인증하거나 실제 Host 전체 수용을 입증하지 않는다. Docker 사전 조회는 설정 파일 접근 거부로 exit 1이었다. 선택한 Local 기본 경로의 선행 조건은 아니며 보호 수용으로 전환하지 않는다.

개발 중 신규 시험 최초 7개는 5 PASS / 2 FAIL이었다. Task event의 runId 덮어쓰기로 적용 연결이 누락된 원인을 수정한 뒤 7 PASS, 추가 중단 시험 포함 10 PASS를 확인했다. 이어 Native/예약/시간/MCP/신규 시험 통합은 exit 0, 99 PASS / 0 FAIL / 0 SKIP이었다. 이후 설치 경로와 추가 검증 변경은 아래 최종 결과를 별도로 따른다.

Host Core 첫 실행은 exit 1이었다. readOnly Host 조회에서 초기화를 호출하는 회귀 4건을 확인하고 수정했으며 관련 파일 재실행은 exit 0, 6 PASS였다. 전체 Host Core 재실행을 수행한다. 패키지 시험 최초 실행은 npm 캐시 EPERM으로 2 FAIL, 승인된 재실행은 공개 계약 문서 오분류로 2 FAIL이었다. 배포에 이미 명시된 공개 계약 11개만 허용하고 비공개 경로 부정 시험을 추가한 뒤, 작업별 캐시를 사용하는 오프라인 패키징/임시 설치 시험은 exit 0, 3 PASS였다. 배포 파일 제한·보호 gate·기준선은 낮추지 않았다.

최종 변경에는 Owner의 목표·전체 profile·변경 전후 소스 표시와 복사 가능한 PowerShell 명령, repair 제안 이후 REVIEW_FILES 안내를 포함했다. 모의 TTY는 오프라인 UI 시험이며 실제 Owner 신원이나 Host 승인을 입증하지 않는다. 상태 정책 시험은 P01~P14와 순서가 있는 조건 13개의 모든 쌍 78개를 검사한다. 이는 정책 함수의 우선순위 근거이며 모든 실제 장애 조합을 실행했다는 뜻은 아니다.

| 검증 명령·범위 | 관측 결과 | 한계 |
| --- | --- | --- |
| `npm.cmd run pretest` → `npm.cmd run test:legacy` | 각각 exit 0, Legacy 327 PASS / 0 FAIL / 0 SKIP | Legacy 기준선·계약 유지. 새 프로필 수용 아님 |
| `npm.cmd run test:host-core` 최종 재실행 | exit 0, 135 PASS / 0 FAIL / 0 SKIP | Docker-free 기본/Local 경로. 보호 전체 회귀 아님 |
| `node --test test/work-review.test.mjs test/native-local.test.mjs` | exit 0, 43 PASS / 0 FAIL / 0 SKIP | 당시 신규 15개와 Native 경계. 후속 Owner 표시·MCP 명령 변경은 별도 확인 |
| `node --test test/work-review.test.mjs test/codex-mcp.test.mjs` 최종 재실행 | exit 0, 19 PASS / 0 FAIL / 0 SKIP | 신규 16개·기존 MCP 3개. 실제 Host MCP 도구 호출/Owner 승인은 아님 |
| Repair 안내·상태 정책·설치본 관련 재실행 | exit 0, 3 PASS / 0 FAIL / 0 SKIP | 영향 범위 확인 |
| 모의 Owner TTY·설치본 CHANGE 관련 재실행 | exit 0, 2 PASS / 0 FAIL / 0 SKIP | 실제 Owner/Host Live 아님 |
| `npm.cmd run test:installed-goal-loop` 최종 재실행 | exit 0, 3 PASS / 0 FAIL / 0 SKIP | 실제 tarball·오프라인 임시 설치·Codex/Claude Skill runtime. 모델 호출 없음 |
| `.mjs` 구문 검사 | exit 0, src의 84개 오류 0 | TypeScript 전체 구문 검사와 구분 |
| `node --test test/doc-layout.test.ts` | exit 0, 3 PASS | 문서 배치 검사 |
| `npm.cmd run posttest`, `git diff --check` 최종 확인 | 각각 exit 0. Markdown 37개·링크 233개·인용 4개·선언 사실 42건 오류 0 | 외부 링크 내용·실제 Host·보호 검증을 증명하지 않음. coverage/anchor 기준선 변경 없음 |

8번은 위 선택된 Local 회귀의 근거를 확보했으며 전체 보안/보호 회귀는 NOT_RUN이다. 9번은 설치본과 패키지의 오프라인 근거를 확보했으며 실제 Host의 Skill 발견은 NOT_RUN이다. 10번은 Codex CLI 0.167.0의 호환과 로그인·preflight를 확인하고 실제 Turn 1회를 관측했지만 첫 Goal MCP 실패로 `HUMAN_RECONCILIATION_REQUIRED`다. 해당 one-shot intent는 재실행하지 않으며 Owner 직접 승인·실제 Compaction은 NOT_RUN이다. 다음 허용 행동은 실패 분류가 추가된 새 후보를 검증하고, 별도 승인된 새 fixture에서 정상·실패·새 세션·Compaction·미해결 종료를 관측하는 것이다. 기존 실패·기록·예산을 초기화하거나 다른 버전의 결과로 대체하지 않는다. 생산성 6쌍 비교는 요청 범위 뒤의 미실행 항목으로 남긴다.

후속 실제 Host 사전 점검에서도 PATH의 Codex CLI는 0.167.0, 로그인 상태는 미인증, 등록 MCP 1개 중 CodeFleet MCP는 0개였다. 새 일회용 Live fixture의 `prepare`와 `status`는 각각 exit 0이었고 모델 Turn·Owner 승인·Local Evidence는 0건/NOT_RUN으로 유지됐다. Windows npm의 `codex.cmd`를 명시한 최초 preflight는 버전 판정 전 `EINVAL`로 exit 1이었다. runner가 셸이나 shim 내용을 실행하지 않고 공식 npm 패키지의 고정 JavaScript 진입점만 해석하도록 수정하고 임의 shim 거부 시험을 추가했다. 승인된 0.167.1 전역 업그레이드는 실행 중인 `codex.exe` 파일 잠금으로 `EBUSY` exit 1이었으며 기존 0.167.0 설치는 유지됐다.

업그레이드 없이 현재 공식 Codex CLI 0.167.0을 임시 `CODEX_HOME`에서 다시 검증했다. 실제 `mcp add/get/list/remove`, ephemeral 설정, MCP 7개 도구, Goal 영속화, 소스 불변이 모두 확인돼 `OFFICIAL_CODEX_CLI_MCP_REGISTRATION_PASS` exit 0이었고 모델 Turn·인증 호출·Owner 승인은 0건이었다. Live runner는 실제 호환 시험을 통과한 0.167.0과 CI 고정 0.167.1만 허용하도록 변경했다. 안전 게이트 회귀는 24 PASS / 0 FAIL / 0 SKIP, MCP 회귀는 3 PASS / 0 FAIL / 0 SKIP이었다. 실제 `codex.cmd` preflight는 버전 검사를 통과하고 미로그인으로 `BLOCKED_CODEX_LOGIN_UNAVAILABLE` exit 2를 반환했으며 Turn intent를 만들지 않았다. 전역 MCP 설정·비용 발생 모델 Turn은 수행하지 않았다. 다음 행동은 Codex 로그인 후 같은 fixture의 preflight를 재실행하는 것이다.

별도 Owner가 로그인과 preflight를 완료한 뒤 실제 Codex 0.167.0 Turn 1회를 실행했다. Provider는 Thread 1개, Turn 시작 1회·완료 1회·실패 0회, input 53,522·output 206 tokens와 exit 0을 보고했지만 첫 `codefleet_goal_start` MCP 호출이 실패했고 후속 호출·State·Task·review는 0건이었다. 대상 소스는 변경되지 않았고 Owner 권한·Protected Evidence는 생성되지 않아 `HUMAN_RECONCILIATION_REQUIRED`로 종결했다. 같은 one-shot intent는 재실행하지 않는다. 당시 runner는 실패 원문을 hash만 남겨 원인을 확정할 수 없었고 실제 MCP 시작 인자에 `WORK_REVIEW_V1`도 누락했다. 후속 후보는 profile과 `CHANGE` mode를 고정하고, 원문 대신 실패 분류·필드 목록·digest를 기록해 새 fixture의 별도 승인 시도에서만 원인을 판별하도록 보완한다.

profile과 `CHANGE` mode를 고정한 새 fixture에서도 별도 승인된 Codex 0.167.0 Turn 1회를 관측했다. Provider는 Turn 시작 1회·완료 1회, input 57,203·output 210 tokens와 exit 0을 보고했다. `codefleet_goal_start`와 뒤이은 `codefleet_goal_status`는 모두 `MCP_SERVER_FAILURE`로 분류됐고 State·Task·review·소스 변경·Owner 권한은 생성되지 않았다. 따라서 결과는 다시 `HUMAN_RECONCILIATION_REQUIRED`이며 이 one-shot intent도 재실행하지 않는다. 두 실패의 bounded digest와 최상위 필드 목록은 남았지만 인자 키·안전한 오류 코드·result 형태가 기존 receipt에 없어 정확한 원인은 아직 확정할 수 없다. 후속 후보는 이 비밀 비포함 진단 필드를 추가하고, 오프라인 MCP에서 `{goal, mode:"CHANGE"}`가 `NEEDS_INPUT` Work Task를 만들되 실행 권한을 부여하지 않는 양성 회귀를 추가했다. 이 후보를 검증·배포하기 전 세 번째 실제 모델 Turn은 허용하지 않는다.

위 진단 후보를 배포한 뒤 새 fixture에서 별도 승인된 세 번째 Codex 0.167.0 Turn 1회를 관측했다. Provider receipt는 Turn 시작 1회·완료 1회, input 53,572·output 204 tokens와 exit 0을 기록했다. `codefleet_goal_start`에는 `goal`과 `mode`가 모두 전달됐지만 동일한 실패 digest의 `MCP_SERVER_FAILURE`가 발생했고 tool result·State·Task·review·소스 변경·Owner 권한은 없었다. `review`는 확인된 단일 proposal Turn이 없어 차단됐고, ephemeral Thread의 원문 오류는 일반 Codex session JSONL에 보존되지 않았다. 결과는 `HUMAN_RECONCILIATION_REQUIRED`이며 이 fixture도 재실행·review·finalize하지 않는다. 다음 후보는 원문이나 개인 경로를 저장하지 않고 오류 자료형·필드명·메시지 길이와 digest·JSON-RPC/프로세스/CodeFleet 신호만 receipt에 추가한다. 이 후보를 검증·배포하기 전 네 번째 실제 모델 Turn은 허용하지 않는다.

추가 진단 후보를 배포한 뒤 새 fixture에서 별도 승인된 네 번째 Codex 0.167.0 Turn 1회를 관측했다. 올바른 `goal`·`mode`에도 앞선 시도와 같은 detail digest로 실패했으며 오류는 `message` 한 필드의 61자 문자열, 알려진 JSON-RPC·권한·SQLite·CodeFleet 신호 없음으로 기록됐다. State·Task·review·소스 변경·Owner 권한은 없고 결과는 다시 `HUMAN_RECONCILIATION_REQUIRED`이므로 이 fixture도 재실행·review·finalize하지 않는다. 공식 Codex 0.167.0 소스와 동일 버전 CLI의 비과금 config 검증에서 원인을 확인했다. annotations가 없는 custom MCP 도구의 기본 `Auto` 모드는 승인을 요구하고, read-only permission profile은 `AskForApproval::Never`에서도 자동 승인 조건을 만족하지 않아 비대화형 exec가 도구 호출 전에 중단한다. runner는 proposal-only CodeFleet MCP 서버에만 `default_tools_approval_mode="approve"`를 고정한다. 이는 MCP 호출 허용이며 Fileset 적용·검증·Owner 승인 권한은 계속 제공하지 않는다. 기존 분류기가 event의 `server`·`failed` 필드만으로 `MCP_SERVER_FAILURE`를 만들던 오탐도 오류 payload만 분류하도록 수정한다. 이 후보의 비과금 회귀를 완료하기 전 추가 실제 모델 Turn은 허용하지 않는다.

MCP 서버별 승인 설정을 배포한 뒤 별도 승인된 실제 Codex 0.167.0 Turn에서 `codefleet_goal_start`와 반복 `codefleet_goal_status`가 처음으로 정상 완료되어 외부 State와 Work Task 생성까지 확인했다. 소스·테스트·Owner 권한에는 효과가 없었다. 최초 후속 Turn은 runner가 `todo` WorkItem ID를 지시해 `WORK_REVIEW_V1`의 고정 `implement → verify` DAG와 불일치했고, 이를 수정한 다음 Turn에서도 모델이 엄격한 Draft 스키마와 다른 제안을 제출해 `codefleet_draft_submit`이 거절됐다. 두 one-shot fixture는 `HUMAN_RECONCILIATION_REQUIRED`로 보존하며 재실행하지 않는다. 후속 후보는 전체 Draft JSON 템플릿에서 `probeRef`만 치환하도록 지시하고, Codex가 `error:null`과 함께 `result.content`에 반환하는 계약 코드를 원문 없이 digest·길이·허용된 코드로 분류한다. ChatGPT 로그인은 일반적으로 플랜의 Codex 포함량을 먼저 사용하고 설정된 credits를 사용할 수 있으며 API-key 세션은 API billing을 사용한다. runner는 어느 경로의 잔여량·설정·금액도 관측하거나 제한하지 못하므로 실제 Turn과 Owner source/test 효과 승인은 계속 분리한다. 이 후보의 오프라인 검증은 Live acceptance 20 PASS, Codex MCP 3 PASS, Work review 3 PASS, 문서 검사와 `git diff --check` exit 0이다. 새 실제 Turn은 별도 승인된 새 fixture에서만 허용한다.

커밋 `569ef19`의 새 fixture에서 별도 승인된 Codex 0.167.0 Turn 1회는 Thread·Turn 각각 1개와 exit 0을 보고했고, `goal_start → draft_submit → goal_prepare → fileset_propose → fileset_review` 및 사이 상태 조회가 모두 성공했다. State에는 revision 6의 `BOOTSTRAP_PREPARED` Task, `implement=FILESET_PROPOSED`, `verify=PENDING_VERIFICATION`, `WAITING_APPROVAL` Fileset과 실행 권한이 없는 hash-bound `NativeFilesReview`가 남았으며 모델은 프로젝트 소스·테스트를 변경하지 않았다. 그러나 성공 판정과 별도 Owner review 경로 두 곳에 과거 ID `todo`가 남아 `implement` 대기 상태를 찾지 못했으므로 receipt는 거짓 음성 `HUMAN_RECONCILIATION_REQUIRED`로 닫혔다. 이 immutable one-shot 기록은 성공으로 재분류하거나 효과를 승인하지 않고 보존한다. 후보는 두 잔존 ID를 `implement`로 수정하며, 검증·배포된 새 fixture 없이는 모델 Turn이나 Owner 효과를 재시도하지 않는다.

커밋 `ff2688c`의 새 fixture에서 별도 승인된 Codex 0.167.0 Turn 1회가 `CODEX_TURN_OBSERVED_AWAIT_OWNER_REVIEW`로 정상 판정됐다. 필수 MCP와 사이 상태 조회가 모두 성공했고 모델은 소스·테스트를 직접 변경하지 않았다. 별도 Owner review에서 `src/todo.mjs` 한 파일의 기준/후보 hash와 내용을 확인한 뒤 `--acknowledge-unisolated`로 1회 materialize했고, 다시 분리된 exact command review로 `node --test --test-reporter=tap test/todo.test.mjs`를 1회 실행했다. exit 0, 1 PASS / 0 FAIL / 0 SKIP이 current candidate·Workflow·Task에 결합됐으며 최종 verdict는 사유 없이 `CODEX_TURN_OBSERVED_AND_OBJECTIVE_COMPLETE_LOCAL`이다. 이 증거는 `LOCAL_ONLY_UNPROTECTED`, verifier independence `UNPROTECTED`, owner authentication `NOT_ESTABLISHED`, protected verification `UNSATISFIED`, host Live trust `PROVIDER_REPORTED_ONLY`다. 따라서 실제 Codex Host 경로의 감독형 Local 수용은 확인됐지만 Protected Evidence·독립 Owner 인증·비용 상한·macOS/Linux 호환을 입증하지 않는다.

위 승인 설정 후보를 별도 agent 전용 fixture에서 실제 Turn 1회로 검증했다. `codefleet_goal_start`와 반복 `codefleet_goal_status`가 완료되고 Task와 외부 State가 생성돼 최초 반복 실패의 승인 원인과 수정 효과를 실제 Host에서 확인했다. 다음 차단은 `codefleet_draft_submit` 다섯 번의 tool-result 오류였다. persisted Task는 revision 2·`NEEDS_INPUT`·effect certainty `NONE`이며 Draft와 source effect는 기록되지 않았다. 원인은 runner 프롬프트가 WorkItem ID를 `todo`로 강제한 반면 `WORK_REVIEW_V1` Validator는 정확한 `implement` → `verify` DAG만 허용하는 계약 불일치였다. 프롬프트와 fileset 단계의 ID를 `implement`로 정정하고 합성 Live 회귀가 정확한 approval mode와 DAG 문구를 모두 요구하도록 변경한다. 이 one-shot fixture는 재실행·review·finalize하지 않으며, 수정 후보의 비과금 회귀 전 추가 실제 Turn은 허용하지 않는다.

## 이전 설계 검토 기록

2026-11-13 revision 3 검토: 실행 진입점, 실제 저장 순서·경합, 사용자/Host/Owner 전체 절차를 검토했다. 기준 커밋은 설계에 명시한 `b3f8b985a903fd255983da01d6f284df3dea14aa`다. product CLI 이름 64개(help 포함, dispatch 전 authorize-local 포함)를 분류했고 정적 목록 대조에서 누락·초과 0개를 확인했다. MCP 7개 도구와 Host forwarding, 하위 Task/Native/reservation/repair 호출 및 Task 없는 외부 실행의 경계를 구분했다. readOnly Store, 하위 우회 guard, MCP 연결, 파일 적용 두 commit, controlSeq의 Decision 전달, Owner 조작, 종료의 하위 행 검사 등 7건을 설계에 반영했다. 당시 탁상 시나리오 8개는 TABLETOP_ONLY였으며, 이후 구현 후보와 오프라인 시험 결과는 위 표에 기록했다. 실제 Host 실행 수용은 여전히 미완료다.

이 검토에서 `node --test test/time-safety.test.mjs test/native-local.test.mjs test/bootstrap-reservations.test.mjs` exit 0, 85 PASS / 0 FAIL / 0 SKIP을 확인했다(Windows x64 / PowerShell 5.1 / Node 24.14.1). 기존 경계의 회귀 근거이며 신규 프로필 통과를 뜻하지 않는다. 런타임 변경·설치·모델 호출·기존 Task 이관·Git 공개 작업은 하지 않았다. 후속 신규 부정 시험과 실제 Host/Owner 검증은 NOT_RUN이다.

revision 3 문서 검증: `npm.cmd run posttest` exit 0(37 Markdown·231 링크·4 인용·42 선언 사실, 오류 0), `node --test test/doc-layout.test.ts` exit 0(3 PASS), `git diff --check` exit 0. 별도 구조 확인에서 revision 3·검토 ID 7개·P01~P14 순서·LF·코드 블록 균형을 확인했다. 기존 coverage/anchor 기준선은 변경하지 않았다. 최초 정적 목록 확인 스크립트는 PowerShell의 한글 파이프 인코딩 때문에 exit 1이었으며 ASCII 구분자로 수정한 뒤 64개 전체 대응을 확인했다. 이는 도구 실행 오류이며 제품 테스트 실패로 대체 기록하지 않는다.

[개발 작업 검증과 재개 전체 설계](../docs/implementation/work-verification-resume.md)를 소유자 검토용으로 작성했다. 상태는 REVIEW_REQUIRED / DOCUMENTED다. 기존 프로젝트·단일 Agent·감독형 Local을 초기 주 경로로 좁히는 안이며, 기능별 정상·실패·불명의 변경·보존·중단·재개와 전체 영향, 수락 시험, 기존 구현 재사용 범위를 정의한다. 런타임·기존 Task·승인·검증 기준선은 변경하지 않았다. 다음 허용 작업은 설계 검토와 수정이며 구현·이관·실제 Host 실행은 이번 문서화 범위에 포함하지 않는다.

설계 revision 2에서는 초안에 남았던 제품 조작·상태 전이·불명 종결·수동 조건·데이터/호환성·가치 수락의 결정을 고정했다. `WORK_REVIEW_V1`의 CHANGE와 VERIFY_CURRENT, 기존 Store 안의 profile/request/종료 기록, 사건 우선순위와 충돌 처리, 미해결 포기 후 차단, 구 Task 읽기 전용, 기술 게이트와 수치 비교 기준을 정의했다. 이는 초기 범위에 대한 설계 결정 완료이며 런타임 구현·실제 Host 수용·생산성 개선의 증거가 아니다.

revision 2의 문서 검증은 Windows x64 / PowerShell 5.1 / Node v24.14.1에서 수행했다. `npm.cmd run posttest` exit 0: Markdown 37개·링크 231개·인용 4개·선언 사실 42건 검사 오류 없음. `node --test test/doc-layout.test.ts` exit 0, 3 PASS / 0 FAIL / 0 SKIP. 별도 구조 확인 exit 0: 기능 11개 모두 정상·실패·불명 표 포함, P01~P14 순서·필수 결정 항목·LF·코드 블록 균형 확인. `git diff --check` exit 0. 기존 Legacy 측정 자료를 재사용했으며 runtime suite·Host Live·새 프로필 실행·비교 실험은 이번 revision 작업에서 NOT_RUN이다. 현행 Validator가 소스 0개를 거부하는 연결 차이는 설계에 명시했고, 신규 검증 전용 context와 기존 거부 보존을 구현 수락 조건으로 고정했다.

앞선 초안 확인 기준은 `b3f8b985a903fd255983da01d6f284df3dea14aa` + 당시 문서 변경이며, 환경은 Windows / PowerShell / Node v24.14.1이다. `npm.cmd run pretest` exit 0 → `npm.cmd run test:legacy` exit 0, 327 PASS / 0 FAIL / 0 SKIP → `npm.cmd run posttest` exit 0을 확인했다. 당시 문서 검사는 Markdown 37개, 링크 231개, 인용 4개, 선언 사실 42건을 검사했고 오류는 없었다. 별도 구조 확인은 기능 11개 모두 정상·실패·불명 표를 포함하고 LF를 유지함을 확인했다. 이 확인은 설계 내용의 실제 Host 수용을 뜻하지 않는다.

초기 `npm.cmd run check:links`와 `npm.cmd run check:citations`는 각각 exit 1이었다. 검사기의 Git 파일 목록 조회가 실패했으며, 해당 프로세스의 저장소 경로 표기를 정규화한 뒤 각각 exit 0으로 재실행했다. 전역 Git 설정과 검사 기준은 변경하지 않았다. 보조 구조 확인도 최초 PowerShell stdin 한글 인코딩 문제로 exit 1, 검사 표현 수정 후 exit 0이었다. Host Live·보호 검증·macOS/Linux 검증은 이번 문서 작업에서 NOT_RUN이다.

## 현재 상태 요약

**계획·검토와 감독형 Local 개발 흐름을 구현한 개발 단계다.** 설치된 패키지에서 수정 승인 → 테스트 → 완료 판정 → 별도 프로세스 복구를 확인했다. 실제 Host 제안을 감독형으로 적용한 제한된 과거 관측도 있다. 공개 인증 위임·보호 실행·양쪽 Host의 전체 수용과 공개 사용 릴리스는 미완료다.

Local 완료는 `COMPLETE_LOCAL`이며 보호 검증은 `UNSATISFIED`다. 설치 시험의 Codex·Claude 명칭은 설치 대상 Host를 뜻하며, 그 시험에서 실제 모델을 호출하지 않았다.

## 사용자 경험별 진행도

[제품 원칙](../docs/PRODUCT_VISION.md#핵심-사용자-경험)의 기본 경험과 [로드맵의 수락 기준](../docs/product-completion/roadmap.md#사용자-경험-수락-기준)을 대조한다. 아래는 기존 부품·시험 근거의 연결이며 새 사용자 경험 전체의 수용 완료 선언이 아니다. 이번 기준 명시의 상태는 DOCUMENTED다.

| ID | 기존 구현·검증 근거 | 남은 사용자 경험 수용 |
| --- | --- | --- |
| UX-01 요청·질문·계획 | 목표·Draft·Validator·DAG와 설치 Skill 안내 구현 | 실제 자연어 요청에서 필요한 질문만 하고, 내부 계약을 사용자 대신 준비하는 전체 흐름은 미검증 |
| UX-02 필요한 결정·진행 | 승인·범위·예산 검사, 적격 작업 선택과 감독형 Local 경로 근거 있음 | 유효한 승인 안의 연속 진행, 필수 결정만 묶어 요청하고 답변을 연결하는 실제 Host 경험은 미완료 |
| UX-03 실패·수정·차단 | 실패 Evidence 기반 제한적 Repair·재검증과 별도 프로세스 Recovery 근거 있음 | 실제 Host가 승인 한도 안에서 수정하고, 한도 도달 시 선택지·영향을 설명하는 전체 수용은 미검증 |
| UX-04 다음 세션 재개 | 영속 Goal 탐색·설치 CLI 재발견·프로세스 복구와 소스 변경 감지 시험 통과 | 실제 Host 새 세션/Compaction 뒤 재설명 없는 재개, 지침 전달·미확정 인계의 독립 관측은 미검증 |
| UX-05 결과·검증·한계 | Local 완료·현재 대상 재관측·변조 거부 시험 근거 있음 | 실제 작업 결과를 완료 기준별로 사용자에게 전달하는 전체 수용, 브라우저·주관적 기준·Protected 근거는 미완료 |

구현 책임은 [아키텍처](../docs/product-completion/architecture.md#사용자-경험과-구현-책임), 개별 시험 결과와 한계는 아래 검증 표에서 확인한다. 문서에 추가한 수락 시나리오를 기존 시험 결과로 소급 통과시키지 않는다.

## 기능별 상태

| 영역 | 구현·검증 수준 | 남은 조건 |
| --- | --- | --- |
| 목표·Draft·Validator·DAG | 계획·계약 검토·의존성·승인 요청 구현, 오프라인 회귀 근거 있음 | 실제 Host에서 목표부터 최종 결과까지 전체 수용 |
| Codex Goal·MCP·재개 안내 | 영속 Goal 탐색, 계약 리뷰, 미승인 Workflow 준비와 설치 CLI 재발견 구현 | 인증된 운영 연결과 기존 설치물 업그레이드 수용 |
| 신규 프로젝트 Bootstrap | Fileset 승인·생성·Local 검증·Repair·재개 구현, 합성·설치 회귀 근거 있음 | 실제 모델을 연결한 신규 프로젝트 전체 수용·보호 검증 |
| 기존 프로젝트 변경 | 감독형 Fileset 승인·적용·Local 완료·프로세스 복구 관측 있음 | 범용 무인 실행과 독립 사용자 수용 |
| 계약 변경·Repair·Work Log | 기존 Store·Event·Lease·Recovery에 연결, Local 회귀 근거 있음 | 실제 인계의 독립 인증·Host Compaction·장기 실행 수용 |
| 역할 협업 | 제한된 자식 제안·감독형 통합·비교 관측 있음 | 공개 인증 위임은 BLOCKED, Multi-Agent 성능 이점 미입증 |
| 검증 Backend | Local·Container 경로 구현 | Host Sandbox NOT_VERIFIED, Local 결과로 Protected 수용 불가 |
| 플랫폼·실사용·출시 | 제한된 Windows 관측과 과거 Linux 시험 이력 있음 | 전체 OS 수용·브라우저 E2E·외부 파일럿·생산성/비용 개선·M5 미완료 |

구현 근거: [Core 안내](../guides/host-core-guide.md), [Local 수용 계약](../docs/implementation/local-only-acceptance.md), [복구 계약](../docs/implementation/objective-recovery.md).
과거 관측: [감독형 Local 수용](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-28/public-existing-local-v2.md), [Repair 연결](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-30/supervised-adoption-repair.md), [인계 신뢰 경계](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-30/undelivered-handoff-recovery-v2.md), [협업 비교](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-28/manager-proposal-handoff.md).

## 최근 검증

환경: Windows / PowerShell / Node v24.14.1. 모델 호출·원격 CI 재검증은 수행하지 않았다.

| 실행 명령 | 결과 | 확인한 범위 |
| --- | --- | --- |
| 전체 코드 구문 검사 | exit 0 · 265개 | Node 내장 TypeScript 제거 후 모듈 구문 검사. 최초 파일 직접 `--check`는 `yaml.ts`의 TypeScript 인식 실패로 exit 1, 검사 방식 수정 후 코드 변경 없이 통과 |
| package 명령·Legacy 예제 검사 | exit 0 | package script 경로 참조 89개 누락 없음, 예제 Task Validator 오류·경고 없음 |
| `npm.cmd run pretest` → `npm.cmd run test:legacy` | 각각 exit 0 · 324 PASS | Legacy 측정 산출물을 새로 생성하고 계약·문서 검사기 회귀 실행 |
| `npm.cmd run test:installed-goal-loop` | exit 0 · 2 PASS | 실제 npm 패키지의 Codex·Claude Skill 설치, 준비된 제안의 승인·적용·Node 검증·Recovery·완료 후 소스 변경 감지 |
| `npm.cmd run test:host` | exit 0 · 20 PASS / 1 SKIP | 설치·제안·승인·취소·복구와 변조 거부. Docker Harness 조건부 시험은 SKIP |
| `npm.cmd pack --dry-run --ignore-scripts --json` | exit 0 · 배포 파일 155개 | 로컬 상태·개인 설정·테스트·Proof 도구 혼입 0개 |
| `npm.cmd run posttest`, `git diff --check` | 각각 exit 0 | 기존 Legacy 커버리지 산출물과 문서 링크·인용·선언 사실·공백 검사 |

위 실행은 준비된 제안을 이용한 로컬 회귀이며 실제 AI의 자연어 작업 품질, 사람의 개입 시간, 브라우저 사용성 또는 Protected Evidence를 입증하지 않는다. 앞선 Todo·Calendar 및 복구 시나리오의 53 PASS / 1 SKIP은 [이전 상태 문서](https://github.com/solzip/CodeFleet/blob/2901dc9/docs/product-completion/progress.md)에 보존한다.

### 이전 전체 회귀의 한계

문서 정리 전 후보에서 실행한 `npm.cmd test`는 **exit 1**이었다. Live 안전성 21 PASS, MCP 3 PASS, 설치 Goal 2 PASS, Codex MVP 319 PASS / 4 SKIP, Legacy 324 PASS 이후 Alpha에서 469 PASS / 5 FAIL / 7 SKIP으로 중단됐다. 실패는 Docker 보호 시험의 `CODEFLEET_TEST_DOCKER` 미설정(H2 isolation, H3 runtime, H4 IPC, H6 planning, Operator guard)이었다.

뒤의 Host Core는 별도로 실행해 exit 0 · 135 PASS를 확인했다. 이 결과를 현재 후보의 전체 회귀·보호 검증 통과로 집계하지 않는다.

## 다음 작업과 차단 조건

다음 실사용 시험은 **자연어 요청·필요한 질문(UX-01) → 계획 검토·필수 결정(UX-02) → 구현·실패 대응(UX-03) → 중단·재개(UX-04) → 결과 확인(UX-05)**다. 먼저 위 표의 공백을 선택한 기존 경로에서 재현하고 필요한 구현만 진행한다. 대상 프로젝트와 작업 범위를 고정하고 해당 계약의 실행 승인을 확보해야 시작할 수 있다. 기본 Host와 비교할 때는 동일 작업·초기 상태·품질 기준으로 준비·개입·검토 시간, 결함·재작업과 관측 가능한 비용을 기록한다. 세부 준비·반증 조건은 로드맵의 사용자 경험 수락 기준을 따른다.

공개 위임은 `PUBLIC_DELEGATION_BLOCKED`를 유지한다. 인증된 Owner 승인, 실제 Host 집행과 비용 통제는 수용 근거가 필요하다. P2 native 실행 차단과 P1 old-R2 보류는 [통합 당시 기록](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-11-12/repository-consolidation.md)을 따른다. 새 범위는 로드맵의 선행 조건을 확인해 진행한다.

## 기록 관리

이 문서는 현재 상태를 갱신하며 작업 일지를 누적하지 않는다. 과거 기록은 [고정 커밋 안내](../test/contracts/legacy/INDEX.md)에서 조회한다. 제품 상태 변경에는 계약·후보·환경과 검증 근거를 연결하고, 문서 정리는 DOCUMENTED로 기록한다.

이번 변경은 DOCUMENTED다. `docs/`는 현재 설계·수락 계약 14개로 줄이고, 사용 안내는 `guides/`, 현재 상태는 이 문서, 검사에 필요한 Legacy/Alpha 계약은 `test/contracts/legacy/`로 이전했다. 중복 제품 안내를 제거하고 Host 준비 실행 이력은 고정 Git 이력으로 연결했다. 기록 규칙은 `CONTRIBUTING.md`와 `CLAUDE.md`에 통합해 `docs/audits`·`docs/runs` 및 매 작업 INDEX/REGISTER 갱신을 중단했다. 신규 결함 ID·런타임 변경·기능 수용 승격은 없다. 이전 UX 문서화·실행 실패·제외 기록은 Git 이력에 보존한다.

이번 검증 환경은 Windows / PowerShell / Node v24.14.1이다. `npm.cmd run pretest` exit 0 후 `npm.cmd run test:legacy` 최종 exit 0, 327 PASS / 0 FAIL. 새 문서 위치 테스트의 반환값 해석 오류로 최초 실행은 exit 1, 326 PASS / 1 FAIL이었으며 해당 테스트만 수정한 뒤 전체를 재실행했다. 경로·비대상 파일 거부 회귀 3건을 추가했고 FINAL RULE 본문·커버리지 기준선과 anchor 임계값은 기준 커밋과 대조해 보존을 확인했다. `npm.cmd run posttest`는 이전한 anchor 참조 1건 및 새 테스트 수를 반영하지 않은 선언 3건을 발견해 실패했고, 참조와 실제 측정값을 수정한 뒤 exit 0을 확인했다. 기존 동결 시점 수치는 변경하지 않았다.

`npm.cmd pack --dry-run --json`은 기본 캐시 접근 EPERM으로 실패한 뒤 승인된 재실행에서 exit 0, 이전한 안내·상태·보존 계약의 패키지 포함을 확인했다. 패키지를 발행하거나 설치하지 않았다. Host Live·전체 Alpha/보호 검증·macOS/Linux 검증은 이번 정리에서 NOT_RUN이며 기존 미수용 상태를 유지한다. 다음 작업과 미충족 조건은 위 실사용 시험과 상태표를 따른다.

`npm.cmd run test:host-core`는 exit 0, 135 PASS / 0 FAIL / 0 SKIP이다. `npm.cmd run posttest`는 저장소 Markdown 36개와 링크·인용·선언 사실 42건을 검사해 오류 없이 종료했다. `git diff --check`도 exit 0이다. 이 결과는 문서·검사 자산 이전에 대한 기본 회귀이며 전체 보안·보호 검증이나 실제 Host 기능 수용을 의미하지 않는다.
