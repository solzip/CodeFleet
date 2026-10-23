# CodeFleet — Current Implementation & Verification Status

> 보존 자료: 이 문서는 2026-10-21 당시의 ChatGPT 프로젝트용 요약이다. 당시 본문과 수치를 보존하며 현재 구현·검증 상태를 대체하지 않는다. 현재 기준은 [제품 원칙](../PRODUCT_VISION.md), [아키텍처](architecture.md), [진행 현황](progress.md), [로드맵](roadmap.md)을 따른다.

**기준일:** 2026-10-21
**공식 저장소:** https://github.com/solzip/CodeFleet
**대화에서 확인한 기준 main SHA:** `2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba`

> 이 문서는 2026-10-21까지 공유된 실행 보고와 해당 시점 GitHub `main` 문서·CI 조회에 기초한 스냅샷이다. 새 작업·커밋 이후에는 실제 소스/로그로 갱신한다. 사용자가 전달한 로컬 테스트 결과는 직접 재실행한 것과 구분한다.

## 1. 확인된 기준선

- PR #6의 Host-Native 통합은 `main`에 병합됐다. 이후 README 단독 커밋 `2a330bb…`가 `main`에 Fast-forward 반영됐다.
- 당시 원격 브랜치 정리 결과는 `main`만 유지. 이전 Alpha 실험의 Git Bundle을 사용자 전용 경로에 보존하고 복구 가능성을 검증했다고 보고됐다.
- README 반영 후 Windows·Linux 필수 GitHub Actions Job이 모두 성공했다.
- 마지막 종합 로컬 회귀 보고: `npm test` **548건 통과, 실패·제외 0**. 이 수치는 특정 검증 시점의 결과이며 이후 모든 변경에 적용하지 않는다.
- Alpha Doctor `--no-auth` **exit 2**: 인증 검사를 생략한 부분 점검이며 전체 준비 성공이 아니다.
- Linux Legacy 탐색에서 관측된 **17건의 실패**는 원인 미해결. 정규 Linux CI 필수 범위에서는 해당 탐색이 `NOT_RUN`이었다.

## 2. 기능별 판정

| 기능/경계 | 확인된 범위 | 상태 |
| --- | --- | --- |
| Codex·Claude 프로젝트 Skill 설치/상태 관리 | 프로젝트별 설치·활성화·무결성 검증 | 오프라인 및 일부 실제 Host 발견 확인 |
| Docker 없는 Task/계획/조회 | 실제 CLI 및 회귀 경로 | 구현·오프라인 검증 |
| G3 Task Draft 계약·Validator | 기존 파일·테스트 근거 중심 | 오프라인 검증, 신규 프로젝트 적용 미완성 |
| G4 Workflow/DAG | 승인과 실행을 분리한 준비·조회 | 오프라인 검증 |
| Hybrid Scheduler·역할·WorkItem | 제한 병렬/충돌/독립 분기 테스트 | 오프라인 검증, 실제 Host 자동 위임 미검증 |
| Capability·Operator·Lease·Recovery | H2~H4 보호 경계 테스트 | 해당 시험 환경에서 오프라인 검증 |
| Local Verification | 명시적 신뢰 조건의 명령 결과 | 조건부 사용; Protected 검증 아님 |
| Container Verification | 기존 Alpha Docker Node/Java 보호 검증 | 해당 환경에서 검증; 기본 사용자 설치 요건 아님 |
| Host Sandbox | 실제 도구·OS별 수용 근거 불충분 | `NOT_VERIFIED` / 비활성 |
| 공개 Host `requests/submit/run/resume` | 보호 실행 자격 확인 필요 | 일반 사용 경로에서 차단 |
| 자동 Agent 위임 및 실전 전체 구현 | 오프라인 시뮬레이션과 구분 필요 | Host Live 수용 미완료 |

## 3. 실제 Host 시도에서 확인한 상태

### Codex: 새 Todo+Calendar 프로젝트 (`codefleet-todo`)

