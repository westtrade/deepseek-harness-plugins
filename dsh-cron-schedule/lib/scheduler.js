/**
 * The scheduler: arms one timer for the soonest due job, runs it, records the
 * outcome, and re-arms.
 *
 * A single timer is used rather than one per job because the tick recomputes
 * the next due instant from the wall clock on every wake. Delays are clamped to
 * the largest value Node timers represent (~24.8 days) and re-derived on every
 * wake, so a job scheduled months ahead still fires and a system clock jump
 * cannot strand the loop.
 *
 * @module dsh-cron-schedule/scheduler
 */

// Forward this module's `?rev` cache-buster to the sibling import (see index.js).
const REV = new URL(import.meta.url).search;
const { appendRun, reconcileMissed, withNextRun } = await import('./store.js' + REV);

/** Largest delay `setTimeout` represents without clamping. */
export const MAX_TIMER_DELAY_MS = 2147483647;

/** How long to wait for a run to report its session before giving up. */
const RUN_TIMEOUT_MS = 120000;

/** Outcome of one run attempt. */
export class RunOutcome {
	/**
	 * @param status - `succeeded` or `failed`.
	 * @param sessionId - the chat created for the run, when it got that far.
	 * @param error - failure text, when it failed.
	 */
	constructor(status, sessionId, error) {
		this.status = status;
		this.sessionId = sessionId;
		this.error = error;
	}
}

/**
 * Create the scheduler bound to one store and one run function.
 *
 * @param options - `store`, `run(job, signal)` (the chat starter), `logger`,
 *   `now` (clock seam), `onChange` (called after any stored mutation), and
 *   `setTimer`/`clearTimer` seams for tests.
 * @returns the scheduler handle.
 */
export function createScheduler(options) {
	const store = options.store;
	const run = options.run;
	const logger = options.logger;
	const now = options.now ?? (() => Date.now());
	const onChange = options.onChange ?? (() => {});
	const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
	const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
	let timer;
	let stopped = false;
	let running = false;
	/** Jobs currently being launched, so a slow run cannot double-start. */
	const inFlight = new Set();
	const abort = new AbortController();

	/** The soonest due instant across enabled jobs. */
	function soonestDue() {
		let soonest;
		for (const job of store.list()) {
			if (job.enabled !== true || job.nextRunAt === undefined) continue;
			if (soonest === undefined || job.nextRunAt < soonest) soonest = job.nextRunAt;
		}
		return soonest;
	}

	/** Arm the single timer for the next due job. */
	function arm() {
		if (timer !== undefined) {
			clearTimer(timer);
			timer = undefined;
		}
		if (stopped) return;
		const due = soonestDue();
		if (due === undefined) return;
		const delay = Math.min(Math.max(due - now(), 0), MAX_TIMER_DELAY_MS);
		timer = setTimer(() => {
			timer = undefined;
			void tick();
		}, delay);
		if (typeof timer?.unref === 'function') timer.unref();
	}

	/**
	 * Launch one job: mark it started, run it, and record the outcome.
	 *
	 * @param id - job id.
	 * @param at - the due instant being served.
	 */
	async function launch(id, at) {
		if (inFlight.has(id)) return;
		inFlight.add(id);
		const startedAt = now();
		await store.update(id, (job) => ({
			...job,
			lastRunAt: startedAt,
			lastStatus: 'started',
			runs: appendRun(job.runs, { at: startedAt, status: 'started' })
		}));
		onChange();
		const job = store.get(id);
		if (job === undefined) {
			inFlight.delete(id);
			return;
		}
		const timeout = new AbortController();
		const timerHandle = setTimeout(() => timeout.abort(new Error('run timed out')), RUN_TIMEOUT_MS);
		try {
			const result = await run(job, { signal: abort.signal, timeoutSignal: timeout.signal, now: startedAt });
			await store.update(id, (current) => ({
				...current,
				lastStatus: 'succeeded',
				lastSessionId: result?.sessionId,
				lastError: undefined,
				runs: appendRun(current.runs, { at: now(), status: 'succeeded', sessionId: result?.sessionId })
			}));
			logger?.info?.(`cron-schedule: job "${job.name}" started session ${result?.sessionId ?? '(unknown)'}`);
		} catch (error) {
			const message = String(error?.message ?? error);
			await store.update(id, (current) => ({
				...current,
				lastStatus: 'failed',
				lastError: message,
				runs: appendRun(current.runs, { at: now(), status: 'failed', error: message })
			}));
			logger?.warn?.(`cron-schedule: job "${job.name}" failed: ${message}`);
		} finally {
			clearTimeout(timerHandle);
			inFlight.delete(id);
		}
		// Roll the served job forward from the instant it was due, not from the
		// wall clock, so an hourly job whose run took two minutes keeps its phase.
		await store.update(id, (current) => withNextRun(current, Math.max(at, current.lastRunAt ?? at)));
		onChange();
	}

	/** One scheduler tick: serve everything due now, then re-arm. */
	async function tick() {
		if (stopped || running) return;
		running = true;
		try {
			const nowMs = now();
			const due = store.list().filter((job) => job.enabled === true && job.nextRunAt !== undefined && job.nextRunAt <= nowMs);
			for (const job of due) await launch(job.id, job.nextRunAt);
		} catch (error) {
			logger?.warn?.(`cron-schedule: tick failed: ${String(error?.message ?? error)}`);
		} finally {
			running = false;
			arm();
		}
	}

	return {
		/**
		 * Recompute every job's next run, collecting occurrences that came due
		 * while the host was down.
		 *
		 * @returns the missed occurrences, per job, for the GUI to offer.
		 */
		async start() {
			stopped = false;
			const nowMs = now();
			for (const job of store.list()) {
				// reconcileMissed owns the roll-forward: it reads the recorded due
				// time first (that is how downtime is detected) and only then moves
				// nextRunAt past `now`. Calling withNextRun first would erase the
				// evidence and silently drop every missed run.
				const reconciled = reconcileMissed(job, nowMs);
				await store.update(job.id, () => reconciled);
			}
			onChange();
			arm();
		},
		/** Stop the timer and wait for in-flight runs to settle. */
		async stop() {
			stopped = true;
			abort.abort(new Error('scheduler stopped'));
			if (timer !== undefined) {
				clearTimer(timer);
				timer = undefined;
			}
		},
		/** Recompute the next run for one job (after a schedule edit or toggle). */
		async reschedule(id, from) {
			await store.update(id, (job) => withNextRun(job, from ?? now()));
			onChange();
			arm();
		},
		/** Run one job right now, out of band (the GUI's "run now" button). */
		async runNow(id) {
			const job = store.get(id);
			if (job === undefined) return false;
			await launch(id, now());
			return true;
		},
		/** Drop a job's recorded missed occurrences without running them. */
		async dismissMissed(id) {
			await store.update(id, (job) => ({ ...job, missed: [] }));
			onChange();
		},
		/** Re-arm after an external mutation (create/delete/toggle). */
		rearm: arm
	};
}
