/**
 * Durable goals-vector store for the `dsh-goal-vector` plugin.
 *
 * A goals vector (ВЦ, «вектор целей») is a named, priority-ordered list of
 * goals: the first item is the most important one, the last is the one to give
 * up first when not everything can be achieved. Vectors are deployment-wide:
 * the management page edits them, the composer selector picks one per chat, and
 * the model may create them through its tools.
 *
 * They live in one JSON file under the harness home
 * (`$DSH_HOME/goal-vector.json`), written through a temp file + rename so a
 * crash never leaves a half-written list.
 *
 * This module deliberately imports nothing outside `node:` builtins: a plugin
 * loaded from a symlinked workspace path resolves to its real path, where the
 * harness's own packages are not reachable.
 *
 * @module dsh-goal-vector/store
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

/** Longest accepted vector name, in characters. */
export const MAX_NAME_CHARS = 120;

/** Longest accepted single goal, in characters. */
export const MAX_GOAL_CHARS = 500;

/** Most goals one vector may hold. */
export const MAX_GOALS = 50;

/** Most vectors the store keeps. */
export const MAX_VECTORS = 200;

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
	return path.join(resolveHome(configuredHome), 'goal-vector.json');
}

/** Raised for a create/update request the GUI or the AI tool got wrong. */
export class VectorInputError extends Error {
	/**
	 * @param message - what is wrong, phrased for a human.
	 * @param field - offending field name, when there is one.
	 */
	constructor(message, field) {
		super(message);
		this.name = 'VectorInputError';
		this.field = field;
	}
}

/**
 * Normalize one goal line: a non-empty single line of text.
 * @param value - candidate goal.
 * @param index - position in the vector, for the error message.
 * @returns the trimmed goal.
 * @throws {VectorInputError} when the goal is missing, blank, or too long.
 */
export function normalizeGoal(value, index) {
	if (typeof value !== 'string') throw new VectorInputError(`goal ${String(index + 1)} must be a string`, 'goals');
	const goal = value.trim();
	if (goal === '') throw new VectorInputError(`goal ${String(index + 1)} is empty`, 'goals');
	if (goal.length > MAX_GOAL_CHARS) {
		throw new VectorInputError(`goal ${String(index + 1)} is longer than ${String(MAX_GOAL_CHARS)} characters`, 'goals');
	}
	return goal;
}

/**
 * Normalize a whole goals list, preserving the caller's priority order.
 * @param value - candidate list.
 * @returns a fresh array of trimmed goals.
 * @throws {VectorInputError} when the list is empty, too long, or malformed.
 */
export function normalizeGoals(value) {
	if (!Array.isArray(value)) throw new VectorInputError('a goals vector needs a list of goals', 'goals');
	if (value.length === 0) throw new VectorInputError('a goals vector needs at least one goal', 'goals');
	if (value.length > MAX_GOALS) throw new VectorInputError(`a goals vector holds at most ${String(MAX_GOALS)} goals`, 'goals');
	return value.map((goal, index) => normalizeGoal(goal, index));
}

/** Normalize a vector name. */
export function normalizeName(value) {
	if (typeof value !== 'string') throw new VectorInputError('a goals vector needs a name', 'name');
	const name = value.trim();
	if (name === '') throw new VectorInputError('a goals vector needs a name', 'name');
	if (name.length > MAX_NAME_CHARS) {
		throw new VectorInputError(`the name is longer than ${String(MAX_NAME_CHARS)} characters`, 'name');
	}
	return name;
}

/** Normalize an optional free-form description. */
export function normalizeDescription(value) {
	if (value === undefined || value === null) return '';
	if (typeof value !== 'string') throw new VectorInputError('the description must be a string', 'description');
	return value.trim().slice(0, 2000);
}

/**
 * Normalize one vector from a request body, filling omitted fields from an
 * existing record so both a full edit and a partial patch work.
 * @param body - request body.
 * @param existing - record being edited, when there is one.
 * @returns a fresh vector record without an id.
 * @throws {VectorInputError} on any invalid field.
 */
