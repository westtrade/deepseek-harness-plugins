/**
 * Host entry for `dsh-excalidraw`.
 *
 * One Excalidraw board per chat. The man serves:
 *
 * - a static board app (`static/`) — the iframe document the sidebar tab loads,
 *   with the vendored Excalidraw production build;
 * - a tiny board API — `GET/PUT /api/excalidraw/boards/<sessionId>` carrying
 *   opaque scene JSON (elements + appState);
 * - two model-facing tools — `excalidraw_read` and `excalidraw_write`, so the
 *   AI can read what is drawn and draw on it itself.
 *
 * The board never interprets scene data: Excalidraw's format is just JSON, and
 * the plugin only moves it between the canvas and the store.
 *
 * Mount it as a patch entry next to the other plugins:
 *
 * ```yaml
 * - insert:
 *     - id: excalidraw
 *       name: 'file:///…/dsh-excalidraw/lib/index.js?rev=1'
 *       config: {}
 * ```
 *
 * @module dsh-excalidraw
 */

// The patch layer loads this entry as `…/lib/index.js?rev=N`; forward the query
// to sibling imports so a reload re-reads the whole module graph.
const REV = new URL(import.meta.url).search;
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { openBoardStore } = await import('./store.js' + REV);

/** Cordis service name for this plugin. */
export const name = 'excalidraw';

/** Services required: the web server for the board app and the API. */
export const inject = ['webServer'];

/** URL prefix under which everything this plugin serves lives. */
export const BASE_PATH = '/api/excalidraw';

/** The board API: one chat, one scene. */
const BOARDS_PREFIX = `${BASE_PATH}/boards/`;

/** Largest accepted board body (a scene can be large; be generous). */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Read a bounded UTF-8 body; resolves to undefined when it is too large. */
async function readBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.byteLength;
		if (size > MAX_BODY_BYTES) {
			req.resume();
			return undefined;
		}
		chunks.push(chunk);
	}
	return Buffer.concat(chunks, size).toString('utf8');
}

/** Send one JSON response. */
function sendJson(res, status, payload) {
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store'
	});
	res.end(JSON.stringify(payload));
}

/** A minimal content-type table for the served static files. */
const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.ttf': 'font/ttf',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.bin': 'application/octet-stream'
};

/**
 * Host plugin body.
 *
 * @param ctx - host context.
 * @param config - `storePath` (default `$DSH_HOME/excalidraw-boards.json`).
 */
export async function apply(ctx, config = {}) {
	const dshHome = process.env.DSH_HOME ?? `${process.env.HOME ?? ''}/.dsh`;
	const store = await openBoardStore({
		file: config.storePath ?? `${dshHome}/excalidraw-boards.json`
	});

	const staticRoot = fileURLToPath(new URL('../static/', import.meta.url)).replace(/[\\/]+$/, '');

	/**
	 * Serve one file from the static tree, denying any path that escapes it.
	 */
	async function serveStatic(res, requestPath) {
		const decoded = decodeURIComponent(requestPath);
		if (decoded.includes('\0') || decoded.split('/').includes('..')) {
			res.writeHead(403);
			res.end('forbidden');
			return;
		}
		const resolved = path.resolve(staticRoot, decoded);
		if (resolved !== staticRoot && !resolved.startsWith(`${staticRoot}${path.sep}`)) {
			res.writeHead(403);
			res.end('forbidden');
			return;
		}
		try {
			const body = await readFile(resolved);
			const ext = path.extname(resolved).toLowerCase();
			res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
			res.end(body);
		} catch (error) {
			if (error?.code === 'ENOENT') {
				res.writeHead(404);
				res.end('not found');
				return;
			}
			throw error;
		}
	}

	/** `GET/PUT /api/excalidraw/boards/<sessionId>` */
	const boardsHandler = async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://dsh.invalid');
		const rest = url.pathname.slice(BOARDS_PREFIX.length);
		const sessionId = decodeURIComponent(rest.split('/')[0] ?? '');
		if (sessionId === '') {
			res.writeHead(400);
			res.end(JSON.stringify({ error: 'a session id is required in the path' }));
			return;
		}
		try {
			if (req.method === 'GET' || req.method === 'HEAD') {
				sendJson(res, 200, { ok: true, sessionId, board: store.get(sessionId) });
				return;
			}
			if (req.method !== 'PUT') {
				res.writeHead(405, { allow: 'GET, HEAD, PUT' });
				res.end();
				return;
			}
			const raw = await readBody(req);
			const body = raw === undefined ? undefined : JSON.parse(raw);
			const stored = await store.set(sessionId, body);
			sendJson(res, 200, { ok: true, sessionId, board: stored });
		} catch (error) {
			ctx.logger.error(error);
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	/** `GET /api/excalidraw/…` — the board app and its assets. */
	const staticHandler = async (req, res) => {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405, { allow: 'GET, HEAD' });
			res.end();
			return;
		}
		const url = new URL(req.url ?? '/', 'http://dsh.invalid');
		const rest = url.pathname.slice(BASE_PATH.length).replace(/^\/+/, '');
		try {
			await serveStatic(res, rest === '' ? 'board.html' : rest);
		} catch (error) {
			ctx.logger.error(error);
			if (!res.headersSent) res.writeHead(500);
			res.end();
		}
	};

	ctx.effect(() => ctx.webServer.register({
		kind: 'prefix',
		path: BASE_PATH,
		handler: (req, res) => {
			const url = new URL(req.url ?? '/', 'http://dsh.invalid');
			const pathname = url.pathname;
			if (pathname.startsWith(BOARDS_PREFIX)) return boardsHandler(req, res);
			return staticHandler(req, res);
		}
	}), 'excalidraw: board route');

	registerTools(ctx, { store });
}

