# H3 — Trusted Operator Runtime & Workflow Authorization

2026-10-20. Linux UID/IPC와 Workflow 연결의 오프라인 범위는 검증한다. **실제 Host 제품 수용은 BLOCKED**, H2의 BLOCKED 기록은 변경하지 않는다. HOST_LIVE_VERIFIED는 부여하지 않는다.

## 기준 상태·보존

Worktree `.codefleet/worktrees/alpha-g0`, branch `feature/alpha-g0-refresh`, 실제 HEAD `9dc429835fd272253f8efac60ac0f76bf7188de5`. 시작 시 추적 파일 8개 수정 및 G0~H2의 미추적 코드·테스트·기록과 `.trials/`를 확인했다. H2 source manifest 9개 해시는 모두 일치했고 이전 전체 로그는 Legacy 324 + Alpha 191 통과/실패·제외 0이었다. 기존 기록·브랜치·작업 트리·검증 조건을 삭제하거나 초기화하지 않았다. 커밋·푸시·배포·모델 호출·API Key 사용은 하지 않았다.

지정된 H2 기록과 승인 설계 2개만 decision-debt 사전 검사에 전달했다. 결과 final 1/excluded 1/warnings 0, blocked였다. 공격 거절과 중간/최종 테스트 결과를 실행 불일치로 분류한 후보를 원문·소스 해시·최종 로그와 대조해 해소했다. 민감 맥락으로 제외한 승인 설계는 실제 키/개인 경로를 공개하지 않는 범위로 다뤘다. 도구가 clear를 반환했다고 주장하지 않는다.

## 선택한 실행 방식과 경계

Linux의 별도 비-root Operator UID 1000과 Agent UID 1001을 사용하는 실제 프로세스로 검증했다. Python 표준 라이브러리 bridge가 filesystem Unix socket을 받고 `SO_PEERCRED`로 커널의 PID/UID/GID를 조회한다. 등록되지 않은 UID와 Agent의 decide 요청은 Node에 도달하기 전에 거절한다. Node Trusted Coordinator는 외부 포트를 열지 않고 bridge의 전용 stdin/stdout pipe만 사용한다. 임의 TCP/클라우드 서비스는 없다.

Operator Interface는 이 버전에서 UID 인증을 받는 로컬 `decide` API다. 물리적 키보드 입력을 인증한 것은 아니다. 실제 배포에서는 AI 도구를 실행하지 않는 별도 Operator OS 로그인과 읽기 전용 코드 배치가 필요하다. 자동 OS 계정 설치·사용자 등록·terminal review UI는 아직 없다. 같은 UID 설정과 지원되지 않는 플랫폼은 거절한다. Host UI의 승인 표시를 독립적인 사용자 인증으로 취급하지 않는다.

Config/state는 Operator 소유 private 경로다. 상위 디렉터리까지 root/Operator 소유·비-symlink·Agent 쓰기 불가를 확인해 경로 교체를 막는다. Key와 H2 원장은 private Store 아래 유지한다. 테스트는 Agent와 그 자식이 실제 key/승인 DB/Workflow DB를 읽거나 쓰려는 시도와 UID 승격을 거절함을 관측했다. root/administrator, Operator가 자신의 UID나 연결 FD를 Agent에 넘기는 행위는 신뢰 경계 밖이다. 전체 Host sandbox를 원격 attestation한 것은 아니다.

## Workflow 집행과 자동화

