# H5 — Host-Native 수용 검증 및 사용성

작업일: 2026-10-20 (Asia/Seoul). 대상 HEAD: `81144a6dedb7e73b41b0029d14161943bffdfaeb`. 유형: 감사·실행·결정. 선행: [H4 실행 기록](alpha-h4-host-ipc-harness.md). 신규 결함 번호는 발급하지 않는다. docs 전체 rg 실측 최대값: P0-17, P1-61.

## 제품 판단

**일반 사용자가 자연어 목표만 입력해 실제 Host 안에서 완료하는 제품 경로는 아직 BLOCKED다.** Linux 고정 계약·Fake Host와 실제 Codex의 모델 없는 Skill 발견은 서로 다른 증거다. HOST_LIVE_VERIFIED는 부여하지 않는다. 모델·직접 API·실제 API Key 사용, 원격 쓰기, 배포 및 이 작업의 제품 저장소 커밋은 수행하지 않는다.

브랜치는 `feature/alpha-g0-refresh`; 시작 시 미추적 `.trials/`만 존재했다. H4 source manifest의 11개 byte hash가 모두 일치했다. 기존 구현·로그·SQLite·정책을 보존한다. H4 기록의 이전 HEAD는 당시 값이며, 후속 사용자 승인 커밋이 현재 HEAD다.

decision-debt는 지정된 H4 기록만 검사했다. 최종 차단 카드 0, 민감 맥락 제외 1, no_grounded_blocker_found였다. 이번 오프라인 감사에 대한 제한된 결과이며 제품 BLOCKED 해제 근거가 아니다. 제외된 권한·격리 설명과 관련해 공개 기록에는 개인 경로·인증정보를 복사하지 않는다.

## 실제 환경과 Capability

| 환경 | 실제 관측 | 판정 |
| --- | --- | --- |
| Windows Native | Windows 10.0.26200; Codex 0.162.1, Claude Code 2.1.304 | 설치/일부 발견 가능, H4 IPC BLOCKED |
| Ubuntu WSL2 | kernel 6.6.114.1-microsoft-standard-WSL2, 현재 UID 1002 | Linux 기반 존재; Host 배포 미완료 |
| WSL 도구 | Linux Node/Claude 검색 실패; Codex는 Windows npm mount; Docker는 Linux 실행 파일 | Windows wrapper를 Linux Host 설치로 취급하지 않음 |
| WSL IPC | 실제 socketpair의 SO_PEERCRED가 UID 1002 반환 | 기능 존재만 관측; 독립 Operator 인증 아님 |
| WSL Docker | root 소유, GID 1001, mode 0660; 현재 UID가 읽기/쓰기 가능; 서버 linux | 이 UID를 비신뢰 Agent로 쓰면 Docker 권한 경계 미충족 |
| Docker Desktop | 4.25.0; client/server Engine 24.0.6; Linux daemon | 별도 UID fixture 검사 범위 |
| H4 Linux fixture | Agent/Operator 별도 UID, 보호된 Store·키·코드·저장소, Docker 검증 | Fake Host 오프라인 범위 |
| 사람 승인 | H4 서비스가 decide와 위험 execute를 거절 | BLOCKED; Host UI 동의나 UID를 사람 승인으로 승격하지 않음 |

현재 WSL 계정에서 Operator를 하나 더 띄우는 것만으로는 해결되지 않는다. Agent의 Docker 권한 제거, 별도 UID·파일/IPC·자식 프로세스 접근 통제를 배포에서 검증해야 한다. 이번 감사는 계정·권한·Docker socket mode·전역 Host 설정을 변경하지 않았다.

## 설치·발견·호출

