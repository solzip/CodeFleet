// Coverage claims are per-run evidence. Leaving the previous run's claims in
// place would let a deleted test keep counting, which is exactly the kind of
// stale green this checker exists to prevent.

// The directory is recreated rather than left to the first test that writes a
// claim, because the test runner opens its TAP destination here before any test
// runs. A missing directory would kill the run with an fs error that says
// nothing about the cause.

import { mkdir, rm } from "node:fs/promises";
import { COVERAGE_DIR } from "./design-doc.mjs";

await rm(COVERAGE_DIR, { recursive: true, force: true });
await mkdir(COVERAGE_DIR, { recursive: true });
