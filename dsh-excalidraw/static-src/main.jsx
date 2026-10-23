/**
 * The board host app — the only React in the plugin.
 *
 * Bundled with `bun build` into `static/app/` (see scripts/vendor.mjs) and
 * loaded inside the sidebar tab's iframe. Everything is bundled: the published
 * `@excalidraw/excalidraw` build imports a dozen npm packages by bare specifier
 * (radix, jotai, roughjs, clsx…), so it cannot be served to a browser as-is —
 * the bundler resolves that graph once, at vendor time.
 *
 * The board is shared with the agent, so this app has two jobs:
 * - persist the person's own strokes (and only those: `onChange` also fires for
 *   cursor and scroll, and re-saving those would overwrite an agent's drawing);
 * - pull in whatever the agent wrote while the tab stayed open.
 */

import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { Excalidraw, convertToExcalidrawElements, restore } from '@excalidraw/excalidraw';

const sessionId = new URLSearchParams(location.search).get('session') ?? '';
const boardUrl = `/api/excalidraw/boards/${encodeURIComponent(sessionId)}`;
const SAVE_DELAY_MS = 800;
const POLL_MS = 1500;

/**
 * Write the tab's status line.
 *
 * The page installs `window.__boardStatus` before this bundle loads, so a
 * failure here still shows up as text instead of an empty rectangle.
 *
 * @param text - what to say.
 * @param isError - whether to style it as a failure.
 */
function setStatusLine(text, isError) {
	if (typeof window.__boardStatus === 'function') window.__boardStatus(text, isError === true);
}

/**
 * Identity of a scene's *content*.
 *
 * Excalidraw bumps `version` when an element is really edited, and leaves it
 * alone for a moved cursor or a scroll. Comparing this string is what separates
 * "the person drew something" from "the app noticed the pointer" — without it
 * every pointer move re-uploads the scene and silently reverts the agent's work.
 *
 * @param elements - the live or stored scene.
 * @returns a string that changes only when the drawing changes.
 */
function sceneVersion(elements) {
	let out = '';
	for (const element of elements) {
		out += `${element.id}:${typeof element.version === 'number' ? element.version : 0}:${element.isDeleted === true ? 1 : 0}|`;
	}
	return out;
}

/**
 * Turn whatever the board holds into a scene Excalidraw can draw.
 *
 * The agent writes plain JSON, and Excalidraw silently drops an element missing
 * its bookkeeping fields (seed, version, versionNonce, updated) — a text element
 * written as `{ type: "text", x, y, text }` simply never appeared. Skeletons are
 * therefore converted with Excalidraw's own converter and the result is repaired
 * by `restore`, which fills defaults and drops nonsense.
 *
 * @param elements - stored elements, full or skeletal.
 * @returns the normalized elements.
 */
function normalizeElements(elements) {
	if (!Array.isArray(elements) || elements.length === 0) return [];
	const complete = [];
	const skeletons = [];
	for (const element of elements) {
		if (element === null || typeof element !== 'object') continue;
		const isComplete = typeof element.id === 'string'
			&& typeof element.version === 'number'
			&& typeof element.versionNonce === 'number'
			&& typeof element.seed === 'number'
			&& typeof element.type === 'string';
		if (isComplete) complete.push(element);
		else if (typeof element.type === 'string') skeletons.push(element);
	}
	let converted = [];
	if (skeletons.length > 0) {
		try {
			converted = convertToExcalidrawElements(skeletons, { regenerateIds: true });
		} catch (error) {
			console.warn('board: could not convert skeletons', error);
		}
	}
	const restored = restore({ elements: [...complete, ...converted], appState: {} }, null, null);
	return Array.isArray(restored?.elements) ? restored.elements : [];
}

/**
 * The view fields worth carrying between visits.
 *
 * `appState` as a whole must never be handed back to Excalidraw: the live object
 * carries Maps and callbacks (`collaborators`, `selectedElementIds`…), and a
 * JSON round-trip turns them into plain objects, which crashes the renderer with
 * "e.appState.collaborators.forEach is not a function".
 *
 * @param appState - a stored or live appState, possibly partial or stale.
 * @returns the safe subset, with undefined entries dropped.
 */
function pickView(appState) {
	const source = appState !== null && typeof appState === 'object' ? appState : {};
	const view = {};
	for (const key of ['viewBackgroundColor', 'gridSize', 'scrollX', 'scrollY']) {
		const value = source[key];
		if (typeof value === 'number' || (key === 'viewBackgroundColor' && typeof value === 'string')) view[key] = value;
	}
	const zoom = source.zoom;
	if (zoom !== null && typeof zoom === 'object' && typeof zoom.value === 'number') view.zoom = { value: zoom.value };
	return view;
}

