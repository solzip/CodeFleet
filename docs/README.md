# CodeFleet 설계 문서

이 디렉토리는 **현재 제품을 구현하고 수락하기 위한 계약**만 관리한다. 세션 기록·과거 감사·설치 안내·진행 현황은 넣지 않는다.

| 질문 | 기준 문서 |
| --- | --- |
| 무엇을 만들고 어떤 원칙을 지키는가 | [제품 원칙과 핵심 사용자 경험](PRODUCT_VISION.md) |
| 어떤 목표를 어떤 조건으로 수락하는가 | [로드맵](product-completion/roadmap.md) |
| 어떤 구조와 책임 경계로 구현하는가 | [아키텍처](product-completion/architecture.md) |
| 선택한 기능의 상세 계약은 무엇인가 | [구현 계약](implementation/) |

UX-01~UX-05를 제품 원칙 → 로드맵의 수락 기준 → 아키텍처의 책임 → 해당 구현 계약으로 연결한다. 설계가 있다는 사실은 기능 구현이나 실제 Host 수용의 증거가 아니다.

## 상세 계약 선택

| 구현 영역 | 읽을 계약 |
| --- | --- |
| 검토 중인 초기 제품 집중안 | [개발 작업 검증과 재개 전체 설계](implementation/work-verification-resume.md): 고정 프로필, 상태 전이·종결, 데이터·호환성, 정상·실패·불명과 수치 수락 기준 |
| Host 제안·계획 경계 | [Host 연동](implementation/host-native.md), [계획 전용 경로](implementation/host-planning.md) |
| 권한과 보호 실행 경계 | [승인](implementation/operator-authorization.md), [Operator Runtime](implementation/operator-runtime.md), [IPC](implementation/host-ipc.md) |
| 승인된 실행과 제한된 진행 | [Bootstrap 예약](implementation/bootstrap-reservations.md), [Continuation](implementation/bounded-continuation.md), [다중 WorkItem](implementation/multi-workitem-development.md) |
| 복구와 완료 판정 | [Objective Recovery](implementation/objective-recovery.md), [Local-only 수락](implementation/local-only-acceptance.md) |

각 계약은 해당 경로에만 적용한다. Linux Operator·Docker 보호 경로를 기본 Host 준비의 필수 조건으로 확대하지 않으며, 기존 경로의 제약·차단을 삭제해 현재 지원이 늘어난 것으로 표시하지 않는다.

현재 구현·검증·차단 상태는 [진행 현황](../project/PROGRESS.md), 설치·사용은 [사용 안내](../guides/README.md), 기록·검증 규칙은 [기여 안내](../CONTRIBUTING.md)를 따른다. 기존 Legacy/Alpha 계약은 [회귀 검사 자산](../test/contracts/legacy/README.md)으로 분리해 보존하며 현재 제품의 기본 동작과 혼동하지 않는다.
