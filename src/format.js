export const FOOTER = 'Scan every market and get Telegram alerts: https://moolish.com';

const LABEL = { setup9: 'Setup 9', countdown13: 'Countdown 13', countdown12: 'Countdown 12 (waiting)' };
const COLUMNS = ['rank', 'symbol', 'side', 'signal', 'perfected', 'close', 'barTime'];

const perfectedText = (s) => (s.perfected === null ? '' : s.perfected ? 'perfected' : '');

export function toJson(report, now = new Date()) {
  return JSON.stringify({ generatedAt: now.toISOString(), ...report }, null, 2);
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function toCsv(report) {
  const lines = [COLUMNS.join(',')];
  for (const s of report.signals) {
    lines.push(COLUMNS.map((c) => csvCell(s[c] ?? '')).join(','));
  }
  return lines.join('\n');
}

export function toTable(report) {
  const head = `TD Sequential screener: ${report.exchange} ${report.market}, ${report.tf}, latest closed bar, ${report.scanned} symbols scanned`;
  const lines = [head, ''];
  if (report.signals.length === 0) {
    lines.push('No matching signals.');
  } else {
    const header = ['#', 'Symbol', 'Side', 'Signal', 'Perfected', 'Close', 'Bar open (UTC)'];
    const body = report.signals.map((s) => [
      String(s.rank), s.symbol, s.side, LABEL[s.signal], perfectedText(s), String(s.close), s.barTime.replace('.000Z', 'Z'),
    ]);
    const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
    const fmt = (r) => r.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
    lines.push(fmt(header), fmt(widths.map((w) => '-'.repeat(w))), ...body.map(fmt));
  }
  if (report.failed.length) lines.push('', `Skipped (request failed): ${report.failed.join(', ')}`);
  lines.push('', FOOTER);
  return lines.join('\n');
}
