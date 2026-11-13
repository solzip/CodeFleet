import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { BASELINE_PATH, STATUS_PATH, readDesignDoc, parseRules } from '../scripts/design-doc.mjs';
import { ANCHOR_BASELINE_PATH, historicalRecordFiles } from '../scripts/check-doc-facts.mjs';
import { LIVING_DOCS } from '../scripts/check-doc-citations.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('docs contains current contracts, not generated evidence, guides or status', () => {
  const entries = readdirSync(path.join(root, 'docs')).sort();
  assert.deepEqual(entries, ['PRODUCT_VISION.md', 'README.md', 'implementation', 'product-completion']);
  assert.deepEqual(readdirSync(path.join(root, 'docs/product-completion')).sort(), ['architecture.md', 'roadmap.md']);
  for (const file of ['guides/README.md', 'project/PROGRESS.md', 'CONTRIBUTING.md']) {
    assert.ok(existsSync(path.join(root, file)), file);
  }
});

test('relocated rule inputs remain local and nonempty; no docs fallback', async () => {
  for (const file of [BASELINE_PATH, STATUS_PATH, ANCHOR_BASELINE_PATH]) {
    assert.ok(file.startsWith(path.join(root, 'test/contracts/legacy') + path.sep));
    assert.ok(existsSync(file), file);
  }
  const rules = parseRules(await readDesignDoc());
  assert.ok(rules.length > 0);
  assert.equal(existsSync(path.join(root, 'docs/concept-foundation.md')), false);
  assert.ok(LIVING_DOCS.has('test/contracts/legacy/REGISTER.md'));
  assert.ok(LIVING_DOCS.has('test/contracts/legacy/archive/2026-08-13/ARCHIVE.md'));
});

test('historical fact denominator includes moved archives but rejects adjacent contracts', () => {
  const included = ['docs/runs/old.md', 'docs/audits/old.md', 'docs/archive/old.md', 'test/contracts/legacy/archive/2026-08-13/ARCHIVE.md'];
  const excluded = ['project/PROGRESS.md', 'test/contracts/legacy/README.md', 'test/contracts/legacy/alpha-roadmap.md', 'test/contracts/legacy/archive-not-evidence/a.md', 'guides/README.md'];
  assert.deepEqual(historicalRecordFiles([...included, ...excluded]), included);
  assert.deepEqual(historicalRecordFiles(excluded), []);
});
