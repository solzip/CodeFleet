# Trusted public delegation boundary

- Date: 2026-10-28.
- Baseline: core-p0-1 detached at `19ddf671410e92fc9d9e4fa423aeb829981c5bfa`; existing uncommitted work preserved.
- Type: installed Host protocol inspection, minimal public capability/validation fixes and negative regression.
- Predecessor: [HEAD-bearing supervised Live acceptance](public-existing-local-v2.md).
- Numbering: descriptive run; no audit number allocated.

## Result

**SUPERVISED_READY** remains supported by the predecessor's actual implementation,
11 passing tests, consumed Decision, Evidence and COMPLETE_LOCAL. This run does not
relabel that evidence as authenticated autonomous execution.
**AUTONOMOUS_READY is not achieved; PUBLIC_DELEGATION_BLOCKED remains.**
No new model call, application Fileset, verification Attempt or Live delegation
was executed. No human-intervention reduction was demonstrated in this run.

## Actual installed interface

`codex-cli 0.162.1` generated its official experimental App Server JSON schemas
without starting a server, calling a model, reading credentials or changing settings.
Local raw output is under `.codefleet/public-delegation-01621/schema`;
`protocol-observation.json` records schema digests and top-level response fields.

| Response | Observed fields | Authority limit |
| --- | --- | --- |
| CommandExecutionRequestApprovalResponse | decision | Client decision, including acceptForSession; not an independently verifiable CodeFleet Objective grant |
| FileChangeRequestApprovalResponse | decision | File approval, not permission to issue future CodeFleet Decisions |
| PermissionsRequestApprovalResponse | permissions, scope, strictAutoReview | Host capability permission, not Objective/Contract/WorkItem/budget approval |
| AttestationGenerateResponse | token | Opaque client attestation; no CodeFleet-verifiable user-consent receipt established |

The [official App Server documentation](https://learn.chatgpt.com/docs/app-server)
describes server requests answered by the client and desktop upstream attestation
provided by that client. A process controlled by the Agent can supply those responses.
Authentication of a transport/client or Host account is not proof that a human approved
a particular Objective and its limits. This is a limit of the inspected public protocol
and the currently connected integration; it is not a claim that no trusted Host UI can exist.

The missing connection must authenticate consent independently of the executing Agent,
bind the Objective/Contract revision, WorkItems/files/commands/backend, budgets,
expiry/revocation, and keep approval/issuance authority inaccessible to model tools.
No such source or trusted decision issuer is connected here. Another approval message,
locally generated key, actor string, mock UI or JSON transcript cannot fill that gap.

## Reused implementation and actual changes

The existing BootstrapOperator and Reservation remain the only signed decision path.
Its current batch delegation is explicitly verification-only, with fixed candidate/command,
modelCalls zero and sourceChanges false. Extending this to source-changing WorkItems
would require both authenticated approval transport and a scoped trusted issuer;
neither may be inferred from successful internal verification batches.

- `src/hosts/bootstrap-operator.mjs`: reject unsupported delegation-scope fields
  and WorkItem fields rather than silently dropping requested source/model authority.
- `src/hosts/exchange.mjs`: expose exact missing authority, internal scope and
  supervised next action through existing Host capabilities. The legacy
  operatorAuthorization identifier is retained for compatibility; the new detailed
  boundary does not mandate another OS account or persistent approval server.
- `src/hosts/cli.mjs`: capabilities/help join doctor on the Store-free read path.
  The actual public command initially failed trying to initialize the default home
  State directory. After the fix, it succeeds without that write or extra permission.
- Existing tests now reject accept/acceptForSession/client-attestation/claimed-human
  payloads as signed delegation, unsupported scope, and attempted scope expansion
  even with a fixture signature. Decisions, accepted delegations and reservations
  remain zero on those rejected paths. Fixture signers are never public authority.
- Public CLI tests confirm capability inspection and malformed arguments do not
  create a State directory.

No new engine, DB, signer, service, daemon, OS identity or credential was introduced.
No existing Evidence, STATE or source was removed. No Git commit/push/PR/merge occurred.

## Validation

Windows, PowerShell, Node 24.14.1. Actual public capabilities command: exit 0.
Store-free capability tests: 2 PASS, exit 0 (run after the Store-free fix).
Operator and Host regression: 63 PASS, 0 FAIL, 1 optional Docker SKIP, exit 0;
raw windows-mxc-01/evidence/regression-1793156102094.{json,log}.
The broad run preceded the Store-free fix; the two focused tests validate that later change.
Internal tests are not Host Live consent.
Old supervised Live bindings remain in the predecessor; no new Live Decision or Evidence exists.

## Conclusion and next step

The safe result is SUPERVISED_READY, not autonomous completion.
Next required capability: a real Host/Operator integration exposing authenticated,
scope-bound user consent and an issuer isolated from Agent control. Once available,
connect it to the existing Operator/Reservation and test two source-changing WorkItems.
Until then, retain exact supervised Fileset/Local approvals; no repeat consent request
is presented as a technical solution. Human click count, new completion-time comparison
and monetary cost were not measured.
