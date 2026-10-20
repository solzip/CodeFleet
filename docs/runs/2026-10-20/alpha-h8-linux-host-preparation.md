# H8 — Linux-native Host environment preparation

Date: 2026-10-20. Branch: `feature/alpha-g0-refresh`.
HEAD: `c3bca1e8b3481a1a3e6dff1cc7e1e8ef5c72bc03`.
Predecessor: [H7 qualification](alpha-h7-real-host-qualification.md).

## Current gate

**OFFLINE_VERIFIED for installation, isolated binary startup and the bounded
negative probes below. BLOCKED for Host Live / complete HOST_OBSERVED policy.**
No HOST_LIVE_VERIFIED status is assigned.

The user explicitly approved the three fixed Linux versions under the dedicated
user path after the initial preparation report. No model calls, authentication
copying, login, sudo, system package/configuration changes, commit, push, PR or
deployment were performed. Existing H7 changes and untracked `.trials/` remain
preserved; product source, tests and policy were not changed.

The bounded decision-debt review of the selected H7 record found zero final
decisions and one excluded sensitive-context candidate. This was permission to
investigate, not proof of runtime isolation.

## Environment actually observed

| Surface | Observation | Limit |
| --- | --- | --- |
| WSL | Ubuntu and Docker Desktop distributions running as WSL2 | Not native Linux platform qualification |
| Ubuntu | 24.04.3 LTS, x86_64; kernel 6.6.114.1-microsoft-standard-WSL2 | This specific deployment only |
| User | UID 1002; groups 27, 100, 1001, 1002 | No independent Operator identity established |
| Git | Linux `/usr/bin/git`, version 2.43.0 | Ordinary version check |
| Docker | Linux CLI 24.0.6; socket exists and is readable/writable by current user | This ordinary user is not an isolated Agent boundary |
| Node | Not found on current PATH | Bounded lookup, not whole-disk absence |
| npm / Codex | PATH resolves Windows-mounted commands | Not Linux Host installation |
| Claude / bubblewrap / socat | Not found on current PATH | No package was installed |
| Namespace primitives | `unshare --user --map-root-user --mount --net --pid --fork true` exit 0 | Namespace creation only, not complete filesystem/network denial evidence |

The first inline Python probe failed because the Windows-to-WSL command
quoting did not preserve a marker string. It was rerun through Python standard
input and returned exit 0. No result is inferred from the failed probe.

## Approved installation and integrity

The initially absent directory `~/.local/share/codefleet-h8/` was created with
mode 0700. All packages, archives, scratch, public Fixture and probe files are
under this directory. No global PATH or shell initialization file was edited.
The recorded absolute paths were resolved in WSL and all binary commands used
explicit paths, excluding Windows command selection. Public artifacts replace
the personal absolute prefix with `<H8_ROOT>`; the operator-facing report gives
the actual prefix.

| Package | Relative executable below H8_ROOT | Version output / exit |
| --- | --- | --- |
| Node | `packages/node/node-v24.22.0-linux-x64/bin/node` | `v24.22.0` / 0 |
| Codex | `packages/codex/package/vendor/x86_64-unknown-linux-musl/bin/codex` | `codex-cli 0.162.1` / 0 |
| Claude | `packages/claude/package/claude` | `2.1.304 (Claude Code)` / 0 |

All three executable headers are ELF64, machine 62 (x86-64), not Windows PE.
Node's archive SHA-256 matches the version-specific official checksum list.
Both Host archives match their exact-version npm registry SHA-512 integrity
values; metadata specifies Linux/x64. TLS metadata/checksum checks are not a
claim that npm signatures or provenance attestations were separately verified.
Archive extraction used Python's `data` filter. No npm lifecycle/postinstall or
standalone install script was executed; only the native package binaries were
used. No requested version was substituted.

Sources actually downloaded:

