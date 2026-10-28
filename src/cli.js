import { parseArgs } from 'node:util';
import { scan } from './scan.js';
import { toCsv, toJson, toTable } from './format.js';
import { EXCHANGES, TIMEFRAMES } from './exchanges.js';

const HELP = `td-sequential-screener - TD Sequential screener for crypto (on demand, public data, no API keys)

Usage: td-sequential-screener [options]

  --exchange <name>   ${Object.keys(EXCHANGES).join(' | ')}            (default: binance)
  --market <type>     spot | futures                (default: spot)
  --tf <timeframe>    ${TIMEFRAMES.join(' ')}   (default: 1d)
  --top <n>           top N USDT symbols by 24h quote volume (default: 100, max 500)
  --only <signal>     9 | 13 | all                  (default: all)
  --format <format>   table | csv | json            (default: table)
  -h, --help          show this help

Looks at the latest closed bar of each symbol. Educational software, not financial advice.`;

export function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      exchange: { type: 'string', default: 'binance' },
      market: { type: 'string', default: 'spot' },
      tf: { type: 'string', default: '1d' },
      top: { type: 'string', default: '100' },
      only: { type: 'string', default: 'all' },
      format: { type: 'string', default: 'table' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  if (values.help) return { help: true };
  const fail = (msg) => { throw new Error(msg); };
  if (!EXCHANGES[values.exchange]) fail(`--exchange must be one of: ${Object.keys(EXCHANGES).join(', ')}`);
  if (!['spot', 'futures'].includes(values.market)) fail('--market must be spot or futures');
  if (!TIMEFRAMES.includes(values.tf)) fail(`--tf must be one of: ${TIMEFRAMES.join(', ')}`);
  if (!/^\d+$/.test(values.top) || +values.top < 1 || +values.top > 500) fail('--top must be an integer from 1 to 500');
  if (!['9', '13', 'all'].includes(values.only)) fail('--only must be 9, 13 or all');
  if (!['table', 'csv', 'json'].includes(values.format)) fail('--format must be table, csv or json');
  return { ...values, top: +values.top };
}

/** Returns the process exit code. `io` is injectable for tests. */
export async function main(argv, io = { out: (s) => console.log(s), err: (s) => console.error(s), deps: {} }) {
  let o;
  try {
    o = parseOptions(argv);
  } catch (err) {
    io.err(`${err.message}\n\n${HELP}`);
    return 2;
  }
  if (o.help) { io.out(HELP); return 0; }
  try {
    const report = await scan(o, { ...io.deps, onWarn: (m) => io.err(`warning: ${m}`) });
    io.out({ table: toTable, csv: toCsv, json: toJson }[o.format](report));
    return 0;
  } catch (err) {
    io.err(`error: ${err.message}`);
    return 1;
  }
}
