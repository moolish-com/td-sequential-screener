// Public market-data adapters (no API keys). Each adapter exposes:
//   universe(getJson) -> [{ symbol, id, quoteVolume }]  (USDT-quoted, unsorted)
//   klines(getJson, id, tf, limit) -> [{ t, o, h, l, c }] oldest first, raw (may include the forming bar)

export const TF_MS = {
  '5m': 300e3, '15m': 900e3, '30m': 1800e3, '1h': 3600e3, '2h': 7200e3,
  '4h': 14400e3, '1d': 86400e3, '1w': 604800e3,
};
export const TIMEFRAMES = Object.keys(TF_MS);

const num = (v) => Number(v);
const bar = (t, o, h, l, c) => ({ t: num(t), o: num(o), h: num(h), l: num(l), c: num(c) });

function checkBybit(res) {
  if (res?.retCode !== 0) throw new Error(`Bybit error ${res?.retCode}: ${res?.retMsg ?? 'unknown'}`);
  return res.result.list;
}
function checkOkx(res) {
  if (res?.code !== '0') throw new Error(`OKX error ${res?.code}: ${res?.msg ?? 'unknown'}`);
  return res.data;
}

const binanceFamily = (base, prefix) => ({
  async universe(get) {
    const rows = await get(`${base}${prefix}/ticker/24hr`);
    return rows
      .filter((r) => r.symbol.endsWith('USDT') && !r.symbol.includes('_'))
      .map((r) => ({ symbol: r.symbol, id: r.symbol, quoteVolume: num(r.quoteVolume) }));
  },
  async klines(get, id, tf, limit) {
    const rows = await get(`${base}${prefix}/klines?symbol=${encodeURIComponent(id)}&interval=${tf}&limit=${limit}`);
    return rows.map((k) => bar(k[0], k[1], k[2], k[3], k[4]));
  },
});

const BYBIT_INTERVAL = { '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '1d': 'D', '1w': 'W' };
const bybit = (category) => ({
  async universe(get) {
    const rows = checkBybit(await get(`https://api.bybit.com/v5/market/tickers?category=${category}`));
    return rows
      .filter((r) => r.symbol.endsWith('USDT') && !r.symbol.includes('-'))
      .map((r) => ({ symbol: r.symbol, id: r.symbol, quoteVolume: num(r.turnover24h) }));
  },
  async klines(get, id, tf, limit) {
    const url = `https://api.bybit.com/v5/market/kline?category=${category}&symbol=${encodeURIComponent(id)}&interval=${BYBIT_INTERVAL[tf]}&limit=${limit}`;
    // Bybit returns newest first.
    return checkBybit(await get(url)).map((k) => bar(k[0], k[1], k[2], k[3], k[4])).reverse();
  },
});

// "Dutc"/"Wutc" keep daily and weekly bars on the UTC calendar, like the other exchanges.
const OKX_BAR = { '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '1d': '1Dutc', '1w': '1Wutc' };
const okx = (instType) => ({
  async universe(get) {
    const rows = checkOkx(await get(`https://www.okx.com/api/v5/market/tickers?instType=${instType}`));
    const wanted = instType === 'SPOT' ? /^[A-Z0-9]+-USDT$/ : /^[A-Z0-9]+-USDT-SWAP$/;
    return rows
      .filter((r) => wanted.test(r.instId))
      // Spot: volCcy24h is in the quote currency. Swap (linear): volCcy24h is in base coins.
      .map((r) => ({
        symbol: r.instId.replace('-SWAP', '').replace('-', ''),
        id: r.instId,
        quoteVolume: instType === 'SPOT' ? num(r.volCcy24h) : num(r.volCcy24h) * num(r.last),
      }));
  },
  async klines(get, id, tf, limit) {
    const url = `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(id)}&bar=${OKX_BAR[tf]}&limit=${Math.min(limit, 300)}`;
    // OKX returns newest first.
    return checkOkx(await get(url)).map((k) => bar(k[0], k[1], k[2], k[3], k[4])).reverse();
  },
});

export const EXCHANGES = {
  binance: {
    spot: binanceFamily('https://api.binance.com', '/api/v3'),
    futures: binanceFamily('https://fapi.binance.com', '/fapi/v1'),
  },
  bybit: { spot: bybit('spot'), futures: bybit('linear') },
  okx: { spot: okx('SPOT'), futures: okx('SWAP') },
};

/** Keep closed bars only: a bar is closed once its open time plus the timeframe has passed. */
export function closedBars(bars, tf, now = Date.now()) {
  return bars.filter((b) => b.t + TF_MS[tf] <= now);
}
