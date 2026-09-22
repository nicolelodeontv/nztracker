import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sync health treats fallback data as healthy while tracking source degradation',async()=>{
  const source=await readFile(new URL('../app/lib/sync-health.mjs',import.meta.url),'utf8');
  assert.match(source,/const isHealthy=outcome==='success'/);
  assert.match(source,/lastHealthyAt:isHealthy\?at/);
  assert.match(source,/lastError:outcome==='error'\?String\(error\|\|'Sync failed\.'\):null/);
  assert.match(source,/consecutiveWarnings:outcome==='warning'\?Number\(previous\?\.consecutiveWarnings\|\|0\)\+1:0/);
  assert.match(source,/consecutiveSourceWarnings:isSourceDegraded\?Number\(previous\?\.consecutiveSourceWarnings\|\|0\)\+1:0/);
  assert.match(source,/lastSourceDegradedAt:isSourceDegraded\?at/);
});
