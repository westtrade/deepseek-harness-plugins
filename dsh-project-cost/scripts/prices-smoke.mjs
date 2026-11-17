/**
 * Smoke test for the multi-provider price half: the plusvibeapi.ru unit
 * conversion, the provider-qualified keying that keeps the two catalogs apart,
 * and the provider tag the session scan puts on every billed call.
 *
 * Everything runs against stubbed bodies, so no key and no network are needed.
 *
 *   node scripts/prices-smoke.mjs
 *
 * @module dsh-project-cost/scripts/prices-smoke
 */

import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parsePlusvibePricing, loadPrices, ROUTER_PROVIDER, PLUSVIBE_PROVIDER } from '../lib/prices.js';
import { foldSessionLog } from '../lib/scan.js';

// plusvibe quotes rubles per million tokens; the meter works per token.
const plusvibe = parsePlusvibePricing({
	data: [
		{
			model: 'deepseek-v4.1-flash-1017',
			variants: [
				{ addressAs: 'deepseek-v4.1-flash-1017', inputRub: 2, outputRub: 8, cacheReadRub: 0.2, cacheWriteRub: 2 },
				{ addressAs: 'deepseek-v4.1-flash-1017:mint', inputRub: 3, outputRub: 9, cacheReadRub: 0.3, cacheWriteRub: 3 }
			]
		}
	]
});
/** Rates are divided by a million, so compare with a tolerance instead of `===`. */
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-12, `${label}: expected ${expected}, got ${actual}`);
near(plusvibe['deepseek-v4.1-flash-1017'].prompt, 2e-6, 'inputRub is per million tokens');
near(plusvibe['deepseek-v4.1-flash-1017'].completion, 8e-6, 'outputRub is per million tokens');
near(plusvibe['deepseek-v4.1-flash-1017'].cacheRead, 2e-7, 'cacheReadRub is per million tokens');
near(plusvibe['deepseek-v4.1-flash-1017'].cacheWrite, 2e-6, 'cacheWriteRub is per million tokens');
near(plusvibe['deepseek-v4.1-flash-1017:mint'].prompt, 3e-6, 'every variant is priced, not just the default');
assert.throws(() => parsePlusvibePricing({}), /expected a data array/, 'a shape drift must not silently empty the table');

// A real plusvibe reading, checked against the provider's own invoice: the
// usage row billed 0,06365 ₽ for 1045 uncached + 273280 cached input tokens and
// 863 output tokens.
const billed = 1045 * plusvibe['deepseek-v4.1-flash-1017'].prompt
	+ 273280 * plusvibe['deepseek-v4.1-flash-1017'].cacheRead
	+ 863 * plusvibe['deepseek-v4.1-flash-1017'].completion;
assert.ok(Math.abs(billed - 0.06365) < 5e-6, `per-token pricing must reproduce the invoice, got ${billed}`);

// Both catalogs carry some of the same ids at different prices, so every entry
// is keyed by provider and the bare id stays only as a fallback.
const seen = [];
const fakeFetch = async (url, init) => {
	seen.push({ url: String(url), auth: init?.headers?.authorization });
	if (String(url).includes('routerai')) {
		return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'shared/model', pricing: { prompt: 0.00001, completion: 0.00002 } }] }) };
	}
	return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ model: 'shared/model', variants: [{ addressAs: 'shared/model', inputRub: 5, outputRub: 9 }] }] }) };
};
const merged = await loadPrices({ plusvibeApiKey: 'sk-test', fetchImpl: fakeFetch });
assert.equal(merged.models[`${ROUTER_PROVIDER}/shared/model`].prompt, 0.00001, 'routerai keeps its own price under its own key');
assert.equal(merged.models[`${PLUSVIBE_PROVIDER}/shared/model`].prompt, 5e-6, 'plusvibe keeps its own price under its own key');
assert.equal(merged.models['shared/model'].prompt, 0.00001, 'the bare id falls back to the first catalog that named it');
assert.equal(seen.length, 2, 'both catalogs are fetched');
assert.equal(seen[1].auth, 'Bearer sk-test', 'plusvibe pricing needs the account key');

// No key: the plusvibe call is skipped instead of failing the whole table.
const routerOnly = await loadPrices({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'a/b', pricing: { prompt: 1, completion: 2 } }] }) }) });
assert.equal(routerOnly.models[`${ROUTER_PROVIDER}/a/b`].prompt, 1, 'routerai prices survive a missing plusvibe key');
assert.equal(routerOnly.models[`${PLUSVIBE_PROVIDER}/a/b`], undefined, 'no key means no plusvibe prices');

