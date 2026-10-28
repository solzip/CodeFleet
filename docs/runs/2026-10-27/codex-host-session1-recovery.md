# P0-C: approved Codex Session 1 and separate-process recovery

- Date: 2026-10-27; Windows Native, PowerShell, Node v24.14.1.
- Baseline: detached `core-p0-1`, `19ddf671410e92fc9d9e4fa423aeb829981c5bfa`, with pre-existing uncommitted P0 work preserved. Root main was `4477e4426960af46076d3aa29808201c1c8911a6`; remote equality was not assumed.
- Type: one authorized Host proposal and persistent-state recovery observation.
- Predecessor: [internal recovery and approval preparation](codex-first-objective-recovery.md); [recovery contract](../../implementation/objective-recovery.md).
- Existing REGISTER maxima: P0-17 / P1-61; no new defect ID or closure assigned.

## Authorization and preflight

The user explicitly approved the prepared Session 1 packet for Task
`task-8f9e7574-8485-48d9-b441-09a559dcc521`, revision 6: one Codex CLI invocation,
`gpt-6-astra` / `medium`, 300 seconds, 2 MiB capture, existing Host authentication,
no resume/retry. Unmetered dollar usage was explicitly accepted. The original
pending-approval packet was preserved; the separate call receipt records this grant.

The live Task, Objective, DAG, candidate, WorkItem `normalize`, fixed input bytes,
prompt, schema and executable hashes matched the packet. Only
`src/normalize-title.mjs` was permitted as proposal content. Existing fixed-tests
materialization and receipt were valid; no active lease, Decision, reservation or
uncertain effect existed. P0-B's distinct repository and State inventory stayed intact.

The packet-only Decision Debt scan found zero final blockers and excluded one
insufficiently grounded candidate. It does not certify the complete repository.
Initial authentication inspection under the sandbox account returned exit 1,
`Not logged in`; user-account inspection returned exit 0, ChatGPT authentication.
An initial feature inspection returned exit 2 because exec-only flags were passed
to `features list`; corrected feature inspection passed. Neither error called a model.

Codex CLI 0.162.1 supported the pinned arguments. Apps/plugins/multi-agent were
disabled; the packet disabled web search and selected approval never and read-only
sandbox. A no-write probe attempted to open existing repository/State files for
writing and received EPERM for both, with zero bytes written. This is a scoped
confinement measurement, not full Host Sandbox certification. Command abstention
was a prompt restriction with event monitoring, not an independently enforced
absence of all shell capabilities.

## Actual Host result

| Observation | Result |
| --- | --- |
| CLI invocation | Exactly 1; exit 0; no launcher retry or resume |
| Model / reasoning | `gpt-6-astra` / `medium`, exact pinned invocation |
| Host thread | `01a17b45-e11a-7130-8e4a-1c3821c4f6bf` |
| Host PID | 48896; close observed, PID no longer alive |
| End time | 2026-10-27T02:52:30.666Z |
| Duration / capture | 11,361 ms / 1,864 bytes |
| CLI token report | input 16,927; output 375; cached input 0; reasoning output 0 |
| Internal request count / USD | UNKNOWN / UNKNOWN |
| Tool activity | No tool event observed; one agent-message result |
| Fixture effects during Host call | Repository and State byte inventories unchanged |

The model proposed an exported `normalizeTitle(input)` that calls `input.trim()`,
throws for a zero-length title and returns the trimmed title. The response's stale
generic statement that a model-call approval is needed does not override the
user's actual consumed Session 1 grant.

Pinned response bindings and exact fields passed validation; existing
`validateFileset` accepted the one planned file, 168 bytes, SHA-256
`1de99612644ad675a36e16a8d1a0a9c8a1e1c7db10ebf6ff5b9adb99be9c13d4`.
No semantic execution or test pass is claimed. Authority is PROVIDER_REPORTED_ONLY.

The CLI wrote its final proposal artifact before normal process exit. After exit,
the coordinator persisted the receipt and submitted the proposal through existing
`submitBootstrapFiles`; no materialization or approval issuance occurred. This
ordinary proposal-record transition advanced Task revision **6 → 7**.

