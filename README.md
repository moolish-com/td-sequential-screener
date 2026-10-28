# TD Sequential screener for crypto (command line)

[![Tests](https://github.com/moolish-com/td-sequential-screener/actions/workflows/test.yml/badge.svg)](https://github.com/moolish-com/td-sequential-screener/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/td-sequential-screener)](https://www.npmjs.com/package/td-sequential-screener)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`td-sequential-screener` is a command-line TD Sequential screener for crypto. It scans the most traded USDT markets on Binance, Bybit and OKX and lists the symbols whose latest closed bar just printed a TD Setup 9 (TD9), a countdown 13, a perfected 9, or a countdown waiting at 12, on the timeframe you choose. It reads public market data only (no API keys), runs once on demand, and is built on the [`td-sequential-indicator`](https://github.com/moolish-com/td-sequential) counting library. The same counts apply to stocks and forex; this tool covers the crypto exchanges below.

```bash
npx td-sequential-screener --exchange binance --market futures --tf 1d --top 100
```

Example output (real run, 2026-10-28 10:14 UTC, Binance USDⓈ-M futures, 1d, top 100 by 24h volume; only the first rows are signals):

```text
TD Sequential screener: binance futures, 1d, latest closed bar, 100 symbols scanned

#   Symbol    Side  Signal                  Perfected  Close    Bar open (UTC)
--  --------  ----  ----------------------  ---------  -------  --------------------
81  PAXGUSDT  buy   Countdown 13                       4066.57  2026-10-27T00:00:00Z
1   BTCUSDT   sell  Countdown 12 (waiting)             80868.5  2026-10-27T00:00:00Z
5   XAUUSDT   buy   Countdown 12 (waiting)             4070.33  2026-10-27T00:00:00Z
86  DOTUSDT   sell  Countdown 12 (waiting)             1.0007   2026-10-27T00:00:00Z
96  XAUTUSDT  buy   Countdown 12 (waiting)             4058.92  2026-10-27T00:00:00Z

Scan every market and get Telegram alerts: https://moolish.com
```

The counts describe past prices. A countdown 13 or a setup 9 is not a prediction.

## Install

Requires Node.js 20 or newer.

```bash
npx td-sequential-screener --help        # no install
npm install -g td-sequential-screener    # or install globally
```

## Usage

| Option | Values | Default |
|---|---|---|
| `--exchange` | `binance`, `bybit`, `okx` | `binance` |
| `--market` | `spot`, `futures` (Binance USDⓈ-M, Bybit linear, OKX swap) | `spot` |
| `--tf` | `5m` `15m` `30m` `1h` `2h` `4h` `1d` `1w` | `1d` |
| `--top` | top N USDT-quoted symbols by 24h quote volume, 1 to 500 | `100` |
| `--only` | `9` (setup 9, with perfection), `13` (countdown 13), `all` (also countdown 12) | `all` |
| `--format` | `table`, `csv`, `json` | `table` |

Examples:

```bash
td-sequential-screener --exchange bybit --market futures --tf 4h --top 200 --only 9
td-sequential-screener --exchange okx --tf 1d --only 13 --format json
td-sequential-screener --format csv > signals.csv
```

Daily and weekly bars follow the UTC calendar on every exchange. Only closed bars are used: the bar that is still forming is dropped. About 300 bars per symbol are fetched, with 4 requests at a time, short pauses, and retry with backoff when an exchange answers 429. The exit code is 0 after a scan (symbols whose request fails are listed and skipped), 1 if the exchange cannot be reached at all, and 2 for a wrong option. Some regions cannot reach some exchange APIs; if you get an HTTP 451 or 403, try another exchange.

## Output fields

| Field | Meaning |
|---|---|
| `rank` | Position of the symbol by 24h quote volume |
| `symbol` | Symbol without separators (OKX `BTC-USDT-SWAP` shows as `BTCUSDT`) |
| `side` | `buy` (closes below the close 4 bars earlier) or `sell` (above) |
| `signal` | `setup9`, `countdown13` or `countdown12` (a countdown at 12, including a 13 that is deferred) |
| `perfected` | On `setup9` rows, whether the 9 is perfected (bar 8 or 9 reaches beyond bars 6 and 7); empty otherwise |
| `close` | Close of the latest closed bar |
| `barTime` | Open time of that bar, UTC |

In table mode a footer line is printed once; csv and json contain data only.

## Rules in short

- **Setup.** A bar counts for the buy side when its close is lower than the close 4 bars earlier, and for the sell side when it is higher. A "setup 9" is the bar where the count equals 9.
- **Countdown.** After a setup 9, bars whose close is at or below the low 2 bars earlier (buy) or at or above the high 2 bars earlier (sell) are counted up to 13, not necessarily consecutively. The 13th must pass the "13 versus 8" test, otherwise it is deferred and the count stays at 12.
- **TDST levels.** A completed setup leaves a support or resistance level, the plain 9-bar high or low; a broken level cancels the countdown.
- **Perfection.** A perfected 9 has bar 8 or bar 9 beyond bars 6 and 7.

The full rules are in the [td-sequential SPEC](https://github.com/moolish-com/td-sequential/blob/main/SPEC.md). The screener calls the library and adds no rules of its own.

## Verified against reference data

The counting library is checked against parity fixtures of recorded candles with known counts. The screener's own tests use recorded exchange responses (no network): symbol filtering, bar parsing and order, closed-bar handling, retry on 429, the signal rules and the three output formats. Run them with `npm test`.

## What is TD Sequential?

TD Sequential is Tom DeMark's method for spotting a stretched run of closes. A setup counts consecutive bars that close beyond the close four bars earlier, and a completed 9 can start a countdown that needs 13 qualifying bars. A 9 or a 13 describes past prices and gives no direction on its own. Read more in the [TD Sequential guide](https://moolish.com/learn/td-sequential/), including [TDST](https://moolish.com/learn/td-sequential/tdst/) and the [perfected setup](https://moolish.com/learn/td-sequential/perfected-setup/).

## Development

```bash
npm test
node bin/td-sequential-screener.js --top 20
```

## Related

- [td-sequential](https://github.com/moolish-com/td-sequential): JavaScript and TypeScript library (npm)
- [td-sequential-python](https://github.com/moolish-com/td-sequential-python): Python package (PyPI)
- [td-sequential-pine-script](https://github.com/moolish-com/td-sequential-pine-script): TradingView Pine Script v6
- [Free TD Sequential counter](https://moolish.com/tools/td-sequential-counter/): check the current count on a crypto pair in your browser
- Need every market at once, with alerts? Scan every market and get Telegram alerts: [moolish.com](https://moolish.com)

## Attribution and disclaimer

Moolish is not affiliated with, endorsed by or sponsored by Tom DeMark or DeMARK Analytics. TD Sequential is a method created by Tom DeMark, and DeMARK is a trademark of DeMARK Analytics.

This is educational software, not financial advice. Markets carry risk, and a count is a description of past prices, not a prediction.

## Licence

MIT, copyright 2026 Moolish. See [LICENSE](LICENSE).