기존 `scripts/host-acceptance-prepare.mjs`로 새 임시 Git 저장소를 Host별로 만들고 H4 Skill을 설치했다. 원본 CodeFleet 저장소는 실험 대상이 아니다. 각 receipt의 74개 파일을 검사하고 활성→비활성→활성을 확인했다. 준비 저장소의 baseline commit은 만들지 않았다. 기존 회귀의 disposable fixture 내부 baseline 생성과 제품 저장소 커밋은 구분한다.

| 항목 | Codex | Claude Code |
| --- | --- | --- |
| 설치 위치 | `.agents/skills/codefleet/SKILL.md` | `.claude/skills/codefleet/SKILL.md` |
| 사용자 호출 | `$codefleet` | `/codefleet` |
| 설치/패키징 | 74개 파일 무결성 확인 | 74개 파일 무결성 확인 |
| 실제 Host 로더 | skills/list: 활성 1 → 비활성 0 → 재활성 1, 오류 0 | NOT_RUN; 확인한 help에 비세션 Skill 목록 명령 없음 |
| 실제 Skill 호출/모델 turn | NOT_RUN | NOT_RUN |
| 설치 IPC client의 Windows 실행 | exit 2, Linux Unix IPC required | exit 2, 동일 거절 |
| 현재 완성된 제품 흐름 | BLOCKED | BLOCKED |

Codex 발견 검사는 임시 clean home과 기존 RPC allowlist를 사용했다. initialize와 skills/list만 호출했고 모델 turn 0, 인증 사용 false였다. 실제 발견 증거지만 실행·승인·모델 인증 재사용 증거는 아니다. 현재 프로젝트와 확인한 표준 전역 위치에는 CodeFleet Skill이 없었으며 설치는 임시 프로젝트에만 수행했다. 모든 플러그인·사용자 Skill을 조사했다는 뜻은 아니다.

