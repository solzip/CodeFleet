# H2 — Trusted Operator Authorization & Host Isolation

실행일 2026-10-20. **전체 상태: BLOCKED.** 오프라인 승인 코어와 격리 반증을 구현했지만 실제 Host용 Operator 인증·OS/IPC 배포 경계를 완성하지 않았다. HOST_LIVE_VERIFIED는 부여하지 않는다.

## 시작 상태와 근거

Worktree `.codefleet/worktrees/alpha-g0`, branch `feature/alpha-g0-refresh`, 실제 HEAD `9dc429835fd272253f8efac60ac0f76bf7188de5`. 시작 당시 추적 파일 8개 수정과 H1/Host-Native/G0 미추적 구현·기록, `.trials/`가 존재했다. 기존 변경과 검증 기록을 보존했다. 승인 없는 커밋·푸시·PR·배포는 수행하지 않았다.

H1 기록 및 수용 계획을 읽고 decision-debt 사전 검사에 지정 문서 2개만 전달했다. 결과는 final 1, excluded 1, warnings 0, blocked였다. Live 미실행과 승인 격리 미지원을 정체로 분류한 후보를 원문 및 현재 H2 지시와 대조했다. Live 미실행은 사용자 제한이며, 격리 미지원은 현재 해결 대상이므로 H1 폐기 근거가 아니라고 판단했다. 이 검토 후 오프라인 구현을 진행했으며 도구가 clear를 반환했다고 주장하지 않는다. 제외된 수용 패킷의 민감 맥락 후보는 공개 경로·가짜 정보만 기록하도록 처리했다.

## 위협 모델과 선택

위협: actor 사칭, 승인 CLI 직접 실행, DB/파일 변조, 키 탈취 및 재사용, Hook 사칭, 계약·대상 변경, 만료·철회·취소 뒤 재사용, 동일 OS 계정, 하위 프로세스 우회.

선택은 **B+C: 별도 Operator broker + OS 격리**다. A의 Host 확인 UI만으로 CodeFleet의 승인 주체 인증이 성립하지 않는다. B의 별도 프로세스만으로도 동일 계정의 파일/프로세스 접근을 막지 못한다. 이번에는 Linux Docker fixture에서 UID 분리를 실제 관측했다. 이를 Windows의 실제 Codex/Claude 세션 격리로 일반화하지 않는다. [설계와 공식 OS 근거](../../implementation/operator-authorization.md)에 비교와 제한을 기록했다.

## 구현 및 실제 집행 범위

- `src/hosts/operator.mjs`: 별도 SQLite 승인 원장과 오프라인 broker core. Agent ingress는 request/status만 허용한다. Operator ingress는 등록된 Ed25519 공개키로 검증되는 APPROVE/DENY/REVOKE만 허용한다. 키는 테스트에서 매번 생성한 가짜 키이며 실제 사용자 인증 또는 enrollment가 아니다.
- 승인은 request ID, Run/WorkItem ID, revision, contract/action digest, repository identity, environment/policy digest, Lease owner, expiry, maxUses=1, key fingerprint에 결합한다. Actor 문자열은 승인 판단에 사용하지 않는다.
- 실행 직전 trusted current snapshot과 서명·만료·상태·Lease·정확한 command spec을 검사한다. DB 트랜잭션으로 사용을 소비하고 command와 binding을 영속 기록한 뒤 동기적으로 재검사하고 dispatcher를 호출한다. 실패·불확실 결과는 사용을 되돌리지 않는다. dispatch receipt는 검증 증거나 완료 판정이 아니다.
- 현재 상태의 공급자, clock, key enrollment, executor, 원장 경로는 trusted caller 책임이다. 운영 중인 Workflow와 위험 효과 각각에 대한 원자적 집행 연결은 아직 없다. 다른 프로세스의 계약 변경과 실제 OS 효과 사이의 경합을 이 코어만으로 해결했다고 주장하지 않는다. 실제 코드/실행 파일·환경 무결성을 포함한 신뢰 snapshot과 effect 소유권이 필요하다.
- `src/hosts/cli.mjs`: 공개 `host requests/submit/run/resume`를 state를 열기 전에 차단한다. actor·설정·가짜 서명으로 해제하는 flag는 없다. prepare/approval-request/status/report 등 준비 기능은 유지한다.
- Host capability와 설치 Skill도 차단 상태를 명시한다. 내부 `dispatchHost`와 stagedExecution은 기존 오프라인 trusted coordinator 테스트용으로 유지한다. 임의 OS shell이 내부 모듈을 import하거나 Legacy CLI를 직접 호출하는 것까지 이 wrapper가 차단하지는 못한다. 그러므로 동일 unrestricted 계정 배포는 미지원이다.

