# 다른 로컬 작업 자리로 인계 — 2026-11-13

이 문서는 자리 이동 시점의 인계 기록이다. 현재 상태의 원본은 [진행 현황](../PROGRESS.md), 수락 조건은 [로드맵](../../docs/product-completion/roadmap.md)이다. 이후 작업은 해당 문서의 최신 내용을 우선한다.

## 기준과 먼저 읽을 문서

- 구현 커밋: `b53ce4f` — VERIFY_CURRENT 수용 runner·회귀·문서. 작업 기준은 `d0327c4`다.
- 이전 완료: `29dcd46` 승인 안내·현재 완료 표시 개선, `96bdfc7` Codex 새 세션 통합 Local 수용, `afe4cbe` 정상 CHANGE 수용 기록.
- 먼저 [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md), [기록 규칙](../../CONTRIBUTING.md), [제품 원칙](../../docs/PRODUCT_VISION.md), [아키텍처](../../docs/product-completion/architecture.md)를 읽는다.
- 다음 작업의 상세 계약은 [개발 작업 검증과 재개 revision 3](../../docs/implementation/work-verification-resume.md), 실행 절차는 [Host 안내](../../guides/host-native-guide.md)를 따른다.

## 완료와 남은 범위

| 항목 | 인계 시점 상태 |
| --- | --- |
| 정상 CHANGE | 선택한 Windows Codex의 제안 → 별도 Owner 적용 → 고정 검증 → Local 완료 관측 |
| 새 세션 재개 | 다른 실제 Codex Thread에서 기존 Task 재발견·체크포인트 보존 → 별도 Owner 검증 → Local 완료 관측 |
| VERIFY_CURRENT | 실제 Codex의 소스 없는 verify DAG → 별도 Owner VERIFY 1회 → 테스트 1 PASS → 소스 무변경 COMPLETE_LOCAL |
| 승인 UX | 대문자·터미널·만료·거절 안내, EOF 처리, 오래된 완료 표시 수정. 오프라인 검증 근거 있음 |
| Native 사전 점검 | 검증 전용 경로에서 모델 intent 전에 기존 Native Probe의 소유권·고정 HEAD·깨끗한 기준 검사. 실제 계정 불일치 차단 관측 |
| 다음 우선순위 | 단일 Codex의 실제 실패/Repair와 미해결 종료 시나리오 준비·별도 Host 실증 |
| 이후 과제 | 실제 Compaction, 요구 변경, Claude·Bootstrap Host 수용, Protected, macOS/Linux, 6쌍 가치 비교, 실제 협업, Todo + Calendar MVP·파일럿·출시 |

Local 성공은 Protected나 전체 Host 프로필 수용이 아니다. Host 관측은 PROVIDER_REPORTED_ONLY, 독립 Owner 인증은 NOT_ESTABLISHED, Protected는 UNSATISFIED다. 전체 제품 수용과 생산성·비용 개선은 입증하지 않았다.

## 실제 수용과 검증 근거

실제 환경은 Windows x64 / PowerShell / Node v24.14.1 / Codex CLI 0.167.0이다. runner는 검증된 0.167.0과 CI 고정 0.167.1만 허용하며 다른 버전의 수용을 뜻하지 않는다.

- 최종 VERIFY_CURRENT runner SHA-256: `307b123a9c6b63f573ff8c50b9aadc2dc581f7ea40a9c0df9f0e4316f1a062d9`.
- Task: `task-2bb5b4c5-1a74-4de3-82b4-4935a6c9c4b4`, 최종 revision 6.
- Evidence: `f0896323e0c6a9992acd0cb479ab5751888a0b924c1ff30839b8886fcb49e77c`.
- 실제 고정 검증 `node --test --test-reporter=tap test/todo.test.mjs`: exit 0, 1 PASS / 0 FAIL / 0 SKIP. 소스·테스트 변경 0건, 검증 시도 1건, Repair 0건.
- `finalize`: exit 0, CODEX_TURN_OBSERVED_AND_OBJECTIVE_COMPLETE_LOCAL, reasons 0건. 2026-11-13 인계 전 읽기 조회에서도 COMPLETE_LOCAL / SETTLED, active lease 또는 PID가 있는 Run 행 0건을 확인했다. Owner 창의 종료 대기 프롬프트는 활성 검증이 아니다.
- Native 보완 후 `node --test test/codex-live-acceptance.test.mjs test/codex-verify-current.test.mjs test/codex-mcp.test.mjs`: exit 0, 52 PASS / 0 FAIL / 0 SKIP.
- 마지막 실패 안내 수정 후 `node --test test/codex-verify-current.test.mjs test/codex-mcp.test.mjs`: exit 0, 11 PASS / 0 FAIL / 0 SKIP. 위 52건 전체를 마지막 문구 수정 뒤 재실행한 것으로 해석하지 않는다.
- 기본 회귀의 실행 후보·327 Legacy PASS·135 Host Core PASS, 개발 중 실패와 수정, 문서 검사 결과는 진행 현황에 구분돼 있다. 전체 Alpha/보호 보안 회귀·다른 OS는 이번 범위에서 NOT_RUN이다.

