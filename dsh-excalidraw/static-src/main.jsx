/**
 * The board host app — the only React in the plugin.
 *
 * Bundled with `bun build` into `static/app/` (see scripts/vendor.mjs) and
 * loaded inside the sidebar tab's iframe. Everything is bundled: the published
 * `@excalidraw/excalidraw` build imports a dozen npm packages by bare specifier
 * (radix, jotai, roughjs, clsx…), so it cannot be served to a browser as-is —
 * the bundler resolves that graph once, at vendor time.
 *
 * The app is dumb: it loads this chat's scene from the Host, renders the
 * canvas, and persists on change. All Excalidraw knowledge lives inside this
 * file — the Host only moves opaque JSON.
 */

import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
// The stylesheet is linked by board.html, not imported here: the package's
// `./index.css` export is condition-gated (production/development only), so the
// vendor step copies the production stylesheet next to the bundle instead.
//
// It is not optional. Without it the Excalidraw container has no definite
// height, its ResizeObserver feeds back the growing canvas, and the board ends
// up as a 33-million-pixel tall blank page — which is exactly how it looked.
import { Excalidraw, convertToExcalidrawElements, restore } from '@excalidraw/excalidraw';

const sessionId = new URLSearchParams(location.search).get('session') ?? '';
const boardUrl = `/api/excalidraw/boards/${encodeURIComponent(sessionId)}`;
const SAVE_DELAY_MS = 800;

/**
 * Turn whatever the board holds into a scene Excalidraw can draw.
 *
 * The agent writes plain JSON, and Excalidraw silently drops an element that is
 * missing its bookkeeping fields (seed, version, versionNonce, updated) — a text
 * element written as `{ type: "text", x, y, text }` simply never appeared. So
 * skeletons are converted with Excalidraw's own converter, and the result goes
 * through `restore`, which fills defaults, repairs bindings and drops nonsense.
 *
 * @param elements - stored elements, full or skeletal.
 * @returns the normalized elements, or an empty scene when nothing survives.
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
 * "e.appState.collaborators.forEach is not a function". Only primitives that
 * describe the framing survive here.
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

function App() {
	const [scene, setScene] = useState(null); // null = loading
	const saveTimer = useRef(null);
	const sceneRef = useRef(null);

	useEffect(() => {
		if (sessionId === '') {
			setStatusLine('no session — open this board from a chat', true);
			return;
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
				sceneRef.current = {
					elements,
					appState: pickView(board.appState)
				};
				setScene(sceneRef.current);
				setStatusLine('ready');
				// Repair what the agent wrote: store the canonical form, so the next
				// read (by the person, the model or another tab) sees real elements.
				if (elements.length !== raw.length || JSON.stringify(elements) !== JSON.stringify(raw)) {
					void persist(elements, sceneRef.current.appState);
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
			.then(() => setStatusLine('saved'))
			.catch((error) => setStatusLine(`board failed: could not save — ${String(error?.message ?? error)}`, true));
	};

	const scheduleSave = (elements, appState) => {
		if (saveTimer.current !== null) clearTimeout(saveTimer.current);
		saveTimer.current = setTimeout(() => {
			void persist(elements, appState);
		}, SAVE_DELAY_MS);
	};

	if (sessionId === '' || scene === null) return <div className="ex-root" />;
	return (
		<div className="ex-root">
			<Excalidraw
				initialData={scene}
				excalidrawAPI={(api) => {
					// Handy for diagnostics (and for a future embed hook): the live
					// scene and export helpers without poking at React internals.
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
