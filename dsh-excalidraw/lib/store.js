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

/**
 * One library template: a named group of elements shared by every board.
 *
 * The shape is Excalidraw's own `LibraryItem` (`id`, `status`, `elements`,
 * `created`, `name`), so the board app can hand it to the canvas untouched.
 */

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
	let library = [];
	let libraryRevision = 0;
	try {
		const stored = JSON.parse(await readFile(file, 'utf8'));
		boards = stored.boards ?? {};
		library = Array.isArray(stored.library) ? stored.library : [];
		// A revision the app can poll for "is the library newer than what I show".
		libraryRevision = library.reduce((latest, item) => Math.max(latest, item.updatedAt ?? item.created ?? 0), 0);
	} catch {
		// First run, or an unreadable file: start from a clean catalog.
		boards = {};
		library = [];
	}
	/** Persist the whole catalog atomically. */
	async function persist() {
		await mkdir(dirname(file), { recursive: true });
		const tmp = `${file}.${randomUUID()}.tmp`;
		await writeFile(tmp, JSON.stringify({ version: 1, boards, library, libraryRevision }));
		await rename(tmp, file);
	}

	/** Store one library item, filling the fields Excalidraw expects. */
	function normalizeLibraryItem(item, now) {
		const source = item !== null && typeof item === 'object' ? item : {};
		const elements = Array.isArray(source.elements)
			? source.elements.filter((element) => element !== null && typeof element === 'object').map((element) => ({ ...element }))
			: [];
		return {
			id: typeof source.id === 'string' && source.id !== '' ? source.id : `lib-${randomUUID()}`,
			status: source.status === 'published' || source.status === 'unpublished' ? source.status : 'published',
			name: typeof source.name === 'string' && source.name.trim() !== '' ? source.name.trim() : 'Template',
			created: typeof source.created === 'number' ? source.created : now,
			updatedAt: now,
			elements
		};
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
		/**
		 * Forget one chat's board entirely.
		 *
		 * Without it a board could only be emptied, never removed, and every test
		 * run or throw-away chat left an entry behind — which matters because the
		 * listing route is how a caller finds a board by hand.
		 *
		 * @param sessionId - the chat whose board goes away.
		 * @returns true when a board was there.
		 */
		async delete(sessionId) {
			if (!Object.hasOwn(boards, sessionId)) return false;
			delete boards[sessionId];
			await persist();
			return true;
		},
		/**
		 * The shared library: the same templates for every chat's board.
		 *
		 * @returns item ids, newest first.
		 */
		libraryRevision() {
			return libraryRevision;
		},
		/** The whole library, newest last (the order templates were added in). */
		libraryItems() {
			return library.map((item) => JSON.parse(JSON.stringify(item)));
		},
		/**
		 * Add one template. A person can also build one on the canvas and push it
		 * up through the board app; the AI adds its own through the tool.
		 *
		 * @param input - `{ name, elements }`.
		 * @returns the stored item.
		 */
		async libraryAdd(input) {
			const now = Date.now();
			const item = normalizeLibraryItem(input, now);
			library.push(item);
			libraryRevision = Math.max(libraryRevision, now);
			await persist();
			return JSON.parse(JSON.stringify(item));
		},
		/**
		 * Replace the whole library — what the board app sends after the person
		 * reorders, renames or deletes a template in Excalidraw's own panel.
		 *
		 * @param items - the complete next library.
		 * @returns the stored library.
		 */
		async libraryReplace(items) {
			const now = Date.now();
			const list = Array.isArray(items) ? items : [];
			library = list.map((item) => normalizeLibraryItem(item, now));
			libraryRevision = Math.max(now, libraryRevision + 1);
			await persist();
			return this.libraryItems();
		},
		/**
		 * Drop one template by id.
		 *
		 * @param id - the template to forget.
		 * @returns true when it was there.
		 */
		async libraryDelete(id) {
			const before = library.length;
			library = library.filter((item) => item.id !== id);
			if (library.length === before) return false;
			libraryRevision = Date.now();
			await persist();
			return true;
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