- `workflow-authorization.mjs`는 보호된 Run의 exact workflow hash/revision, source/graph integrity, repository/base, environment/policy digest, 현재 control·Lease를 확인한다. runtime catalog는 Agent가 수정할 수 없다.
- 기존 `workflow/persistence.mjs`의 approval/reserve에 연결했다. `OS_OPERATOR_V1` Run은 guard 없이 재개하거나 Legacy actor 승인으로 승인할 수 없다. 위험 WorkItem은 H2의 1회 grant를 실제 예약 트랜잭션 안에서 소비한 뒤 예약한다. 원장과 Workflow Store는 별도 DB이므로 crash window에서 use를 반환하지 않는다. grant ID와 action digest를 Workflow event에 연결한다.
- `alpha/controller.mjs`에서 보호된 자식의 읽기·제안·검증과 원격 효과 직전에 현재 권한을 검사한다. 읽기·제안·독립 검증은 제한된 자동화 정책으로 허용한다. 실제 임시 Git 저장소에서 보호된 Workflow → 제안 → 실제 Node 테스트 → 최종 통합까지 Operator grant 없이 완료됨을 관측했다. 이 고정 fixture의 Node 실행은 production sandbox 인증이 아니며 기존 production Docker Harness 회귀도 별도로 유지한다.
- pause/resume는 새 Lease를 발급하므로 이전 grant가 무효다. Graph 변경·만료·철회·현재 정책 불일치도 거절한다. 기존 STARTED attempt는 자동 재실행하지 않는다.
- IPC가 제공하는 실행 범위는 inspection/lease/request/decision/assignment/control이다. 임의 명령·권한 확대·remote effect API는 없다. 위험 WorkItem **배정 승인**을 외부 명령 실행 승인으로 바꾸지 않는다. 이미 배정된 행위를 소급 철회할 수는 없으며 이후 scheduling/effect는 pause/cancel과 현재 정책을 재검사한다.

현재 broker는 생산용 Harness 실행 서비스를 노출하지 않는다. 기존 Host Skills의 공개 requests/submit/run/resume 차단도 해제하지 않았다. 실제 Host Adapter IPC client 등록과 end-to-end 실행 서비스는 후속 Gate다. 내부 trusted coordinator 경로의 자동화 성공을 실제 Host 세션 성공으로 표시하지 않는다.

## Capability 매트릭스

| 환경·기능 | 판정 | 실제 근거/제한 |
| --- | --- | --- |
| Linux UID 분리 + Unix IPC | OFFLINE_VERIFIED | Docker Linux에서 별도 UID 프로세스·SO_PEERCRED·실제 접근 시도 |
| Operator 결정 권한 | OFFLINE_VERIFIED, OS UID 범위 | Fake Operator의 커널 UID와 exact review digest; 실제 사람의 로그인 운영 미검증 |
| 보호된 Workflow 예약·현재 정책·재개 | OFFLINE_VERIFIED | 기존 reserve/controller에 연결한 테스트 |
| 제한된 자동 제안·독립 테스트 | OFFLINE_VERIFIED | 고정 임시 Git fixture와 기존 Harness 회귀 |
| 동일 unrestricted UID | BLOCKED | H2 탈취/rollback 재현 유지 + runtime 시작 거절 |
| Windows Native | BLOCKED/미지원 | Linux peer credential 경로 제공 안 함 |
| WSL2 실제 Host | BLOCKED/미검증 | Docker Linux 검사를 WSL2 Host 인증으로 일반화하지 않음 |
| 실제 Linux Codex/Claude | BLOCKED/미검증 | Host confinement·client 등록·실행 서비스 필요 |
| 권한 확대·원격 쓰기 | BLOCKED/미지원 | 승인하더라도 실행 API 없음 |
| HOST_LIVE_VERIFIED | 부여하지 않음 | 이번 단계 실제 모델 호출 없음 |

## 반증·명령·실패 이력

H3 Node 테스트는 5건이다. IPC 통합 1건 안에서 unknown UID, Agent 승인 사칭, 무승인 위험 예약, JSON actor/peer 위조, 정상 Operator 결정, 정상 예약, 중복 예약, 무승인 safe open/assignment, 철회, 만료, 재개 후 Lease 불일치, Graph 변경, 임의 remote 명령, 실제 key/DB 접근, 자식 승격, 동일 UID 설정, 쓰기 가능한 상위 경로를 각각 검사한다. 성공과 공격 거절의 결과를 분리해 로그에 남긴다.

