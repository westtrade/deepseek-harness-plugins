/**
 * Smoke test for the balance half: resolves the routerai.ru API key through the
 * credential service / credentials document / environment, and parses the
 * `{ data: { credits } }` answer — all with a stubbed `fetch`, so the check runs
 * offline and never spends a real request.
 *
 *   node scripts/balance-smoke.mjs
 *
 * @module dsh-project-cost/scripts/balance-smoke
 */

import assert from 'node:assert/strict';
import { fetchBalance, resolveApiKey, DEFAULT_BALANCE_URL } from '../lib/balance.js';

// Keep the "no key configured" case hermetic: point the harness home at a path
// with no credentials document and clear the ambient variable, so the real
// machine's key can never leak into the assertion.
process.env.DSH_HOME = '/nonexistent-dsh-home-for-balance-smoke';
delete process.env.ROUTER_AI_API_KEY;

// The credential service wins over everything else, and its value is the key.
const viaService = await resolveApiKey({
	get: (name) => (name === 'credentials' ? { resolve: async () => ({ value: 'sk-from-service' }) } : undefined)
});
assert.equal(viaService, 'sk-from-service', 'the credentials service must be asked first');

// A service that throws or holds nothing falls back instead of failing.
const viaFallback = await resolveApiKey({ get: () => ({ resolve: async () => undefined }) });
assert.equal(viaFallback, undefined, 'with no store, no file and no env there is no key');

// The key travels as a bearer token and the credit is read out of `data.credits`.
let seen = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
	seen = { url, auth: init?.headers?.authorization };
	return { ok: true, status: 200, json: async () => ({ data: { credits: 982.3251997179191 } }) };
};
try {
	const ctx = { get: () => ({ resolve: async () => ({ value: 'sk-test' }) }) };
	const balance = await fetchBalance(ctx);
	assert.equal(seen.url, DEFAULT_BALANCE_URL, 'the documented credits route is used');
	assert.equal(seen.auth, 'Bearer sk-test', 'the key is sent as a bearer token');
	assert.equal(balance.creditsRub, 982.3251997179191, 'the credit is read from data.credits');
	assert.equal(balance.currency, 'RUB');

	// A missing key is a named, catchable condition — the route degrades on it.
	globalThis.fetch = async () => {
		throw new Error('must not be called without a key');
	};
	await assert.rejects(
		() => fetchBalance({ get: () => ({ resolve: async () => undefined }) }),
		(error) => error.code === 'NO_API_KEY' || /not configured/u.test(error.message),
		'a missing key must fail with NO_API_KEY'
	);

	// An HTTP failure and an unexpected shape both throw rather than report NaN.
	globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
	await assert.rejects(() => fetchBalance({ get: () => ({ resolve: async () => ({ value: 'sk-test' }) }) }), /HTTP 401/u);
	globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) });
	await assert.rejects(() => fetchBalance({ get: () => ({ resolve: async () => ({ value: 'sk-test' }) }) }), /shape/u);
} finally {
	globalThis.fetch = realFetch;
}

console.log('balance wiring OK');
console.log('  route      :', DEFAULT_BALANCE_URL);
console.log('  key source : credentials service → ~/.dsh/.credentials.yaml → env');
console.log('  parsing    : data.credits → creditsRub (RUB), NaN and HTTP errors refuse');