- `$codefleet` Skill이 실제 세션에 로드되고 설치 Receipt 81개가 일치했다.
- Node 24.14.1, `host codex doctor` 결과 `AVAILABLE`, CLI로 Task 생성·상태 재조회에 성공했다.
- Task ID `task-40e1ec23-318a-497b-9171-aa5ab2c66dbd`, revision 2, 상태 `BLOCKED`.
- Git `dubious ownership`과 초기 커밋이 없어 **Git HEAD 부재**. Draft 미생성, G3 Validator 및 G4 DAG는 `NOT_RUN`; `workflow: null`.
- 모델 자체의 일반적 제품 제안은 CodeFleet 검증 결과가 아니다.
- 승인·실행 원장 생성 없음, 프로젝트 파일 무변경 보고.

### Claude Code: 별도 Fixture 계획 수용

- 프로젝트 `/codefleet` Skill 설치, Receipt 확인, Claude Code 2.1.306에서 Skill 발견 확인.
- 기존 전역 Hook·상위 CLAUDE.md·MCP의 영향을 줄이는 제한 설정을 별도로 관측했다.
- 실제 Claude 모델 세션(`claude-opus-5-5`)에서는 Skill을 발견했지만 **비대화형 `claude -p`에서 첫 CodeFleet CLI `host claude plan`의 Bash 승인 거부**로 중단됐다.
- permission denial 1건. Task Draft/G3/G4 `NOT_RUN`. Fixture 소스와 Skill hash는 실행 전후 동일, CodeFleet STATE는 비어 있음.
- 다음 검증은 대화형 권한 프롬프트에서 승인 범위를 확인하는 방식이 후보이며, **성공 판정은 아직 없음**.

## 4. 원인 분류와 미해결 문제

| 분류 | 실제 현상 | 다음 해결 방향 |
| --- | --- | --- |
| 환경/설치 | 새 프로젝트에는 Skill이 자동 설치되지 않음 | 프로젝트별 설치 확인, 향후 설치 UX 개선 |
| 환경/Git | `dubious ownership` | 실제 사용자·소유권을 확인해 안전한 프로젝트 작업 경로 사용; 전역 우회 금지 |
| Git 기준선 | 신규 프로젝트에 HEAD 없음 | 신규 프로젝트 Bootstrap의 정식 계약 설계 |
| 제품 Capability Gap | 기존 G3의 실제 코드/테스트 참조 요구 | 신규 프로젝트용 계획/Bootstrap 계약과 이후 기존 검증으로의 전환 |
| Host 권한 | Claude 비대화형 실행의 Bash 승인 거부 | 대화형 감독 테스트에서 승인 확인; 허용 규칙 무분별 확대 금지 |
| CI/지원 범위 | Linux Legacy 탐색 17건 실패 | 별도 재현·영향 평가; Windows 통과로 Linux 지원 선언 금지 |
| 독립 검증 | Host Live·자동 위임·Host Sandbox | 명시적 수용 테스트와 실제 Evidence 필요 |

## 5. 다음 작업의 출발점

1. CodeFleet `main` 기준으로 **빈 저장소에서도 요구사항 → Draft → Validator → DAG가 진행되는 Bootstrap 경로**의 현 구현·최소 변경을 확인한다.
2. Codex/Claude Live 수용을 별도 시나리오로 완료하고 실제 권한·승인·결과를 기록한다.
3. Todo+Calendar 신규 프로젝트에서 승인된 구현·테스트·검증까지 실제 완주한다.
4. 완료 전에 Local/Protected/Provider-Reported Evidence를 구분하고, 불충족 게이트는 차단 상태로 유지한다.

## 6. 판정 규칙

`PASS`는 실제 실행한 검사에만 부여한다. `NOT_RUN`은 실행 안 함, `BLOCKED`는 사전 조건이나 권한으로 차단, `PARTIAL`은 일부만 수행, `CAPABILITY_GAP`은 현재 구현 미지원이다. Doctor, GitHub CI, 모델 사용, CodeFleet Validator/DAG 및 Protected Judge는 **각각 다른 증거 수준**이다.
