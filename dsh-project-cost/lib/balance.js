/**
 * Account balance for the project-cost meter.
 *
 * routerai.ru exposes the remaining credit at `GET /api/v1/credits` in the same
 * rubles the price catalog bills in, so the number is directly comparable with
 * the spend the report sums. The API key comes from the harness credential
 * store (the same `ROUTER_AI_API_KEY` reference the `llm-pi-ai` provider
 * settings name), so no secret is ever read from this plugin's own config or
 * shipped to the browser.
 *
 * @module dsh-project-cost/balance
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/** Default routerai.ru credit endpoint. */
export const DEFAULT_BALANCE_URL = 'https://routerai.ru/api/v1/credits';

/** Environment-variable name whose credential reference holds the API key. */
export const DEFAULT_API_KEY_ENV = 'ROUTER_AI_API_KEY';

/** Resolve the harness home (`$DSH_HOME`, else `~/.dsh`). */
function harnessHome() {
	return process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
}

/**
 * Read one reference out of `<home>/.credentials.yaml` without a YAML parser.
 *
 * The document's `refs:` block is a flat `NAME: value` map, which is all this
 * needs; a value is taken verbatim (quotes stripped) and an empty one counts as
 * absent, matching the credential service's own rule.
 *
 * @param name - reference name, e.g. `ROUTER_AI_API_KEY`.
 * @param home - harness home directory.
 * @returns the secret, or undefined when the file or the entry is missing.
 */
async function readCredentialFile(name, home) {
	let text;
	try {
		text = await readFile(path.join(home, '.credentials.yaml'), 'utf8');
	} catch {
		return undefined;
	}
	const lines = text.split('\n');
	let inRefs = false;
	for (const line of lines) {
		if (/^refs:\s*$/u.test(line)) {
			inRefs = true;
			continue;
		}
		// A new top-level key ends the block.
		if (inRefs && /^\S/u.test(line)) break;
		if (!inRefs) continue;
		const match = /^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/u.exec(line);
		if (match === null || match[1] !== name) continue;
		const value = match[2].trim().replace(/^(['"])(.*)\1$/u, '$2');
		return value.length > 0 ? value : undefined;
	}
	return undefined;
}

/**
 * Resolve the routerai.ru API key: the harness credential service first (it
 * layers the environment, the managed store, and `.env` files), then the
 * credentials document, then the plain environment.
 *
 * @param ctx - Host context; `credentials` is optional.
 * @param name - credential reference to resolve.
 * @returns the API key, or undefined when nothing configured one.
 */
export async function resolveApiKey(ctx, name = DEFAULT_API_KEY_ENV) {
	const credentials = ctx?.get?.('credentials');
	if (credentials !== undefined && credentials !== null) {
		try {
			const resolved = await credentials.resolve(name);
			const value = resolved?.value;
			if (typeof value === 'string' && value.length > 0) return value;
		} catch {
			// A throwing store must not hide the file/env fallbacks below.
		}
	}
	const fromFile = await readCredentialFile(name, harnessHome());
	if (fromFile !== undefined) return fromFile;
	const fromEnv = process.env[name];
	return typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : undefined;
}

/**
 * Fetch the remaining routerai.ru credit.
 *
 * @param ctx - Host context carrying the optional `credentials` service.
 * @param options - `{ url, apiKeyEnv, timeoutMs }` overrides.
 * @returns `{ creditsRub, currency, fetchedAt }`; `creditsRub` is undefined when
 *   the key is missing, and the call throws on a transport or HTTP failure.
 */
export async function fetchBalance(ctx, options = {}) {
	const url = options.url ?? DEFAULT_BALANCE_URL;
	const apiKey = await resolveApiKey(ctx, options.apiKeyEnv ?? DEFAULT_API_KEY_ENV);
	if (apiKey === undefined) {
		const error = new Error('routerai.ru API key is not configured');
		error.code = 'NO_API_KEY';
		throw error;
	}
	const response = await fetch(url, {
		headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
		signal: AbortSignal.timeout(options.timeoutMs ?? 15000)
	});
	if (!response.ok) throw new Error(`routerai.ru credits: HTTP ${response.status}`);
	const body = await response.json();
	// The endpoint answers `{ data: { credits: <number> } }`; accept a bare
	// number too so a shape drift degrades to "no reading" instead of a crash.
	const raw = typeof body?.data?.credits === 'number' ? body.data.credits : typeof body?.credits === 'number' ? body.credits : undefined;
	if (raw === undefined || !Number.isFinite(raw)) throw new Error('routerai.ru credits: unexpected response shape');
	return { creditsRub: raw, currency: 'RUB', fetchedAt: Date.now() };
}
