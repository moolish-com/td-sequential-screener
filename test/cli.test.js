import test from 'node:test';
import assert from 'node:assert/strict';
import { main, parseOptions } from '../src/cli.js';
import { toCsv, toJson, toTable, FOOTER } from '../src/format.js';
import { binanceKlines, BUY_SETUP_9_CLOSES } from './helpers.js';

const report = {
  exchange: 'binance', market: 'futures', tf: '1d', scanned: 2, failed: [],
  signals: [{ rank: 1, symbol: 'AAAUSDT', side: 'buy', signal: 'setup9', perfected: true, close: 123, barTime: '2026-10-27T00:00:00.000Z' }],
};

function harness(argv) {
  const out = []; const err = [];
  const NOW = BUY_SETUP_9_CLOSES.length * 86400e3 + 1000;
  const get = async (url) => (url.includes('/ticker/24hr')
    ? [{ symbol: 'AAAUSDT', quoteVolume: '10' }]
    : binanceKlines(BUY_SETUP_9_CLOSES));
  return main(argv, { out: (s) => out.push(s), err: (s) => err.push(s), deps: { get, now: NOW, delayMs: 0 } })
    .then((code) => ({ code, out: out.join('\n'), err: err.join('\n') }));
}

test('defaults and validation', () => {
  assert.deepEqual(parseOptions([]), { exchange: 'binance', market: 'spot', tf: '1d', top: 100, only: 'all', format: 'table', help: false });
  for (const bad of [['--exchange', 'kraken'], ['--market', 'perp'], ['--tf', '3m'], ['--top', '0'], ['--top', '501'], ['--top', 'x'], ['--only', '5'], ['--format', 'xml']]) {
    assert.throws(() => parseOptions(bad), /--/, bad.join(' '));
  }
});

test('table output has the footer exactly once, last', () => {
  const t = toTable(report);
  assert.equal(t.split(FOOTER).length, 2);
  assert.ok(t.endsWith(FOOTER));
  assert.equal(FOOTER, 'Scan every market and get Telegram alerts: https://moolish.com');
  assert.match(t, /Setup 9\s+perfected/);
});

test('empty table says so and still shows the footer', () => {
  const t = toTable({ ...report, signals: [] });
  assert.match(t, /No matching signals/);
  assert.ok(t.endsWith(FOOTER));
});

test('csv and json carry no footer', () => {
  assert.equal(toCsv(report).split('\n')[0], 'rank,symbol,side,signal,perfected,close,barTime');
  assert.ok(!toCsv(report).includes('moolish'));
  const parsed = JSON.parse(toJson(report, new Date('2026-10-28T00:00:00Z')));
  assert.equal(parsed.signals[0].signal, 'setup9');
  assert.equal(parsed.generatedAt, '2026-10-28T00:00:00.000Z');
  assert.ok(!toJson(report).includes('moolish'));
});

test('csv quotes cells that need it', () => {
  assert.match(toCsv({ ...report, signals: [{ ...report.signals[0], symbol: 'A,B' }] }), /"A,B"/);
});

test('main prints a table and exits 0', async () => {
  const r = await harness(['--top', '5']);
  assert.equal(r.code, 0);
  assert.match(r.out, /AAAUSDT\s+buy\s+Setup 9/);
  assert.match(r.out, /moolish\.com/);
});

test('main --format json exits 0 with parseable output', async () => {
  const r = await harness(['--format', 'json', '--only', '9']);
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.out).signals.length, 1);
});

test('main with a bad option exits 2 and explains', async () => {
  const r = await harness(['--tf', '7m']);
  assert.equal(r.code, 2);
  assert.match(r.err, /--tf must be one of/);
});

test('main --help exits 0', async () => {
  const r = await harness(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.out, /Usage:/);
});

test('main reports an exchange failure with exit 1', async () => {
  const out = []; const err = [];
  const code = await main([], { out: (s) => out.push(s), err: (s) => err.push(s), deps: { get: async () => { throw new Error('HTTP 451'); }, delayMs: 0 } });
  assert.equal(code, 1);
  assert.match(err.join(''), /HTTP 451/);
});
