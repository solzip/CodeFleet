# CodeFleet — Architecture Overview

> 보존 자료: 이 문서는 2026-10-21 당시의 ChatGPT 프로젝트용 요약이다. 당시 본문과 수치를 보존하며 현재 구현·검증 상태를 대체하지 않는다. 현재 기준은 [제품 원칙](../PRODUCT_VISION.md), [아키텍처](architecture.md), [진행 현황](progress.md), [로드맵](roadmap.md)을 따른다.

**기준일:** 2026-10-21
**기준:** GitHub `main` README, Host Core 가이드, 아키텍처 문서 및 사용자 실행 보고.

## 1. Host-Native 구조

```text
사용자 개발 목표
   │
   ▼
Codex CLI ($codefleet) / Claude Code (/codefleet)
   │   ├─ Host 기존 모델·인증·세션·도구
   │   └─ 프로젝트별 CodeFleet Skill / Host Adapter
   ▼
CodeFleet Intent · Task Draft · Contract Validator
   ▼
Workflow / DAG · 역할 · 의존성 · WorkItem
   ▼
Policy · Capability · 승인 · 예산 · 상태/Lease
   │
   ├─ 안전한 계획·조회: Docker 없이 수행
   ├─ 명시적으로 허용된 Local 작업
   ├─ Host Sandbox: 현재 미검증/비활성
   └─ Container Backend: 선택적 보호 검증
   ▼
Evidence (권한·Backend·해시·관측 수준)
   ▼
Judge → 검증된 상태 / 차단 / 수정 / 사람 개입
```

이 도식은 목표 흐름이며 **모든 화살표가 실제 Host Live에서 통과됐다는 뜻은 아니다**. 특히 공개 Host 실행 경로와 보호된 실행 경로에는 별도 준비·승인 조건이 있다.

## 2. 책임 경계

| 주체 | 소유·책임 | CodeFleet이 오인하면 안 되는 것 |
| --- | --- | --- |
| Codex / Claude Code Host | 로그인, 모델, 대화 세션, 제공 도구, 호스트 Agent | Host의 보고를 독립 검증 증거로 자동 승격 |
| CodeFleet | Intent, Task/Contract, DAG, 정책·승인, 상태, 역할 조정, Evidence/Judge | 제안 = 실행 승인; 작업 종료 = 업무 완료 |
| Local Verifier | 허용된 명령의 실제 실행 결과 | 격리된 보호 검증 또는 증거 변조 방지 |
| Container Verifier | 기존 Alpha의 Docker 보호 검증 | 모든 OS/Host에 동일한 보호 보장 |
| Operator / Protected Harness | 권한 부여와 검증 실행의 보호 경계 | 제품 전반의 기본 설치 요건 |

## 3. 실행 계약

- **PROPOSAL_ONLY:** 실제 무도구 정책이 집행되는 제안 경로. 제안의 유효성만 확인하며 작업 완료 증거가 아니다.
- **HOST_OBSERVED:** 기존 Host 도구 사용에 기반한 탐색·계획 경로. 실제 Host 권한을 준수하고 도구/파일/네트워크 관측의 한계를 명시한다. 일반 Host-Native 전체에 무도구 조건을 적용하지 않는다.
- **CONTROLLED_EXECUTION:** CodeFleet Coordinator/Operator/Harness가 작업 계약·Capability·승인/Lease를 확인하여 실행하는 보호 경로. 독립 Evidence/Judge 조건을 유지한다.

모드 변경은 계약 Revision과 권한 검토 대상이며 기존 승인을 자동 재사용하지 않는다.

## 4. 핵심 데이터/제어 흐름

- **Intent/Task Draft:** 원본 사용자 목표, 저장소 기준선, 범위, 파일·테스트 근거 또는 계획 근거, 위험, 미확정 조건.
- **G3 Validator:** 기존 프로젝트에서 실제 파일·라인·인용·테스트 참조와 Revision/Base 등을 검사. 존재하지 않는 신규 파일을 기존 코드 근거처럼 위조하면 안 된다.
- **G4 Workflow/DAG:** WorkItem ID, 의존성, 실행 가능성, 역할, 수락 기준을 표현. Draft 유효성은 실행 권한이 아니다.
- **Hybrid Scheduler:** 기본 단일 Agent, 적격한 독립 WorkItem의 제한 병렬 실행과 충돌/순서/통합 제어. 실제 Host 자동 위임은 별도 검증 필요.
- **상태와 복구:** SQLite 등 내구성 있는 상태, Attempt, Lease/Fencing, Cancellation, 재시도/재개, 변경 후보·계약 해시.
- **승인:** 위험 작업, 외부 변경, Git 조작 등은 명시적 범위·Identity/Capability에 따른 별도 승인.

## 5. 검증 Backend별 신뢰 수준

| 검증 경로 | 얻는 증거 | 한계 |
| --- | --- | --- |
| Host 보고 | Host의 분석·작업 설명·도구 이벤트 | 보호된 독립 Harness 증거가 아님 |
| Local Verification | 동일 환경의 명령·종료 코드·출력·대상 해시 | 사용자 권한의 변조·외부 부작용 격리 불보장 |
| Host Sandbox | 실제 집행된 파일·프로세스·네트워크 정책 증거 | 지원 Host/OS/도구별 적격성 확인 전에는 주장 불가 |
| Container Verification | 기존 Alpha의 보호된 입력·고정 이미지·제한 실행·Harness 관측 | Docker 선택적 필요, 전면적인 Host 방어 보증 아님 |

`LOCAL_EXECUTED`나 Host 주장만으로 기존 `HARNESS_EXECUTED`, Protected `VERIFIED`를 부여하지 않는다. Docker 부재 시 계획을 막지 않되 **해당 보호 검증 게이트**는 미충족으로 남긴다.

## 6. 신규 프로젝트 Bootstrap의 구조적 과제

기존 프로젝트용 Validator는 실제 Git HEAD, 코드·테스트 References에 결합되어 있다. 빈 프로젝트에서는 Git HEAD나 기존 파일이 없을 수 있다. **계획된 파일**을 **이미 존재하는 파일 근거**와 혼동하지 않는 신규 프로젝트 계약이 필요하다.

권장 설계 방향(아직 구현 확정 아님): `NEW_PROJECT`의 요구사항 근거 기반 초안/수락 기준/초기 DAG를 검증하고, 승인된 Bootstrap 후 실제 코드·테스트와 Git 기준선이 생기면 기존 `EXISTING_REPOSITORY` 검증으로 전환한다. 초기화·의존성 설치·Commit에는 각각 범위에 맞는 승인 정책을 적용한다. Git의 dubious-ownership 검사는 별도 환경 문제로 처리한다.

## 7. 참고 경로

- [README](https://github.com/solzip/CodeFleet/blob/main/README.md)
- [Host Core Guide](https://github.com/solzip/CodeFleet/blob/main/docs/product-completion/host-core-guide.md)
- [Host-Native Guide](https://github.com/solzip/CodeFleet/blob/main/docs/product-completion/host-native-guide.md)
- [Architecture](https://github.com/solzip/CodeFleet/blob/main/docs/product-completion/architecture.md)
- [Workflow CI](https://github.com/solzip/CodeFleet/blob/main/.github/workflows/alpha.yml)
