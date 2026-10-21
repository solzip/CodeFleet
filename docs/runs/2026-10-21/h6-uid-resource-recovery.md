# H6 UID resource collision reproduction and CI recovery

- Date: 2026-10-21 (Asia/Seoul)
- Target commit before changes: feb0ee90d29ef3d3d5f6db260f13d2bd61e48091
- Type: investigation / correction / execution
- Predecessor: [CI environment correction](pr6-ci-environment.md)
- Measured finding ID maxima: P0-17 and P1-61; no new finding ID.
- Failed hosted run: https://github.com/solzip/CodeFleet/actions/runs/39522654624

## What failed and what must succeed

At the target commit, `test/fixtures/planning-isolation-probe.py:58` forks one
non-root descendant after confine. The child must execute Python operations,
fail outside reads, exec and networking, exit zero, and be reaped by waitpid.
Fork failure is not an isolation success: it prevents testing inherited
restrictions. The failed hosted run reached H6 and reported 6 passed / 1 failed,
exit 1; the remaining Alpha and protected verifier checks were NOT_RUN.

`src/hosts/planning-isolation.py:42` sets RLIMIT_NPROC to soft/hard 8/8, followed
by descriptor closure, environment clearing, chroot, setgroups/setgid/setuid,
and installation of no-new-privileges plus seccomp. Fork is permitted, while
exec, namespace creation, privilege recovery and sockets are denied. The Docker
probe also retains network=none, read-only mounts, cap-drop=ALL with only
SYS_CHROOT/SETUID/SETGID/KILL, no-new-privileges, pids-limit=32, memory=256m,
cpus=1 and the existing bounded /h6 tmpfs. None of these settings changes.