export function normalizeVector(body, existing) {
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		throw new VectorInputError('the request body must be a JSON object');
	}
	const name = body.name === undefined && existing !== undefined ? existing.name : normalizeName(body.name);
	const goals = body.goals === undefined && existing !== undefined ? existing.goals : normalizeGoals(body.goals);
	const description = body.description === undefined && existing !== undefined
		? existing.description
		: normalizeDescription(body.description);
	return { name, description, goals };
}

/** Rebuild one stored record, rejecting an unusable row. */
function reviveVector(raw) {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
	if (typeof raw.id !== 'string' || raw.id === '') return undefined;
	try {
		const vector = normalizeVector(raw, undefined);
		return {
			id: raw.id,
			...vector,
			createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
			updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
		};
	} catch {
		return undefined;
	}
}

/**
 * Rebuild the session→vector mapping, dropping rows whose session id is not a
 * usable string.
 *
 * The mapping lives in this file rather than in the session log on purpose: the
 * harness refuses to restore a session containing an event type it does not
 * know (`dsh-session-persistence`), and a plugin cannot add to that whitelist —
 * so a plugin-owned event type would make every adopting chat unloadable.
 */
function reviveSelections(raw) {
	/** @type {Map<string, { vectorId: string }>} */
	const selections = new Map();
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return selections;
	for (const [sessionId, value] of Object.entries(raw)) {
		if (typeof sessionId !== 'string' || sessionId === '') continue;
		const vectorId = value?.vectorId;
		if (typeof vectorId !== 'string' || vectorId === '') continue;
		selections.set(sessionId, { vectorId });
	}
	return selections;
}

/** The panel-facing view of one vector (priority order preserved). */
export function vectorView(vector) {
	return {
		id: vector.id,
		name: vector.name,
		description: vector.description,
		goals: [...vector.goals],
		createdAt: vector.createdAt,
		updatedAt: vector.updatedAt
	};
}

/**
 * Open the durable vector store.
 *
 * Writes are serialized through one promise chain and land through a temp file
 * plus `rename`, so concurrent panel saves cannot interleave a half-written
 * file.
 *
 * @param options - `file` (store path), `now` (clock, for tests).
 * @returns the store API used by the routes and the model tools.
 */
