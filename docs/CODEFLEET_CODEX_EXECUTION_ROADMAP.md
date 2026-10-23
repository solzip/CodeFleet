# CodeFleet — Codex 실행 로드맵: Bootstrap → Host 실행 → 검증

**상태:** 실행 계획(미수행)  
**기준:** GitHub `main` — `f5b93a35ec9140d5e37dadf8d6ddc9e7c6fce8ed` (실행 전 재확인)  
**대상:** `solzip/CodeFleet`  
**목적:** NEW_PROJECT 실제 사용에서 확인된 차단 원인을 최소 범위로 해결하고, 승인된 Host-Native 개발과 Evidence/Judge까지 안전하게 연결한다.

> 본 문서는 기존 `docs/product-completion/roadmap.md`를 대체하지 않는 **이번 결함 수정용 작업 계획**이다. 문서 작성만으로 기능이 완성되지 않는다. 실행 증거, 테스트 종료 코드, 실제 Host Live 결과로 수용 여부를 판정한다.

## 0. 작업 규칙 및 기준선

1. `AGENTS.md`, `CLAUDE.md`, `docs/PRODUCT_VISION.md`, `docs/product-completion/{architecture,roadmap,progress}.md`의 유효한 원칙을 따른다.
2. 시작 시 `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git fetch` 가능 여부, Worktree 목록을 확인한다. 원격 `main`이 달라졌으면 차이를 확인하고 이 문서에 새로운 SHA를 기록한다. 기존 미커밋 파일, 별도 Worktree, 로컬 STATE·Evidence를 보존한다.
3. 작업 브랜치 예시: `fix/bootstrap-host-live-acceptance`. 이미 있는 브랜치를 덮어쓰지 않는다. Git 브랜치 생성·전환, Commit·Push·PR·병합·삭제는 사용자 승인 범위를 확인한다. `reset --hard`, `clean`, `push --force` 금지.
4. **기본 단일 Agent.** 별도 Agent 사용은 독립 작업과 실제 이점이 있고 Host 권한이 허용될 때만. 직접 모델 API 키·Docker·WSL·별도 OS 계정은 기본 계획·개발에 추가하지 않는다.
5. 변경할 때마다 관련 정상·부정 테스트와 기존 회귀를 수행하고 **실제 실행된 범위만 PASS**로 표시한다. Docker 보호 시험을 실행하지 못하면 `NOT_RUN`/`UNSATISFIED`로 기록한다.
6. 테스트를 약화하거나 Operator/Broker 승인·Capability·Evidence 경계를 우회하지 않는다. `Host 보고 ≠ Local Evidence ≠ Protected Evidence`.
7. 모든 단계는 아래 **산출물 + 수락 조건 + 중단 조건**을 충족해야 다음 단계로 넘어간다. 승인 부재·미지원·불확실한 외부 효과는 Human Handoff한다.

## 1. P0-A — Bootstrap Validator 부정문 오탐

**재현:** NEW_PROJECT Objective의 `Push 금지`, `배포하지 마`, `do not deploy`, `without deployment`를 위험 행위 실행 요청으로 분류하는지 확인한다.

**관련 코드:** `src/intent/bootstrap.mjs`의 `PRIVILEGED`/`objectiveUnknowns()`와 `src/product/tasks.mjs`의 Scope Clarification. 현재 `PRIVILEGED`는 단어의 출현만 탐지하므로 금지·제외 의도가 `privileged-intent`가 된다.

**구현:**
- 사용자에게 실행을 요구하는 위험 행위, 명시적 금지·제외 범위, 혼합 요청, 모호한 문장을 구분한다. 단순히 `push`·`deploy` 키워드를 제거하거나 무조건 허용하지 않는다.
- 실제 위험 행위가 포함된 복합 요청은 기존 `ObjectiveClarification`을 유지한다. 명백히 금지된 행위만 등장하면 그것으로 실행 권한을 부여하지도, 불필요한 범위 확인을 요구하지도 않는다.
- 원본 Objective·해시·Revision·Clarification 결합 규칙은 유지한다.

**회귀 테스트:** `test/bootstrap*.test.mjs`의 적절한 기존 파일에 추가.

| 입력 유형 | 예시 | 기대 |
|---|---|---|
| 금지(한국어) | `Git Push와 배포는 하지 마` | 위험 실행 의도로 오탐하지 않음 |
| 금지(영어) | `Do not deploy or push` | 위와 동일 |
| 제외(명사형) | `배포 제외, 로컬에서만 실행` | 배포 승인 요구 없음 |
| 적극적 요청 | `완료 후 배포하고 Push해 줘` | `privileged-intent` 범위 확인 |
| 혼합 | `배포하지 말고 운영 DB 삭제해 줘` | 삭제 요청을 차단/확인 |
| 모호함 | `배포도 고려해 줘` | 불확실한 실행 의도를 안전하게 취급 |
| 안전 회귀 | 평범한 Todo Bootstrap 목표 | 종전 VALIDATED/DAG 경로 유지 |

