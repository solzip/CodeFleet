# P0-C Codex Session 2: persisted recovery and B proposal

- Date: 2026-10-27, Host call ended 05:06:32 UTC (14:06:32 KST).
- Baseline: `19ddf671410e92fc9d9e4fa423aeb829981c5bfa`, detached `core-p0-1` worktree with existing uncommitted Core changes preserved.
- Type: authorized Host execution, proposal validation and recording only.
- Predecessors: [Session 1](codex-host-session1-recovery.md), [read-only Store correction](codex-recovery-readonly-store-fix.md), existing local `verify-a-01/session2-approval-request.json`, and the user's Session 2 authorization.
- Contracts: [Objective recovery](../../implementation/objective-recovery.md), [multi-WorkItem development](../../implementation/multi-workitem-development.md).
- Measured existing issue maxima: P0-17 / P1-61. No new defect ID allocated.
- Environment: Windows / PowerShell / Node v24.14.1 / codex-cli 0.162.1. Other OSs NOT_RUN.

## Authorized scope and recovery

The user authorized one fresh `codex exec`, `gpt-6-astra`, reasoning `medium`,
maximum 300 seconds and 2 MiB captured output, using existing Host authentication.
Unmetered dollar usage was explicitly accepted; internal requests and dollars stay
UNKNOWN. No resume, model retry, tools, subagents, source application or tests were authorized.

The existing `objective recover` CLI read the original State directory. The new
Host received its actual output, current Contract/DAG, work log, current files and
A Evidence through stdin. It received no Session 1 conversation. The operator ran
Recovery before the fresh model invocation; the model did not execute Recovery or
other tools itself. This is operator-assisted fresh-session context recovery.

| Check | Observation |
| --- | --- |
| Objective / Task | `task-8f9e7574-8485-48d9-b441-09a559dcc521` |
| Pre-call revision | 9 |
| Workflow hash | `6b86ce71bb9f1f1465d0885f050e228201becb5fc63f0f18c3f3f4b6b9041047` |
| Candidate hash | `65e166c6184862c6b9bbb2d70bad67c63a9365c0a6109a9fe44e2cfd02394862` |
| Recovery | RECOVERED; blockers empty; execution/model grants false |
| A | MATERIALIZED; verify-normalize LOCAL_PASSED; no rerun |
| A Evidence | `260fceca3a6070b3cec543c0cf3187bd4f31b31a37dd75bec8eddfe22f51be60` |
| A Decision | CONSUMED; remaining executions 0 |
| B | todo, waitingOn empty; next PROPOSE_FILESET(todo) |
| Remaining verification budget | 2 Attempts / 110000 ms; unchanged |
| Leases / uncertain effects | no owners / empty effects |

The bounded decision-debt scan examined the selected approval packet: no final
blocking cards, one candidate excluded for insufficient evidence. It was not a
whole-project clearance or additional execution authority.

## Actual Host call and proposal

| Observation | Session 1 | Session 2 |
| --- | --- | --- |
| Host PID | 48896 | 29216 |
| Host thread ID | `01a17b45-e11a-7130-8e4a-1c3821c4f6bf` | `01a17bc0-945c-7650-a341-6ea4bc90d6f9` |
| Exit | 0, prior process closed | 0, close observed, process no longer alive |

Session 2 made one CLI exec invocation, no resume and no launcher retry. Elapsed
time was 11973.1107 ms; captured output was 1451 bytes. Observed usage was 24890
input tokens, 326 output tokens, zero reported cached/cache-write/reasoning output
tokens. Internal model request count and dollar cost are UNKNOWN, not zero.
Events contained thread/turn boundaries and one agent message, with zero tool
events. The existing read-only sandbox, approval-never, disabled apps/plugins/
multi-agent and proposal-only configuration was reused. This is not a claim of
absolute tool unavailability or new Windows sandbox security certification.

The actual model proposed only `src/create-todo.mjs`:

```js
import { normalizeTitle } from './normalize-title.mjs';

export function createTodo(input) {
  return { title: normalizeTitle(input), completed: false };
}
```

