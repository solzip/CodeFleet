# Manager proposal handoff

- 작업 일시: 2026-10-28
- 대상 커밋: 91a0a4a467ebae58dc643cf13d753206930dc73f + preserved working-tree changes
- 작업 유형: 수정·실행
- 선행 문서: [roadmap](../../product-completion/roadmap.md), [architecture](../../product-completion/architecture.md)
- 번호 실측 최대값: P0-17 / P1-61; new issue number not allocated

## Implemented scope

The existing Local continuation can now prepare all eligible independent source
proposals, using the existing Workflow ready/resource selector. One agent remains
the default; multiple proposal requests require an explicit benefit and a bound
of at most three. File effects and verification remain serial supervised actions.
Implementation: src/product/continuation.mjs:126.

The CLI exposes proposal-batch, proposal-start and proposal-results. Requests bind
Task revision, semantic revision, workflow, candidate and source context. All
results must pass ownership/base/content validation before feedback is recorded
in the existing artifact/Work Log store. No new store, scheduler, signer, model
launcher or approval authority was introduced. Agent identities and messages are
PROVIDER_REPORTED_ONLY, not proof of Host invocation or independent Evidence.
Implementation: src/product/continuation.mjs:172 and src/product/continuation.mjs:192.

A declared handoff with no reviewed results appears as RECONCILE after process
restart, with no automatic replay or budget reset. Repeated declaration is
rejected. This does not attest that an agent was launched or terminate an external
agent; the Host must supply actual invocation/return observations.
Implementation: src/product/recovery.mjs:129.

## Defect found during regression

The earlier semantic-revision work had made every LOCAL_CHECKPOINT satisfy
dependencies, including a historical same-contract checkpoint which must not
authorize a new dependent execution. The existing P0-B regression failed.
The correction admits only checkpoints that pass archived contract evidence
validation; it retains the original failing assertion and the semantic-revision
preservation tests. Implementation: src/product/tasks.mjs:364 and
src/workflow/bootstrap.mjs:85.

## Executed checks

Windows PowerShell, Node 24.14.1. No additional model or Subagent invocation.

- Focused Host proposal tests: exit 0, 2 passed. A subsequent pending-Recovery
  test exposed an effect-list initialization error (exit 1); the initialization
  order was fixed and the same tests passed (exit 0).
- Development-loop, Continuation, Recovery and Host suites: exit 1;
  107 passed, 1 failed, 1 optional Docker test skipped. The failure was the
  checkpoint dependency defect described above, not ignored.
- Focused proposal/P0-B/semantic-revision recheck after correction:
  exit 0, 7 passed. This includes new-process Recovery and preserved-A
  semantic-revision completion.
- Additional Bootstrap/Reservation/Local acceptance checks: exit 0, 109 passed.
- Link and citation checks: exit 0 (historical citation warnings retained).
  Sandbox-only attempts initially could not list Git files; native user checks
  succeeded without changing Git safety settings. Fact checking found three
  record-count mismatches from this new run record; the measured counts were
  updated, not the checker or coverage/anchor baselines.

Logs are retained locally under .codefleet/manager-*-regression.log. These are
internal synthetic regressions, not multi-agent Host Live evidence.

## Prepared real acceptance

An isolated copy of the existing accepted Git project retains its HEAD and user
notes. The original project candidate was compared before/after preparation and
was unchanged. A new Local-only Objective has two independent source WorkItems:
server.mjs serves the existing summary module; src/todo.mjs produces a stable
domain error for malformed persisted data. Two new fixed acceptance tests were
added only to the copy before contract creation; all original tests are unchanged.
Final integration depends on both items and includes all six test files.

Local packet: .codefleet/manager-live-yCPUBF/request.json, Task revision 4,
Contract revision 1. Host scope proposes two agents, one implementation turn each,
no retries, five-minute observation limit per agent. Test scope is one Native
Local Attempt of at most 30 seconds. No live invocation, source materialization,
Decision, Attempt or verification Evidence has occurred for this Objective.
Future exact Fileset hashes and final Candidate-bound Review do not exist yet.
This packet cannot grant authenticated delegation or pre-approve unknown hashes.

## 결론

Proposal coordination and interrupted-handoff Recovery are implemented internally.
Actual Manager/Subagent Live acceptance remains NOT_RUN pending model permission.
PUBLIC_DELEGATION_BLOCKED and Protected UNSATISFIED remain unchanged.

## 다음 작업

Obtain bounded Host Subagent permission, observe real dispatch/return, review exact
Filesets through supervised trust, then obtain current-candidate Local Evidence.

## 미해소로 남긴 것

No measured parallel speedup, agent coordination cost or token/dollar total.
No new collaboration compaction, in-flight Host-agent cancellation, public
authenticated delegation or Protected acceptance has been demonstrated.

## Follow-up: actual proposal Live and observer correction

