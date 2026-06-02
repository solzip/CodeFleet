# CodeFleet 아키텍처 — Spine / Seams / Guards

이 문서는 CodeFleet 아키텍처를 **목표 루프 중심**으로 다시 그린 지도다.
FINAL RULE의 source of truth는 `docs/concept-foundation.md`다. 이 문서는 "무엇이 핵심 축이고, 무엇이 보호대이고, 어디가 비어 있는가"를 한눈에 보기 위한 것이다.

![CodeFleet 목표 루프 — Spine & Seams (by Claude Code)](assets/codefleet-spine-claude.svg)

아래 ASCII 뷰들은 위 그림을 더 자세히 푼 것이다.

## 왜 다시 그리나

기존 `final-model-architecture.md`는 **설정·정책·안전 축**(Project Profile / defaults / policy lifecycle)을 진행도로 측정한다. 그런데 제품의 목표는 그게 아니다.

```text
CodeFleet의 목표:
  Objective를 실행 가능한 Task로 구조화하고
  각 Task를 역할·범위·가드레일·검증 계약으로 정의하며
  사람이 승인한 Task만 AI 에이전트에게 위임하고
  그 실행 결과를 로그·diff·테스트·리뷰로 추적한다.
```

이 목표를 한 바퀴 돌리는 데 진짜 필요한 건 "정책 schema"가 아니라 **실행 경계(seam)** 다. 그래서 이 지도는 세 시점으로 나눈다.

```text
SPINE   = 목표 루프 그 자체. 한 바퀴 돌려면 반드시 있어야 하는 척추.
SEAMS   = SPINE이 바깥세상/실제 작업과 만나는 경계. 진짜 일이 일어나는 곳이자, 지금 비어 있는 곳.
GUARDS  = SPINE을 감싸는 안전 machinery. 한 번 도는 데는 필요 없고, 여러 번 안전하게 도는 데 필요하다.
```

## 표기 규칙 (의미는 하나씩만)

상태와 역할을 **다른 기호로 분리**한다. (기존 다이어그램은 초록이 "완료"와 "source of truth" 두 뜻이라 헷갈렸다.)

```text
상태 (한 가지 축):
  ✅ RUNS    한 바퀴 돌 만큼 실제로 정의됨
  🟡 SHAPED  상태/규칙은 있는데 실행 mechanic이 빔
  ⬜ EMPTY   거의 비어 있음

역할 표시 (상태와 별개):
  [S] source of truth      (원본 진실)
  [D] derived artifact     (재계산 가능)
  ◆  human gate            (사람 결정 지점)
  ║  seam                  (외부/실작업 경계)
```

---

## View 1 — SPINE (목표 루프)

```text
[사람] Intent
   │
   ▼
Objective              [S] 🟡   맥락/연속성: 어느 작업 묶음인가
   │
   ▼
Task Draft             [S] 🟡   계약 후보        ◀══ SEAM S1: Drafting
   │
   ▼
◆ Review / Approval        🟡   사람 게이트 ①: "이 계약 실행해도 되나"
   │
   ▼
Task Revision          [S] ✅   불변 실행 계약
   │
   ▼
Run Planning           [D] 🟡   effectivePolicy / risk / gate / adapter 선택 계산
   │
   ▼
║ Harness Execution ║      ⬜   실행 경계      ◀══ SEAM S2: Adapter  ★ 최대 빈칸
   │
   ▼
Evidence / Trace       [S] 🟡   실행 증거       ◀══ SEAM S3: Verification
   │
   ▼
◆ Review / Close           ⬜   사람 게이트 ②: "결과 받아들이나"  ◀══ SEAM S4: Review record
   │
   ▼
[닫힘] derived state (VERIFIED 등)  →  carry-forward(승인된 결정/요약)  →  다음 Objective
```

이 척추에서 색을 정직하게 읽으면: **상태·계약 쪽(Revision)만 ✅이고, 실제로 일이 일어나는 아래쪽(Execution / Review / Close)은 ⬜에 가깝다.** 목표 기준 진짜 남은 일은 전부 척추의 아래 절반이다.

---

## View 2 — SEAMS (경계 = 진짜 일 = 진짜 빈칸)

SPINE에서 화살표 옆에 붙은 ◀══ 들이다. 여기가 CodeFleet이 "바깥/실작업"과 만나는 지점이고, 목표를 돌리는 핵심 경로다.

```text
S1  Drafting seam        Intent + Profile + discovery ─▶ Task Draft
    상태: 🟡  (상태머신 O, drafter 입출력 계약 X)
    빈칸: LLM이 무엇을 입력받아 어떤 schema를 뱉는가
    우회: 사람이 YAML 직접 작성 (fallback 있어 치명적이진 않음)

S2  Adapter seam   ║     approved Revision ─▶ 외부 AI 도구 ─▶ 출력 회수
    상태: ⬜  ★ 제일 크고 제일 중요한 빈칸
    빈칸: 호출 프로토콜 (stdin? CLI args?), 출력 회수, scope를 adapter 단에서 어떻게 거나
    이유: 목표 문장의 "AI 에이전트에게 위임"이 물리적으로 일어나는 유일한 지점.
          이게 없으면 SPINE 아래 절반이 전부 안 돈다.

S3  Verification seam     검증 명령 실행 ─▶ NOT_RUN / PASSED / FAILED 기록
    상태: 🟡  (기록 형식 윤곽 O, 실행 방식 미정)
    빈칸: prompt-only인가, allowlist 자동 실행인가, 결과 어디에 어떤 형식으로

S4  Review seam     ◆    Run 결과 ─▶ 사람 수용/거절 기록 ─▶ VERIFIED 계산
    상태: ⬜
    빈칸: review가 무엇이고 어떻게 파일로 남는가. VERIFIED는 이게 있어야 도는데 실체가 없음

S5  Export seam           Run Trace ─▶ Run Summary(sanitized) ─▶ Notion / 일지 / Issue
    상태: 🟡  (필드/sanitization 규칙 O, adapter별 출력 미정)
    빈칸: summary.md 자동 생성, 대상별 필드 제한, redactionReport 출력 형식
```

