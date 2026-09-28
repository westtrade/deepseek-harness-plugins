/**
 * Standalone spend report: the same fold and pricing the GUI panel uses,
 * printed to the terminal. Useful for a quick "сколько мы потратили" check
 * without opening the web UI.
 *
 *   node scripts/report.mjs            # table per directory
 *   node scripts/report.mjs --json     # raw report JSON
 *
 * @module dsh-project-cost/scripts/report
 */

import { buildReport } from '../lib/report.js';
import { formatRub } from '../lib/cost.js';

const asJson = process.argv.includes('--json');
const report = await buildReport();

if (asJson) {
	console.log(JSON.stringify(report, null, 2));
	process.exit(0);
}

const pad = (value, width) => String(value).padEnd(width);
const padStart = (value, width) => String(value).padStart(width);

const rows = report.directories.map((dir) => ({
	path: dir.path,
	sessions: dir.sessions,
	tokens: `${dir.usage.inputTokens + dir.usage.cacheReadTokens} / ${dir.usage.outputTokens}`,
	spent: formatRub(dir.costRub),
	unpriced: dir.unpriced
}));

const widthPath = Math.max(9, ...rows.map((row) => row.path.length));
const widthSessions = Math.max(8, ...rows.map((row) => row.sessions.length));
const widthTokens = Math.max(13, ...rows.map((row) => row.tokens.length));
const widthSpent = Math.max(6, ...rows.map((row) => row.spent.length));

console.log(`${pad('DIRECTORY', widthPath)}  ${padStart('SESSIONS', widthSessions)}  ${padStart('TOKENS in / out', widthTokens)}  ${padStart('SPENT', widthSpent)}`);
for (const row of rows) {
	console.log(`${pad(row.path, widthPath)}  ${padStart(row.sessions, widthSessions)}  ${padStart(row.tokens, widthTokens)}  ${padStart(row.spent, widthSpent)}`);
	if (row.unpriced.length > 0) console.log(`${' '.repeat(widthPath)}  ! unpriced: ${row.unpriced.join(', ')}`);
}
console.log(`${pad('TOTAL', widthPath)}  ${padStart(report.totals.sessions, widthSessions)}  ${padStart('', widthTokens)}  ${padStart(formatRub(report.totals.costRub), widthSpent)}`);
console.log(`\nprices: routerai.ru (${report.pricing.source}${report.pricing.staleError === undefined ? '' : `, stale: ${report.pricing.staleError}`})`);
