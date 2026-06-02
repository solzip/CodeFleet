# CodeFleet 심층 검토 (by Claude Code)

대상: `docs/concept-foundation.md`, `docs/final-model-architecture.md`
방식: 4개 렌즈 — (1) end-to-end 시뮬레이션 (2) 상태 모델 정합성 audit (3) 경계/scope creep (4) 근본 가정 의심
표기 심각도: 🔴 목표 루프를 막음 · 🟠 정합성 구멍 · 🟡 무겁거나 모호

이 문서는 검토 결과다. FINAL RULE의 source of truth는 `concept-foundation.md`다.

---

## 렌즈 1 — end-to-end 시뮬레이션

시나리오: 문서 자체 예시인 "회원가입/로그인 에러 응답 통일"(SEQUENCE Objective)에서 Task 하나를 Intent→Close까지 통과시킨다. 각 단계를 지배하는 규칙과 멈추는 지점을 본다.

```text
Intent → Objective 선택 → Draft → ◆Approval → Revision → Run Planning
       → ║Execution → Trace → ◆Review/Close → carry-forward → 다음 Task
```

### F1 — 연속성 제안의 생성 근거가 없다  [sim] 🟠
- 위치: §1 "LLM decides nothing about continuity" vs §6.1 proposed relation 예시(confidence 0.82)
- 문제: proposed objective relation과 confidence 점수를 누가 무슨 근거로 만드는지 정의 없음. LLM이 제안(허용)은 맞지만 confidence 숫자의 산출 기준이 비어 있다.
- 영향: 첫 단계(Objective 연결 제안)부터 "어떻게 만드나"가 미정.

### F2 — 첫 실제 동작(discovery)에서 막힌다  [sim] 🔴
- 위치: §8.1 discoveryBudget + §15 "Draft Harness discovery budget 기본값"(미정)
- 문제: bounded discovery는 budget(maxFilesRead 등)에 의존하는데 그 기본값이 NOT_FINAL. 숫자가 없으면 discovery를 시작할 수 없다.
- 영향: Intent→Draft의 첫 실제 동작이 실행 불가.

### F3 — Drafter 출력 계약이 없어 Draft를 못 만든다  [sim] 🔴
- 위치: §8.1 "AI Task Drafter에게 위임", §6.2 Task Spec 1차 필드
- 문제: drafter의 입력→출력 schema 미정. scope/guardrails/verification 필드 모양이 DESIGN CANDIDATE(§5.3)라 검증 가능한 Draft를 생성·검사할 수 없다.
- 영향: "Task를 계약으로 정의"(목표 2단계)가 기계적으로 성립 안 함. (우회: 사람이 수동 YAML)

### F4 — Run Planning에서 risk를 계산할 수 없다  [sim] 🔴
- 위치: §0.8 computedRisk = max(Project Profile rule matches, …), §5.3 risk policy schema(DESIGN CANDIDATE)
- 문제: risk는 Project Profile risk rule을 match해 계산하는데 그 rule schema가 미정. match할 규칙이 없으면 baseRisk(LOW)만 나온다.
- 영향: gate 결정의 입력인 risk가 사실상 항상 LOW로 떨어짐 → 안전 게이팅이 무력.

### F5 — 위임 지점(Adapter)이 통째로 비었다  [sim] 🔴 ★
- 위치: §8.2 Execution Harness "Agent Adapter 호출", §8.0 "agent adapter별 호출 프로토콜"(DESIGN CANDIDATE)
- 문제: approved Revision을 외부 AI 도구에 넘기고 출력을 회수하는 프로토콜이 없음. 목표 3단계("AI 에이전트에게 위임")가 물리적으로 일어나는 유일한 지점.
- 영향: 여기서 루프가 멈춘다. **전체에서 제일 큰 빈칸.**

