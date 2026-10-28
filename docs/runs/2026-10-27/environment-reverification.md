# Environment-only same-candidate reverification

- Date: 2026-10-27
- Baseline: core-p0-1, `19ddf671410e92fc9d9e4fa423aeb829981c5bfa` plus preserved local implementation; not GitHub main
- Work: bounded Core implementation and internal Windows MXC regression
- Predecessor: [Windows MXC product sprint](windows-mxc-product-sprint.md)
- Numbering: descriptive run filename; no audit number allocated

## Actual failure and policy boundary

Todo Calendar's original Local verification remains 7 pass / 1 fail, exit 1.
The subsequent single-request diagnosis observed a live server after listen and
`connect EACCES 127.0.0.1:61803` (errno -4092); no app or test edit is justified.
Classification is ENVIRONMENT_OR_CAPABILITY. Acceptance root evidence contains
`http-cause-diagnostic.json` and `environment-repair-handoff.json`.

The actual user's Codex 0.162.1 config/read with the same MXC session override
returned windows.sandbox=mxc, overriding the user's elevated default. Permission
profiles and network settings were unset; configRequirements/read returned no
requirements. A first query from the default tool sandbox read the sandbox
account's configuration and was excluded from Host-policy conclusions. The
actual runs explicitly selected :workspace with managed config included.
They denied loopback connect. Unset allow_local_binding is not an observed true
or false effective value; network-disabled behavior is directly observed.

