# CodeFleet 제품 원칙

CodeFleet은 Codex CLI·Claude Code 안에서 사용하는 **Host-Native AI 개발 오케스트레이션 확장 도구**다. 사용자가 자연어로 표현한 목표를 검토 가능한 작업으로 만들고, 허용된 실행과 독립적인 완료 판정을 연결한다. 신규 프로젝트 Bootstrap과 기존 프로젝트 개선을 모두 제품의 목표로 둔다.

이 문서는 유지할 제품 원칙을 정의한다. 현재 구조는 [공식 아키텍처](product-completion/architecture.md), 구현·검증 범위는 [진행 현황](product-completion/progress.md), 다음 작업과 완료 기준은 [로드맵](product-completion/roadmap.md)이 관리한다. 제품 원칙에 포함됐다는 사실은 구현 완료를 뜻하지 않는다.

## Host를 활용하는 확장

기존 Host의 모델·인증·세션과 허용된 도구·Agent/Subagent 기능을 우선 활용한다. CodeFleet은 별도의 Agent 엔진이나 실행 플랫폼을 만드는 것이 아니라 기존 Host에 작업 조정과 검증 규율을 연결한다. 별도의 모델 로그인이나 세션 복제를 기본 경로로 요구하지 않는다. Host 간 세션 이식이나 인증 토큰 추출을 전제로 하지 않으며, 직접 모델 API는 선택적 연동이다.

기본 계획·분석·Draft·Workflow/DAG 사용에 Docker·WSL·별도 OS 계정·직접 모델 API Key를 요구하지 않는다. 현재 로컬 준비 환경과 설치 방법은 [Host Core 안내](product-completion/host-core-guide.md)를 따른다. 보호된 실행에 필요한 조건은 해당 Backend와 계약의 요구 사항으로 구분한다.

## 목표에서 실행 계약까지

자연어 목표 → Task Draft → Validator → Workflow/DAG → Policy·Capability·승인 확인 → 허용된 실행 → Evidence → Judge → 결과·복구로 연결한다.

- Draft는 제안이다. 누락된 완료 기준이나 모호한 범위를 실행 허가로 바꾸지 않는다.
- Validator는 계약의 구조·범위·검증 조건을 검사한다. 유효한 Draft도 별도 실행 승인을 대신하지 않는다.
- 단일 Agent를 기본으로 한다. 필요할 때 Planner·Architect·Executor·Reviewer 등 역할을 나누고 지원되는 범위에서 협업한다. 역할 이름이나 Skill은 권한을 부여하지 않는다.
- Policy·실제 Capability·현재 승인으로 실행 가능성을 판단한다. 상태·계약 revision·취소·재시도·복구를 추적하며 미확정 효과를 성공으로 처리하지 않는다.

## 검증 수준과 완료

### Agentic Development Loop와 Harness Engineering

Agentic Development Loop는 목표를 검증 가능한 WorkItem으로 나누고 실행·검증의 피드백으로 다음 허용 행동을 정하는 개발 과정이다. Manager/Coordinator는 역할 배정·의존성·병렬 실행·충돌·결과 통합을 관리한다. 역할별 협업은 필요한 경우에만 사용하며 단일 Agent 경로를 유지한다.

Harness Engineering은 Agent의 판단 밖에서 Policy·Capability·승인·예산·검증 상태와 관측 증거를 통제하는 원칙이다. Agent 또는 Coordinator가 자기 결과를 승인하거나 검증 기준을 낮추지 않는다. 기존 Persistent State·Work Log·Lease·Recovery를 재사용하여 시도와 미확정 효과를 추적한다.

실패 후에는 승인된 범위와 남은 예산 안에서만 Bounded Improvement Loop를 수행한다. 실패 근거 → 수정 가설 → 제한된 수정 → 새 후보 재검증으로 이어가며 반복 실패·무진전·권한 변경·예산 소진·복구 불확실성에서는 중단한다. 이 목표가 전체 Host 경로의 자동 수정·위임·장기 실행 구현 완료를 뜻하지 않는다.

### Objective 지속성과 계약 기반 복구

Goal Persistence는 Turn·Attempt·세션의 종료와 Objective 완료를 구분하는 원칙이다. 현재 승인된 Objective의 필수 수락 조건과 Evidence/Judge가 완료를 결정한다. 개별 WorkItem 성공·요약 작성·컨텍스트 한도 도달로 전체 목표를 완료 처리하지 않는다. 승인·Capability·예산 안에서 다음 작업을 이어가고, 중단이 필요하면 미충족 조건·근거·차단 원인·다음 허용 행동을 남겨 Human Handoff로 연결한다. 무한 실행이나 승인 없는 재시도를 뜻하지 않는다.

