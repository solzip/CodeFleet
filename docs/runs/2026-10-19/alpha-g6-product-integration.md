# G6 — Product Integration, Live Readiness와 최종 검증

- 실행일: 2026-10-19, Asia/Seoul
- Worktree: `.codefleet/worktrees/alpha-g0`
- 브랜치: `feature/alpha-g0-refresh`
- HEAD: `c61e9b829b62dd41336a7225bf3b9165136484db`
- 선행 기록: [G5](alpha-g5-controlled-hybrid.md), 구현 설계 패키지, CLAUDE.md, concept-foundation, 제품 architecture/progress/roadmap.
- 상태: **G6 로컬 통합 구현·검증 완료. 최종 제품의 Live 운영 준비는 BLOCKED_OR_UNSUPPORTED.** 실제 Provider 기반 의미 분석·자동 수정·멀티 에이전트 협업을 VERIFIED로 선언하지 않는다.

## 시작 상태와 감사

실제 경로·브랜치·HEAD·미커밋 변경을 확인했다. 처음 sandbox 계정의 Git 조회는 소유권 검사로 거절되었다. 해당 Worktree에 한정한 명령별 safe.directory로 읽었고 전역 Git 설정은 변경하지 않았다. G1~G5 미커밋 코드와 기록을 보존했다. 기존 전체 기준선은 G5의 432개 통과 기록이며 이번 최종 전체 테스트에서 확장 회귀를 재실행했다.

decision-debt preflight는 사용자가 지정한 G5 기록·PHASED_WORK·ACCEPTANCE_MATRIX 세 문서를 대상으로 했다. 후보 1개, 근거 부족으로 제외 2개, 경고 0. G5의 격리·통합·Docker 실행 서술을 '실행 없는 계획'으로 읽은 후보는 실제 Controller/snapshot/Hybrid 테스트와 G5 전체 로그를 대조해 해소했다. 제외된 두 후보는 보안 경계를 설명하는 문장만으로 공개 위험을 확정할 근거가 부족했다. 이 범위 감사는 Live 안전성 인증이 아니다.

| 통합 감사 대상 | 확인·조치 |
| --- | --- |
| G1 Judge / Evidence | Judge는 그대로 재사용. 기록된 COMPLETED만 믿지 않는 읽기 전용 evidence 검사 추가. 기존 export의 증거 재검사 누락 보완 |
| G2 Provider / Routing | 기존 Adapter/Capability/선택 정책 보존. Planner는 같은 결과 envelope·Claude no-tool 인자를 재사용하되 별도 구조화 계약으로 검증 |
| G3 Intent / Contract | 기존 파일명 plan 호환 유지. 실제 Git blob 문맥 도우미와 AI 의미 제안 경로 추가. 관측·추론·검토·승인 구분 |
| G4 Workflow / Scheduler | 기존 생성·승인·실행·복구 API에 CLI 연결. 새 실행 엔진을 만들지 않음 |
| G5 Hybrid / Integration | 명시적 WorkItem·병렬 수·예산을 CLI 검토 입력으로 노출. 동일 Controller/격리/직렬 통합/독립 검증 재사용 |
| 재시도·권한 | Planner 원본·미확인 비용을 호출 전에 저장. 기존 Attempt나 응답 불명 Planner의 자동 재실행 없음. review와 approve 분리 |
| 상태·보고 | 저장된 기존 상태는 보존. Task/Run 보고는 파생 view이며 검증 무효이면 complete=false·VERIFICATION_INVALID |

