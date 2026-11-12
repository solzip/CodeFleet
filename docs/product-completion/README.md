# 공식 제품 문서

전체 문서 진입점은 [docs 안내](../README.md)다.

| 목적 | 기준 문서 |
| --- | --- |
| 무엇을 만들고 어떤 원칙을 지키는가 | [제품 원칙](../PRODUCT_VISION.md) |
| 어디까지 구현·검증했고 무엇이 막혔는가 | [진행 현황](progress.md) |
| 다음 작업과 완료 조건은 무엇인가 | [로드맵](roadmap.md) |
| 어떤 구조로 구현하는가 | [아키텍처](architecture.md) |
| Host에 설치하고 어떻게 사용하는가 | [Host 사용 안내](host-native-guide.md) |
| 기본 준비와 검증 Backend의 차이는 무엇인가 | [Host Core 안내](host-core-guide.md) |
| 기존 Workflow와 Alpha 경로를 어떻게 사용하는가 | [Workflow 안내](orchestration-guide.md), [Alpha 안내](alpha-quickstart.md) |

기능별 구현 계약은 `../implementation/`에서 관리한다. 이전 설계·감사·실행 이력은 [고정 커밋 안내](../INDEX.md)에서 조회한다.

구현·오프라인 시험·실제 Host 수용·공개 패키지 지원을 구분한다. Local 검증은 Protected 검증을 충족하지 않으며, 실행에는 현재 계약·Capability·별도 승인이 필요하다. 공식 상태는 진행 현황에, 후속 수락 기준은 로드맵에 갱신한다.