The model response and saved JSON matched. Existing `validateFileset` accepted
the exact WorkItem paths and contents; the surrounding validation checked revision,
Workflow/recovery bindings, A Evidence, dependencies and distinct sessions.
Static review found reuse of A and a fresh Todo object; behavior tests were NOT_RUN.

- Fileset hash: `3da985920197c8501771c55237c23bed45f61606d5b049d57d2010b25b55ae29`.
- Proposal artifact: `915d851de91f8faaa5207f6065405bfc90dfdb2258495a49f8b784c3aa5bb804`.
- Authority: PROVIDER_REPORTED_ONLY; B has not been applied or verified.

## Integrity and recording

Preparation had two nonzero exits before any model call. First, the preparation
helper incorrectly compared whole budget objects from different projections:
the packet's internal `modelCalls: 0` field is not a Host usage counter. The helper
was corrected to compare all actual attempt/time/retry limits and independently
require the user's UNKNOWN Host accounting terms; no product gate or limit changed.
Second, byte comparison detected newly created SQLite SHM and empty WAL sidecars.
The existing DB and all Evidence bytes were unchanged. This coordination effect
is documented by the Recovery contract and is retained in the integrity report.
An auxiliary inline inspection command also failed due to PowerShell quoting;
the subsequent read-only inspection succeeded. No model retry occurred.

The post-Recovery invocation baseline was saved separately, without overwriting
the original baseline. Across the actual Host call, all Fixture and State bytes
were identical. Proposal recording then used existing `submitBootstrapFiles` and
Store artifact/event APIs. Task revision advanced normally from 9 to 10, with
next action AWAIT_FILESET_APPROVAL(todo). No approval or Decision was issued.
All prior rows except the expected Task update were preserved; all 11 preexisting
artifact files were byte-identical. Candidate, source/tests, A status, reservations,
consumed Decisions and remaining budget were unchanged. P0-B preservation also
passed the existing baseline check before invocation and recording.

Local evidence lives under `.codefleet/p0-c-evidence/session2-approved-01/`:
`recovery-command.json`, `recovery.json`, `context.json`, `preflight*.json`,
`preparation-integrity.json`, both before inventories, `call-started.json`,
`host-process.json`, `events.jsonl`, `result.json`, `proposal.json`, `validation.json`,
`record-receipt.json`, `post-record-recovery.json`, `post-record-integrity.json` and
`b-approval-request.json`. These private local artifacts contain machine-specific
paths and are not publication artifacts.

Documentation checks: links and citations exited 0; historical citation warnings
remain. The first fact check exited 1 because adding this run changed the measured
README audit/run count from 122 to 123. Both declarations were updated to the
measured count; no coverage or anchor baseline was changed. Final fact check and
`git diff --check` exited 0. No application or regression tests were run in this
proposal-only scope. Changes comprise this run record, index/register/progress
follow-up, README count declarations and private execution/validation artifacts;
product source and fixed fixture tests were not edited.

## Conclusion

One fresh Codex Session 2 generated B from actual persisted recovery; the proposal
passed Fileset validation and is recorded awaiting approval. P0-C overall,
Compaction Recovery, integrated acceptance and Protected completion remain incomplete.

## Next work

The saved request binds B creation to the exact Fileset above, run
`task-8f9e7574-8485-48d9-b441-09a559dcc521-todo-r9`, Fileset revision 1 and current
Task revision 10. Separate approval is required to create `src/create-todo.mjs`.
After application, recompute the actual revision/candidate/command hashes and
obtain a fresh Local decision for verify-integrated: Node `--test --test-reporter=tap`
with both fixed test files, one execution, proposed timeout 10000 ms. A standalone
verification is not rerun; A's fixed tests participate in the integrated check.
The request grants no execution, repair, retry, model call or Git publication.

## Unresolved

B application and integrated tests NOT_RUN; Compaction NOT_RUN; Protected
verification UNSATISFIED; Objective complete false. Dollar cost and internal
requests UNKNOWN. No new Windows security diagnostics or Git publication occurred.

## Subsequent authorized B application: blocked before approval

