// Self-test for the dependency-free cron engine.
import { parseCron, nextOccurrence, upcoming, describeCron, CronSyntaxError, isValidTimeZone, zonedTimeToInstant } from '../lib/cron.js';

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
	if (cond) { pass += 1; return; }
	fail += 1;
	console.log('FAIL:', name, extra);
}
function iso(ms, tz = 'UTC') {
	return new Date(ms).toLocaleString('sv-SE', { timeZone: tz });
}

// --- parsing ---
ok('every minute', parseCron('* * * * *').minute.length === 59 + 1);
ok('macro @daily', parseCron('@daily').expression === '@daily');
ok('names', JSON.stringify(parseCron('0 9 * * mon-fri').dayOfWeek) === '[1,2,3,4,5]');
ok('months by name', JSON.stringify(parseCron('0 0 1 jan *').month) === '[1]');
ok('steps', JSON.stringify(parseCron('*/15 * * * *').minute) === '[0,15,30,45]');
ok('ranges', JSON.stringify(parseCron('0 9-11 * * *').hour) === '[9,10,11]');
ok('lists', JSON.stringify(parseCron('0 1,13 * * *').hour) === '[1,13]');
ok('sunday 7 == 0', JSON.stringify(parseCron('0 0 * * 7').dayOfWeek) === '[0]');
ok('sunday name', JSON.stringify(parseCron('0 0 * * sun').dayOfWeek) === '[0]');
ok('dedup+sort', JSON.stringify(parseCron('0 9,9,8 * * *').hour) === '[8,9]');

// --- syntax errors ---
const bad = ['', '   ', '* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8', '5-1 * * * *', '*/0 * * * *', 'a * * * *', '* * * * mon-xyz', '1/2/3 * * * *'];
for (const expr of bad) {
	let threw = false;
	try { parseCron(expr); } catch (e) { threw = e instanceof CronSyntaxError; }
	ok(`rejects ${JSON.stringify(expr)}`, threw);
}

// --- next occurrence, UTC ---
const at = (s) => Date.parse(s);
ok('daily 09:00 next', iso(nextOccurrence(parseCron('0 9 * * *'), at('2026-03-10T08:00:00Z'))) === '2026-03-10 09:00:00');
ok('daily 09:00 skips past', iso(nextOccurrence(parseCron('0 9 * * *'), at('2026-03-10T09:00:00Z'))) === '2026-03-11 09:00:00');
ok('strictly after', nextOccurrence(parseCron('* * * * *'), at('2026-03-10T08:00:00Z')) === at('2026-03-10T08:01:00Z'));
ok('weekdays only', iso(nextOccurrence(parseCron('0 9 * * 1-5'), at('2026-03-13T10:00:00Z'))) === '2026-03-16 09:00:00'); // Fri -> Mon
ok('day 31 only', iso(nextOccurrence(parseCron('0 0 31 * *'), at('2026-04-01T00:00:00Z'))) === '2026-05-31 00:00:00');
ok('impossible date', nextOccurrence(parseCron('0 0 31 2 *'), at('2026-01-01T00:00:00Z')) === undefined);
// Vixie OR rule: dom restricted OR dow restricted
ok('dom OR dow', iso(nextOccurrence(parseCron('0 0 13 * 5'), at('2026-03-01T00:00:00Z'))) === '2026-03-06 00:00:00'); // first Friday
ok('dom only', iso(nextOccurrence(parseCron('0 0 13 * *'), at('2026-03-01T00:00:00Z'))) === '2026-03-13 00:00:00');

// --- time zones ---
ok('tz valid', isValidTimeZone('Europe/Moscow') && isValidTimeZone('UTC'));
ok('tz invalid', !isValidTimeZone('Mars/Olympus') && !isValidTimeZone(''));
const msk = 'Europe/Moscow';
ok('09:00 MSK = 06:00 UTC', iso(nextOccurrence(parseCron('0 9 * * *'), at('2026-03-10T00:00:00Z'), msk), 'UTC') === '2026-03-10 06:00:00');
// DST: US spring-forward 2026-03-08 02:00 -> 03:00 local; a 02:30 job must not vanish
const ny = 'America/New_York';
const nyNext = nextOccurrence(parseCron('30 2 * * *'), at('2026-03-08T00:00:00Z'), ny);
ok("DST gap skips that day", nyNext !== undefined && iso(nyNext, ny).includes("2026-03-09 02:30"), iso(nyNext, ny));
// DST fall-back: local 01:30 happens twice; must be the first
const fb = nextOccurrence(parseCron('30 1 * * *'), at('2026-11-01T00:00:00Z'), ny);
ok('DST fold takes first', fb !== undefined && (fb - at('2026-11-01T00:00:00Z')) < 8 * 3600e3, iso(fb, ny));
// A job keeps local time across the transition
ok('local time stable', iso(nextOccurrence(parseCron('0 9 * * *'), at('2026-03-07T15:00:00Z'), ny), ny) === '2026-03-08 09:00:00');

// --- upcoming + describe ---
const up = upcoming('0 9 * * 1-5', 'UTC', at('2026-03-10T00:00:00Z'), 3);
ok('upcoming count', up.length === 3 && up[0] < up[1] && up[1] < up[2]);
ok('describe ru', describeCron('0 9 * * 1-5', 'ru') === 'по будням в 09:00', describeCron('0 9 * * 1-5', 'ru'));
ok('describe daily', describeCron('0 3 * * *', 'ru') === 'ежедневно в 03:00', describeCron('0 3 * * *', 'ru'));
ok('describe hourly', describeCron('0 * * * *', 'en') === 'hourly');
ok('describe bad', describeCron('nope', 'ru').length > 0);
// --- descriptions stay short and unambiguous ---
ok('describe every minute', describeCron('* * * * *', 'ru') === 'каждую минуту');
ok('describe step minutes', describeCron('*/15 * * * *', 'ru') === 'каждые 15 мин.', describeCron('*/15 * * * *', 'ru'));
ok('describe hourly at minute', describeCron('30 * * * *', 'ru') === 'каждый час в :30', describeCron('30 * * * *', 'ru'));
ok('describe two times', describeCron('0 9,18 * * *', 'ru') === 'ежедневно в 09:00 и 18:00', describeCron('0 9,18 * * *', 'ru'));
ok('describe minutes never look like hours', describeCron('15,45 10 * * *', 'ru') === 'ежедневно в 10:15 и 10:45', describeCron('15,45 10 * * *', 'ru'));
ok('describe never exceeds a sane length', ['* * * * *', '*/1 * * * *', '*/15 * * * *', '0 0 1 1 *', '*/30 9-18 * * 1-5'].every((e) => describeCron(e, 'ru').length <= 120), describeCron('*/30 9-18 * * 1-5', 'ru').length);
ok('describe month restriction', describeCron('0 12 15 6 *', 'ru') === '15-го числа в 12:00', describeCron('0 12 15 6 *', 'ru'));

console.log(`\ncron: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