## 실제 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src/alpha/cli.mjs` | objective namespace, report 명령, export 증거 재검사. 기존 명령 유지 |
| `src/alpha/evidence.mjs` | 신규 읽기 전용 accepted/baseline/contract/graph/revision/tree 검사 |
| `src/intent/semantic.mjs` | 고정 Git 문맥 탐색, 로컬 후보, AI 제안·실제 인용 검증 |
| `src/providers/planner.mjs` | G2 envelope와 기존 Claude no-tool 옵션을 재사용하는 제한된 의미 Planner Adapter |
| `src/product/tasks.mjs` | Task 원본·계획·검토·Workflow 연결·승인/거절. CAS·이벤트 원자성 |
| `src/product/report.mjs` | Task/Run/WorkItem/비용/메시지/Artifact 파생 보고 |
| `src/product/cli.mjs` | 통합 CLI dispatch, JSON/exit 계약, 모델 호출 동의·Capability 분리 |
| `test/product.test.mjs` | 신규 테스트 17개 |
| `scripts/alpha-package-smoke.mjs` | 설치 패키지의 계획·검토·승인·동의 차단·보고 smoke |
| `package.json` | 기존 전체 테스트에 product suite 추가 |
| `docs/product-completion/orchestration-guide.md` | 미배포 개발 브랜치 CLI 안내 |
| README 두 개, alpha-quickstart, progress, INDEX | 현재 상태 링크·문서 수 |
| G6 기록·로그·source evidence | 실행 증거 |

[정확한 소스 해시](alpha-g6-source-evidence.json)와 이전 G5 manifest 비교를 남긴다. 기존 Controller, Store, G1 Judge/Validator, G2 Adapter/Registry, G3 엔진, G4/G5 모듈 및 기존 테스트는 G6에서 변경하지 않았다. Legacy 엔진과 기존 CLI dispatch도 변경하지 않았다.

## 사용 흐름

호환성을 위해 자연어 명령은 `codefleet-alpha objective` 아래에 둔다. `codefleet run <task-id>`와 `codefleet-alpha run <contract.json> <repository>`는 그대로다. [실행 안내](../../product-completion/orchestration-guide.md)에 전체 예제와 예외를 기록했다.

1. `objective plan "목표" <repo>`: 원본과 코드 문맥·후보·추론·미해결 조건을 저장한다. 기본 경로는 모델 호출이 없다.
2. `objective review <task-id> --files ... --tests ... --criterion ...`: 사용자가 범위와 검증 조건을 명시한다. 자동 승인하지 않는다.
3. `objective run <task-id>`: 검증된 계획을 기존 Workflow로 컴파일하고 WAITING_APPROVAL 및 workflowHash를 출력한다.
4. `objective approve <task-id> --hash ... --actor ...`: 정확한 hash와 유효기간에 묶인 기존 영속 승인을 기록한다.
5. `objective run|resume <task-id> --allow-model`: 별도 모델 호출 동의와 기존 Capability·승인·정책을 모두 검사한다. **현재 strict Live 경로는 여기서 차단된다.**
6. `objective status/report/pause/cancel/reject`: 상태·증거·비용·역할·메시지·Artifact를 조회하거나 기존 제어 API를 호출한다.

새 namespace는 stdout에 JSON 하나를 출력한다. exit 0은 요청한 조회/제어 성공 또는 검증 완료, exit 2는 입력·승인·Capability·검증 대기/차단, exit 1은 잘못된 입력이나 처리 오류다. 조회 명령의 exit 0은 작업 성공을 뜻하지 않는다. 실행 결과의 complete와 verification을 별도로 확인한다. 기존 명령의 출력 형식은 보존했다.

WorkItem은 CLI의 반복 `--item id|files|tests|dependencies`로 명시한다. 기본 동시성 1·상한 3, 범위·보호 테스트·예산 검사를 유지한다. 공유 파일은 거부하고 선행 성공 뒤에만 후속을 실행한다. 기존 G5의 데이터 의존 문맥 주입·동일 파일 다중 수정 미지원은 그대로다.

실패 후 기존 Attempt를 재사용하거나 DB를 수동 수정하지 않는다. 새 계획을 만들고 다시 검토·승인한다. 이전 실행의 종료/부작용이 불명확하면 기존 RECONCILING 차단을 먼저 해결해야 한다. 운영체제 강제 전원 차단·원격 모델 프로세스 트리 복구는 이번 실행에서 추가 실증하지 않았다.

## Planner의 관측과 추론