Agent는 초안·계획·승인 요청과 상태 확인을 담당한다. Operator는 승인·거부·철회를 담당한다. 범위 확대·원격 쓰기·정책 변경 승인은 생산 기능으로 제공하지 않았으며 차단한다. 실제 사용자와 공개키의 결합, 접근통제된 Operator 입력, 안전한 키 저장과 회수는 다음 구현 대상이다.

## 반증과 관측 구분

| 항목 | 결과 및 해석 |
| --- | --- |
| actor·직접 Agent 승인·Hook 사칭 | Agent ingress 거절; 서명 없는 결정 거절 |
| 타인 키·서명/결정 변조 | 등록 키 검증 실패 |
| 계약·Run·WorkItem·revision·repository·environment·policy·owner 변경 | 현재 binding 불일치로 dispatch 거절 |
| 명령 변경·만료·철회·거부·취소·pause·Lease 만료 | dispatch 거절 |
| 중복·동시 실행 및 재시작 후 재사용 | 보존된 원장에서는 한 번만 소비; 실패 후에도 재실행 거절 |
| 승인 후 검사 중 현재 상태 변경 | 소비 뒤 재검사에서 거절, 사용 반환 없음 |
| 가짜 Operator 정상 승인 | 별도 프로세스 서명 후 trusted executor의 제한된 파일 쓰기를 실제 확인 |
| 승인 DB 서명 필드 직접 변조 | 재검증에서 거절 |
| 동일 계정의 하위 프로세스 | 가짜 비밀 읽기·수정 **성공**을 재현. 보안 성공이 아니라 미지원 근거 |
| 원장 소유자가 소비 상태/dispatch 기록을 되돌림 | 재실행 **성공**을 재현. OS 경계 없는 원장 rollback 방어는 없음 |
| Linux fixture UID 격리 | Operator UID 0의 실제 DB/가짜 키에 Agent UID 65534와 후속 자식의 읽기·쓰기 EACCES, UID 0 승격 실패, 원본 불변 |
| 실제 공개 CLI 실행 | 양쪽 Host의 actor/isolated 인자에도 BLOCKED, state 생성 없음 |

Linux probe는 network=none, read-only root, no-new-privileges, pids/memory/CPU 제한, private tmpfs mode 0700을 사용했다. 초기 trusted fixture가 UID를 내리기 위해 SETUID/SETGID만 보유하고 Agent는 UID 65534로 실행됐다. Docker socket은 노출하지 않았다. 이것은 작은 fixture의 DAC·상속 관측이며 실제 Host sandbox 또는 완전한 커널 탈출 방어 인증이 아니다.

## 테스트·실패 이력

첫 `node --test test/operator.test.mjs`: exit 1, 17건 중 16 통과/1 실패. Docker fixture의 SQLite 문장에 double-quoted 문자열을 사용해 실제 공격 전에 `no such column` 오류가 났다. prepared parameter로 고쳤으며 보안 조건을 변경하지 않았다.

재검증 `node --test test/operator.test.mjs test/host.test.mjs`: exit 0, 36 통과/실패·제외 0. 이후 원장 rollback 한계와 실제 공개 CLI 차단 반증을 추가해 최종 전체 회귀에 포함했다.

