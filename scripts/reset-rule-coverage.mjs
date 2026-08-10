// Coverage claims are per-run evidence. Leaving the previous run's claims in
// place would let a deleted test keep counting, which is exactly the kind of
// stale green this checker exists to prevent.

import { rm } from "node:fs/promises";
import { COVERAGE_DIR } from "./design-doc.mjs";

await rm(COVERAGE_DIR, { recursive: true, force: true });