- Proposal observation artifact: `5c610c2be70433ce26e4b50ff53214547760f1c49c4671746cfad6b8a40bb425`.
- Fileset run: `task-8f9e7574-8485-48d9-b441-09a559dcc521-normalize-r6`.
- Fileset hash: `086603b543afec439464699f09c989384f274954786fa4eb8f2ce105096e7123`.
- Run state: WAITING_APPROVAL; approval request authority REQUEST_ONLY.

## Separate-process recovery

After Host termination and proposal persistence, Node PID **672** invoked the
existing `objective recover TASK_ID BINDING.json --state STATE` CLI, exit **0**.
It was a new process, not a function re-call inside the first Codex process, and
was not a second Codex model session.

The recovered Objective ID matched, revision was **7**, and the Workflow hash
remained `6b86ce71bb9f1f1465d0885f050e228201becb5fc63f0f18c3f3f4b6b9041047`.
Candidate remained `5c817452787f0760e51cc33799b79821e1bec5f69f761ec8f163a752d31eba29`.
`normalize` was FILESET_PROPOSED; next was AWAIT_FILESET_APPROVAL.
`verify-normalize` awaited A materialization; `todo` awaited A verification.

All State table rows, artifacts, previous receipt and Work Log were preserved.
The recovery projection matched the post-record projection exactly. Attempts
remained 0 used / 3 remaining; reserved time 0 / remaining 120,000 ms; retry false.
There were no consumed Local Decisions/Attempts in this fresh fixture to recover.
The separate Host-call receipt retains the consumed 1-of-1 invocation; this is
not a Local verification Attempt or a reset of Host billing. P0-B was unchanged.
No execution/model grant, automatic replay, new approval, duplicate run or source
write occurred. No uncertain effect existed here; new crash/fault injection was
not performed, and prior negative-test evidence remains historical evidence.

**Read-only limitation:** the CLI's existing Store opens SQLite in read-write WAL
mode and performs idempotent schema initialization. All logical rows and artifacts
were unchanged, but `state.sqlite` bytes changed and WAL/SHM sidecars appeared.
Thus logical read-only recovery was observed; byte-for-byte read-only database
opening was **not** established. No repair or additional recovery was attempted.

Local raw receipts and scripts are in `.codefleet/p0-c-evidence/`, primarily
`session1-approved-02/`. Earlier preflight failures remain in `session1-approved-01/`
and the second directory. Raw records contain private machine paths and are not
publication artifacts. `recovery-result.json`, `recovery-byte-differences.json`,
`record-receipt.json`, `validation.json`, and `session2-prerequisites.json` carry
the detailed bindings. Product source and tests were not changed in this session.

## Conclusion

Documentation checks: links and citations exit 0 (existing historical citation
warnings retained); initial facts check exit 1 because adding this record increased
the measured audit/run count from 119 to 120. The two README declarations were
updated to the measured count; no coverage or anchor baseline was changed.
Final facts check and `git diff --check` exit 0. These are documentation checks,
not Local proposal execution or regression acceptance.

One actual Host proposal and separate-process logical recovery were observed.
Objective remains incomplete; no A/B implementation or Local verification ran.
Session 2 and actual compaction recovery are NOT_RUN.

## Next work

Separate exact A Fileset approval is required before application, then a fresh
Local verification approval and A Evidence. Only then can an exact Session 2 B
packet bind the current revision/candidate, verified A Evidence, WorkItem `todo`,
fixed inputs, recovery/context/prompt/schema/executable hashes, exact arguments,
time/output limits and cost acceptance. That packet is currently **not constructible**;
`session2-prerequisites.json` is a blocked handoff, not execution authority.
The Session 1 grant cannot be reused. Stop at the user's requested boundary.

## Unresolved

Byte-read-only CLI recovery, actual two-Codex-session continuation, compaction,
semantic proposal correctness, A/B execution and integration, Protected Evidence,
macOS/Linux behavior, internal request count and dollar metering remain unverified.
No regression or Local tests were run under this proposal-only authorization.
