# CodeFleet 크리티컬 검토 (by Claude Code)

`docs/review-claude.md`(전체 22개 finding)에서 **크리티컬한 것만** 추린 실행용 문서다.
대상: `docs/concept-foundation.md`. 설계 진행 중 기준이라, 아래는 "결함 고발"이 아니라 **지금 닫아야 할 설계 결정**으로 읽는다.

크리티컬 판정 기준 (둘 중 하나):
```text
A. 핵심 모델이 개념적으로 안 닫힌다.
B. §0.13에서 '고정(PASS)'으로 선언한 영역 안의 자기모순이다.
   → 고정된 바닥에 금이 있으면 그 위에 쌓는 설계가 같이 휜다. 지금 고치면 싸다.
```
심각도: 🔴 모델이 안 닫힘 · 🟠 고정 영역 자기모순

## 한눈에

| ID | 한 줄 | 위치 | 심각도 |
|----|------|------|--------|
| F6 | VERIFIED 출처가 없어 SEQUENCE가 Task 1에서 멈춤 | §0.7 ↔ §15 review 미정 | 🔴 |
| F19 | "rebuild over patch"의 입력(Run Trace)이 일회성 runs/에 있음 | §0.2/§6.1 ↔ §10 | 🔴 |
| F7 | Objective BLOCKED을 진입할 ledger event가 없음 | §0.3 ↔ §6.1 | 🟠 |
| F10 | 승인/revision 이벤트의 ledger 위치 + ledger 간 정합성 미정 | §0.2 ↔ §6.1/§6.2 | 🟠 |
| F20 | "deterministic risk"인데 비결정적 LLM signal이 입력 | §0.8 ↔ §0.12 | 🟠 |

---

## A. 핵심 모델이 안 닫히는 것 🔴

### F6 — VERIFIED를 만들 방법이 없어 SEQUENCE가 Task 1에서 멈춘다
- 위치: §0.7 Run-derived (다음 item이 NEXT 되려면 이전 item VERIFIED; DONE만으론 멈춤) ↔ §15 review 모델(미정)
- 문제: VERIFIED는 "사람이 결과를 받아들인 review record"에서 계산되는데, 그 review record의 schema·생성 흐름이 통째로 미정.
- 왜 크리티컬: 헤드라인 기능(carry-forward·연속성)이 VERIFIED에 의존하는데 출처가 없다 → **차별점이 현재 모델로는 닫히지 않는다.**

### F19 — "rebuild over patch"의 입력이 휘발하는 곳에 있다
- 위치: §0.2 rebuild 원칙 + §6.1 "snapshot은 ledger/task/run에서 재생성 가능" ↔ §10 "Run Trace는 기본 git 미포함(일회성)"
- 문제: derived state(DONE/VERIFIED)는 Run Trace를 읽어 계산하는데, 그 Run Trace가 사는 runs/는 git 제외·일회성 취급. 지우거나 머신을 옮기면 rebuild가 복원 못 함 → REFERENCE_INTEGRITY corruption.
- 왜 크리티컬: 핵심 안전 원칙(전체 재생성)이 정작 그 입력을 *없어질 수 있는 곳*에 둔다. 바닥 가정의 모순.

---

## B. "고정(PASS)" 영역 안의 자기모순 🟠

### F7 — Objective BLOCKED을 진입할 ledger event가 없다
- 위치: §0.3 Objective State (OPEN↔BLOCKED 전이 정의) ↔ §6.1 ledger Objective events = CREATED/UPDATED/CLOSED/REOPENED/CANCELED
- 문제: 선언된 상태(BLOCKED)인데 진입·해제할 OBJECTIVE_BLOCKED / OBJECTIVE_UNBLOCKED 이벤트가 ledger 세트에 없다.
- 왜 크리티컬: "상태 변경 = event transition" 원칙과 직접 충돌. 상태 도메인과 ledger가 어긋남.

### F10 — 승인/revision 이벤트의 ledger 위치 + ledger 간 정합성 규칙이 없다
- 위치: §0.2 mutationId 예시(TASK_APPROVED) ↔ §6.1 세트(승인 이벤트 없음), §6.2 draft-ledger.jsonl
- 문제: Draft→Revision 승인이 어느 ledger에 기록되는지 불명. 게다가 ledger가 2종(objective/draft)인데 seq 연속성·mutationId 멱등·cross-validate가 어느 쪽에 적용되는지 미정.
- 왜 크리티컬: Task 생명주기의 승인은 추적 체계의 중심. 여기가 비면 "사람이 승인한 것만 위임"의 증거 사슬이 끊긴다.

### F20 — "deterministic risk"인데 비결정적 LLM signal이 입력이다
- 위치: §0.8 computedRisk = max(…, LLM-proposed riskSignals, …) ↔ §0.12 "same inputs → same risk"
- 문제: LLM 출력은 비결정적인데 그게 max()의 입력. 재draft하면 signal이 달라져 risk가 흔들린다.
- 왜 크리티컬: 문서가 스스로 박은 결정성 기준을 자기 입력이 깬다. (해소: "LLM signal은 기록 시점에 그 Draft/Run의 입력으로 동결" 한 줄 명시)

---

## 핵심 — 레버리지 큰 단일 결정

```text
F6 · F19 · F10 은 사실상 한 클러스터다:
  "최종 review / VERIFIED 결과를 어디에 둘 것인가."

→ 이걸 objective ledger의 '결정 이벤트'로 두면 한 번에 닫힌다:
   - F6  VERIFIED의 출처가 생김 (review 결정 이벤트에서 계산)
   - F19 증거가 휘발하는 runs/가 아니라 append-only ledger에 고정됨
   - F10 승인/review 결정이 objective ledger에 일관되게 기록됨

= 지금 설계에서 가장 레버리지 큰 단일 결정.
```

F7과 F20은 독립적인 작은 패치다:
```text
F7  → OBJECTIVE_BLOCKED / OBJECTIVE_UNBLOCKED 이벤트를 ledger 세트에 추가
F20 → "LLM riskSignal은 한 번 기록되면 해당 Draft/Run의 입력으로 동결" 명시
```

## 다음 단계 후보
```text
1. review/VERIFIED 클러스터(F6+F19+F10)를 설계 결정으로 확정
   → review record를 ledger 결정 이벤트로 둘 때의 전이·필드·VERIFIED 계산식 설계
   → concept-foundation.md에 FINAL RULE로 반영 (§0.12 형식)
2. F7 / F20 패치 반영
```

---

전체 finding과 4개 렌즈(시뮬레이션·정합성·scope·근본가정) 분석은 `docs/review-claude.md` 참조.
tier-2(F8 CARRY_FORWARD_REJECTED 누락, F9 OBJECTIVE_UPDATED 미정의, F13 revision bump 시 queue item 처리 모호)도 거기 있음.
