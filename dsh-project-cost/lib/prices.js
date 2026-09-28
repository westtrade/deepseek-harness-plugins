/**
 * RouterAI price table for the project-cost meter: one fetch of the public
 * model catalog (`https://routerai.ru/api/v1/models`), a disk cache so a cold
 * start with no network still prices everything, and a bundled snapshot as the
 * last-resort fallback.
 *
 * All prices are rubles per single token, the catalog's own unit.
 *
 * @module dsh-project-cost/prices
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Default catalog endpoint — the same list routerai.ru publishes for clients. */
export const DEFAULT_PRICE_URL = 'https://routerai.ru/api/v1/models';

/** How long a successful fetch stays fresh before the next request refreshes it. */
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

const SNAPSHOT_PATH = fileURLToPath(new URL('./prices.snapshot.json', import.meta.url));

/** Normalize one catalog model into the meter's price shape. */
function toModelPrice(pricing) {
	return {
		prompt: Number(pricing?.prompt ?? 0),
		completion: Number(pricing?.completion ?? 0),
		cacheRead: pricing?.input_cache_read === undefined || pricing?.input_cache_read === null ? null : Number(pricing.input_cache_read),
		cacheWrite: pricing?.input_cache_write === undefined || pricing?.input_cache_write === null ? null : Number(pricing.input_cache_write)
	};
}

/** Parse a routerai.ru catalog body into the meter's `{ id: price }` table. */
export function parseCatalog(body) {
	const parsed = typeof body === 'string' ? JSON.parse(body) : body;
	const rows = Array.isArray(parsed) ? parsed : parsed.data;
	if (!Array.isArray(rows)) throw new Error('routerai.ru catalog: expected a model array');
	const models = {};
	for (const row of rows) {
		if (row && typeof row.id === 'string' && row.pricing !== undefined) models[row.id] = toModelPrice(row.pricing);
	}
	return models;
}

/** Load the bundled snapshot (generated at build time from the live catalog). */
export async function loadSnapshot() {
	const parsed = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8'));
	return { models: parsed.models, fetchedAt: parsed.fetchedAt ?? 0, source: 'snapshot' };
}

/**
 * Price-table loader with fetch → disk cache → snapshot fallback.
 *
 * @param options - `url` (catalog endpoint), `cachePath` (disk cache file,
 *   disabled when omitted), `ttlMs` (freshness window), `fetchImpl` (test seam).
 * @returns `{ models, fetchedAt, source }` where `source` is `'live'`,
 *   `'cache'`, or `'snapshot'`.
 */
export async function loadPrices(options = {}) {
	const url = options.url ?? DEFAULT_PRICE_URL;
	const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const now = Date.now();

	let cached;
	if (options.cachePath !== undefined) {
		try {
			cached = JSON.parse(await readFile(options.cachePath, 'utf8'));
		} catch {
			cached = undefined;
		}
	}
	if (cached?.models !== undefined && now - (cached.fetchedAt ?? 0) < ttlMs) {
		return { models: cached.models, fetchedAt: cached.fetchedAt, source: 'cache' };
	}

	try {
		const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
		if (!response.ok) throw new Error(`routerai.ru catalog: HTTP ${response.status}`);
		const models = parseCatalog(await response.text());
		const record = { models, fetchedAt: now, url };
		if (options.cachePath !== undefined) {
			try {
				await mkdir(path.dirname(options.cachePath), { recursive: true });
				await writeFile(options.cachePath, JSON.stringify(record));
			} catch {
				// A read-only home only costs us the cache; prices still resolve.
			}
		}
		return { models, fetchedAt: now, source: 'live' };
	} catch (error) {
		if (cached?.models !== undefined) return { models: cached.models, fetchedAt: cached.fetchedAt ?? 0, source: 'cache' };
		const snapshot = await loadSnapshot();
		return { ...snapshot, staleError: String(error?.message ?? error) };
	}
}
