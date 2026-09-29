/**
 * Durable job store for the cron-schedule plugin.
 *
 * Jobs live in one JSON file under the harness home
 * (`$DSH_HOME/cron-schedule.json`), written through a temp file + rename so a
 * crash never leaves a half-written list. The plugin deliberately imports
 * nothing outside `node:` builtins: a plugin loaded from a symlinked workspace
 * path cannot resolve the harness's own packages, so persistence, scheduling,
 * and tool registration are all hand-rolled here.
 *
 * @module dsh-cron-schedule/store
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
// Forward this module's `?rev` cache-buster to the sibling import (see
// index.js): a static specifier cannot carry a runtime query, so it is dynamic.
const REV = new URL(import.meta.url).search;
const { CronSyntaxError, describeCron, isValidTimeZone, nextOccurrence, parseCron } = await import('./cron.js' + REV);

/** Longest accepted prompt, in characters. */
export const MAX_PROMPT_CHARS = 8000;

/** How many finished runs to keep per job. */
export const MAX_RUN_HISTORY = 20;

/** How many missed occurrences to remember per job. */
export const MAX_MISSED = 50;

/** Serialized store version; a future change bumps it and migrates on read. */
export const STORE_VERSION = 1;

/** Resolve the harness home the same way the harness does. */
export function resolveHome(configured) {
	if (typeof configured === 'string' && configured.trim() !== '') return configured;
	const fromEnv = process.env.DSH_HOME;
	if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv;
	return path.join(os.homedir(), '.dsh');
}

/** Default store file path. */
export function defaultStorePath(configuredHome) {
	return path.join(resolveHome(configuredHome), 'cron-schedule.json');
}

/** Raised for a create/update request the GUI or the AI tool got wrong. */
export class JobInputError extends Error {
	/**
	 * @param message - what is wrong, phrased for a human.
	 * @param field - offending field name, when there is one.
	 */
	constructor(message, field) {
		super(message);
		this.name = 'JobInputError';
		this.field = field;
	}
}

/** Trim a required string field. */
function requireText(value, field, maxLength) {
	if (typeof value !== 'string') throw new JobInputError(`${field} must be a string`, field);
	const trimmed = value.trim();
	if (trimmed === '') throw new JobInputError(`${field} must not be empty`, field);
	if (trimmed.length > maxLength) throw new JobInputError(`${field} is longer than ${maxLength} characters`, field);
	return trimmed;
}

/**
 * Validate and normalize one create/update request into a stored record.
 *
 * @param input - raw request fields (`name`, `expression`, `timeZone`,
 *   `workspacePath`, `prompt`, `enabled`).
 * @param base - existing record when updating, for defaults and identity.
 * @param now - epoch milliseconds used for the audit fields.
 * @returns a record ready to persist.
 */
export function normalizeJob(input, base, now) {
	const source = input ?? {};
	const name = requireText(source.name ?? base?.name, 'name', 120);
	const expression = requireText(source.expression ?? base?.expression, 'expression', 200);
	const timeZone = source.timeZone === undefined && base !== undefined
		? base.timeZone
		: requireText(source.timeZone ?? 'UTC', 'timeZone', 64);
	const workspacePath = path.resolve(requireText(source.workspacePath ?? base?.workspacePath, 'workspacePath', 4096));
	const prompt = requireText(source.prompt ?? base?.prompt, 'prompt', MAX_PROMPT_CHARS);
	if (!isValidTimeZone(timeZone)) throw new JobInputError(`unknown time zone "${timeZone}"`, 'timeZone');
	try {
		parseCron(expression);
	} catch (error) {
		if (error instanceof CronSyntaxError) throw new JobInputError(error.message, 'expression');
		throw error;
	}
	const enabled = typeof source.enabled === 'boolean' ? source.enabled : base?.enabled ?? true;
	/**
	 * Whether runs missed while DSH was down are replayed automatically at the
	 * next start instead of waiting for a person to approve them.
	 *
	 * This flag is human-only: `applyAutoCatchUp` decides whether a request is
	 * allowed to set it, and the AI tool never passes it. It is stored on the
	 * record so the scheduler can act on it after a restart.
	 */
	const autoCatchUp = base?.autoCatchUp ?? false;
	// Reject an expression that can never fire (e.g. `0 0 31 2 *`): saving one
	// would produce a job the scheduler can only ever skip.
	if (nextOccurrence(parseCron(expression), now, timeZone) === undefined) {
		throw new JobInputError('this expression never fires (for example 31 February)', 'expression');
	}
	return {
		id: base?.id ?? randomUUID(),
		name,
		expression,
		timeZone,
		workspacePath,
		prompt,
		enabled,
		autoCatchUp,
		createdAt: base?.createdAt ?? now,
		updatedAt: now,
		...(base?.nextRunAt === undefined ? {} : { nextRunAt: base.nextRunAt }),
		...(base?.lastRunAt === undefined ? {} : { lastRunAt: base.lastRunAt }),
		...(base?.lastStatus === undefined ? {} : { lastStatus: base.lastStatus }),
		...(base?.lastSessionId === undefined ? {} : { lastSessionId: base.lastSessionId }),
		...(base?.lastError === undefined ? {} : { lastError: base.lastError }),
		missed: base?.missed ?? [],
		runs: base?.runs ?? []
	};
}

