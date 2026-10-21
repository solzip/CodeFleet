# First Host-Native Acceptance Preflight — Codex `$codefleet`

- 작업 일시: 2026-10-20 (Asia/Seoul)
- 대상 커밋: `c3bca1e8b3481a1a3e6dff1cc7e1e8ef5c72bc03` 및 미커밋 작업 트리
- 작업 유형: 사전 점검·Fixture 준비·승인 요청 준비
- 선행 문서: [Hybrid 안정화](hybrid-concurrency-checkpoint.md), [후보 목록](hybrid-checkpoint-inventory.json)
- 번호 실측 최대값: REGISTER P0-17 / P1-61. 새 등재·등급 변경 없음.

## 판정

**PREPARED_WITH_BLOCKERS / LIVE_NOT_AUTHORIZED.** 실제 모델 호출은 0회다.
대상은 기본 `$codefleet`이며 H6 `$codefleet-plan`이 아니다.
이 작업은 Live 실행 승인이 아니며 HOST_LIVE_VERIFIED를 부여하지 않는다.
기존 548건 전체 회귀는 선행 기록의 결과이며 이번에 재실행하지 않았다.

## 실행 환경

작업 위치는 `.codefleet/worktrees/alpha-g0`, branch는
`feature/alpha-g0-refresh`, HEAD는 상단 값 그대로다.
실제 비모델 명령으로 측정한 환경:

| 항목 | 값 |
| --- | --- |
| Host | `codex-cli 0.162.1` (`codex.cmd --version`) |
| OS | native Windows / x64 |
| Runtime | Node `v24.14.1`, Git `2.42.0.windows.2` |
| 모델 | **UNCONFIRMED** — 정확한 모델 ID를 요청했으며 추정하지 않음 |
| 인증 | NOT_INSPECTED. 로그인 상태·계정·키 파일을 조회하지 않음 |
| 실행할 Skill | 기본 `codefleet`의 현재 생성 템플릿 |
| 실제 Skill 발견/호출 | NOT_RUN / 설치 위치 미확정 |
| 도구 정책 | 제안만 작성. 현 세션 설정·권한 변경 없음 |

`codex.cmd --help`도 모델 없이 확인했다. 도움말의 권한 옵션이 존재한다는
사실은 현재 세션에 원하는 제한이 적용되어 있다는 증거가 아니다.

## Fixture 준비와 바인딩

worktree 기준 경로:
`.trials/host-core-checkpoint/first-host-acceptance/fixture`

이는 자체 `.git`을 가진 독립 테스트 저장소다. 물리적으로 ignored checkpoint
아래에 있지만 제품의 Git baseline이나 소스·문서를 복사하지 않았다.
단독 준비 파일은 `README.md`, `package.json`, `src/events.js`,
`test/events.test.js`다. 외부 의존성·네트워크·계정·개인 데이터는 없다.

임시 경로의 `cf-*`/`codefleet-*` 후보 20,490개에 대해 정해진 source 위치의
event 파일명만 검색했으며 후보 0개였다. 모든 임시 저장소의 내용을 감사하거나
모든 이름의 이벤트 구현이 없다고 판단한 것은 아니다.
적합한 재사용 대상을 찾지 못해 가짜 이벤트 Fixture를 새로 작성했다.

버그는 같은 ID를 재입력해도 effect가 다시 호출되는 것이다. 기대 범위는 단일
동기 processor의 중복 방지, 다른 ID 처리, effect 예외 후 재시도, 인스턴스 분리다.
분산 exactly-once·비동기 경쟁·프로세스 재시작 후 영속성은 범위 밖이다.

검토한 Fixture에 한해 이번 준비 중 다음을 실제 실행했다.

```text
node --test test/events.test.js
exit 1: 4 tests, 3 passed, 1 failed, 0 skipped
failed: duplicate event ID produces one effect
```

이는 Local fixture baseline 관측이며 CodeFleet Protected Evidence가 아니다.
Live 계획 세션에서는 이 테스트 명령을 다시 실행하지 않는다.
[비식별 로그](first-host-native-fixture-test.log), [파일별 hash 및 환경](first-host-native-preflight-evidence.json).

- Fixture snapshot SHA-256:
  `2acf1e4f203fb23c3627a36a3e7d862ad7c76d25caa2ad15d57da7c841c34aca`
