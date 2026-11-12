# 진행 현황과 결정 목록

## 현재 상태 요약

갱신일: 2026-11-12. 검토 기준선: `5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6`.
이 문서가 현재 상태의 진입점이다. 과거 기록은 아래 고정 커밋 링크에서 확인하며, 당시 승인 대기·다음 작업은 현재 실행 지시가 아니다.

문서 최소화: 실행·감사·인계·초기 설계 자료는 [정리 전 Git 이력](https://github.com/solzip/CodeFleet/tree/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs)에 보존한다. 이번 변경은 DOCUMENTED이며 기능 수용 상태는 변경하지 않는다. 선행 기준은 제품 원칙·로드맵이다. 신규 결함 ID는 부여하지 않았다.

제품은 **Host-Native 계획·검토와 감독형 Local 실행을 구현한 개발 단계**다. 공개 사용 릴리스와 양쪽 Host의 독립적인 전체 수용은 아직 완료되지 않았다. 구현, 합성 회귀, 실제 감독형 Host 관측, Protected Evidence를 각각 구분한다.

| 영역 | 구현·관측 상태 | 남은 수락 조건과 근거 |
| --- | --- | --- |
| 목표·Draft·Validator·DAG | 구현 및 오프라인 회귀 근거 있음 | [Core 안내](host-core-guide.md). 유효한 계획에도 별도 실행 승인 필요 |
| Codex Goal·Workflow·Bootstrap 탐색 | 영속 Goal 목록, 계약 리뷰, 미승인 Workflow 준비와 재개 안내 구현 | [Skill 후속 기록](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-11-11/codex-goal-skill-handoff.md). 실제 Host 인증·실행 수용과 기존 설치물 업그레이드는 별도 |
| MCP·관리형 Goal 경로 | 두 경로의 소스와 시험을 main에 통합 | [통합 기록](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-11-12/repository-consolidation.md). 통합 당시 CI·ref 정리 결과는 해당 Actions에서 별도 확인해야 함 |
| 신규 프로젝트 Bootstrap | Fileset·별도 승인·Local 검증·Repair·재개 구현 및 합성/설치 회귀 | 실제 모델을 연결한 신규 프로젝트 전체 수용과 보호 검증은 미완료 |
| 기존 프로젝트 감독형 Local | 실제 Host 제안·별도 적용 승인·Local Evidence/Judge·프로세스 복구 관측 | [Local 수용](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-28/public-existing-local-v2.md), [통합 검증](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-30/todo-integrated-verification-recovery.md). 범용 무인 실행 수용으로 확대하지 않음 |
| 계약 변경·Repair·Work Log·Recovery | 기존 Store·Event·Lease 경계에 연결, Local 회귀 근거 있음 | [Repair 연결](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-30/supervised-adoption-repair.md), [인계 신뢰 경계](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-30/undelivered-handoff-recovery-v2.md). 실제 인계 독립 인증과 Host Compaction은 미검증 |
| 역할 협업 | 감독형 자식 제안 및 제한된 비교 관측 있음 | [비교 기록](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-28/manager-proposal-handoff.md). 공개 인증 위임은 BLOCKED, 성능 이점 입증 안 됨 |
| 검증 Backend | Local / Container 경로 구현, Host Sandbox NOT_VERIFIED | [Backend 안내](host-core-guide.md). Local은 UNPROTECTED이며 Protected 수용을 만족시키지 않음 |
| 공개 실행·출시 | PUBLIC_DELEGATION_BLOCKED, 전체 Host Live 수용 미완료 | 인증된 Owner 승인·실제 실행 집행·비용 한도 수용 필요. P2 native 실행 차단과 P1 old-R2 보류는 [통합 기록](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-11-12/repository-consolidation.md) 참조 |
| 실사용 가치·플랫폼 | 제한된 Windows 관측과 과거 Linux 시험 이력 있음 | 전체 OS 수용, Todo + Calendar 사용자 흐름·브라우저 E2E, 독립 외부 파일럿·생산성/비용 개선 및 M5 미완료 |

### 최근 로컬 검증

환경: Windows / PowerShell / Node v24.14.1. 아래는 문서 정리 후보에 대해 이번 세션에서 실행한 결과이며 실제 모델 호출과 원격 CI 재검증은 수행하지 않았다.

| 명령·검사 | 결과와 한계 |
| --- | --- |
| `npm.cmd test` | exit 1. Live 안전성 21 PASS, MCP 3 PASS, 설치 Goal 2 PASS, Codex MVP 319 PASS / 4 SKIP, Legacy 324 PASS. Alpha 469 PASS / 5 FAIL / 7 SKIP에서 중단 |
| Alpha 실패 | Docker 보호 시험의 `CODEFLEET_TEST_DOCKER` 미설정: H2 isolation, H3 runtime, H4 IPC, H6 planning, Operator guard. 필수 보호 시험은 실패 상태로 보존 |
| `npm.cmd run test:host-core` | 별도 실행 exit 0, 135 PASS |
| `npm.cmd run posttest` | 별도 실행 exit 0. FINAL RULE 커버리지·링크·인용·선언 사실 검사 통과. 과거 인용의 미확정·의심 항목은 기존 한계로 유지 |

기본 npm 캐시 접근 거부로 설치 Goal 시험이 처음 실패했으며, 쓰기 가능한 임시 캐시를 사용한 후속 실행은 통과했다. 문서 정리 후 삭제된 파일을 참조하던 Legacy 상태 근거를 현행 로드맵으로 갱신했다. 커버리지·수치 기준선은 변경하지 않았다.

### 공개 문서 최소화 기록

2026-11-12 / 기준 커밋: 위 검토 기준선 / 유형: 문서 정리 / 상태: DOCUMENTED. 사용자 승인에 따라 과거 문서는 Git 이력에 보존하고 현재 트리에서 파일 349개를 제거했다. 새 진입점 포함 docs 파일은 29개이며 제품 문서·현행 구현 계약·Legacy 검사 필수 자료를 남겼다. 삭제 대상 근거 링크는 고정 커밋으로 변경했다. `INDEX.md`와 두 README의 현재 기록 수는 디스크와 일치하도록 갱신했고 검사 기준선은 변경하지 않았다.

검증: Windows / PowerShell / Node v24.14.1, `npm.cmd run posttest` exit 0. 이 검사는 남은 문서와 기존 Legacy 커버리지 산출물을 검사하며 삭제 전 역사 기록 자체를 재검증한 결과가 아니다. 다음 작업은 위 수락 게이트를 따른다. Host Live·Protected·외부 파일럿은 여전히 미완료다. 커밋·푸시는 이 변경에 대해 수행하지 않았다.

### 다음 수락 게이트

[로드맵](roadmap.md#현재-host-native-후속-작업)에 따라 신규 프로젝트 Bootstrap 재현과 Host별 Capability·승인 경계를 확인하고, 정확한 계약에 승인된 실제 Host 수용 근거를 확보한다. [통합 후 인계](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/handoffs/2026-11-12/CONSOLIDATED_LOCAL_TESTS_KO.md)를 사용할 때에도 기준 커밋·환경·미확정 효과·승인을 다시 대조한다. 과거 인계 문서의 후보 선정이나 명령 예시는 현재 실행 권한을 부여하지 않는다.
