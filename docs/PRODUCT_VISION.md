# CodeFleet 제품 원칙

CodeFleet은 Codex CLI·Claude Code 안에서 사용하는 **Host-Native AI 개발 오케스트레이션 확장 도구**다. 사용자가 자연어로 표현한 목표를 검토 가능한 작업으로 만들고, 허용된 실행과 독립적인 완료 판정을 연결한다. 신규 프로젝트 Bootstrap과 기존 프로젝트 개선을 모두 제품의 목표로 둔다.

이 문서는 유지할 제품 원칙을 정의한다. 현재 구조는 [공식 아키텍처](product-completion/architecture.md), 구현·검증 범위는 [진행 현황](product-completion/progress.md), 다음 작업과 완료 기준은 [로드맵](product-completion/roadmap.md)이 관리한다. 제품 원칙에 포함됐다는 사실은 구현 완료를 뜻하지 않는다.

## Host를 활용하는 확장

기존 Host의 모델·인증·세션과 허용된 도구를 우선 활용한다. CodeFleet은 별도의 모델 로그인이나 세션 복제를 기본 경로로 요구하지 않는다. Host 간 세션 이식이나 인증 토큰 추출을 전제로 하지 않으며, 직접 모델 API는 선택적 연동이다.

기본 계획·분석·Draft·Workflow/DAG 사용에 Docker·WSL·별도 OS 계정·직접 모델 API Key를 요구하지 않는다. 현재 로컬 준비 환경과 설치 방법은 [Host Core 안내](product-completion/host-core-guide.md)를 따른다. 보호된 실행에 필요한 조건은 해당 Backend와 계약의 요구 사항으로 구분한다.

## 목표에서 실행 계약까지

자연어 목표 → Task Draft → Validator → Workflow/DAG → Policy·Capability·승인 확인 → 허용된 실행 → Evidence → Judge → 결과·복구로 연결한다.

- Draft는 제안이다. 누락된 완료 기준이나 모호한 범위를 실행 허가로 바꾸지 않는다.
- Validator는 계약의 구조·범위·검증 조건을 검사한다. 유효한 Draft도 별도 실행 승인을 대신하지 않는다.
- 단일 Agent를 기본으로 한다. 필요할 때 Planner·Architect·Executor·Reviewer 등 역할을 나누고 지원되는 범위에서 협업한다. 역할 이름이나 Skill은 권한을 부여하지 않는다.
- Policy·실제 Capability·현재 승인으로 실행 가능성을 판단한다. 상태·계약 revision·취소·재시도·복구를 추적하며 미확정 효과를 성공으로 처리하지 않는다.

## 검증 수준과 완료

| Backend | 의미와 한계 |
| --- | --- |
| Local Verification | 사용자가 명시적으로 신뢰한 명령과 후보를 로컬에서 검증한다. OS 격리나 Protected Verification을 보증하지 않는다. |
| Container Verification | Docker 기반의 기존 보호 검증 경로다. 고정 검증 입력·격리·무결성 등 계약이 요구하는 조건을 충족해야 한다. 기본 설치에는 선택적이지만 이 Backend가 필요한 계약에는 필수다. |
| Host Sandbox | Host·플랫폼·정책별로 실제 집행이 검증돼야 사용할 수 있다. 현재 미검증 상태를 선언만으로 가용 상태로 바꾸지 않는다. |

AI의 성공 주장은 독립 검증 증거가 아니다. Evidence는 관측 주체·대상 계약·후보·검사 범위와 한계를 보존하고, Judge는 그 증거와 계약으로 완료를 판단한다. Local 성공을 보호된 완료로 승격하거나 필요한 Backend가 없을 때 검증 수준을 자동으로 낮추지 않는다.

## 제품 범위와 검증 원칙

Git HEAD 없는 신규 프로젝트 Bootstrap은 구현과 오프라인 시험이 연결돼 있다. 실제 Host Live와 보호 검증 근거가 연결되기 전에는 수용 완료로 표시하지 않는다. 기존 프로젝트의 준비·검증 경로를 신규 프로젝트 지원 증거로 대신하지 않는다.

오프라인 구현, 설치·발견, 실제 Host Live 수용, 자동 역할 위임, 공개 패키지와 외부 사용자 실적을 각각 구분한다. 과거 실패·차단·보안 의사결정과 해시 고정 증거는 보존하고, 새 상태는 진행 현황에서 후속 근거와 함께 관리한다.