1. 첫 H3+H2 검사: `node --test test/operator-runtime.test.mjs test/operator.test.mjs`, exit 1, 24건 중 23 통과/1 실패. private 부모 디렉터리의 소유자를 먼저 바꿔 fixture setup이 하위 경로에 접근하지 못했다. 자식부터 소유권을 설정하도록 수정했다.
2. H3 재검사: exit 1, 5건 중 4 통과/1 실패. fixture 종료 과정에서 CAP_KILL 없는 root가 다른 UID 서버를 종료하려 해 거절됐다. 권한을 추가하지 않고 Operator UID로 종료하고 bridge의 정리 처리를 추가했다.
3. H3 targeted: exit 0, 5건 통과/실패·제외 0. IPC 관측 17개 통과.
4. 첫 `npm test`: exit 0, 520건 통과 = Legacy 324 + Alpha 196, 실패·제외 0. 이후 보안 검토에서 상위 경로 교체 가능성을 보완하고 관련 IPC 반증을 추가했다.
5. 최종 `npm test`: **exit 0, 520건 통과 = Legacy 324 + Alpha 196, 실패·제외 0**. 기존 515건과 H3 5건을 포함한다. IPC 통합 관측은 18개 모두 통과했다. npm posttest 규칙 커버리지·링크·인용·선언 사실 검사도 exit 0, 선언 불일치 0. 기존 dated 기록의 인용 경고를 삭제하거나 검사를 완화하지 않았다.
6. Alpha Doctor: exit 0, isolated-verifier 포함 로컬 도구 진단 통과. 인증 상태 진단은 계정/토큰을 출력하지 않으며 모델 호출을 하지 않았다.

전체 환경: `CODEFLEET_TEST_DOCKER=1`, `CODEFLEET_TEST_JAVA=(Get-Command java).Source`, `CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45`, `CODEFLEET_OPERATOR_IMAGE=sha256:26c04a69d0bb84a2ed1cb865c36a0f690bbe772197ee41d914563bea5236200d`. 기존 로컬 Python/Node 이미지의 digest를 Dockerfile에 고정하고 `docker build --pull=false --network=none`로 조합했다(exit 0). 패키지 다운로드/배포는 없었다. 테스트 컨테이너는 network=none, read-only root, no-new-privileges, 제한된 capability/pids/memory/CPU, private tmpfs, source/fixture만 read-only mount하며 Docker socket을 노출하지 않는다.

## 변경·호환성·다음 조건

신규 코드: `operator-ipc.py`, `operator-runtime.mjs`, `workflow-authorization.mjs`; 신규 H3 테스트와 Docker/Python/Node fixture. H2 코어에는 동기적 consume을 분리해 기존 execute와 재사용했다. 기존 Workflow persistence와 Alpha controller에는 보호된 Run에 한정한 집행 검사를 추가했다. 나머지 Legacy·선택적 API·Judge·Artifact·SQLite·협업 계약은 보존한다. 기존 프로세스 내부 API를 Agent에게 공개하지 않는다.

다음 조건은 실제 Operator 로그인/배포 검증, Agent가 수정하지 못하는 코드·정책 배치 attestation, bounded Harness 서비스와 Host IPC client, 실제 Codex/Claude 및 자식 프로세스 confinement 검증이다. 그 전까지 전체 제품 수용은 BLOCKED다. 승인 코어 성공, IPC 성공, 실제 Host 완성은 서로 다른 판정이다. AI의 보고와 dispatch/assignment 결과는 Harness 검증 증거로 승격하지 않는다.

[구조·실행 조건·공식 근거](../../implementation/operator-runtime.md)를 따른다. H2 기록은 당시 판정을 보존한다.

실행 근거: [첫 실패](codefleet-h3-first.log), [종료 처리 실패](codefleet-h3-second.log), [targeted](codefleet-h3-targeted.log), [첫 전체 회귀](codefleet-h3-full-initial.log), [최종 전체 회귀](codefleet-h3-full.log), [Doctor](codefleet-h3-doctor.log), [최종 소스 해시](alpha-h3-source-evidence.json). 개인 경로·실제 인증정보·대화 내용은 공개 근거에 넣지 않았다. 변경 파일의 전체 경로·크기·해시 inventory는 ignored 로컬 체크포인트에 보존했다. 이는 내용 전체의 보안 감사나 커밋을 의미하지 않는다.

최종 문서 편집 후 링크·인용·선언 사실 검사 exit 0, 선언 불일치 0([로그](codefleet-h3-docs.log)). `git diff --check` exit 0. 공개 H3 근거·설계·소스/fixture 20개 파일의 개인 경로/키 패턴 검사에서 일치 0, 소스 11개 해시 일치를 확인했다. 한정된 패턴 검사이며 모든 비밀이나 공격의 부재를 증명하지 않는다. 변경 파일 inventory 측정 시점의 69개 경로를 확인했으며 이후 정제한 문서 검사 로그를 추가했다.
