import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTdSequential } from '../src/td.js';

test('the counting library loads through the shim and counts a setup 9', () => {
  const closes = [...Array.from({ length: 10 }, (_, i) => 100 + i), ...Array.from({ length: 9 }, (_, k) => 109 - 4 * (k + 1))];
  const bars = closes.map((c, t) => ({ t, o: c, h: c + 1, l: c - 1, c }));
  assert.equal(computeTdSequential(bars).at(-1).buySetup, 9);
});
