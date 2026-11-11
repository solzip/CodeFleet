# Codex Host Skill — persisted Goal/Bootstrap navigation

- 작업 일시: 2026-11-11 (GitHub bounded implementation)
- 대상 기준 커밋: `601add2a0fb0c0abd2a0cea0c999ad44fb338640`
- 작업 유형: 수정
- 선행 문서: `docs/PRODUCT_VISION.md`, `docs/PLAN/codefleet-execution-contract-r3.md`, `docs/PLAN/codefleet-codex-mvp-implementation-status.md`
- 번호 실측 최대값: `docs/REGISTER.md`의 P0-17 / P1-61 (저장소 전체 grep 미수행; 신규 결함 ID 부여 없음)

## 변경 범위

- `src/hosts/install.mjs`: 신규 Codex 설치 Skill에 영속 Goal 검색, 현재 소스 기반 Contract/DAG 리뷰, 사용자 확인 후 미승인 Workflow 준비, NEW_PROJECT Bootstrap 상태 조회, 실패/불확실성 후속 조치를 안내한다.
- `test/host.test.mjs`: 실제 설치되는 Skill 텍스트의 명령과 승인 경계, Claude Skill과의 범위 분리를 검증하는 회귀 테스트를 추가한다.
- 기존 사용자 설치물은 자동 변경하지 않는다. 인스톨러의 exclusive-create/검증 로직도 변경하지 않는다.
- 실행 중인 Host, 실제 모델 Turn, 승인, 비용, Lease, 작업 파일 및 Objective 수용 판정 경로는 변경하지 않는다.

## 검증 범위

- GitHub 연결에서 직전 기준선의 Windows `windows` 및 Linux `linux-alpha` CI 성공을 확인했다.
- 변경 텍스트의 기존 구문 앵커와 포함 관계를 정적으로 확인했다. 새 Node 24 회귀/설치 테스트는 이 환경에서 **NOT_RUN**이다.
- 로컬 컨테이너는 Node 22.16.0이고 전체 저장소 체크아웃·Node 24.14.1·Docker가 없어 신규 HEAD의 Windows/Linux CI가 별도 독립 검증을 담당한다.
- 이 검증은 문서 기반 Skill 탐색 UX이며 Codex Host Live 또는 독립적인 Objective E2E 수용 근거가 아니다.

## 결론

Codex 설치 Skill의 Goal/Bootstrap 상태 탐색과 계약 리뷰 진입 정보를 추가했다. 인증된 Operator 및 관리형 Codex Host 연결은 여전히 미구현이다. 신규 HEAD CI 완료 전 PASS를 주장하지 않는다.

## 다음 작업

Windows/Linux CI 확인 후 인증된 Operator→기존 Controller→Codex App Server의 운영 연결을 실제 승인된 환경에서 구현·검증한다.

## 미해소로 남긴 것

Node 24 전체 로컬 회귀, 실제 Host Live, 최종 독립 Objective E2E 수용, 기존 설치물 안전한 업그레이드 경로.