**수락:** 정상·반증 테스트 통과, 기존 Hash/Clarification/승인 게이트 유지, 차단을 가짜 성공으로 만들지 않음. 실패하면 해당 사례를 기록하고 다음 단계로 진행하지 않는다.

## 2. P0-B — Host-Native 실행 경로 책임·권한 연결

**문제:** `BLOCKED_NO_OS_AUTHENTICATED_BROKER`, `publicExecution: BLOCKED`로 승인된 일반 로컬 개발까지 진행할 수 없는지 판정해야 한다. 이는 별도 보호 경계이며 P0-A만 해결해도 자동 해제되지 않는다.

**먼저 실제 코드 점검:** `src/hosts/{cli,operator,operator-runtime,workflow-authorization}.mjs`, `src/product/tasks.mjs`, `src/workflow/bootstrap-files.mjs`, `src/verification/backends.mjs`, 관련 테스트 및 승인 흐름. 이미 존재하는 NEW_PROJECT의 `files → objective approve → objective materialize → objective verify` 경로와 공개 `requests/submit/run/resume` 차단의 책임 차이를 확인한다.

**실행 가능한 최소 경로 선택:**
1. 기존 NEW_PROJECT의 승인된 fileset 생성·검증이 정상 경로라면 그것을 우선 재사용한다. 파일 생성과 독립 검증이 서로 다른 권한·증거 수준임을 노출한다.
2. Host 도구가 실제 작업을 수행하는 경우, 실제 Host 권한과 CodeFleet의 계약·범위·Revision·상태·Evidence를 묶는 **지원된 연결 지점**만 보완한다.
3. OS 인증 Broker가 요구되는 보호 실행은 기존 보호 게이트를 유지한다. Broker 부재 시 보호 기능 `BLOCKED`/`UNSATISFIED`를 정직하게 표시한다. 임의 actor 문자열이나 Host의 성공 주장으로 승인·Protected Evidence를 위조하지 않는다.
4. 원격 PR·배포·외부 서비스 변경은 이번 범위에서 제외한다.

**테스트:** 승인 없는 fileset 거부, 다른 해시·다른 Revision·만료 승인 거부, 제한 범위 정상 fileset 수용, 기존 파일 덮어쓰기·심볼릭 링크·범위 이탈 거부, 중단·재실행·중복 부작용 반증. 실제 Host가 지원하지 않는 기능은 `CAPABILITY_GAP`으로 남긴다.

**수락:** 안전한 로컬 개발 경로 하나를 실제 NEW_PROJECT에서 승인과 함께 시연하고, 파일 변경·실행 결과·검증 결과의 출처를 구분하여 재조회 가능. 보호 검증까지 완료했다는 주장은 해당 Backend의 실제 Evidence가 있을 때만. 불가능하면 원인과 Human Handoff를 명시하고 실행 차단을 우회하지 않는다.

## 3. P1-A — CLI 종료 코드·영속 상태 관측 정합성

**문제:** Host가 보고한 `draft`/`prepare`의 종료 코드와 저장 상태가 달라 보이는 사례가 반복됨. PowerShell의 래퍼 관측값과 네이티브 프로세스 종료값을 분리해 확인한다.

**작업:**
- `src/hosts/cli.mjs`, 진입 CLI 및 `src/product/cli.mjs`에서 `VALIDATED`, `NEEDS_INPUT`, `BOOTSTRAP_PREPARED`, `BLOCKED` 상태와 계약된 종료 코드·JSON 출력의 관계를 확인한다.
- Windows PowerShell에서 `$LASTEXITCODE`, stdout/stderr 및 subprocess exit code를 기록하여 실제 문제의 발생 지점을 구분한다.
- 상태 기록 후 `NEEDS_INPUT`/승인 대기로 반환되는 것은 상태 저장 성공과 명령 성공을 혼동하지 않도록 설명한다.
- 실제 불일치만 최소 수정하고 POSIX/Windows 회귀를 추가한다. 전체 CLI 코드 체계를 재설계하지 않는다.

**수락:** CLI 직접 실행, 래퍼 실행, 새 프로세스 재조회에서 상태·Revision·실제 exit code가 일관되고 관측 한계를 명시함.

