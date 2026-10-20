# H1 — Host-Native 실제 사용 준비 및 수용 검증

실행일: 2026-10-20. 판정: **설치·오프라인 준비 검증, 전체 Host Live 수용은 BLOCKED**. `HOST_LIVE_VERIFIED`를 부여하지 않는다.

## 기준 상태와 보존

대상은 `solzip/CodeFleet`, `.codefleet/worktrees/alpha-g0`, `feature/alpha-g0-refresh`, 실제 확인한 HEAD `9dc429835fd272253f8efac60ac0f76bf7188de5`다. H1 시작 당시 추적 파일 8개가 수정되어 있었고, 이전 Host 구현·테스트·문서와 G0 기록·`.trials/`도 미추적 상태였다. 기존 변경을 보존했다. 원본 제품을 실험 대상으로 수정하지 않았으며, H1은 준비/관측 스크립트와 문서만 추가·수정했다. 커밋·푸시·PR·배포·직접 모델 API 호출은 하지 않았다.

사용자가 지정한 `host-native-guide.md`, `alpha-host-native-transition.md`와 기존 설계·PRODUCT_CONTRACT·SECURITY·작업 규약을 읽었다. decision-debt 사전 검사 도구는 과거 실패와 최종 재검증을 섞은 고위험 후보 1개로 blocked를 반환했다. 원본 최종 로그의 Legacy 324/Alpha 172 통과, 실패·제외 0과 당시 source manifest 8개 파일의 현재 해시 일치를 직접 대조해 해당 후보를 해소했다. 도구 자체가 clear를 반환했다고 기록하지 않는다. 이전 실패 로그는 보존했다. 체크포인트는 기존 source manifest와 현재 Git 상태, ignored 로컬 로그로 유지하며 승인 없는 커밋을 만들지 않는다.

## 실제 관측 결과

| 검증 항목 | Codex | Claude Code |
| --- | --- | --- |
| 설치 버전 | `codex-cli 0.162.1` | `2.1.304 (Claude Code)` |
| 프로젝트 로컬 Skill 설치/무결성 | 확인 | 확인 |
| 설치된 런타임 capabilities 명령 | exit 0 | exit 0 |
| 활성화·비활성화·제거 smoke | 확인, 별도 임시 디렉터리 | 확인, 별도 임시 디렉터리 |
| 실제 Host Skill 발견 | 실제 app-server `skills/list`로 확인 | 미실행; 설치 성공과 구분 |
| 실제 Skill 호출 | 미실행 | 미실행 |
| 자연어→Draft→단일 Agent 실행 | Live 미실행 | Live 미실행 |
| 역할 위임 | 기존 역할 metadata만; Live 미검증 | 기존 역할 metadata만; Live 미검증 |
| 멀티 에이전트 협업 | 확장하지 않음, Live 미검증 | 확장하지 않음, Live 미검증 |
| 독립 Harness | 고장난 공통 fixture를 production Docker로 실행, 2건 실패 확인 | 동일 fixture 준비; 별도 Live 실행 없음 |
| 승인 주체 신원·권한 격리 | 동일 계정 unrestricted shell에서는 보장 불가 | 동일 제한 |

Codex는 새 임시 설정 홈에서 native executable의 `app-server --stdio`를 실행했다. RPC는 `initialize` 및 `skills/list`만 허용했다. 프로젝트의 정확한 SKILL 경로가 활성 상태에서 1개, 비활성에서 0개, 재활성에서 1개였으며 scope=`repo`, 오류 0이었다. `thread/start`, `turn/start`, 인증정보 재사용·복사는 하지 않았다. 이것은 실제 로더 발견 증거이며 대화 중 Skill 지침 수행 증거가 아니다.

Claude는 공식 standalone `.claude/skills/codefleet/SKILL.md`를 설치했다. `/codefleet` 호출과 `/skills` 대화형 발견은 다음 승인된 세션에서 확인해야 한다. 내부 비공개 제어 프로토콜이나 SDK로 Host 세션을 대체하지 않았다. 기존 설계 표의 미구현 plugin 호출 예시를 실제 standalone 호출로 정정했다.

## 승인·검증 경계와 시나리오

각 Host별 별도 임시 Git 저장소와 공통 뺄셈 fixture를 준비했다. 원본 작업 트리를 실행 대상에 포함하지 않았다. 허용 수정 파일은 `src/subtract.js` 하나이며 보호된 테스트는 2건이다. Contract schema 검증 및 해시 생성은 완료했지만 scope 파일은 `UNAPPROVED_SCOPE_PREVIEW`, approval=`ABSENT`다. fixture 초기 커밋도 하지 않았으므로 실제 Task/Workflow 생성·실행은 아직 진행하지 않았다. 로컬 경로는 ignored preparation 로그에만 남겼다.

기존 Host CLI는 approve/complete를 거절하고, Host report를 Harness evidence로 취급하지 않는다. 그러나 기존 operator CLI의 `--actor`는 감사 라벨일 뿐 사람 인증이 아니다. 임의 shell 권한을 가진 동일 OS 계정의 Agent가 operator 명령과 상태에 접근할 수 있으면 승인 권한 격리가 성립하지 않는다. 고위험 승인은 차단 유지한다. Skill의 금지 문구만으로 이 문제가 해결됐다고 주장하지 않는다. 후속 Live 전체 수용에는 신뢰 상태·승인 입력·실행 파일의 실제 권한 분리와 반증이 필요하다.