The later user-authorized Windows Codex 0.162.1 run completed one Manager turn
and two child proposal turns on gpt-6-sol/medium. The two generated file contents
matched the Manager response and passed existing ownership/base/Candidate
validation. This establishes MULTI_AGENT_PROPOSAL_LIVE only. No source was
materialized, no verification Attempt/Decision was issued, and no Judge completion
was earned. Existing Local/Protected acceptance criteria remain unchanged.

Observed Manager duration was 70.664 seconds; child durations were 8.728 and
18.177 seconds, with zero overlap. The first spawn returned in about 0.274
seconds. The second spawn request arrived about 16.346 seconds after that return,
after the first child had completed. The wait request came after both dispatches.
The DAG selected independent files together, and the driver did not wait between
dispatches. The trace establishes delayed Manager dispatch, not a Host concurrency
limit. Large per-child context arguments were observed (3447 and 5687 bytes);
their causal contribution to latency is an inference, not a measured ablation.

The original acceptance driver returned exit 1 because it counted only legacy
collabAgentToolCall spawn events. Codex emitted subAgentActivity instead. That
failure and its raw trace remain preserved. Read-only reconciliation found both
completed turns without any model replay. Recorded token totals were 110544 for
the Manager and 25987/26878 for the children. Internal model request counts and
dollar costs remain UNKNOWN. Host configuration and zero observed child tool use
do not prove the complete effective tool inventory or depth-limit enforcement.

The correction is acceptance instrumentation, not a change to Core scheduling or
approval. scripts/lib/codex-proposal-events.mjs normalizes activity/legacy/raw
events, deduplicates calls and lifecycle events, retains unresolved effects as
RECONCILE, detects unexpected tools/additional turns/children and timeout, and
measures overlap from observed turn intervals. It never invokes models, approves
work or owns a persistent store. The existing local driver consumes it. Short
dispatch messages reference the already-bound inherited Batch rather than asking
the Manager to repeat source text. This reduces prepared dispatch bytes to
526/528; actual parallel execution after this change is NOT_RUN pending approval.
The driver also now uses the existing recordProposalDispatch/proposal-results
Work Log boundaries: a missing result stays pending for normal Objective Recovery,
and a completed result appends reviewed feedback without issuing execution rights.
These driver changes have not yet had another model-backed Live run.

The first internal check exposed two event alias/coalescing issues; they were
corrected without weakening the checks. The preserved actual trace now replays
as two returned proposals with zero overlap. Negative checks cover duplicates,
identity conflicts, excess/nested dispatch, tools/Resume, missing results,
timeouts/clock rollback, false parallelism and conflicting DAG assignments.
Implementation: scripts/lib/codex-proposal-events.mjs; test/host-proposal-events.test.mjs.

Final scoped checks on Windows/Node 24.14.1: observer checks exit 0 (9 passed),
existing Host-proposal selection/validation/Recovery checks exit 0 (2 passed),
preserved Live-event replay exit 0, and link/citation/declared-fact checks exit 0.
Historical citation warnings remain. No whole-platform or Protected regression
claim follows from these scoped checks.

For the existing proposal E2E, A was registered and an exact Native Files Review
prepared, advancing Task revision 4 to 5. Source Candidate, semantic Contract
revision 1, old Evidence and remaining 1 Attempt/30 seconds were preserved.
B content and projected A/integrated Candidates and command were checked using
existing projection APIs. Preparation grants no execution. Fresh B and integrated
Reviews do not yet exist and must be checked at their actual revisions; expired
or changed bindings must stop. The concrete local request is retained at
.codefleet/host-proposal-boundary/integration-approval/request.json.

Next: user consent for exact supervised application and one independent Local
verification, then separately authorized parallel and single-agent comparisons.
No additional model turn was run during observer correction. End-to-end quality,
parallel performance, depth enforcement and full multi-agent development
acceptance remain unverified; public delegation remains blocked.

## Follow-up: approved integration and bounded proposal comparison

On 2026-10-28, the subsequent combined user approval authorized exact existing
proposals, one Local Attempt, and then five proposal-only Host turns. Windows,
Node 24.14.1, Codex 0.162.1 and the same dirty 91a0a4a development baseline were
used. Earlier failed observation records and all existing Evidence were retained.

The existing supervised Native Files Review/Accept path materialized server.mjs
and src/todo.mjs once each. No regenerated proposal was substituted. Fileset
hashes were e5e6292b868f84c7b0fc51a7d3f0b9bb1a9c02a49a83de99d739900c6b4b5ec7
and 20da43c708c27ca5183edbcaaaf7dd0fd33a69b2b908316a109fd98800928f6c.
Only those two source files changed. The six fixed test files were unchanged.
Native Local verification returned exit 0, 14 passed, 0 failed/skipped.

