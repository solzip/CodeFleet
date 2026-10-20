# H7 — Real Host isolation qualification

Date: 2026-10-20 (Asia/Seoul). HEAD:
`c3bca1e8b3481a1a3e6dff1cc7e1e8ef5c72bc03`.
Branch: `feature/alpha-g0-refresh`. Type: environment audit / offline qualification.
Predecessors: [H6 run](alpha-h6-host-planning-isolation.md),
[H6 design](../../implementation/host-planning.md).
Prior measured finding maxima P0-17/P1-61; no new IDs.

## Verdict

**BLOCKED for actual Host isolation qualification.** Both installed Host binaries
load normally on Windows, but neither loaded inside the tested restricted
environment. Model calls and Skill executions: zero. HOST_LIVE_VERIFIED: none.
Offline regression and discovery facts below are separately verified and do not
change this verdict.

Git began with only untracked `.trials/`. Existing implementation, policy, tests
and history are preserved. No source/test changes, account provisioning, firewall
changes, credential copying, commit, push, PR or deployment.

The decision-debt scan used the specified H6 design: zero final blockers and one
excluded sensitive-context candidate. It permitted bounded investigation, not
relaxation of a runtime policy.

## Actual binaries and environments

Installed Codex CLI: 0.162.1. Claude Code: 2.1.304. Both native executable files
are Windows PE x86_64, verified from their headers and SHA-256. Wrapper paths
were resolved to the actual executable; hashes are in the evidence file.
Unrestricted `--version` returned exit zero for both. This proves ordinary
loading only, not isolation.

Ubuntu WSL2 returned kernel `6.6.114.1-microsoft-standard-WSL2`, UID 1002.
PATH discovery found no Linux Node, Claude, bubblewrap or socat. The Codex path
was on a Windows mount. This is a bounded PATH check, not a scan of every file
on the machine. No Linux Host package was installed or downloaded in H7.

## Restricted loading attempts

A fresh temporary home and public fixture were prepared. Environment variables
were allowlisted; HOME/USERPROFILE/CODEX_HOME/CLAUDE_CONFIG_DIR and app/temp roots
pointed to the new empty home. No real authentication file was supplied.
The explicit profile denied root reads, allowed minimal runtime/fixture reads,
allowed runtime scratch in the temporary home, and disabled command networking.
Executable directories were explicitly readable; global settings were not
overwritten. Managed requirements were included.

| Attempt | Codex | Claude | Interpretation |
| --- | --- | --- | --- |
| Codex restricted-token launcher, target `--version` | exit 1 | exit 1 | Restricted read-only access requires elevated Windows sandbox backend |
| Same profile, MXC preferred, target `--version` | exit 1 | exit 1 | MXC platform directory missing, HRESULT 0x80070003 |
| Linux container, actual installed executable, target `--version` | loader errno 2 | loader errno 2 | No Host process loaded |

The Windows outer launcher was Codex in both cases; the Claude target was not
tested through a nonexistent native Claude Windows Bash sandbox. No elevated
backend setup was attempted: it changes local accounts/policy/firewall and is
not a substitute for a qualified deployment. Root-read denial and network
policy were never removed to obtain a successful launch.

The Linux attempt used the existing pinned H3 image, read-only filesystem,
network none, UID 1001, all capabilities dropped, no-new-privileges and bounded
PID/memory/CPU. Only the two executable files were mounted; no home, auth,
Docker/Operator socket or real project was mounted.
Because the kernel returned ENOENT rather than the anticipated format error,
the attempt was repeated with file existence, MZ header and SHA-256 checks.
Both files existed and hashes matched. The exact missing loader/interpreter
was not identified; do not report that the mounted files were absent or that
a Linux-native Host ran. The known files remain PE binaries.

An initial CLI syntax exploration mistakenly used `sandbox windows --help`;
this installed CLI treats `windows` as a command argument. Restricted-token
creation failed with error 87 before that command ran. Subsequent attempts
used the actual help-documented argument form and explicit profile above.

## Skill, settings, authentication and scratch

Fresh temporary Git repositories received the unchanged planning Skills.
No baseline commit was created. Codex's actual local app-server loader, in
a clean temporary home, returned enabled 1 / disabled 0 / re-enabled 1,
errors zero. Allowed RPC methods were initialize and skills/list only.
No thread/turn or authentication RPC was sent.

| Surface | Evidence | Limit |
| --- | --- | --- |
| `$codefleet-plan` | Actual loader found project `.agents/skills/codefleet-plan` | Discovery outside the failed qualified sandbox, not isolated execution |
| `/codefleet-plan` | Local `.claude/skills/codefleet-plan` installation and existing lifecycle regression | Actual Claude loader/Skill invocation NOT_RUN |
| Explicit temporary Codex config | Policy refusal reflects the requested restricted profile | Host config accesses after successful startup unobserved |
| Authentication status | Alpha Doctor's ordinary status diagnostic passed without token/identity output | Status inside qualified environment NOT_RUN; reuse not proven |
| Temporary writes | Failed launcher created sandbox log and temporary argument-helper files | Full Host session minimum write set not measured |
| Existing authentication | No credential files copied or values exported | Supported isolated login/reuse still needs design and qualification |

