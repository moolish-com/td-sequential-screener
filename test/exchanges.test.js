import test from 'node:test';
import assert from 'node:assert/strict';
import { EXCHANGES, closedBars, TF_MS } from '../src/exchanges.js';
import { recorded, recordedGet } from './helpers.js';

const CASES = [
  ['binance', 'spot', 'BTCUSDT', 'BTCUSDT'],
  ['binance', 'futures', 'BTCUSDT', 'BTCUSDT'],
  ['bybit', 'spot', 'BTCUSDT', 'BTCUSDT'],
  ['bybit', 'futures', 'BTCUSDT', 'BTCUSDT'],
  ['okx', 'spot', 'BTCUSDT', 'BTC-USDT'],
  ['okx', 'futures', 'BTCUSDT', 'BTC-USDT-SWAP'],
];

for (const [ex, market, symbol, id] of CASES) {
  test(`${ex} ${market}: universe keeps USDT pairs only, with numeric quote volume`, async () => {
    const { get } = recordedGet();
    const u = await EXCHANGES[ex][market].universe(get);
    assert.ok(u.length >= 2);
    for (const r of u) {
      assert.match(r.symbol, /USDT$/);
      assert.equal(typeof r.quoteVolume, 'number');
      assert.ok(r.quoteVolume > 0);
    }
    const btc = u.find((r) => r.symbol === symbol);
    assert.equal(btc.id, id);
  });

  test(`${ex} ${market}: klines are oldest first with numeric OHLC`, async () => {
    const { get, urls } = recordedGet();
    const bars = await EXCHANGES[ex][market].klines(get, id, '1d', 60);
    assert.equal(bars.length, 60);
    for (let i = 1; i < bars.length; i++) assert.ok(bars[i].t > bars[i - 1].t);
    for (const b of bars) {
      for (const k of ['t', 'o', 'h', 'l', 'c']) assert.ok(Number.isFinite(b[k]), k);
      assert.ok(b.h >= b.l);
    }
    assert.match(urls[0], /limit=60/);
  });
}

test('okx futures universe excludes coin-margined swaps and values volume in quote currency', async () => {
  const { get } = recordedGet();
  const u = await EXCHANGES.okx.futures.universe(get);
  assert.ok(!u.some((r) => r.id.includes('-USD-SWAP')));
  const row = recorded['okx-swap'].ticker.data[0];
  assert.equal(u[0].quoteVolume, Number(row.volCcy24h) * Number(row.last));
});

test('daily timeframe maps to UTC-calendar intervals on every exchange', async () => {
  const urls = [];
  const get = async (url) => { urls.push(url); const { get: g } = recordedGet(); return g(url); };
  for (const [ex, , , id] of CASES.filter((c) => c[1] === 'spot')) await EXCHANGES[ex].spot.klines(get, id, '1d', 60);
  assert.match(urls[0], /interval=1d/);
  assert.match(urls[1], /interval=D/);
  assert.match(urls[2], /bar=1Dutc/);
});

test('closedBars drops the bar that is still forming', () => {
  const day = TF_MS['1d'];
  const bars = [{ t: 0 }, { t: day }, { t: 2 * day }];
  assert.equal(closedBars(bars, '1d', 2.5 * day).length, 2);
  assert.equal(closedBars(bars, '1d', 3 * day).length, 3); // third bar closes exactly now
});
