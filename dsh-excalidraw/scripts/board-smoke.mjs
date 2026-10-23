/**
 * Browser smoke test for dsh-excalidraw.
 *
 * The host test proves the files are served; this one proves the board actually
 * *draws*, which is a different question and the one that failed silently: with
 * no stylesheet the iframe rendered a 33-million-pixel canvas and the person saw
 * an empty panel. A headless Chrome loads the real page against a running Host,
 * a scene is written through the board API, and the canvas is inspected.
 *
 * Usage: `node scripts/board-smoke.mjs [base-url]`
 * Requires `google-chrome` (or $CHROME_BIN) and reachable Web server; skipped
 * with a clear message when either is missing.
 *
 * @module dsh-excalidraw/scripts/board-smoke
 */

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const baseUrl = (process.argv[2] ?? 'http://127.0.0.1:3080').replace(/\/+$/, '');
const chromeBin = process.env.CHROME_BIN ?? '/usr/bin/google-chrome';
const SESSION = `session-board-smoke-${process.pid}`;

let pass = 0;
let fail = 0;
function ok(label, condition, extra = '') {
	if (condition) {
		pass += 1;
		return;
	}
	fail += 1;
	console.log('FAIL:', label, extra);
}

if (!existsSync(chromeBin)) {
	console.log(`board: skipped (no Chrome at ${chromeBin}; set CHROME_BIN)`);
	process.exit(0);
}

/** A scene an agent writes: one skeleton each, no ids or bookkeeping. */
const scene = {
	elements: [
		{ type: 'ellipse', x: 60, y: 60, width: 260, height: 160, backgroundColor: '#b2f2bb', strokeColor: '#2f9e44' },
		{ type: 'text', x: 90, y: 110, text: 'board smoke', fontSize: 20 }
	],
	appState: {}
};

const written = await fetch(`${baseUrl}/api/excalidraw/boards/${encodeURIComponent(SESSION)}`, {
	method: 'PUT',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify(scene)
});
ok('the board API accepts a scene', written.ok, String(written.status));

// --- drive a headless Chrome over the DevTools protocol ------------------
const profile = `${process.env.TMPDIR ?? '/tmp'}/board-smoke-${process.pid}`;
const port = 9600 + (process.pid % 300);
const chrome = spawn(chromeBin, [
	'--headless=new',
	'--disable-gpu',
	'--no-sandbox',
	'--hide-scrollbars',
	'--window-size=1000,700',
	`--user-data-dir=${profile}`,
	`--remote-debugging-port=${port}`,
	'about:blank'
], { stdio: 'ignore' });

/** Wait until the debugging endpoint answers. */
async function waitForChrome() {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (response.ok) return true;
		} catch {
			/* not up yet */
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	return false;
}

const require = createRequire(import.meta.url);
let WebSocket;
for (const candidate of ['ws', '/home/io/.dsh/profiles/node_modules/ws']) {
	try {
		WebSocket = require(candidate);
		break;
	} catch {
		/* try the next location */
	}
}
if (WebSocket === undefined) {
	console.log('board: skipped (the `ws` package is not resolvable for the DevTools socket)');
	chrome.kill();
	process.exit(0);
}

try {
	ok('Chrome starts', await waitForChrome());
	const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
	const pageTarget = targets.find((target) => target.type === 'page');
	const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
	const pending = new Map();
	let nextId = 0;
	await new Promise((resolve) => socket.on('open', resolve));
	socket.on('message', (raw) => {
		const message = JSON.parse(String(raw));
		if (message.id !== undefined) pending.get(message.id)?.(message);
	});
	const send = (method, params = {}) => new Promise((resolve) => {
		const id = (nextId += 1);
		pending.set(id, resolve);
		socket.send(JSON.stringify({ id, method, params }));
	});
	const evaluate = async (expression) => {
		const response = await send('Runtime.evaluate', { expression, returnByValue: true });
		if (response.result?.exceptionDetails) return `ERR ${response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text}`;
		return response.result?.result?.value ?? null;
	};
	await send('Runtime.enable');
	await send('Page.enable');
	await send('Page.navigate', { url: `${baseUrl}/api/excalidraw/board.html?session=${encodeURIComponent(SESSION)}` });
	// The bundle is ~1.3 MB plus the Excalidraw chunks: give it real time.
	await new Promise((resolve) => setTimeout(resolve, 12000));

	// "ready" is the moment after loading; the repair save right after it flips
	// the line to "saved". Both mean the scene arrived.
	const status = await evaluate('document.getElementById("board-status")?.textContent');
	ok('the board loaded the scene', status === 'ready' || status === 'saved', String(status));
	ok('Excalidraw mounted', (await evaluate('!!document.querySelector(".excalidraw-container")')) === true);
	const sceneTypes = await evaluate('JSON.stringify((window.__boardApi?.getSceneElements()||[]).map((element) => element.type))');
	ok('the stored scene reached the canvas', sceneTypes === '["ellipse","text"]', String(sceneTypes));

	const canvas = await evaluate(`(function(){
		var canvases = [...document.querySelectorAll('canvas')];
		if (canvases.length === 0) return 'no canvas';
		var main = canvases[0];
		if (main.width > 4000 || main.height > 4000) return 'runaway canvas ' + main.width + 'x' + main.height;
		var ctx = main.getContext('2d');
		var data = ctx.getImageData(0, 0, main.width, main.height).data;
		var ink = 0;
		var colored = 0;
		for (var index = 0; index < data.length; index += 4) {
			var r = data[index], g = data[index + 1], b = data[index + 2];
			if (r > 246 && g > 246 && b > 246) continue;
			ink += 1;
			if (Math.abs(r - g) > 12 || Math.abs(g - b) > 12) colored += 1;
		}
		return JSON.stringify({ size: main.width + 'x' + main.height, ink: ink, colored: colored });
	})()`);
	let bitmap = null;
	try {
		bitmap = JSON.parse(String(canvas));
	} catch {
		/* the diagnostic below carries the raw answer */
	}
	ok('the canvas is sized to the page', bitmap !== null && bitmap.size !== undefined, String(canvas));
	ok('the scene is actually painted', bitmap !== null && bitmap.ink > 2000, String(canvas));
	ok('the drawn shape carries its color', bitmap !== null && bitmap.colored > 1000, String(canvas));
	socket.close();
} finally {
	chrome.kill('SIGKILL');
}

// Clean the throw-away board back up.
await fetch(`${baseUrl}/api/excalidraw/boards/${encodeURIComponent(SESSION)}`, {
	method: 'PUT',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ elements: [], appState: {} })
}).catch(() => {});

console.log(`board: pass=${pass} fail=${fail}`);
if (fail > 0) process.exit(1);
