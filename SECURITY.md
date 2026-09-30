# Security reporting for the experimental alpha

The alpha is under development and is not a security boundary for hostile operators or a compromised local CLI/Docker installation. Its intended boundaries are explicit edit paths, protected tests, tool-free model proposals, and a network-disabled, unprivileged verification container. Local state and exported evidence may contain source and logs.

Do not post credentials, private source, state databases, or exploit details affecting private repositories in public issues. Contact the maintainer at `solarchive.dev@gmail.com` with a short, sanitized description and affected version. Do not send live credentials. This is a reporting address, not a response-time guarantee.

If a boundary failure or incorrect automatic acceptance is suspected, pause affected runs and retain local evidence. Already created remote branches and PRs are not automatically deleted. The maintainer will reproduce the issue, document scope, and require a regression test before restoring the affected workflow.

Current use rights are defined by [LICENSE](LICENSE). The MIT license permits use; this policy does not certify production readiness.
