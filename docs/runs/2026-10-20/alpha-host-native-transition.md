# Host-Native 전환 — 설계와 오프라인 통합

- 일시: 2026-10-20, Asia/Seoul
- 대상 HEAD: `9dc429835fd272253f8efac60ac0f76bf7188de5`
- 작업 유형: 감사·설계·구현·실행
- Worktree: `.codefleet/worktrees/alpha-g0`, branch `feature/alpha-g0-refresh`
- 선행 문서: [기존 설계 패키지](../../implementation/codefleet-implementation-v1/README.md), [G7-C 기록](alpha-g7c-live-transport-compatibility.md), CLAUDE.md, 사용자의 Host-Native 전환 지시
- 번호 실측 최대값: REGISTER P0-17 / P1-61. 새 결함 등재·등급 변경 없음.

## 판정과 선행 감사

설계는 DESIGN_VERIFIED, staged proposal 통합은 OFFLINE_VERIFIED 범위다. 실제 Host Live 테스트는 NOT_RUN이며 제품 완성을 선언하지 않는다. Host 도구 자동 실행·보안 capability는 BLOCKED/UNVERIFIED로 유지한다.

초기 tracked 변경 없음. 기존 미추적 `.trials/`, `docs/implementation/codefleet-g0-audit-2026-10-19.md`, `docs/implementation/codefleet-g0-npm-test-2026-10-19.log` 보존. 현재 HEAD는 직전 기록의 기준 HEAD와 다르므로 현재 Git을 기준으로 작업했다. 커밋·푸시·PR·Release·실제 API Key·모델 호출은 수행하지 않았다. 테스트용 임시 fixture 저장소의 로컬 커밋은 기존 테스트와 동일한 격리 준비 작업이며 제품 저장소 커밋이 아니다.

수정 전 소스·테스트·package 및 기존 미추적 파일의 상대 경로/해시 125개를 ignored 로컬 체크포인트에 저장했다. 추적 파일은 기준 HEAD가 복구점이며 기존 미추적 파일은 건드리지 않는다. 사용자의 별도 승인 없이 checkpoint commit/stash/reset은 하지 않는다.

decision-debt 사전 감사: 사용자 지정 설계 패키지의 Markdown 9개, 최종 판단 0, 제외 후보 9, 경고 0. `no_grounded_blocker_found`. 제외 후보는 정상 진행 또는 보안 경계 설명에서 나온 근거 부족 후보이며 Live 안전성 인증이 아니다. 기존 직접 API Live 후속 계획은 이번 사용자 지시로 기본 제품 경로에서 제외했고 과거 기록은 보존했다.

## 단계별 연결

| 단계 | 구현·근거 | 완료 범위 |
| --- | --- | --- |
| G0 | Git inventory, 기존 CLI/Contract/Store/Controller/Provider/테스트 감사 | 누적 변경 보존, 과거 보고와 현재 HEAD 구분 |
| G1 | Codex CLI 0.162.1, Claude Code 2.1.304; version/help와 공식 문서 | 광고된 기능과 실제 enforcement 구분 |
| G2 | [Host-Native 계약](../../implementation/host-native.md) | Provider와 Host 책임 분리 |
| G3 | host 경로는 staged data만 소비; API adapters 변경 없음 | 별도 API Key/모델 subprocess 없음 |
| G4/G5 | 공통 JSON CLI, Codex/Claude standalone Skill 설치 | 실제 세션 discovery는 미검증 |
| G6 | 기존 Task/Workflow/Controller/Judge에 연결 | 기존 leases/isolated candidates/final integration 재사용 |
| G7 | disposable 설치·비활성화·활성화·제거 및 packaged CLI smoke | OS/Host별 Live 검증은 별도 승인 필요 |

G1 공식 출처와 인증·Sandbox·Hooks·MCP·Agents 비교는 설계 문서에 연결했다. Codex 로컬 feature probe는 hooks, multi_agent, plugins를 stable/true로 광고했다. 광고를 검증된 보안 capability로 승격하지 않았다. OMX/OMC 공개 저장소에서 Host 중심 Skill/협업 방향만 비교했으며 코드·설치 명령·내부 인터페이스를 복제하지 않았다.

