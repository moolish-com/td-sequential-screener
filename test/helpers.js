import { readFileSync } from 'node:fs';

export const recorded = JSON.parse(readFileSync(new URL('./fixtures/exchange-responses.json', import.meta.url), 'utf8'));

/** A `get(url)` that serves the recorded responses and remembers the URLs it was asked for. */
export function recordedGet() {
  const urls = [];
  const get = async (url) => {
    urls.push(url);
    const u = new URL(url);
    const q = (name) => u.searchParams.get(name) ?? '';
    const key = {
      'api.binance.com': () => 'binance-spot',
      'fapi.binance.com': () => 'binance-futures',
      'api.bybit.com': () => (q('category') === 'spot' ? 'bybit-spot' : 'bybit-futures'),
      'www.okx.com': () => ((q('instType') + q('instId')).includes('SWAP') ? 'okx-swap' : 'okx-spot'),
    }[u.host]();
    return /ticker/.test(u.pathname) ? recorded[key].ticker : recorded[key].klines;
  };
  return { get, urls };
}

/** Raw Binance-style klines for a close series, one day apart starting at `start`. */
export function binanceKlines(closes, start = 0, step = 86400e3) {
  return closes.map((c, i) => [start + i * step, String(c), String(c + 1), String(c - 1), String(c), '1']);
}

/** 40 rising closes then 9 falling ones: the final closed bar is a buy setup 9. */
export const BUY_SETUP_9_CLOSES = [
  ...Array.from({ length: 40 }, (_, i) => 100 + i),
  ...Array.from({ length: 9 }, (_, k) => 139 - 4 * (k + 1)),
];
