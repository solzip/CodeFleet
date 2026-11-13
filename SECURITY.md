# Security reporting

CodeFleet development builds and alpha packages are under development. They are not a security boundary against hostile operators or compromised local tools. Host-Native planning, supervised Local execution and the protected Container verifier have different guarantees; see the [current status](project/PROGRESS.md) and [backend contracts](guides/host-core-guide.md).

Local verification runs explicitly approved commands with local user permissions. It does not provide OS isolation or Protected Evidence. The Container verifier requires its reviewed isolation and immutable verification inputs. Host Sandbox remains unverified. Local state and exported evidence may contain source and logs.

Do not post credentials, private source, state databases, or exploit details affecting private repositories in public issues. Contact the maintainer at `solarchive.dev@gmail.com` with a short, sanitized description and affected version. Do not send live credentials. This is a reporting address, not a response-time guarantee.

If a boundary failure or incorrect automatic acceptance is suspected, pause affected runs and retain local evidence. Already created remote branches and PRs are not automatically deleted. The maintainer will reproduce the issue, document scope, and require a regression test before restoring the affected workflow.

Current use rights are defined by [LICENSE](LICENSE). The MIT license permits use; this policy does not certify production readiness.
