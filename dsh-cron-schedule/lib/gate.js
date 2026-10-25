/**
 * The task gate: decide whether an iteration is worth an LLM call.
 *
 * A recurring bot that works a kanban board has nothing to do most of the time.
 * Starting the model anyway burns tokens every half hour and fills a chat with
 * "нечего делать" turns. The gate reads the board file *before* the run, counts
 * the open checkboxes in one second-level section (`## Incoming`), and lets the
 * scheduler skip the model entirely when the column is empty.
 *
 * The file is plain Markdown — the same format Obsidian Kanban and the tasks
 * plugins write — so no parser dependency is needed:
 *
 * ```md
 * ## Incoming
 *
 * - [ ] do the thing
 * - [x] already done
 *
 * ## Working
 * ```
 *
 * Only `##` (level two) headings delimit a column; a `###` subheading stays
 * inside it, and anything inside a fenced code block is ignored — a task stub
 * quoted in a code sample must not count as work.
 *
 * @module dsh-cron-schedule/gate
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Forward this module's `?rev` cache-buster to the sibling import (see index.js).
const REV = new URL(import.meta.url).search;
const { DEFAULT_GATE_FILE, DEFAULT_GATE_HEADING } = await import('./store.js' + REV);

/** A second-level heading; the column name is the rest of the line. */
const HEADING_L2 = /^##\s+(.*\S)\s*$/;

/** A task line: `- [ ] text` for open, `- [x] text` for done. */
const TASK_LINE = /^\s*[-*+]\s+\[( |x|X)\]\s+/;