### F6 — SEQUENCE가 Task 1에서 더 못 나간다 (핵심 발견)  [sim] 🔴 ★
- 위치: §0.7 Run-derived State, §6.1 cursor 정책, §15 "Review 모델"(미정)
- 문제: SEQUENCE에서 다음 item이 NEXT가 되려면 이전 item이 **VERIFIED**여야 한다(§0.7 "previous item VERIFIED → next NEXT"; DONE만으로는 멈춤). 그런데 VERIFIED는 "사람이 결과를 받아들인 review record"에서 계산되고, 그 **review record의 실체(schema·생성 흐름)가 통째로 미정**(S4).
- 영향: **연속성(carry-forward·SEQUENCE)은 이 문서의 차별점인데, VERIFIED를 만들 방법이 없어 Task 1→2로 진행이 불가능하다.** 시뮬레이션의 가장 날카로운 결론.

> 시뮬레이션 종합: 루프는 F2(discovery)·F3(drafter)·F4(risk)·F5(adapter)·F6(review)에서 끊긴다. 특히 F6 때문에 **헤드라인 기능(SEQUENCE 연속성)이 현재 모델로는 닫히지 않는다.**

---

## 렌즈 2 — 상태 모델 정합성 audit

7개 상태 도메인 + ledger event 최소 세트 + cross-file 참조를 훑었다.

### F7 — Objective BLOCKED을 표현할 ledger event가 없다 (신규·강함)  [state] 🟠
- 위치: §0.3 Objective State(OPEN↔BLOCKED 전이 정의) vs §6.1 ledger Objective events = CREATED/UPDATED/CLOSED/REOPENED/CANCELED
- 문제: Objective State machine엔 BLOCKED와 OPEN↔BLOCKED 전이가 있는데, **OBJECTIVE_BLOCKED / OBJECTIVE_UNBLOCKED 이벤트가 ledger 최소 세트에 없다.** OBJECTIVE_UPDATED가 대신하는지도 불명(F9). "상태 변경은 event transition"(§Mutation Engine) 원칙과 직접 충돌.
- 영향: Objective를 BLOCKED로 바꾸는 합법 경로가 없음. 상태 도메인과 ledger가 어긋남.

### F8 — CARRY_FORWARD_REJECTED가 ledger 세트에 빠짐  [state] 🟠
- 위치: §0.9(REJECTED 이벤트 발생 조건 상세) vs §6.1 Context events = PROPOSED/ATTACHED/REVOKED/EXPIRED
- 문제: §0.9는 CARRY_FORWARD_REJECTED를 기록 이벤트로 규정하는데 최소 세트엔 없음.

### F9 — OBJECTIVE_UPDATED가 정의 없이 존재  [state] 🟠
- 위치: §6.1 ledger 세트
- 문제: 무엇을 update하는지 본문 어디에도 없음. immutable/rebuild 기조에서 Objective의 가변 필드가 불명. F7의 BLOCKED를 흡수하는 용도인지도 미정.

### F10 — Draft→Revision 승인 이벤트의 ledger 위치 불명  [state] 🟠
- 위치: §0.2 mutationId 예시(TASK_APPROVED) vs §6.1 세트(approval 이벤트 없음), §6.2 draft-ledger.jsonl
- 문제: revision 생성/승인 이벤트가 objective ledger엔 없음. draft-ledger 소관으로 보이나 명시 없음. 게다가 ledger가 2종(objective/draft)인데 seq 연속성·mutationId 멱등 규칙이 어느 ledger에 적용되는지 scope가 안 정해짐.

### F11 — accepted vs approved가 risk에 안 묶임  [state] 🟠
- 위치: §0.5(의미는 "저위험→accept, 위험→approve"), 실행 조건 §0.5(단지 "accepted 또는 approved")
- 문제: 고위험 relation을 accepted로 처리하는 걸 막는 FINAL RULE이 없음. 둘의 audit 구분이 강제되지 않아 장식이 됨.

### F12 — FAILED queue item의 mutation 가부 미정  [state] 🟡
- 위치: §0.4 금지 규칙(ACTIVE/DONE/VERIFIED만 skip/cancel/reorder 금지)
- 문제: run-derived FAILED 상태일 때 skip/cancel/reorder 가능 여부 언급 없음.

### F13 — revision bump 시 새 queue item인지 재사용인지 모호  [state] 🟠
- 위치: §6.1 "Task revision이 바뀌면 기존 approval과 queue relation은 무효화되거나 새 item으로 기록된다"
- 문제: "무효화되거나 새 item"의 택일이 안 정해짐. Run-derived 계산 단위가 objectiveQueueItemId+taskId+taskRevision인데, 같은 item을 재사용하면 이전 revision run과 단위가 섞일 위험.

