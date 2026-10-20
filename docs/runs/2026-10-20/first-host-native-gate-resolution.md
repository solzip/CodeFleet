# First Host-Native Acceptance — Gate Resolution

- 작업 일시: 2026-10-20 (Asia/Seoul)
- 대상 커밋: `c3bca1e8b3481a1a3e6dff1cc7e1e8ef5c72bc03` 및 미커밋 작업 트리
- 작업 유형: Fixture·설치·발견·권한 사전 검증
- 선행 문서: [Preflight](first-host-native-acceptance-preflight.md), [기존 evidence](first-host-native-preflight-evidence.json)
- 번호 실측 최대값: REGISTER P0-17 / P1-61. 새 등재·등급 변경 없음.

**전체 상태: BLOCKED.** 이번에는 기본 `$codefleet` 설치·발견을 실제 확인했다.
모델 호출, thread/turn 생성, Fixture/제품 Commit, Push/PR/배포는 하지 않았다.
H6 `$codefleet-plan`과 관련된 격리 수용을 수행한 것이 아니다.
[이번 실측 evidence](first-host-native-gate-resolution-evidence.json).

## 조건별 상태

| 조건 | 상태 | 근거 및 남은 범위 |
| --- | --- | --- |
| 공개 가짜 Fixture의 커밋 후보 확인 | RESOLVED | 독립 Git root, remote 0, 가짜 파일 4개 수동 검토·기존 hash 일치 |
| Fixture의 immutable Git Commit baseline | BLOCKED | HEAD 없음, exit 128. 이번 작업도 Commit 금지 |
| 파일 manifest / tree 식별 | RESOLVED | 기존 SHA-256 유지, 후보 Git tree SHA-1 계산·blob hash 대조 |
| 실제 기본 Skill 설치 | RESOLVED | Fixture 내부 설치, 81개 receipt 항목 hash 일치 |
| 실제 Codex Skill 발견 | RESOLVED | repo scope 정확 경로 발견 1→0→1, 오류 0 |
| 대화에서 `$codefleet` 지침 수행 | NOT_RUN | skills/list는 모델 호출이나 지침 수행이 아님 |
| Native read-only 파일 쓰기 거절 | PARTIALLY_VERIFIED | 가짜 파일 쓰기 EPERM; 실제 사용자 elevated 세션과 별도 조건 |
| 정확한 명령 allowlist 집행 | BLOCKED | 특정 child spawn EPERM은 allowlist 증명이 아님 |
| 일반 도구 네트워크 거절 | BLOCKED | 실제 loopback 연결 허용. 외부 인터넷은 NOT_RUN |
| STATE만 쓰는 Live 권한 프로필 | NOT_RUN | Fixture read-only + 준비 STATE 쓰기 조합 미검증 |
| 실효 승인 정책·실제 승인 입력 | NOT_RUN | 기존 세션의 최종 적용 정책·사용자 입력 경계 미측정 |
| 비공개 대화 없는 새 대화 방식 | RESOLVED | 공식 `/new` 사용 절차 확정. 런타임 실행은 NOT_RUN |
| 새 대화의 기존 인증·모델 사용 | PARTIALLY_VERIFIED | 공식 인증 재사용 지원; 실제 계정/모델 entitlement 미확인 |
| 모델 ID 식별 | PARTIALLY_VERIFIED | 사용자 config의 `gpt-6-astra` 실측; effective 모델·Live 선택 승인 미확인 |
| 실제 Live 실행 승인 | BLOCKED | 별도 승인 없음 |

## Fixture 기준선과 초기 Commit 후보

worktree 기준 Fixture는
`.trials/host-core-checkpoint/first-host-acceptance/fixture`다.
`git rev-parse --show-toplevel`이 이 경로와 일치하며 `.git/config`에 remote가 없다.
기존 Git 저장소를 재초기화하지 않았다.

초기 Commit 후보는 아래 4개뿐이다.

```text
README.md
package.json
src/events.js
test/events.test.js
```

내용을 읽어 fake event ID·동기 effect만 사용하는 의존성 없는 작은 예제임을 확인했다.
개인 프로젝트 코드·계정·endpoint·비밀정보는 이 후보들에 없다.
이전에 관측한 중복 처리 실패 테스트는 그대로이며 파일 byte/hash 변경도 없다.
제품 코드와 테스트를 수정하거나 이 Fixture에 제품 저장소 이력을 가져오지 않았다.

이번 사용자가 허용한 **로컬 Skill 설치로 인해** working directory의
`.agents/skills/codefleet/`에는 실제 CodeFleet runtime이 존재한다.
따라서 설치 후 디렉터리 전체가 가짜 코드뿐이라고 주장하지 않는다.
이 지원 패키지는 가짜 Fixture의 공개 Commit 후보에서 제외한다.

