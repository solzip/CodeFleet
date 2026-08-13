# 문서 색인

`docs/audits/`와 `docs/runs/`의 전 문서를 시간 역순으로 나열한다. 규약은 `docs/CONVENTIONS.md`, 결함 등재 현황은 `docs/REGISTER.md`.

작성 기준: 2026-08-13, 커밋 `e5fb188`. 전수 38개 문서.

**후속** 열의 의미 — `→ <문서>`: 그 문서로 이어졌다 / **`끊김`**: 결론은 났으나 이후 어떤 문서도 받지 않았다 / `상시`: 요약·색인 성격이라 후속 개념이 없다.

---

## 2026-08-13

| 날짜 | 문서 | 유형 | 결론(한 줄) | 후속 |
| --- | --- | --- | --- | --- |
| 08-13 | `runs/2026-08-13/banner-order-regression.md` | 수정 | 배너가 표보다 앞에 오는지·성공 시 안 나오는지 단언하는 테스트 2건. 일부러 깨뜨려 확인 | → Phase B |
| 08-13 | `runs/2026-08-13/p1-61-prevention.md` | 수정 | 실패 배너를 표 앞으로, CI 워크플로 추가(러너 동작 미검증), 규약에 종료 코드 규칙. 인용된 커밋 8개 실측 전부 초록 → 오염 구간 9개로 한정 | **끊김** (워크플로 첫 실행 미이행) |
| 08-13 | `runs/2026-08-13/p1-61-posttest-green.md` | 수정 | 최초 실패는 `3db7d64`(S4), 9개 커밋 동안 빨강. 원인은 주장 문구 오작성이고 규칙·코드는 옳았다. `npm test` exit=0 회복, 커버리지 불변. P1-61 [해소] | **끊김** (CI 부재 제안 미이행) |
| 08-13 | `runs/2026-08-13/p1-53-contract-delivery.md` | 수정 | 완주는 `run.ts` 경유였고 에이전트는 계약을 봤다. `codefleet prompt`를 고쳐 두 경로가 바이트 동일. P1-53 [해소]·P1 유지, P1-61 신규 | **끊김** (P1-61 후속 없음) |
| 08-13 | `runs/2026-08-13/conventions.md` | 결정 | 기록 규약을 확립하고 INDEX·REGISTER를 신설했다 | → `runs/2026-08-13/p1-53-contract-delivery.md` |
| 08-13 | `audits/2026-08-13/13-output-fidelity.md` | 감사 | P1-50 형태 전수 조사 — [거짓] 1건·[잠복 거짓] 1건, 신규 P1-53~P1-60 등재, P1-50을 P0 등급으로 재판정 | → `runs/2026-08-13/p1-53-contract-delivery.md` (P1-53만) |
| 08-13 | `audits/2026-08-13/12-waiver-conformance.md` | 감사 | 검증 게이트는 waiver로 통과하지 않았다. 성공 기준 4 [충족] 유지, 기준 3은 [조건부 충족]으로 정정. P1-50~P1-52 등재 | → `13-output-fidelity.md` |
| 08-13 | `runs/2026-08-13/first-full-loop.md` | 실행 | 파이프라인 첫 전체 완주. 최소 우회 4건, 성공 기준 4개 전부 [충족] 판정(기준 3은 이후 정정됨) | → `12-waiver-conformance.md` |

## 2026-08-12

| 날짜 | 문서 | 유형 | 결론(한 줄) | 후속 |
| --- | --- | --- | --- | --- |
| 08-12 | `audits/2026-08-12/SUMMARY.md` | 감사 | P0 11건 중 8건 해소·3건 부분해소·미해소 0. P0-12·P0-13 신규, P1-20~P1-41 등재 | 상시 |
| 08-12 | `audits/2026-08-12/15-new-module-review.md` | 감사 | 신규 모듈 3개 리뷰 | **끊김** |
| 08-12 | `audits/2026-08-12/14-guard-defence-audit.md` | 감사 | 게이트를 차례로 끄고 무엇이 알아채는지 계수 | **끊김** |
| 08-12 | `audits/2026-08-12/13-system-review.md` | 감사 | S7 시스템 전체 검토. P1-32 잔여 확인 | → `runs/2026-08-13/first-full-loop.md` (P1-32 잔여 재확인) |
| 08-12 | `audits/2026-08-12/12-orchestration-roadmap.md` | 결정 | S1~S7 슬라이스 로드맵. P1-27(S5-1)·P1-35(S6-3) 완료 표시 | → `runs/2026-08-13/first-full-loop.md` |
| 08-12 | `audits/2026-08-12/12-model-conformance-recheck.md` | 감사 | 확정 모델 대비 재검수. P0-14~P0-16, P1-42~P1-49 등재 | **끊김** |
| 08-12 | `audits/2026-08-12/11-model-conformance.md` | 감사 | 제품 정의 대비 적합성. P0-13 재판정(주석→정의), P1-36~P1-41 등재 | → `12-model-conformance-recheck.md` |
| 08-12 | `audits/2026-08-12/10-first-real-run.md` | 실행 | Spring Boot 프로젝트 첫 실사용. 차단 5건, P1-32~P1-35 등재 | → `12-orchestration-roadmap.md` |
| 08-12 | `audits/2026-08-12/09-registration-check.md` | 감사 | 등재 정합성 대조. **대상 커밋 해시 없음** | → `SUMMARY.md` |
| 08-12 | `audits/2026-08-12/04-platform-qualification.md` | 감사 | 플랫폼 한정 판정 (win32 전용 검증 항목 식별) | → `SUMMARY.md` |
| 08-12 | `audits/2026-08-12/03-slice-interactions.md` | 감사 | 슬라이스 간 상호작용 검증. P1-22·P1-23 등재 | → `SUMMARY.md` |
| 08-12 | `audits/2026-08-12/02-handoff-inventory.md` | 감사 | 인계·등재 항목 전수 수거. **대상 커밋 해시 없음** | → `09-registration-check.md` |
| 08-12 | `audits/2026-08-12/01-p0-verdicts.md` | 감사 | P0-1~P0-11 판정 (A 코드 / B 테스트 / C 반증 3단계) | → `SUMMARY.md` |