### F14 — severity의 제한 순서가 명시 안 됨  [state] 🟡
- 위치: §0.11 capability gating "most restrictive wins" vs severity 값 INFO/WARNING/REBUILD_REQUIRED/CORRUPTION
- 문제: risk/mode는 순서를 명시하는데 severity 4값의 제한 순서는 글로 안 박힘. "most restrictive" 판정이 암묵 순서에 의존.

### F15 — START/CONTINUATION relation의 역할이 비어 있음  [state] 🟡
- 위치: queue item `relation`(START/CONTINUATION) — §6.1 예시·이벤트
- 문제: relationState(proposed/…)와 이름이 겹치고, START vs CONTINUATION이 *무슨 규칙을 바꾸는지* 사용하는 곳이 없음. 사실상 미사용 필드 가능성.

---

## 렌즈 3 — 경계 / scope creep

각 서브시스템이 0.1 목표("Objective→Task 구조화 / 계약 정의 / 승인 위임 / 결과 추적")의 **내부 구조**인지 **범위 확장**인지 판정.

### F16 — Corruption/Repair 엔진이 가장 강한 scope-creep 후보  [scope] 🟡 ★
- 위치: §0.10–0.11 (10-category taxonomy, RepairKind/Mode, severity→capability gating, CorruptionMarker)
- 판정: 목표 문장은 self-healing·corruption 진단을 요구하지 않는다. "추적"은 "validate가 불일치를 발견→사람에게 알림→수동 수정"이면 충족된다. 그런데 문서는 **결정론적 corruption 분류 + severity별 capability 차단 매트릭스**라는, 사실상 별도 제품(상태 검증 엔진)을 얹었고 분량의 큰 비중을 차지한다.
- 비대칭: §0.2는 Mutation Engine을 "목표 확장 아님, 내부 구조"라고 *방어*하는데, 같은 잣대를 corruption 엔진엔 적용하지 않는다. 쉬운 케이스만 self-justify.
- 권고: corruption/repair/capability-gating을 "robustness layer (post-goal)"로 명시 분리. 목표 루프 닫는 데 불필요.

### F17 — Project Profile의 workspace 모델링이 목표보다 넓다  [scope] 🟡
- 위치: §5.1.1 components / monorepo / multirepo / sharedPaths / relatedPaths
- 판정: 목표가 필요로 하는 건 "AI가 어디를 건드려도 되나"(files/commands policy)지, component ontology가 아니다. 컴포넌트 분류·모노/멀티레포 모델은 프로젝트 구조 모델링 쪽으로 약하게 새는 축.

### F18 — 내부 구조로 정당한 것 (creep 아님)  [scope] ✅
- Mutation Engine / ledger / rebuild, Policy merge(More restrictive wins), Risk(가드레일 일부), Carry-forward(연속성)는 목표 직결. 단 전부 "무겁다"는 별개 이슈(렌즈 4).

> 경계 종합: 목표를 직접 넓히는 노골적 creep은 적다. 다만 **corruption 엔진(F16)** 이 "범용 검증 플랫폼"으로 새는 가장 큰 무게이고, 문서가 그것만 self-scrutiny에서 빠뜨렸다.

---

## 렌즈 4 — 근본 가정 의심

아키텍처 바닥 선택을 의심한다.

### F19 — "rebuild over patch" vs "runs/는 git 제외·일회성"의 충돌 (신규·강함)  [assumption] 🔴 ★
- 위치: §0.2 rebuild 원칙 + §6.1 "snapshot은 ledger/task/run에서 재생성 가능" vs §10 "Run Trace는 기본 git 미포함"
- 문제: derived state(DONE/VERIFIED)는 **Run Trace를 읽어 계산**한다. 그런데 Run Trace가 사는 `runs/`는 git 제외·"실행 산출물"로 사실상 일회성 취급. 사용자가 runs/를 지우거나 다른 머신으로 옮기면 **rebuild가 derived state를 복원 못 하고 REFERENCE_INTEGRITY corruption**이 된다.
- 의미: "전체 재생성 가능"이라는 핵심 안전 원칙이, 정작 그 입력(증거)을 *없어질 수 있는 곳*에 둔다. 근본 긴장.
- 함의: derived state의 권위 입력을 ledger 쪽에 일부 고정하든지(예: 최종 review 결과를 objective ledger에 결정 이벤트로), runs/를 일회성으로 다루지 않든지 택해야 한다.