## 4. P1-B — Codex Host Live 수용 재검증

**Fixture:** 사용자 전용의 깨끗한 테스트 프로젝트와 기존 STATE를 안전하게 분리. 이전 실패 Task/원본 로그는 보존하고 재실행을 새 Task·Attempt와 연결한다.

**경로:** 실제 `$codefleet` 호출 → NEW_PROJECT probe → BootstrapDraft → Validator → DAG → WorkItem fileset 제안 → 명시적 승인 → 허용된 변경 → Local 검사 → Evidence/Judge 수준별 보고.

**증거:** CLI/Host 버전·OS·작업 경로(공개본에는 비식별화)·기준 SHA·Task ID·Revision·workflow/fileset hash·승인·명령·종료 코드·파일 변경 해시·검증 authority·차단·미수행 단계.

**수락:** 적어도 한 개의 작은 실제 WorkItem이 승인된 변경과 허용된 검증까지 도달하면 해당 단계만 Host Live로 표시. `HOST_LIVE_VERIFIED` 전체 선언은 독립된 필수 시나리오를 모두 충족한 경우에만. Protected 검증 미충족이면 전체 Objective는 완료가 아니다.

## 5. P1-C — Claude Code 동일 시나리오 독립 검증

`/codefleet`을 **실제 Claude Code 세션**에서 호출. Claude의 대화형 권한 승인과 Skill 로드 결과를 확인한다. Codex의 결과나 오프라인 테스트를 Claude 성공으로 대체하지 않는다. 동일한 핵심 계약·검증 조건을 사용하되 Host별 권한 차이는 기록한다. 차단되면 원인과 다음 인간 결정 사항을 명시한다.

## 6. P2 — Agentic Development Loop와 비즈니스 실험으로 확장

P0/P1 수용 후 별도 승인으로 다음을 진행한다.

- 단일 Agent 기반 목표→실제 구현→검증→실패 분석→제한 수정→재검증의 종단 간 증거
- Objective의 Turn/Attempt/세션 종료 분리, Context Compaction 후 Recovery, Contract Revision 변경·승인 재검사
- 실제 역할별 위임·파일 충돌 관리·통합 재검증(Host가 지원할 때만)
- 동일 수락 기준에서 A: 기본 Host 단일 Agent, B: CodeFleet 단일 Agent, C: CodeFleet Multi-Agent 비교
- Todo + Calendar MVP의 실제 기능과 사람 개입 시간·품질·재작업·실행비용 기록

이 단계의 존재는 완료를 뜻하지 않는다. 성능 향상이 측정되지 않으면 단일 Agent를 기본으로 둔다.

## 7. 각 단계의 필수 보고 형식

- 기준 브랜치/SHA, 환경 및 Host 버전
- 변경 파일, 변경 이유, 기존 모듈 재사용 여부
- 실제 테스트 명령·exit code·PASS/FAIL/SKIP/NOT_RUN
- 승인·Capability·Lease·Evidence의 상태와 한계
- 기능 상태: `IMPLEMENTED` / `OFFLINE_VERIFIED` / `HOST_LIVE_VERIFIED` / `BLOCKED` / `NOT_RUN` / `CAPABILITY_GAP`
- 과거 대비 새로 증명된 사실, 여전히 미증명인 사항
- 다음 단계 진행 가능 여부와 필요한 사용자 승인

**중단 조건:** 주요 보호 게이트 실패, 무승인 변경 필요, 미확정 외부 부작용, 상태/증거 불일치, 새 기준선 충돌, 테스트 실패의 원인 미확인. 이를 무시하고 다음 단계로 넘어가지 않는다.

## 8. Codex에 전달할 시작 명령

> 이 문서를 단계별 실행 계약으로 사용하라. 먼저 0번 기준선 점검 후 **P0-A Validator 부정문 오탐**만 수정·테스트하라. 결과와 변경 파일·테스트 증거를 보고한 뒤 멈춰라. P0-B의 Host 실행 권한 경계를 동시에 변경하거나 공개 실행 차단을 해제하지 마라. 각 단계의 진행·Commit·Push·PR은 현재 사용자 승인 범위를 확인하라. 기존 기록과 Worktree를 보존하라.

---

**권장 Git 운영:** 이번 계획 문서는 로컬에서 읽을 수 있는 위치에 먼저 전달한다. 저장소 안에 추가할 경우 `docs/product-completion/` 같은 기존 공식 문서 구조와 중복하지 않도록 단기 실행 계획으로 명확히 표시한다. 단계별 기능 변경은 작은 커밋과 PR로 분리하고, GitHub `main`에 반영된 뒤 다음 단계로 진행한다.
