/**
 * The board host app — the only React in the plugin.
 *
 * Bundled with `bun build` into `static/board-app.js` (see scripts/vendor.mjs)
 * and loaded inside the sidebar tab's iframe. Excalidraw itself is *not*
 * bundled here: the prod build of `@excalidraw/excalidraw` is served from
 * `static/assets/` and imported by absolute URL, so its dynamic imports
 * (chunks, locales, fonts) keep resolving from that same tree.
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

function App() {
	const [scene, setScene] = useState(null); // null = loading
	const [status, setStatus] = useState('loading');
	const saveTimer = useRef(null);
	const sceneRef = useRef(null);

	useEffect(() => {
		if (sessionId === '') {
			setStatus('no-session');
			return;
		}
		fetch(boardUrl)
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
		setStatus('saving');
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

	if (sessionId === '') {
		return <div className="ex-status">No session — open this board from a chat.</div>;
	}
	if (scene === null) {
		return <div className="ex-status">Loading…</div>;
	}
	return (
		<div className="ex-root">
			<Excalidraw
				initialData={scene}
				onChange={(elements, appState) => scheduleSave(elements, appState)}
			/>
			<div className={`ex-status ex-status-${status}`}>{status}</div>
		</div>
	);
}

createRoot(document.getElementById('root')).render(<App />);