### F20 — "deterministic risk" vs "LLM-proposed riskSignal 입력"의 모순  [assumption] 🟠
- 위치: §0.8 computedRisk = max(…, LLM-proposed riskSignals, …) + §0.12 "same inputs → same risk"
- 문제: LLM 출력은 비결정적인데 그게 max()의 입력. "같은 입력→같은 risk" 결정성은 LLM signal을 *고정 기록값으로 동결*했을 때만 성립. 재draft하면 signal이 달라져 risk가 흔들림.
- 함의: "LLM signal은 한번 기록되면 그 Run/Draft의 입력으로 동결"이라고 못박아야 결정성 주장이 산다.

### F21 — 모델은 blast radius는 묶지만 scope 정확성은 보장 못 함  [assumption] 🟡
- 위치: §1 "LLM decides nothing" + §8.1 Draft Harness가 scope/guardrail을 LLM으로 생성
- 문제: 가장 중요한 산출물(Task 계약의 scope/guardrails)은 결국 LLM이 만들고 사람이 승인한다. 정책 비완화는 기계가 보장(좋음)하지만, **scope 자체가 틀렸는지(너무 좁/넓음)** 는 보장 못 함. "정책 안"은 보장, "의도에 맞음"은 사람 리뷰 품질에 전적으로 의존.
- 함의: 솔직히 명시할 것 — CodeFleet은 *사고 범위(정책)*를 묶지 *scope 정확성*을 묶지 않는다. 안전 모델의 경계.

### F22 — 두 ledger의 inter-consistency 규칙이 없다  [assumption] 🟠
- 위치: objective ledger.jsonl + draft-ledger.jsonl + task.json (§6.2)
- 문제: 각 파일 내부의 single-SoT 규율은 강한데, **ledger 간** 관계(누가 revision 생성을 소유하고, objective ledger가 참조하는 taskRevision이 draft-ledger 결과와 일치하는지 검증하는 rule)가 비어 있음. F10과 연결.

---

## 종합 — 목표를 실제로 막는 Top 5

```text
1. F5  Adapter 호출 프로토콜 없음         (위임이 물리적으로 불가)
2. F6  VERIFIED 생성 불가 → SEQUENCE 멈춤  (헤드라인 기능이 안 닫힘)
3. F19 rebuild vs 일회성 runs/ 충돌        (핵심 안전 원칙의 입력이 휘발)
4. F3/F4 drafter 출력·risk rule schema 없음 (계약 정의·위험 계산 불가)
5. F2  discovery budget 기본값 없음        (첫 동작부터 막힘)
```

## 교차 렌즈 패턴

```text
- 잘 정의된 곳 = 상태/계약/정책 (referee).  비어있는 곳 = 실행 경계 (players & ball).
  → 4개 렌즈가 전부 같은 결론으로 수렴. 앞선 spine/structure 진단과 일치.
- 문서가 self-justify한 무게(Mutation Engine)는 정당하나, self-justify를 빠뜨린 무게
  (corruption 엔진, F16)가 진짜 scope 리스크.
- 안전 모델의 정직한 한계(F21): 정책은 묶지만 scope 정확성·LLM 비결정성(F20)·
  증거 휘발성(F19)은 아직 안 닫힘.
```

## 권고 (검토 결과 기준, 우선순위)

```text
1. F6+F19를 한 묶음으로 결정: "최종 review 결과를 objective ledger 결정 이벤트로 남기고,
   VERIFIED는 거기서 계산" → S4 빈칸과 증거 휘발 문제를 동시에 닫는다.
2. F5 Adapter 프로토콜 1종 확정 (목표에 가장 가까운 단일 작업).
3. F7/F9/F10 ledger 세트 보강: OBJECTIVE_BLOCKED/UNBLOCKED 추가, OBJECTIVE_UPDATED 정의,
   approval 이벤트 ledger 위치·inter-ledger validate 규칙 명시.
4. F16 corruption 엔진을 "post-goal robustness layer"로 명시 강등.
5. F3/F4 Task Spec·risk rule 최소 schema 확정 (S1 우회 가능하게).
```

