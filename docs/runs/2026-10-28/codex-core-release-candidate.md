# Codex Core supervised release candidate

- Date: 2026-10-28.
- Baseline: core-p0-1 detached at 19ddf671410e92fc9d9e4fa423aeb829981c5bfa, with accumulated uncommitted work preserved.
- Type: distribution defect fix, installed regression and fresh-session acceptance.
- Predecessor: [Trusted authorization availability](trusted-authorization-boundary.md).
- Numbering: descriptive run, no audit number allocated.

## 1. Git integration boundary

Read-only GitHub inspection found main at 4477e4426960af46076d3aa29808201c1c8911a6 and PR #9 open/unmerged, head 19ddf671410e92fc9d9e4fa423aeb829981c5bfa. Local main/origin/main matched the observed remote main. core-p0-1 HEAD equals PR #9's head, not main. Its two commits add durable reservations and block unauthenticated authorization.

The accumulated dirty implementation is additional to PR #9. Do not cherry-pick its reservation implementation a second time. Integration requires review/authorization; no commit, push, PR or merge was performed.

| Integration order | Existing implementation to retain | Conflict/validation concern |
| --- | --- | --- |
| 1 | PR #9 durable reservation and authorization denial | Base dependency; existing open PR remains unchanged |
| 2 | Store read-only access, Reservation/Continuation/Repair/Recovery, Local acceptance | Store schema, revision, lease, budget and evidence finalization must remain atomic |
| 3 | EXISTING_LOCAL v2, Native Local review/accept, environment recovery | Shared tasks/CLI/report/backends overlap PR #9; preserve old contract hashes and protected requirements |
| 4 | Skill/runtime installation, state-free capability reporting, packaging and guides | Installer snapshots must match reviewed source; no implicit public execution grants |

Untracked Core modules and their tests are part of the implementation candidate, not disposable output. Local evidence/ and .codefleet/ artifacts remain preserved and outside package inclusion. A future integration must include related source/tests/contracts together rather than staging only tracked diffs. Official main does not yet contain this candidate.

## 2. Found and fixed distribution defect

The package file list omitted scripts/host-install.mjs although the installation guide requires it. The former smoke imported installHost/manageHost internally, hiding the missing public entry point.

package.json now explicitly includes that installer. The existing supervised package smoke executes its install/status/disable/enable/remove commands from the installed tarball. It asserts the installer exists and rejects inclusion of private State, test fixtures, node_modules, .git, .codefleet or root evidence. The legacy default smoke and its security checks remain unchanged.

The guide now explains offline tarball installation without a development checkout and distinguishes dirty-file-preserving EXISTING_LOCAL from legacy clean-repository requirements.

No runtime authorization, acceptance criterion or application source was relaxed. PUBLIC_DELEGATION_BLOCKED remains; the unsupported Windows authentication provider was not queried again.

The first fresh Codex session found a second real defect: objective help opened the default Store and failed with EPERM in read-only Host execution. src/product/cli.mjs now returns help before Store creation while preserving requireDurableEntry. The regression checks all three help forms against absent and regular-file State paths, verifies preservation, and verifies unauthorized durable entry remains rejected without creating State. The installed-package smoke now checks objective help and State absence too.

## 3. Package and validation evidence

Initial corrected tarball: codefleet-0.2.0-alpha.4.tgz, 456 entries, integrity sha512-HBK14VNqoqx19e1bhxBRZbsaTct2YCCTn+G6pvp4IliQ0su9HUCaCAYEtgEe2cFbWLQQm3+a2AtPe+L4L4+qjg==. Local artifacts: temporary directory codefleet-packaged-LksBNG, including package-manifest.json. It predates this run record and guide update.

The existing --supervised-only smoke exited 0: offline package install, CLI help, public Skill installation/lifecycle, no-State capability query, real HEAD project recognition, unchanged repository hash, read-only RECOVERED with zero unresolved effects/remaining work, uninstall. No application test, model or Git mutation occurred in that smoke.

Package inventory intentionally retains linked historical documentation: 121 logs and one historical diagnostic script. These are existing documentation evidence, not current temporary State or live fixtures. Removing them individually would break historical source links. Raw new local evidence, test fixtures and private State are excluded.