## 2026-08-11

| 날짜 | 문서 | 유형 | 결론(한 줄) | 후속 |
| --- | --- | --- | --- | --- |
| 08-11 | `audits/2026-08-11/fixes/stage3-4-failopen-and-surfacing.md` | 수정 | 큐 게이트 fail-open과 상한 표면화 (P0-9·P0-6 잔여) | → `audits/2026-08-12/01-p0-verdicts.md` |
| 08-11 | `audits/2026-08-11/fixes/stage2-process-boundaries.md` | 수정 | Harness 자식 프로세스 경계 (P0-10·P0-1 env·P0-6 상한) | → `audits/2026-08-12/01-p0-verdicts.md` |
| 08-11 | `audits/2026-08-11/fixes/stage2-precheck.md` | 감사 | 2단계 착수 전 1단계 재검증 | → `stage2-process-boundaries.md` |
| 08-11 | `audits/2026-08-11/fixes/stage1b-evidence-completeness.md` | 수정 | 폐기 실패 회귀 방어·신규 파일 증거 완전성 (게이트 4·P0-11) | → `stage2-precheck.md` |
| 08-11 | `audits/2026-08-11/fixes/stage1-isolation.md` | 수정 | 격리를 켜도 안전하게 (P0-7·P0-8·P0-4 잔여) | → `stage1b-evidence-completeness.md` |
| 08-11 | `audits/2026-08-11/SUMMARY.md` | 감사 | 2026-08-10 P0 6건의 해소 여부. waiver 불가 차단 [유지] 판정 | → `audits/2026-08-13/12-waiver-conformance.md` (모순 여부 재확인, 모순 없음) |
| 08-11 | `audits/2026-08-11/08-regression-and-coverage.md` | 감사 | 회귀 확인과 커버리지 주장 검증 | → `SUMMARY.md` |
| 08-11 | `audits/2026-08-11/07-new-defects.md` | 감사 | 신규 결함 P0-7~P0-11 | → `fixes/stage1-isolation.md` |
| 08-11 | `audits/2026-08-11/06-p0-6-limits.md` | 감사 | P0-6 타임아웃·출력 상한 [부분해소] | → `fixes/stage2-process-boundaries.md` |
| 08-11 | `audits/2026-08-11/05-p0-5-traceability.md` | 감사 | P0-5 taskRevision 추적 체인 [해소] | → `SUMMARY.md` |
| 08-11 | `audits/2026-08-11/04-p0-4-isolation.md` | 감사 | P0-4 실행 격리·롤백 [미해소] | → `fixes/stage1-isolation.md` |
| 08-11 | `audits/2026-08-11/03-p0-3-concurrency.md` | 감사 | P0-3 중복·동시 실행 [부분해소] | → `SUMMARY.md` |
| 08-11 | `audits/2026-08-11/02-p0-2-objective-queue.md` | 감사 | P0-2 Objective 큐 게이트 [부분해소] | → `audits/2026-08-12/11-model-conformance.md` (§C-1 재판정) |
| 08-11 | `audits/2026-08-11/01-p0-1-guardrails.md` | 감사 | P0-1 가드레일 강제 [미해소] | → `fixes/stage2-process-boundaries.md` |

## 2026-08-10

