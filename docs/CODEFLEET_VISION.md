# CodeFleet — Product Vision & Principles

> 보존 자료: 이 문서는 2026-10-21 당시의 ChatGPT 프로젝트용 요약이다. 당시 본문과 수치를 보존하며 현재 구현·검증 상태를 대체하지 않는다. 현재 기준은 [제품 원칙](PRODUCT_VISION.md), [아키텍처](product-completion/architecture.md), [진행 현황](product-completion/progress.md), [로드맵](product-completion/roadmap.md)을 따른다.

**기준일:** 2026-10-21
**제품:** [solzip/CodeFleet](https://github.com/solzip/CodeFleet)
**원칙:** Autonomous Execution. Controlled Process. Verified Results.

## 1. 제품 정의

CodeFleet은 **기존 Codex CLI와 Claude Code 세션 내부에서 작동하는 Host-Native AI 개발 오케스트레이션 확장 도구**다. 기존 Host의 모델·인증·구독·세션·도구·Skill·Agent 기능을 우선 활용한다. CodeFleet은 목표와 작업 계약, Task·Workflow/DAG, 역할 분담과 협업, 정책·승인·상태·복구, 검증 및 완료 판정을 관리한다.

oh-my-codex(OMX), oh-my-claudecode(OMC)처럼 코딩 Host를 확장하되, **실행 통제와 독립적인 Evidence/Judge 기반 완료 판정**을 차별점으로 삼는다.

CodeFleet을 독립 AI 모델 서비스, 별도 API Key가 기본인 모델 호출 플랫폼, Docker 전용 실행 시스템으로 재정의하지 않는다.

## 2. 해결하려는 문제

- 복잡한 개발 목표를 실행 가능하고 검증 가능한 작업으로 분해하기 어렵다.
- 설계·구현·리뷰·테스트 간 의존 관계, 충돌 및 병렬 작업을 체계적으로 관리해야 한다.
- AI의 성공 주장만으로 테스트·품질·승인·완료를 판정하면 신뢰할 수 없다.
- 실패·중단·재시도·재개 시 작업 상태와 증거가 유실되거나 중복 수행될 수 있다.
- 신규 프로젝트 Bootstrap과 기존 프로젝트 개선을 모두 자연어 목표에서 시작할 수 있어야 한다.

## 3. 목표 사용자 경험

1. 사용자가 Codex에서 `$codefleet`, Claude Code에서 `/codefleet`으로 개발 목표를 전달한다.
2. Host AI가 기존 세션 안에서 목표를 해석하고 불명확한 요구사항을 구체화한다.
3. CodeFleet이 Task Draft, Validator, Workflow/DAG로 범위·의존성·완료 기준을 구조화한다.
4. 기본은 단일 Agent이며, 필요하고 지원되는 경우 Planner·Architect·Executor·Reviewer 등이 역할을 분담한다.
5. CodeFleet이 WorkItem별 권한·Capability·승인·상태·예산을 검사한다.
6. 승인된 범위에서 구현·테스트·리뷰 및 오류 수정이 진행된다.
7. 실제 검증 Backend의 관측 증거를 통해 Judge가 완료 여부를 판정한다.
8. 사용자에게 결과, 미해결 위험, 미실행 검증과 필요한 후속 결정을 명시한다.

이는 **목표 경험**이며, 단계별 실제 구현·Live 검증 수준은 별도 상태 문서에서 판정한다.

## 4. 불변 원칙

- **Host-Native 우선:** Host 기존 모델·인증·세션을 이용하며 직접 API 호출은 기본 경로가 아니다.
- **작업 계약 우선:** AI가 제안한 Draft는 실행 승인이나 작업 완료가 아니다.
- **독립 검증:** AI 보고/Host 이벤트, Local 검사, Protected Harness 증거를 명확히 구분한다.
- **Docker 선택형:** 계획·분석·DAG·조회에 Docker를 요구하지 않는다. 기존 보호된 Container Backend는 유지한다.
- **위험 기반 통제:** 승인·Capability가 부족한 작업만 차단하며 독립된 안전한 작업은 진행 가능해야 한다.
- **정직한 상태:** 미지원·미실행·실패를 통과로 표시하지 않는다. 강한 격리와 독립성을 증명하지 못한 실행은 해당 보장을 주장하지 않는다.
- **재사용·호환성:** Legacy, Alpha, Host-Native 구현 및 역사적 실행 증거를 최대한 보존한다. 불필요한 신규 엔진·추상화는 추가하지 않는다.
- **사용성:** Git 초기화·설치·Skill 발견 등 실제 사용에 필요한 진입 경로가 명확해야 한다. 실험적 격리 조건을 모든 일반 기능의 공통 설치 요건으로 만들지 않는다.

## 5. 제품 완성 기준

Codex와 Claude Code 각각에서 Skill의 실제 사용, 자연어 목표 → Draft → Validator → DAG, 승인된 구현, 역할별 협업, 테스트·리뷰·수정, 중단·재개, Evidence/Judge 판정, 신규 프로젝트 Bootstrap, 공개 가능한 실전 개발 사례를 실제로 검증해야 한다. **오프라인 테스트와 GitHub CI 통과만으로 제품 완성을 선언하지 않는다.**

## 6. 자료 우선순위

현재 공식 코드·계약은 GitHub `main`이 기준이다. 이 문서는 제품 방향의 요약이며, 세부 구현 상태는 `CODEFLEET_STATUS.md`, 설계 경계는 `CODEFLEET_ARCHITECTURE.md`, 후속 작업은 `CODEFLEET_ROADMAP.md`에서 확인한다.