// A rejected plusvibe call (401 without a key, a 5xx outage) must not cost the
// routerai half either.
const tolerant = await loadPrices({
	plusvibeApiKey: 'sk-test',
	fetchImpl: async (url) => String(url).includes('routerai')
		? { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'a/b', pricing: { prompt: 1, completion: 2 } }] }) }
		: { ok: false, status: 401, text: async () => '{"error":"invalid api key"}' }
});
assert.equal(tolerant.models[`${ROUTER_PROVIDER}/a/b`].prompt, 1, 'a plusvibe failure leaves routerai prices intact');

// The scan tags every billed call with its provider, because a bare id can
// price against the wrong catalog.
const log = [
	JSON.stringify({ type: 'session', seq: 0, data: { cwd: '/tmp/project' } }),
	JSON.stringify({ type: 'request/header', seq: 1, data: { header: { config: { provider: 'plusvibeapi', model: 'deepseek-v4.1-flash-1017' } } } }),
	JSON.stringify({ type: 'assistant/message', seq: 2, data: { turn: 1, usage: { inputTokens: 10, outputTokens: 5 } } }),
	JSON.stringify({ type: 'request/header', seq: 3, data: { header: { config: { provider: 'router-ai', model: 'deepseek/deepseek-v4.1-flash-1017' } } } }),
	JSON.stringify({ type: 'assistant/message', seq: 4, data: { turn: 2, usage: { inputTokens: 7, outputTokens: 3 } } })
].join('\n');
const folded = foldSessionLog(log);
assert.deepEqual(
	[...folded.byModel.keys()],
	['plusvibeapi/deepseek-v4.1-flash-1017', 'router-ai/deepseek/deepseek-v4.1-flash-1017'],
	'each call is keyed by its billed provider'
);
assert.equal(folded.byModel.get('plusvibeapi/deepseek-v4.1-flash-1017').inputTokens, 10, 'usage stays with its own route');

// A header naming no provider keeps the bare id, which the table still holds.
const bare = foldSessionLog([
	JSON.stringify({ type: 'request/header', seq: 1, data: { header: { config: { model: 'a/b' } } } }),
	JSON.stringify({ type: 'assistant/message', seq: 2, data: { turn: 1, usage: { inputTokens: 1 } } })
].join('\n'));
assert.deepEqual([...bare.byModel.keys()], ['a/b'], 'a provider-less log keeps the bare model id');

// A cache written by a keyless caller holds no plusvibe prices, so it must not
// answer a caller that has the key — that is how the plusvibe half silently
// disappeared for a whole freshness window.
const dir = await mkdtemp(path.join(tmpdir(), 'project-cost-prices-'));
const cachePath = path.join(dir, 'prices.json');
const stale = { version: 2, plusvibeState: 'skipped', fetchedAt: Date.now(), models: { [`${ROUTER_PROVIDER}/a/b`]: { prompt: 1, completion: 2, cacheRead: null, cacheWrite: null } } };
await writeFile(cachePath, JSON.stringify(stale));
let fetches = 0;
const countingFetch = async (url) => {
	fetches += 1;
	if (String(url).includes('routerai')) return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ id: 'a/b', pricing: { prompt: 1, completion: 2 } }] }) };
	return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ model: 'a/b', variants: [{ addressAs: 'a/b', inputRub: 5, outputRub: 9 }] }] }) };
};
const keyed = await loadPrices({ cachePath, plusvibeApiKey: 'sk-test', fetchImpl: countingFetch });
assert.equal(keyed.source, 'live', 'a keyless cache must be refetched when a plusvibe key is available');
assert.equal(keyed.models[`${PLUSVIBE_PROVIDER}/a/b`].prompt, 5e-6, 'the refetched table carries plusvibe prices');
assert.equal(JSON.parse(await readFile(cachePath, 'utf8')).plusvibeState, 'ok', 'the refetched record is marked as carrying plusvibe prices');

// The same record answers a keyless caller without a refetch.
fetches = 0;
const keyless = await loadPrices({ cachePath, fetchImpl: countingFetch });
assert.equal(keyless.source, 'cache', 'a fresh cache answers a keyless caller');
assert.equal(fetches, 0, 'no request is spent on a cache hit');

// A recorded plusvibe failure still counts as "asked": retrying every call
// would only hammer a provider that already refused.
await writeFile(cachePath, JSON.stringify({ ...stale, plusvibeState: 'failed' }));
fetches = 0;
const failed = await loadPrices({ cachePath, plusvibeApiKey: 'sk-test', fetchImpl: countingFetch });
assert.equal(failed.source, 'cache', 'a recorded plusvibe failure is not retried within the freshness window');
assert.equal(fetches, 0, 'a failed plusvibe fetch is not repeated on every call');

console.log('prices-smoke: ok');
