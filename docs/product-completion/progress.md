# 구현·검증 진행 현황

갱신: 2026-11-12 · 검토 기준: `2901dc9` + 저장소 전체 정리 후보. 런타임 로직·승인·수락 기준은 변경하지 않았다.
제품 목적은 [제품 원칙](../PRODUCT_VISION.md), 구조는 [아키텍처](architecture.md), 수락 조건과 순서는 [로드맵](roadmap.md)에서 관리한다.

## 현재 상태 요약

**계획·검토와 감독형 Local 개발 흐름을 구현한 개발 단계다.** 설치된 패키지에서 수정 승인 → 테스트 → 완료 판정 → 별도 프로세스 복구를 확인했다. 실제 Host 제안을 감독형으로 적용한 제한된 과거 관측도 있다. 공개 인증 위임·보호 실행·양쪽 Host의 전체 수용과 공개 사용 릴리스는 미완료다.

Local 완료는 `COMPLETE_LOCAL`이며 보호 검증은 `UNSATISFIED`다. 설치 시험의 Codex·Claude 명칭은 설치 대상 Host를 뜻하며, 그 시험에서 실제 모델을 호출하지 않았다.

## 기능별 상태

| 영역 | 구현·검증 수준 | 남은 조건 |
| --- | --- | --- |
| 목표·Draft·Validator·DAG | 계획·계약 검토·의존성·승인 요청 구현, 오프라인 회귀 근거 있음 | 실제 Host에서 목표부터 최종 결과까지 전체 수용 |
| Codex Goal·MCP·재개 안내 | 영속 Goal 탐색, 계약 리뷰, 미승인 Workflow 준비와 설치 CLI 재발견 구현 | 인증된 운영 연결과 기존 설치물 업그레이드 수용 |
| 신규 프로젝트 Bootstrap | Fileset 승인·생성·Local 검증·Repair·재개 구현, 합성·설치 회귀 근거 있음 | 실제 모델을 연결한 신규 프로젝트 전체 수용·보호 검증 |
| 기존 프로젝트 변경 | 감독형 Fileset 승인·적용·Local 완료·프로세스 복구 관측 있음 | 범용 무인 실행과 독립 사용자 수용 |
| 계약 변경·Repair·Work Log | 기존 Store·Event·Lease·Recovery에 연결, Local 회귀 근거 있음 | 실제 인계의 독립 인증·Host Compaction·장기 실행 수용 |
| 역할 협업 | 제한된 자식 제안·감독형 통합·비교 관측 있음 | 공개 인증 위임은 BLOCKED, Multi-Agent 성능 이점 미입증 |
| 검증 Backend | Local·Container 경로 구현 | Host Sandbox NOT_VERIFIED, Local 결과로 Protected 수용 불가 |
| 플랫폼·실사용·출시 | 제한된 Windows 관측과 과거 Linux 시험 이력 있음 | 전체 OS 수용·브라우저 E2E·외부 파일럿·생산성/비용 개선·M5 미완료 |

구현 근거: [Core 안내](host-core-guide.md), [Local 수용 계약](../implementation/local-only-acceptance.md), [복구 계약](../implementation/objective-recovery.md).
과거 관측: [감독형 Local 수용](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-28/public-existing-local-v2.md), [Repair 연결](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-30/supervised-adoption-repair.md), [인계 신뢰 경계](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-30/undelivered-handoff-recovery-v2.md), [협업 비교](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-10-28/manager-proposal-handoff.md).

## 최근 검증

환경: Windows / PowerShell / Node v24.14.1. 모델 호출·원격 CI 재검증은 수행하지 않았다.

| 실행 명령 | 결과 | 확인한 범위 |
| --- | --- | --- |
| 전체 코드 구문 검사 | exit 0 · 265개 | Node 내장 TypeScript 제거 후 모듈 구문 검사. 최초 파일 직접 `--check`는 `yaml.ts`의 TypeScript 인식 실패로 exit 1, 검사 방식 수정 후 코드 변경 없이 통과 |
| package 명령·Legacy 예제 검사 | exit 0 | package script 경로 참조 89개 누락 없음, 예제 Task Validator 오류·경고 없음 |
| `npm.cmd run pretest` → `npm.cmd run test:legacy` | 각각 exit 0 · 324 PASS | Legacy 측정 산출물을 새로 생성하고 계약·문서 검사기 회귀 실행 |
| `npm.cmd run test:installed-goal-loop` | exit 0 · 2 PASS | 실제 npm 패키지의 Codex·Claude Skill 설치, 준비된 제안의 승인·적용·Node 검증·Recovery·완료 후 소스 변경 감지 |
| `npm.cmd run test:host` | exit 0 · 20 PASS / 1 SKIP | 설치·제안·승인·취소·복구와 변조 거부. Docker Harness 조건부 시험은 SKIP |
| `npm.cmd pack --dry-run --ignore-scripts --json` | exit 0 · 배포 파일 155개 | 로컬 상태·개인 설정·테스트·Proof 도구 혼입 0개 |
| `npm.cmd run posttest`, `git diff --check` | 각각 exit 0 | 기존 Legacy 커버리지 산출물과 문서 링크·인용·선언 사실·공백 검사 |