| 날짜 | 문서 | 유형 | 결론(한 줄) | 후속 |
| --- | --- | --- | --- | --- |
| 08-10 | `audits/2026-08-10/SUMMARY.md` | 감사 | 최초 아키텍처 점검. P0 6건·P1 19건 등재 | → `audits/2026-08-11/SUMMARY.md` |
| 08-10 | `audits/2026-08-10/06-failure-modes.md` | 감사 | 실패 모드 | → `SUMMARY.md` |
| 08-10 | `audits/2026-08-10/05-traceability.md` | 감사 | 추적성 검증 | → `SUMMARY.md` |
| 08-10 | `audits/2026-08-10/04-isolation-idempotency.md` | 감사 | 실행 격리와 멱등성 | → `SUMMARY.md` |
| 08-10 | `audits/2026-08-10/03-approval-flow.md` | 감사 | 승인의 단위와 시점 | → `SUMMARY.md` |
| 08-10 | `audits/2026-08-10/02-guardrails.md` | 감사 | 가드레일: 선언 vs 강제 | → `SUMMARY.md` |
| 08-10 | `audits/2026-08-10/01-verification-criteria.md` | 감사 | 검증 조건의 기계 판정 가능성 | → `SUMMARY.md` |

---

# 끊긴 것

결론은 났으나 이후 어떤 문서도 받지 않은 것들이다. 근거 없이 "해소됐을 것"으로 넘기지 않는다.

## A. 후속 문서가 없는 감사 3건

| 문서 | 무엇이 끊겼나 |
| --- | --- |
| `audits/2026-08-12/12-model-conformance-recheck.md` | **P0-14·P0-15·P0-16과 P1-42~P1-49를 등재한 문서인데, 이 8+3건을 언급한 후속 문서가 하나도 없다.** 이번 조사에서 확인한 미후속 등재의 최대 덩어리 |
| `audits/2026-08-12/14-guard-defence-audit.md` | 게이트를 차례로 끄고 무엇이 알아채는지 계수한 결과. 이후 참조 0건 |
| `audits/2026-08-12/15-new-module-review.md` | 신규 모듈 3개 코드 리뷰. 이후 참조 0건 |

## B. 등재됐지만 후속 작업이 확인되지 않은 결함

| 범위 | 건수 | 상태 |
| --- | --- | --- |
| P1-1 ~ P1-19 | 19건 | 2026-08-10·08-11 등재. 이후 개별 재판정 문서 없음. `2026-08-12/SUMMARY.md`가 P0의 잔여로 일부(P1-12·P1-15·P1-16·P1-17)를 언급할 뿐 |
| P1-20 ~ P1-41 | 22건 | 2026-08-12 등재. P1-27·P1-32·P1-35만 2026-08-13에 재확인됨. **나머지 19건 미후속** |
| P1-42 ~ P1-49 | 8건 | 2026-08-12 등재. **전건 미후속** |
| P0-14 ~ P0-16 | 3건 | 2026-08-12 등재. **전건 미후속** |

## C. 판정은 났으나 어디에도 반영되지 않은 것

| 판정 | 어디서 | 왜 끊겼나 |
| --- | --- | --- |
| 2026-08-13 감사 2건의 결론 | `12-waiver-conformance.md`, `13-output-fidelity.md` | **`docs/audits/2026-08-13/SUMMARY.md`가 없다.** 2026-08-12까지의 요약표는 이 판정들을 모른 채 남아 있다 |
| 성공 기준 3 → [조건부 충족] 정정 | `12-waiver-conformance.md` | 원 보고서(`first-full-loop.md`)는 규약대로 고치지 않았다. **정정 사실을 가리키는 색인이 없어서** 원 보고서만 읽으면 [충족]으로 읽힌다 (이 INDEX가 그 역할을 맡는다) |
| P1-50 → P0 등급 재판정 | `13-output-fidelity.md` | ID를 유지했으므로 **번호만 보면 P1로 보인다.** `REGISTER.md`가 등급 열을 따로 갖는 이유 |

## D. 메타데이터·파일명 이탈

| 항목 | 실제 |
| --- | --- |
| 대상 커밋 해시 없음 | `audits/2026-08-12/02-handoff-inventory.md`, `audits/2026-08-12/09-registration-check.md` — 어느 코드 상태에 대한 판정인지 확정 불가 |
| 번호 중복 | `audits/2026-08-12/`에 `12-`가 두 개 (`12-model-conformance-recheck.md`, `12-orchestration-roadmap.md`) |
| 번호 결번 | `audits/2026-08-12/`가 `04` 다음 `09`로 건너뜀. `05`~`08` 부재 사유 불명 |
| 일자별 연번 이탈 | `audits/2026-08-13/`이 `12-`, `13-`으로 시작. 규약상 `01-`부터여야 한다. **이미 상호 참조 중이므로 개명하지 않고 알려진 이탈로 둔다** |
| 미사용 ID | **P0-17** — P1-50 승급 시 ID를 유지했으므로 비어 있다 |

## E. 이번 조사에서 확인하지 않은 것

- `docs/session-handoff.md`와 `docs/design-progress.md`가 2026-08-13 작업을 반영하는지 **미확인**
- `audits/2026-08-11/SUMMARY.md` 상단 날짜가 `2026-08-10`으로 읽히는데, 선행 감사 참조인지 오기인지 **미확인**
- `docs/audits/2026-08-12/` 05~08 결번의 사유 **미확인**
