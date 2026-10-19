# Alpha G0 기준선 재확보

- 작업 일시: 2026-10-19 (Asia/Seoul)
- 대상 커밋: `c61e9b829b62dd41336a7225bf3b9165136484db`
- 작업 유형: 실행·검증
- 선행 문서: `docs/implementation/codefleet-g0-audit-2026-10-19.md`, `docs/implementation/codefleet-implementation-v1/05-implementation/PHASED_WORK.md`
- 번호 실측 최대값: docs에서 `rg -o --no-filename 'P[01]-[0-9]+' docs`로 P0-17 / P1-61 확인. 신규 결함 번호 부여나 기존 등재 상태 변경 없음.

## 원격과 로컬

`git remote -v`, `git status`, `git branch -avv`, `git log -6 --oneline --decorate`를 먼저 확인했다. origin은 `https://github.com/solzip/codeFleet.git`이었다. 기존 작업 브랜치 `feature/controlled-agent-orchestration`과 로컬 main은 `df556af5eade0e07d8252278eb4359862fad9237`, 이전 원격 추적 ref는 `0403b1c73b4f9dda66dc50cda21f6150e4fa9d1a`였다. 작업 전 미추적 항목은 `docs/implementation/`이었다.

`git fetch origin main --prune` → exit 0. origin/main은 대상 커밋으로 갱신됐다. Git은 forced update로 표시했으며 이는 원격 추적 ref의 갱신이다. 이번 작업은 push나 원격 변경을 수행하지 않았다. 기존 작업 브랜치와 갱신된 origin/main의 좌우 고유 커밋 수는 122 / 229다. 단순 fast-forward 대상으로 취급하지 않았다.

원격 스냅샷의 `package.json:3`은 `0.2.0-alpha.4`이며, `src/alpha/`와 요청한 product-completion 문서가 존재한다. 기존 소스 부재 판정은 fetch 전 체크아웃에 대해서만 유효했고, 최신 원격의 부재를 뜻하지 않는다.

새 브랜치 `feature/alpha-g0-refresh`를 origin/main에서 만들고 기존 저장소 아래 `.codefleet/worktrees/alpha-g0`에 worktree를 추가했다. 기존 브랜치, 로컬 main, 미커밋 문서와 로그는 보존했다. reset, merge, cherry-pick, commit, push는 수행하지 않았다.

기존 `docs/implementation/`의 12개 파일을 새 공간에 복사했다. 목적지가 없음을 확인한 후 복사했으며 12개 모두 SHA-256 일치를 확인했다. 원본과 복사본의 과거 기록은 수정하지 않았다.

## G0 실행 근거

환경: Windows, Node v24.14.1, Git 2.42.0.windows.2, Claude Code 2.1.299, gh 2.87.3. 모델 호출과 GitHub 쓰기는 수행하지 않았다.

| 실행 | 종료 코드 | 관측 |
| --- | --- | --- |
| `npm.cmd test` (샌드박스) | 1 | 테스트 후 posttest에서 Git 파일 목록 조회 exit 128; 샌드박스 소유권 검사 제한 |
| `npm.cmd test` (승인된 일반 사용자 권한 재실행) | 0 | Legacy 324/324 통과, Alpha 28/29 통과·1건 opt-in 제외, posttest 완료 |
| `node src/alpha/cli.mjs doctor` (샌드박스) | 1 | Docker 사용자 설정 접근 거부; 나머지 4개 항목 통과 |
| `node src/alpha/cli.mjs doctor` (승인된 재실행) | 0 | Git, Claude, gh, Claude 인증, 격리 검증기 5/5 통과; 계정 식별정보 출력 없음 |
| `$env:CODEFLEET_TEST_JAVA = (Get-Command java).Source; node --test test/alpha-java.test.mjs` | 0 | 4/4 통과, 제외 0; 실제 JDK XML 판독 반증 검사 포함 |

종료 코드는 명령 직후 `$LASTEXITCODE`를 저장해 기록했다. 뒤따르는 로그 출력의 종료 코드로 대체하지 않았다. JDK opt-in은 `test/alpha-java.test.mjs:47`에 명시돼 있다. 별도 Java 실행 4건 중 3건은 전체 suite와 중복이므로 합산하지 않는다.

로그(사용자 홈·이름 경로를 치환한 사본): [최초 실행](codefleet-alpha-g0-test.log), [재실행](codefleet-alpha-g0-test-v2.log), [Java 추가 검사](codefleet-alpha-g0-java.log). 원시 로그는 로컬 임시 디렉터리에 남겼다.

기본 검사에서 규칙 83개·조건 545개 중 345개(63.3%)를 확인했다. 링크 검사는 추적 Markdown 109개·링크 138개를 조사해 대상/대소문자/앵커 오류 0건이었다. 인용 515개 중 현행 문서 오류 0건, 과거 기록 의심 8건은 기존 경고로 남았다. 선언 사실 42개 불일치 0건이며 미검사 수치 539개는 보증 대상이 아니다. 미추적 설계 패키지는 추적 문서 링크 검사 범위 밖이다.

기록 추가 후 posttest에서 README 두 언어의 감사·실행 기록 수가 66으로 남아 있어 불일치 2건을 검출했다(exit 1). 실제 추가된 기록을 반영해 두 선언과 산문을 67로 갱신했다. 검사 기준선·기대값은 완화하지 않았다. 최종 `npm.cmd run posttest` 재실행은 exit 0, 불일치 0건이다. 이 실행에는 프로세스 범위 Git safe.directory만 지정했으며 전역 Git 설정은 바꾸지 않았다.

## 실제 Alpha 계약 확인

- `src/alpha/contract.mjs:15`: schemaVersion 1. 새 v2 계약을 구현하지 않았다.
- `src/alpha/store.mjs:10`: state.sqlite. schema 0/1만 수용하며 WAL, runs/events 테이블과 user_version 1을 유지한다. 해시 주소 JSON 산출물은 상태 디렉터리의 artifacts에 둔다.
- `src/alpha/cli.mjs:15`: 기본 상태 위치는 사용자 홈의 `.codefleet-alpha`, `--state`로 변경 가능하다. doctor는 실행 run을 만들지 않는다.
- `src/alpha/provider.mjs:14`: Claude는 도구 없는 구조화 제안이며 비용 authority는 PROVIDER_REPORTED_ONLY다.
- controller와 기존 테스트의 상태·복구·전달 동작을 확인했다. 인터페이스 추출, DB 마이그레이션, 정책 변경은 하지 않았다.

## 결론

최신 Alpha 소스 확보와 G0 기본 검증을 완료했고, 이전 소스 부재 차단 사유는 해소됐다.
현재 기록은 로컬 기준선이며 라이브 모델·원격 전달·모든 격리 보안의 재인증이 아니다.
사용자 지시에 따라 G1–G6는 미착수다.

## 다음 작업

사용자가 구현 재개를 지시하면 새 worktree에서 G1부터 진행한다. 커밋·푸시는 별도 승인 대상이다.

## 미해소로 남긴 것

실제 모델 호출, Node/Java Docker 후보 전체 루프, 원격 PR 전달, 배포 패키지 설치·제거는 이번 G0에서 재실행하지 않았다. 과거 인용 의심 경고는 동결 기록을 변경하지 않고 보존한다. 기존 공간과 새 공간의 과거 감사·설계 파일은 미커밋 상태로 남아 있다.
