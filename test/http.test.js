import test from 'node:test';
import assert from 'node:assert/strict';
import { getJson, HttpError } from '../src/http.js';

const reply = (status, body = {}, headers = {}) => ({
  ok: status < 300, status, headers: new Headers(headers), json: async () => body,
});

test('retries on 429 with backoff, honouring Retry-After, then succeeds', async () => {
  const seq = [reply(429, {}, { 'retry-after': '2' }), reply(503), reply(200, { ok: 1 })];
  const waits = [];
  const out = await getJson('https://x.test/a', {
    fetchImpl: async () => seq.shift(), sleepImpl: async (ms) => { waits.push(ms); }, baseDelayMs: 100,
  });
  assert.deepEqual(out, { ok: 1 });
  assert.deepEqual(waits, [2000, 200]);
});

test('does not retry a 400', async () => {
  let calls = 0;
  await assert.rejects(
    getJson('https://x.test/a', { fetchImpl: async () => { calls++; return reply(400); }, sleepImpl: async () => {} }),
    (e) => e instanceof HttpError && e.status === 400,
  );
  assert.equal(calls, 1);
});

test('gives up after the retry budget and surfaces the last error', async () => {
  let calls = 0;
  await assert.rejects(
    getJson('https://x.test/a', { retries: 2, fetchImpl: async () => { calls++; return reply(429); }, sleepImpl: async () => {} }),
    (e) => e.status === 429,
  );
  assert.equal(calls, 3);
});

test('retries network errors', async () => {
  let calls = 0;
  const out = await getJson('https://x.test/a', {
    sleepImpl: async () => {},
    fetchImpl: async () => { if (calls++ === 0) throw new TypeError('fetch failed'); return reply(200, [1]); },
  });
  assert.deepEqual(out, [1]);
});