Alpha Doctor: exit 0, isolated verifier 포함 필수 로컬 도구 진단 통과. 기존 인증 상태 진단은 계정·토큰을 기록하지 않으며 모델을 호출하지 않는다.

최종 `npm test`: **exit 0, 515건 통과 = Legacy 324 + Alpha 191, 실패·제외 0**. 기존 496건과 H2 19건을 포함한다. `CODEFLEET_TEST_DOCKER=1`, `CODEFLEET_TEST_JAVA=(Get-Command java).Source`, `CODEFLEET_TEST_MAVEN_IMAGE=sha256:3d973625f53be3251044b54baa9d7a990debf9f6a728caf03f3ac0312371df45` 환경으로 기존 Docker/Node/Maven/JDK 검증과 Host Adapter 회귀를 실행했다. npm posttest의 규칙 커버리지·링크·인용·선언 사실 검사도 exit 0, 불일치 0이었다. 기존 dated 문서의 인용 경고는 보존했다.

근거: [최종 전체 로그](codefleet-h2-full.log), [첫 실패](codefleet-h2-operator-first.log), [중간 반증·Host 회귀](codefleet-h2-targeted.log), [Doctor](codefleet-h2-doctor.log), [소스 해시와 판정](alpha-h2-source-evidence.json). 계정·개인 경로·실제 키·대화 내용은 공개 로그에 포함하지 않는다. 정상 실행 테스트의 파일 쓰기와 Linux 반증은 실제 관측이며 실제 Host 모델 실행은 아니다.

최종 문서 편집 후 링크·Git 인용·선언 사실 검사도 exit 0, 선언 불일치 0이었다([로그](codefleet-h2-docs.log)). `git diff --check` exit 0. H2 공개 근거·설계·수정 Host 소스·테스트 13개 파일의 개인 경로/개인 키/API 키 패턴 검사에서 일치 0, source manifest 9개 해시 일치를 확인했다. 이 검사는 한정된 패턴 검사이며 전체 저장소의 비밀 부재 증명은 아니다.

## 호환성과 남은 Gate

G1 Judge, G2 Provider, G3 Intent, G4 DAG, G5 Controlled Hybrid, G6 CLI, G7 선택적 API, 기존 Store/Lease/Recovery/Delivery 코드는 H2에서 재작성하지 않았다. 기존 Alpha 승인 스키마와 Legacy actor 계약을 H2의 인증된 승인으로 변환하지 않는다. H1의 내부 오프라인 staged 경로는 보존하고 공개 Host 실행만 안전하게 제한했다. 설치된 기존 runtime snapshot은 자동 갱신되지 않으므로 이후 파일럿 전에 새 snapshot을 검토·재설치해야 한다.

다음 Live 차단 조건:

1. 실제 사람의 Operator key enrollment와 별도 승인 입력 인증 미구현.
2. Windows 실제 Host 및 자식 프로세스의 파일·process·IPC 접근 제한 미검증. macOS/실제 Linux Host도 미검증. 테스트 Linux UID 분리는 생산 지원 OS 선언이 아니다.
3. Agent가 수정할 수 없는 runtime·정책·원장·rollback 보호와 broker 통신 미구현.
4. 기존 Workflow/Lease와 각 위험 효과 직전의 원자적 집행, 철회·취소 경합 처리 및 복구 연결 미완료.
5. 실제 Host Live 호출은 이번 단계의 금지 범위이며 미실행.

**분류:** 오프라인 코어 및 한정된 프로세스 반증은 OFFLINE_VERIFIED 범위로만 평가한다. 실제 Host 권한 격리와 제품 수용은 BLOCKED. AI 주장/서명된 dispatch 결과를 독립 Harness 증거로 승격하지 않는 제품 원칙을 유지한다. 핵심 보안 요구사항 전체를 충족했다고 선언하지 않는다.