/** A fenced code block delimiter. */
const FENCE = /^\s*(```|~~~)/;

/**
 * Split a Markdown document into lines, marking which are inside a fence.
 *
 * @param markdown - the document.
 * @returns `{ line, fenced }` entries; the fence lines themselves are dropped.
 */
function* lines(markdown) {
	let fenced = false;
	for (const line of String(markdown ?? '').split(/\r?\n/)) {
		if (FENCE.test(line)) {
			fenced = !fenced;
			continue;
		}
		yield { line, fenced };
	}
}

/**
 * Every second-level heading in one document, in order.
 *
 * @param markdown - the document.
 * @returns the heading texts, without the `##` marker.
 */
export function headingsOf(markdown) {
	const found = [];
	for (const { line, fenced } of lines(markdown)) {
		if (fenced) continue;
		const match = HEADING_L2.exec(line);
		if (match) found.push(match[1].trim());
	}
	return found;
}

/**
 * Count the tasks in one section.
 *
 * @param markdown - the document.
 * @param heading - the section to read; compared case-insensitively.
 * @returns `{ found, open, closed }` — `found` distinguishes "the column is
 *   empty" (skip the run) from "there is no such column" (a misconfiguration
 *   that must be reported, not silently skipped).
 */
export function sectionTasks(markdown, heading) {
	const wanted = String(heading ?? '').trim().toLowerCase();
	let inside = false;
	let found = false;
	let open = 0;
	let closed = 0;
	for (const { line, fenced } of lines(markdown)) {
		if (!fenced) {
			const match = HEADING_L2.exec(line);
			if (match) {
				inside = match[1].trim().toLowerCase() === wanted;
				if (inside) found = true;
				continue;
			}
		}
		if (!inside || fenced) continue;
		const task = TASK_LINE.exec(line);
		if (task === null) continue;
		if (task[1] === ' ') open += 1;
		else closed += 1;
	}
	return { found, open, closed };
}

/**
 * Resolve a gate file against a job workspace.
 *
 * A relative path is what the panel offers (`TODO.md`, `.vscode/tasks.md`); an
 * absolute one is honoured as written, which is how a board shared between
 * several workspaces is pointed at.
 *
 * @param workspacePath - the job's directory.
 * @param file - configured path, or absent for the default.
 * @returns the absolute path.
 */
export function resolveGateFile(workspacePath, file) {
	const configured = typeof file === 'string' && file.trim() !== '' ? file.trim() : DEFAULT_GATE_FILE;
	return path.isAbsolute(configured) ? path.normalize(configured) : path.resolve(workspacePath, configured);
}

/**
 * Read the board and report its state, without deciding anything.
 *
 * Used both by the run (to gate it) and by the panel (to show the column and
 * offer a "create file" button), so the two can never disagree.
 *
 * @param options - `workspacePath`, `file`, `heading`.
 * @returns `{ resolvedPath, file, heading, exists, headings, found, open,
 *   closed, error? }` — `error` is a human sentence when the file exists but
 *   cannot be read.
 */
export async function inspectBoard(options) {
	const workspacePath = String(options.workspacePath ?? '');
	const heading = String(options.heading ?? DEFAULT_GATE_HEADING).trim() || DEFAULT_GATE_HEADING;
	const resolvedPath = resolveGateFile(workspacePath, options.file);
	const base = { resolvedPath, file: options.file ?? DEFAULT_GATE_FILE, heading, exists: false, headings: [], found: false, open: 0, closed: 0 };
	let markdown;
	try {
		markdown = await readFile(resolvedPath, 'utf8');
	} catch (error) {
		if (error?.code === 'ENOENT') return base;
		return { ...base, error: String(error?.message ?? error) };
	}
	const stats = sectionTasks(markdown, heading);
	return { ...base, exists: true, headings: headingsOf(markdown), ...stats };
}

/**
 * Create an empty board with the configured column.
 *
 * The created file is deliberately just the heading: an empty column means
 * "nothing to do", which is exactly the state a person should start from, and
 * it makes the skipped-run note true instead of pretending work exists.
 *
 * @param options - `workspacePath`, `file`, `heading`.
 * @returns the inspection of the file that now exists.
 */
export async function createBoard(options) {
	const resolvedPath = resolveGateFile(String(options.workspacePath ?? ''), options.file);
	const heading = String(options.heading ?? DEFAULT_GATE_HEADING).trim() || DEFAULT_GATE_HEADING;
	await mkdir(path.dirname(resolvedPath), { recursive: true });
	try {
		// `wx` keeps a person's board intact: the button is for a missing file,
		// and a race that lands on an existing one must not overwrite tasks.
		await writeFile(resolvedPath, `## ${heading}\n`, { encoding: 'utf8', flag: 'wx' });
	} catch (error) {
		if (error?.code !== 'EEXIST') throw error;
	}
	return inspectBoard({ ...options, heading });
}

/**
 * The gate verdict for one run.
 *
 * Three outcomes, deliberately distinct:
 *
 * - `run` — the column has open tasks (or the job has no gate at all).
 * - `skip` — the file and the column exist and are empty: a normal, expected
 *   state. The scheduler records it as `skipped` with a note and starts no model.
 * - `fatal` — the job is misconfigured (file gone, column renamed). It is
 *   recorded as `failed`, because silently never running again is the one
 *   behaviour a person cannot discover from the panel.
 *
 * @param job - the stored job record.
 * @returns `{ run, status, message?, board? }`.
 */
export async function gateVerdict(job) {
	const gate = job?.gate;
	if (gate === undefined || gate === null) return { run: true };
	const board = await inspectBoard({ workspacePath: job.workspacePath, file: gate.file, heading: gate.heading });
	if (board.error !== undefined) {
		return { run: false, status: 'fatal', message: `cannot read ${board.resolvedPath}: ${board.error}`, board };
	}
	if (!board.exists) {
		return { run: false, status: 'fatal', message: `gate file not found: ${board.resolvedPath}`, board };
	}
	if (!board.found) {
		const known = board.headings.length === 0 ? 'the file has no ## headings' : `it has: ${board.headings.join(', ')}`;
		return { run: false, status: 'fatal', message: `no "## ${board.heading}" section in ${board.resolvedPath} (${known})`, board };
	}
	if (board.open === 0) {
		return { run: false, status: 'skip', message: `no open tasks under "## ${board.heading}" in ${path.basename(board.resolvedPath)}`, board };
	}
	return { run: true, board };
}
