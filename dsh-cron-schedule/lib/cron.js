/**
 * Cron expression parsing and next-occurrence arithmetic for the cron-schedule
 * plugin — five fields (minute hour day-of-month month day-of-week), computed in
 * a fixed IANA time zone without any dependency.
 *
 * The harness ships no cron scheduler (its `dsh-schedule` package does
 * one-shot/fixed-rate seconds only), so the whole standard syntax lives here:
 * wildcards, ranges, lists, steps, month and weekday names, the classic
 * `0`/`7` = Sunday equivalence, and Vixie cron's day-of-month/day-of-week OR
 * rule. All arithmetic is wall-clock in the configured zone, so a job keeps its
 * local time across DST transitions.
 *
 * @module dsh-cron-schedule/cron
 */

/** Field bounds, in order: minute, hour, day of month, month, day of week. */
const FIELD_BOUNDS = [
	{ name: 'minute', min: 0, max: 59 },
	{ name: 'hour', min: 0, max: 23 },
	{ name: 'day of month', min: 1, max: 31 },
	{ name: 'month', min: 1, max: 12 },
	{ name: 'day of week', min: 0, max: 6 }
];

/** Month names accepted in the month field. */
const MONTH_NAMES = {
	jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
	jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

/** Weekday names accepted in the day-of-week field. */
const WEEKDAY_NAMES = {
	sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
};

/** Macros the field list accepts in place of a full expression. */
const MACROS = {
	'@yearly': '0 0 1 1 *',
	'@annually': '0 0 1 1 *',
	'@monthly': '0 0 1 * *',
	'@weekly': '0 0 * * 0',
	'@daily': '0 0 * * *',
	'@midnight': '0 0 * * *',
	'@hourly': '0 * * * *'
};

/** Raised for a malformed expression or an out-of-range field value. */
export class CronSyntaxError extends Error {
	/** @param message - human-readable reason, safe to show in the GUI. */
	constructor(message) {
		super(message);
		this.name = 'CronSyntaxError';
	}
}

/** Zone-offset cache: `Intl.DateTimeFormat` construction is the expensive part. */
const formatterCache = new Map();

function formatterFor(timeZone) {
	let formatter = formatterCache.get(timeZone);
	if (formatter === undefined) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			weekday: 'short'
		});
		formatterCache.set(timeZone, formatter);
	}
	return formatter;
}

/** Whether the runtime accepts one IANA zone name. */
export function isValidTimeZone(timeZone) {
	if (typeof timeZone !== 'string' || timeZone === '') return false;
	try {
		formatterFor(timeZone).format(new Date(0));
		return true;
	} catch {
		return false;
	}
}

/** The local calendar fields of one instant in a zone. */
function zonedParts(date, timeZone) {
	const parts = formatterFor(timeZone).formatToParts(date);
	const out = {};
	for (const part of parts) {
		if (part.type === 'literal') continue;
		out[part.type] = part.value;
	}
	const weekdayNames = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	return {
		year: Number(out.year),
		month: Number(out.month),
		day: Number(out.day),
		hour: Number(out.hour),
		minute: Number(out.minute),
		second: Number(out.second),
		weekday: weekdayNames[out.weekday] ?? 0
	};
}

