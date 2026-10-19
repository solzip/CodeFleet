# Acceptance and adversarial test matrix

## Existing regression (cannot regress)
- Alpha v1 Node/Java contract paths and immutable verification behavior, status/resume/pause/cancel/export, draft PR delivery reconciliation; tests and doc checks included in `npm test`.
- Legacy task revision/approval/read-only archive behavior and public CLI entrypoints remain compatible.
- Provider tool-free proposals do not gain filesystem, shell or remote credentials.
- Protected test assets cannot be modified by candidate; verified tree and PR tree must match.

## Tests by feature
| ID | Failure injection / proof | Required result |
|---|---|---|
| CF-GATE-01 | Provider asserts tests PASS but Harness not run | fail/inconclusive, never successful Run |
| CF-GATE-02 | Zero tests/missing JUnit/truncated report | not PASS |
| CF-GATE-03 | Evidence file modified post-hash | integrity defect, not waivable as observation gap |
| CF-GATE-04 | Task Draft expands scope without authorization | reject + audit |
| CF-GATE-05 | Required acceptance method not executable | NEEDS_INPUT / human condition, no silent completion |
| CF-GATE-06 | Same command/event delivered twice | no duplicate state/effect |
| CF-GATE-07 | Graph introduces cycle, missing refs or stale revision | reject |
| CF-GATE-08 | Finished Attempt altered, stale fencing response | reject |
| CF-GATE-09 | Two agents modify conflicting scope | integration stops before workspace change |
| CF-GATE-10 | Two nonconflicting changes fail semantic integration test | no completion or PR |
| CF-GATE-11 | Final Git tree changed after verification | invalidate and reverify |
| CF-GATE-12 | DB migration on existing alpha user_version=1 | records preserved and original Alpha CLI works |
| CF-GATE-13 | Process dies at launch / verify / artifact / delivery boundary | safe reconcile, no invented success |
| CF-GATE-14 | Remote PR created but response lost | find same PR, do not create duplicate |
| CF-GATE-15 | Forbidden filesystem/network/secret access | OS enforcement proven or capability unavailable |
| CF-GATE-16 | Codex/Claude unavailable or capability missing | preflight fail closed, no unsafe fallback |
| CF-GATE-17 | JSON CLI in non-TTY + approval needed | machine parseable status, no hang |
| CF-GATE-18 | Old Alpha contract runs after all changes | identical security and successful behavior |
| CF-GATE-19 | Old Legacy tests/commands still pass | compatible or separately documented approved migration |
| CF-GATE-20 | Provider cost unknown | preserve unknown, not 0, obey strict budget rejection |

## CI
L1 domain/model, L2 SQLite/process/git, L3 fault & sandbox, L4 fake-provider E2E on all PRs. Live compatibility tests opt-in. Platform-specific security claims only with actual tested enforcement. Reject 0 discovered tests and report denominators.

## Release gate
Require tests+doc checks, supported-platform E2E, package install/uninstall, clean migration and rollback plan, published docs matching *actual* functionality, no high-risk unapproved side effect. Independent external pilot is a separate product-success gate, not implied by self-run CI.