Official references: [Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox),
[permission configuration](https://learn.chatgpt.com/docs/config-file/config-reference),
[App Server configuration APIs](https://learn.chatgpt.com/docs/app-server).
MXC managed networking requires effective allow_local_binding=true. This is not
a single-port allowlist: it permits host loopback services and relaxes private
destination checks; domain rules still constrain proxied traffic. A proposed
execution-only profile extends :workspace, enables the managed network proxy in
limited mode, and allows only 127.0.0.1 in its domain map. It must not be activated
without separate user permission and effective policy validation. No global
network setting, ACL, OS account or Git exception was changed.

## Implemented product path

Native Local environment-step prepares an exact target-policy review. A trusted
Host observation is required before a new Decision. Existing reservations enforce
one-use consumption, unchanged source/test/command/candidate, current contract,
finite attempts/time and policy rechecks. A validated successor link preserves
the original failed Evidence after a new Attempt attaches its result. Completion
also rejects a reservation whose policy Evidence is corrupt. No new database,
issuer, engine or scheduler was introduced. The same-user supervised trust level
and signed Operator guard are unchanged.

The stock CLI has no effective-policy observer. It refuses execution without the
trusted embedding observer; a config/read response or Agent-supplied receipt is
not a replacement. Internal fixture observations are explicitly labeled fixtures.
The Windows Host observer integration remains a release blocker, separate from
the now-supported Core environment transition.

## Verification

Windows MXC, Node 24.14.1, PowerShell. The first combined internal run passed
171 tests, failed/skipped 0, exit 0. Suites: environment recovery, source repair,
reservations, native Local, Local acceptance, Objective recovery and continuation.
Raw evidence: `regression-1793089882031.log` and its JSON receipt in the acceptance
evidence directory. The final targeted rerun includes later provenance/integrity
hardening: 74 pass, 0 fail/skip, exit 0 in `regression-1793090221013.log` and its
JSON receipt (environment recovery, Local acceptance, reservations). These suites
overlap; their counts are not added into a unique-test claim. The final environment
suite contains 20 cases, including corrupted policy artifacts and stale policy.

Link and citation checks passed (historical citation warnings retained), and
git diff --check passed. The initial fact check detected README counts left at
125 after adding this run (measured 126). Only the counts were corrected; no
coverage or anchor baseline was changed. The first check receipt is preserved in
the ignored sprint workspace as `environment-checks.json`.
After the correction, the fact checker exited 0 with 42 declarations and zero
mismatches. Final preparation audit verified all ten Todo file hashes, unchanged
Revision 11/candidate, one original Decision/Attempt only and no uncertain effects.
Its private receipt is `environment-preparation-audit.json` beside the review.

`environment-review.json` was generated without activating networking or issuing
a Decision. Review Hash: `027074d2fea04b9994b76feb44edf04a1ccf10244339972afeeb364c7476722d`.
Target policy Hash: `6baff0552458da89b37c01bee07aa815a79785f24d8f5d6e6fab950692714f02`.
The packet explicitly retains BLOCKED_CAPABILITY for absent Host observer support.
One attempted inline preparation exceeded Windows command-line length before Node
started; the bounded existing sprint preparation pattern was used successfully.

Tests use an external isolated fixture capability gate. They execute real Node
tests before/after changing that fixture capability without changing candidate
files. They do not establish MXC networking or Todo browser acceptance.

Todo Revision 11, Candidate `2b73662219f58a59ff72af12f0234f1d6947f27bfd7d5c8595228ed134a4e85a`
and failure Evidence `46088cdf899866b27732de676bb3a710422ec65e631275e99ca24a3e302ea338`
remain unchanged. No new Todo Decision/Attempt, integration test, model call or
source edit was authorized or performed. Remaining persisted budget is two
attempts / 90 seconds; proposed additional execution is capped at one / 30 seconds.

## Conclusion and handoff

Core same-candidate transition is implemented and internally exercised; actual
MXC environment recovery and Todo integration are not accepted. Local acceptance
remains unsatisfied, Protected remains unsatisfied, browser E2E remains not verified.
Next: approve a concrete bounded Host policy change, obtain a real effective-policy
observer, then consume a fresh exact review for one integrated Attempt. Never
activate the profile or synthesize an observation solely to make the review pass.
Unresolved: Host observer integration, permitted live networking, live integration
result, browser acceptance; no Git publication performed.

## 2026-10-28 Native Local continuation

The user selected ordinary supervised Local execution instead of MXC runtime
policy attestation. The stored revision 11 workflow uses local-verification,
trusted-local-command and EXACT_LOCAL_COMMAND_TRUST; its Task is LOCAL_ONLY.
No acceptance criterion or Task revision was changed for this selection.

The existing environment-recovery path now recognizes one exact unprotected
Local profile. It records process context without claiming isolation or Host
policy attestation. Other policy claims retain the observer requirement.
New review provenance, command/candidate checks, one-use Decisions, reservations,
leases and budget controls are reused. Protected-required completion stays blocked.

Changed implementation: environment-recovery.mjs, native-local.mjs and
reservations.mjs; environment-recovery.test.mjs adds ordinary Local success,
Protected non-promotion, approval mismatch and invalid policy cases.
The supervised acceptance driver prepares a fresh Review, and executes only
when supplied its exact approved hash through a separately approved Host command.

Validation and Live outcome:

- Windows / PowerShell / Node 24.14.1: environment recovery, Native Local,
  source Repair, Reservation and Local acceptance suites: 118 pass, 0 fail,
  0 skipped, exit 0 (236951.7686 ms). Local evidence: regression-1793146761017.
- Links, citations and declared facts passed; 13 historical citation warnings
  retained. git diff --check passed. No protected/full regression claim.
- User approved Review 865f618037168db30401aa9cb4515c1b12fb9a2953979f657c9c2fcc49232ed5
  through the exact Host execution approval. Request windows-mxc-01-native-local-01.
- Original command ran once with 30-second reservation: 8 pass, 0 fail,
  0 skipped, exit 0; HTTP serving/private-path test passed. TAP duration 237.6238 ms.
- Candidate remained 2b73662219f58a59ff72af12f0234f1d6947f27bfd7d5c8595228ed134a4e85a.
- Decision 767c0d05-5f1c-411d-a362-bdee420cda12 consumed once.
- Attempt bootstrap-attempt-cffd3037-809e-4e07-bdf9-b993eef02b2e.
- Evidence fd5d0371f1da6e642d88ed26a38f838298b6495e62c66c85be361d35377c5081.
- Final revision 12, COMPLETE_LOCAL, CURRENT_CANDIDATE_ALL_CRITERIA_LOCAL_PASSED.
  Remaining 1 Attempt / 60000 ms; no uncertain effects; leases released.
- Old failure and new evidence plus all three context artifacts passed hash
  verification. Source/test changes 0, extra model calls 0, automatic retries 0.
  Host monetary usage remains UNKNOWN. Evidence/native-reverification-result.json
  in the private acceptance workspace contains the report and recovery snapshot.

Conclusion: the environment failure was recovered through supervised Native Local
execution with unchanged source and acceptance criteria. Protected remains
UNSATISFIED; this is not MXC isolation acceptance or total product completion.
Next: approve/start the app with npm.cmd start and perform actual browser E2E.
Unverified: browser interactions, restart persistence, MXC runtime attestation,
Protected verification, and cross-platform execution of this change.