/** Zone offset in milliseconds at one instant (east of UTC is positive). */
function zoneOffsetMs(date, timeZone) {
	const p = zonedParts(date, timeZone);
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
	return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Resolve one local wall-clock time in a zone to the earliest matching instant.
 *
 * DST gaps (a local time that does not exist) resolve forward to the instant the
 * clock jumps to; DST folds (a local time that happens twice) resolve to the
 * first occurrence.
 *
 * @param year - local year.
 * @param month - local month, 1-12.
 * @param day - local day of month.
 * @param hour - local hour, 0-23.
 * @param minute - local minute, 0-59.
 * @param timeZone - IANA zone name.
 * @returns epoch milliseconds.
 */
export function zonedTimeToInstant(year, month, day, hour, minute, timeZone) {
	const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
	// Guess with the offset in force at the target read as UTC, then correct
	// twice: the first pass lands in the right day, the second settles the
	// offset when the guess crossed a DST boundary.
	let instant = target - zoneOffsetMs(new Date(target), timeZone);
	instant = target - zoneOffsetMs(new Date(instant), timeZone);
	const check = zonedParts(new Date(instant), timeZone);
	if (check.hour !== hour || check.minute !== minute || check.day !== day || check.month !== month) {
		// A gap moved us; the later candidate is the transition instant.
		const later = target - zoneOffsetMs(new Date(instant + 3600e3), timeZone);
		const laterParts = zonedParts(new Date(later), timeZone);
		if (laterParts.minute === minute) return later;
	}
	return instant;
}

/** Days in one month, proleptic Gregorian. */
function daysInMonth(year, month) {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Parse one cron field into a sorted list of allowed values.
 *
 * @param raw - the field text.
 * @param bounds - field name and inclusive bounds.
 * @param names - optional name → number table (months, weekdays).
 * @returns sorted, de-duplicated allowed values.
 */
function parseField(raw, bounds, names) {
	const values = new Set();
	const expandName = (token) => {
		if (names === undefined) return token;
		const lower = token.toLowerCase();
		return Object.hasOwn(names, lower) ? String(names[lower]) : token;
	};
	for (const part of raw.split(',')) {
		if (part === '') throw new CronSyntaxError(`${bounds.name}: empty list item`);
		const [rangeText, stepText, ...extra] = part.split('/');
		if (extra.length > 0) throw new CronSyntaxError(`${bounds.name}: too many "/" in "${part}"`);
		let step = 1;
		if (stepText !== undefined) {
			if (!/^\d+$/.test(stepText)) throw new CronSyntaxError(`${bounds.name}: step "${stepText}" is not a number`);
			step = Number(stepText);
			if (step < 1) throw new CronSyntaxError(`${bounds.name}: step must be at least 1`);
		}
		let start;
		let end;
		if (rangeText === '*' || rangeText === '') {
			start = bounds.min;
			end = bounds.max;
		} else {
			const [fromText, toText, ...rest] = rangeText.split('-');
			if (rest.length > 0) throw new CronSyntaxError(`${bounds.name}: too many "-" in "${rangeText}"`);
			const from = expandName(fromText);
			if (!/^\d+$/.test(from)) throw new CronSyntaxError(`${bounds.name}: "${fromText}" is not a number`);
			start = Number(from);
			end = toText === undefined ? start : -1;
			if (toText !== undefined) {
				const to = expandName(toText);
				if (!/^\d+$/.test(to)) throw new CronSyntaxError(`${bounds.name}: "${toText}" is not a number`);
				end = Number(to);
			}
		}
		// Sunday is 0 and also 7 in the classic dialect.
		if (bounds.name === 'day of week') {
			if (start === 7) start = 0;
			if (end === 7) end = 0;
		}
		if (start < bounds.min || start > bounds.max) {
			throw new CronSyntaxError(`${bounds.name}: ${start} is outside ${bounds.min}-${bounds.max}`);
		}
		if (end < bounds.min || end > bounds.max) {
			throw new CronSyntaxError(`${bounds.name}: ${end} is outside ${bounds.min}-${bounds.max}`);
		}
		if (end < start) {
			// A wrap-around range such as "fri-mon" is rejected rather than
			// guessed: Vixie cron does not define it consistently.
			throw new CronSyntaxError(`${bounds.name}: range ${start}-${end} runs backwards`);
		}
		for (let value = start; value <= end; value += step) values.add(value);
	}
	if (values.size === 0) throw new CronSyntaxError(`${bounds.name}: matches nothing`);
	return [...values].sort((a, b) => a - b);
}

/**
 * Parse one cron expression into a matcher.
 *
 * @param expression - 5-field cron text, or one of the `@`-macros.
 * @returns a frozen parsed schedule.
 * @throws {CronSyntaxError} when the text is not a valid expression.
 */
export function parseCron(expression) {
	if (typeof expression !== 'string') throw new CronSyntaxError('expression must be a string');
	const trimmed = expression.trim();
	if (trimmed === '') throw new CronSyntaxError('expression is empty');
	const macro = MACROS[trimmed.toLowerCase()];
	const source = macro ?? trimmed;
	const fields = source.split(/\s+/);
	if (fields.length !== 5) {
		throw new CronSyntaxError(`expected 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`);
	}
	const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
	const domRaw = dayOfMonth;
	const dowRaw = dayOfWeek;
	const minuteValues = parseField(minute, FIELD_BOUNDS[0]);
	const hourValues = parseField(hour, FIELD_BOUNDS[1]);
	const domValues = parseField(domRaw, FIELD_BOUNDS[2]);
	const monthValues = parseField(month, FIELD_BOUNDS[3], MONTH_NAMES);
	const dowValues = parseField(dowRaw, FIELD_BOUNDS[4], WEEKDAY_NAMES);
	return Object.freeze({
		expression: trimmed,
		minute: minuteValues,
		hour: hourValues,
		dayOfMonth: domValues,
		month: monthValues,
		dayOfWeek: dowValues,
		// Vixie's rule: when both day fields are restricted, either may match.
		domRestricted: domRaw.trim() !== '*',
		dowRestricted: dowRaw.trim() !== '*'
	});
}

/** Whether one parsed schedule matches a local calendar instant. */
function matchesLocal(schedule, parts) {
	if (!schedule.minute.includes(parts.minute)) return false;
	if (!schedule.hour.includes(parts.hour)) return false;
	if (!schedule.month.includes(parts.month)) return false;
	const domHit = schedule.dayOfMonth.includes(parts.day);
	const dowHit = schedule.dayOfWeek.includes(parts.weekday);
	if (schedule.domRestricted && schedule.dowRestricted) return domHit || dowHit;
	if (schedule.domRestricted) return domHit;
	if (schedule.dowRestricted) return dowHit;
	return true;
}

/**
 * Next occurrence strictly after `after`.
 *
 * The search walks minute by minute in the target zone, bounded to four years
 * ahead: an impossible date such as `0 0 31 2 *` returns undefined instead of
 * looping forever. A local time that falls inside a DST gap (the hour a zone
 * skips forward over) is skipped for that day, which is what Vixie cron does.
 *
 * @param schedule - parsed schedule from {@link parseCron}.
 * @param after - epoch milliseconds; the result is strictly later.
 * @param timeZone - IANA zone the expression is interpreted in (default `UTC`).
 * @returns epoch milliseconds, or undefined when nothing matches within 4 years.
 */
export function nextOccurrence(schedule, after, timeZone = 'UTC') {
	// Start at the next whole minute after `after`.
	let instant = Math.floor(after / 60000) * 60000 + 60000;
	const limit = instant + 4 * 366 * 24 * 60 * 60e3;
	// Jump by hour when the minute already cannot match, and by day when the
	// hour cannot — that keeps the scan cheap without leaving the zone.
	while (instant <= limit) {
		const parts = zonedParts(new Date(instant), timeZone);
		if (!schedule.month.includes(parts.month)) {
			// Skip to the first minute of the next day.
			const nextDay = Date.UTC(parts.year, parts.month - 1, parts.day + 1);
			const nextParts = zonedParts(new Date(nextDay), timeZone);
			instant = zonedTimeToInstant(nextParts.year, nextParts.month, nextParts.day, 0, 0, timeZone);
			continue;
		}
		if (!matchesLocal(schedule, parts)) {
			instant += 60000;
			continue;
		}
		return instant;
	}
	return undefined;
}

/**
 * The next `count` occurrences after `after`, for a UI preview.
 *
 * @param expression - cron text.
 * @param timeZone - IANA zone.
 * @param after - epoch milliseconds.
 * @param count - how many occurrences to list.
 * @returns epoch milliseconds, ascending.
 */
export function upcoming(expression, timeZone, after, count = 5) {
	const schedule = parseCron(expression);
	const out = [];
	let cursor = after;
	for (let index = 0; index < count; index += 1) {
		const next = nextOccurrence(schedule, cursor, timeZone);
		if (next === undefined) break;
		out.push(next);
		cursor = next;
	}
	return out;
}

/**
 * Whether a sorted value list is a plain arithmetic progression starting at 0.
 *
 * @param values - ascending parsed field values.
 * @returns the step, or undefined when the list is not a step progression.
 */
function stepOf(values) {
	if (values.length < 2 || values[0] !== 0) return undefined;
	const step = values[1] - values[0];
	if (step < 2) return undefined;
	for (let index = 2; index < values.length; index += 1) {
		if (values[index] - values[index - 1] !== step) return undefined;
	}
	return step;
}

/**
 * Whether a parsed field covers every value of its range.
 *
 * @param values - ascending parsed field values.
 * @param min - inclusive lower bound.
 * @param max - inclusive upper bound.
 * @returns whether the range is complete.
 */
function isFullRange(values, min, max) {
	return values.length === max - min + 1;
}

/**
 * Human-readable one-line description of a parsed schedule, used by the panel
 * and by the AI-facing tool output.
 *
 * @param expression - cron text.
 * @param locale - `ru` for Russian, anything else for English.
 * @returns a short phrase such as `по будням в 09:00`.
 */
export function describeCron(expression, locale = 'ru') {
	const ru = locale === 'ru';
	let schedule;
	try {
		schedule = parseCron(expression);
	} catch (error) {
		return `${error.message}`;
	}
	const pad = (value) => String(value).padStart(2, '0');
	const list = (values) => values.join(', ');
	const minuteStep = stepOf(schedule.minute);
	const hourStep = stepOf(schedule.hour);

	// Frequency phrases come first: they stay short where enumerating every
	// matching time would run to hundreds of characters.
	if (isFullRange(schedule.minute, 0, 59) && schedule.hour.length === 24) return ru ? 'каждую минуту' : 'every minute';
	if (minuteStep !== undefined && schedule.hour.length === 24) {
		return ru ? `каждые ${minuteStep} мин.` : `every ${minuteStep} min`;
	}
	if (schedule.minute.length === 1 && schedule.minute[0] === 0 && isFullRange(schedule.hour, 0, 23)) {
		return ru ? 'каждый час' : 'hourly';
	}
	if (schedule.minute.length === 1 && isFullRange(schedule.hour, 0, 23)) {
		return ru ? `каждый час в :${pad(schedule.minute[0])}` : `hourly at :${pad(schedule.minute[0])}`;
	}
	if (hourStep !== undefined && schedule.hour.at(-1) === 23 && schedule.minute.length === 1) {
		const from = pad(schedule.hour[0]);
		const to = pad(schedule.hour.at(-1));
		return ru
			? `каждые ${hourStep} ч. с ${from} до ${to} в :${pad(schedule.minute[0])}`
			: `every ${hourStep} h from ${from} to ${to} at :${pad(schedule.minute[0])}`;
	}

	// The time of day, phrased so minutes and hours can never be misread as one
	// list: `в 10:15 и 10:45`, not `в 10:15, 45`.
	let timeText;
	if (schedule.hour.length === 1 && schedule.minute.length === 1) {
		timeText = `${pad(schedule.hour[0])}:${pad(schedule.minute[0])}`;
	} else if (schedule.hour.length === 1) {
		timeText = schedule.minute.map((minute) => `${pad(schedule.hour[0])}:${pad(minute)}`).join(ru ? ' и ' : ' and ');
	} else if (schedule.minute.length === 1) {
		timeText = schedule.hour.map((hour) => `${pad(hour)}:${pad(schedule.minute[0])}`).join(ru ? ' и ' : ' and ');
	} else {
		timeText = `${list(schedule.hour.map(pad))} ч., минуты ${list(schedule.minute.map(pad))}`;
	}

	const weekdayNamesRu = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
	const weekdayNamesEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const weekdays = schedule.dayOfWeek.map((day) => (ru ? weekdayNamesRu[day] : weekdayNamesEn[day])).join(', ');

	if (schedule.dowRestricted && !schedule.domRestricted) {
		const isWeekdays = schedule.dayOfWeek.length === 5 && schedule.dayOfWeek.every((day) => day >= 1 && day <= 5);
		const prefix = isWeekdays ? (ru ? 'по будням' : 'on weekdays') : (ru ? `по ${weekdays}` : `on ${weekdays}`);
		return `${prefix} ${ru ? 'в' : 'at'} ${timeText}`;
	}
	if (schedule.domRestricted) {
		const days = schedule.dayOfMonth.length === 1
			? (ru ? `${schedule.dayOfMonth[0]}-го числа` : `on day ${schedule.dayOfMonth[0]}`)
			: (ru ? `по числам ${list(schedule.dayOfMonth)}` : `on days ${list(schedule.dayOfMonth)}`);
		return `${days} ${ru ? 'в' : 'at'} ${timeText}`;
	}
	if (!isFullRange(schedule.month, 1, 12)) {
		const monthNamesRu = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
		const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const months = schedule.month.map((month) => (ru ? monthNamesRu[month - 1] : monthNamesEn[month - 1])).join(', ');
		return `${ru ? 'в' : 'in'} ${months} ${ru ? 'в' : 'at'} ${timeText}`;
	}
	return `${ru ? 'ежедневно в' : 'daily at'} ${timeText}`;
}
