import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('calculated stamina replacement function qualifies ambiguous table columns', async () => {
  const source=await readFile(
    new URL('../supabase/migrations/20260923020000_fix_calculated_stamina_ambiguity.sql', import.meta.url),
    'utf8'
  );
  assert.match(source,/create or replace function public\.advance_rep_tracker_stamina/);
  assert.match(source,/from public\.rep_tracker_stamina_state as t/);
  assert.match(source,/where t\.clan_id = p_clan_id/);
  assert.match(source,/and t\.season = p_season/);
  assert.match(source,/and t\.member_id = p_member_id/);
  assert.match(source,/update public\.rep_tracker_stamina_state as t/);
  assert.doesNotMatch(source,/where clan_id = p_clan_id/);
  assert.doesNotMatch(source,/where clan_id = p_clan_id\s*\n\s*and season = p_season/);
});
