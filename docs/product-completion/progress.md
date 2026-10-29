# 진행 현황과 결정 목록

2026-10-28 [Manager proposal handoff](../runs/2026-10-28/manager-proposal-handoff.md):
기존 실제 자식 제안 두 개를 감독형 Fileset/Reservation 경로로 적용하고, 고정 테스트 14 PASS·독립 Local Evidence·COMPLETE_LOCAL·별도 프로세스 Recovery를 확인했다.
후속 승인된 5개 Host 턴 비교에서 실제 자식 2개의 실행이 6.307초 중첩됐다. 제안 생성은 기본 Codex 21.346초, CodeFleet 단일 22.223초, Multi-Agent 46.580초로 이번 작업의 성능 이점은 입증되지 않았다.
비교 제안은 적용·테스트하지 않았으며, 병렬 생성부터 Judge까지 한 번에 이어진 수용과 구분한다. 기존 DAG·handoff·Evidence 경계를 재사용했고 공개 위임 BLOCKED·Protected UNSATISFIED를 유지한다.

2026-10-28 [Contract Revision Synchronization](../implementation/objective-recovery.md#supervised-semantic-contract-revision):
감독형 Review/Accept로 동일 Objective의 의미적 계약 Revision을 갱신하는 경로를 구현했다.
B와 의존 작업만 재검토하고, 영향 없는 A는 검증 이력·의존성 체크포인트로 보존한다.
기존 프로젝트 B 재변경, 별도 프로세스 Recovery, 이전 승인 거부 및 새 통합 Evidence의
Local-only 완료를 내부 검증했다. 예산·소비된 Decision·과거 Evidence는 유지한다.
실제 Codex Live 계약 변경은 정확한 감독형 실행 승인 대기이며, 내부 검증으로 대체하지 않는다.
PUBLIC_DELEGATION_BLOCKED와 Protected 신뢰 경계를 유지한다.

[Alpha gate closure](../runs/2026-10-28/alpha-gate-closure.md): Focused IPC/Repair and Windows safety checks pass; independently installed package has unchanged runtime. Windows supervised RC passes. Linux full qualification remains incomplete; second historical IPC failure lacks a definitive trace. Official publication and public delegation remain pending.

2026-10-28 [Alpha release gates](../runs/2026-10-28/alpha-release-gates.md): Frozen tarball/source equality and Windows Legacy/Core/Native gates verified. Initial Linux Alpha/Host Core gates failed; the single bounded recheck was 6 PASS / 2 FAIL (H4 lease loss and Repair setup clock rollback). Full Alpha release remains blocked. SUPERVISED_READY does not imply full release or authenticated autonomy.

2026-10-28 [Supervised release candidate](../runs/2026-10-28/codex-core-release-candidate.md): Packaged public Skill installer fixed; installed Native Local, Continuation, Repair, Recovery and acceptance regression passed (159/159). SUPERVISED_READY retained; PUBLIC_DELEGATION_BLOCKED. Fresh-session entry is recorded in the run evidence.

2026-10-28 [Trusted authorization availability](../runs/2026-10-28/trusted-authorization-boundary.md): Windows Codex 0.162.1 userVerification/status returned providerUnavailable. Installed-package HEAD entry, read-only Recovery and repository preservation passed. SUPERVISED_READY retained; PUBLIC_DELEGATION_BLOCKED.

2026-10-28 [공개 위임 신뢰 경계](../runs/2026-10-28/trusted-public-delegation.md): Codex 0.162.1 공식 App Server 스키마에서 독립적인 Objective 사용자 승인 출처를 확보하지 못했다. PUBLIC_DELEGATION_BLOCKED와 기존 SUPERVISED_READY를 유지한다. 내부 검증 전용 위임의 미지원 권한 필드 거부와 State 없는 공개 capability 조회를 수정했으며 새 무인 Live 성공은 주장하지 않는다.


2026-10-28 [HEAD 저장소·새 Codex 세션 수용](../runs/2026-10-28/public-existing-local-v2.md): EXISTING_LOCAL v2에서 일반 텍스트 소스 생성과 기존 파일 수정을 연결했다. 실제 새 `$codefleet` 세션의 구현안 2개를 감독형 승인으로 적용했고, HEAD·미커밋 보존·11 PASS·COMPLETE_LOCAL·프로세스 Recovery를 확인했다. 공개 인증 위임은 차단, Protected는 미충족이며 단일 세션 무인 실행 성공은 아니다.


2026-10-28 [기존 프로젝트 감독형 Local 수용](../runs/2026-10-28/public-existing-local.md): EXISTING_LOCAL과 정확한 파일 Review/Accept를 연결했다. 실제 Todo 복제본의 의존 구현 2개 적용, 기존 통합 테스트 8 PASS / exit 0, Revision 9 COMPLETE_LOCAL 및 별도 프로세스 Recovery를 확인했다. 공개 인증 위임은 PUBLIC_DELEGATION_BLOCKED, 자동 Skill 진입·Protected는 미검증이다. 기존 ESM 파일 교체만 지원하며 원본과 과거 실패 Evidence는 보존했다. 설치 runtime README 링크 결함도 수정했다.

2026-10-28 [Core continuation](../runs/2026-10-28/codex-core-continuation.md): 외부 서명된 정확한 Candidate 검증 위임에서 의존 검증 연속 실행·재개를 구현하고, 감독형 Local Review 식별자 생성과 미준비 Draft 복구를 연결했다. 공개 Host 인증 승인 위임과 소스 변경 위임은 미지원이며 실제 2개 구현 WorkItem Live 수용은 미완료다. 기존 Todo의 8 PASS / COMPLETE_LOCAL과 사용자 보고 수동 브라우저 12 PASS는 보존한다. 브라우저 결과는 독립 자동화 Evidence가 아니며 Protected는 UNSATISFIED다.

## 현재 공식 상태

2026-10-28 Native Local 후속: 사용자 승인된 일반 Windows 실행에서 Todo Calendar
동일 Candidate 통합 테스트가 8 PASS / 0 FAIL, exit 0으로 완료됐다. Revision 12,
Objective COMPLETE_LOCAL이며 이전 실패 Evidence와 앱·고정 테스트는 보존했다.
기존 환경 복구 경로에 비격리 Local 실행 컨텍스트를 명시한 새 Review를 연결했고,
관련 내부 회귀 118 PASS / 0 FAIL을 확인했다. Protected 검증과 브라우저 E2E는
미검증이다. [실행 기록의 후속 절](../runs/2026-10-27/environment-reverification.md#2026-10-28-native-local-continuation)을 따른다.

2026-10-27 [환경 전용 동일 Candidate 재검증](../runs/2026-10-27/environment-reverification.md):
기존 Reservation·Native Local에 환경 복구 결합을 추가하고 내부 회귀를 수행했다.
Todo Calendar는 실제 3개 Fileset 적용 후 7 PASS / 1 FAIL(exit 1), MXC loopback EACCES로
Revision 11에서 HUMAN_HANDOFF다. 앱·테스트 변경과 무단 재실행은 없다.
Core 환경 복구와 실제 Host 정책 관측 어댑터는 구분한다. 후자의 연결·네트워크 승인·
실제 Todo 재검증·브라우저 수용은 미완료이며 아래 Sprint 기록은 이전 체크포인트다.

2026-10-27 [MXC 제품 수용 Sprint](../runs/2026-10-27/windows-mxc-product-sprint.md):
기존 MXC 회귀 실패를 해소하고 신규 Local-only 계약의 현재 후보 완료 판정을 구현했다.
Todo Calendar 실제 코드 제안·Validator·DAG는 준비됐으며 정확한 Fileset 승인 대기다.
적용·앱 통합 테스트·새 Objective Recovery와 전체 제품 수용은 아직 미완료다.

2026-10-27 최우선 후속: P0-D 개발을 보류하고 [Windows Native 호환성](../runs/2026-10-27/windows-native-mxc-path.md)을 진행한다.
공식 MXC 검사 1회와 일반 사용자 소유 작업 트리의 실제 Git·Native Probe는 통과했다.
소유권 충돌의 무조건적인 권한 확장 안내를 제거하고 `doctor --repository`를 추가했다.
새 Fixture의 모델·적용·검증·복구 Live 경로는 승인 대기이며 전체 수용은 미완료다.

2026-10-27 재개: 정상 sandbox를 요청한 [B 실행 사전 점검](../runs/2026-10-27/codex-host-session2-proposal.md#normal-sandbox-resumption-blocked_environment)에서도 실제 Native Probe가 GIT_OWNERSHIP을 반환했다.
적격 실행 환경을 재현하지 못해 BLOCKED_ENVIRONMENT로 종료했다. 제품 결함으로 분류하지 않으며
신규 승인·Materialize·통합 테스트는 미실행이다.

2026-10-27 B 적용 후속: [Session 2 적용 사전 점검](../runs/2026-10-27/codex-host-session2-proposal.md#subsequent-authorized-b-application-blocked-before-approval)은 Native Probe의
GIT_OWNERSHIP(exit 128)으로 차단됐다. 승인 발급·Materialize는 0회이며 revision 10과
A Evidence·기존 후보·예산을 보존했다. 실제 통합 후보가 없어 정확한 Local Review는 미준비다.

2026-10-27 P0-C 후속: [실제 Codex Session 2 제안](../runs/2026-10-27/codex-host-session2-proposal.md).
기존 A MATERIALIZED·LOCAL_PASSED 및 Evidence를 재실행 없이 재사용했다. 영속 Recovery 뒤
새 Codex 세션 1회에서 B 제안을 생성했고 기존 Fileset Validator를 통과했다.
제안 기록 후 Task revision 10, AWAIT_FILESET_APPROVAL(todo)이며 B 적용·통합 검증은 미실행이다.
전체 P0-C·Compaction·Protected 완료는 선언하지 않는다. 아래 기록은 각 시점의 범위다.

2026-10-27 P0-C: [Recovery 읽기 전용 Store 수정](../runs/2026-10-27/codex-recovery-readonly-store-fix.md).
RECOVERY_INIT_WRITE의 생성·초기화·예약 조회 쓰기 경로를 분리했다. 격리 Recovery 30건,
관련 회귀 123건과 선택 Store 4건이 통과했다. P0-C Revision 7과 P0-B Live 원본은 보존됐고
A 승인 요청을 재검토했다. 실제 A 적용·Session 2 실행은 하지 않았으며 새 승인이 필요하다.

2026-10-27 P0-C: [영속 상태 복구와 별도 세션 승인 준비](../runs/2026-10-27/codex-first-objective-recovery.md).
기존 Store를 읽는 `objective recover`와 미확정 Fileset의 공개 재실행 차단을 추가했다.
내부 프로세스 중단·재개와 실제 Codex 새 세션 수용은 구분하며, 후자는 별도 승인 대기다.
Compaction Recovery와 Protected 완료를 주장하지 않는다.

앞선 [P0-B 내부 기록](../runs/2026-10-27/codex-first-multi-workitem.md) 이후 별도 승인된
실제 Codex A/B 수정안 생성·적용 및 통합 Local 테스트 5개 통과(exit 0)를 관측했다.
Task Revision 12와 통합 Evidence는 위 후속 기록에 보존한다. 감독형 Windows Live
다중 WorkItem 경로의 수용이며, Protected 미충족으로 Objective complete는 false다.

2026-10-27 Codex-first 후속: 기존 `core-p0-1` Worktree의 미커밋 Core를 이어
[P0-A bounded continuation](../runs/2026-10-27/codex-first-bounded-continuation.md)을 구현했다.
내부 신뢰 경계에서 새 Decision을 검증·소비하며 적격 Local 검증 WorkItem을 직렬 진행한다.
공개 사전 승인 발급 경계는 여전히 BLOCKED이며 Native Local은 감독형을 유지한다.
P0-5A의 제한된 Windows Codex Live 기록은 보존하고, 이 변경의 Live 수용으로
승격하지 않았다. Claude 추가 Live는 중단한다. 아래 표와 경과는 각 기준선의
검증 범위이며 이번 작업의 결과·미검증 범위는 연결 기록을 따른다.

앞선 문서 정리 기준선은 `2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba`의 main이다. 이번 개발 지침 정합화는 GitHub main `eb68c39750e92e9557830f36a08fce12854650f0`를 기준으로 한다. [제품 원칙](../PRODUCT_VISION.md)과 [공식 아키텍처](architecture.md)를 적용하며, 문서 갱신은 새 제품 실행이나 Live 검증 결과를 추가하지 않는다.

| 영역 | 현재 상태 | 근거·한계 |
| --- | --- | --- |
| Host-Native 준비 | main 통합, 오프라인 검증 기록 있음 | [Host Core 기록](../runs/2026-10-20/host-native-core-verification.md). 기존 Host 모델·인증·세션을 활용하며 계획·Draft·DAG·승인 요청은 Docker 없이 준비 가능 |
| Local / Container 검증 | 구현된 경로, 보장 범위 상이 | [Core 안내](host-core-guide.md). Local 성공은 Protected Verification을 만족시키지 않음 |
| Bootstrap 영속 Local 예약 | 로컬 AB1 차단 수정 READY_FOR_PR_UPDATE | [승인 경계 수정](../runs/2026-10-23/durable-authorization-boundary-fix.md): 공개 CLI/API 발급·실행 차단, 정상 Operator 경로 미지원; 47개 예약/공개 경계 시험 통과. [AB1 감사](../audits/2026-10-23/02-pr9-authorization-boundary.md)·[R1/R2 수정](../runs/2026-10-23/durable-reservation-final-review-fix.md) 보존. 새 후보 CI·Protected·Host Live NOT_RUN; Git 공개 미수행 |
| Host Sandbox | NOT_VERIFIED | `src/verification/backends.mjs`의 미검증 Backend. 정책 선언만으로 활성화하지 않음 |
| 실제 Host Live | HOST_LIVE_NOT_VERIFIED | [설치·발견 및 차단 기록](../runs/2026-10-20/first-host-native-gate-resolution.md). 오프라인·설치 성공을 Live 수용으로 계산하지 않음 |
| 역할별 협업 | 오프라인 통제형 협업 근거 있음, 자동 Host 위임 미검증 | [G5 기록](../runs/2026-10-19/alpha-g5-controlled-hybrid.md). 단일 Agent 기본 |
| 공개 Host 보호 실행 | BLOCKED | `src/hosts/cli.mjs`의 공개 requests/submit/run/resume 차단 유지. 내부 시험 경로와 구분 |
| Git HEAD 없는 신규 프로젝트 Bootstrap | 구현·오프라인 검증 (`test/bootstrap*.test.mjs`). Host Live NOT_RUN, 보호 검증 UNSATISFIED | 고정 Draft 테스트 통과를 모델 Live 성공으로 간주하지 않음. [다음 작업과 완료 기준](roadmap.md#현재-host-native-후속-작업) |

다음 작업은 로드맵의 현재 Host-Native 후속 작업을 따른다. 아래 Alpha 배포·G/H 단계·파일럿 인계는 각 시점의 근거와 경과다. 과거 Alpha Live 성공은 현재 Host Live 검증을 대신하지 않는다.

## 개발 지침 정합화 기록

2026-10-23 / 유형: 문서 수정·검증 / 상태: DOCUMENTED. 대상은 위 GitHub main이며 소스 코드·실행 계약·기능 상태는 변경하지 않는다. 기존 로컬 main의 미커밋 파일과 다른 작업 트리를 보존하기 위해 별도 detached 작업 트리에서 편집했다. 문서 검토 후 사용자가 main 커밋·푸시를 승인했다. 기존 폴더는 원래 커밋과 미커밋 작업을 보존하고, 문서 작업 트리에서 main을 이어 간다. 커밋 대상은 문서 여섯 개이며 로컬 실행 로그는 제외한다.

- [AGENTS.md](../../AGENTS.md)에 Codex 실행 지침을 추가하고 [CLAUDE.md](../../CLAUDE.md)에 Host 역할 위임·협업·개선 루프 지침만 보강했다. Legacy FINAL RULEs, Alpha/Host 승인·검증 경계, MIT·공개 신원·보안·테스트·과거 수치는 유지한다.
- 제품 원칙은 Agentic Development Loop·Harness Engineering·Cross-Platform·실사용 가치를, 아키텍처는 기존 모듈과 목표 책임의 경계를, 로드맵은 Bootstrap에서 Todo + Calendar 실사용까지의 선행 관계와 수락 조건을 관리한다. 중복된 Host 사용/Live/독립 검증 작업은 로드맵의 순서표로 통합했다.
- 지정 운영 문서 여섯 개의 사전 검사 원시 결과는 차단 후보 여섯 건·자동 제외 없음이었다. 원문 대조 결과 roadmap의 실패 반증은 미래 수락 조건, README/architecture/PRODUCT_VISION의 제한은 유지할 계약, progress의 차단은 명시된 미검증 상태, CLAUDE의 정정 규칙은 역사 보존 지침이었다. 문서 수정 차단 근거에서는 모두 제외하며 실제 Live 차단을 해제하지 않는다. CLAUDE의 민감정보 가능성 경고는 기존 공개용 신원/보안 지침으로 확인했다. 외부 비교 자료는 구현 근거로 사용하지 않았다.

검증 환경: Windows / PowerShell / Node v24.14.1. Git 소유권 예외는 검사 프로세스에 이 작업 트리만 지정했고 전역 설정은 변경하지 않았다. 아래 결과는 문서 정합화와 기존 회귀의 관측이며 기능 수용·Host Live·MVP·비즈니스 성과로 집계하지 않는다.

| 실행/검토 | 실제 결과 |
| --- | --- |
| `npm.cmd test` | exit 1. Legacy 324/324 통과, 실패·제외 없음. Alpha 247건 중 235 통과·5 실패·7 제외. Alpha 실패로 뒤의 Host Core/posttest는 자동 실행되지 않음 |
| Alpha 실패 원인 대조 | 다섯 건 모두 기존 필수 Docker 격리 시험의 `CODEFLEET_TEST_DOCKER` 미설정 assertion. H4 IPC, H6 planning, H3 runtime, Operator guard + Docker, H2 isolation 각각 확인. 테스트나 환경 게이트를 완화하지 않음 |
| `npm.cmd run test:host-core` 별도 실행 | exit 0, 13/13 통과·실패/제외 없음 |
| `npm.cmd run posttest` 별도 실행 | exit 0. 기존 규칙 커버리지·Markdown 링크·인용·선언 사실 검사 통과. 기준선 파일 변경 없음 |
| 문서 검사 범위 | Markdown 164개, 링크 572개, 깨진 대상/대소문자/anchor 없음. 인용 527건 검사, 현행 문서 오류 없음. 과거 기록의 commit 미지정 42건·의심 인용 13건은 기존 한계로 남음. 선언 사실 42건 불일치 없음; 현행 문서 수치 561개 중 미검사 519개를 전체 검증으로 표현하지 않음 |
| 구조·보존·공통 지침 검토 | 여섯 문서의 fence 균형/중복 절 제목 검사 및 `git diff --check` exit 0. CLAUDE 기존 본문 전체, 공식 문서의 역사 절, 두 README와 Legacy architecture의 기준선 대비 동일성 확인. 단일 Agent·위임 권한·Harness 통제·개선 루프 중단·Local/Protected·OS·외부 효과 원칙 충돌 없음 |

로컬 원시 로그는 이 작업 트리의 `.codefleet/validation/`에 보존하며 공개 문서에 개인 경로를 복사하지 않는다. 요청한 공식 문서 범위를 유지하기 위해 이번 기록은 progress에 통합했다. README의 실제 기능 설명과 충돌이 없어 변경하지 않았고 별도 실행 문서·중복 계획 문서는 추가하지 않았다.

### 결론

후속 사용자 지시로 현재 기본 작업 폴더를 최신 main으로 전환했다. 별도 문서 작업 트리는 detached 상태로 남기고, 기본 폴더의 로컬 요약 문서 네 개를 당시 스냅샷으로 보존·반영한다. main과 내용이 같은 implementation 사본은 로컬 백업에 보존했고 개인 설정·실행 로그·작업 트리는 공개 대상에서 제외했다. 기본 폴더의 이전 커버리지 기록으로 첫 posttest가 실패했으나, 현재 기준으로 `npm.cmd run pretest`와 `npm.cmd run test:legacy`를 실행한 뒤 Legacy 324/324 및 `npm.cmd run posttest` exit 0을 확인했다. Alpha/Host Live를 다시 실행하거나 수용 상태를 승격한 것은 아니다.

개발 지침과 공식 문서의 책임을 정리했다. 현재 기능의 완료 상태는 승격하지 않는다.

### 다음 작업

로드맵의 Bootstrap·양쪽 Host Live 수용부터 기존 Capability/승인 경계를 확인하고 실제 WorkItem 근거를 확보한다. 후속 사용자 승인은 이번 문서 변경의 main 커밋·푸시에 한정하며 기능 수용이나 배포 승인을 뜻하지 않는다.

### 미해소로 남긴 것

실제 Host Live, 자동 역할 위임·개선 루프, 장기 실행의 Host 수용, 전체 OS 실사용 및 Todo + Calendar MVP/사업 성과는 이번 문서 작업에서 미검증이다. 공개 Host 보호 실행 BLOCKED와 Local/Protected 구분을 유지한다.

## 단계별 경과와 당시 검증 범위

> **Host-Native Core:** [구현·검증 기록](../runs/2026-10-20/host-native-core-verification.md)과 [사용 안내](host-core-guide.md). 기본 계획·Draft·DAG·승인 요청과 선택적 검증 Backend를 분리했다. 기존 보호된 검증 게이트는 유지하며 Local 성공을 보호된 완료로 승격하지 않는다. 실제 Host Live는 별도 미검증 상태다.

> **H4:** [Host IPC and existing Docker Harness](../runs/2026-10-20/alpha-h4-host-ipc-harness.md) connect in the separated Linux offline fixture. Human input and actual Host deployment remain BLOCKED.

> **H3 런타임:** [Linux UID·IPC와 Workflow 연결](../runs/2026-10-20/alpha-h3-operator-runtime.md). 오프라인 권한 반증과 제한된 자동화를 검증한다. 실제 Host client·격리·실행 서비스는 미완료이며 H2/전체 제품의 BLOCKED를 해제하지 않는다.

> **H2 승인 경계:** [오프라인 구현과 반증](../runs/2026-10-20/alpha-h2-operator-isolation.md). 서명된 승인 원장과 Fake Agent UID 격리를 검증하며 공개 Host 실행은 차단한다. 실제 Operator 인증·Host OS/IPC·위험 효과별 집행은 미완료이며 전체 상태 BLOCKED다.

> **H1 준비:** [실제 설치·발견 결과](../runs/2026-10-20/alpha-h1-host-acceptance-readiness.md), [Live 수용 패킷](host-live-acceptance.md). 양쪽 로컬 설치와 Codex 실제 로더 발견을 확인했다. 실제 Skill 호출·단일 Agent Live 실행·승인 권한 격리는 미검증/차단 상태다.

> **Host-Native 전환:** [설계](../implementation/host-native.md), [사용 안내](host-native-guide.md), [실행 기록](../runs/2026-10-20/alpha-host-native-transition.md). 기존 Host 세션의 구조화 제안과 CodeFleet Harness를 연결하며 직접 API는 선택 사항으로 유지한다. Live Host 권한 경계와 실제 세션 검증은 미완료다. 아래 기록은 각 작업 당시의 상태다.

> [제한 HTTPS 전송과 Provider 호환성](../runs/2026-10-20/alpha-g7c-live-transport-compatibility.md): 로컬 TLS·가짜 키 및 전체 회귀를 검증했다. 실제 모델 호출·API 인증 검증은 하지 않았으며 Live 실행과 엄격한 비용 상한은 차단/미지원 상태다. 당시 미커밋으로 기록했던 HTTPS 준비 계약은 현재 main에 포함되어 있다.


> [도구 없는 모델 인터페이스의 오프라인 구현](../runs/2026-10-20/alpha-g7b-proposal-only-model-interface.md): Fake Server 기반 제안·Planner·Workflow 연결과 필수 환경 검사를 추가했다. 이 기록 당시에는 외부 모델 endpoint와 실제 인증 경로를 제공하지 않았다. 후속 HTTPS 계약과 함께 현재 main에 포함되어 있으며 Live 차단은 유지한다.

> G6 로컬 통합 구현·검증 완료 (2026-10-19): [통합 결과와 Live 차단 사항](../runs/2026-10-19/alpha-g6-product-integration.md), [CLI 안내](orchestration-guide.md). 목표 제품 전체의 Live 준비 상태는 BLOCKED_OR_UNSUPPORTED다. 실제 의미 Planner·Provider 협업을 검증 완료로 표시하지 않는다. 이후 사용자 승인으로 개발 브랜치에 커밋·푸시했으며 제품 배포는 하지 않았다.

> G5 완료 (2026-10-19): [통제형 협업·병렬 통합 검증](../runs/2026-10-19/alpha-g5-controlled-hybrid.md). 기존 순차 경로를 유지하면서 역할 메시징·격리된 병렬 후보·직렬 통합·복구 차단을 검증했다. Live Provider와 Live Planner는 미검증이며 실행 차단을 유지한다. G6 결과는 별도 기록으로 관리한다.

> G4 완료 (2026-10-19): [순차 Workflow·DAG 검증](../runs/2026-10-19/alpha-g4-workflow-dag.md). 기존 Controller에 순차 조정과 최종 통합 검증을 연결하고 추가 SQLite 마이그레이션·영속 승인을 검증했다. Live Provider는 차단 상태이며 겹치는 수정·병렬 실행은 지원하지 않는다. G5 결과는 별도 기록으로 관리한다.

> G3 완료 (2026-10-19): [Intent·Draft·승인 계약 검증](../runs/2026-10-19/alpha-g3-intent-contract.md). 읽기 전용 plan CLI와 V1 컴파일, 프로세스 내부 승인·고정 API를 추가했다. Live Planner·Codex는 미검증이며 자동 실행·영속 승인은 제공하지 않는다. G4 결과는 별도 기록으로 관리한다.

> G2 완료 (2026-10-19): [Provider 공통 계약·회귀 검증](../runs/2026-10-19/alpha-g2-provider-integration.md). Legacy 324·Alpha 39·Provider 15건 통과, 제외 0. Live Provider 미검증, Codex 실행 차단, 신규 strict Routing은 미확인 capability를 거절한다. 기존 Claude 호환 경로 유지. G3 결과는 별도 기록으로 관리한다.

> G1 완료 (2026-10-19): [Alpha 계약 보호·판정 경계 검증](../runs/2026-10-19/alpha-g1-contract-preservation.md). 아래 배포·파일럿 기록과 구분하며 전체 필수 게이트 exit 0, Legacy 324건·Alpha 39건 통과(제외 0). Node/Maven 격리 검증과 JDK 검사를 포함하며 실제 모델·원격 전달의 재검증은 아니다. G2 후속 결과는 별도 기록으로 관리한다.

> **최종 검토 후 수정 완료.** 취소·resume 원자성과 읽기 전용 PR 복구의 회귀 검증을 완료했다. [수정 근거](../runs/2026-09-30/alpha-reconciliation-fixes.md)를 따른다.

> **품질 범위: 독립 검토를 유지하는 제한된 알파.** 재현된 조기 종료·비용 기록·검증 복구 결함의 수정과 회귀 검증을 완료했다. 임의의 적대적 JS에 대한 무인 수락은 보증하지 않는다. [수정 근거](../runs/2026-09-30/alpha-quality-remediation.md)를 따른다.


갱신일: 2026-09-30. 현재 단계: 제한된 알파 실행·검증·복구·PR 전달 구현 및 실측, MIT 공개 알파 배포, 외부 파일럿 대기.

## 현재 상태

이 절의 Alpha 배포·단계 상태는 아래 실측 당시의 기록이다. 현재 Host-Native 전체 상태는 문서 상단의 **현재 공식 상태**를 따른다.

### alpha.4 병합·배포본 재검증 (2026-09-30)

- 사용자 승인에 따라 PR [#5](https://github.com/solzip/CodeFleet/pull/5)·[#3](https://github.com/solzip/CodeFleet/pull/3)·[#1](https://github.com/solzip/CodeFleet/pull/1)을 병합했다. 기존 main의 아카이브 기록을 보존하고 현행 MIT·알파 안내와 문서 수치를 맞췄다. GitHub에서도 세 PR의 `merged=true`를 확인했다.
- 릴리스 소스: `5a20e1317cee91138bef9e3743c6c52d0f1427ee`. [main CI](https://github.com/solzip/CodeFleet/actions/runs/36690093882)에서 Windows 전체·Linux 알파 성공. 로컬 `npm test`도 기존 324건·알파 29건 및 문서 검사까지 exit 0.
- [v0.2.0-alpha.4](https://github.com/solzip/CodeFleet/releases/tag/v0.2.0-alpha.4)를 공개 프리릴리스로 게시했다. 자산은 `codefleet-0.2.0-alpha.4.tgz`와 `SHA256SUMS.txt`이며 npm 레지스트리 게시나 기존 릴리스 교체는 없다.
- 패키지 SHA-256: `a2e855fbd6a04bb5776afd60b9a496d16c81d71e3f45183206141bcc93f556b3`. 공개 URL에서 다시 내려받은 파일·게시 체크섬·설치 검증한 로컬 파일이 일치했다.
- 독립 설치 폴더에서 **배포된 패키지의** `npx --no-install codefleet-alpha`로 두 경로의 `prepare-java`→`doctor`→`run`→`export`를 실행했다. 준비 시 공개 의존성 네트워크 사용과 후보의 오프라인 검증을 구분한다. 검증 후 패키지 제거도 성공했으며 상태·내보낸 결과는 로컬에 보존했다.

| 배포본 실행 | ID | 기준선 → 후보 | AI 호출 | 실행 시간 | 공급자 보고 비용 |
| --- | --- | --- | --- | --- | --- |
| 사용자 지정 Gradle 프로젝트 | `5937f6c4-319a-4ccf-b866-16d49abd0ddd` | 9건 중 1 실패 → 9/9 통과 | 1 | 65,491ms | $0.0481802 |
| Maven 샘플 | `6c9de846-6f4f-4a7f-b260-42d73b55382d` | 2건 중 1 실패 → 2/2 통과 | 1 | 19,947ms | $0.0166122 |

두 실행 모두 `COMPLETED`, 테스트 동일성·후보 무결성 확인, 로컬 결과 전달이다. 시간은 루프 실행 시간이며 이미지 준비·설치 시간을 포함하지 않는다. 비용은 독립 청구 확인이 아니다. Gradle 증거 해시는 `c7b627f982c749c3e8999b22f4bbdf2a0993b9877ab73de7664a5c34b0e07500`, Maven은 `088dff5c48367a9464f2c61bb35d1e75e62b6855302ab0f46b45634ca2f7dd99`다.

이번 배포본 재검증에서 대상 프로젝트 원본 dev를 수정하거나 기존 파일럿 PR을 병합하지 않았고, 중복 PR도 생성하지 않았다. 이전 소스 실행의 PR 전달 실측과 이번 배포본의 로컬 완주를 구분한다. 독립 외부 사용자 자가 온보딩·실제 Maven 서비스·운영 배포는 여전히 별도 검증 대상이다.

### Java 빌드 어댑터 실측 (2026-09-30, alpha.4 대상)

- CodeFleet 공통 Controller·Store·Provider·Judge·Delivery를 재사용하고 Java 계약, Gradle/Maven 실행, 안전한 JUnit XML 판독과 `prepare-java`/`doctor CONTRACT`를 추가했다. alpha.3에는 없고 alpha.4 릴리스 대상에 편입했다. [Java 구현 PR](https://github.com/solzip/CodeFleet/pull/5)과 [실행 안내](alpha-quickstart.md)를 따른다.
- 사용자 지정 Gradle 프로젝트에서 최대 페이지 번호의 정수 오버플로를 새 보호 테스트로 재현했다. 실제 Claude 1회 → 격리 검증 9/9 통과 → 개인 원격의 **dev 기반 파일럿 브랜치 대상 draft PR** 생성. 원본 dev 수정·자동 병합·조직 원격 반영은 없다. 시간 81,615ms, 공급자 보고 비용 $0.0507282(독립 청구 증거 아님).
- Maven 샘플은 실제 Claude 1회 → 2/2 통과 → 로컬 산출물 생성. 시간 19,966ms, 공급자 보고 비용 $0.0166602. Maven 실사용 프로젝트·PR 전달 검증으로 확대 해석하지 않는다.
- 최종 검증기에서 모델 재호출 없이 두 경로를 재검증했다. Gradle 9건 중 1건 실패→9/9 통과, Maven 2건 중 1건 실패→2/2 통과. 테스트 이름 동일성·소스 및 테스트 실제 쓰기 거부를 확인했다. 이 재검증에는 모델 호출·추가 PR 생성이 없다.
- Gradle 프로젝트의 AI 후보에 별도로 호스트 JDK 21 전체 `check --offline --rerun-tasks --no-build-cache`를 실행했다. 32개 작업 새 실행, 178건 중 176 통과·실연동 opt-in 2건 제외·실패 0. 이는 추가 호스트 검사이며 CodeFleet 계약의 자동 선택 테스트와 구분한다. Docker DB 통합·외부 API·배포는 실행하지 않았다.
- 실사용에서 발견한 검증기 결함: 읽기 전용 부모 아래 중첩 마운트 생성 실패, Gradle 9의 쓰기 가능한 프로젝트 디렉터리 요구. 두 문제를 빌드 임시 공간과 보호 마운트를 분리해 해결했다. 최초 실패 실행은 0회 모델 호출로 멈췄고, 수정 후 새 실행이 완주했다.
- 사전 문서 점검의 아키텍처 정체 후보는 금지 사항/격리 제약을 인용한 오탐이었다. 원문 대조로 제외했다. 진행 현황·실행 안내 후보도 검사기가 근거 부족으로 제외했다. 문서 전체나 모든 프로젝트 호환성을 인증한 것은 아니다.
- CodeFleet 자체 검사: 기존 테스트 324건·알파 29건(실제 JDK XML 판독 포함) 통과. 링크·인용·선언 사실 검사도 통과했다. README의 중복 버전 수치로 발생한 문서 검사 실패는 실행 안내로 일원화해 해결했고 검사 기준선을 완화하지 않았다. 패키지 설치·도움말·제거를 확인했다(설치 패키지의 Java 실사용 루프는 별도 미실행).

이번 관측은 사용자가 지정한 실제 프로젝트에 운영자 보조로 적용한 첫 사례다. 독립 외부 사용자 모집·무지원 자가 온보딩 완료와 동일하게 집계하지 않는다. 구현 PR 병합·CI·패키지 배포와 배포본 재검증은 위 기록에서 완료했다. 다음은 독립 사용자 온보딩과 추가 실제 Maven 프로젝트 적용이다.

사용자의 확정 목표는 제품 완성, 공개 저장소, 실제 사용자 사용이다. Node 실패 테스트 기반 알파에 Java 빌드 어댑터를 추가했다. 실제 Claude·Docker로 수정 제안을 검증했고, 별도 브랜치에서 draft PR 생성도 확인했다. 권리자의 MIT 전환 승인에 따라 공개 알파를 배포한다. 사용자 지정 프로젝트의 운영자 보조 적용과 독립 외부 사용자 자가 온보딩을 구분한다. 광범위한 원래 로드맵 전체가 완성된 것은 아니다.

| 단계 | 상태 | 근거 |
| --- | --- | --- |
| 종합 검토·아키텍처·로드맵 문서화 | DOCUMENTED | [이번 작업 기록](../runs/2026-09-30/product-completion-planning.md) |
| M0 기준선·범위 확정 | 기준선 VERIFIED / MIT 확정 | 기존 전체 검사 exit 0, 324 통과. 실제 소스 복제에서 승인 상한·apply preview 실패 재현 |
| M1 신뢰할 수 있는 한 작업 | 제한된 알파 경로 VERIFIED | Node·Java/Gradle 실제 소스와 Maven 샘플에서 Claude 수정 전 실패·후 성공. 일반 에이전트 실행·임의 빌드 도구 조합 제외 |
| M2 자율 루프·복구 | 제한된 알파 경로 VERIFIED | 알파 테스트에 범위·예산·중단·worker 강제 종료 후 재개·증거 변조 반증 포함. 자동 작업 분해·다중 작업 큐는 후속 |
| M3 PR 전달 | 제한된 알파 경로 VERIFIED | [검증용 draft PR](https://github.com/solzip/CodeFleet/pull/2), 같은 PR 재조회. 응답 유실은 모의 API 통합 시험으로 검증 |
| M4 공개 알파·파일럿 | 알파 배포 / 외부 파일럿 대기 | 설치 패키지에서 실제 모델→Docker 완주·제거 확인. Windows 전체·Linux 알파 CI 통과. MIT 전환 승인. 외부 참여 기록 대기 |
| M5 공개 사용 릴리스 | TODO | 출시 게이트 미평가 |

상태 정의: TODO → IN_PROGRESS → IMPLEMENTED → VERIFIED. 막히면 BLOCKED와 원인·해제 조건을 기록한다. DOCUMENTED는 설계 산출물에만 사용하며 구현 완료로 집계하지 않는다.

## 결정 목록

아래 결정은 초기 Alpha의 배경과 실행 범위를 보존한다. 특히 첫 지원 조합과 PR 중심 범위를 현재 Host 기본 설치 요건으로 확대하지 않는다. 현재 제품 방향은 [제품 원칙](../PRODUCT_VISION.md)을 따른다.

| ID | 내용 | 상태 | 결정 시점·영향 |
| --- | --- | --- | --- |
| D01 | 공개하여 실제 사용자가 사용하는 제품 완성 | 사용자 확정 | 전체 목표 |
| D02 | 첫 범위는 단일 운영자의 저위험 개발 작업→PR | 실행 기준 | 사용자가 이 로드맵 순서로 공개 알파·파일럿까지 진행하도록 지시 |
| D03 | 첫 릴리스 자동 병합·배포 제외 | 실행 기준 | 권한·검증 범위 |
| D04 | 기존 저장소 재개 또는 후속 저장소 이관 | 현재 저장소 내 별도 alpha 경로 | 사용자 지시에 따라 현재 제품을 진행. Warrant 코드는 이관하지 않음 |
| D05 | 사용을 허용하는 라이선스·권리 범위 | MIT 승인 | 권리자가 MIT 추천 후 진행을 지시. 현재 LICENSE에 적용 |
| D06 | 첫 지원 OS·어댑터 조합 | Windows + Claude 도구 없는 제안 + Docker Node | 현재 실제 실행 관측. Linux 알파 CI 통과 |
| D07 | SQLite 상태 저장소·아티팩트 파일 분리 | 구현·로컬 검증 | Node 내장 SQLite 사용. schema version 검사, lease·worker 복구 시험 |
| D08 | 공개 저장소 소유자·이름·패키지 배포 경로 | solzip/CodeFleet, GitHub Release tarball | 원격 저장소 유지. npm 레지스트리 게시 미수행 |
| D09 | 파일럿 목표와 참여자 모집 | 제안 기본안 | M4 전 확정. 개인·회사 저장소 동의와 비밀 경계 확인 |

## 검증 증거와 검토 경로

- 구현: [draft PR #3](https://github.com/solzip/CodeFleet/pull/3), 계획 PR 위의 별도 구현 브랜치.
- CI: [Windows 전체·Linux 알파 성공 기록](https://github.com/solzip/CodeFleet/actions/runs/36672858564). 이 링크의 대상은 최초 구현 커밋이며 후속 변경은 해당 PR의 최신 checks를 확인한다.
- 실제 실행: [구현·실측 기록](../runs/2026-09-30/alpha-engine-implementation.md), [공개 배포본 PR 전달·취소 후 재조회](../runs/2026-09-30/alpha3-public-pr-acceptance.md).
- 현재 릴리스 대상: `codefleet-0.2.0-alpha.4.tgz`. 게시물과 체크섬은 [릴리스](https://github.com/solzip/CodeFleet/releases/tag/v0.2.0-alpha.4)에서 확인한다. 설치 패키지 실측의 범위와 시점은 아래 추가 기록으로 구분한다.
- 파일럿: 외부 참여자·실제 사용자 작업 건수는 아직 없음. 자체 실험을 파일럿으로 집계하지 않는다.

미결정 항목은 관련 작업 직전에 해소한다. 현재 문서 작성과 M0의 읽기 전용 현 상태 조사까지 막는 항목은 아니다. 정책·라이선스·외부 게시 변경은 별도 구체 변경으로 검토한다.

## 다음 작업 패킷

이 절은 아래 날짜의 Alpha 파일럿 인계 기록이다. 현재 Host-Native 작업 순서는 [로드맵](roadmap.md#현재-host-native-후속-작업)을 따른다. 당시의 “바로 수행할 작업”이나 배포 상태를 현재 Host 수용 상태로 해석하지 않는다.

**M4 — 독립 사용자 온보딩과 실제 파일럿 (세션 종료 인계: 2026-09-30)**

공개 알파 배포와 배포본 자체 검증은 완료했다. 다음 세션은 배포를 반복하지 않고, 다른 사용자가 안내만으로 설치하고 작은 작업을 끝낼 수 있는지 확인하는 데서 시작한다.

### 종료 시점의 기준선

- 릴리스 소스: `5a20e1317cee91138bef9e3743c6c52d0f1427ee`, 공개 GitHub prerelease `v0.2.0-alpha.4`. npm 레지스트리 게시나 서버 운영 배포는 수행하지 않았다.
- 배포본 검증 기록: `ed99bd3b34d8410f84150dfa34b41027ee8ea2fc`. 해당 [문서 커밋 CI](https://github.com/solzip/CodeFleet/actions/runs/36691057761)도 종료 시점에 `completed/success`로 확인했다.
- 배포 패키지의 실제 Gradle·Maven 실행 결과와 해시는 이 문서 상단에 기록되어 있다. 설치 검증에 사용한 패키지는 제거했으며 로컬 상태·로그·export 결과는 작업 공간의 `.trials/alpha4-public-*`에 보존했다. 이 경로의 자료는 공개 레포에 넣지 않는다.
- 사용자 지정 Gradle 프로젝트의 원본 dev는 수정하지 않았다. 생성한 파일럿 draft PR은 미병합 상태로 유지한다. 이 프로젝트는 CodeFleet 검증 대상이며, 제품 개선은 CodeFleet 저장소에서 수행한다.
- 독립 외부 사용자의 온보딩·작업 실적은 아직 없다. M4는 부분 완료, M5 사용 릴리스는 미완료다.

### 다음 세션의 실행 순서

1. **파일럿 안내 정리:** [설치 안내](alpha-quickstart.md)와 [파일럿 패킷](pilot.md)을 실제 alpha.4 지원 범위와 대조한다. 현재 파일럿 패킷의 Node 전용 참가 조건, 배포 전 체크리스트, 문서 내 과거 PR 상태를 최신 근거에 맞춰 정리한다. 비밀·개인 정보 검사 항목은 근거 확인 전 완료 표시하지 않는다.
2. **독립 사용자 첫 실행:** 수정·전송 권한이 있는 작은 저장소에서 공개 패키지 설치 → doctor → 기존 실패 테스트 선택 → 로컬 실행 → 결과 검토 → 선택적 draft PR 전달을 안내한다. 참여자와 대상 저장소는 사용자와 정한다. 외부인에게 연락하거나 초대하는 일은 별도 명시적 지시가 있어야 수행한다.
3. **사람의 개입 측정:** 설치, 계약·맥락 준비, 질문 응답, 수동 복구, 최종 검토 시간을 모두 기록한다. 성공뿐 아니라 실패·취소도 집계하고, 같은 작업의 수동 기준선과 품질·비용을 비교한다. 운영자 보조가 있었다면 자가 온보딩 성공으로 기록하지 않는다.
4. **실제 Maven 프로젝트 적용:** 권한과 지원 도구 버전을 확인한 실제 Maven 저장소에서 작은 실패 테스트 기반 작업을 재현한다. 샘플 성공과 실서비스 저장소의 수정·검증·PR 성공을 구분한다. 대상 저장소가 정해지기 전 임의 프로젝트를 수정하지 않는다.
5. **관측된 장애부터 개선:** 설치·계약 작성·환경 준비·복구에서 실제로 막힌 지점을 CodeFleet 수정 작업으로 만든다. 회귀 검증과 PR 검토를 마친 뒤 변경이 있을 때 다음 알파를 배포한다.
6. **사용 릴리스 판정:** 파일럿의 개입 시간, 수락·반려·회귀, 비용, 미해결 결함과 지원 범위를 검토해 M5 진입 여부를 결정한다. 자동 병합·운영 배포나 새 언어 지원은 이번 첫 파일럿의 선행 조건으로 추가하지 않는다.

### 재개 방법과 미결 사항

- 먼저 이 문서, [아키텍처](architecture.md), 설치 안내와 파일럿 패킷을 읽고 git 상태·최신 CI를 확인한다. 기존 릴리스 태그·자산과 보존한 실패 증거를 덮어쓰지 않는다.
- 바로 수행할 작업은 위 순서의 **파일럿 안내 정리**다. 사용자 참여가 필요한 실행 전까지 문서·안내 준비를 진행할 수 있다.
- 필요한 입력: 첫 독립 참여자, 공유 가능한 대상 저장소·작업, 실제 Maven 적용 대상. 기존 파일럿 목표는 제안이며 달성 실적으로 간주하지 않는다.
- 완료 조건: 준비 문서가 아니라 실제 참여자의 설치·작업 결과와 개입 시간 기록이 있어야 외부 파일럿 수행으로 판정한다. 생산성 향상과 제품 완성은 현재 증거만으로 확정하지 않는다.

## 갱신 방법

각 작업이 끝나면 아래 양식으로 새 실행 기록을 만들고 해당 단계 상태와 링크만 갱신한다.

```text
작업 ID / 대상 커밋 / 환경 / 요구 ID
변경한 동작 / 수락 조건
실행 명령 / 종료 코드 / 확인한 범위
산출물 / 관측 한계 / 잔여 결함
다음 작업 / 필요한 결정
```

## 위험 추적

| 위험 | 대응 | 해제 증거 |
| --- | --- | --- |
| 설계가 구현보다 앞서감 | 한 수직 슬라이스씩 구현·반증·기록 | 단계별 실제 실행 |
| 검증 비용 때문에 무분별한 면제 | gap과 defect 구분, 자동 수락 기준 유지 | 부정 사례 거부 |
| OS·어댑터 범위를 과도하게 확대 | 첫 지원 조합 제한 | 지원 매트릭스 |
| 사람의 수고가 계약 작성으로 이동 | 준비·질문·확인까지 개입 시간에 포함 | 파일럿 비교 |
| 공개했지만 설치·유지가 어려움 | 깨끗한 환경 설치·이슈 대응 준비 | 외부 사용자 완주 |
| 과거 상태와 현재 상태 혼동 | 이 문서를 현재 진행의 단일 출처로 사용 | 근거 링크와 상태 일치 |

H5 acceptance audit: see [environment, usability and live gates](../runs/2026-10-20/alpha-h5-host-acceptance.md). Codex discovery without model execution is verified; full Host Live remains BLOCKED. H4 IPC/Harness implementation is preserved.

H5 limited Codex pilot authorization was subsequently received, but the pre-execution security gate remained **BLOCKED** and no model call was made. This supersedes the earlier pending-authorization wording for that pilot only. See the [separate Live preflight record](../runs/2026-10-20/alpha-h5-codex-live-preflight.md). No full execution or fixture commit was authorized.

H6 adds [planning-only Skills and offline isolation](../implementation/host-planning.md). See the [H6 evidence record](../runs/2026-10-20/alpha-h6-host-planning-isolation.md). Real Host confinement and authentication/model transport remain BLOCKED.

H7 [actual Host isolation qualification](../runs/2026-10-20/alpha-h7-real-host-qualification.md) remains BLOCKED: the installed Windows binaries did not load inside the proposed restricted boundary. Codex discovery outside that boundary and existing regression passed; authenticated execution and model/tool network separation remain unverified.

H8 [Linux environment preparation](../runs/2026-10-20/alpha-h8-linux-host-preparation.md) installed the approved native binaries and verified offline startup plus bounded confinement probes in the measured WSL environment. Live remains BLOCKED pending transport, authentication, tool-policy and Claude discovery qualification.
