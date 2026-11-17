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

/**
 * plusvibeapi.ru price endpoint. It answers rubles per **million** tokens, and
 * needs the account key, unlike the public routerai.ru catalog.
 */
export const DEFAULT_PLUSVIBE_URL = 'https://plusvibeapi.ru/v1/pricing';

/** Provider ids as the harness settings name them; price keys are prefixed with these. */
export const ROUTER_PROVIDER = 'router-ai';
export const PLUSVIBE_PROVIDER = 'plusvibeapi';

/** How long a successful fetch stays fresh before the next request refreshes it. */
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Disk-cache format. Bumped when the table's keying changes, so an older cache
 * is refetched instead of quietly mispricing everything: version 1 held bare
 * model ids, version 2 holds `provider/model` keys.
 */
const CACHE_VERSION = 2;

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

/**
 * Parse a plusvibeapi.ru pricing body into the meter's per-token price shape.
 *
 * The endpoint quotes rubles per million tokens; the meter works in rubles per
 * token, so every rate is divided by a million. Variants are keyed by
 * `addressAs`, which is the id a request names — the same string the session
 * log records — and the first variant of a model is its default route.
 *
 * @param body - `/v1/pricing` response body.
 * @returns `{ [addressAs]: { prompt, completion, cacheRead, cacheWrite } }`.
 */
export function parsePlusvibePricing(body) {
	const parsed = typeof body === 'string' ? JSON.parse(body) : body;
	const rows = Array.isArray(parsed?.data) ? parsed.data : undefined;
	if (rows === undefined) throw new Error('plusvibeapi.ru pricing: expected a data array');
	const models = {};
	for (const row of rows) {
		for (const variant of Array.isArray(row?.variants) ? row.variants : []) {
			if (typeof variant?.addressAs !== 'string') continue;
			models[variant.addressAs] = {
				prompt: Number(variant.inputRub ?? 0) / 1e6,
				completion: Number(variant.outputRub ?? 0) / 1e6,
				cacheRead: variant.cacheReadRub === undefined || variant.cacheReadRub === null ? null : Number(variant.cacheReadRub) / 1e6,
				cacheWrite: variant.cacheWriteRub === undefined || variant.cacheWriteRub === null ? null : Number(variant.cacheWriteRub) / 1e6
			};
		}
	}
	return models;
}

/**
 * Key one provider's table by `provider/model`, keeping the bare id too.
 *
 * Both providers publish some of the same ids at different prices (39 of them
 * at the time of writing), so a bare table would silently misprice them. The
 * session log records the provider, so lookups prefer the qualified key; the
 * bare key stays for a log that names no provider.
 *
 * @param provider - harness provider id.
 * @param models - that provider's `{ id: price }` table.
 * @param into - table to fill.
 */
function addProviderPrices(provider, models, into) {
	for (const [id, price] of Object.entries(models)) {
		into[`${provider}/${id}`] = price;
		if (into[id] === undefined) into[id] = price;
	}
	return into;
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
 * Two catalogs feed one table: the public routerai.ru model list and the
 * plusvibeapi.ru price list, which needs the account key. They are keyed by
 * provider so an id both catalogs publish cannot be priced from the wrong one.
 *
 * @param options - `url` (routerai catalog), `plusvibeUrl`, `plusvibeApiKey`
 *   (absent means "skip plusvibe prices"), `cachePath` (disk cache file,
 *   disabled when omitted), `ttlMs` (freshness window), `fetchImpl` (test seam).
 * @returns `{ models, fetchedAt, source }` where `source` is `'live'`,
 *   `'cache'`, or `'snapshot'`.
 */
export async function loadPrices(options = {}) {
	const url = options.url ?? DEFAULT_PRICE_URL;
	const plusvibeUrl = options.plusvibeUrl ?? DEFAULT_PLUSVIBE_URL;
	const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const now = Date.now();
	const wantPlusvibe = typeof options.plusvibeApiKey === 'string' && options.plusvibeApiKey.length > 0;

	/**
	 * Fold both providers' tables into the one the report looks up.
	 *
	 * A missing key or a failed call costs only that provider's prices, never
	 * the report, so the failure is recorded rather than thrown.
	 *
	 * @returns `{ models, plusvibeState }` — `'ok'`, `'failed'`, or `'skipped'`.
	 */
	const merge = async (routerModels) => {
		const models = addProviderPrices(ROUTER_PROVIDER, routerModels, {});
		if (!wantPlusvibe) return { models, plusvibeState: 'skipped' };
		try {
			const response = await fetchImpl(plusvibeUrl, {
				headers: { authorization: `Bearer ${options.plusvibeApiKey}`, accept: 'application/json' },
				signal: AbortSignal.timeout(15000)
			});
			if (!response.ok) throw new Error(`plusvibeapi.ru pricing: HTTP ${response.status}`);
			addProviderPrices(PLUSVIBE_PROVIDER, parsePlusvibePricing(await response.text()), models);
			return { models, plusvibeState: 'ok' };
		} catch {
			return { models, plusvibeState: 'failed' };
		}
	};

	/**
	 * Whether a cached record may answer this call.
	 *
	 * A record written by a keyless caller holds no plusvibe prices, so it must
	 * not satisfy a caller that has the key — otherwise the plusvibe half would
	 * silently vanish for as long as the routerai half stayed fresh. A recorded
	 * failure does satisfy it: the provider was asked and refused, and retrying
	 * on every call would only hammer it.
	 */
	const usable = (record) => record?.version === CACHE_VERSION
		&& record.models !== undefined
		&& (wantPlusvibe === false || record.plusvibeState === 'ok' || record.plusvibeState === 'failed');

	let cached;
	if (options.cachePath !== undefined) {
		try {
			cached = JSON.parse(await readFile(options.cachePath, 'utf8'));
		} catch {
			cached = undefined;
		}
	}
	if (usable(cached) && now - (cached.fetchedAt ?? 0) < ttlMs) {
		return { models: cached.models, fetchedAt: cached.fetchedAt, source: 'cache' };
	}

	try {
		const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
		if (!response.ok) throw new Error(`routerai.ru catalog: HTTP ${response.status}`);
		const merged = await merge(parseCatalog(await response.text()));
		const record = { version: CACHE_VERSION, models: merged.models, plusvibeState: merged.plusvibeState, fetchedAt: now, url };
		if (options.cachePath !== undefined) {
			try {
				await mkdir(path.dirname(options.cachePath), { recursive: true });
				await writeFile(options.cachePath, JSON.stringify(record));
			} catch {
				// A read-only home only costs us the cache; prices still resolve.
			}
		}
		return { models: merged.models, fetchedAt: now, source: 'live' };
	} catch (error) {
		if (usable(cached)) return { models: cached.models, fetchedAt: cached.fetchedAt ?? 0, source: 'cache' };
		const snapshot = await loadSnapshot();
		return { ...snapshot, models: addProviderPrices(ROUTER_PROVIDER, snapshot.models, {}), staleError: String(error?.message ?? error) };
	}
}