/**
 * Register the AI-facing tools: read a board, and draw on it.
 *
 * The tools only move plain JSON, exactly like the HTTP API. They default to
 * the calling chat's board, so the model does not need to know its own session
 * id.
 *
 * @param ctx - host context carrying `tools` (looked up lazily so a deployment
 *   without the tool runtime still serves the board app).
 * @param deps - the board store.
 */
function registerTools(ctx, deps) {
	const { store } = deps;
	/** One text block. */
	const text = (value) => [{ type: 'text', text: value }];
	/** Resolve which board a call means: the calling chat by default. */
	const boardOf = (exec, sessionId) => {
		const id = typeof sessionId === 'string' && sessionId !== ''
			? sessionId
			: exec?.agent?.session?.id;
		if (typeof id !== 'string' || id === '') {
			throw new Error('no session: call from a chat, or pass sessionId');
		}
		return id;
	};
	/** The element shape both tools accept (opaque JSON). */
	const elementShape = { type: 'object' };

	ctx.inject(['tools'], (toolCtx) => {
		/** Register one tool; one bad tool costs one tool, not all of them. */
		const register = (definition) => {
			try {
				toolCtx.tools.register(definition);
			} catch (error) {
				toolCtx.logger?.warn?.(`excalidraw: tool "${definition.name}" was not registered: ${String(error?.message ?? error)}`);
			}
		};

		register({
			name: 'excalidraw_read',
			description: 'Read this chat\'s Excalidraw board: every element (shapes, text, arrows, images) with its coordinates, size, color and text content, plus how the scene is framed. The board is shared with the person in the sidebar; reading it never changes anything.',
			parameters: {
				sessionId: { type: 'string', description: 'Optional: another chat\'s board. Defaults to the calling chat.' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					required: ['sessionId', 'updatedAt', 'elements', 'appState'],
					properties: {
						sessionId: { type: 'string' },
						updatedAt: { type: 'number' },
						elements: { type: 'array', items: elementShape },
						appState: { type: 'object' }
					}
				},
				render: (_args, value) => {
					const scene = JSON.stringify(value.elements);
					const trimmed = scene.length > 40000 ? `${scene.slice(0, 40000)}… (truncated)` : scene;
					return text(`Board for chat ${value.sessionId} (updated ${new Date(value.updatedAt).toISOString()}): ${value.elements.length} element(s)\n${trimmed}`);
				}
			},
			async execute(args, exec) {
				const sessionId = boardOf(exec, args.sessionId);
				const board = store.get(sessionId);
				return { sessionId, updatedAt: board.updatedAt, elements: board.elements, appState: board.appState };
			}
		});

		register({
			name: 'excalidraw_write',
			description: 'Draw on this chat\'s Excalidraw board. Elements are upserted by their id (an element with an existing id is replaced; without one it is added). Pass `deleteIds` to remove elements, or `clear: true` to wipe the board. The board is shared with the person in the sidebar, so the change is immediately visible.',
			parameters: {
				sessionId: { type: 'string', description: 'Optional: another chat\'s board. Defaults to the calling chat.' },
				upsert: { type: 'array', description: 'Elements to add or replace. Any Excalidraw element JSON works (type, x, y, width, height, ...); a missing id is generated.', items: elementShape },
				deleteIds: { type: 'array', description: 'Element ids to remove.', items: { type: 'string' } },
				clear: { type: 'boolean', description: 'When true, start from a blank board before applying the other operations.' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					required: ['sessionId', 'updatedAt', 'added', 'updated', 'deleted', 'elementsCount'],
					properties: {
						sessionId: { type: 'string' },
						updatedAt: { type: 'number' },
						added: { type: 'integer' },
						updated: { type: 'integer' },
						deleted: { type: 'integer' },
						elementsCount: { type: 'integer' }
					}
				},
				render: (_args, value) => text(`Board for chat ${value.sessionId}: added ${value.added}, updated ${value.updated}, deleted ${value.deleted} — now ${value.elementsCount} element(s).`)
			},
			async execute(args, exec) {
				const sessionId = boardOf(exec, args.sessionId);
				const board = store.get(sessionId);
				let elements = args.clear === true ? [] : board.elements;
				let added = 0;
				let updated = 0;
				if (Array.isArray(args.upsert)) {
					for (const raw of args.upsert) {
						if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
							throw new Error('upsert entries must be element objects');
						}
						const element = { ...raw };
						if (typeof element.id !== 'string' || element.id === '') {
							element.id = `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
						}
						const index = elements.findIndex((entry) => entry.id === element.id);
						if (index === -1) {
							elements.push(element);
							added += 1;
						} else {
							elements[index] = element;
							updated += 1;
						}
					}
				}
				let deleted = 0;
				if (Array.isArray(args.deleteIds)) {
					const remove = new Set(args.deleteIds);
					const before = elements.length;
					elements = elements.filter((entry) => !remove.has(entry.id));
					deleted = before - elements.length;
				}
				const stored = await store.set(sessionId, { elements, appState: board.appState });
				return {
					sessionId,
					updatedAt: stored.updatedAt,
					added,
					updated,
					deleted,
					elementsCount: stored.elements.length
				};
			}
		});
	});
}
