/**
 * Store and scheduler self-test for dsh-cron-schedule.
 *
 * Uses a temporary file and an injected clock, so it asserts real persistence,
 * missed-run reconciliation, and the scheduler's arming behaviour without
 * waiting on wall-clock time or touching the user's own store.
 *
 * @module dsh-cron-schedule/scripts/store-test
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	appendRun,
	defaultStorePath,
	JobInputError,
	jobView,
	MAX_RUN_HISTORY,
	normalizeJob,
	openJobStore,
	reconcileMissed,
	resolveHome,
	withNextRun
} from '../lib/store.js';
import { createScheduler, MAX_TIMER_DELAY_MS } from '../lib/scheduler.js';
import { nextOccurrence, parseCron } from '../lib/cron.js';

let pass = 0;
let fail = 0;
function ok(label, condition, extra = '') {
	if (condition) {
		pass += 1;
		return;
	}
	fail += 1;
	console.log('FAIL:', label, extra);
}

const NOW = Date.parse('2026-03-10T08:00:00Z');
const dir = await mkdtemp(path.join(tmpdir(), 'cron-store-'));
const file = path.join(dir, 'cron.json');

try {
	// --- home resolution ---
	ok('explicit home wins', resolveHome('/custom') === '/custom');
	ok('DSH_HOME is honoured', (() => {
		const previous = process.env.DSH_HOME;
		process.env.DSH_HOME = '/from/env';
		const resolved = resolveHome(undefined);
		if (previous === undefined) delete process.env.DSH_HOME;
		else process.env.DSH_HOME = previous;
		return resolved === '/from/env';
	})());
	ok('default path lives under the home', defaultStorePath('/h').endsWith(path.join('h', 'cron-schedule.json')));

	// --- normalization ---
	const base = normalizeJob({
		name: '  Report  ',
		expression: '0 9 * * 1-5',
		timeZone: 'Europe/Moscow',
		workspacePath: '/tmp/proj/../proj',
		prompt: '  do the thing  '
	}, undefined, NOW);
	ok('name is trimmed', base.name === 'Report');
	ok('prompt is trimmed', base.prompt === 'do the thing');
	ok('workspace is resolved absolute', base.workspacePath === path.resolve('/tmp/proj'), base.workspacePath);
	ok('enabled defaults true', base.enabled === true);
	ok('id is a uuid', /^[0-9a-f-]{36}$/.test(base.id), base.id);
	ok('createdAt uses the clock seam', base.createdAt === NOW);
	ok('timeZone defaults to UTC when omitted', normalizeJob({ name: 'a', expression: '* * * * *', workspacePath: '/tmp', prompt: 'p' }, undefined, NOW).timeZone === 'UTC');

	// --- rejections ---
	const rejects = (label, input) => {
		let error;
		try {
			normalizeJob(input, undefined, NOW);
		} catch (caught) {
			error = caught;
		}
		ok(`rejects ${label}`, error instanceof JobInputError, error === undefined ? 'accepted' : error.constructor.name);
		return error;
	};
	rejects('a missing name', { expression: '* * * * *', workspacePath: '/tmp', prompt: 'p' });
	rejects('an empty workspace', { name: 'a', expression: '* * * * *', workspacePath: '  ', prompt: 'p' });
	rejects('a bad zone', { name: 'a', expression: '* * * * *', timeZone: 'Nowhere/Here', workspacePath: '/tmp', prompt: 'p' });
	rejects('an impossible expression', { name: 'a', expression: '0 0 31 2 *', workspacePath: '/tmp', prompt: 'p' });
	rejects('a too-long prompt', { name: 'a', expression: '* * * * *', workspacePath: '/tmp', prompt: 'x'.repeat(9000) });
	const fieldError = rejects('a bad expression', { name: 'a', expression: 'nope', workspacePath: '/tmp', prompt: 'p' });
	ok('the rejection names the field', fieldError?.field === 'expression', fieldError?.field);

	// --- update keeps identity and merges omitted fields ---
	const updated = normalizeJob({ name: 'Renamed' }, base, NOW + 1000);
	ok('update keeps the id', updated.id === base.id);
	ok('update keeps createdAt', updated.createdAt === base.createdAt);
	ok('update bumps updatedAt', updated.updatedAt === NOW + 1000);
	ok('update keeps untouched fields', updated.expression === base.expression && updated.prompt === base.prompt);
	ok('update can flip enabled alone', normalizeJob({ enabled: false }, base, NOW).enabled === false);

	// --- next-run arithmetic ---
	const rolled = withNextRun(base, NOW);
	ok('withNextRun sets a future instant', rolled.nextRunAt > NOW);
	ok('withNextRun matches the cron engine', rolled.nextRunAt === nextOccurrence(parseCron(base.expression), NOW, base.timeZone));
	ok('withNextRun tolerates a broken expression', withNextRun({ ...base, expression: 'broken' }, NOW).nextRunAt === undefined);

	// --- missed reconciliation ---
	// Every occurrence at or before `now` is reported, including one due during
	// the very minute of the restart: the host was not running to serve it, and
	// the user asked to be told rather than to have it run automatically.
	const stale = { ...base, nextRunAt: NOW - 3 * 3600e3, missed: [] };
	const reconciled = reconcileMissed({ ...stale, expression: '0 * * * *' }, NOW);
	ok('reconcile collects every elapsed hour', reconciled.missed.length === 4, String(reconciled.missed.length));
	ok('reconcile starts at the recorded due time', reconciled.missed[0] === NOW - 3 * 3600e3);
	ok('reconcile moves nextRunAt into the future', reconciled.nextRunAt > NOW);
	ok('reconcile sorts missed ascending', reconciled.missed.every((value, index, all) => index === 0 || all[index - 1] < value));
	const fresh = reconcileMissed({ ...base, nextRunAt: NOW + 3600e3, missed: [] }, NOW);
	ok('reconcile leaves a future job alone', fresh.missed.length === 0);
	const disabledStale = reconcileMissed({ ...stale, enabled: false }, NOW);
	ok('reconcile skips a disabled job', disabledStale.missed.length === 0);

	// --- run history bound ---
	let runs = [];
	for (let index = 0; index < MAX_RUN_HISTORY + 5; index += 1) runs = appendRun(runs, { at: index, status: 'started' });
	ok('run history is bounded', runs.length === MAX_RUN_HISTORY, String(runs.length));
	ok('run history keeps the newest', runs[runs.length - 1].at === MAX_RUN_HISTORY + 4);

	// --- persistence round trip ---
	const store = await openJobStore({ file });
	ok('a missing file reads as empty', store.list().length === 0);
	await store.put(base);
	ok('put is readable in memory', store.get(base.id)?.name === 'Report');
	const onDisk = JSON.parse(await readFile(file, 'utf8'));
	ok('state hit the disk', onDisk.version === 1 && onDisk.jobs.length === 1);
	const reopened = await openJobStore({ file });
	ok('a second open sees the job', reopened.list().length === 1);
	ok('reopened job keeps its zone', reopened.list()[0].timeZone === 'Europe/Moscow');
	ok('list is newest-first', (await (async () => {
		await store.put({ ...base, id: 'newer', createdAt: NOW + 5000 });
		return store.list()[0].id === 'newer';
	})()));

	// --- update / delete ---
	const mutated = await store.update(base.id, (job) => ({ ...job, enabled: false }));
	ok('update returns the new record', mutated.enabled === false);
	ok('update is visible after re-reading the file', JSON.parse(await readFile(file, 'utf8')).jobs.some((job) => job.id === base.id && job.enabled === false));
	ok('update of an unknown id is undefined', await store.update('missing', (job) => job) === undefined);
	ok('delete reports true once', await store.delete('newer') === true);
	ok('delete reports false the second time', await store.delete('newer') === false);

	// --- corrupt records are dropped, not fatal ---
	await writeFile(file, JSON.stringify({ version: 1, jobs: [{ nope: true }, { id: 'x' }, null, 42] }));
	const recovered = await openJobStore({ file });
	ok('corrupt records are ignored', recovered.list().length === 0, String(recovered.list().length));

	// --- unreadable JSON fails loud (a real corruption must not silently wipe) ---
	await writeFile(file, '{not json');
	let syntaxError;
	try {
		await openJobStore({ file });
	} catch (error) {
		syntaxError = error;
	}
	ok('invalid JSON is tolerated as empty', syntaxError === undefined);

	// --- scheduler: arming, running, and rolling forward ---
	await writeFile(file, JSON.stringify({ version: 1, jobs: [] }));
	const schedStore = await openJobStore({ file });
	let clock = NOW;
	const armed = [];
	const runsSeen = [];
	const scheduler = createScheduler({
		store: schedStore,
		now: () => clock,
		logger: { info: () => {}, warn: () => {} },
		setTimer: (callback, delay) => {
			armed.push(delay);
			return { unref() {} };
		},
		clearTimer: () => {},
		run: async (job) => {
			runsSeen.push({ id: job.id, at: clock });
			return { sessionId: `session-cron-${job.id.slice(0, 4)}` };
		}
	});
	// The expression, not the stored instant, is the source of truth: an hourly
	// job at minute 1 is 60 s away from 08:00.
	const dueJob = normalizeJob({ name: 'Hourly', expression: '1 * * * *', timeZone: 'UTC', workspacePath: dir, prompt: 'p' }, undefined, clock);
	await schedStore.put({ ...dueJob, nextRunAt: clock + 60000 });
	await scheduler.start();
	ok('start armed a timer', armed.length === 1, JSON.stringify(armed));
	ok('start armed for the due delay', armed[0] === 60000, String(armed[0]));
	ok('start computed a next run for the job', schedStore.get(dueJob.id).nextRunAt > clock);

	// run now, out of band
	const ranNow = await scheduler.runNow(dueJob.id);
	ok('runNow reports true', ranNow === true);
	ok('runNow invoked the runner', runsSeen.length === 1);
	const afterNow = schedStore.get(dueJob.id);
	ok('runNow recorded success', afterNow.lastStatus === 'succeeded', afterNow.lastStatus);
	ok('runNow recorded the session id', typeof afterNow.lastSessionId === 'string' && afterNow.lastSessionId.startsWith('session-cron-'));
	ok('runNow appended to history', afterNow.runs.length === 2, String(afterNow.runs.length));
	ok('runNow does not disturb the schedule', afterNow.nextRunAt === schedStore.get(dueJob.id).nextRunAt);
	ok('runNow on an unknown id is false', await scheduler.runNow('nope') === false);

	// A long delay is clamped to what setTimeout can represent. The soonest job
	// wins the single timer, so the far-future job needs a store of its own.
	const farDir = await mkdtemp(path.join(tmpdir(), 'cron-far-'));
	try {
		const farStore = await openJobStore({ file: path.join(farDir, 'cron.json') });
		const farArmed = [];
		const farScheduler = createScheduler({
			store: farStore,
			now: () => NOW,
			logger: { info: () => {}, warn: () => {} },
			setTimer: (callback, delay) => {
				farArmed.push(delay);
				return { unref() {} };
			},
			clearTimer: () => {},
			run: async () => ({})
		});
		await farStore.put({ ...dueJob, id: 'far', nextRunAt: NOW + 400 * 24 * 3600e3 });
		await farScheduler.start();
		ok('a far-future job is clamped', farArmed[0] === MAX_TIMER_DELAY_MS, String(farArmed[0]));
		await farScheduler.stop();
	} finally {
		await rm(farDir, { recursive: true, force: true });
	}

	// a failing runner is recorded as failed, not thrown
	const failing = createScheduler({
		store: schedStore,
		now: () => clock,
		logger: { info: () => {}, warn: () => {} },
		setTimer: () => ({ unref() {} }),
		clearTimer: () => {},
		run: async () => {
			throw new Error('runner exploded');
		}
	});
	await failing.runNow(dueJob.id);
	const afterFailure = schedStore.get(dueJob.id);
	ok('a failing run is recorded', afterFailure.lastStatus === 'failed');
	ok('the failure text is kept', String(afterFailure.lastError).includes('runner exploded'));

	// dismiss missed
	await schedStore.update(dueJob.id, (job) => ({ ...job, missed: [1, 2, 3] }));
	await scheduler.dismissMissed(dueJob.id);
	ok('dismissMissed clears the list', schedStore.get(dueJob.id).missed.length === 0);

	// --- autoCatchUp: replay after a restart, but only when the box is ticked ---
	// Both jobs are given the same overdue instant; only the flagged one may run
	// on start, and the unflagged one must keep its missed list for the panel.
	const catchDir = await mkdtemp(path.join(tmpdir(), 'cron-catch-'));
	try {
		const catchFile = path.join(catchDir, 'cron.json');
		const catchStore = await openJobStore({ file: catchFile });
		const overdue = NOW - 2 * 3600e3;
		const flagged = { ...normalizeJob({ name: 'Догон', expression: '0 * * * *', timeZone: 'UTC', workspacePath: dir, prompt: 'p' }, undefined, NOW), id: 'flagged', nextRunAt: overdue, autoCatchUp: true };
		const asking = { ...normalizeJob({ name: 'Спросит', expression: '0 * * * *', timeZone: 'UTC', workspacePath: dir, prompt: 'p' }, undefined, NOW), id: 'asking', nextRunAt: overdue, autoCatchUp: false };
		await catchStore.put(flagged);
		await catchStore.put(asking);
		const launched = [];
		const catchScheduler = createScheduler({
			store: catchStore,
			now: () => NOW,
			logger: { info: () => {}, warn: () => {} },
			setTimer: () => ({ unref() {} }),
			clearTimer: () => {},
			run: async (job) => {
				launched.push(job.id);
				return { sessionId: `session-cron-${job.id}` };
			}
		});
		await catchScheduler.start();
		await new Promise((resolve) => setImmediate(resolve));
		ok('a flagged job is caught up on start', launched.includes('flagged'), JSON.stringify(launched));
		ok('an unflagged job is NOT caught up', !launched.includes('asking'), JSON.stringify(launched));
		ok('the flagged job was launched exactly once', launched.filter((id) => id === 'flagged').length === 1);
		ok('the catch-up ran the task, not the missed replay', catchStore.get('flagged').lastStatus === 'succeeded' || catchStore.get('flagged').lastStatus === 'started', String(catchStore.get('flagged').lastStatus));
		ok('the flagged job has no pending missed list left', catchStore.get('flagged').missed.length === 0, JSON.stringify(catchStore.get('flagged').missed));
		ok('the unflagged job keeps its missed list for the panel', catchStore.get('asking').missed.length > 0, JSON.stringify(catchStore.get('asking').missed));
		ok('the unflagged job did not run', catchStore.get('asking').lastStatus === undefined, String(catchStore.get('asking').lastStatus));
		await catchScheduler.stop();

		// A flagged job with nothing missed must not fire spuriously at start.
		const quietStore = await openJobStore({ file: path.join(catchDir, 'quiet.json') });
		const quiet = { ...normalizeJob({ name: 'Тихо', expression: '0 * * * *', timeZone: 'UTC', workspacePath: dir, prompt: 'p' }, undefined, NOW), id: 'quiet', nextRunAt: NOW + 3600e3, autoCatchUp: true };
		await quietStore.put(quiet);
		const quietLaunched = [];
		const quietScheduler = createScheduler({
			store: quietStore,
			now: () => NOW,
			logger: { info: () => {}, warn: () => {} },
			setTimer: () => ({ unref() {} }),
			clearTimer: () => {},
			run: async (job) => {
				quietLaunched.push(job.id);
				return {};
			}
		});
		await quietScheduler.start();
		ok('a flagged job with no downtime does not fire', quietLaunched.length === 0, JSON.stringify(quietLaunched));
		await quietScheduler.stop();
	} finally {
		await rm(catchDir, { recursive: true, force: true });
	}

	// The flag survives a round trip through the store file.
	const flagDir = await mkdtemp(path.join(tmpdir(), 'cron-flag-'));
	try {
		const flagFile = path.join(flagDir, 'cron.json');
		const flagStore = await openJobStore({ file: flagFile });
		await flagStore.put({ ...dueJob, id: 'flag', autoCatchUp: true });
		await flagStore.put({ ...dueJob, id: 'noflag', autoCatchUp: false });
		const reopened = await openJobStore({ file: flagFile });
		ok('the flag round-trips on', reopened.get('flag').autoCatchUp === true);
		ok('the flag round-trips off', reopened.get('noflag').autoCatchUp === false);
		ok('view exposes the flag', jobView(reopened.get('flag')).autoCatchUp === true && jobView(reopened.get('noflag')).autoCatchUp === false);
	} finally {
		await rm(flagDir, { recursive: true, force: true });
	}

	await scheduler.stop();
	await failing.stop();
} finally {
	await rm(dir, { recursive: true, force: true });
}

console.log(`\nstore/scheduler: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