/**
 * Apply the human-only `autoCatchUp` flag to a normalized job.
 *
 * The flag decides whether missed runs are replayed without asking, so only the
 * authenticated Web panel may set it. The Host proves that by asking the
 * `connection` service for a rejection: its Host/Origin fence plus the signed
 * browser cookie are what separate a person at the GUI from an agent calling the
 * same route (the AI holds no browser session, and a `curl` from a tool has no
 * cookie either). Anything else — the model's `cron_create`/`cron_update` tools,
 * a script, a LAN caller — can never turn it on.
 *
 * @param job - the normalized record about to be stored.
 * @param input - the raw request body.
 * @param source - `trusted` when the caller passed the browser-auth fence.
 * @returns the record with the flag applied.
 * @throws {JobInputError} when an untrusted caller tries to raise the flag.
 */
export function applyAutoCatchUp(job, input, source) {
	const requested = input?.autoCatchUp;
	if (requested === undefined) return job;
	if (typeof requested !== 'boolean') throw new JobInputError('autoCatchUp must be a boolean', 'autoCatchUp');
	if (requested === true && source?.trusted !== true) {
		throw new JobInputError('autoCatchUp can only be changed by a person in the Web panel', 'autoCatchUp');
	}
	return { ...job, autoCatchUp: requested };
}

/** The GUI/AI-facing view of one job: stored fields plus derived labels. */
export function jobView(job, locale = 'ru', now = Date.now()) {
	return {
		id: job.id,
		name: job.name,
		expression: job.expression,
		description: describeCron(job.expression, locale),
		timeZone: job.timeZone,
		workspacePath: job.workspacePath,
		prompt: job.prompt,
		enabled: job.enabled,
		autoCatchUp: job.autoCatchUp === true,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt,
		nextRunAt: job.nextRunAt ?? null,
		lastRunAt: job.lastRunAt ?? null,
		lastStatus: job.lastStatus ?? null,
		lastSessionId: job.lastSessionId ?? null,
		lastError: job.lastError ?? null,
		missed: [...(job.missed ?? [])],
		runs: [...(job.runs ?? [])],
		overdue: job.enabled && job.nextRunAt !== undefined && job.nextRunAt <= now
	};
}

/**
 * Append one run entry, keeping the newest {@link MAX_RUN_HISTORY}.
 *
 * @param runs - existing history.
 * @param entry - the entry to append.
 * @returns a new array.
 */
export function appendRun(runs, entry) {
	const next = [...(runs ?? []), entry];
	return next.length <= MAX_RUN_HISTORY ? next : next.slice(next.length - MAX_RUN_HISTORY);
}

/** Coerce one stored record into a valid shape, dropping unknown fields. */
function reviveJob(raw) {
	if (raw === null || typeof raw !== 'object') return undefined;
	if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return undefined;
	if (typeof raw.expression !== 'string' || typeof raw.workspacePath !== 'string') return undefined;
	if (typeof raw.prompt !== 'string') return undefined;
	const timeZone = typeof raw.timeZone === 'string' && isValidTimeZone(raw.timeZone) ? raw.timeZone : 'UTC';
	return {
		id: raw.id,
		name: raw.name,
		expression: raw.expression,
		timeZone,
		workspacePath: raw.workspacePath,
		prompt: raw.prompt,
		enabled: raw.enabled !== false,
		autoCatchUp: raw.autoCatchUp === true,
		createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
		updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
		...(Number.isFinite(raw.nextRunAt) ? { nextRunAt: raw.nextRunAt } : {}),
		...(Number.isFinite(raw.lastRunAt) ? { lastRunAt: raw.lastRunAt } : {}),
		...(typeof raw.lastStatus === 'string' ? { lastStatus: raw.lastStatus } : {}),
		...(typeof raw.lastSessionId === 'string' ? { lastSessionId: raw.lastSessionId } : {}),
		...(typeof raw.lastError === 'string' ? { lastError: raw.lastError } : {}),
		missed: Array.isArray(raw.missed) ? raw.missed.filter((value) => Number.isFinite(value)) : [],
		runs: Array.isArray(raw.runs) ? raw.runs.filter((entry) => entry !== null && typeof entry === 'object') : []
	};
}