핵심: **S2(Adapter)가 모든 것의 병목이다.** S1은 우회 가능, S3·S4·S5는 S2가 돌아야 의미가 생긴다.

---

## View 3 — GUARDS (보호대, 척추 아님)

아래는 SPINE을 감싸는 안전 machinery다. concept-foundation 분량의 대부분이 여기에 있다. **중요한 점: 이건 한 바퀴 도는 데 필요 없다. 여러 번·여러 사람이·깨져도 안전하게 돌리는 데 필요하다.**

```text
┌────────────────────────────────────────────────────────────────┐
│  GUARDS                                                         │
│                                                                │
│   Mutation Engine   상태 변경 창구 (lock → validate → append    │
│                     → rebuild → validate)                      │
│   Ledger            결정 로그 (append-only, 제안은 안 남김)      │
│   Policy Merge      effectivePolicy = meet(...) 권한 계산        │
│                     "More restrictive wins"                    │
│   Corruption/Repair 불변식 검사 + RepairKind/Mode               │
│   Capability Gating finding severity → 무엇을 막을지            │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │                                                      │    │
│   │          SPINE  (View 1의 목표 루프)                  │    │
│   │                                                      │    │
│   └──────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

이 보호대를 SPINE보다 먼저 다 구현하면, **개념 검증 전에 무게에 눌린다.** 보호대는 척추가 한 바퀴 돈 뒤에 한 겹씩 덧댄다.

---

## 전체 시스템 한 장

```text
        ┌─────────────┐                         ┌──────────────────────┐
        │   사람      │  ◆ approve   ◆ review   │   외부 AI 도구        │
        │ (gate ①②)  │                         │ Claude Code / Codex   │
        └──────┬──────┘                         └──────────▲───────────┘
               │ gate                                      │ ║ S2 Adapter seam
               ▼                                           │
   ┌───────────────────────────── GUARDS ──────────────────┼───────────┐
   │  Mutation Engine · Ledger · Policy Merge · Corruption ·│Gating     │
   │  ┌────────────────────────── SPINE ───────────────────┼────────┐  │
   │  │ Intent→Objective→Draft→[approve]→Revision→Plan→ ║Execute║ →  │  │
   │  │ Trace→[review]→Close → derived state → carry-forward       │  │
   │  └──────────────────────────────────┬─────────────────────────┘  │
   └─────────────────────────────────────┼────────────────────────────┘
                                         │ ║ S5 Export seam
                                         ▼
                              ┌────────────────────┐
                              │ Notion / 일지 / PR  │
                              └────────────────────┘
```

척추는 가운데를 관통하고, 사람은 위에서 두 번 게이트로 개입하고, 바깥세상(AI 도구·기록 대상)과는 **seam으로만** 닿는다. 보호대는 척추를 감싼다.

---

## 한 바퀴 돌리기 위한 최소 경로 (critical path)

목표를 *처음 한 번* 돌리는 데 필요한 것만 추리면:

```text
필수:
  - Task Spec 최소 구체 schema      (S1 우회: 사람이 YAML 작성)
  - Adapter 호출 프로토콜 1종        (S2)  ★
  - 최소 AgentRole / Verification 확정값
  - Run Trace 수집 (diff/stdout)     (S3 최소: NOT_RUN/PASSED/FAILED 기록)
  - Review record 최소 형태          (S4)

지금은 미루어도 됨 (GUARDS 전체):
  - Mutation Engine · Ledger replay · Corruption/Repair
  - Policy Merge 전체 · Capability Gating
  - Project Profile 전체 schema · defaults 세부
  - Export adapter (S5)
```

즉 **"한 줄로 정하면 가장 목표에 가까운 것" = Adapter seam(S2) 호출 프로토콜 한 개를 구체적으로 박는 것.**
예: "Claude Code adapter는 정확히 이렇게 호출하고, 출력을 이렇게 회수하고, scope를 이렇게 적용한다."

---

## 기존 다이어그램과 다른 점

```text
기존 (final-model-architecture.md):
  - 진행도 축 = 설정/정책/안전 (Layer 1~2 중심)
  - adapter는 "어느 걸 고르나"(selection)로만 등장, 호출 경계는 한 박스 한 줄
  - 초록이 "완료"와 "source" 두 뜻
  - 실행축(Layer 3)이 본문엔 "정의됨", 그림엔 전부 회색 (불일치)

이 문서 (spine):
  - 진행도 축 = 목표 루프 (실행 경계 중심)
  - Adapter를 seam으로 1급화 (S2, 최대 빈칸으로 명시)
  - 상태(✅/🟡/⬜)와 역할([S]/[D]/◆/║)을 분리
  - 비어 있는 걸 비어 있다고 표시 (Execution/Review/Close = ⬜)
```

## 다음에 할 일 (이 지도 기준)

```text
1. S2 Adapter seam 프로토콜 1종 확정      ← 목표에 가장 가까움
2. Task Spec 최소 schema + 최소 role 세트  (S1 우회 가능하게)
3. Review record 최소 형태                (S4, VERIFIED 계산용)
4. 위 셋으로 SPINE 한 바퀴 수동 검증
5. 그 다음 GUARDS를 한 겹씩 덧댐
```