export async function openVectorStore(options = {}) {
	const file = options.file ?? defaultStorePath(options.home);
	const now = options.now ?? (() => Date.now());
	/** @type {Map<string, any>} */
	const vectors = new Map();
	/** @type {Map<string, { vectorId: string }>} */
	const selections = new Map();
	/**
	 * Changes this instance made but has not written yet.
	 *
	 * The file is shared by every plugin instance, and a patch reload can briefly
	 * leave an older instance alive beside the new one. Writing the whole
	 * in-memory state would let that stale instance erase the newer one's rows
	 * (observed: a chat's adopted vector vanished on a reload), so a write
	 * re-reads the file and applies only this instance's own changes.
	 *
	 * `null` means "removed here".
	 *
	 * @type {Map<string, any>}
	 */
	const dirtyVectors = new Map();
	/** @type {Map<string, { vectorId: string } | null>} */
	const dirtySelections = new Map();
	let writeChain = Promise.resolve();

	/** Read the current file contents, tolerating a missing or corrupt file. */
	async function readState() {
		try {
			const parsed = JSON.parse(await readFile(file, 'utf8'));
			const diskVectors = new Map();
			for (const raw of Array.isArray(parsed?.vectors) ? parsed.vectors : []) {
				const vector = reviveVector(raw);
				if (vector !== undefined) diskVectors.set(vector.id, vector);
			}
			return { diskVectors, diskSelections: reviveSelections(parsed?.selections) };
		} catch {
			return { diskVectors: new Map(), diskSelections: new Map() };
		}
	}

	{
		const { diskVectors, diskSelections } = await readState();
		for (const [id, vector] of diskVectors) vectors.set(id, vector);
		for (const [sessionId, selection] of diskSelections) selections.set(sessionId, selection);
	}

	/**
	 * Merge this instance's pending changes into whatever is on disk and write
	 * the result through a temp file + rename.
	 */
	async function persist() {
		const { diskVectors, diskSelections } = await readState();
		for (const [id, vector] of dirtyVectors) {
			if (vector === null) diskVectors.delete(id);
			else diskVectors.set(id, vector);
		}
		for (const [sessionId, selection] of dirtySelections) {
			if (selection === null) diskSelections.delete(sessionId);
			else diskSelections.set(sessionId, selection);
		}
		const payload = `${JSON.stringify({
			version: STORE_VERSION,
			vectors: [...diskVectors.values()],
			selections: Object.fromEntries(diskSelections)
		}, null, 2)}\n`;
		await mkdir(path.dirname(file), { recursive: true });
		const temp = `${file}.${String(process.pid)}.${String(Date.now())}.tmp`;
		await writeFile(temp, payload, { mode: 0o600 });
		await rename(temp, file);
		// The write succeeded: the merged state is now the file's, so drop the
		// pending markers for exactly the rows just written.
		for (const [id, vector] of [...dirtyVectors]) {
			if (vectors.get(id) === vector || (vector === null && !vectors.has(id))) dirtyVectors.delete(id);
		}
		for (const [sessionId, selection] of [...dirtySelections]) {
			const current = selections.get(sessionId);
			if (selection === null ? current === undefined : current?.vectorId === selection.vectorId) dirtySelections.delete(sessionId);
		}
	}

	/** Queue one write so two saves cannot interleave. */
	function enqueue(work) {
		const next = writeChain.then(work, work);
		writeChain = next.then(() => undefined, () => undefined);
		return next;
	}

	return {
		/** Every vector, newest first. */
		list() {
			return [...vectors.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(vectorView);
		},
		/** One vector view, or undefined. */
		get(id) {
			const vector = vectors.get(id);
			return vector === undefined ? undefined : vectorView(vector);
		},
		/** How many vectors exist (the roster cap). */
		size() {
			return vectors.size;
		},
		/**
		 * Create one vector.
		 * @param body - request body.
		 * @returns the stored view.
		 */
		async create(body) {
			if (vectors.size >= MAX_VECTORS) {
				throw new VectorInputError(`the store already holds ${String(MAX_VECTORS)} vectors; delete one first`, 'name');
			}
			const fields = normalizeVector(body, undefined);
			const at = now();
			const vector = { id: `gv-${randomUUID()}`, ...fields, createdAt: at, updatedAt: at };
			vectors.set(vector.id, vector);
			dirtyVectors.set(vector.id, vector);
			await enqueue(persist);
			return vectorView(vector);
		},
		/**
		 * Update one vector in place.
		 * @param id - exact vector id.
		 * @param body - request body; omitted fields keep their values.
		 * @returns the stored view, or undefined when the id is unknown.
		 */
		async update(id, body) {
			const existing = vectors.get(id);
			if (existing === undefined) return undefined;
			const fields = normalizeVector(body, existing);
			const vector = { ...existing, ...fields, updatedAt: now() };
			vectors.set(id, vector);
			dirtyVectors.set(id, vector);
			await enqueue(persist);
			return vectorView(vector);
		},
		/**
		 * Delete one vector.
		 * @param id - exact vector id.
		 * @returns whether a record was removed.
		 */
		async delete(id) {
			const had = vectors.delete(id);
			if (had) {
				dirtyVectors.set(id, null);
				// Dropping a vector also drops the chats that followed it.
				for (const [sessionId, selection] of [...selections]) {
					if (selection.vectorId !== id) continue;
					selections.delete(sessionId);
					dirtySelections.set(sessionId, null);
				}
				await enqueue(persist);
			}
			return had;
		},
		/**
		 * The vector one chat follows, as `{ vectorId }`, or undefined.
		 * @param sessionId - exact session id.
		 */
		selectionOf(sessionId) {
			if (typeof sessionId !== 'string' || sessionId === '') return undefined;
			const selection = selections.get(sessionId);
			return selection === undefined ? undefined : { ...selection };
		},
		/**
		 * Record which vector one chat follows.
		 *
		 * The id is stored rather than the rendered text so editing a vector
		 * changes what every chat already following it reads on its next step.
		 *
		 * @param sessionId - exact session id.
		 * @param vectorId - vector id, or null to clear the chat's selection.
		 * @throws {VectorInputError} when the id is unknown.
		 */
		async select(sessionId, vectorId) {
			if (typeof sessionId !== 'string' || sessionId === '') {
				throw new VectorInputError('sessionId must be a non-empty string', 'sessionId');
			}
			if (vectorId === null || vectorId === undefined) {
				if (!selections.delete(sessionId)) return null;
				dirtySelections.set(sessionId, null);
				await enqueue(persist);
				return null;
			}
			if (typeof vectorId !== 'string' || vectorId === '') {
				throw new VectorInputError('vectorId must be a non-empty string or null', 'vectorId');
			}
			const vector = vectors.get(vectorId);
			if (vector === undefined) throw new VectorInputError(`unknown goals vector "${vectorId}"`, 'vectorId');
			selections.set(sessionId, { vectorId: vector.id });
			dirtySelections.set(sessionId, { vectorId: vector.id });
			await enqueue(persist);
			return vector.id;
		},
		/** Every recorded session selection, for diagnostics. */
		selectionCount() {
			return selections.size;
		},
		/** Flush any queued write (used at startup and by tests). */
		async flush() {
			await writeChain;
		},
		/** The store file path, for diagnostics. */
		path: file
	};
}

/**
 * Render a vector as the instruction block the model reads.
 *
 * Two things travel together here, and both are needed:
 *
 * - the vector itself, numbered, because the numbering IS the priority;
 * - what a goals vector IS, because a model that has only seen a bulleted list
 *   will treat it as a checklist of equals. The concept is not self-evident: the
 *   goals describe behaviour under ideal, errorless control, and their order is
 *   the REVERSE of the order in which they are to be abandoned when the full set
 *   proves impossible.
 *
 * The explanation is deliberately short — this text is re-sent on every step —
 * so it states the idea and then the rule to act on, and leaves the theory out.
 *
 * @param vector - the vector view or record.
 * @returns the prompt section text, or an empty string for an empty vector.
 */
export function renderVectorPrompt(vector) {
	if (vector === undefined || vector === null || !Array.isArray(vector.goals) || vector.goals.length === 0) return '';
	const lines = vector.goals.map((goal, index) => `${String(index + 1)}. ${goal}`);
	return [
		`<goals_vector name="${String(vector.name).replaceAll('"', "'")}">`,
		'You are working to a goals vector: a hierarchy of goals describing the ideal mode of behaviour for the object being controlled — here, for you in this project. The order is the REVERSE of the order of abandonment: these goals are the ones to reach under ideal work, and when the full set cannot be achieved, the LOWEST-priority goals are given up first.',
		'',
		lines.join('\n'),
		'',
		'Numbering is priority, not sequence:',
		'- Goal 1 outranks goal 2, which outranks goal 3: a lower number always wins a conflict.',
		'- Achieve higher-priority goals first; never sacrifice a higher-priority goal for a lower-priority one.',
		'- If the whole set cannot be achieved, drop the lowest-priority goals first — never the other way round.',
		'- The same goals in another order are a different vector calling for different work; the order you were given is the instruction.',
		'- Report which goals you advanced and which you had to drop, and why.',
		'',
		'If goals turn out to be mutually exclusive or unachievable, the vector is defective and defective vectors lead to loss of control: do not silently satisfy one half of a contradictory pair, and do not pretend a goal was met. Say which goals conflict, which you chose, and what is left undone; report a real obstacle instead of quietly ignoring it.',
		'</goals_vector>'
	].join('\n');
}
