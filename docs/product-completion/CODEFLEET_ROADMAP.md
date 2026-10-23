# CodeFleet — Product Completion Roadmap

> 보존 자료: 이 문서는 2026-10-21 당시의 ChatGPT 프로젝트용 요약이다. 당시 본문과 수치를 보존하며 현재 구현·검증 상태를 대체하지 않는다. 현재 기준은 [제품 원칙](../PRODUCT_VISION.md), [아키텍처](architecture.md), [진행 현황](progress.md), [로드맵](roadmap.md)을 따른다.

**기준일:** 2026-10-21
**범위:** 향후 권장 실행 순서. 이 문서는 제품의 미래 목표를 설명하며 완료 실적이 아니다.

## 0. 현재 기준

- 공식 기준: GitHub `main` (`2a330bb3fdd8a9a9aec5934ffd64f63e7d3d5cba`, 본 문서 작성 시점).
- Host-Native Core/Legacy/Alpha의 오프라인 회귀 및 GitHub CI는 이전 기준선에서 통과했다.
- 실제 Codex·Claude에서 Skill 로드/Task 생성 또는 모델 사용 일부는 관측됐으나 **Draft → Validator → DAG 수용을 완주하지 못했다**.
- 빈 `codefleet-todo` 프로젝트에서 Git HEAD 부재·dubious ownership, 기존 코드 근거 중심 Validator 때문에 Bootstrap 경로가 막혔다.
- 사용자가 만들 실전 대상: **Todo + Calendar 결합 일정 관리 웹앱**.

## 1. 우선순위별 단계

| 우선 | 단계 | 핵심 산출물 | 완료 증거 |
| --- | --- | --- | --- |
| P0 | **실제 신규 프로젝트 진입 장애 제거** | Git 환경 오류를 구분·보고하고 신규 Bootstrap 계약 지원 | 빈 저장소에서 실제 Draft/Validator/DAG 생성·재조회 성공 |
| P0 | **Codex Host 계획 Live 수용** | `$codefleet` 실사용; Task·Draft·DAG | 실제 실행 로그, Task ID, 검증 결과 및 소스 무변경 |
| P0 | **Claude Code Host 계획 Live 수용** | `/codefleet` 대화형 승인 경로에서 동일 계약 확인 | Skill·CLI·G3·G4 관측; 기존 비대화형 권한 오류 재발 방지 |
| P1 | **Todo+Calendar MVP 구현** | 하나의 Task 데이터 기반 목록+캘린더, CRUD, 날짜/시간, 반응형 UI | 승인된 구현·단위/통합 테스트·실제 기능 시연 |
| P1 | **검증·Judge 연결** | 변경 범위와 테스트 Evidence 수준 구분 | 실제 수행한 Local/Protected 게이트에 맞는 정직한 판정 |
| P1 | **역할 위임·Hybrid·Recovery 수용** | 설계/구현/리뷰 분담, 독립 병렬, 실패·재개 | 실제 Host 실행 이벤트·충돌·중단·재개·비중복 증거 |
| P2 | **설치 UX 및 문서 개선** | 새 프로젝트에서 쉬운 설치/진단/초기화 | 깨끗한 사용자 환경에서 설치→첫 Task 재현 |
| P2 | **출시 판정** | 패키지·지원 범위·Known Issues·공개 사례 | 지원 OS/Host·보안·회귀·실사용 수용 기준 충족 |

## 2. 다음 구현 슬라이스: NEW_PROJECT Bootstrap

목표: 사용자가 빈 Git 저장소에서 “Todo와 캘린더를 결합한 앱을 만들어줘”라고 요청해도 **프로젝트 구현을 시작하기 전에** 유효한 개발 계획을 만들 수 있어야 한다.

권장 최소 단계:

1. 실제 `main` 소스에서 Git HEAD 의존성과 G3 참조 규칙, Skill 진입 구조를 확인한다.
2. 새 프로젝트(HEAD 없음), 기존 프로젝트(HEAD 있음), 다른 소유자의 저장소를 분리한다.
3. 기존 G3 계약의 신뢰성을 약화하지 않고 신규 목표·예정 파일·수락 기준을 표현하는 계약을 설계한다.
4. 계획 생성·Validator·DAG 미리보기까지 Docker 없이 확인한다.
5. Bootstrap 초기화는 별도 승인 전까지 수행하지 않는다.
6. 승인된 초기 구조·Git 기준선 형성 후 기존 코드 근거 검증으로 전환한다.
7. Legacy·Alpha·Host-Native 전체 회귀와 위조/무승인 실행 반증 테스트를 수행한다.

**하지 말 것:** 빈 프로젝트에서 통과를 만들려고 가짜 코드 인용, 허위 파일 Reference, 자동 Git Commit, Local 검증의 Protected 승격, Host-Native 일반 기능에 Docker 필수화.

## 3. 실전 프로젝트: Todo + Calendar

최초 요구사항만 고정하고 상세 UX/스택은 CodeFleet에 검토하게 한다.

- 하나의 Todo를 목록·캘린더에서 함께 조회/수정.
- 생성/수정/삭제/완료, 날짜·시간, 월·주 보기, 기본 필터링.
- 예정 시작 시각과 마감 시각, 날짜 없는 할 일의 의미를 분명히 한다.
- MVP에는 불필요한 인증·외부 서비스·알림·반복 규칙을 초기부터 강제하지 않는다.
- 승인된 계획을 소규모 WorkItem으로 나눠 구현·검증한다.
- 최종 공개 저장소에는 실행 가능한 설치·테스트 설명과 **실제 CodeFleet 사용 증거의 민감정보 제거본**을 남긴다.

## 4. 개발 진행 방식

- 한 번에 검증 가능한 기능 하나를 구현하고 해당 검증만큼 상태를 갱신한다.
- Codex와 Claude에 전달하는 프롬프트에는 작업 경로·승인 범위·실제 명령·수락 기준·회귀 범위를 넣는다.
- 외부 변경(Commit/Push/PR/병합/브랜치 삭제)은 명시된 승인 범위를 확인한다.
- 소스·설계·오프라인 검증·Host Live 결과를 하나의 성공 표시로 합치지 않는다.
- 이상 동작은 **환경/설정/제품 결함/미지원**으로 분류하고 최소 원인을 해결한다.
- 과거 보안 실험과 문서를 반복 생산하지 말고 실제 사용자 수직 경로 완주를 우선한다.

## 5. 출시 게이트

1. Codex와 Claude 각각 설치·발견·계획 수용 성공.
2. 신규 프로젝트 Bootstrap 및 기존 프로젝트 개선 성공.
3. 실제 구현·테스트·오류 수정과 승인·위험 경계 확인.
4. 역할별 협업, 필요 시 병렬화, 중단/재개/복구 실측.
5. Candidate/Contract/Evidence와 Judge 판정 연결.
6. 기본 사용은 Host 인증·모델을 활용하고 Docker·별도 API Key 없이 계획 가능.
7. CI·문서·패키지·보안 점검, 공개 예제와 지원 한계 명시.

## 6. 기존 역사적 로드맵과의 관계

[GitHub의 기존 `roadmap.md`](https://github.com/solzip/CodeFleet/blob/main/docs/product-completion/roadmap.md)는 M0~M5 출시 준비의 설계 기록이다. 이 문서는 2026-10-21 현재 실사용에서 드러난 **Host-Native 수용·Bootstrap 우선순위**를 추가한 ChatGPT 프로젝트용 실행 계획이다. 역사적 M0~M5 단계가 모두 완료됐다고 주장하지 않는다.