- [Node 24.22.0 archive](https://nodejs.org/dist/v24.22.0/node-v24.22.0-linux-x64.tar.xz) and [checksums](https://nodejs.org/dist/v24.22.0/SHASUMS256.txt).
- [Codex Linux package](https://registry.npmjs.org/@openai/codex/-/codex-0.162.1-linux-x64.tgz), from exact-version official package metadata.
- [Claude Linux package](https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.304.tgz), from exact-version official package metadata.

The original standalone script URLs returned HTTP 403 during review; the approved
npm-package route was used instead. Node's SHA-256 is
`cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008`.
Archive integrity values and executable hashes are in the
[installed evidence](alpha-h8-installed-evidence.json).

Official references: [Codex installation](https://learn.chatgpt.com/docs/codex/cli),
[Codex install variables](https://learn.chatgpt.com/docs/config-file/environment-variables),
[Claude setup](https://code.claude.com/docs/en/setup),
[Codex sandbox](https://learn.chatgpt.com/docs/sandboxing).
Installation support is distinct from CodeFleet security qualification.

## Actual isolated execution

The Codex package includes its own `codex-resources/bwrap`; no system bubblewrap
or socat package was installed. The supervisor runs this pinned executable with
`--unshare-all --unshare-user --disable-userns --assert-userns-disabled`,
`--die-with-parent --new-session --cap-drop ALL --clearenv`.

Mounts expose `/usr` read-only as runtime support, approved packages read-only at
`/opt`, and the public fixture read-only at `/fixture`. `/bin`, `/lib`, `/lib64`
point into runtime support. A new proc/dev view is used; root is remounted
read-only. Only the dedicated scratch mount is persistently writable. HOME,
CODEX_HOME, CLAUDE_CONFIG_DIR and TMPDIR point into scratch. `/run`, `/var` and
`/etc` are empty; real homes, Windows mounts, credentials and Docker/Operator
sockets are not mounted. Environment is allowlisted; updates/nonessential
Claude traffic are disabled in addition to network namespace isolation.

Both ordinary network-isolated `--version` and full-boundary `--version`
returned exit 0 for Node, Codex and Claude. The exact bwrap argument vector and
its hash are recorded in the evidence. Namespace-local aliases do not create
host files outside the approved directory.

This is an offline qualification launcher, not a new production Host adapter.
Its `/usr` runtime read allowance is broader than a minimal runtime manifest.
It permits processes inside the boundary and private scratch writes; it does
not implement the HOST_OBSERVED read/search-only tool allowlist or absolute
no-write policy. These differences remain explicit Live blockers.

## Skill discovery, settings and cleanup

Unchanged `planningSkill()` output was placed in the public Fixture at
`.agents/skills/codefleet-plan/SKILL.md` and
`.claude/skills/codefleet-plan/SKILL.md`; hashes match the source-generated
content. A fresh Git repository was initialized without creating a commit.

Actual Codex app-server was started **inside the same boundary**. Only
`initialize` and `skills/list` RPCs were sent: one exact project Skill match,
zero loader errors, no thread/turn/authentication RPC. The server did not exit
within the bounded EOF wait and was killed by the supervisor (exit -9), which
is recorded as forced cleanup, not a graceful Host exit. A subsequent executable
scan found no residual installed Node/Codex/Claude processes.

Claude `--version` and `--help` worked inside the boundary. Its installed help
did not establish a model-free Skill-list command. The Claude Skill file and
hash were checked, but actual Claude Skill discovery is **UNVERIFIED**. No
interactive session, prompt, `--print` turn or Skill invocation was attempted.

Codex created private scratch SQLite state/log files, helper/lock files and
bundled system Skills. These are newly generated runtime files, not copied
credentials. The observed list is in the evidence; it is not a full-session
minimum-write guarantee. Claude's full runtime scratch/config needs remain
unverified by version/help checks.

A deliberately invalid temporary Codex TOML file produced an explicit parsing
error, then **fell back to defaults and exited 0**. This demonstrates config
access but not fail-closed config enforcement. External mount/network controls
therefore remain mandatory and were never replaced by Host configuration.

## Matched-boundary adversarial results

The local malicious probe ran with the same bwrap profile that loaded the
actual Hosts. It is external test-program evidence, not a claim that an AI
was induced to perform attacks. All 16 tested attempts were denied:

- Reads of an existing fake credential outside the fixture, symlink escape,
  `/proc/1/root` escape and a Windows-mounted path.
- Writes to fixture, runtime packages and root, and fixture-path replacement.
- Docker socket and a live fake Operator UNIX socket.
- Connection to a reachable supervisor loopback listener and to an external
  documentation-range address (network unreachable; no packet delivered).
- Nested user namespace, mount attempt, child-process outside read and child
  network access.

Positive controls established that the fake credential was readable, the
fixture writable, the fake Operator and loopback listeners reachable, and the
Docker socket accessible **outside** the boundary. Inside, the ordinary
fixture read succeeded. Fixture content hashes were unchanged afterward.

Effective/permitted/bounding capabilities were zero and NoNewPrivs was 1.
Seccomp was 0: no syscall-filter attestation is claimed. Nested namespaces were
blocked by bwrap's namespace restriction, not a claimed seccomp rule. A marked
orphan-child test observed three descendants; none remained after namespace
termination. This is bounded cleanup evidence, not a fork-bomb, PID-budget,
memory exhaustion or system-wide unrelated-process guarantee.

## Failed attempts and unresolved boundaries

1. The first bwrap attempt omitted explicit `--unshare-user`; all targets were
   refused with exit 1. Adding that required option preserved the policy and
   all three targets then exited 0.
2. Initial Codex ordinary version check warned that its fresh CODEX_HOME did
   not yet exist. The isolated checks used explicitly created empty directories.
3. Printing the saved Claude help through Windows cp949 failed with an output
   encoding exception after the Linux command had completed. Reading the saved
   help with escaped output resolved the reporting error; no model was invoked.
4. Invalid Codex configuration falls back to defaults. Do not treat its exit 0
   as policy validation.
5. Actual Claude Skill discovery, authenticated Host operation, model/tool
   network separation, read/search-only tools and hard resource budgets remain
   unverified. The offline boundary blocks **all** model networking too.
6. Same-user installation ownership is not H3 Trusted Operator identity
   separation. H4 Operator/Harness services are not exposed to this environment.

The measured platform is this Ubuntu-on-WSL2 x86-64 deployment. Do not generalize
to native Windows, other WSL installations, native Linux distributions or other
architectures. Before any Live request, qualify a protected model transport,
credential-inaccessible tools, an enforceable tool allowlist, reviewed runtime
read/scratch allowances, process budgets and trusted supervisor ownership.
Live requires new user authorization; it is not requested or started here.

## Regression

`npm.cmd test` completed with exit 0: Legacy 324 + Alpha 205 = 529 passed,
failed/skipped 0. Docker, Java/Maven, Operator and Host IPC gates were enabled.
`node src/alpha/cli.mjs doctor` completed with exit 0. These are fresh H8
regression runs; they do not verify a Linux-native Host that is not installed.

[Environment and regression evidence](alpha-h8-environment-evidence.json).
Final link, citation and declared-fact scripts each exited 0. Living broken
citations: 0; historical unresolved 10 and suspect 13 remain reported.
Declared facts checked: 42; other numbers not defended by that checker: 539.
A bounded scan of the public H8 files for personal Windows paths,
private-key headers and common API-key prefixes returned no matches.

## Preserved product contract

Host models/authentication remain the intended execution source. CodeFleet
continues to own Intent/Contract, Workflow/DAG, policy/approval, Harness/Judge,
recovery and evidence. Host reports cannot approve execution or establish
independent verification. Only the bounded offline combination above is qualified by this
record; no production or Live Host/OS support is added. HOST_LIVE_VERIFIED is not assigned.