- Final Task revision: 9; semantic Contract revision: 1.
- Candidate: 45ce327ba59aec1619b6c64ad717e6b1806d845518240b1458b3883149f4708b.
- Decision: b652f199-2ff4-437c-9746-c4135e8a0c28, CONSUMED, zero uses left.
- Attempt: bootstrap-attempt-40e4972f-6e40-4707-8864-10c955feb426.
- Evidence: 44f103951fc54d75b98b478ad95a0b9e71d60e662f941a34da7942cbf6fc24a3.
- Local Judge and Objective: COMPLETE_LOCAL; Protected: UNSATISFIED.
- Separate-process Recovery: exit 0, RECOVERED, completed, same Candidate.
- Original budget: 1/1 Attempt and 30/30 seconds reserved; no retry permitted.

The Evidence binds execution revision 8, before the result raised Task revision
to 9. Integrity was MATCHED. Conditional consent used EXPLICIT_LOCAL_TRUST;
it did not authenticate public delegation or create an Agent signing authority.
Local artifacts: .codefleet/host-proposal-boundary/integration-execution/summary.json,
judge.json and process-recovery.json. The exact approved request was preserved.

### Proposal comparison, not complete development performance

Three independent copies used HEAD 4a3256640439f1e79675ae6d0623263b108d0b7b,
identical pre-integration source and fixed tests, gpt-6-sol/medium, one root turn
per case, and a 300-second limit per turn. CodeFleet cases used existing Draft,
Validator, DAG, proposal batch, handoff and result-review APIs. The basic Codex
prompt carried the same source/criteria without CodeFleet scheduling metadata;
the common CodeFleet evaluator was used only outside its generation step.

| Case | Request through validation | Root Host duration | Observed tokens | Cached input tokens | Child overlap |
| --- | ---: | ---: | ---: | ---: | ---: |
| Basic Codex single Agent | 21.346 s | 21.068 s | 24007 | 0 | 0 s |
| CodeFleet single Agent | 22.223 s | 21.809 s | 24728 | 0 | 0 s |
| CodeFleet Manager + two children | 46.580 s | 46.134 s | 183357 | 126336 | 6.307 s |

The Manager spawned module-serving and storage-errors before its first wait.
Observed child intervals were 10:47:35.774-10:47:45.425 UTC and
10:47:39.118-10:47:55.303 UTC. Spawn requests were 10:47:35.417 and
10:47:38.784 UTC. Host child durations were 9.628/16.160 seconds. The root
interval outside the union of child intervals was 26.188 seconds; this measures
wall time, not attributed CPU or pure Manager reasoning. This is actual parallel
execution, unlike the preserved earlier zero-overlap run.

All six file proposals passed ownership/base/Candidate validation. All three
server proposals produced identical bytes. Storage proposals varied in parse
error handling and top-level guards; static review found the targeted changes
without unrelated source edits. Their functional correctness was NOT_TESTED:
no benchmark proposal was materialized or executed. Manager output was compared
to complete actual child responses, not accepted from a summary. Fileset hashes
were computed but not registered. Each benchmark Objective remains incomplete.

Total observed Host turns: 5; actual child creations: 2; observed child tool
calls, further delegation, Resume and automatic retries: 0. Read-only/never and
disabled tool settings were recorded per session. Full child tool inventory,
negative depth enforcement and a Host-enforced lifetime-call cap remain unproven.
Observed token counts include cached input; internal model requests and USD are
UNKNOWN. One sample does not establish general quality or economic advantage.
This small task was slower and used more tokens with Multi-Agent; independent
longer tasks are a future evaluation condition, not a measured advantage.

The existing CodeFleet cases appended only dispatch/review Work Log events;
source, approvals and Attempt budgets stayed unchanged. Separate-process
Recovery for all three cases returned RECOVERED with matching bindings and no
pending effects. The completed integration Objective and historical Evidence
were checked again after comparison. The initial historical SQLite byte change
remains UNKNOWN; logical preservation is not a claim of physical immutability.

Preparation failures occurred before any model call: synchronous copying exited
without details, then the baseline check detected .git/index stat-cache refresh
after Git probing. These records were retained. Async copying and explicit
source/HEAD comparison resolved preparation without resetting Git; each actual
Candidate was bound separately. No source difference or test relaxation was used.

Scoped regression: observer tests 10 passed, existing Host proposal tests 2
passed, both exit 0. No benchmark functional tests were run. Evidence and timings
are retained under .codefleet/host-proposal-boundary/benchmark-01/summary.json
and per-case live/ traces, result and process-recovery records.

One combined user scope approval covered this acceptance; no scope expansion
was requested. Host execution prompts used existing approved prefixes. Actual
human click count and review time were not measured and are UNKNOWN.

Conclusion: supervised integration with independent Local Evidence, separate
actual parallel proposal execution and bounded comparison are demonstrated.
The parallel run's new proposals were not applied: it is not one continuous
parallel-generation-to-Judge acceptance. PUBLIC_DELEGATION_BLOCKED persists.

Next work: if separately authorized, bind a parallel-produced candidate to exact
Fileset approval and independent verification; evaluate larger independent work
before claiming speedup. No additional invocation is authorized by this report.
Unresolved: protected verification, authenticated delegation, in-flight Live
interruption/compaction recovery, full tool/depth enforcement and measured USD.