Installed-package regression ran the existing native-local, recovery, repair-loop, local-acceptance, continuation, environment-recovery and development-loop suites: 159 PASS, zero failures/skips, exit 0, 188.524 seconds. Existing test files were copied into the disposable installed package solely as verification inputs; they are not shipped. No development-source import was substituted. The subsequent focused help regression passed, including rejection of unauthorized durable entry. Full Legacy/Protected regression was not run.

The first actual Codex session (01a180ad-59d8-7da3-9528-d43fab654000) read the installed SKILL.md and ran capabilities successfully; objective help failed with exit 1, despite model-process exit 0. That failed acceptance remains preserved in temporary directory codefleet-rc-mgTlUi. The next package smoke, including the help fix, exited 0 and produced codefleet-packaged-2Eu5NT.

The bounded correction check used a new installation and Codex session (01a180b0-243e-7e90-8fe4-92eac3ac8f51): literal $codefleet entry, actual SKILL.md read, objective help exit 0 and capabilities exit 0. Tool traces, not just the model's final response, establish these outcomes. Artifacts remain in codefleet-rc-help-YL4GYc. Public delegation remained blocked. No Task, approval, verification Attempt or application execution was requested.

This is a clean temporary installation under the existing Windows user; it does not establish a new OS account, clean machine or cross-platform certification. Existing Host authentication was reused without copying credentials or changing global configuration. Installed source paths were independent of core-p0-1. The package smoke intentionally references the existing acceptance State for its read-only Recovery check.

Actual model sessions: 2 (initial acceptance and bounded post-fix acceptance), no automatic retries. Provider-reported usage: first 59,902 input / 50,688 cached / 957 output; second 60,811 input / 50,432 cached / 371 output. Dollar cost and human review time were not observed. Host execution permission was requested for installation/check scopes; this is not Objective authentication or reduced implementation approval overhead.

Link/fact/citation checks and git diff --check passed. Existing historical citation warnings were retained, not suppressed. Source and package integrity records distinguish the tested runtime from later documentation-only recording.

## 4. Supported scope and trust

| Capability | Required evidence level |
| --- | --- |
| New-project Bootstrap / Draft / DAG / Fileset | Existing real Todo acceptance and installed regression |
| Existing HEAD project and dependent implementation | Prior real supervised Codex acceptance; installed package recognizes the same repository |
| Failure classification / bounded Repair / no-replay Recovery | Scoped process regression; prior live recovery retained |
| Native Local Evidence/Judge | Explicit same-user trust; Local-only may complete, Protected-required remains unsatisfied |
| Fresh-session Skill entry | Actual model/tool trace, separate from CLI-only smoke |
| Public authenticated delegation | BLOCKED; never inferred from a Host command approval |

The previous [HEAD project Live result](public-existing-local-v2.md) remains 11 PASS / COMPLETE_LOCAL with Candidate 98cc082e486c9b10683b0b2dca3aa88bfad68bacb736fc1f98e933037fcb047f and Evidence 857f33d89900107c18ef475ef502582a63a3b8e9aba75fcb09ca372506a991d9. It is historical supervised evidence, not a new application verification in this run.

## 5. Future Windows authorization contract

An available user authenticator must bind a trusted confirmation UI to canonical Objective ID/revision, allowed WorkItems/files/commands, backend/capability, model scope, attempt/time/cost limits, expiry, revocation and unique replay-resistant approval ID. The Agent must not access signing authority. A trusted issuer must check each proposed Candidate and current scope before issuing one-use Decisions through existing Reservation. Policy/revision changes invalidate incompatible approval; uncertain effects require reconciliation. Live evidence must demonstrate actual human provenance and two implementation WorkItems before AUTONOMOUS_READY. No new server, OS account or DPAPI-only assertion is proposed here.

## 6. Conclusion, next work and unresolved scope

The installation entry-point defect is fixed; supervised product support remains separate from public delegation. Local installation does not constitute registry publication.

Next: review the integration order and accumulated uncommitted implementation before any authorized Git publication. Preserve package integrity and re-run affected checks if that review changes runtime code.

Unresolved: full protected/Legacy qualification, other operating systems, clean-machine acceptance, authenticated public delegation and official baseline integration. No unsupported mode is labelled ready.
