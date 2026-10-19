# CodeFleet Implementation Blueprint v1.0 (repository-tailored)

Status: **implementation specification / not yet executed or validated**. Prepared 2026-10-19 against a read-only review of `solzip/CodeFleet` main (branch commit must be recorded afresh by implementer). The prior conceptual CF-ARCH-001..011 is input, not authority over repository contracts.

## Product invariant
**Autonomous Execution. Controlled Process. Verified Results.** Transform natural-language goals into bounded approved contracts, orchestrate Codex/Claude tasks, and accept results **only from independent Harness evidence**, never an agent's assertion.

## What must not change
- Existing `codefleet-alpha run contract.json <repository>` and its v1 contract continue to work.
- Existing Node/Java (Gradle/Maven) bounded-proposal/isolated-test/draft-PR pathways and recovery semantics remain valid; do not broaden the release's current safety claims.
- Legacy archived code/records remain intact; do not rewrite history or retroactively mark audits verified.
- No auto-merge, deployment, unrestricted agent tools, or blanket approval bypass.
- MIT attribution and the repository's documented author/publication rules remain unchanged.

## Read in this order
1. `01-product/PRODUCT_CONTRACT.md`
2. `02-repository/BASELINE_AND_GAP.md`
3. `03-architecture/INTEGRATION_DECISIONS.md`
4. `04-contracts/EXECUTION_CONTRACTS.md`
5. `05-implementation/PHASED_WORK.md`
6. `06-verification/ACCEPTANCE_MATRIX.md`
7. `MASTER_IMPLEMENTATION_PROMPT.md`

## Workflow
- Audit real checked-out HEAD and execute test baseline first; if it differs, update the mapping instead of forcing this plan.
- Implement vertical slices with tests and evidence; avoid wholesale rewrites and new independent controllers.
- Mark claims as IMPLEMENTED only when source exists; VERIFIED only with executed evidence.

## Existing repository references
`package.json`, `CLAUDE.md`, `docs/product-completion/{architecture,progress,roadmap}.md`, `src/alpha/{controller,store,provider,contract,workspace,verifier,delivery,cli}.mjs`, `src/{run,task-ledger,command-policy,required-gates,isolation}.ts`.

No code changes have been made to the remote repository by this package. No repository test has been executed as part of this packaging step.