로컬 `.git/info/exclude`에 `/.agents/`, `/.acceptance/`를 추가했다.
이는 Fixture 내부의 로컬 제외 설정이며 제품/global ignore를 수정하지 않았다.
`git status --short --untracked-files=all`에는 위 4개 후보만 나타난다.
staged 파일은 0개다. 설치·probe home·진단 결과는 Commit 후보가 아니다.

- 기존 파일 manifest SHA-256:
  `2acf1e4f203fb23c3627a36a3e7d862ad7c76d25caa2ad15d57da7c841c34aca`
- 4개 후보의 **예상 Git tree SHA-1**:
  `492527e8cee6f46c0602825e729ce14bed31f079`
- Commit Hash: **없음**.

tree는 각 파일의 raw bytes와 mode `100644`로 Git blob/tree object 형식을
계산한 값이다. 각 blob hash를 `git hash-object --no-filters`와 대조했다.
Git index나 object를 쓰지 않았으며 이는 실제 저장된 tree/commit이라고
주장하지 않는다. 향후 line-ending/filter/mode가 달라지면 다시 산출해야 한다.
manifest는 파일 동일성 확인에는 충분하지만 Commit의 부모·작성자·Git HEAD
기반 baseline을 대신하지 않는다.

현재 CodeFleet에서 Commit이 필요한 근거:

- `src/intent/discovery.mjs` working-tree lines 10–15:
  repository root 확인 후 `rev-parse HEAD`, `ls-tree ... base`로 입력을 읽는다.
- `src/product/tasks.mjs` working-tree lines 75–79:
  fresh discovery의 dirty/base 변경을 거절한다.
- `src/alpha/workspace.mjs` working-tree line 16:
  snapshot도 Git commit의 tree/blob를 읽는다.

따라서 새 manifest-only 경로를 구현하지 않는 이번 범위에서 Commit 없이 기존
Validator·DAG 수용을 통과시킬 수 없다. baseline을 임의 hash로 위장하지 않았다.

향후 별도 승인된 Fixture Commit은 이 저장소와 4개 경로에 한정하고
`sol <solarchive.dev@gmail.com>` identity를 명시해야 한다. 실제 index의
path/mode/blob와 위 후보를 대조하고 hooks/signing/line-ending 영향도 확인한
후 단일 초기 Commit만 생성하는 계획이다. 제품 저장소 Commit·원격 설정·Push는
그 승인에 포함하지 않는다. 이번에는 add/commit을 실행하지 않았다.

## 실제 설치·발견

