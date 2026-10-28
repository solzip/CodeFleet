# PR #9 final authorization boundary review

- Date: 2026-10-23; type: read-only product review and isolated counterexamples.
- Target Head: `683f323266c2647fb39dbbbaa8dfe3788c05288a`.
- PR: [#9](https://github.com/solzip/CodeFleet/pull/9), OPEN at inspection.
- Predecessor: [R1/R2 repair](../../runs/2026-10-23/durable-reservation-final-review-fix.md)
  and [reservation contract](../../implementation/bootstrap-reservations.md).
- Number inventory: prior maximum P0-17 / P1-61; AB1 is review-local, not a new Legacy ID.
- Environment: Windows PowerShell / Node v24.14.1; one Agent.
- Scope: authorization issuance, execution, expiry/revocation/consumption and CI.
  No product changes, commit, push or merge. Review documentation only is changed.
- Verdict: **NEEDS_FIX** against the requested Operator-only/Agent-no-self-approval
  acceptance criteria. R1/R2 fixes are not reopened by this finding.

## AB1 — Operator-only issuance is an assumed caller boundary

`src/alpha/cli.mjs:36` routes the ordinary `objective` command to productCli.
`src/product/cli.mjs:65` accepts authorize-local and passes caller-supplied files
directly to issueDecision. `src/product/reservations.mjs:54` validates shape and
bound values, but `src/product/reservations.mjs:56` validates actor only as a
nonempty bounded string. There is no independent Operator identity, approval
receipt or protected-channel check on this path. At
`src/product/reservations.mjs:69` the result is labelled LOCAL_OPERATOR.

An isolated test simulates an Agent able to invoke the ordinary CLI under the
same OS user and access the fixture Store. It uses the existing fixture to prepare
a materialized Task, inspects its command, authors actor/decision JSON, calls the
actual authorize-local CLI, then calls the actual verification CLI. No product
Operator proof or signer is provided. The bounded child only writes a counter in
the fixture directory. No real user project or P0-B Store is used.

```text
issuance: exit 0 / ISSUED
executions immediately after issuance: 0
execution: exit 0 / LOCAL_PASSED
executions after first call: 1
replay: exit 0 / historical LOCAL_PASSED
executions after replay: 1
remaining decision uses: 0
authority: LOCAL_EXECUTED; complete: false
```

The test asserts that Agent-authored input alone cannot issue authorization.
It exits **1: 0 pass / 1 fail / 0 skip**. This expected security invariant remains
a failing counterexample; successful reproduction is not reported as a passing
security test.

This is a CodeFleet authorization-record/dispatch boundary gap under the requested
threat model, **not OS privilege escalation**, a Protected Evidence promotion,
or evidence that actual Codex/Claude tool permissions were bypassed. An Agent
already granted arbitrary same-user shell access can invoke other programs too.
The test does not attest real Host tool approval enforcement.

The existing contract is candid: `docs/implementation/bootstrap-reservations.md:5`
defines a trusted local CLI/embedding path and excludes OS authentication and
same-user containment. `docs/implementation/bootstrap-reservations.md:36` explicitly
says actor is only an audit label and assumes a trusted caller. Thus this is not a
new contradiction of that narrower contract; the current implementation cannot
satisfy this review's stronger requirements 1 and 2. Passing expiry/replay tests
does not prove who was authorized to issue the original decision.

## Preserved boundaries and responsibility split

- Issuance inspects and persists a decision; it does not spawn the command.
  Execution separately rechecks the bound candidate, Task, decision, capability,
  budgets and fence before consuming/launching. The counter confirms this split.
- The Host allowlist rejects authorize-local for both Codex and Claude at
  `src/hosts/cli.mjs:110`. Public requests/submit/run/resume remain blocked by
  requireProductionHostIsolation at `src/hosts/cli.mjs:140`, before opening Store.
  The new probe checks all eight Host/action combinations and both issuance calls.
- Expired/revoked decisions cannot reserve or spawn; in-flight expiry/revocation
  hands off without refund. Consumed decisions return an existing result and do
  not launch again (`src/product/reservations.mjs:138` and
  `src/product/reservations.mjs:147`). Returning historical success is not a new
  execution grant. Fresh IDs remain subject to Task-level attempt/failure budgets.
- Existing Broker signature/actor tests exercise a different entry point. They
  do not test the ordinary objective authorize-local path against an untrusted
  same-user caller. Code and documentation align only within the trusted-caller
  assumption; the test coverage did not establish enforced Operator-only issuance.

## Local commands and results

```text
node --test .codefleet/pr9-authorization-boundary.test.mjs
exit 1; 0 pass, 1 fail, 0 skip (AB1 counterexample)

node --test --test-name-pattern="^(P1-B: (reject (expired|revoked)|revoked after|expiry after|expiry during|two actual CLI|launch limit|consecutive failure limit)|operator: (actor strings|actual public CLI|same-account))" test/bootstrap-reservations.test.mjs test/operator.test.mjs
exit 0; 11 pass, 0 fail, 0 skip; unselected cases NOT_RUN

npm.cmd run posttest
exit 0; coverage, links, citations and 42 declared facts checked; 0 fact mismatches
git diff --check
exit 0
```

Private probes and raw logs remain under ignored `.codefleet/`. An initial local
CI-log parser attempted UTF-8 on PowerShell's UTF-16 redirected output and failed;
encoding-aware parsing succeeded. No test result was inferred from that failure.

## GitHub Actions final results

[Alpha validation run 39919695036](https://github.com/solzip/CodeFleet/actions/runs/39919695036)
is COMPLETED / SUCCESS for the exact target Head, event pull_request. Both jobs
and all listed steps completed successfully; no failed/cancelled/pending jobs
were observed. Results were read using gh pr view and gh run view JSON plus logs.

| Job | Observed scope and result |
| --- | --- |
| [windows](https://github.com/solzip/CodeFleet/actions/runs/39919695036/job/120301667034) | Legacy 324/324; Host Core 13/13; Host exchange 18 pass / 0 fail / 1 skip; posttest and package install smoke successful |
| [linux-alpha](https://github.com/solzip/CodeFleet/actions/runs/39919695036/job/120301667211) | Full configured Alpha list: H6 7/7 plus remaining 320/320, zero fail/skip; Host Core 13/13; verifier smoke and quality/final-review scripts successful |

Linux prepared real Docker and enabled mandatory protected fixtures. Its logs
include P1-B finalization faults, key-order regressions and CLI competition.
Windows explicitly skipped its one Docker Harness case, which Linux executed.
Windows's configured job does not run the full reservation/Alpha suite; local
reservation evidence remains separate. The aggregate npm test command itself
was not run by this workflow: platform-specific constituent commands were used.

The earlier NOT_RUN statement about Linux/Docker described local verification at
that time. This completed CI now supplies Linux/protected-fixture evidence; it
does not establish Bootstrap Protected completion or real Host Live. macOS and
actual Codex/Claude Live remain NOT_RUN. AB1 is not in the committed suite, so CI
success cannot close the newly tested authorization requirement.

## Minimum repair scope

Keep approval issuance separate from execution and preserve the current binding,
budget, lease and Evidence checks. Establish an externally enforced Operator
entry boundary for both issuance and execution, using the existing Host/Broker
facilities within actual supported capabilities. While that capability is
unavailable, the untrusted/public route must fail closed; retain trusted offline
embedding only as an explicit test/local contract. Actor names, an environment
flag, another self-authored JSON field or a freely readable token cannot prove
Operator authority. Broad arbitrary same-user shell access cannot be made
Operator-only by checking a string in this module.

Affected scope is the public objective dispatch/authorization boundary, relevant
contract/help and negative CLI tests. Do not create another Agent engine, Broker
database or scheduler. Any chosen enforcement must be verified at the actual
Host/OS boundary; no implementation is authorized or performed by this review.

## Conclusion

NEEDS_FIX: public Host restrictions and durable decision consumption hold, but
ordinary CLI issuance does not enforce Operator identity against a same-user
Agent. CI is green for its configured coverage, not for AB1.

## Next work

Agree and implement the minimal enforced issuance/execution entry boundary,
then rerun AB1 and existing reservation/security regressions before merge.

## Unresolved

AB1; actual Host enforcement/Live, macOS, same-user containment, orphan-child
cleanup, TOCTOU and disk/power-loss qualification. No commit/push/merge performed.