VERIFY_CURRENT의 첫 실제 시도는 계정 간 Git 소유권 문제로 미수용이었다. 사전 점검이 일반 Git만 확인한 결함을 보완했으며 Native 환경이나 소유권 gate를 완화하지 않았다. 이 실패는 이후 성공으로 삭제하거나 덮어쓰지 않았다. 이번 검증 전용 작업의 실제 모델 Turn은 각각 별도 승인된 실패 1회·성공 1회이며 Provider 보고 토큰 합계는 input 300,702 / output 1,328이다. 금액·잔여 한도는 UNKNOWN이며 USD 상한은 집행하지 못한다.

## Git으로 전달되지 않는 로컬 기록

코드·테스트·정제된 문서는 Git으로 전달되지만 `.codefleet/`의 DB·원문·승인·intent/receipt·비용 기록은 전달되지 않는다. 새 clone에서 원래 Task의 State가 없는 것은 정상이며, 이 인계 문서만으로 그 Task를 재생성하거나 이어서 실행하지 않는다.

| 기존 로컬 위치 | 보존 상태 |
| --- | --- |
| `.codefleet/codex-new-session-20261113-a08a006e/` | 완료된 새 세션 통합 Local 수용, 계획의 모델 2회 소모. 재실행 금지 |
| `.codefleet/codex-new-session-20261113-68b93ef0/` | 준비 후 대체된 후보, 모델 0건 상태 보존. 사용 금지 |
| `.codefleet/codex-verify-current-20261113-1a1d401c373/` | Git 소유권 실패 Turn 1회 소모, HUMAN_RECONCILIATION_REQUIRED. 재실행·효과 승인 금지 |
| `.codefleet/codex-verify-current-owner-20261113-1a1d40e2f41/` | 계정 경계 사전 점검 후보, 모델 0건. 최종 runner 이전 후보이므로 사용 금지 |
| `.codefleet/codex-verify-current-ready-20261113-1a1d4136844/` | 최종 VERIFY_CURRENT Local 완료, 모델 1회·Owner 검증 1회 소모. 재실행 금지 |

실패·성공 fixture의 `observed-runner.mjs`는 계획 SHA와 일치하는 감사용 사본이며 실행용 이관 도구가 아니다. 이전의 다른 실패·완료 fixture도 그대로 보존한다. 이 표는 일부 주요 기록의 위치 안내이며 삭제 허용 목록이 아니다.

일반 코드 개발은 Git만으로 이어갈 수 있다. 원래 실행의 상세 감사를 위해 로컬 기록이 필요하면 원본 자리에서 읽기 전용으로 확인하거나 별도 승인된 비공개 보존·전달을 계획한다. 이 작업에서는 로컬 기록을 복사·이동·압축·공개하지 않았다. 인증 파일·토큰을 옮기거나 원래 경로를 공개 문서에 기록하지 않는다.

WorkProfile은 repository/State의 절대 경로, 실행 계정, runtime과 후보에 결합돼 있다. 같은 컴퓨터라도 다른 경로나 계정에 복사한 DB를 그대로 실행하지 않는다. 코드 clone은 기존 승인·예산·lease·완료를 이전하지 않는다. 필요한 기록이 없거나 서로 맞지 않으면 해당 실행은 중단하고, 새 작업은 새 fixture·새 계약·별도 승인으로 준비한다. 과거 계획 hash를 새 경로에 맞춰 덮어쓰지 않는다.

## 새 자리에서 시작

