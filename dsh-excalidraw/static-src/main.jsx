/**
 * The board host app — the only React in the plugin.
 *
 * Bundled with `bun build` into `static/board-app.js` (see scripts/vendor.mjs)
 * and loaded inside the sidebar tab's iframe. React and Excalidraw are *not*
 * bundled here: the page's import map provides one shared ESM build of React,
 * and Excalidraw's production build is served from `static/assets/`. Keeping
 * them external means the two graphs share a single React instance, and the
 * Excalidraw chunk/locale/font imports keep resolving from the asset tree.
 *
 * The app is dumb: it loads this chat's scene from the Host, renders the
 * canvas, and persists on change. All Excalidraw knowledge lives inside this
 * file — the Host only moves opaque JSON.
 */

import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { Excalidraw } from 'excalidraw-host';

const sessionId = new URLSearchParams(location.search).get('session') ?? '';
const boardUrl = `/api/excalidraw/boards/${encodeURIComponent(sessionId)}`;
const SAVE_DELAY_MS = 800;

/** Any uncaught page error becomes a visible status line instead of a blank board. */
let lastErrorText = null;
function reportError(message) {
	lastErrorText = String(message);
	const status = document.getElementById('board-status');
	if (status) {
		status.textContent = `error: ${lastErrorText}`;
		status.className = 'ex-status ex-status-error';
	}
}
window.addEventListener('error', (event) => reportError(event.message ?? event.error ?? 'unknown error'));
window.addEventListener('unhandledrejection', (event) => reportError(event.reason ?? 'unhandled rejection'));

function StatusLine({ status }) {
	const error = status.startsWith('load-error') || status.startsWith('save-error') || status.startsWith('error');
	return <div id="board-status" className={`ex-status${error ? ' ex-status-error' : ''}`}>{status}</div>;
}

function App() {
	const [scene, setScene] = useState(null); // null = loading
	const [status, setStatus] = useState('loading');
	const saveTimer = useRef(null);
	const sceneRef = useRef(null);

	useEffect(() => {
		if (sessionId === '') {
			setStatus('no session — open the board from a chat');
			return;
		}
		fetch(boardUrl, { cache: 'no-store' })
			.then((response) => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return response.json();
			})
			.then((payload) => {
				const board = payload?.board ?? {};
				sceneRef.current = {
					elements: Array.isArray(board.elements) ? board.elements : [],
					appState: board.appState ?? {}
				};
				setScene(sceneRef.current);
				setStatus('ready');
			})
			.catch((error) => {
				setStatus(`load-error: ${String(error?.message ?? error)}`);
			});
		return () => {
			if (saveTimer.current !== null) clearTimeout(saveTimer.current);
		};
	}, []);

	const scheduleSave = (elements, appState) => {
		if (saveTimer.current !== null) clearTimeout(saveTimer.current);
		setStatus('saving…');
		saveTimer.current = setTimeout(() => {
			fetch(boardUrl, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ elements, appState })
			})
				.then((response) => {
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					return response.json();
				})
				.then(() => setStatus('saved'))
				.catch((error) => setStatus(`save-error: ${String(error?.message ?? error)}`));
		}, SAVE_DELAY_MS);
	};

	if (sessionId === '' || scene === null) {
		return (
			<div className="ex-root">
				<StatusLine status={status} />
			</div>
		);
	}
	return (
		<div className="ex-root">
			<Excalidraw
				initialData={scene}
				onChange={(elements, appState) => scheduleSave(elements, appState)}
			/>
			<StatusLine status={status} />
		</div>
	);
}

try {
	const root = createRoot(document.getElementById('root'));
	root.render(<App />);
} catch (error) {
	reportError(error);
}