- snapshot 정의: evidence JSON의 순서 고정 `files` 배열을 UTF-8
  `JSON.stringify`한 결과의 SHA-256. Git tree hash와 다르다.
- **Fixture Commit Hash: 없음 (`null`)**.
  `git rev-parse --verify HEAD` exit 128. Git init만 수행했고 add/commit은 하지 않았다.

현재 Fixture의 untracked 파일 상태로는 기존 clean Git baseline 조건을 만족하지
못한다. `src/intent/discovery.mjs` working-tree line 11의 HEAD 조회 및
`src/product/tasks.mjs` line 77의 baseline/dirty 검사 계약을 우회하지 않는다.
커밋된 동일 Fixture를 제공받거나, **별도 작업으로 Fixture 초기 커밋만 명시적
승인**받은 뒤 준비해야 한다. 이번 Git Commit 금지는 그대로 지켰다.
따라서 이번에는 이 Fixture의 Draft Validator 통과·DAG 생성을 주장하지 않는다.

## Skill과 runtime 식별

현재 `src/hosts/install.mjs`의 기본 `skill('codex')` 생성 함수를 읽어
별도 빈 VM context에서 문자열만 생성했다. installer를 실행하거나 Host
등록/설정을 바꾸지 않았다. 이는 사용자 정의 Skill을 새로 작성한 것이 아니다.

- 기본 SKILL.md 생성 bytes SHA-256:
  `a57b669e9e183875e9c588f2b40db9a3173a9557f5e8cdd774aa113233106924`
- 기존 runtime 파일 79개의 경로/hash manifest SHA-256:
  `48a1356b71c58424100ac60db83e706f1df8b87c4f13e77d44a22ff9f0cc50f1`
- 상태: **GENERATED_TEMPLATE_NOT_INSTALLED_OR_DISCOVERED**.
  이는 실제 Codex가 로드한 Skill hash라는 주장이 아니다.

worktree 및 새 Fixture의 `.agents/skills/codefleet/SKILL.md`는 존재하지 않았다.
개인 Host 홈 전체를 탐색하거나 인증/대화 파일을 읽지 않았다.
실제 로드 위치가 정해지면 위 hash와 installed bytes 및 runtime receipt가
일치해야 한다. 수정되었거나 다른 동명 Skill이면 승인 요청을 새로 만든다.