/**
 * Open the job store: load the file, keep jobs in memory, persist on every
 * mutation.
 *
 * @param options - `file` (store path) and `now` (clock seam for tests).
 * @returns the store handle.
 */
export async function openJobStore(options = {}) {
	const file = options.file ?? defaultStorePath(options.home);
	const now = options.now ?? (() => Date.now());
	/** @type {Map<string, any>} */
	const jobs = new Map();
	let writeChain = Promise.resolve();
	try {
		const parsed = JSON.parse(await readFile(file, 'utf8'));
		const list = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
		for (const raw of list) {
			const job = reviveJob(raw);
			if (job !== undefined) jobs.set(job.id, job);
		}
	} catch (error) {
		if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
	}

	/** Serialize one durable write; a failed write never blocks the next one. */
	const persist = () => {
		writeChain = writeChain.then(async () => {
			const payload = JSON.stringify({ version: STORE_VERSION, jobs: [...jobs.values()] }, null, 1);
			const dir = path.dirname(file);
			await mkdir(dir, { recursive: true });
			const temp = `${file}.${process.pid}.tmp`;
			await writeFile(temp, payload, { mode: 0o600 });
			await rename(temp, file);
		});
		return writeChain;
	};

	return {
		file,
		/** Every stored job, newest first. */
		list() {
			return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
		},
		/** One job by id, or undefined. */
		get(id) {
			return id === undefined ? undefined : jobs.get(id);
		},
		/** Insert or replace one job and persist. */
		async put(job) {
			jobs.set(job.id, job);
			await persist();
			return job;
		},
		/** Remove one job; false when it was already gone. */
		async delete(id) {
			const existed = jobs.delete(id);
			if (existed) await persist();
			return existed;
		},
		/**
		 * Read-modify-write one job. The whole store is serialized on one write
		 * chain, so a concurrent GUI click and scheduler tick cannot interleave.
		 *
		 * @param id - job id.
		 * @param mutate - receives the current record, returns the next one.
		 * @returns the stored record, or undefined when the job vanished.
		 */
		async update(id, mutate) {
			const current = jobs.get(id);
			if (current === undefined) return undefined;
			const next = mutate(current);
			if (next === undefined) return undefined;
			jobs.set(id, next);
			await persist();
			return next;
		},
		/** Persist pending state (used when the scheduler changed memory only). */
		flush: persist
	};
}

/**
 * Recompute `nextRunAt` for one job from its schedule.
 *
 * @param job - stored record.
 * @param from - instant to search strictly after.
 * @returns the job with a refreshed `nextRunAt` (or without one, when the
 *   expression can never fire again).
 */
export function withNextRun(job, from = Date.now()) {
	let schedule;
	try {
		schedule = parseCron(job.expression);
	} catch {
		return { ...job };
	}
	const next = nextOccurrence(schedule, from, job.timeZone);
	return next === undefined ? { ...job, nextRunAt: undefined } : { ...job, nextRunAt: next };
}

/**
 * Roll a job forward to the first occurrence after `now`, collecting the
 * occurrences that came due while the host was not running.
 *
 * @param job - stored record.
 * @param now - current instant.
 * @returns the updated job.
 */
export function reconcileMissed(job, now = Date.now()) {
	// A disabled job keeps whatever it had; only the schedule engine decides when
	// an enabled job runs next.
	if (job.enabled !== true) return { ...job };
	let schedule;
	try {
		schedule = parseCron(job.expression);
	} catch {
		return { ...job };
	}
	// A due time still in the future is trustworthy: it was computed from this
	// same expression, so keep it rather than recomputing (recomputing from the
	// expression would lose a deliberately distant instant, and would silently
	// re-phase a job whose stored time is further out than the next match).
	if (job.nextRunAt === undefined || job.nextRunAt > now) return { ...job };
	const missed = [...(job.missed ?? [])];
	// Walk forward from the recorded due time, collecting every occurrence that
	// elapsed while the host was down (bounded, so a long outage cannot grow
	// the list without limit).
	let cursor = job.nextRunAt;
	for (let guard = 0; guard < MAX_MISSED; guard += 1) {
		if (cursor > now) break;
		missed.push(cursor);
		const following = nextOccurrence(schedule, cursor, job.timeZone);
		if (following === undefined) break;
		cursor = following;
	}
	const next = nextOccurrence(schedule, now, job.timeZone);
	return {
		...job,
		...(next === undefined ? { nextRunAt: undefined } : { nextRunAt: next }),
		missed: missed.slice(-MAX_MISSED)
	};
}