기존 Discovery의 repository identity/base/path 분류를 재사용하고 Git cat-file로 고정 blob만 읽는다. 저장소 코드는 실행하지 않는다. 파일 수·총 문맥 크기 제한을 적용하며 잘리거나 생략된 문맥을 표시한다. source 내용과 test import 기반 후보는 LOCAL_CODE_CONTEXT이며 의미 분석 완료로 부르지 않는다. 기본 결과는 사용자의 범위·테스트 검토를 요구한다.

AI 경로는 SemanticPlanningRequest와 draft/references/inferences 구조를 갖는다. 코드 인용의 path·line·quote를 실제 읽은 내용과 대조하고 모든 제안 파일·테스트에 근거를 요구한다. AI의 설명은 UNVERIFIED_PROPOSAL이며 인용 문자열이 실제 존재한다는 사실만 HOST_OBSERVED_CODE다. 문맥의 의미나 완료 기준의 충분성이 입증되었다는 뜻이 아니다.

Claude Planner는 기존 --tools 빈 값, MCP 비활성, hooks 비활성, 설정 소스 제한, 세션 미보존·비용 상한 인자를 유지한다. 원본 stdout, process result, usage/cost, schema validation을 구분한다. JSON·스키마·인용·범위 오류와 process failure를 거절했다. Planner 시도 전 원본과 cost=null을 기록하고 응답 불명은 자동 재호출하지 않는다.

**의미 Planner 구현은 IMPLEMENTED_NOT_LIVE_VERIFIED.** Fake 응답으로 연결·검증 동작을 시험했으며 실제 모델의 의미 분석 품질은 측정하지 않았다. `--planner claude --allow-model`도 현재 필수 Capability가 미검증이므로 모델을 실행하지 않는다. Codex에는 실행 가능한 Planner 우회 경로를 추가하지 않았다.

## Provider / Environment Capability 매트릭스

