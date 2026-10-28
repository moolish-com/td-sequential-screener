import test from 'node:test';
import assert from 'node:assert/strict';
import { scan, signalsFor } from '../src/scan.js';
import { computeTdSequential } from '../src/td.js';
import { binanceKlines, BUY_SETUP_9_CLOSES } from './helpers.js';

const DAY = 86400e3;
const closes = BUY_SETUP_9_CLOSES;
const NOW = closes.length * DAY + DAY / 2; // the bar after the last one is still forming

const ticker = [
  { symbol: 'AAAUSDT', quoteVolume: '900' },
  { symbol: 'BBBUSDT', quoteVolume: '500' },
  { symbol: 'CCCUSDT', quoteVolume: '100' },
  { symbol: 'AAAUSDC', quoteVolume: '9999' },
];
// AAA: buy setup 9 on its last closed bar, plus a forming bar that would make it setup 10 if wrongly included.
// BBB: flat. CCC: request fails.
function fakeGet(failFor = 'CCCUSDT') {
  const requested = [];
  const get = async (url) => {
    requested.push(url);
    if (url.includes('/ticker/24hr')) return ticker;
    const sym = new URL(url).searchParams.get('symbol');
    if (sym === failFor) throw new Error('boom');
    if (sym === 'AAAUSDT') return binanceKlines([...closes, closes.at(-1) - 4]);
    return binanceKlines(closes.map(() => 100));
  };
  return { get, requested };
}
const run = (over = {}, g = fakeGet()) => scan({ exchange: 'binance', market: 'spot', tf: '1d', top: 10, only: 'all', ...over },
  { get: g.get, now: NOW, delayMs: 0, onWarn: () => {} });

test('reports setup 9 from the latest closed bar only, ranks by volume, ignores non-USDT pairs', async () => {
  const r = await run();
  assert.equal(r.signals.length, 1);
  const [s] = r.signals;
  assert.equal(s.symbol, 'AAAUSDT');
  assert.equal(s.side, 'buy');
  assert.equal(s.signal, 'setup9');
  assert.equal(s.rank, 1);
  assert.equal(s.close, closes.at(-1));
  assert.equal(s.perfected, computeTdSequential(binanceKlines(closes).map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }))).at(-1).buyPerfected);
});

test('a failed symbol is skipped and listed, not fatal', async () => {
  const r = await run();
  assert.deepEqual(r.failed, ['CCCUSDT']);
  assert.equal(r.scanned, 2);
});

test('--top limits the universe by volume', async () => {
  const g = fakeGet();
  await run({ top: 1 }, g);
  const klineCalls = g.requested.filter((u) => u.includes('/klines'));
  assert.equal(klineCalls.length, 1);
  assert.match(klineCalls[0], /symbol=AAAUSDT/);
  assert.match(klineCalls[0], /limit=300/);
});

test('--only 13 filters out setup 9 rows', async () => {
  assert.deepEqual((await run({ only: '13' })).signals, []);
  assert.equal((await run({ only: '9' })).signals.length, 1);
});

test('concurrency never exceeds the limit', async () => {
  let inFlight = 0; let peak = 0;
  const get = async (url) => {
    if (url.includes('/ticker/24hr')) return Array.from({ length: 12 }, (_, i) => ({ symbol: `S${i}USDT`, quoteVolume: String(100 - i) }));
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return binanceKlines(closes);
  };
  await scan({ exchange: 'binance', market: 'spot', tf: '1d', top: 12, only: 'all' }, { get, now: NOW, delayMs: 0, concurrency: 4 });
  assert.equal(peak, 4);
});

test('signalsFor maps countdown 13, 12 and a deferred 12 (negative) per side', () => {
  const base = { buySetup: 0, sellSetup: 0, buyCountdown: 14, sellCountdown: 14, buyPerfected: false, sellPerfected: false };
  assert.deepEqual(signalsFor({ ...base, buyCountdown: 13 }), [{ side: 'buy', signal: 'countdown13', perfected: null }]);
  assert.deepEqual(signalsFor({ ...base, sellCountdown: 12 }), [{ side: 'sell', signal: 'countdown12', perfected: null }]);
  assert.deepEqual(signalsFor({ ...base, buyCountdown: -12 }), [{ side: 'buy', signal: 'countdown12', perfected: null }]);
  assert.deepEqual(signalsFor({ ...base, sellSetup: 9, sellPerfected: true }), [{ side: 'sell', signal: 'setup9', perfected: true }]);
  assert.deepEqual(signalsFor({ ...base, buyCountdown: 8, sellSetup: 10 }), []);
});

test('unsupported exchange or market is rejected', async () => {
  await assert.rejects(scan({ exchange: 'nope', market: 'spot', tf: '1d', top: 1, only: 'all' }, {}), /Unsupported/);
});
