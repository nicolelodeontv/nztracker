import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const MIGRATION_FILENAME = /^(\d{14})_(.+)\.sql$/;

test('local migration filenames match checked-in production history', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../supabase/remote-migration-history.json', import.meta.url), 'utf8'),
  );

  const files = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const actual = files.map((file) => {
    const match = file.match(MIGRATION_FILENAME);
    assert.ok(match, `Invalid migration filename: ${file}`);
    return { version: match[1], name: match[2] };
  });

  const expected = [...manifest].sort((a, b) =>
    a.version.localeCompare(b.version) || a.name.localeCompare(b.name),
  );

  assert.deepEqual(
    actual,
    expected,
    'Migration files must stay aligned with the checked-in production migration history. Refresh the manifest from production before merging migration changes.',
  );
});