Codex 버전은 `0.162.1`이다. 공식 repo Skill 경로인
`<fixture>/.agents/skills/codefleet/`를 사용했다.
[OpenAI Docs: Skill 위치](https://learn.chatgpt.com/docs/build-skills).

기존 `scripts/host-install.mjs install codex FIXTURE`를 재사용했다.
기존 경로가 없는 것을 확인한 뒤 설치했으며 사용자/global Skill이나 설정은
덮어쓰지 않았다. 기본 `codefleet`이고 `codefleet-plan`은 설치하지 않았다.

| 실측 | 값 |
| --- | --- |
| 실제 설치 SKILL.md SHA-256 | `a57b669e9e183875e9c588f2b40db9a3173a9557f5e8cdd774aa113233106924` |
| installation.json SHA-256 | `2e72961ef91c11a080c9702a189c7835bfd6b3df25b3be6f491b367c20128a83` |
| receipt에 열거된 파일 | 81개, 81개 모두 hash 일치 |
| receipt 포함 regular files | 82개 |
| 설치 lifecycle 종료 상태 | ENABLED, liveValidation NOT_RUN |

실제 SKILL.md hash는 이전 생성 템플릿 hash와 일치한다.
현재 설치본은 이후 수정하면 안 되며 Live 직전에 다시 대조해야 한다.

기존 `scripts/host-codex-discovery.mjs`를 그대로 사용했다. 빈 임시 홈은
Fixture의 `.acceptance/codex-discovery-home/`이며 실제 인증정보를 넣지 않았다.
native Codex app-server에 보낸 요청은 `initialize`, `skills/list` 3회뿐이다.
대화·모델·설정 RPC를 보내지 않았다.

| 설치 상태 | 정확한 설치 경로의 발견 수 | scope | 오류 |
| --- | --- | --- | --- |
| enabled | 1 | repo | 0 |
| disabled | 0 | 없음 | 0 |
| enabled-again | 1 | repo | 0 |

설치본은 다시 enabled로 복원했고 `host-install status` exit 0으로 확인했다.
공식 `skills/list`는 로컬 발견에 사용하는 RPC다.
[OpenAI Docs: App Server](https://learn.chatgpt.com/docs/app-server).
빈 홈 발견 검증은 실제 사용자 홈의 동명 Skill 충돌이나 사용자 설정과의
상호작용까지 입증하지 않는다. 실제 Live 선택 경로는 다시 확인해야 한다.

## 현재 설정과 실제 강제 범위

사용자 config에서 비밀이 아닌 지정 필드만 추출했다. auth/session 파일을
열거나 복사하지 않았다. 실측값:

```text
model = gpt-6-astra
windows.sandbox = elevated
approval_policy / sandbox_mode / default_permissions: 사용자 config에 없음
사용자 정의 permission profile 이름: 없음
```

필드가 없다고 자동 허용이나 특정 기본값을 추정하지 않는다.
CLI override·managed requirements·세션 선택이 사용자 config보다 우선할 수
있으므로 위 값은 현재 대화의 실효 정책 인증서가 아니다.
이 작업 도구의 상위 managed sandbox와 별도 Codex CLI의 정책도 구별한다.

공식 기본 permission profiles는 `:read-only`, `:workspace`,
`:danger-full-access`이며 named profile도 지원된다. 이번 실제 검사는
`:read-only` 하나에 한정했다. 나머지 이름의 문서상 지원은 활성화·검증을
뜻하지 않는다. [OpenAI Docs: Permissions](https://learn.chatgpt.com/docs/permissions).

### 비모델 권한 probe

범위는 Fixture `.acceptance/`의 가짜 파일과 이번 프로세스가 연
`127.0.0.1` 임시 소켓뿐이다. 외부 서버·비밀 파일에 접근하지 않았다.
빈 별도 홈의 임시 config는 `windows.sandbox="unelevated"`였다.
사용자의 `elevated` 설정을 수정하거나 OS 계정·방화벽을 설치하지 않았다.

| 실행 | read | 가짜 파일 write | Node child command | loopback connect |
| --- | --- | --- | --- | --- |
| 상위 sandbox 안의 일반 control | 성공 | 허용 | exit 0 | 허용 |
| 상위 sandbox 안의 Codex sandbox | 시작 실패 | 미실행 | 미실행 | 미실행 |
| 승인된 상위 경계 밖의 일반 control | 성공 | 허용 | exit 0 | 허용 |
| 상위 경계 밖의 Codex `:read-only` | 성공 | EPERM | EPERM | **허용** |

처음 실패는 `CreateRestrictedToken failed: 87`, exit 1이었다.
상위 sandbox 영향과 native 지원을 구분하기 위해 이 제한된 비모델 probe만
외부 재실행 승인을 받아 수행했다. 두 번째 native sandbox는 exit 0이며
sentinel 내용도 `unchanged`로 유지됐다.

해석:

- **파일 쓰기:** 이 프로필·backend·가짜 경로의 실제 쓰기 거절만 확인했다.
  Fixture 전체 경로/우회·새 파일·symlink 등 전수 격리 검증은 아니다.
- **명령 실행:** sandbox가 최상위 Node probe를 실행한 것은 확인했다.
  하위 Node 실행 EPERM은 특정 child spawn의 거절이지 `plan/status/...`만
  허용하는 명령 allowlist 증명이 아니다. 임의 JS/명령을 안전하다고 취급하지 않는다.
- **네트워크:** loopback이 실제 허용됐으므로 “모든 도구 네트워크 deny”는 미충족.
  외부 인터넷 deny는 이번에 실행하지 않았으며 loopback 결과로 추정하지 않는다.
- **사용자 승인:** 범위를 벗어나는 작업의 수동 승인/거절은 별도 통제다.
  `on-request` 같은 승인 정책 이름만으로 모든 명령이 검토된다고 주장하지 않는다.
- **Skill 지침:** read/search 제한·금지 명령·승인 생성 금지는 모델에 대한 지침이다.
  실제 권한 profile/command gate가 없으면 강제 조건으로 표시하지 않는다.

기존 사용자 설정의 elevated backend는 실제로 시험하지 않았다.
이번 결과를 그 backend나 향후 인증된 Live 세션에 일반화하지 않는다.
read-only Fixture와 STATE-only 쓰기를 결합한 프로필도 NOT_RUN이다.
따라서 기본 Host 계획 수용의 정확한 권한 범위는 아직 BLOCKED다.

## 승인된 쓰기 위치와 영향

이번 사용자 승인으로 생성/변경한 Fixture 내부 지원 경로:

- `.agents/skills/codefleet/`: 기본 Skill, MIT LICENSE, runtime 및 receipt.
- `.acceptance/`: 빈 발견/권한 probe 홈, 가짜 probe 파일·스크립트, 로컬 결과.
- `.git/info/exclude`: 위 두 지원 경로 제외.

가짜 payload 4개는 변경하지 않았다. 사용자/global 설정·인증은 수정하지 않았다.
이 기록과 evidence, INDEX/README 기록 카운터는 제품 문서 산출물이며
제품 source/test 변경은 없다.
이전 preflight의 `live-state` 경로는 여전히 미래 제안이며 이번에 생성하거나
Live 쓰기 권한을 부여하지 않았다. 설치·probe 허용을 모델 쓰기 허용으로
확대하지 않는다.

## 독립 대화와 기존 인증

공식 `/new`는 같은 CLI 세션에서 새 대화를 시작한다. Fixture cwd에서 현재
디렉터리를 선택하고 `/resume`·`/fork`·이전 transcript 전달을 사용하지 않는
방법으로 확정한다. 현재 CLI cwd가 다르면 승인 후 Fixture를 지정한 새 CLI를
시작하되 기존 Host 소유 인증 경로를 유지하고 resume/fork 옵션을 쓰지 않는다.
[OpenAI Docs: 새 대화](https://learn.chatgpt.com/docs/developer-commands?surface=cli).

Codex는 기존 로그인 정보를 캐시해 재사용하는 것을 공식 지원한다.
따라서 새 대화 때문에 인증파일을 복사하거나 새 API Key를 만들 필요는 없다.
[OpenAI Docs: Authentication](https://learn.chatgpt.com/docs/auth).
다만 실제 로그인 상태/인증 방식/계정 권한과 `gpt-6-astra` 사용 가능 여부는
이번에 검사하지 않았다. 설정된 모델 이름은 읽었지만 계정에서 실행되는지
확인하려고 모델이나 `model/list`를 호출하지 않았다.

새 대화는 과거 transcript를 이어받지 않는 지원 방식이지, 전역 instructions,
memories, hooks, plugins 또는 IDE context가 자동으로 비개인화됐다는 보장이
아니다. Live 전 실제 instruction sources와 활성 확장을 민감 내용 출력 없이
확인해야 한다. 이번 빈 홈 discovery는 실사용 홈의 이 조건을 증명하지 않는다.
`/new`나 실제 인증된 thread/start 자체도 이번에는 실행하지 않았다.

## 검증·범위 한계

Fixture 후보 4개와 설치 패키지 regular files 82개, 총 86개에 대해 제한된
개인 경로·개인명·private-key header·일반 token 패턴을 검사해 일치 0개였다.
가짜 후보 4개는 내용도 직접 검토했다. 이는 인증 저장소 검사나 모든 Secret의
부재 증명이 아니다.

Git 진단 수집 중 Python의 기본 cp949로 stderr를 읽어 decoding 오류가 있었다.
UTF-8 명시 및 전역 Git config를 읽지 않는 진단으로 재확인했고, 최종 evidence는
재확인한 exit/status 값을 사용한다. 원격·staging·Commit 동작은 발생하지 않았다.
제품 전체 회귀 548건은 선행 결과이며 이번에 재실행하지 않았다.

`npm.cmd run posttest` exit 0, `git diff --check` exit 0.
[문서 검사 로그](first-host-native-gate-checks.log)를 보존한다.
기존 후보 manifest의 제품 소스·테스트 20개 hash는 모두 일치했다.
제품 source/test 및 기존 기록의 수정은 없고, 새 기록·evidence와 색인 카운터만 추가했다.

## 결론

Fixture 커밋 후보와 실제 기본 Skill 설치·발견은 확인했다.
Commit·실효 모델/승인·STATE 권한·네트워크·새 대화의 실사용 조건은 아직 남아 있다.
실제 Live는 별도 승인 전까지 BLOCKED이며 HOST_LIVE_VERIFIED가 아니다.

## 다음 작업

Fixture 초기 Commit만의 별도 승인 여부를 확정하고, 실사용 backend의 정확한
파일/명령/네트워크 및 STATE 권한을 비모델 방식으로 추가 확인한다.
그 뒤 설정된 모델의 사용 선택과 빈 문맥 조건을 고정해 Live 승인을 별도로 요청한다.

## 미해소로 남긴 것

Fixture Commit 없음, 사용자 세션의 실효 elevated 정책·명령 gate·일반 네트워크,
STATE-only 쓰기, 실제 인증/모델 entitlement, 새 대화의 instruction/memory 범위,
시간·사용량 budget 집행과 최종 Live 승인.
