/**
 * Board storage for `dsh-excalidraw`.
 *
 * One Excalidraw scene per chat. The whole catalog is one JSON file, keyed by
 * session id, so a board lives exactly as long as the chat does and survives
 * plugin reloads. Writes go through a temp file + `rename`, so a crash cannot
 * corrupt the catalog.
 *
 * @module dsh-excalidraw/store
 */

import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/** What a board holds: the Excalidraw scene plus when it last changed. */
function emptyBoard() {
	return {
		updatedAt: Date.now(),
		elements: [],
		appState: {}
	};
}

/** The parts of an Excalidraw scene we keep: plain JSON data only. */
function normalizeScene(value) {
	const source = value !== null && typeof value === 'object' ? value : {};
	const elements = Array.isArray(source.elements)
		? source.elements
			.filter((element) => element !== null && typeof element === 'object')
			.map((element) => ({ ...element }))
		: [];
	const appState = source.appState !== null && typeof source.appState === 'object' ? { ...source.appState } : {};
	return { elements, appState };
}

/** Open (or create) the board catalog file. */
export async function openBoardStore({ file }) {
	let boards = {};
	try {
		boards = JSON.parse(await readFile(file, 'utf8')).boards ?? {};
	} catch {
		// First run, or an unreadable file: start from a clean catalog.
		boards = {};
	}
	/** Persist the whole catalog atomically. */
	async function persist() {
		await mkdir(dirname(file), { recursive: true });
		const tmp = `${file}.${randomUUID()}.tmp`;
		await writeFile(tmp, JSON.stringify({ version: 1, boards }));
		await rename(tmp, file);
	}
	return {
		/**
		 * One chat's board. An unknown chat has a blank board — the same answer
		 * the panel shows before the person draws anything.
		 *
		 * @param sessionId - the chat the board belongs to.
		 * @returns a detached copy of the board.
		 */
		get(sessionId) {
			const board = boards[sessionId] ?? undefined;
			if (board === undefined) return emptyBoard();
			return JSON.parse(JSON.stringify(board));
		},
		/**
		 * Replace one chat's scene and persist.
		 *
		 * @param sessionId - the chat the board belongs to.
		 * @param scene - `{ elements, appState }` to store.
		 * @returns the stored board.
		 */
		async set(sessionId, scene) {
			const next = normalizeScene(scene);
			next.updatedAt = Date.now();
			boards[sessionId] = next;
			await persist();
			return JSON.parse(JSON.stringify(next));
		},
		/** Every board id, most recently changed first. */
		list() {
			return Object.keys(boards).sort((left, right) => (boards[right]?.updatedAt ?? 0) - (boards[left]?.updatedAt ?? 0));
		},
		/**
		 * Every board as a summary: which chat, when it changed, how much is on it.
		 *
		 * This is how a caller finds a board without knowing a session id — the
		 * plugin used to offer no way at all, so an agent had to read this very
		 * file to discover its own board.
		 *
		 * @returns one entry per board, most recently changed first.
		 */
		summaries() {
			return this.list().map((sessionId) => ({
				sessionId,
				updatedAt: boards[sessionId]?.updatedAt ?? 0,
				elements: Array.isArray(boards[sessionId]?.elements) ? boards[sessionId].elements.length : 0
			}));
		}
	};
}
