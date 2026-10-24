/**
 * Durable per-chat access store for `dsh-session-gate`.
 *
 * One record per chat: which MCP servers the model may NOT see, and whether the
 * model may read image files (`read_image`). Absent records mean "everything
 * allowed", which is the harness behaviour without this plugin — so installing
 * it never silently tightens an existing chat, and a newly connected MCP server
 * is attached to every chat until a person unchecks it.
 *
 * The file is `$DSH_HOME/session-gate.json`, written through a temp file +
 * rename so a crash never leaves half a record.
 *
 * Imports nothing outside `node:` builtins on purpose: a plugin loaded through a
 * symlinked workspace path resolves to its real path, where the harness's own
 * packages are not reachable.
 *
 * @module dsh-session-gate/store
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/** Serialized store version; a future change bumps it and migrates on read. */
export const STORE_VERSION = 1;

/** Most chats the store keeps a record for. */
export const MAX_SESSIONS = 5000;

/** Most servers one chat may switch off. */
export const MAX_OFF = 64;

/**
 * MCP server names are the `serverName` values of `dsh-mcp-client` rows: the
 * same charset, because the name has to survive in a tool name.
 */
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/;

/** Resolve the harness home the same way the harness does. */
export function resolveHome(configured) {
	if (typeof configured === 'string' && configured.trim() !== '') return configured;
	const fromEnv = process.env.DSH_HOME;
	if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv;
	return path.join(os.homedir(), '.dsh');
}

/** Default store file path. */
export function defaultStorePath(configuredHome) {
	return path.join(resolveHome(configuredHome), 'session-gate.json');
}

/** Raised for a request the GUI or a caller got wrong. */
export class GateInputError extends Error {
	/**
	 * @param message - what is wrong, phrased for a human.
	 * @param field - offending field name, when there is one.
	 */
	constructor(message, field) {
		super(message);
		this.name = 'GateInputError';
		this.field = field;
	}
}

/** Normalize the list of switched-off servers. */
function normalizeOff(value) {
	if (!Array.isArray(value)) throw new GateInputError('mcpOff must be an array of MCP server names', 'mcpOff');
	const off = new Set();
	for (const entry of value) {
		if (typeof entry !== 'string') throw new GateInputError('mcpOff must hold MCP server names', 'mcpOff');
		const name = entry.trim();
		if (!SERVER_NAME.test(name)) throw new GateInputError(`"${name}" is not an MCP server name`, 'mcpOff');
		off.add(name);
	}
	if (off.size > MAX_OFF) throw new GateInputError(`a chat keeps at most ${String(MAX_OFF)} switched-off servers`, 'mcpOff');
	return [...off].sort();
}

/**
 * Normalize one record, filling omitted fields from the existing row so a
 * partial save cannot silently flip the other switch.
 *
 * @param body - request body.
 * @param existing - stored record, when there is one.
 * @returns a complete record.
 * @throws {GateInputError} on any invalid field.
 */
export function normalizeSelection(body, existing) {
	if (body === null || typeof body !== 'object' || Array.isArray(body)) {
		throw new GateInputError('the request body must be a JSON object');
	}
	const mcpOff = body.mcpOff === undefined && existing !== undefined ? existing.mcpOff : normalizeOff(body.mcpOff ?? []);
	const photos = body.photos === undefined ? (existing === undefined ? true : existing.photos) : body.photos;
	if (typeof photos !== 'boolean') throw new GateInputError('photos must be a boolean', 'photos');
	return { mcpOff: [...mcpOff], photos };
}

/** Whether two records say the same thing. */
function sameSelection(left, right) {
	return left.photos === right.photos
		&& left.mcpOff.length === right.mcpOff.length
		&& left.mcpOff.every((name, index) => name === right.mcpOff[index]);
}

/**
 * Open the durable access store.
 *
 * Writes are serialized through one promise chain, so two saves cannot
 * interleave a half-written file.
 *
 * @param options - `file` (store path), `home`.
 * @returns the store API used by the routes and the agent watcher.
 */
export async function openGateStore(options = {}) {
	const file = options.file ?? defaultStorePath(options.home);
	/** @type {Map<string, { mcpOff: string[], photos: boolean }>} */
	const selections = new Map();
	let writeChain = Promise.resolve();

	/** Read the file, tolerating a missing or corrupt one. */
	async function readDisk() {
		try {
			const parsed = JSON.parse(await readFile(file, 'utf8'));
			/** @type {Map<string, { mcpOff: string[], photos: boolean }>} */
			const rows = new Map();
			for (const [sessionId, raw] of Object.entries(parsed?.selections ?? {})) {
				if (typeof sessionId !== 'string' || sessionId === '') continue;
				try {
					rows.set(sessionId, normalizeSelection(raw, undefined));
				} catch {
					// One unusable row must not cost every other chat its settings.
				}
			}
			return rows;
		} catch {
			return new Map();
		}
	}

	for (const [sessionId, row] of await readDisk()) selections.set(sessionId, row);

	/** Write the whole state through a temp file + rename. */
	async function persist() {
		const payload = `${JSON.stringify({
			version: STORE_VERSION,
			selections: Object.fromEntries(selections)
		}, null, 2)}\n`;
		await mkdir(path.dirname(file), { recursive: true });
		const temp = `${file}.${String(process.pid)}.${String(Date.now())}.tmp`;
		await writeFile(temp, payload, { mode: 0o600 });
		await rename(temp, file);
	}

	/** Queue one write so two saves cannot interleave. */
	function enqueue(work) {
		const next = writeChain.then(work, work);
		writeChain = next.then(() => undefined, () => undefined);
		return next;
	}

	return {
		/** The store file path, for diagnostics. */
		path: file,
		/**
		 * One chat's record, or undefined when it never changed anything.
		 * @param sessionId - exact session id.
		 */
		get(sessionId) {
			if (typeof sessionId !== 'string' || sessionId === '') return undefined;
			const row = selections.get(sessionId);
			return row === undefined ? undefined : { mcpOff: [...row.mcpOff], photos: row.photos };
		},
		/**
		 * Record one chat's access choices.
		 * @param sessionId - exact session id.
		 * @param body - request body; omitted fields keep their values.
		 * @returns the stored record.
		 */
		async save(sessionId, body) {
			if (typeof sessionId !== 'string' || sessionId === '') {
				throw new GateInputError('sessionId must be a non-empty string', 'sessionId');
			}
			const existing = selections.get(sessionId);
			const next = normalizeSelection(body, existing);
			if (existing !== undefined && sameSelection(existing, next)) return { ...next };
			if (existing === undefined && selections.size >= MAX_SESSIONS) {
				throw new GateInputError(`the store already holds ${String(MAX_SESSIONS)} chats`, 'sessionId');
			}
			selections.set(sessionId, next);
			await enqueue(persist);
			return { ...next };
		},
		/** How many chats have a record. */
		size() {
			return selections.size;
		},
		/** Flush any queued write (used by tests). */
		async flush() {
			await writeChain;
		}
	};
}