Host는 AI 추론과 제안을 제공하고 CodeFleet은 WorkItem·계약·승인·상태·Harness를 관리한다. 현재 역할 라벨을 실제 subagent 실행으로 승격하지 않는다. 기존 협업·재시도·SQLite·취소·증거 변조 반증은 회귀 범위이며, Live 취소/복구 또는 Live 역할 위임의 증거는 아니다.

구체적인 후속 범위와 단계는 [수용 패킷](../../product-completion/host-live-acceptance.md)에 있다. 별도 API Key는 필요하지 않다. 기존 Host의 구독/사용 한도와 API 인증 Host의 별도 과금 가능성은 운영자가 확인해야 한다. 로컬 replay 비용 0은 Host 비용 0 또는 엄격한 금액 상한을 보증하지 않는다.

## 실행 명령과 결과

- `codex.cmd --version`, `claude --version`: exit 0, 위 버전 관측.
- `node scripts/host-acceptance-prepare.mjs`: exit 0, 양쪽 설치 및 Contract preview 생성. Harness의 예상 실패 결과는 tests=2, passed=0, failed=2, skipped=0, exit=1, authority=`HARNESS_EXECUTED`다. 준비 명령 성공과 테스트 성공을 구분한다.
- `node scripts/host-codex-discovery.mjs <native-executable> <preparation.json>`: exit 0, 실제 로더 3상태 관측. 모델 turn 0.
- `node scripts/host-acceptance-evidence.mjs <preparation.json>`: exit 0, 양쪽 설치 lifecycle smoke 및 공개 메타데이터 기록.
- Alpha Doctor: 최종 exit 0, isolated-verifier 확인. 처음 sandbox 실행에서는 Docker 설정 접근 거절로 해당 항목 실패; 권한 승인 후 재검증했다. Doctor의 기존 로컬 인증 진단은 수행했으며 계정·토큰은 저장하지 않았다.
- 첫 `npm test`: exit 1, Legacy 324 통과, Alpha 171 통과/1 실패/제외 0. 실행자가 Maven 이미지 ID를 오입력하여 immutable image 형식 검증에 실패했다. 제품 코드를 변경하지 않고 기존 정확한 이미지로 재실행했다.
- 최종 `npm test`: **exit 0, 496건 통과 = Legacy 324 + Alpha 172, 실패·제외 0**. 신규 테스트를 늘리지 않았다. 기존 Host 19건, SQLite/Artifact, 승인 위조·중복·stale 결과·증거 변조, 실패·취소·복구 및 기존 Node/Docker/Maven/JDK 회귀를 포함한다. `CODEFLEET_TEST_DOCKER=1`, `CODEFLEET_TEST_JAVA=(Get-Command java).Source`, `CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45`를 사용했다.
- npm posttest의 규칙 커버리지·링크·문서 인용·선언 사실 검사: exit 0. 선언 불일치 0. 기존 dated 기록의 인용 drift는 경고로 출력됐으며 삭제하거나 검사를 완화하지 않았다.
- 최종 문서 편집 뒤 개별 링크·인용·사실 검사도 exit 0이었다. 그 직전에는 공개 로그를 저장하기 전에 검사해 로그 링크 4개가 누락으로 실패했다. 로그를 실제 저장한 후 재검증했으며 초기 출력은 ignored 로컬 로그에 보존했다. 최종 `git diff --check` exit 0, 기존 source manifest 8개 해시는 모두 일치했다.

준비 첫 실행의 Docker 설정 접근 거절은 BLOCKED로 기록했고 원본 fixture는 유지했다. 권한 승인 후 새 임시 fixture에서 기준선을 검증했다. 실패와 재실행은 각각의 실제 관측이며 실패 결과를 성공으로 바꾸지 않았다.

## 변경 파일·근거·다음 Gate

신규 스크립트: `scripts/host-acceptance-prepare.mjs`, `scripts/host-codex-discovery.mjs`, `scripts/host-acceptance-evidence.mjs`. 신규 문서: 이 기록과 수용 패킷. 기존 guide·설계 표·색인·진행 현황은 관측 수준에 맞춰 갱신했다. 핵심 도메인·Legacy·Alpha·선택적 API 구현과 테스트 조건은 변경하지 않았다.

[기계 판독 근거](alpha-h1-source-evidence.json)는 source 해시, 설치 Skill 해시, Contract preview 해시, 실제 Codex 발견 상태와 Harness 실패 기준선을 담는다. 개인 경로·전역 설정·대화 내용은 포함하지 않는다.

정제한 실행 로그: [최종 전체 회귀](codefleet-h1-full.log), [첫 실패](codefleet-h1-full-first.log), [Doctor](codefleet-h1-doctor.log), [최종 문서 검사](codefleet-h1-docs.log). 이전 단계의 기록과 실패 로그도 그대로 보존했다.

공식 근거: [Codex Skills](https://developers.openai.com/codex/skills/), [Codex App Server](https://developers.openai.com/codex/app-server/), [Claude Skills](https://code.claude.com/docs/en/skills). 설치 버전의 실제 Codex 응답과 대조했다. Claude 실제 발견·호출은 공식 지원과 구분해 미검증으로 남겼다.

다음 Gate는 신뢰할 수 있는 승인 권한 격리 확인, fixture baseline 커밋의 별도 허가, 한 Host의 제한된 Live 세션 승인이다. 단일 Agent 전체 경로가 독립 검증까지 통과하기 전에는 자동 협업을 확대하거나 제품 완성을 선언하지 않는다.
