# H4 Host IPC and restricted Harness

H4 extends the H3 Operator runtime; it does not create a second Coordinator, Judge or policy engine. The installed Codex and Claude Skills use `runtime/hosts/ipc-client.mjs`. Runtime startup remains an administrator responsibility, outside the AI account. A Skill installation is not trusted-service provisioning or Host Live verification.

The supported offline topology is Linux Agent UID → filesystem Unix socket → Python SO_PEERCRED bridge → private Node worker → existing workflow controller → Docker Verifier → existing Judge/Evidence report. Both UIDs must be distinct and non-root. The Agent cannot write code/config/catalog or read private state/repository/workspaces. Candidate test containers receive only a read-only disposable snapshot and the existing verification guard, no Operator state or Docker socket. Trusted administrators and deliberate credential/descriptor delegation are outside the boundary.

## Protocol and ownership

Each connection sends one newline-terminated JSON object: `{version:1,requestId,method,params}`. Request IDs are caller-generated UUIDs (bounded ASCII IDs are accepted); persist the ID before sending. The request limit is 65536 bytes including newline, ingress deadline three seconds, worker-response deadline eight seconds, response limit 262144 bytes, client deadline ten seconds. Large existing staged packets may exceed this stricter IPC limit and are refused; there is no silent fragmentation or scope truncation. Timeout means unknown outcome, never successful completion.

The existing private SQLite Store holds a journal keyed by kernel UID and request ID, with a canonical payload digest. Reservation commits before dispatch. Identical retries return the original response with `replay:true`; conflicting payloads fail. A reserved entry without a response requires reconciliation and is never re-executed. Status and result responses are snapshots; use a fresh request ID to refresh them. No cache response authorizes new execution. Entries are not pruned automatically in this slice.

| Method | Exact params | Meaning |
| --- | --- | --- |
| propose | runId, goal | Inert natural-language proposal for a provisioned run; no authority to change scope |
| plan | runId | Fixed contract/hash, DAG, WorkItem roles |
| requests | runId, host | Existing staged WorkItem context, bound to contract/revision/base |
| submit | runId, host, response | Existing proposal-only exchange; response has requestId/bindingHash/proposal |
| approval-request | runId, itemId | H2 bound request for risky assignment, never a decision |
| execute/resume | runId, host | Existing controller and default Docker verifier, asynchronous ACCEPTED receipt |
| status/result/verify | runId | Existing runReport and independent stored-evidence/candidate recheck |
| pause/cancel | runId | Existing control fence |

`host` is codex or claude, a routing label, not identity. Neither an actor label, UID in JSON, Hook, model response nor client installation grants authority. H4 requires the versioned Agent interface; H3 unversioned Agent methods cannot bypass it. Unknown fields/methods fail. There is no shell, SQL, evidence submission, completion setter, provider selection or authentication forwarding API.

Natural-language proposals do not automatically create an executable contract. The administrator must provision validated existing G3–G6 workflow contracts in the private catalog. New task scope and arbitrary WorkItem additions remain BLOCKED. Confined work inside that scope needs no per-action human grant. Existing role/DAG scheduling is reused; Host automatic delegation is not claimed.

## Approval and execution

The service validates protected repository ownership/ancestors. The bridge checks protected config/state/workspaces, code tree and executables before starting the worker. H3 guard checks catalog hash/revision, graph artifact, source delivery and policy; the existing controller checks active Lease and guarded effects, stages immutable proposals, verifies baseline/candidate/integration and records evidence. Report verification rehashes artifacts and candidates. An ACCEPTED receipt, proposal, assignment or process exit never substitutes for a verified report.

H4 deliberately refuses every decision on its Operator IPC and every risky Harness execution: a kernel UID identifies a process, not a physical person's reviewed approval. H3's separate offline decision tests remain preserved. No configuration flag or Agent message enables human approval in H4. Remote writes and capability expansion remain unsupported. Do not mix the H3 prototype ingress and H4 service against the same live state.

Worker death leaves the existing Lease/STARTED records. Resume uses the existing controller's recovery fence and cannot relaunch an unconfirmed child; uncertain journal entries also cannot replay. Graceful service close requests pause. An abrupt broker/worker kill can leave a bounded verifier container until its timeout; it is not proof of cancellation completion. Existing container ownership/reconciliation rules still apply. No automatic retry of unknown external effects is introduced.

## Deployment and offline reproduction

Add `hostService:true` and a private absolute `workspaces` directory to H3 trusted config. Optionally provide `dockerSocket`, a private Operator-owned Unix socket whose ancestors are protected; the bridge alone sets DOCKER_HOST from this trusted config. Keep Docker authority wholly outside the Agent account. The service uses absolute trusted Node/worker paths as in H3; Agent-side code only needs the supplied socket and provisioned Run ID. Never execute AI-authored code in the Operator account.

The Docker fixture has a root provisioning driver, Operator UID 1000 and Agent UID 1001. It creates a disposable named volume with identical daemon/container paths for actual bind mounts. Docker Desktop's root-only socket is not chmodded: a **fixture-only** root Unix transport delegates a private socket to UID 1000 and verifies peer UID. This transport is broad Docker authority, not another policy engine and not a production deployment solution. Agent and candidate containers cannot access either socket. The fixture copies only source/test fixtures, not host credentials or user configuration. It creates/commits only its disposable project baseline; the CodeFleet worktree is not committed.

Build `test/fixtures/host-ipc.Dockerfile` on the prepared H3 local image. Git and Docker CLI packages require repository downloads at image preparation time; execution runs network-disabled with a pinned resulting image ID. The Dockerfile is not a fully reproducible distribution lock. Set CODEFLEET_HOST_IPC_IMAGE to that immutable ID and CODEFLEET_TEST_DOCKER=1, then run `npm run test:host-ipc`. Full regression additionally requires the existing Operator, Maven and local Java prerequisites. No model or direct provider API is invoked.

Windows native, actual WSL2 deployment, live Codex/Claude confinement, physical human approval and automated multi-agent Host delegation remain BLOCKED/unverified. Do not generalize the Docker Linux fixture to those environments. Next acceptance requires administrator-audited protected deployment, a separate authenticated human decision channel, then explicitly approved small-repository Host Live scenarios.

Primary references checked for this design: [Linux Unix socket credentials and pathname permissions](https://man7.org/linux/man-pages/man7/unix.7.html), [Docker bind mounts are resolved on the daemon host](https://docs.docker.com/engine/storage/bind-mounts/). These document OS/tool behavior, not CodeFleet deployment certification.
