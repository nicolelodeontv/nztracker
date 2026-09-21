import test from 'node:test';
import assert from 'node:assert/strict';
import { pruneRepTrackerSnapshots } from '../lib/multisource-db.mjs';

test('snapshot pruning accepts omitted options', async () => {
  const result = await pruneRepTrackerSnapshots();
  assert.equal(result.deleted, 0);
  assert.equal(result.batches, 0);
});
