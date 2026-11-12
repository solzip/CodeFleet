# 분기 파일 목록

2026-11-12 · 각 분기의 공통 조상 이후 변경 경로입니다. 두 HEAD 간 직접 diff 또는 실제 병합 충돌 목록이 아닙니다. 동일 기능이 별도 커밋으로 구현됐을 수 있으므로 커밋 수를 누락 기능 수로 해석하지 않습니다.

- 공통 조상: `e82f6876cc8af6913a54ee186bc7bae14959c35c`
- #14 HEAD: `ec24da6b9606067d9d8c278e62e1ed9dad173e49` — 33개 전용 커밋, 19개 변경 경로
- #33 HEAD: `fde7689727b19751f865dd7743c2a138e61a8e68` — 27개 전용 커밋, 50개 변경 경로
- 양측 변경 경로: 7개; 합집합: 62개

| 경로 | #14 | #33 | 통합 시 처리 |
|---|---|---|---|
| `.github/workflows/alpha.yml` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `.github/workflows/codex-cli.yml` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `README.en.md` | 변경 | 변경 | 양측 변경: 내용별 통합·통합 시험 필요 |
| `README.md` | 변경 | 변경 | 양측 변경: 내용별 통합·통합 시험 필요 |
| `docs/INDEX.md` | 변경 | 변경 | 양측 변경: 내용별 통합·통합 시험 필요 |
| `docs/PLAN/codefleet-codex-mvp-implementation-status.md` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `docs/audits/2026-10-30/01-persistent-worklog-integration.md` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `docs/implementation/objective-recovery.md` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `docs/product-completion/host-native-guide.md` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `docs/product-completion/progress.md` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `docs/runs/2026-10-30/persistent-worklog.md` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `docs/runs/2026-10-30/supervised-adoption-repair.md` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `docs/runs/2026-10-30/supervised-proposal-continuation.md` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `docs/runs/2026-10-30/todo-fileset-review-prepared.md` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `docs/runs/2026-10-30/todo-integrated-verification-recovery.md` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `docs/runs/2026-10-30/undelivered-handoff-recovery-v2.md` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `docs/runs/2026-10-30/undelivered-handoff-recovery.md` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `docs/runs/2026-11-11/codex-goal-skill-handoff.md` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `package.json` | 변경 | 변경 | 양측 변경: 내용별 통합·통합 시험 필요 |
| `scripts/codex-cli-client-acceptance.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `scripts/codex-live-acceptance.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/alpha/cli.mjs` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `src/hosts/codex-app-server-session.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/hosts/codex-managed-planning.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/hosts/codex-mcp.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/hosts/install.mjs` | 변경 | 변경 | 양측 변경: 내용별 통합·통합 시험 필요 |
| `src/intent/contract.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/product/cli.mjs` | 변경 | 변경 | 양측 변경: 내용별 통합·통합 시험 필요 |
| `src/product/codex-bootstrap-index.mjs` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `src/product/codex-goal-result.mjs` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `src/product/codex-planning-status.mjs` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `src/product/continuation.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/product/contract-revisions.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/product/directives.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/product/native-local.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/product/recovery.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/product/report.mjs` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `src/product/reservations.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/product/tasks.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `src/product/work-log.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/codex-app-server-session.test.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/codex-bootstrap-files.test.mjs` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `test/codex-installed-goal-recovery.test.mjs` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `test/codex-live-acceptance.test.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/codex-managed-planning.test.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/codex-mcp.test.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/codex-mvp-facade.test.mjs` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `test/codex-mvp-joined-fixture.test.mjs` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `test/codex-reviewed-workflow.test.mjs` | 변경 | 변경 | 양측 변경: 내용별 통합·통합 시험 필요 |
| `test/codex-todo-calendar-vertical.test.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/codex-workspace-execution.test.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/fixtures/todo-calendar-vertical/package.json` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/fixtures/todo-calendar-vertical/src/calendar.js` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/fixtures/todo-calendar-vertical/src/todo.js` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/fixtures/todo-calendar-vertical/test/calendar.test.js` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/fixtures/todo-calendar-vertical/test/todo.test.js` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/host.test.mjs` | 변경 | — | #14 변경: 관리형 경로 수용 전 검토·선별 통합 |
| `test/installed-goal-loop.test.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `test/work-log.test.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `tools/proofs/p1-appserver-handshake.test.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `tools/proofs/p1-r2-preflight.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |
| `tools/proofs/p1-r2-preflight.test.mjs` | — | 변경 | #33 후보 유지: 일괄 교체로 제거하지 않음 |

통계 출처와 정확한 ref는 `candidate-and-integration-record.json`에 기록했습니다.
