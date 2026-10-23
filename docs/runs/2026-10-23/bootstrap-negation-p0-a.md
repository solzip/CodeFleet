# P0-A Bootstrap objective negation

- Date: 2026-10-23
- Baseline: `main`, `f5b93a35ec9140d5e37dadf8d6ddc9e7c6fce8ed`; remote main matched at preflight.
- Type: scoped implementation and offline regression; uncommitted working tree.
- Predecessor: [execution roadmap](../../CODEFLEET_CODEX_EXECUTION_ROADMAP.md), section P0-A.
- Number allocation: none; P0-A is the supplied roadmap label, not a new legacy audit ID.
- Environment: Windows PowerShell, Node v24.14.1.

## Change and counterexamples

`src/intent/bootstrap.mjs` retains privileged-term detection but excludes only
occurrences within recognized explicit prohibitions. Korean coordinated targets
and English `do not`, `don't`, `never`, `no`, and `without` forms have bounded
scope. It does not delete a matched term globally. A separate positive occurrence,
conditional wording, double negation or an unrecognized construction still
requires clarification. This is a conservative grammar, not general language
understanding or an execution policy.

`test/bootstrap.test.mjs` adds 36 sentence cases and one persisted lifecycle
regression. Examples include `Git Push와 배포는 하지 마`, `Do not deploy or push`,
`without deployment`, `배포 제외, 로컬에서만 실행`, active deployment requests,
`배포하지 말고 운영 DB 삭제해 줘`, repeated negative/positive occurrences,
`Not without deployment`, `Push 금지 해제`, and ambiguous conditions.

The first 30 cases were run before the source change: 15 passed and 15 failed,
all failures exposing prohibited occurrences incorrectly retained as privileged
intent. After the change those 30 passed; six additional boundary cases were
then included in the final full Bootstrap run.

Original Objective storage and hashing, subject hashing, Task/Revision binding,
operator-only clarification, fileset approval, Capability and Evidence contracts
are unchanged. The added lifecycle test reaches a DAG for a prohibition-only
objective but rejects stale Draft submission and unapproved materialization;
Protected Verification remains UNSATISFIED. Existing clarification replay,
artifact tampering, expiry, scope, overwrite, recovery and public Host execution
guards are exercised by the existing suites.

## Executed verification

| Command | Exit | Result |
| --- | ---: | --- |
| `node --test --test-name-pattern="bootstrap objective intent" test/bootstrap.test.mjs` before fix | 1 | 30 tests: 15 pass, 15 fail; reproduced defect |
| Same focused command after initial fix | 0 | 30 pass |
| `node --test test/bootstrap.test.mjs test/bootstrap-verify.test.mjs test/bootstrap-process.test.mjs` initial regression | 0 | 66 pass, no skips |
| Same Bootstrap command after additional boundary cases | 0 | 72 pass, no skips |
| `node --test test/intent.test.mjs test/product.test.mjs test/host.test.mjs` | 0 | 50 tests: 48 pass, 2 Docker tests skipped |
| `node --test test/link-check.test.ts test/doc-citations.test.ts test/doc-facts.test.ts test/design-rules.test.ts` | 0 | 72 pass |
| `npm.cmd run posttest`, first run | 1 | New report's roadmap anchor was missing; corrected to a file link |
| `npm.cmd run posttest`, second run | 1 | Links passed; both README record counts needed the newly added report (108 to 109) |
| `npm.cmd run posttest`, third run | 0 | Coverage gate, links, citations and facts passed; no baseline relaxation |

The index and both README counters are updated only to account for this run
record; they do not change product capability claims. Posttest reuses existing
Legacy coverage and does not represent a new full Legacy/Alpha execution.

Local command logs are retained under `.codefleet/validation/p0-a-negation/`;
they are not public Evidence. No existing Task, Contract, Evidence, Worktree,
fixture or execution record was deleted. The pre-existing staged execution
roadmap was preserved byte-for-byte. No repository commit/push was performed.

The bounded decision-debt preflight scanned the user-selected roadmap, AGENTS,
CLAUDE and product principles. Its three blocking candidates were checked against
their actual cited text: future P1/P2 work is not a completed claim, distinct
verification backends are not stagnant conflicting decisions, and stable audit
IDs plus append-only corrections are compatible. These candidates do not block
P0-A. The excluded credential-related instruction and public identity warning
do not authorize publishing private execution records. No product rule was
replaced based on the scan.

## Conclusion

P0-A implementation and the scoped offline regressions passed. Valid planning
still grants no execution or verification authority. P0-B was not started.

## Next work

Stop for user review. P0-B requires separate authorization; its implementation
and protected execution boundaries have not been assessed or changed here.

## Unresolved and not verified

Full Docker/protected security suite NOT_RUN; the two skipped integration tests
remain unmet. Updated Codex/Claude Host Live and macOS/Linux execution NOT_RUN.
Arbitrary natural-language negation remains unsupported and conservatively
requires clarification when not recognized. No HOST_LIVE_VERIFIED or overall
product completion claim is made. Existing Windows ownership and native-vs-shell
exit-code observations belong to later work, not this fix.