위 실행은 준비된 제안을 이용한 로컬 회귀이며 실제 AI의 자연어 작업 품질, 사람의 개입 시간, 브라우저 사용성 또는 Protected Evidence를 입증하지 않는다. 앞선 Todo·Calendar 및 복구 시나리오의 53 PASS / 1 SKIP은 [이전 상태 문서](https://github.com/solzip/CodeFleet/blob/2901dc9/docs/product-completion/progress.md)에 보존한다.

### 이전 전체 회귀의 한계

문서 정리 전 후보에서 실행한 `npm.cmd test`는 **exit 1**이었다. Live 안전성 21 PASS, MCP 3 PASS, 설치 Goal 2 PASS, Codex MVP 319 PASS / 4 SKIP, Legacy 324 PASS 이후 Alpha에서 469 PASS / 5 FAIL / 7 SKIP으로 중단됐다. 실패는 Docker 보호 시험의 `CODEFLEET_TEST_DOCKER` 미설정(H2 isolation, H3 runtime, H4 IPC, H6 planning, Operator guard)이었다.

뒤의 Host Core는 별도로 실행해 exit 0 · 135 PASS를 확인했다. 이 결과를 현재 후보의 전체 회귀·보호 검증 통과로 집계하지 않는다.

## 다음 작업과 차단 조건

다음 실사용 시험은 **작은 기능 변경 → 명시적 승인 → 구현·검증 → 중단·재개 → 최종 검토**다. 대상 프로젝트와 작업 범위를 고정하고 해당 계약의 실행 승인을 확보해야 시작할 수 있다. 기본 Host와 비교할 때는 동일 작업·초기 상태·품질 기준으로 준비·개입·검토 시간, 결함·재작업과 관측 가능한 비용을 기록한다.

공개 위임은 `PUBLIC_DELEGATION_BLOCKED`를 유지한다. 인증된 Owner 승인, 실제 Host 집행과 비용 통제는 수용 근거가 필요하다. P2 native 실행 차단과 P1 old-R2 보류는 [통합 당시 기록](https://github.com/solzip/CodeFleet/blob/5ae49a0d64d9a4b2c3f3ee8f5842c2cd033275a6/docs/runs/2026-11-12/repository-consolidation.md)을 따른다. 새 범위는 로드맵의 선행 조건을 확인해 진행한다.

## 기록 관리

이 문서는 현재 상태를 갱신하며 작업 일지를 누적하지 않는다. 과거 기록은 [고정 커밋 안내](../INDEX.md)에서 조회한다. 제품 상태 변경에는 계약·후보·환경과 검증 근거를 연결하고, 문서 정리는 DOCUMENTED로 기록한다.

이번 검토는 기준 커밋의 추적 파일 329개를 대상으로 분류·중복·진입점·참조 관계를 점검했다. 완전 중복 파일은 없었고 정적 import가 없는 소스도 CLI·MCP·격리 실행 진입점임을 확인했다. 한·영 README, 소스 지도, package 설명과 문제·보안 안내를 현재 범위로 맞추고, 참조되지 않는 과거 원격 전달 시험·H1 준비 스크립트를 제거했다. 기존 실행 상태·백업·테스트·Proof 도구·검사 기준선은 보존했다. 삭제 파일과 과거 설명은 Git 이력에서 복구할 수 있다.

이는 저장소 정리(DOCUMENTED)와 위 범위의 회귀 결과다. 대형 Legacy 모듈 분리, 전체 보안 감사, Linux/macOS 재검증, 전체 Alpha 보호 시험 및 실제 Host 수용을 완료한 것은 아니다. 후속 작업은 위 실사용 시험이며 신규 결함 ID·기능 수용 승격은 없다.