공식 문서는 repository/user 등 Skill 발견 위치를 구분하고 동명 Skill을
병합하지 않는다고 설명한다. 따라서 **실제 선택된 경로 확인**이 필요하다.
[OpenAI Docs: Skill 발견](https://learn.chatgpt.com/docs/build-skills).
새 Fixture 안에 제품 runtime을 복사하지 않는 조건을 유지하려면 Fixture 밖의
검토된 기존 설치 위치를 사용해야 한다. 적절한 설치가 없으면 별도 설치 준비를
먼저 승인받고, 임의 전역 설치나 제품 checkout 전체 노출로 대체하지 않는다.

## 필요한 Host 권한 및 도구

아래는 다음 Live를 위해 검토할 **최소 요청 범위**다. 현재 적용된 정책이 아니다.
실제 도구 ID와 effective policy는 실행 전에 확인해 승인서에 고정한다.
자연어 Skill 지침이나 명령 allowlist 제안만으로 보안 격리를 보장하지 않는다.

| 범위 | 허용 요청 | 금지 |
| --- | --- | --- |
| Fixture | 위 4개 파일과 고정 Git baseline metadata 읽기/검색 | 모든 코드·테스트·README·Git metadata 쓰기 |
| Skill | 정확한 SKILL.md와 검토된 runtime 읽기/실행 | Skill 변경, 다른 Skill/MCP/Agent 호출 |
| 일반 읽기 | 경로 고정 `rg --files`, `rg -n`, `Get-Content -LiteralPath` 또는 동등한 native read/search | 사용자 홈·제품 문서·다른 프로젝트·auth/env/session/transcript 탐색 |
| CodeFleet CLI | 아래 고정 plan/status/draft/prepare/workflow/explain/report 호출만 | objective approve, requests/submit/run/resume, inspect-local/verify-local, provider 선택·allow-model |
| 쓰기 | STATE의 CodeFleet 준비 SQLite/artifacts/events; 신뢰된 collector의 proposal JSON | Fixture 쓰기, 일반 파일 write/edit/apply_patch, 임의 shell redirection |
| Shell | 고정 실행 파일과 argv의 위 명령만, 승인된 cwd | 임의 shell/script/eval/node -e, 파이프·명령 연결·명령 치환, npm/test/build/git 변경, 설치 |
| 외부 | 없음 | 일반 인터넷, web search, MCP, Docker/WSL, remote Git, PR/deploy, 하위 모델/Agent |

STATE는 worktree 기준
`.trials/host-core-checkpoint/first-host-acceptance/live-state`로 제안한다.
Fixture의 형제 경로이며 아직 생성하지 않았다. 기본 `~/.codefleet-alpha`로
fallback하지 않도록 모든 CLI 호출에 정확한 `--state`를 반드시 전달한다.
Host 자체의 session/scratch 기록은 Host 관리 경로에 별도로 존재할 수 있다.
해당 경로는 fixture/보고서로 복사하지 않으며 실제 정책에서 쓰기 범위를
확인해야 한다. “디스크에 어떠한 쓰기도 없다”는 주장은 하지 않는다.

공식 permissions 문서는 읽기 전용과 경로별 쓰기, 명령 네트워크 제한을
구분한다. 기본 workspace-write를 이 Fixture의 read-only 조건과 동일시하지
않는다. 실제 Windows profile 적용·범위는 이번에 검증하지 않았다.
[OpenAI Docs: Permissions](https://learn.chatgpt.com/docs/permissions).
필요한 경로별 제한 또는 실행별 승인 경계가 없으면 시작하지 않는다.
자동 승인·sandbox bypass·광범위 add-dir를 사용하지 않는다.

## 기존 세션·인증·네트워크

기존 Codex 설치와 Host 소유 인증을 사용하며 CodeFleet는 자격증명을 취급하지 않는다.
인증 상태는 미확인이다. 로그인이 필요하면 이번 승인 범위 밖에서 사용자가
Host UI로 처리한다. API Key 사용/복사/출력, auth 파일 읽기는 허용하지 않는다.
외부 모델 endpoint를 CodeFleet에서 직접 호출하지 않는다.

모델 통신은 승인한 모델에 대한 **Host 자체 통신만** 요청한다.
일반 도구/CLI의 네트워크는 deny다. 모델 통신 허용을 도구 인터넷 허용으로
확장하지 않는다. 정확한 endpoint·transport는 인증정보를 덤프해 추측하지
않으며 Host 정책 화면/관리자 설정으로 확인해야 한다.

현재 이 작업 대화는 제품 문맥을 포함하므로 그대로 resume/fork해 Fixture
수용에 사용하면 안 된다. 기존 CLI/인증을 유지하되 **비공개 과거 문맥 없는
빈 대화 컨텍스트**에서 시작해야 한다. “기존 세션”이 현재 transcript의
그대로 재사용을 뜻한다면 비공개 문맥 미노출 조건과 양립 여부가 미해결이다.
이 점을 승인 전에 확인한다. 새 계정·인증 복제·H6 격리 세션을 요구하는 것은 아니다.
대화 transcript를 Fixture 파일로 저장하지 않는다.

## 계획한 호출과 상태 변화

먼저 Commit Hash, 설치 위치/hash, 모델, 권한, 빈 문맥 조건을 확정해야 한다.
아래 CLI는 **계획**이며 이번에 실행하지 않았다.
`CLI`는 선택된 설치의 `runtime/alpha/cli.mjs`, `STATE`/`FIXTURE`는 위 고정 경로다.

```text
node CLI --state STATE host codex plan GOAL FIXTURE
node CLI --state STATE host codex status TASK
node CLI --state STATE host codex draft TASK STATE/proposal.json
node CLI --state STATE host codex prepare TASK
node CLI --state STATE host codex workflow TASK
node CLI --state STATE host codex explain TASK
node CLI --state STATE host codex report TASK
```

1. Codex에서 실제 `$codefleet`을 명시적으로 선택하고 로드 경로/hash를 관측한다.
2. Goal은 다음 문자열로 고정한다:
   “동일 이벤트 ID의 중복 effect를 막는 수정 계획을 작성하라. 다른 ID는 처리하고,
   effect 실패 후 재시도와 인스턴스별 독립성을 유지하라. 이번에는 분석과 계획만 수행하라.”
3. 허용한 Fixture read/search로 버그를 분석한다. 준비 단계의 테스트 로그는
   collector의 과거 관측으로 구분하며 Host가 테스트를 실행했다고 말하지 않는다.
4. `{revision,proposal:{draft,references,inferences}}`를 응답한다.
   draft는 기존 정확한 필드 `schemaVersion:2,objective,base,files,tests,criteria,
   risks,unknowns,effects`를 사용한다. source는 `src/events.js`, test는
   `test/events.test.js`. 기준은 `method:"protected-tests"`와 해당 test 경로다.
   모든 source/test에 실제 path·line·quote를 붙이고 추론을 분리한다.
5. collector가 검토한 bounded JSON을 `STATE/proposal.json`에 기록한다.
   Host에게 임의 파일 쓰기 권한을 주지 않는다. 기존 draft CLI가
   `validateSemanticProposal`과 기존 TaskDraft/Contract 검사를 수행한다.
6. VALIDATED일 때 prepare → workflow/explain/report를 조회한다.
   prepare exit 2 / WAITING_APPROVAL은 예상된 준비 결과다.
   기존 계약의 `effects:["local-edit"]`는 **후속 수정 계획**을 표현하며 이번
   Live의 수정 권한이 아니다. 보호 테스트 요구도 미래 gate이며 실행 증거가 아니다.
7. 확인되지 않은 위험·unknowns가 있으면 숨겨서 VALIDATED를 만들지 않는다.
   NEEDS_INPUT/CAPABILITY_GAP이면 안전한 중단이며 전체 수용 성공은 아니다.

예상 쓰기: Task·revision·Draft·graph·준비 Run·events/artifacts.
**Run 레코드 생성과 실행 권한 부여는 다르다.** 승인 원장/attempt/accepted
artifact/verified evidence가 생기면 실패다. CLI의 nextAction에 approve/run이
표시되어도 수행하지 않는다. approval-request도 이번 allowlist에서 제외한다.
Fixture base/tree와 4개 파일 hash는 시작 전후 동일해야 한다.

## 실행 예산·중단 조건

| 항목 | 제안 예산 |
| --- | --- |
| 수용 세션 | Codex 1개, 목표 입력 1회, 최종 Draft 1개 |
| 도구 | 읽기/검색 최대 16회, CodeFleet CLI 최대 8회, 총 최대 24회 |
| 경과 시간 | 첫 승인된 목표 전송부터 10분. 관측자가 deadline에 중단 |
| 최종 응답 | 최대 64 KiB; 초과 JSON은 저장/제출하지 않음 |
| 모델 사용량 | Host 기본 인증의 기존 구독 범위만. 추가 유료 크레딧/API 청구 허용 없음 |
| 토큰 | 운영 목표 총 16,000 이하. 현재 hard cap 집행/사전 사용량 관측 미검증 |
| 재시도/세션 추가 | 자동 재시도·다른 모델 fallback·추가 세션 불허, 별도 승인 필요 |

한 사용자 목표라도 Host 내부 모델 요청은 도구 왕복 때문에 여러 번일 수 있다.
따라서 API request 1회나 비용 0을 보장하지 않는다. token/cost가 관측되지 않으면
UNKNOWN으로 기록한다. hard token/금액 한도가 승인 필수 조건이라면 지원되는
Host 제어를 먼저 확인해야 하며, 시간/도구 제한으로 대체했다고 주장하지 않는다.
시간·도구 budget은 감독 절차로 제안한 것이고 이번에 자동 집행을 검증하지 않았다.

즉시 중단: Fixture/Skill/base 변경, scope 밖 read/write 요청, 인증정보 노출,
일반 네트워크/외부 변경, 임의 shell, 모델·도구·권한 fallback, 승인/Evidence
위조, budget 초과, validator 실패, 관측 누락으로 사용량 제한을 판단할 수 없는 경우.
재시작·권한 확대 대신 STOP/BLOCKED를 기록한다.

## 수용 기준과 현재 상태

| 기준 | Live에서 요구할 독립 관측 | 현재 |
| --- | --- | --- |
| 실제 Skill 호출 | 선택 경로·hash, 실제 SKILL.md load 확인 | NOT_RUN |
| Fixture 기반 Draft | objective/base 일치, 실제 references, 추론 분리 | NOT_RUN |
| 기존 Validator 통과 | trusted CLI exit/result, VALIDATED | BLOCKED: Commit 없음 |
| DAG 조회 | persisted graph/hash/dependencies 조회 | BLOCKED: Validator 선행 |
| Fixture 무변경 | 전후 base/tree/파일 hash/status 비교 | 준비 snapshot 확보; Live 미실행 |
| 권한 생성 없음 | approval 0, attempts 0, accepted/evidence 없음 | Live 상태 미생성 |
| 보고/증거 구분 | PROVIDER_REPORTED_ONLY와 Validator 관측 구분 | 계획에 명시 |
| 미실행 표시 | 코드 변경·테스트·protected verify·Host 격리·completion 미실행 | 계획에 명시 |

최종 성공 명칭은 제한된 **기본 Host 계획 경로 수용**으로 한정한다.
이 수용만으로 protected execution, H6, 자동 위임, 전체 HOST_LIVE_VERIFIED를
주장하지 않는다.

## 남은 차단 조건과 별도 승인 요청

현재 바로 실행할 수 있는 승인 요청은 아니다. 다음 값/조건을 먼저 고정해야 한다.

1. 커밋된 깨끗한 Fixture와 실제 Commit Hash. 이번 커밋 금지는 해제하지 않았다.
2. 정확한 모델 ID 및 기존 구독으로 사용 가능한지의 사용자 확인.
3. Fixture 밖 실제 기본 Skill 설치·발견 위치와 위 hash 일치.
4. 기존 CLI에서 비공개 문맥 없는 시작 방식, 경로/명령/네트워크 제한의 실효성.
5. budget 감독 담당/취소 방식 및 토큰·비용 관측 한계 수용 여부.

별도 승인 문안은 위 조건을 실제 값으로 채운 뒤 다음 범위로 제시한다:

> 고정한 Fixture Commit·snapshot과 설치 Skill/runtime hash, 명시 모델을 사용해
> 기존 Codex 인증의 빈 대화 컨텍스트에서 `$codefleet` 계획 수용 1회를 허용한다.
> Fixture는 읽기 전용이며 위 read/search 및 준비 CLI만 실행한다.
> STATE의 준비 기록과 collector proposal 저장만 허용한다.
> 시간·도구·응답 budget 및 관측 한계를 확인했다.
> 코드 수정·테스트 실행·승인/실행/완료·일반 네트워크·API Key·Git 변경·배포는 허용하지 않는다.

Fixture commit/Skill 설치 준비가 별도로 필요하다면 이 모델 호출 승인에
끼워 넣지 않고 해당 준비 범위에 대해서만 먼저 승인받는다.
이 문서를 작성했다는 이유로 어느 승인도 부여된 것으로 취급하지 않는다.

## 결론

가짜 이벤트 Fixture와 기본 Skill 템플릿의 hash 및 제한된 수용 계획을 준비했다.
Fixture Commit·모델·실제 Skill 발견·권한/문맥 조건이 미확정이므로 Live는 차단 상태다.
모델·API Key·제품 소스 변경·Git Commit/Push/PR/배포는 수행하지 않았다.

## 문서·보존 검사

`npm.cmd run posttest` exit 0, `git diff --check` exit 0.
[문서 검사 로그](first-host-native-preflight-docs.log)를 보존한다.
기존 후보 manifest의 제품 소스·테스트 20개 hash는 모두 일치했다.
Fixture의 4개 파일도 준비 snapshot 이후 변경되지 않았다.
보안 검사는 새 공개 기록·로그와 Fixture의 제한된 개인 경로/키 패턴을
대상으로 하며 완전한 Secret 부재 보증이 아니다. 인증정보 저장소는 읽지 않았다.

## 다음 작업

위 차단 조건의 실제 값을 확정한 뒤 범위가 고정된 별도 Live 승인을 요청한다.

## 미해소로 남긴 것

Commit 없는 Fixture, 미확정 모델/설치 위치, 실제 정책 집행·usage 관측,
비공개 문맥 없는 기존 CLI 시작 방식. H6는 이번 범위가 아니다.
