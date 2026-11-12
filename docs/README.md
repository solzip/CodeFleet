# CodeFleet 문서

CodeFleet은 Codex CLI·Claude Code 안에서 자연어 개발 목표를 검토 가능한 작업과 승인된 실행, 독립적인 완료 판정으로 연결하는 Host-Native 확장 도구입니다.

## 처음 읽을 문서

| 확인할 내용 | 문서 |
| --- | --- |
| 제품 목적과 유지할 원칙 | [제품 원칙](PRODUCT_VISION.md) |
| 구현·검증·차단 상태 | [진행 현황](product-completion/progress.md#현재-상태-요약) |
| 다음 목표와 완료 기준 | [로드맵](product-completion/roadmap.md) |
| 설치와 기본 사용 | [Host 사용 안내](product-completion/host-native-guide.md) |
| 기본 준비와 검증 Backend | [Host Core 안내](product-completion/host-core-guide.md) |
| 구조와 책임 경계 | [아키텍처](product-completion/architecture.md) |

현재는 개발·수용 검증 단계입니다. 감독형 Local 성공, 합성 시험, 실제 Host 관측과 보호 검증은 보장 범위가 다릅니다. 지원 여부와 남은 제한은 진행 현황에서 확인하세요. 공개 저장소의 소스와 기존 배포 패키지의 지원 범위도 구분합니다.

## 개발·검토용 자료

| 위치 | 역할과 읽는 방법 |
| --- | --- |
| `product-completion/` | 공식 제품 문서와 사용 안내. [문서 지도](product-completion/README.md) 참조 |
| `implementation/` | 기능별 상세 구현 계약. 해당 작업의 계약을 선택해서 읽음 |
| [Git 이력의 기록](INDEX.md) | 과거 실행·감사·설계·인계 자료. 고정 커밋으로 조회 |
| `archive/` | Legacy 수치 검사가 요구하는 역사 보존 계약 |
| `concept-foundation.md`, `rule-*.json`, `doc-anchor-baseline.json` | Legacy FINAL RULE 및 자동 검사 계약·기준선 |
| `REGISTER.md`, `CONVENTIONS.md` | 과거 결함 등재와 [기록 규약](CONVENTIONS.md) |

역사 자료의 날짜·수치·후속 지시는 해당 기준선에 한정합니다. 문서가 존재하거나 시험이 통과했다는 사실만으로 현재 Host 수용이나 공개 릴리스 완료가 되지는 않습니다.

공개 문서에는 개인 경로·인증정보·원본 Host 응답·실행 DB를 추가하지 않습니다. 예시는 상대 경로나 `<REPOSITORY>` 등의 자리표시자를 사용하고, 실행 기록에는 커밋·환경·검사 결과와 한계를 남깁니다. 새 공식 상태는 `progress.md`, 다음 수락 기준은 `roadmap.md`에 갱신합니다.
