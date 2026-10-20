# H1 supervised Host acceptance packet

Status: prepared, **not authorized or executed**. See the [H1 record](../runs/2026-10-20/alpha-h1-host-acceptance-readiness.md). Start with one Codex agent; repeat in Claude only after the first vertical path passes. No parallel agents or automatic delegation.

H2 adds a code-enforced stop to public Host `requests/submit/run/resume`. The offline Operator ledger does not supply production identity enrollment or OS/IPC isolation. The steps below remain blocked until that deployment is implemented and independently tested; approval alone cannot unlock this build. See the [H2 contract](../implementation/operator-authorization.md).

H3 verifies a Linux UID/IPC prototype and protected Workflow guards. Its [runtime boundary](../implementation/operator-runtime.md) still requires deployment validation, a Host IPC client and a bounded execution service. The following live steps remain blocked; the offline fixture is not a substitute for those gates.

## Fixed scope

Run `node scripts/host-acceptance-prepare.mjs` from the trusted checkout to prepare separate temporary Git repositories. Its local `preparation.json` records paths; do not publish that file. Existing prepared paths are also in the ignored `.codefleet/host-native-checkpoint/h1-prepare-private.log`. Preparation does not create a commit or start a model. A sandbox-denied Docker check is BLOCKED, not a successful baseline.

Goal: “Fix subtraction using the protected regression tests.” Only `src/subtract.js` may change: replace addition with subtraction. Protect `test/subtract.test.js`, covering `subtract(5, 2) === 3` and `subtract(2, 5) === -3`. The actual Docker baseline has two failures. One WorkItem, one attempt, 120-second execution timeout, local delivery only. No network action, dependency install, source-checkout modification, API key, remote Git operation or deployment is in scope.

The preview contract is not an approved Task. Review the subsequently generated workflow and its actual hash; never reuse the preview hash as workflow approval. The USD field in the execution contract does not cap host subscription usage. Before any live turn, the operator must identify the host account mode and accept its usage limits. Do not migrate host subscription credentials into an SDK or API client.

## Mandatory permission gate

Two distinct authorizations are still absent:

1. Permission to create a **local fixture baseline commit** containing only the fixture source, protected tests and `.gitignore`. CodeFleet needs a clean committed baseline. Never commit the original checkout or installed runtime as part of this experiment.
2. Permission for one bounded live host scenario, with the host, fixture, session/account limits and proposal-only scope explicitly named.

Neither permission substitutes for execution-contract approval. The current `objective approve --actor` value is an audit label, not authenticated human identity. Unrestricted same-account shell access can reach approval commands and state. Before end-to-end live execution, demonstrate an enforced boundary preventing the host from writing trusted state, changing the trusted runtime, or running operator approval commands. High-risk approvals remain blocked. A Skill instruction or a user-written configuration file alone is not evidence that this boundary exists.

If that boundary is unavailable, restrict a separately authorized pilot to Skill discovery and an untrusted proposal; do not mark an approved end-to-end run or HOST_LIVE_VERIFIED. No automatic permission-bypass flags are permitted.

## Operator steps after the gates pass

1. Verify the fixture and installed runtime hashes against local receipts and [H1 evidence](../runs/2026-10-20/alpha-h1-source-evidence.json). Create the explicitly authorized fixture baseline, then confirm clean Git status. Keep state and response files outside the repository.
2. Open the selected existing host in its fixture. Discover the standalone Skill. Codex uses `$codefleet`; Claude uses `/codefleet` (its interactive `/skills` list can first confirm discovery). Record discovery separately from invocation.
3. Invoke the Skill with the fixed natural-language goal. Follow the [guide](host-native-guide.md): plan, review allowed files/protected tests, prepare, approval-request. Record Task ID, Workflow ID, revision and actual contract hash. An unapproved execution/request must be denied without a candidate run.
4. The operator reviews the real request through the enforced separate boundary and supplies approval. The Host requests one bound WorkItem and returns only structured edits. Host claims of testing remain Provider Reports; no host-produced approval or evidence is accepted.
5. The CodeFleet Harness applies the edit in isolation and runs baseline, candidate and final integration checks. Report Run ID, attempts, final tree hash and verified Artifact references. Require both tests passing, no skips, and a valid final report. Never infer success from a model's message.
6. With separately reviewed tasks, inspect cancellation and stale/duplicate responses. A cancelled task must not resume; a consumed or old binding must not create another execution. Missing or changed evidence must invalidate the report. Do not tamper with the successful run to manufacture a second success.
7. Save sanitized command outcomes and Harness artifacts, not host credentials, raw conversation histories or personal paths. Repeat with Claude using the same domain criteria only after Codex passes.

Actual role delegation and multi-agent collaboration require a subsequent scope and evidence linking each host agent to a CodeFleet WorkItem. Current role labels and scheduler tests prove no live delegation.

## Official interfaces checked

- [Codex skills](https://developers.openai.com/codex/skills/): repository `.agents/skills` discovery and explicit invocation.
- [Codex app-server](https://developers.openai.com/codex/app-server/): `skills/list` is distinct from starting a thread or model turn. H1 used only initialization and discovery in a clean temporary home.
- [Claude Code skills](https://code.claude.com/docs/en/skills): project `.claude/skills` and standalone slash invocation. H1 did not start an interactive Claude session.

Install success, actual discovery, actual invocation, host execution and independently verified completion are separate acceptance claims.