---

## 검토 커버리지 한계 (검토하지 못한 부분)

이 검토가 **보증하지 못하는 범위**다. "모순 없음 ≠ 검증됨"을 분명히 하기 위해 남긴다.

### 1. 아예 안 읽은 것
```text
- session-handoff.md   ← 문서 스스로 "진행상태/다음 논의 항목을 여기 갱신"이라 함.
                          내가 '구멍'이라 한 게 여기 '다음 항목'으로 이미 올라가 있을 수 있음.
- architecture.md      ← 현재 구현 구조 참고용. 안 봄.
- v0.1 CLI 코드        ← 안 봄. '문서 vs 실제 구현' 일치는 전혀 검증 못 함.
- README               ← 사용자용 설명. 안 봄.
```
→ 나는 concept-foundation.md + final-model-architecture.md **2개 스냅샷**만 봤다.

### 2. 읽었지만 얕게 본 섹션
```text
- §5.1.3 / §5.2 FINAL RULE 블록들 (PROFILE_*, TASK_REVISION_*, EFFECTIVE_*, RUN_PLAN_*)
  → precondition↔condition↔evidence 맞물림, condition의 deterministic 여부를 줄별로 audit 안 함.
- §0.11 capability gating 매트릭스 → 모든 capability가 모든 severity에서 분류됐는지 완전성 안 따짐.
- §0.11 category taxonomy → 다른 곳 checkId가 전부 10개 category에 매핑되는지 cross-check 안 함.
- §5.1.3 defaults → 가볍게만.
```

### 3. 방법이 구조적으로 못 잡는 것
```text
- 열거의 '완전성'    : 모순은 잡지만 "이 상태/이벤트/카테고리 목록이 완전한가"는 증명 못 함.
- UX / 무게          : 내부 정합성만 봤다. 승인 의식의 실제 무거움 같은 사용성은 검토 안 함.
- 보안 / 위협 모델   : F21 한 줄 외 전담 검토 없음. redaction 완전성, scope glob 경로 탈출,
                       adapter 샌드박스 우회, 악의적 Project Profile은 adversarial하게 안 찔러봄.
- 동시성 / 크래시    : workspace lock 존재만 확인. 동시 mutation·부분 write·크래시 복구 atomicity 미검증.
- cross-doc 정밀 diff: concept-foundation vs final-model-architecture 전수 대조 안 함.
```

### 4. 시뮬레이션 표본 편향 (제일 중요)
렌즈 1을 **단 한 시나리오**(SEQUENCE 에러응답)로만 돌렸다. 안 돌린 흐름:
```text
- ONE_OFF / WORKSTREAM Objective
- revision bump-after-run (run 후 Task 수정 → 새 revision)
- corruption → repair 흐름
- carry-forward DECISION (SUMMARY 말고)
- BLOCKED → unblock
- monorepo multi-component task
```
→ executability finding은 한 trace의 결과지 coverage sweep이 아니다.

### 5. PASS 영역은 액면 신뢰함
모순을 못 찾은 PASS 영역은 독립 재유도 없이 그대로 믿었다. (예: Task Relation 5-state가 정말 맞는지)
```text
모순 없음 ≠ 검증됨. "내가 한 번 훑는 동안 충돌을 못 봤다"일 뿐.
```

### 다음에 닫을 coverage 구멍 (가성비 순)
```text
1. session-handoff.md 읽기   → 내 finding 중 '이미 아는 항목' vs '진짜 놓침' 분리 (제일 쌈)
2. 시뮬레이션 추가 시나리오  → ONE_OFF / revision-bump / corruption-repair 최소 3개
3. 보안 단일 렌즈            → redaction·scope·adapter·profile adversarial 검토
4. FINAL RULE 블록 줄별 audit → §5 형식 규칙들의 내부 정합성
```
