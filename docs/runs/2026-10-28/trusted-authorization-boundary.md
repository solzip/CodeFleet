# Trusted authorization availability and supervised distribution

- Date: 2026-10-28.
- Baseline: core-p0-1 detached at 19ddf671410e92fc9d9e4fa423aeb829981c5bfa; dirty work preserved.
- Type: official Host readiness query and installed-package verification.
- Predecessor: [Public delegation boundary](trusted-public-delegation.md).
- Numbering: descriptive run; no audit number allocated.

## 1. Observed authentication boundary

Installed codex-cli 0.162.1 on Windows returned providerUnavailable from exactly one experimental userVerification/status request: "User verification is not available in this build or account." The local stdio App Server received initialize, initialized and status, then exited 0. Credential presence was false. No enrollment, signature request, model call or credential export occurred.

The [official App Server documentation](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) distinguishes supported local UI/plugin paths from arbitrary clients. The [native implementation](https://github.com/openai/codex/blob/main/codex-rs/user-verification/src/lib.rs) inspected for this run gates platform support on macOS. These moving sources explain the observation; they do not certify other installed versions.

The installed experimental schema signs decoded challenge bytes with P-256/SHA-256 DER ECDSA. This primitive alone does not authenticate human approval of Objective scope: trusted confirmation UI, identity, exact scope, expiry, revocation and request correlation remain necessary. No public Windows issuer was established. Agent signatures, client approval responses, process separation and same-user key storage were not substituted.

Local raw artifacts: .codefleet/public-delegation-01621/user-verification-status.mjs and user-verification-status.json. The reader is a readiness query, not an authorization adapter. Availability will not be probed again without a relevant Host capability change.

## 2. Actual product change and execution

scripts/alpha-package-smoke.mjs now accepts --supervised-only with an existing --repository and optional paired --recovery-state/--recovery-task. It rejects --real-provider, invalid options and incomplete recovery bindings before packaging. The existing default smoke still creates fixture commits and was not executed.

The new mode installs the actual npm tarball offline, installs its Codex Skill, executes the installed runtime's capability and existing-HEAD planning commands, recovers the supplied Objective read-only, compares repository hashes and exercises Skill status/disable/enable/remove. It reuses existing install, Local tree, planning and Recovery code. Capability inspection must not create State or grant public delegation.

Executed on Windows PowerShell / Node 24.14.1 with ordinary-user Host permission:

    npm.cmd run alpha:package-smoke -- --supervised-only --repository ACCEPTANCE_PROJECT --recovery-state ACCEPTANCE_STATE --recovery-task task-99a19937-cd46-417d-82da-c78f0f1cf894

The paths identify the existing public-head-01 acceptance copy, not the operating Todo project. Exit 0. Offline install, installed CLI/Skill, HEAD recognition, repository preservation, lifecycle and uninstall passed. Recovery returned RECOVERED, no unresolved effects and no remaining work. Application tests, model calls and Git mutations were not executed.

Artifacts remain in codefleet-packaged-JRorfm under the user's temporary directory. codefleet-0.2.0-alpha.4.tgz contained 454 files, integrity sha512-Ub4DXu2gamTzOZD/A4JllY791YN60uMlx66LL0/OBX0JZZtYH1ezpTYoD5PiqkD6PDz+ow2roui5lXtfNH6bxA==. Per-command JSON retains exit codes/output; supervised-result.json records the result. The tested package predates this record and is not a published release.

Validation: node --check for the changed script, package smoke, link check and citation check exited 0. The initial document-fact check exited 1 because README.en.md retained the old record count; correcting that count produced exit 0 without changing coverage baselines. git diff --check exited 0. Historical citation warnings remain distinct from current broken links. No new mock authorization suite or full protected regression was run.

## 3. Acceptance and limitations

| Claim | Observed result |
| --- | --- |
| A: authenticated public approval | Unavailable in observed Windows Host |
| B: trusted Objective-scoped public Decisions | Blocked; no issuer substituted |
| C: actual Codex implementation sequence | Prior supervised Live only |
| D: integration Evidence/Judge | Prior 11 PASS / COMPLETE_LOCAL preserved |
| New autonomous Host Live | NOT_RUN |
| Protected verification | UNSATISFIED |
| New model/enrollment/signature calls | 0 / 0 / 0 |
| New verification Decision/Attempt | 0 / 0 |
| User intervention reduction | Not demonstrated |

Two explicit Host command permission scopes covered readiness and package execution. UI click count and human time were not measured; these permissions are not Objective authentication. Historical monetary cost remains unknown.

## 4. Conclusion and next action

SUPERVISED_READY is retained; PUBLIC_DELEGATION_BLOCKED remains and AUTONOMOUS_READY is not achieved. No mock public delegation success was manufactured. Existing application sources/tests, State and success/failure Evidence were preserved.

The prerequisite is an available authenticator with a trusted confirmation surface and exact Objective binding, then an issuer connected to existing Reservation and actual source-changing Live acceptance. Another text approval cannot supply the missing Windows provider. Distribution verification does not integrate dirty work into official main; commit/publication remain unauthorized.
