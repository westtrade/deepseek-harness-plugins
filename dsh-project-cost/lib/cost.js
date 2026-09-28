/**
 * Pure cost arithmetic for the project-cost meter: price lookup over a
 * routerai.ru price table, one usage accumulator shape, and the money
 * formatting the GUI shows.
 *
 * Everything here is side-effect free so the Host plugin, the standalone
 * report script, and the browser bundle (which duplicates the formatter) all
 * price identical numbers.
 *
 * @module dsh-project-cost/cost
 */

/**
 * Token counts for one model over one or more calls.
 *
 * The billed counts are disjoint (the harness contract): `inputTokens` is
 * uncached input only, while cached input is reported separately as
 * `cacheReadTokens` / `cacheWriteTokens`.
 *
 * @typedef {object} Usage
 * @property {number} inputTokens uncached input tokens.
 * @property {number} outputTokens output tokens.
 * @property {number} cacheReadTokens cached-input tokens read from cache.
 * @property {number} cacheWriteTokens cached-input tokens written to cache.
 * @property {number} calls billed model calls folded.
 */

/** One model's price in rubles per single token (routerai.ru's own unit). */
/**
 * @typedef {object} ModelPrice
 * @property {number} prompt full-price input token.
 * @property {number} completion output token.
 * @property {number | null} cacheRead discounted cached-read token, or null when unlisted.
 * @property {number | null} cacheWrite cached-write token, or null when unlisted.
 */

/** Model id used when no request header preceded a billed call. */
export const UNKNOWN_MODEL = '(unknown model)';

/** Create an empty usage accumulator. */
export function emptyUsage() {
	return {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		calls: 0
	};
}

/** Copy a usage accumulator (plain JSON shape). */
export function cloneUsage(usage) {
	return {
		inputTokens: usage.inputTokens,
		outputTokens: usage.outputTokens,
		cacheReadTokens: usage.cacheReadTokens,
		cacheWriteTokens: usage.cacheWriteTokens,
		calls: usage.calls
	};
}

/** Merge `source` into `target`, in place. */
export function mergeUsage(target, source) {
	target.inputTokens += source.inputTokens;
	target.outputTokens += source.outputTokens;
	target.cacheReadTokens += source.cacheReadTokens;
	target.cacheWriteTokens += source.cacheWriteTokens;
	target.calls += source.calls;
}

/**
 * Find the price row for one model id.
 *
 * Sessions may record alias forms (a leading `~` marks a "latest" alias) while
 * the routerai.ru catalog spells either form, so every spelling is tried
 * before giving up.
 *
 * @param models - price table keyed by exact routerai.ru model id.
 * @param modelId - model id as recorded on the request header.
 * @returns the price row, or undefined when the catalog has no such model.
 */
export function lookupPrice(models, modelId) {
	const bare = modelId.startsWith('~') ? modelId.slice(1) : modelId;
	for (const candidate of [modelId, bare, `~${bare}`, bare.toLowerCase(), modelId.toLowerCase()]) {
		const hit = models[candidate];
		if (hit !== undefined) return hit;
	}
	return undefined;
}

/**
 * Price one usage accumulator in rubles.
 *
 * Cached tokens fall back to the full prompt price when the catalog does not
 * list a cache rate — the conservative upper bound for models whose provider
 * bills cache traffic at input price.
 *
 * @param usage - token counts to price.
 * @param price - rubles-per-token row for the model that produced them.
 * @returns rubles, unrounded.
 */
export function costRub(usage, price) {
	const cacheRead = price.cacheRead ?? price.prompt;
	const cacheWrite = price.cacheWrite ?? price.prompt;
	return usage.inputTokens * price.prompt
		+ usage.outputTokens * price.completion
		+ usage.cacheReadTokens * cacheRead
		+ usage.cacheWriteTokens * cacheWrite;
}

/** Format rubles the way the GUI shows money: `1 234,56 ₽`. */
export function formatRub(value) {
	const formatted = new Intl.NumberFormat('ru-RU', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(value);
	return `${formatted} ₽`;
}