Context Compaction Recovery는 Host의 압축 기능을 재구현하는 것이 아니라, 압축·세션 교체 뒤에도 현재 계약·Revision·승인·DAG·영속 상태·Lease·미확정 효과·남은 예산·증거를 다시 확인하여 복구하는 원칙이다. 대화 요약은 탐색 보조이며 영속 계약이나 승인 권한을 대체하지 않는다. 필요한 근거가 없거나 충돌하면 영향을 받는 실행을 멈추고 판단을 요청한다.

Contract Revision Synchronization은 요구사항 변경을 기존 계약의 묵시적 변경으로 취급하지 않는 원칙이다. 범위·의존성·Context·검증 기준·승인·기존 Evidence의 영향을 분석하고 지원되는 Revision 또는 새 작업 경로로 검토·승인을 연결한다. 이전 증거는 보존하되 새 계약과 후보의 완료 근거로 자동 재사용하지 않는다. 이 원칙은 모든 Host의 자동 영향 분석·압축 복구·무인 장기 실행이 이미 구현됐다는 뜻이 아니다.

### Backend와 독립 증거

| Backend | 의미와 한계 |
| --- | --- |
| Local Verification | 사용자가 명시적으로 신뢰한 명령과 후보를 로컬에서 검증한다. OS 격리나 Protected Verification을 보증하지 않는다. |
| Container Verification | Docker 기반의 기존 보호 검증 경로다. 고정 검증 입력·격리·무결성 등 계약이 요구하는 조건을 충족해야 한다. 기본 설치에는 선택적이지만 이 Backend가 필요한 계약에는 필수다. |
| Host Sandbox | Host·플랫폼·정책별로 실제 집행이 검증돼야 사용할 수 있다. 현재 미검증 상태를 선언만으로 가용 상태로 바꾸지 않는다. |

AI의 성공 주장은 독립 검증 증거가 아니다. Evidence는 관측 주체·대상 계약·후보·검사 범위와 한계를 보존하고, Judge는 그 증거와 계약으로 완료를 판단한다. Local 성공을 보호된 완료로 승격하거나 필요한 Backend가 없을 때 검증 수준을 자동으로 낮추지 않는다.

## 제품 범위와 검증 원칙

Git HEAD 없는 신규 프로젝트 Bootstrap은 구현과 오프라인 시험이 연결돼 있다. 실제 Host Live와 보호 검증 근거가 연결되기 전에는 수용 완료로 표시하지 않는다. 기존 프로젝트의 준비·검증 경로를 신규 프로젝트 지원 증거로 대신하지 않는다.

오프라인 구현, 설치·발견, 실제 Host Live 수용, 자동 역할 위임, 공개 패키지와 외부 사용자 실적을 각각 구분한다. 과거 실패·차단·보안 의사결정과 해시 고정 증거는 보존하고, 새 상태는 진행 현황에서 후속 근거와 함께 관리한다.

## Cross-Platform과 실사용 가치

Windows·macOS·Linux의 로컬 개발 환경에서 최소 의존성으로 사용할 수 있는 것을 목표로 한다. 경로·셸·프로세스 종료·파일 권한·복구 차이를 실제 환경별로 검증하고, 미시험 조합을 지원 완료로 표시하지 않는다. 선택 Backend의 요구 조건을 기본 설치 전체의 필수 조건으로 확대하지 않는다.

회사의 실제 개발 업무와 사이드 프로젝트에서 준비·승인·개입·검토를 포함한 사람의 작업 시간, 결과 품질·회귀·재작업, 관측 가능한 비용을 줄이는지가 제품 가치의 기준이다. Todo + Calendar MVP를 후속 실사용 수용 대상으로 두며, 기능 시연이나 생성 파일 수만으로 생산성 향상을 주장하지 않는다. 비교 가능한 수동/기존 Host 기준선과 실패·취소를 포함한 실제 표본을 기록한다. 회사 자료와 외부 시스템 변경은 승인 범위에서만 다룬다. 실행 순서와 수락 기준은 로드맵에서, 실적은 진행 현황에서 관리한다.

Single-Agent Baseline은 기본 Host 단일 Agent, CodeFleet 단일 Agent, CodeFleet Multi-Agent를 같은 작업·품질 기준에서 비교하는 원칙이다. 단일 Agent를 기본으로 유지하며 Multi-Agent의 시간·품질·비용 이점은 실제 관측으로 입증한다. 위임·조정·검토 비용과 실패·취소를 포함하고 측정하지 못한 비용을 영으로 채우지 않는다. 비교 절차는 로드맵의 기존 실사용 수용 게이트에 둔다.
