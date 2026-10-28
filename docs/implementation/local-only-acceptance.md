# Explicit Local-only Bootstrap acceptance

New Tasks may select `--acceptance LOCAL_ONLY` at `objective plan` or `host codex
plan`. Omission is `PROTECTED_REQUIRED`, including historical Tasks without the
field. The choice is stored at Task creation; the public CLI rejects later changes.
It is a trust-level contract, never a Fileset, model or command approval. Existing
P0-B/P0-C contracts and their Protected requirements are unchanged.

The existing Native Local exact review, one-shot Decision, reservation, lease,
candidate inspection and evidence path execute the tests. There is no new issuer,
scheduler or state store. Same-user Local approval is explicitly unprotected.

`localAcceptance` derives completion from the existing revalidated Bootstrap view:
all WorkItems must be satisfied, with no drift, stale/invalid Evidence, failed or
unresolved item. One current successful Local verification must transitively
depend on every local-edit item and explicitly execute all criterion test paths.
The supported command arguments are `--test --test-reporter=tap TEST...`, without
filters, globs or additional flags. Tests must be nonempty, entirely passed, with
exit zero and no skipped/todo results. Workflow, item, Task, candidate and integrity
bindings must match. Partial coverage and unsupported commands remain incomplete.

The Task report and continuation may return `complete: true` / `COMPLETE_LOCAL`
at this selected trust level. Evidence itself remains `LOCAL_EXECUTED`,
`UNPROTECTED`, with Protected verification unsatisfied. The protected Alpha Judge
still escalates Local Evidence; the separate Local acceptance judgment does not
rewrite or promote it. Recovery derives completion again and never reexecutes a
consumed Decision. No existing Task is retroactively reclassified.

This bounded implementation conservatively does not close workflows containing
historical `LOCAL_CHECKPOINT` items. A future coverage policy needs its own tests;
the checkpoint is not silently upgraded here. Browser interaction is not proven
by Node tests of domain modules and HTTP assets.