## 파일 및 신뢰 경계

- `src/hosts/exchange.mjs`: request/response 저장, schema/hash/scope 검사, revision/attempt/lease 검증 및 일회 소비. `host_requests` 확장 테이블만 추가하고 기존 Alpha store version/행을 변경하지 않는다.
- `src/hosts/cli.mjs`: Host action allowlist, 승인 요청, 상태·제안·실행·취소·재개. `approve`/`complete`/모델 선택은 제공하지 않는다.
- `src/hosts/install.mjs`, `scripts/host-install.mjs`: Host별 standalone Skill과 runtime snapshot/MIT notice 설치. 기존 파일·symlink·수정된 설치 제거 거절.
- `src/alpha/cli.mjs`, `src/alpha/controller.mjs`: host 진입점과 trusted staged execution seam. 기존 Provider registry 경로·검증·Scheduler 유지.
- `test/host.test.mjs`, `package.json`: Fake Host, 실제 Node fixture 테스트, production Docker Harness, 설치·반증·회귀 연결.
- `.gitignore`: 개인 경로가 포함될 수 있는 원본 로그/로컬 체크포인트를 Git에서 제외한다.
- 설계/사용 안내/이 기록, README와 INDEX/progress: 새 기본 방향 및 제한 고지.

실제 AI 실행은 기존 Host 세션의 책임이다. CodeFleet은 인증정보를 가져오거나 세션을 새로 시작하지 않는다. Host 세션의 비용은 UNKNOWN; 로컬 staged replay의 모델 호출 비용 0은 구독 무료/무제한 주장이 아니다. 선택적 직접 API의 별도 인증·과금 계약과 기존 차단은 유지한다.

승인 요청 자체는 권한을 부여하지 않는다. 기존 operator CLI의 hash-bound approval을 별도로 사용한다. 같은 OS 계정의 임의 shell 접근은 인간과 AI를 구분하지 못하므로 trusted state/operator command를 실제 Host permission boundary로 보호해야 한다. 이 배포 경계와 실제 Host 도구 격리는 미검증이며 release blocker다. Skill 문구를 보안 enforcement로 주장하지 않는다.

Host 보고는 모두 PROVIDER_REPORTED_ONLY다. 실제 Harness의 failing baseline, 보호된 test identity, candidate/tree hash, 최종 통합과 Judge만 완료를 판정한다. 호스트 자동 subagent 실행/Agent Teams/권위 있는 Hook 상태 변경/세션 로그 수집은 구현하거나 인증하지 않았다. 단일 agent의 역할별 제안은 사용 가능하고 실제 협업 메시지는 기존 coordinator의 attempt channel에 묶는다.

## 실행 검증

첫 신규 테스트 실행: exit 1, 통과 4 / 실패 10 / 제외 1. 실패 10개 모두 2 WorkItem에 기본 attempt budget 1을 준 동일 fixture 오류였다. 제품 budget 검사는 유지하고 fixture에 명시 예산을 설정했다. Docker는 sandbox의 설정 읽기 권한 때문에 실행할 수 없어 권한 승인 후 재실행했다.

수정 후 첫 집중 검증: `CODEFLEET_TEST_DOCKER=1 node --test test/host.test.mjs` → exit 0, 통과 15 / 실패 0 / 제외 0. Fake Host와 production Docker Harness 경로 포함. 이후 revision/reopen/tamper 반증을 추가했으므로 최종 전체 결과를 별도로 기록한다.

첫 전체 `npm.cmd test`: exit 0, Legacy 324 + Alpha 확장 171 = 495건, 실패·제외 0. [첫 전체 로그](codefleet-host-full-first.log).

이후 동시 request 발급/response 제출의 경쟁을 SQLite BEGIN IMMEDIATE로 보강하고 반증을 추가했다. 다음 전체 `npm.cmd test`는 Legacy 324 + Alpha 확장 172 = 496건, 실패·제외 0이었으나 posttest의 문서 선언 불일치 3개 때문에 **exit 1**이었다. 원인은 새 기록을 추가한 뒤 README의 기록 수를 갱신하지 않은 두 선언과 INDEX를 기존 측정기가 세는 표 행 대신 bullet로 작성한 한 항목이었다. 검사나 baseline은 완화하지 않고 선언과 표 형식을 수정했다. [실패 로그](codefleet-host-full-docs-failed.log).

