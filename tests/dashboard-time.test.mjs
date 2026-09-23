import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAge } from '../app/lib/dashboard-time.mjs';

test('formatAge returns a safe placeholder for missing timestamps',()=>{
  assert.equal(formatAge(null,Date.parse('2026-09-23T02:00:00.000Z')),'—');
  assert.equal(formatAge(undefined,Date.parse('2026-09-23T02:00:00.000Z')),'—');
  assert.equal(formatAge('',Date.parse('2026-09-23T02:00:00.000Z')),'—');
});

test('formatAge formats ISO timestamps as elapsed age',()=>{
  const now=Date.parse('2026-09-23T02:00:00.000Z');
  assert.equal(formatAge('2026-09-23T01:59:10.000Z',now),'50s ago');
  assert.equal(formatAge('2026-09-23T01:30:00.000Z',now),'30m ago');
  assert.equal(formatAge('2026-09-22T23:00:00.000Z',now),'3h ago');
});

test('formatAge returns a safe placeholder for invalid timestamp strings',()=>{
  assert.equal(formatAge('not-a-date',Date.parse('2026-09-23T02:00:00.000Z')),'—');
});

test('formatAge preserves numeric age seconds for existing callers',()=>{
  assert.equal(formatAge(5),'5s ago');
  assert.equal(formatAge(90),'1m ago');
  assert.equal(formatAge(3600),'1h ago');
});
