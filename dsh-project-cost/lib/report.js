/**
 * Report assembly for the project-cost meter: scan stored session artifacts,
 * price their usage against the routerai.ru catalog, and group the spend by
 * workspace directory — the number the GUI shows "opposite the directory".
 *
 * @module dsh-project-cost/report
 */

import { stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
// Hot reload: a `?rev=…` query on this module's URL (see lib/index.js) is
// forwarded to every local import, so one cache-busted entry re-reads the
// whole module graph instead of Node's first-loaded ESM cache copies.
const REV = new URL(import.meta.url).search;
const { listSessionArtifacts, scanSessionArtifact } = await import('./scan.js' + REV);
const { loadPrices } = await import('./prices.js' + REV);
const { costRub, emptyUsage, lookupPrice, mergeUsage, cloneUsage } = await import('./cost.js' + REV);

/** Resolve the harness sessions root (`$DSH_HOME/sessions`, else `~/.dsh/sessions`). */
export function defaultSessionsRoot() {
	const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
	return path.join(home, 'sessions');
}

/** Resolve the price-cache file (kept beside the harness home). */
export function defaultPriceCachePath() {
	const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
	return path.join(home, 'project-cost-prices.json');
}

/**
 * Scan one artifact through a size/mtime cache so unchanged logs are never
 * re-decoded.
 *
 * @param artifactPath - absolute path of one session log.
 * @param cache - Map keyed by artifact path holding `{ size, mtimeMs, scan }`.
 * @returns the scan result, or undefined when the artifact is unreadable.
 */
async function scanCached(artifactPath, cache) {
	const stats = await stat(artifactPath);
	const hit = cache.get(artifactPath);
	if (hit !== undefined && hit.size === stats.size && hit.mtimeMs === stats.mtimeMs) return hit.scan;
	let scan;
	try {
		scan = await scanSessionArtifact(artifactPath);
	} catch {
		// One unreadable artifact must not fail the whole report.
		scan = undefined;
	}
	cache.set(artifactPath, { size: stats.size, mtimeMs: stats.mtimeMs, scan });
	return scan;
}

/**
 * Price one scanned session; returns its cost breakdown plus the per-turn money
 * the chat badges show under each message.
 *
 * The per-turn numbers come from the same `assistant/message` accounting the
 * session total uses, so the badges stay consistent with the tree and panel
 * even for turns whose client-side disclosure is unavailable.
 */
function priceSession(scanned, models) {
	const modelRows = [];
	let cost = 0;
	const usage = emptyUsage();
	const unpriced = [];
	for (const [model, modelUsage] of scanned.byModel) {
		mergeUsage(usage, modelUsage);
		const price = lookupPrice(models, model);
		if (price === undefined) {
			unpriced.push(model);
			modelRows.push({ model, costRub: 0, usage: cloneUsage(modelUsage), unpriced: true });
			continue;
		}
		const rub = costRub(modelUsage, price);
		cost += rub;
		modelRows.push({ model, costRub: rub, usage: cloneUsage(modelUsage), unpriced: false });
	}
	modelRows.sort((a, b) => b.costRub - a.costRub || a.model.localeCompare(b.model));
	const turns = {};
	for (const [turn, turnModels] of scanned.byTurn ?? []) {
		let turnCost = 0;
		let priced = false;
		for (const [model, modelUsage] of turnModels) {
			const price = lookupPrice(models, model);
			if (price === undefined) continue;
			priced = true;
			turnCost += costRub(modelUsage, price);
		}
		if (priced && turnCost > 0) turns[turn] = turnCost;
	}
	return { costRub: cost, usage, models: modelRows, unpriced, turns };
}

/**
 * Build the full spend report.
 *
 * @param options - `sessionsRoot` (defaults to the harness home), `cachePath`
 *   (price-cache file), `priceUrl`, `cache` (per-artifact scan cache), and
 *   `prices` (an already-loaded price record to skip loading).
 * @returns the report object: `{ generatedAt, currency, pricing, totals,
 *   directories, sessions }`, one row per workspace directory sorted by spend.
 *   Each `sessions[]` entry carries `turns`, a turn-number → rubles map the chat
 *   badges price one message from.
 */
export async function buildReport(options = {}) {
	const sessionsRoot = options.sessionsRoot ?? defaultSessionsRoot();
	const cache = options.cache ?? new Map();
	const prices = options.prices ?? await loadPrices({
		url: options.priceUrl,
		cachePath: options.cachePath ?? defaultPriceCachePath()
	});

	const artifacts = await listSessionArtifacts(sessionsRoot);
	/** @type {Map<string, any>} */
	const directories = new Map();
	/** @type {{ sessionId: string, path: string, costRub: number }[]} */
	const sessions = [];
	let totalCost = 0;
	let totalSessions = 0;
	const totalUsage = emptyUsage();

	for (const artifactPath of artifacts) {
		const scanned = await scanCached(artifactPath, cache);
		if (scanned === undefined) continue;
		const priced = priceSession(scanned, prices.models);
		const dirPath = scanned.cwd === undefined || scanned.cwd === '' ? '(no directory)' : scanned.cwd;
		let dir = directories.get(dirPath);
		if (dir === undefined) {
			dir = {
				path: dirPath,
				sessions: 0,
				costRub: 0,
				usage: emptyUsage(),
				models: new Map(),
				unpriced: new Set()
			};
			directories.set(dirPath, dir);
		}
		dir.sessions += 1;
		dir.costRub += priced.costRub;
		mergeUsage(dir.usage, priced.usage);
		sessions.push({
			sessionId: scanned.sessionId,
			path: dirPath,
			costRub: priced.costRub,
			turns: priced.turns
		});
		for (const row of priced.models) {
			if (row.unpriced) {
				dir.unpriced.add(row.model);
				continue;
			}
			let modelRow = dir.models.get(row.model);
			if (modelRow === undefined) {
				modelRow = { model: row.model, costRub: 0, usage: emptyUsage() };
				dir.models.set(row.model, modelRow);
			}
			modelRow.costRub += row.costRub;
			mergeUsage(modelRow.usage, row.usage);
		}
		totalCost += priced.costRub;
		totalSessions += 1;
		mergeUsage(totalUsage, priced.usage);
	}

	const rows = [...directories.values()]
		.map((dir) => ({
			path: dir.path,
			sessions: dir.sessions,
			costRub: dir.costRub,
			usage: cloneUsage(dir.usage),
			models: [...dir.models.values()]
				.map((row) => ({ model: row.model, costRub: row.costRub, usage: cloneUsage(row.usage) }))
				.sort((a, b) => b.costRub - a.costRub || a.model.localeCompare(b.model)),
			unpriced: [...dir.unpriced].sort()
		}))
		.sort((a, b) => b.costRub - a.costRub || a.path.localeCompare(b.path));

	return {
		generatedAt: Date.now(),
		currency: 'RUB',
		pricing: {
			source: prices.source,
			fetchedAt: prices.fetchedAt,
			...prices.staleError === undefined ? {} : { staleError: prices.staleError }
		},
		totals: {
			costRub: totalCost,
			sessions: totalSessions,
			usage: cloneUsage(totalUsage)
		},
		directories: rows,
		sessions: sessions.sort((a, b) => b.costRub - a.costRub || a.sessionId.localeCompare(b.sessionId))
	};
}