Linux RLIMIT_NPROC counts tasks belonging to the real UID, not just the tasks
visible inside one container PID namespace. EAGAIN also has other possible
causes, so the error alone is insufficient evidence of which limit was reached.
Primary reference: [Linux getrlimit manual](https://www.man7.org/linux/man-pages/man2/getrlimit.2.html),
[Linux fork manual](https://man7.org/linux/man-pages/man2/fork.2.html).

## Controlled reproduction

Local Docker Linux engine, existing immutable Operator image
sha256:26c04a69d0bb84a2ed1cb865c36a0f690bbe772197ee41d914563bea5236200d.
An uncommitted diagnostic copy of the original probe only adds observations and
selects the already-supported confine UID. A separate bounded container holds
eight synthetic sleeping processes, with no network or private inputs. Both
containers use the same kernel; cleanup affects only those generated test
containers. No existing container is stopped or changed.

| Case | Worker UID | External UID load | Result |
| --- | ---: | --- | --- |
| Original baseline | 1001 | None | Full original checks pass, exit 0 |
| Collision | 1001 | Eight tasks at 1001 | Same fork EAGAIN, exit 1 |
| Separate identity | 61001 | Eight tasks at 1001 | Full original checks pass, exit 0 |
| Dedicated identity saturated | 61001 | Eight tasks at 61001 | Same fork EAGAIN, exit 1 |
| Load removed and reaped | 61001 | None | Full original checks pass, exit 0 |

Before confinement, each victim container saw zero external pressure tasks
in /proc and pids.current=1 / pids.max=32; memory.max=268435456 and memory.current
was below 16 MiB. The supervisor's unlimited NPROC was inherited from the test
image, not introduced by this change; the actual worker remained 8/8.
Changing only the pressure UID or reaping the pressure restores fork. This
confirms real-UID accounting as the cause in the controlled reproduction,
independent of the victim cgroup ceiling and despite PID namespace separation.

The GitHub run did not record UID task counts, cgroup counters or the failing
worker's limits. Therefore the exact historical runner allocation is still
UNCONFIRMED. UID collision is supported by the reproduced mechanism, not a
claim that historical counters were observed. Reordering had already failed
on GitHub; a separate job alone cannot prove a nonconflicting host UID.

## Minimal correction and retained security

Only the test fixture selects UID 61001 through confine's existing trusted
provisioner parameter. Production confine's default UID and all resource,
filesystem, syscall and authority contracts remain byte-identical. This does
not require OS accounts or installation changes for CodeFleet users, and it
does not qualify a production Host deployment.

The existing H6 test retains every original check and adds mandatory controls:

- Eight pressure tasks at UID 1001 reproduce the old worker's failure, while
  the dedicated worker must fork and pass the original descendant denials.
- Eight pressure tasks at UID 61001 must still prevent fork. The subprocess
  must fail with EAGAIN and cannot report OFFLINE_VERIFIED. That negative
  control alone never grants overall H6 success.
- All created pressure children and workers are killed/reaped as appropriate;
  a fresh normal worker must then pass the same full checks again.
- The trusted supervisor samples /proc only after the child reports confinement
  and waits for its bounded pipe input. Observed real UID, Threads, Seccomp,
  NoNewPrivs, NPROC and cgroup counters are asserted and reported.

Measured fixed probe: collision and dedicated saturation each saw nine visible
UID tasks, NPROC 8/8 and cgroup 10/32. The successful separate-UID worker saw one
UID task with cgroup 10/32. Recovery saw one UID task and cgroup 2/32. All observed
workers had Seccomp=2, NoNewPrivs=1 and NPROC=8/8. Pressure children were reaped;
normal descendants exited successfully, and all original escape attempts failed.
The original timeout/no-residual-process, fixture integrity and pipe limits
also passed. A collision at the dedicated UID still fails closed.

The existing CI runner now logs numeric host UID process/thread counts and its
NPROC line before H6. It records inspected/unreadable process counts and the
snapshot limitation; it does not print names, command lines, environment or
credentials. The full existing Alpha file list remains required. H6 pressure
runs exclusively before the rest; Hybrid's internal concurrency is unchanged.

## Validation

- Controlled five-case reproduction: exit 0 for the experiment, with expected
  failing victims explicitly distinguished from full H6 passes.
- Updated H6 standalone: 7 passed, 0 failed, 0 skipped, exit 0.
- Full npm test with real Docker and JDK: exit 0; Legacy 324 + Alpha 212 +
  Host Core 12 = 548 passed, 0 failed, 0 skipped, including posttest.
- Independent Linux sequence: exit 0; H6 7 + remaining Alpha 205 + Host Core
  12 = 224 passed, 0 failed, 0 skipped. Real H3/H4 IPC, Node/Maven protected
  verification, Java parser, Hybrid and all four retained smoke/audit commands
  executed successfully. The same updated files were copied into a disposable
  clone of the target commit; product source was unchanged.
- Local Windows Node version: v24.14.1. Linux reproduction container Node:
  v24.21.0, JDK 21; this is not the GitHub Ubuntu runner.
- Syntax, document/posttest, actionlint and whole origin/main diff checks:
  final pre-commit checks recorded in the local execution evidence.
- Hosted GitHub rerun of this correction: NOT_RUN; no push authorized.
- Host Live: NOT_RUN; no model or authentication access.

Raw diagnostics, commands, image IDs and logs are retained locally under ignored
`.trials/host-core-checkpoint/gate-b/h6-eagain/`. Public evidence is this sanitized
record. CI changes are the Python fixture, its existing Node assertions, and
numeric diagnostics in the existing CI runner. Record/index/README counter
updates are documentation bookkeeping. No product source or security limit was
modified, and no tests were removed or renamed.

## Conclusion

Real-UID NPROC interference is reproduced; the dedicated test identity retains the same enforced ceiling.
Hosted historical resource occupancy remains unconfirmed and requires the new diagnostic log.
PR readiness requires an authorized hosted rerun; no CI_VERIFIED or Host Live claim is made.

## Next action

After local verification and a minimal commit, request approval to push its
exact SHA to integration/host-native-baseline for PR #6. Require the H6 pressure
controls and all remaining Alpha/Host Core/protected smoke checks on GitHub.

## Unresolved

GitHub runtime resource measurements and final CI recovery are NOT_RUN pending
push approval. The separate Linux Legacy exploratory failures remain unresolved;
Legacy is still mandatory on Windows. Production Host Live remains NOT_RUN.