공식 [Codex app-server](https://learn.chatgpt.com/docs/app-server)는 skills/list와 `$skill-name` 입력을 구분한다. [현재 Skill 문서](https://learn.chatgpt.com/docs/build-skills)는 확장용 지침/리소스를 설명한다. 과거 skills URL이 이 페이지로 redirect되므로 설치 버전의 경로 지원은 실제 로더로 확인했다. [Claude 문서](https://code.claude.com/docs/en/skills)는 프로젝트 `.claude/skills`와 `/skill-name`을 설명하지만 문서만으로 현재 프로세스의 발견 성공을 주장하지 않는다.

## 수직 흐름과 사용성

| 단계 | 현재 연결 | 수동 작업·한계 |
| --- | --- | --- |
| 자연어 → Task Draft | H4 propose는 기존 Run의 inert 요청 Artifact | 새 실행 계약 생성/활성화는 아님 |
| Draft → 계약 | 관리자가 기존 G3–G6 계약을 private catalog에 배치 | 파일·보호 테스트·기준·Graph·repository/base·risk 수동 검토 |
| WorkItem → 제안 | requests/submit이 hash·revision·context에 결합 | socket, Run ID, request UUID, proposal JSON 필요 |
| 승인 요청 | bound action/reviewDigest 제공 | raw JSON; 사람 입력 UI 없음, 위험 실행 거절 |
| 상태/역할 | plan/status/result에 DAG·역할·attempt·상태 | 역할 이름은 실제 subagent 증거가 아님 |
| Harness → Judge | 기존 baseline/candidate/integration Docker 검증 | Host 보고를 증거로 제출할 API 없음 |
| 완료 결과 | result/verify로 상태·테스트·hash·Artifact 참조 | Agent용 patch 다운로드 IPC 없음; trusted 경로 직접 열기 불가 |

성공한 고정 계약 fixture가 자연어부터의 제품 경험 전체를 증명하지 않는다. 기존 local plan/review/prepare도 H4 protected catalog 자동 등록 UI가 아니다. 이 공백을 대형 기능으로 메우거나 actor 승인 경로를 우회하지 않았다.

준비 fixture baseline은 실제 Docker 테스트 2건, 통과 0/실패 2/제외 0, exit 1이었다. 준비 스크립트 exit 0과 테스트 실패는 서로 다른 결과다. 실패를 보호 테스트의 재현 증거로 유지한다. 정상 완료·변조·취소·복구는 전체 회귀의 Fake Host 범위로 확인한다.

### 수동 단계 비교

조회 시점 문서와 현재 Skill의 명령/입력 종류를 센 것이다. 시간·클릭 수·성공률 실험이 아니며 OMX/OMC를 설치하거나 모델을 호출하지 않았다.

| 제품 | 초기 경로 | 작업 입력·추가 부담 |
| --- | --- | --- |
| OMX | 기존 Codex 기준 설치, scoped setup, doctor, login status, exec smoke, launcher의 6종 명령 | 권장 clarification/plan/durable execution의 3종 Skill 입력 |
| OMC | marketplace add, plugin install, setup의 3종 입력 | 예시 autopilot 목표 입력 1종 |
| CodeFleet H4 | Skill 설치 외 Linux 도구/별도 UID, protected 저장소·상태, 고정 catalog, broker/socket 수동 준비 | safe Run도 propose→plan→requests→submit→execute→result→verify 7종 IPC 호출. polling/재시도/위험 승인 요청 제외 |

현재 fixture는 source contract top-level 9개 필드와 runtime base config 7개 필드를 코드로 작성한다. UI가 자동 수집한 것이 아니다. 실행 계약 배포, socket/Run ID 전달, 승인 JSON 해석이 추가 부담이다. [OMX README](https://github.com/Yeachan-Heo/oh-my-codex)와 [OMC README](https://github.com/Yeachan-Heo/oh-my-claudecode)를 비교했으며 다른 제품의 보안 수준이나 동일 신뢰 모델 충족 여부는 평가하지 않았다. OMX의 위험 권한 옵션을 적용하지 않았다.

## 실행 기록

초기 Codex PowerShell wrapper는 execution policy로 거절됐다. 정책 변경 없이 codex.cmd/네이티브 executable을 확인했다. WSL의 sandbox logon 오류는 정상 계정의 읽기 전용 조회로 재확인했다. 첫 stat의 셸 quoting 오류는 Python 인자 배열로 수정했다. 보조 기록의 UTF-8 경로 읽기 오류도 인코딩을 명시해 수정했다. 실패를 Host 성공으로 기록하지 않는다.

`node scripts/host-acceptance-prepare.mjs`: exit 0. `node scripts/host-codex-discovery.mjs <native-codex> <temporary-preparation.json>`: exit 0. 설치 무결성/Windows 차단 probe: exit 0 (개별 IPC 호출은 기대된 exit 2). WSL 환경/socketpair probe: exit 0.

| 실행 | 종료 코드 | 실제 결과 |
| --- | --- | --- |
| `npm.cmd test` | 0 | Legacy 324 + Alpha 198 = 522 통과, 실패 0, 제외 0 |
| `node src/alpha/cli.mjs doctor` | 0 | 환경·인증 상태 진단; 모델 호출 없음 |
| 전체 회귀 내 H4 IPC 테스트 | 상위 실행 0 | 2 tests, 실제 Linux 분리 UID 경로의 관측 28개 |
| 전체 회귀 내 H3 Runtime 테스트 | 상위 실행 0 | 실제 IPC 관측 18개; 사람 현존은 NOT_TESTED |
| posttest 문서·규칙 검사 | 상위 실행 0 | 링크 오류 0; citation 527개 검사, living 문서 오류 0; 선언 42개 불일치 0 |

전체 회귀에는 Node·Docker·JDK·Maven, SQLite·Lease·Recovery, Workflow·DAG·Hybrid, Host 설치/제거, 승인·권한 위조 및 선택적 API의 로컬 Fake Transport가 포함됐다. 실제 모델 API 요청은 없었다. 기존 로컬 이미지와 설치 Java를 지정한 환경값은 [구조화 증거](alpha-h5-source-evidence.json)에 남겼다. 선언 사실 검사는 living 문서의 숫자 581개 중 42개(7.2%)만 방어하며 539개는 미검사다. 역사 문서의 citation 경고를 현재 코드 오류로 바꾸거나 삭제하지 않았다.

로그: [전체 회귀](codefleet-h5-full.log), [Doctor](codefleet-h5-doctor.log), [Codex 발견](codefleet-h5-discovery.log). 개인·임시 경로는 치환했다. H5 테스트 실패 후 제품 수정은 없었으며 기존 소스 manifest 11개 해시도 11개 모두 일치했다.

H5 변경 파일은 이 기록·증거 JSON·위 3개 로그, `docs/INDEX.md`, `README.md`, `README.en.md`, `docs/product-completion/progress.md`, `docs/product-completion/host-live-acceptance.md`다. 제품 소스·테스트·보안 정책은 수정하지 않았다. 준비·검사용 보조 파일은 ignored checkpoint에만 보존한다.

최종 기록 반영 후 링크·인용·선언 사실 검사를 각각 재실행해 모두 exit 0을 확인했다. 변경/신규 공개 파일 10개에서 개인 Windows 경로, API Key 형태, private key 헤더의 3개 패턴을 검사해 일치 0이었다. 이는 제한된 패턴 검사이며 비밀정보 전수 부재의 증명이 아니다. tracked diff whitespace 검사 exit 0, 최종 HEAD 변경 없음, 기존 `.trials/` 보존을 확인했다.

## Live 승인 경계와 최소 후속

전체 E2E Live는 기술 조건부터 미충족이며 지금 승인받아도 실행하지 않는다. 최소 후속은 Linux-native 도구 배치, Docker 권한 없는 Agent UID와 protected Operator/Harness 배포, Draft→catalog/Run 연결·결과 export 사용성 정리, 실제 사람 승인 입력의 독립 인증이다. 위험 작업은 마지막 조건 충족 전까지 차단한다.

별도 승인 가능한 작은 검사는 **새 임시 Codex 프로젝트의 Skill 호출·읽기·제안만 1회**다. 준비된 `src/subtract.js`, 보호 테스트, scope preview와 설치 Skill에 한정한다. 기존 Host 인증을 사용하며 사용량/구독 한도 소비와 fixture 내용의 모델 서비스 전송이 발생할 수 있다. 비밀값·원격 저장소·운영 데이터·API Key는 입력하지 않는다. Operator/Harness 접근, 파일 수정, shell 실행, 커밋, 네트워크 도구, 자동 위임은 범위 밖이다. 읽기 전용/session 도구 제한을 확인할 수 없으면 시작하지 않는다. Windows IPC 거절과 수동 입력 요구도 결과로 기록하며, 이 검사로 전체 HOST_LIVE_VERIFIED를 부여하지 않는다. Claude는 Codex 결과 검토 후 별도 승인받는다.

H5 §5·§9에 따라 실제 모델 세션은 명시적 승인 전에 시작하지 않는다. 임시 경로는 ignored 준비 기록에 보존하며 공개하지 않는다. 해당 승인 대기 상태에서 중단한다.

## 결론

오프라인·설치·실제 발견·모델 호출은 별도 판정이다. 전체 Host-Native 실사용 경로는 BLOCKED이며 HOST_LIVE_VERIFIED는 없다.

## 다음 작업

제한 Live 범위에 대한 명시적 사용자 결정 또는 기술적 차단 조건의 별도 해결. 자동 진행하지 않는다.

## 미해소로 남긴 것

Windows IPC, WSL Host/UID·Docker 격리, Claude 발견/호출, 신규 계약 자동 연결, 사람 승인 UI/인증, 결과 patch 조회, 실제 인증 재사용·비용, 역할 위임/멀티 에이전트 협업.
