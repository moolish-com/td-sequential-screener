import { computeTdSequential } from './td.js';
import { EXCHANGES, closedBars } from './exchanges.js';
import { getJson } from './http.js';

export const BARS = 300;
const MIN_BARS = 30; // fewer closed bars than this (new listings) gives a meaningless count

/** Turn the last record of a computeTdSequential() result into signal rows. */
export function signalsFor(record) {
  const out = [];
  for (const side of ['buy', 'sell']) {
    const setup = record[`${side}Setup`];
    const cd = Math.abs(record[`${side}Countdown`]);
    if (setup === 9) out.push({ side, signal: 'setup9', perfected: record[`${side}Perfected`] });
    if (cd === 13) out.push({ side, signal: 'countdown13', perfected: null });
    else if (cd === 12) out.push({ side, signal: 'countdown12', perfected: null });
  }
  return out;
}

const SIGNAL_ORDER = { countdown13: 0, setup9: 1, countdown12: 2 };
const KEEP = { 9: ['setup9'], 13: ['countdown13'], all: ['countdown13', 'setup9', 'countdown12'] };

/** Run `fn` over `items` with at most `limit` in flight; each worker pauses `delayMs` between items. */
async function pool(items, limit, delayMs, fn, sleep) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
      if (delayMs && next < items.length) await sleep(delayMs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * @param {{exchange:string, market:string, tf:string, top:number, only:'9'|'13'|'all'}} o
 * @param {{get?:Function, now?:number, concurrency?:number, delayMs?:number, sleep?:Function, onWarn?:Function}} [deps]
 */
export async function scan(o, deps = {}) {
  const adapter = EXCHANGES[o.exchange]?.[o.market];
  if (!adapter) throw new Error(`Unsupported exchange/market: ${o.exchange} ${o.market}`);
  const get = deps.get ?? ((url) => getJson(url));
  const now = deps.now ?? Date.now();
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const warn = deps.onWarn ?? (() => {});

  const universe = (await adapter.universe(get))
    .filter((u) => u.quoteVolume > 0)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, o.top);

  const rows = [];
  const failed = [];
  await pool(universe, deps.concurrency ?? 4, deps.delayMs ?? 120, async (u, i) => {
    try {
      const bars = closedBars(await adapter.klines(get, u.id, o.tf, BARS), o.tf, now);
      if (bars.length < MIN_BARS) return;
      const result = computeTdSequential(bars);
      const last = result[result.length - 1];
      for (const s of signalsFor(last)) {
        if (!KEEP[o.only].includes(s.signal)) continue;
        rows.push({ rank: i + 1, symbol: u.symbol, ...s, close: bars[bars.length - 1].c, barTime: new Date(last.t).toISOString() });
      }
    } catch (err) {
      failed.push(u.symbol);
      warn(`${u.symbol}: ${err.message}`);
    }
  }, sleep);

  rows.sort((a, b) => SIGNAL_ORDER[a.signal] - SIGNAL_ORDER[b.signal] || a.rank - b.rank || a.side.localeCompare(b.side));
  return { exchange: o.exchange, market: o.market, tf: o.tf, scanned: universe.length - failed.length, failed, signals: rows };
}