function App() {
	const [scene, setScene] = useState(null); // null = loading
	const saveTimer = useRef(null);
	const apiRef = useRef(null);
	/** Content version this tab has already stored (or pulled) — see sceneVersion. */
	const savedVersion = useRef(null);
	/** `updatedAt` of the stored scene this tab already shows. */
	const shownAt = useRef(0);

	useEffect(() => {
		if (sessionId === '') {
			setStatusLine('no session — open this board from a chat', true);
			return undefined;
		}
		fetch(boardUrl, { cache: 'no-store' })
			.then((response) => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return response.json();
			})
			.then((payload) => {
				const board = payload?.board ?? {};
				const raw = Array.isArray(board.elements) ? board.elements : [];
				const elements = normalizeElements(raw);
				savedVersion.current = sceneVersion(elements);
				shownAt.current = typeof board.updatedAt === 'number' ? board.updatedAt : 0;
				setScene({ elements, appState: pickView(board.appState) });
				setStatusLine('ready');
				// Repair what the agent wrote: store the canonical form, so the next
				// read (by the person, the model or another tab) sees real elements.
				if (elements.length !== raw.length || JSON.stringify(elements) !== JSON.stringify(raw)) {
					void persist(elements, pickView(board.appState));
				}
			})
			.catch((error) => {
				setStatusLine(`board failed: could not read the scene — ${String(error?.message ?? error)}`, true);
			});
		return () => {
			if (saveTimer.current !== null) clearTimeout(saveTimer.current);
		};
	}, []);

	/** Write the scene to the Host. */
	const persist = (elements, appState) => {
		setStatusLine('saving…');
		savedVersion.current = sceneVersion(elements);
		return fetch(boardUrl, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			// Only the view subset: the live appState is not JSON data.
			body: JSON.stringify({ elements, appState: pickView(appState) })
		})
			.then((response) => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return response.json();
			})
			.then((payload) => {
				// Our own write: never treat it as a remote change and reload it.
				if (typeof payload?.board?.updatedAt === 'number') shownAt.current = payload.board.updatedAt;
				setStatusLine('saved');
			})
			.catch((error) => setStatusLine(`board failed: could not save — ${String(error?.message ?? error)}`, true));
	};

	const scheduleSave = (elements, appState) => {
		const version = sceneVersion(elements);
		if (version === savedVersion.current) return;
		savedVersion.current = version;
		if (saveTimer.current !== null) clearTimeout(saveTimer.current);
		saveTimer.current = setTimeout(() => {
			saveTimer.current = null;
			void persist(elements, appState);
		}, SAVE_DELAY_MS);
	};

	/**
	 * Follow the board the way a shared document works.
	 *
	 * The agent writes to the same scene through the Host, so a tab left open
	 * would otherwise show a stale picture until it was reopened. This polls the
	 * stored scene and pulls it in when it is newer than what this tab shows, but
	 * never while a local edit is still waiting to be saved — the person's own
	 * strokes always win the race against a refresh.
	 */
	useEffect(() => {
		if (sessionId === '') return undefined;
		const timer = setInterval(() => {
			if (saveTimer.current !== null) return;
			const api = apiRef.current;
			if (api === null || api === undefined) return;
			fetch(boardUrl, { cache: 'no-store' })
				.then((response) => (response.ok ? response.json() : undefined))
				.then((payload) => {
					const board = payload?.board;
					if (board === undefined) return;
					const updatedAt = typeof board.updatedAt === 'number' ? board.updatedAt : 0;
					if (updatedAt <= shownAt.current) return;
					const elements = normalizeElements(board.elements);
					shownAt.current = updatedAt;
					// Adopt the pulled version first: `updateScene` fires onChange, and
					// saving it straight back would flip the board back and forth.
					savedVersion.current = sceneVersion(elements);
					api.updateScene({ elements });
					setStatusLine('updated by the board');
				})
				.catch(() => {
					/* a transient read failure is not worth a warning */
				});
		}, POLL_MS);
		return () => clearInterval(timer);
	}, []);

	if (sessionId === '' || scene === null) return <div className="ex-root" />;
	return (
		<div className="ex-root">
			<Excalidraw
				initialData={scene}
				excalidrawAPI={(api) => {
					apiRef.current = api;
					// Handy for diagnostics: the live scene without React internals.
					window.__boardApi = api;
				}}
				onChange={(elements, appState) => scheduleSave(elements, appState)}
			/>
		</div>
	);
}

try {
	createRoot(document.getElementById('root')).render(<App />);
} catch (error) {
	setStatusLine(`board failed: ${String(error?.message ?? error)}`, true);
}
