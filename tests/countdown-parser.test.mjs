import test from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import { parseCountdown } from '../app/lib/source-parser.mjs';

test('placeholder countdown HTML returns null', () => {
  const $ = cheerio.load('<div class="clr-cd"><span data-d>--</span><span data-h>--</span><span data-m>--</span><span data-s>--</span></div>');
  assert.equal(parseCountdown($), null);
});

test('missing countdown returns null', () => {
  const $ = cheerio.load('<div class="ranking">Season 3</div>');
  assert.equal(parseCountdown($), null);
});