로컬 버전·도움말과 공식 OpenAI 문서를 확인했다. 원격 문서는 보조 설명이며 설치 버전의 보안 집행 증거가 아니다. [공식 CLI 참조](https://learn.chatgpt.com/docs/developer-commands?surface=cli)는 shell sandbox 명령과 모델 실행 옵션을 구분한다. 설치된 Codex 도움말도 read-only를 모델이 생성한 shell command에 적용하는 정책으로 설명한다. 따라서 read-only를 no-tool 증명으로 해석하지 않았다.

| 항목 | Claude Code 2.1.303 | Codex CLI 0.162.1 |
| --- | --- | --- |
| 네이티브 버전·도움말 조회 | exit 0 | npm 패키지의 네이티브 exe 지정 시 exit 0 |
| 비대화형·구조화 출력 옵션 | --print, --json-schema 광고됨 | exec, --output-schema 광고됨 |
| 도구 없는 제안 | --tools 광고됨; 새 Live 실증 없음 | 검증된 no-tool envelope 없음 |
| 세션·streaming 옵션 | 광고됨; 이번 Live 미검증 | resume/--json 광고됨; 이번 Live 미검증 |
| 취소·비용·승인 통합 | Fake/기존 로컬 process 계약 검사; 새 Live 미검증 | 출력 파서 Fake 검사; Live 미검증 |
| 파일·네트워크·자격증명 제한 | Provider 환경 UNVERIFIED | Provider 환경 UNVERIFIED |
| 새 strict Workflow / Planner | 차단 | 코드 수준 실행 차단 유지 |
| 이번 실제 모델 호출 | 0 | 0 |

모든 Provider capability는 이번 version/help probe만으로 SUPPORTED로 바꾸지 않았다. Docker Verifier의 read-only source·offline 검증은 별도 실행 환경이며 Provider CLI의 보안 증거로 옮기지 않았다. Windows PATH에는 Codex npm shim이 있었고 기본 codex.exe 조회는 unavailable이었다. 명시적 네이티브 경로로 설치 버전을 확인했으며 진단 옵션이 실행 차단을 해제하지 않는다.

별도 제한 실행 환경의 후보는 호스트 자격증명·상태 DB를 주지 않는 격리 환경과 제한된 인증/통신 경계다. 이번에는 인증을 새 환경에 전달하거나 이미지를 설치하지 않았고, 도구 실행 차단·egress·자격증명 격리가 입증되지 않았으므로 해당 환경을 지원한다고 표시하지 않는다. Claude 기존 V1 호환 경로는 유지하지만 이번 작업에서 그 Live 동작을 재검증한 것은 아니다.

## 데이터 보존과 보고

product_tasks 및 workflow_extensions의 product-tasks 버전 1을 추가한다. 기존 user_version은 2이고 V1→V2는 기존 Store 마이그레이션을 재사용한다. Run/Event/Artifact/Graph row를 삭제하거나 재작성하지 않는다. Task 변경과 이벤트는 같은 트랜잭션이며 외부 CLI는 트랜잭션 밖에서 실행한다. plan의 원본을 먼저 기록하고 후속 결과를 CAS로 연결한다. Workflow 생성과 Task 연결 사이 중단은 결정적인 Run ID로 중복 생성을 막는다.

V1 데이터 업그레이드 후 원본 body 보존·기존 실행·historical export를 테스트했다. 과거 V1 artifact에는 candidatePaths가 없을 수 있으므로 artifact 검증은 유지하고 treeRechecked=false로 표시한다. 새 Hybrid 최종 후보에는 tree 재검사를 요구한다. 새 보고·export는 artifact hash, 계약, baseline, Judge, Workflow final binding과 tree를 검사하며 Provider 주장이나 상태 문자열만으로 완료 처리하지 않는다.

Task 상태는 계획·검토 기록이고 실행 상태의 소유자는 기존 Controller다. reporter는 원본 실행 상태를 recordedState에 남기며 검증 무효를 파생 view에 표시한다. 승인 철회·계약 변경은 기존 API로 처리한다. 운영 DB에 직접 마이그레이션하지 않았으며 되돌리기 위해 user_version을 낮추거나 테이블을 삭제하지 않는다.

## 실제 테스트와 명령

| 실행 | 종료 코드 | 검증 범위 |
| --- | --- | --- |
| node --test test/product.test.mjs (첫 실행) | 0 | 9 통과, Docker 1 제외. 제외를 성공으로 세지 않음 |
| CODEFLEET_TEST_DOCKER=1 node --test test/product.test.mjs (중간) | 0 | 14/14, 제외 0 |
| npm.cmd test (최종 소스) | 0 | Legacy 324 + Alpha 39 + Provider 15 + Intent 14 + Workflow 21 + Hybrid 19 + Product 17 = **449**, 제외 0 |
| node src/alpha/cli.mjs doctor | 0 | 5/5. Node v24.14.1, 기존 Claude 로그인 상태만 읽기 확인; 계정 정보 비출력 |
| npm.cmd run alpha:package-smoke | 0 | 로컬 pack·오프라인 설치·새 CLI plan/review/approve/consent block/report·제거. 모델 호출 없음 |
| objective readiness --codex-executable <native-exe> | 2 | 예상된 안전 차단. 버전/help exit 0과 Live 미검증 구분 |
| codex exec --help / claude --help | 0 / 0 | 옵션 관측만 수행 |
| git diff --check | 0 | 변경 공백 검사 |
| npm.cmd run posttest (문서 반영 후, 최초 sandbox) | 1 | Git 소유권 검사로 tracked 파일 조회 실패. 제품 테스트 실패와 구분 |
| npm.cmd run posttest (저장소 소유자 환경 재실행) | 0 | 링크·인용·선언 사실·coverage 검사 통과, 기존 인용 경고 11 |

전체 opt-in 환경: CODEFLEET_TEST_DOCKER=1, CODEFLEET_TEST_JAVA=(Get-Command java).Source, CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45. 준비된 이미지와 JDK를 사용했다. 새 원격 의존성 설치는 없다. 패키지 검증은 로컬 archive를 임시 디렉터리에 offline/ignore-scripts로 설치·제거한 것이다.

근거: [전체](codefleet-g6-full.log), [focused Docker](codefleet-g6-focused-docker.log), [Doctor](codefleet-g6-doctor.log), [패키지](codefleet-g6-package.log), [Readiness](codefleet-g6-readiness.log), [Codex help](codefleet-g6-codex-help.log), [Claude help](codefleet-g6-claude-help.log). 로그의 로컬 개인 프로필 경로는 제거했다. 원본 검증 자료와 기존 테스트·정책·coverage 기준선은 삭제하거나 약화하지 않았다. 기존 인용 경고 11개는 과거 기록 경고로 남는다.

문서 검사 근거: [sandbox 환경 실패](codefleet-g6-docs-failed.log), [재실행](codefleet-g6-docs.log). 저장소 소유권 제한을 검사기에서 제거하거나 전역 Git 설정으로 우회하지 않았다.

| 수용 게이트 | 이번 근거 |
| --- | --- |
| CF-GATE-01~03 | 기존 Alpha/Provider 권한·누락·변조 반증 + 새 report/export 변조 거절 |
| CF-GATE-04~05 | Intent/semantic schema·인용·범위·criterion 검사, review 미완료 차단 |
| CF-GATE-06~08 | 기존 DAG/Hybrid 예약·메시지·fencing + Task CAS/동시 준비 테스트 |
| CF-GATE-09~11 | 기존 충돌·semantic 실패 반증, 실제 Docker 통합, 최종 tree 보고·export 무효화 |
| CF-GATE-12~14 | V1→V2 및 product 확장·원본 보존, G4/G5 중단·G1 Delivery 재조정 회귀 |
| CF-GATE-15~16 | 기존 Docker 격리 회귀; Provider 보안 미검증은 차단. Provider OS 집행 실증으로 확대 해석하지 않음 |
| CF-GATE-17~19 | 실제 CLI subprocess JSON·승인 대기, 설치 패키지, 기존 Alpha/Legacy 전체 회귀 |
| CF-GATE-20 | 기존 비용 unknown 반증 + Planner 사전 미확인 비용·응답 유실 자동 재시도 금지 |

## 최종 분류와 후속 조치

| 분류 | 범위 |
| --- | --- |
| A — VERIFIED | Windows 로컬 CLI·검토·승인·거절·상태/보고·변조 export 차단·SQLite 호환·패키지 설치/제거; Fake Provider를 사용한 실제 Node/Maven/Docker 검증과 제한된 병렬 통합 |
| B — IMPLEMENTED_NOT_LIVE_VERIFIED | AI 의미 Planner의 구조화 계약·코드 인용·Provider 연결; 실제 Provider가 작업하는 통합 협업 경로; 현재 버전의 모델 품질·비용·Live 세션 복구 |
| C — BLOCKED_OR_UNSUPPORTED | Codex PROPOSAL_ONLY·새 strict Claude Live 실행, 실제 Codex+Claude 병렬 협업, 자유 도구 실행, 같은 파일 다중 수정, 실행 이력 있는 Hybrid graph in-place 수정 |

새 objective CLI의 자연어→Java verification 계약 생성은 미지원이다. 기존 G3의 Node 컴파일 범위를 유지하며 Java는 명시적 Alpha V1 계약 경로로 남긴다. 기존 Maven/JDK 회귀 통과를 새 Java Planner 지원으로 해석하지 않는다.

G6의 로컬 통합 구현은 테스트와 패키지 근거를 갖추었지만 **목표 제품 전체는 VERIFIED가 아니다**. 실제 의미 기반 분석이 동작했다고 표시하지 않으며 Live 협업 검증도 수행하지 않았다. Windows 이외의 호스트 플랫폼과 다중 Java Workflow 실실행도 이번에 추가 확인하지 않았다. 기존 알려진 Alpha의 독립 코드 검토 필요성과 임의 적대 코드에 대한 보증 한계는 유지한다.

후속은 Provider별 격리·인증·도구/네트워크 정책을 독립 실증하는 일이다. 안전 경계가 확인된 구체적 환경과 테스트를 준비한 뒤 모델 호출·비용 승인을 별도로 받아야 한다. 양쪽 Live 안전성이 확인된 후에만 멀티 Provider opt-in 협업을 수행한다. 그 전에는 명령의 차단을 우회하지 않는다. 이번 작업은 G6에서 멈췄으며 커밋·푸시·PR·배포는 하지 않았다.