새 clone의 예시이며 실행할 목적지를 사용자가 선택한다.

```text
git clone https://github.com/solzip/CodeFleet.git
cd CodeFleet
git status --short
git branch --show-current
git log -3 --oneline
node --version
```

기존 checkout이면 먼저 staged·unstaged·untracked와 worktree를 보존하고 원격 main을 확인한다. 깨끗하고 main을 업데이트하려는 경우에만 fetch 후 fast-forward한다. 다른 변경을 reset하거나 다른 worktree를 삭제하지 않는다. `b53ce4f`와 이 인계 문서가 최신 main에 포함돼 있는지 확인한다.

Node는 package.json의 engines 조건을 따른다. runtime 의존성 설치는 필요하지 않다. Windows에서는 필요 시 npm.cmd를 사용하고 macOS/Linux에서는 npm을 사용한다. 읽기·계획 준비에 Docker·WSL·별도 OS 계정·추가 API key는 필요하지 않으며, 보호 계약이 Docker를 요구하면 그 조건을 유지한다.

코드 변경의 기본 검증이 필요하면 CLAUDE.md의 순서대로 pretest → test:legacy → test:host-core → posttest를 실행한다. 새 clone에는 `.rule-coverage` 측정 산출물이 없을 수 있으므로 문서 검사에 필요한 Legacy 산출물을 먼저 생성한다. 각 native 명령 직후 종료 코드를 기록하고 실패하면 다음 명령으로 성공을 덮지 않는다. 검증 전용 runner를 변경하면 test:codex-live-acceptance와 test:codex-mcp 등 영향 회귀도 실행한다. 과거 Windows 통과를 새 자리의 실행 결과로 적지 않는다.

## 다음 작업과 승인 경계

1. 실패/Repair·미해결 종료의 기존 구현·오프라인 근거를 먼저 읽고 한 가지 WorkItem을 선택한다. 완료된 정상 CHANGE·새 세션·VERIFY_CURRENT Live를 반복하지 않는다.
2. 범위·수락 기준·고정 테스트·실패/중단 조건·검증 책임과 모델/검증 시도·시간·관측 비용 한도를 검토 가능한 계획으로 준비한다. 기본은 단일 Agent다.
3. 필요한 offline runner·부정 회귀를 구현·검증하고 같은 실제 OS 계정에서 새 fixture와 Native 사전 점검을 준비한다. 일반 Git의 safe.directory 성공을 Native 준비로 간주하지 않는다. 전역 설정·소유권을 바꾸거나 약한 sandbox로 자동 전환하지 않는다.
4. 새 모델 Turn에는 새 계획에 대한 별도 실행·비용 승인이 필요하다. Owner 효과도 별도 TTY의 대문자 확인으로 승인한다. 과거 채팅의 "진행"이나 소모된 승인·budget을 새 자리에서 재사용하지 않는다.
5. 결과는 기존 Task/Run/Event·Evidence/Judge와 현재 후보로 재검증하고 진행 현황에 기록한다. 이 인계 기록이나 Agent 메시지는 실행 권한·완료 증거가 아니다.

이번 사용자는 현재 작업의 commit·push와 인계 문서 작성을 승인했다. 다음 변경의 commit·push·배포·외부 효과는 해당 요청의 권한을 확인한다. 게시 시 MIT와 저장소의 가명 정체성을 유지하고 실명·비밀·개인 경로를 추가하지 않는다.

인계 문서·연결 안내만 갱신한 검증은 Windows / PowerShell / Node v24.14.1에서 문서 배치 3 PASS와 posttest exit 0(Markdown 38개·링크 254개·인용 4건·선언 사실 42건), staged diff 검사 exit 0이었다. 기존 커버리지·anchor 기준선을 변경하지 않았으며 Live를 재실행하지 않았다.

새 세션 시작 요청 예시:

> AGENTS.md와 project/PROGRESS.md, docs/product-completion/roadmap.md, project/records/2026-11-13-local-work-handoff.md를 읽고 원격 main과 현재 checkout을 대조해. 완료된 Live와 기존 fixture·비용 승인은 재실행·재사용·초기화하지 마. 남은 단일 Codex 실패/Repair·미해결 종료 중 다음 WorkItem의 구현·오프라인 검증과 새 수용 계획을 준비하고, 실제 모델·Owner 효과는 별도 승인 경계를 지켜.
