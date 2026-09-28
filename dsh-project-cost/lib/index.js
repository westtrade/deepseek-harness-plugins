/**
 * Host entry for the `dsh-project-cost` plugin: one exact web route serving
 * the per-directory spend report, plus a small TTL cache so the GUI can poll
 * it cheaply while a size/mtime scan cache keeps rescans incremental.
 *
 * Mount it beside `dsh-host-webserver` (the Web composition already does):
 *
 * ```yaml
 * - id: project-cost
 *   name: 'dsh-project-cost'
 * ```
 *
 * @module dsh-project-cost
 */

// Hot reload: when the loader re-imports this entry through a `?rev=…` URL
// (see the `name` in cordis.patch.yml), forward the query to local modules so
// Node's ESM cache re-reads them instead of pinning the first-loaded copies.
const REV = new URL(import.meta.url).search;
const { buildReport, defaultSessionsRoot, defaultPriceCachePath } = await import('./report.js' + REV);
const { loadPrices } = await import('./prices.js' + REV);

/** Cordis service name for this plugin (also its loader row id). */
export const name = 'project-cost';

/** Required Host services: the report is served over the browser HTTP server. */
export const inject = ['webServer'];

/** Exact route answering the report JSON. */
export const REPORT_PATH = '/api/project-cost';

/** Exact route answering the routerai.ru price table (for in-chat pricing). */
export const PRICES_PATH = '/api/project-cost/prices';

/**
 * Host plugin body: registers `GET /api/project-cost`.
 *
 * The report is built lazily per request and served for `cacheTtlMs`
 * (default 30 s); the per-artifact scan cache lives for the plugin's
 * lifetime, so each poll after the first only re-reads session logs that
 * actually changed.
 *
 * @param ctx - Host context carrying `webServer`.
 * @param config - optional `{ cacheTtlMs, sessionsRoot, priceCachePath,
 *   priceUrl }` overrides.
 */
export function apply(ctx, config = {}) {
	const cache = new Map();
	const ttlMs = Number.isFinite(config.cacheTtlMs) ? config.cacheTtlMs : 30000;
	const options = {
		sessionsRoot: config.sessionsRoot ?? defaultSessionsRoot(),
		cachePath: config.priceCachePath ?? defaultPriceCachePath(),
		priceUrl: config.priceUrl,
		cache
	};
	let cached = undefined;
	let cachedAt = 0;
	let inflight = undefined;

	function report() {
		const now = Date.now();
		if (cached !== undefined && now - cachedAt < ttlMs) return Promise.resolve(cached);
		if (inflight !== undefined) return inflight;
		inflight = buildReport(options).then((value) => {
			cached = value;
			cachedAt = Date.now();
			return value;
		}).finally(() => {
			inflight = undefined;
		});
		return inflight;
	}

	const handler = async (req, res) => {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405, { allow: 'GET, HEAD' });
			res.end();
			return;
		}
		try {
			const body = JSON.stringify(await report());
			res.writeHead(200, {
				'content-type': 'application/json; charset=utf-8',
				'cache-control': 'no-store'
			});
			res.end(req.method === 'HEAD' ? undefined : body);
		} catch (error) {
			ctx.logger?.error?.(error);
			res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ error: String(error?.message ?? error) }));
		}
	};

	// The price table moves far slower than the report, so it answers from its
	// own ten-minute memo on top of `loadPrices`' fetch → disk → snapshot chain.
	let pricesCached = undefined;
	let pricesAt = 0;
	let pricesInflight = undefined;
	const pricesTtlMs = Number.isFinite(config.pricesTtlMs) ? config.pricesTtlMs : 600000;

	function prices() {
		const now = Date.now();
		if (pricesCached !== undefined && now - pricesAt < pricesTtlMs) return Promise.resolve(pricesCached);
		if (pricesInflight !== undefined) return pricesInflight;
		pricesInflight = loadPrices({
			url: options.priceUrl,
			cachePath: options.cachePath
		}).then((value) => {
			pricesCached = value;
			pricesAt = Date.now();
			return value;
		}).finally(() => {
			pricesInflight = undefined;
		});
		return pricesInflight;
	}

	const pricesHandler = async (req, res) => {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405, { allow: 'GET, HEAD' });
			res.end();
			return;
		}
		try {
			const body = JSON.stringify(await prices());
			res.writeHead(200, {
				'content-type': 'application/json; charset=utf-8',
				'cache-control': 'public, max-age=600'
			});
			res.end(req.method === 'HEAD' ? undefined : body);
		} catch (error) {
			ctx.logger?.error?.(error);
			res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
			res.end(JSON.stringify({ error: String(error?.message ?? error) }));
		}
	};

	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: REPORT_PATH,
		handler
	}), 'project-cost: report route');
	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: PRICES_PATH,
		handler: pricesHandler
	}), 'project-cost: prices route');
}