최종 `npm.cmd test`: **exit 0**, Legacy 324 + Alpha 확장 172 = **496건 통과, 실패 0, 제외 0**. posttest까지 통과했다. [최종 전체 로그](codefleet-host-full.log). 문서 선언 42개 중 불일치 0, 미앵커 숫자 539개는 기존 baseline 539를 유지했다. 이 검사는 모든 문서 내용의 정확성을 인증하지 않는다. 기존 dated citation 경고/과거 커밋 부재는 삭제하거나 검사 기준을 낮추지 않았다.

최종 기록 작성 뒤 별도 링크/선언 검사는 sandbox Git 조회 exit 128로 실행하지 못했다. 정상 Git 권한으로 `npm.cmd run posttest`를 다시 실행해 **exit 0**을 확인했다. [최종 문서·coverage 검사](codefleet-host-docs.log). 실패한 검사 실행을 성공으로 바꾸어 기록하지 않는다.

Alpha Doctor: sandbox 실행 exit 1(Docker config 권한); 동일 명령 권한 승인 후 **exit 0**, 검사 5/5. Node v24.14.1, Claude 2.1.304, Git/gh, 기존 인증 상태 및 Linux Docker 준비를 확인했다. 계정·토큰은 출력하지 않았다. [Doctor 로그](codefleet-host-doctor.log).

전체 환경은 `CODEFLEET_TEST_DOCKER=1`, `CODEFLEET_TEST_JAVA=(Get-Command java).Source`, `CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45`였다. 기존 Node/Maven Docker·JDK parser, SQLite/Legacy/Alpha/Workflow/Hybrid/API 반증을 포함한다. 모델 호출이나 이미지 다운로드는 없었다. 신규 Host 테스트는 19건이며 두 Host의 설치/활성화/제거, 구조화 제안, 승인 부재, evidence 위조, 동시 발급, 중복·revision·stale attempt, 재시작 후 replay 차단, 실패한 테스트와 증거/tree 변조, production Docker 통합을 포함한다.

보존 점검: 초기 125개 중 122개 동일, 변경은 기존 `src/alpha/cli.mjs`, `src/alpha/controller.mjs`, `package.json`뿐이다. 기존 미추적 파일 10개 모두 동일. [소스 해시와 보존 결과](alpha-host-source-evidence.json). `git diff --check` exit 0. 새 공개 소스/문서/로그 17개에서 로컬 사용자명(원문/URI encoding) 및 실제 key 형태 검사 위반 0; 범용 secret scanner를 의미하지 않는다. 원본 로그는 Git 제외 경로에 보관하고 공개 로그에는 개인 경로를 제거했다.

구현 근거는 현재 작업 트리의 src/hosts/exchange.mjs:44, src/hosts/exchange.mjs:85, src/hosts/exchange.mjs:108, src/hosts/cli.mjs:31, src/hosts/install.mjs:52다. 이 파일들은 기준 HEAD 이후 미커밋 변경이므로 HEAD에 이미 존재했다는 주장이 아니며 위 해시 manifest가 현재 소스를 고정한다.

## 결론

Host-Native 설계와 staged proposal 통합을 추가하고 실제 Harness 기반 오프라인 반증을 통과했다.
HOST_LIVE_VERIFIED는 NOT_RUN이며 최종 Host-Native 제품 완성을 선언하지 않는다.

## 다음 작업

사용자가 승인한 실제 Codex/Claude 세션에서 [Live 전제조건](../../product-completion/host-native-guide.md#before-live-acceptance)을 검증한다.

## 미해소로 남긴 것

실제 Skill discovery/모델 응답/계정 과금/권한 격리, 자동 Host 위임·이벤트 통합, 인간 승인 주체의 OS 수준 분리, 범용 개발 목표. 미지원 기능은 안전하게 제한하며 Fake Host 결과를 Live 인증으로 사용하지 않는다.