The environment-evidence file lists only sanitized scratch paths. A redirected
HOME alone is not filesystem isolation. Do not infer that Agent tools could
not read a real home if launched without an enforced boundary.

## Adversarial tests and observation boundary

All H6 tests reran, including actual UID/chroot/seccomp negative probes and
timeout cleanup. They remain **Fake Worker** evidence.

The H7 actual-Host environment could not start the targets. Consequently the
following qualification checks are **NOT_RUN/BLOCKED**, not successful denials:
outside-fixture read, fixture write, Operator/Docker IPC, network, child-process
escape, symlink/mount escape, and real Host descendant cleanup.
The initial qualification must load a real Host before running matched-environment
negative probes. Passing the worker suite cannot fill these missing observations.

No target Host was started by failed loading attempts. Local discovery uses
the existing bounded child cleanup routine; its result is not a system-wide
proof that every unrelated Host process stopped.

## Model/tool network alternatives

| Option | Design assessment | Actually demonstrated in H7 |
| --- | --- | --- |
| A: native sandbox inside external boundary | Preferred initial route once correct binaries/backend exist; covers Host and helper surfaces | Startup blocked; whole-Host containment unverified |
| B: Host transport identity separate from tool identity/network namespace | Suitable if official dispatch can enforce every child/native-file/connector path | Not implemented or attested |
| C: narrow authenticated model relay | Requires protocol/identity and destination restrictions without exposing credentials or general proxy access | Design only; no proxy or auth forwarding implemented |

No actual model or API transport was tested. A no-network container is not
proof that model transport can remain usable while tool networking is blocked.
Likewise command network policy does not automatically govern built-in web
tools, apps, hooks and connectors.

Official references consulted:
[Codex permissions](https://learn.chatgpt.com/docs/permissions),
[Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox),
[Claude sandbox](https://code.claude.com/docs/en/sandboxing),
[Claude CLI](https://code.claude.com/docs/en/cli-reference).
Codex documentation distinguishes MXC and legacy backends; unelevated cannot
enforce denied reads. Claude documents native Windows command execution as
unsandboxed and places file tools/hooks/MCP outside its Bash sandbox. These
documents explain candidate boundaries; they do not certify this deployment.

## Regression and evidence

| Check | Exit | Observed scope |
| --- | --- | --- |
| `npm.cmd test` with Docker/Java gates enabled | 0 | Legacy 324 + Alpha 205 = 529; failed/skipped 0 |
| `node src/alpha/cli.mjs doctor` | 0 | Local readiness; no authenticated model turn |
| Codex app-server discovery helper, planning mode | 0 | Enabled/disabled/enabled exact matches 1/0/1, no model turn |

Full regression includes existing Host IPC, Operator, SQLite/recovery, Workflow,
Docker/Node/Java/Maven and H6 worker tests. Their success does not qualify real
Host confinement. All eight H6 recorded source byte hashes remain identical.

Public evidence: [qualification JSON](alpha-h7-source-evidence.json),
[full regression log](alpha-h7-full.log), [Doctor log](alpha-h7-doctor.log).
Final `check-links.mjs`, `check-doc-citations.mjs` and `check-doc-facts.mjs`
checks each passed (exit 0). Living citations broken: 0; historical unresolved
citations: 10 and suspect citations: 13 remain explicitly reported. Facts:
42 declared checks passed, with 539 numbers outside that check's coverage.
A bounded scan of four H7 public files for personal Windows paths, private-key
headers and common API-key prefixes found zero matches; this is not a universal
secret audit. No credentials were read or copied by these probes.

Changed files are this record and its three evidence files, `docs/INDEX.md`,
`docs/product-completion/progress.md`, `README.md` and `README.en.md`.
No product source, policy or test changes were needed. Existing untracked
`.trials/` is preserved and excluded from this work.
Probe scripts are retained only in the ignored checkpoint; public evidence
contains version/hash, explicit policy shape, outcome and scope, not personal
paths or credentials.

## Minimum follow-up and Live preconditions

Choose one explicitly provisioned platform. The smallest Linux route needs
verified Linux-native Codex/Claude binaries, required sandbox dependencies,
an isolated workspace/UID and a protected supervisor. The Windows alternative
needs a working MXC platform or separately provisioned elevated backend,
then the same whole-process and negative-probe qualification. Neither is
currently marked supported by CodeFleet.

Keep the current H6 worker policy unchanged. Its no-exec filter cannot launch
Host binaries; a Host-capable outer boundary is a separate qualified profile,
not a relaxation of that worker.

Before seeking a Live plan turn, require successful real-binary loading,
Skill discovery and configuration/scratch observations inside that boundary;
successful matched-environment negative tests; credential-inaccessible tools;
protected model transport separated from tool egress; bounded requests/output/
time and verifiable process cleanup. Only then request a new scoped Live
authorization naming the exact environment, profile/Skill/fixture hashes,
allowed tools and model usage. No Live approval is requested by this record.

## Conclusion and unresolved items

H7 identifies concrete loading/platform blockers and preserves fail-closed
behavior. Actual Host isolation, authenticated execution and model/tool network
separation remain BLOCKED. Offline discovery and regression do not complete
the product or establish HOST_LIVE_VERIFIED.