2026-10-27, same baseline and worktree; type: authorized materialization preflight.
The user approved exact B creation once, with a newly issued Fileset approval valid
for at most one hour, and preparation of an exact integrated Local review only.
The bounded packet scan found no grounded blocker (one document, no final cards,
one excluded candidate). No model or verification execution was authorized.

The helper's first syntax check failed on an extra closing parenthesis; this was
corrected before execution and the second syntax check exited 0. The execution
preflight confirmed revision 10, the registered Fileset, original model bytes,
A LOCAL_PASSED Evidence, B eligibility and an ABSENT target through existing
Fileset Preflight. Native `probeRepository` then returned GIT_OWNERSHIP, with Git
exit 128: the execution identity differed from the fixture owner. The helper
exited 1 before issuing approval or invoking Materialize. A subsequent read-only
Native Probe inspection retained the exact error. No security diagnostic helper,
Git safe-directory override, ownership change or materialization retry was used.

Read-only persisted-state inspection exited 0 and confirmed:

- Task revision 10 and candidate
  `65e166c6184862c6b9bbb2d70bad67c63a9365c0a6109a9fe44e2cfd02394862` unchanged.
- B Fileset WAITING_APPROVAL, no issued B approval, no B file, Materialize calls 0.
- Original repository files, A Evidence, existing artifact inventory and prior
  Decision/Attempt rows preserved. Remaining budget stays 2 Attempts / 110000 ms.
- No new model call, test, verification Decision or Attempt.

Evidence: local `.codefleet/p0-c-evidence/b-materialize-01/blocked.json`,
`native-probe-blocker.json` and `blocked-status.json`. The last report is the
authoritative observation for this blocked application attempt. There is no
successful materialization receipt and no actual integrated candidate to review.
Review Hash, Command Hash, Request ID and expiry for integrated verification are
therefore NOT_PREPARED; the earlier staged request is not an execution grant.

Conclusion: B application is BLOCKED by the Native Git ownership gate; P0-C remains
incomplete. Next action requires an explicitly authorized new application attempt
in a Host execution context accepted by Native Probe for the fixture owner, then
fresh live checks and approval issuance. The user's no-retry instruction is
preserved. Integrated verification remains separately approval-gated.

### Normal sandbox resumption: BLOCKED_ENVIRONMENT

2026-10-27 05:48:07 UTC, same baseline; execution preflight only. The user explicitly
authorized a new B attempt using the normal sandbox that had succeeded for A,
with no elevation, alternate user, ACL changes or Git ownership bypass.
The existing application helper was reused with a fresh `b-materialize-02`
evidence directory and Native Probe before approval. The Host tool was called
with `sandbox_permissions: use_default`. Nevertheless, Native Probe in the actual
Node process (PID 44632, Windows, Node v24.14.1) reported GIT_OWNERSHIP/exit 128:
the effective execution identity still differed from the fixture owner. The tool
request does not establish that the earlier eligible sandbox was reproduced.

The helper exited 1 with BLOCKED_ENVIRONMENT before opening a writable Store,
issuing approval or invoking Materialize. No automatic retry, account switching,
security helper, permission escalation or product change was performed. This is
an unavailable eligible execution environment, not a product defect.
The original blocked attempt and A/Session 1/Session 2 evidence remain intact.
Local records: `.codefleet/p0-c-evidence/b-materialize-02/` contains
`execution-environment.json`, `blocked.json` and a read-only `recovery.json`.
The environment record's execution label describes the requested path, not
successful identity enforcement; its Native Probe error is the actual observation.

Conclusion: no new approval/expiry, Materialize 0 calls, B SHA-256 unavailable.
Revision 10 and the pre-B candidate remain; B remains awaiting Fileset approval.
Exact integrated Review/Command hashes, Request ID and expiry remain NOT_PREPARED.
Next action requires the Host to make the already-approved normal sandbox path
available; no substitute execution identity is authorized. Integrated tests,
additional model calls and completion remain NOT_RUN/incomplete.

Read-only Recovery exited 0, confirmed revision 10, no uncertain effects, absent
B target and the original A Evidence SHA-256. Documentation link/fact checks both
exited 1 because their Git tracked-file enumeration exited 128 in the available
execution context; these checks are not reported as passed. No elevated rerun was
requested under this authorization.
