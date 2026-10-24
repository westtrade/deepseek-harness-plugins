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

/**
 * The shared library of templates: one list for every chat's board.
 *
 * Excalidraw keeps a library per browser profile; this plugin keeps one per
 * deployment instead, so a template added from one chat is available in all of
 * them — and the AI can contribute templates through its own tool.
 */
const LIBRARY_PATH = `${BASE_PATH}/library`;

/** The board collection: list the boards that exist. */
const BOARDS_PATH = `${BASE_PATH}/boards`;

/** The board API: one chat, one scene. */
const BOARDS_PREFIX = `${BASE_PATH}/boards/`;

/**
 * The self-description route.
 *
 * An agent that works through a shell (rather than through this plugin's tools)
 * has no way to know which board is its own, or even that the plugin exists:
 * this route answers both in one request. The tools do not need it — they
 * default to the calling chat — but the HTTP path did, and hunting for a session
 * id inside `$DSH_HOME/excalidraw-boards.json` is not an interface.
 */
const MANIFEST_PATH = `${BASE_PATH}/manifest`;

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
	'.mjs': 'text/javascript; charset=utf-8',
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

	/** The tool surface this plugin declares, for the manifest route. */
	const toolCatalog = [];
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
			// Never keep a stale board page or bundle: the plugin may be rebuilt
			// without a host restart, so the browser must revalidate.
			res.writeHead(200, {
				'content-type': MIME[ext] ?? 'application/octet-stream',
				'cache-control': 'no-cache'
			});
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

	/**
	 * `GET/PUT/POST /api/excalidraw/library` — the shared templates.
	 *
	 * `GET` reads them, `POST` adds one (`{ name, elements }`), `PUT` replaces the
	 * whole list (the board app does that when a person edits the library in
	 * Excalidraw's own panel), and `DELETE …/library/<id>` drops one.
	 */
	const libraryHandler = async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://dsh.invalid');
		const rest = url.pathname.slice(LIBRARY_PATH.length).replace(/^\/+/, '');
		try {
			if (rest !== '') {
				if (req.method !== 'DELETE') {
					res.writeHead(405, { allow: 'DELETE' });
					res.end();
					return;
				}
				const deleted = await store.libraryDelete(decodeURIComponent(rest));
				sendJson(res, 200, { ok: true, deleted, revision: store.libraryRevision() });
				return;
			}
			if (req.method === 'GET' || req.method === 'HEAD') {
				sendJson(res, 200, { ok: true, items: store.libraryItems(), revision: store.libraryRevision() });
				return;
			}
			const raw = await readBody(req);
			const body = raw === undefined ? undefined : JSON.parse(raw);
			if (req.method === 'POST') {
				const item = await store.libraryAdd({ name: body?.name, elements: body?.elements });
				sendJson(res, 201, { ok: true, item, revision: store.libraryRevision() });
				return;
			}
			if (req.method === 'PUT') {
				const items = await store.libraryReplace(body?.items);
				sendJson(res, 200, { ok: true, items, revision: store.libraryRevision() });
				return;
			}
			res.writeHead(405, { allow: 'GET, HEAD, POST, PUT, DELETE' });
			res.end();
		} catch (error) {
			ctx.logger.error(error);
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	/**
	 * `GET /api/excalidraw/boards` — every board, newest first.
	 *
	 * Finds a board without knowing a session id: an agent can look for the chat
	 * it is working in, and a person can see what exists at all.
	 */
	const boardsIndexHandler = (req, res) => {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405, { allow: 'GET, HEAD' });
			res.end();
			return;
		}
		sendJson(res, 200, { ok: true, boards: store.summaries() });
	};

	/**
	 * `GET /api/excalidraw/manifest` — how to use this plugin, in one answer.
	 */
	const manifestHandler = (req, res) => {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405, { allow: 'GET, HEAD' });
			res.end();
			return;
		}
		sendJson(res, 200, {
			plugin: name,
			package: 'dsh-excalidraw',
			summary: 'One Excalidraw board per chat, shared by the person in the right sidebar and by the AI.',
			tools: toolCatalog,
			findingYourBoard: {
				fromTheTools: 'excalidraw_read / excalidraw_write default to the calling chat: no session id needed.',
				fromTheShell: 'The shell environment carries $DSH_SESSION_ID — that is this chat, and its board is /api/excalidraw/boards/$DSH_SESSION_ID.',
				byListing: `GET ${BOARDS_PATH} lists every board (sessionId, updatedAt, element count), newest first.`
			},
			library: {
				what: 'One shared template library for every chat\'s board. The person sees it in Excalidraw\'s library panel; the AI reads and extends it with excalidraw_library / excalidraw_library_add.',
				endpoints: [
					{ method: 'GET', path: LIBRARY_PATH, purpose: 'the templates' },
					{ method: 'POST', path: LIBRARY_PATH, purpose: '{ name, elements } adds a template' },
					{ method: 'PUT', path: LIBRARY_PATH, purpose: '{ items } replaces the list (the board app does this when a person edits it)' },
					{ method: 'DELETE', path: `${LIBRARY_PATH}/<id>`, purpose: 'drop one template' }
				]
			},
			board: {
				elements: 'array of Excalidraw elements',
				appState: 'object; only viewBackgroundColor, gridSize, scrollX, scrollY and zoom are kept'
			},
			elementSkeleton: {
				note: 'Plain skeletons are accepted: the board converts them with Excalidraw itself on load and stores the canonical form.',
				examples: [
					{ type: 'rectangle', x: 100, y: 100, width: 200, height: 120, backgroundColor: '#a5d8ff', strokeColor: '#1971c2' },
					{ type: 'ellipse', x: 340, y: 100, width: 120, height: 120, backgroundColor: '#ffec99' },
					{ type: 'diamond', x: 500, y: 100, width: 120, height: 120, strokeColor: '#1971c2' },
					{ type: 'line', x: 100, y: 300, points: [[0, 0], [120, 80]], strokeColor: '#1e1e1e', strokeWidth: 2 },
					{ type: 'text', x: 100, y: 400, text: 'hello', fontSize: 20 }
				],
				avoid: 'Do not send type "arrow": Excalidraw\'s converter mangles arrow skeletons (they come back as slivers). Use a line plus two short lines for the head.'
			},
			endpoints: [
				{ method: 'GET', path: MANIFEST_PATH, purpose: 'this description' },
				{ method: 'GET', path: BOARDS_PATH, purpose: 'every board, newest first' },
				{ method: 'GET', path: `${BOARDS_PREFIX}<sessionId>`, purpose: "read one chat's scene" },
				{ method: 'PUT', path: `${BOARDS_PREFIX}<sessionId>`, purpose: '{ elements, appState } replaces the scene; skeletons are normalized on load' },
				{ method: 'DELETE', path: `${BOARDS_PREFIX}<sessionId>`, purpose: 'forget this chat\'s board entirely (a board can also just be emptied with PUT)' },
				{ method: 'GET', path: `${BASE_PATH}/board.html?session=<sessionId>`, purpose: 'the board page the sidebar tab embeds' }
			],
			notes: [
				'Every route here is open to any caller, the AI included: there is no human-only operation on a board.',
				"Writes bump `updatedAt`; an open tab polls it and pulls the newer scene in, so an agent's strokes appear without a reload.",
				"A tab only saves real edits (element versions), so it never overwrites an agent's work with an idle copy."
			]
		});
	};

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
				sendJson(res, 200, {
					ok: true,
					sessionId,
					board: store.get(sessionId),
					// Cheap signal for the open tab: fetch the library only when it moved.
					libraryRevision: store.libraryRevision()
				});
				return;
			}
			if (req.method === 'DELETE') {
				const removed = await store.delete(sessionId);
				sendJson(res, 200, { ok: true, sessionId, deleted: removed });
				return;
			}
			if (req.method !== 'PUT') {
				res.writeHead(405, { allow: 'GET, HEAD, PUT, DELETE' });
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
			if (pathname === MANIFEST_PATH) return manifestHandler(req, res);
			if (pathname === LIBRARY_PATH || pathname.startsWith(`${LIBRARY_PATH}/`)) return libraryHandler(req, res);
			if (pathname === BOARDS_PATH) return boardsIndexHandler(req, res);
			if (pathname.startsWith(BOARDS_PREFIX)) return boardsHandler(req, res);
			return staticHandler(req, res);
		}
	}), 'excalidraw: board route');

	registerTools(ctx, { store, toolCatalog });
}


/** Rounded coordinate, `0` for anything unset. */
const round = (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0);

/** Bounding box of the whole drawing, as `x,y → x2,y2`. */
function boardFrame(elements) {
	const xs = [];
	const ys = [];
	for (const el of elements) {
		const x = round(el.x);
		const	y = round(el.y);
		xs.push(x, x + round(el.width));
		ys.push(y, y + round(el.height));
	}
	return `${Math.min(...xs)},${Math.min(...ys)} → ${Math.max(...xs)},${Math.max(...ys)}`;
}

/**
 * The board as one short line per element.
 *
 * Excalidraw's canonical JSON repeats about twenty bookkeeping fields per
 * element (seed, versionNonce, updated, index, boundElements, roundness …), so
 * a small sketch serialises to ~17 kB. That is fine once, but the tool result
 * stays in the conversation, so every later request pays for it again — on a
 * 114-step session one board read costs more than a ruble.
 *
 * Only what a person would read off the drawing is printed: what kind of thing
 * it is, where, how big, its text, and the bits that matter for writing back
 * (id, container, group, fill, point count). Deleted elements are dropped.
 *
 * @param board - `{ sessionId, updatedAt, elements }`.
 * @returns the model-facing text.
 */
export function renderBoardLines(board) {
	const all = Array.isArray(board.elements) ? board.elements : [];
	const live = all.filter((el) => el !== null && typeof el === 'object' && el.isDeleted !== true);
	const hidden = all.length - live.length;
	const header = [
		`Board ${board.sessionId} · ${live.length} element(s)`,
		hidden > 0 ? `${hidden} deleted hidden` : '',
		live.length > 0 ? `frame ${boardFrame(live)}` : '',
	].filter(Boolean).join(' · ');
	const lines = [header];
	for (let index = 0; index < live.length; index += 1) {
		const el = live[index];
		const parts = [
			String(index + 1).padStart(2, ' '),
			String(el.type ?? '?').padEnd(9, ' '),
			`${round(el.x)},${round(el.y)}`,
			`${round(el.width)}x${round(el.height)}`,
		];
		const label = typeof el.text === 'string' ? el.text.trim().replace(/\s*\n\s*/g, ' / ') : '';
		if (label !== '') parts.push(label);
		if (typeof el.id === 'string' && el.id !== '') parts.push(`id=${el.id}`);
		if (typeof el.containerId === 'string' && el.containerId !== '') parts.push(`in=${el.containerId}`);
		if (Array.isArray(el.points) && el.points.length > 0) parts.push(`pts=${el.points.length}`);
		if (Array.isArray(el.groupIds) && el.groupIds.length > 0) parts.push('grp');
		if (typeof el.backgroundColor === 'string' && el.backgroundColor !== 'transparent') parts.push(`fill=${el.backgroundColor}`);
		if (typeof el.strokeColor === 'string' && el.strokeColor !== '#1e1e1e') parts.push(`stroke=${el.strokeColor}`);
		if (typeof el.link === 'string' && el.link !== '') parts.push(`link=${el.link}`);
		if (el.locked === true) parts.push('locked');
		lines.push(parts.join(' '));
	}
	// A pathological board still must not flood the context: 600 lines is
	// already far more than anyone reads, and the JSON format can be asked for.
	const MAX_LINES = 600;
	if (lines.length > MAX_LINES + 1) {
		return [...lines.slice(0, MAX_LINES + 1), `… ${lines.length - MAX_LINES - 1} more element(s); pass format: 'json' for everything`].join('\n');
	}
	return lines.join('\n');
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
	const { store, toolCatalog = [] } = deps;
	/** One text block. */
	const text = (value) => [{ type: 'text', text: value }];
	/**
	 * Which board a call means: the calling chat by default.
	 *
	 * A model never has to know its own session id — `exec.agent.session.id` is
	 * the chat it is answering in, and its board is that chat's board.
	 */
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

	/** Every declared tool, published to the manifest and registered at the end. */
	const definitions = [];
	/** Declare one tool. */
	const register = (definition) => {
		definitions.push(definition);
	};

		register({
			name: 'excalidraw_read',
			description: 'Read this chat\'s Excalidraw board: one line per element with its type, position, size, text and the ids needed to edit it; deleted elements are hidden. Pass format: \'json\' for the full canonical element JSON. Reading never changes the board.',
			parameters: {
				sessionId: { type: 'string', description: 'Optional: another chat\'s board. Defaults to the calling chat.' },
				format: { type: 'string', enum: ['lines', 'json'], description: '`lines` (default) is a compact one-line-per-element view; `json` returns every canonical element with all its fields.' }
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
				render: (args, value) => {
					if (args?.format === 'json') {
						const scene = JSON.stringify(value.elements);
						const trimmed = scene.length > 40000 ? `${scene.slice(0, 40000)}… (truncated)` : scene;
						return text(`Board for chat ${value.sessionId} (updated ${new Date(value.updatedAt).toISOString()}): ${value.elements.length} element(s)\n${trimmed}`);
					}
					return text(renderBoardLines(value));
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


	register({
		name: 'excalidraw_library',
		description: 'List the shared Excalidraw library: templates (shapes, whole scenes) available on every chat\'s board, with their ids, names and element counts. Pass an id to read one template\'s elements in full, ready to reuse with excalidraw_write.',
		parameters: {
			id: { type: 'string', description: 'Optional template id: returns that template\'s elements instead of the summary list.' }
		},
		output: {
			schema: {
				type: 'object',
				additionalProperties: false,
				required: ['items'],
				properties: {
					items: {
						type: 'array',
						items: {
							type: 'object',
							additionalProperties: false,
							required: ['id', 'name', 'elementsCount'],
							properties: {
								id: { type: 'string' },
								name: { type: 'string' },
								elementsCount: { type: 'integer' },
								created: { type: 'number' },
								elements: { type: 'array', items: elementShape }
							}
						}
					}
				}
			},
			render: (_args, value) => text(value.items.length === 0
				? 'The shared library is empty.'
				: value.items.map((item) => `${item.id} | ${item.name} | ${item.elementsCount} element(s)${item.elements === undefined ? '' : `\n${JSON.stringify(item.elements)}`}`).join('\n'))
		},
		async execute(args) {
			const items = store.libraryItems();
			if (typeof args.id === 'string' && args.id !== '') {
				const found = items.find((item) => item.id === args.id);
				if (found === undefined) throw new Error(`no library template "${args.id}"`);
				return {
					items: [{
						id: found.id,
						name: found.name,
						elementsCount: found.elements.length,
						created: found.created,
						elements: found.elements
					}]
				};
			}
			return {
				items: items.map((item) => ({ id: item.id, name: item.name, elementsCount: item.elements.length, created: item.created }))
			};
		}
	});

	register({
		name: 'excalidraw_library_add',
		description: 'Add a template to the shared Excalidraw library, so it is available on every chat\'s board (and to other agents). Elements are plain skeletons exactly like excalidraw_write takes; the board converts them with Excalidraw itself when it loads them.',
		parameters: {
			name: { type: 'string', required: true, description: 'Short name shown in the library panel.' },
			elements: { type: 'array', required: true, description: 'The template: element skeletons (type, x, y, width, height, colors, points…).', items: elementShape }
		},
		output: {
			schema: {
				type: 'object',
				additionalProperties: false,
				required: ['id', 'name', 'elementsCount', 'libraryCount'],
				properties: {
					id: { type: 'string' },
					name: { type: 'string' },
					elementsCount: { type: 'integer' },
					libraryCount: { type: 'integer' }
				}
			},
			render: (_args, value) => text(`Added library template ${value.id} ("${value.name}") with ${value.elementsCount} element(s); the library now holds ${value.libraryCount}.`)
		},
		async execute(args) {
			if (!Array.isArray(args.elements) || args.elements.length === 0) throw new Error('a template needs at least one element');
			const item = await store.libraryAdd({ name: args.name, elements: args.elements });
			return {
				id: item.id,
				name: item.name,
				elementsCount: item.elements.length,
				libraryCount: store.libraryItems().length
			};
		}
	});

	/*
	 * Publish first, then hand the list to the registry.
	 *
	 * A composition with no tool runtime never runs the registration below, and
	 * such a deployment is exactly who the manifest route serves — so the catalog
	 * is filled from the declarations, not from what registered. A definition the
	 * registry rejects is logged rather than thrown: one bad tool must cost one
	 * tool, never all of them.
	 */
	for (const definition of definitions) {
		toolCatalog.push({ name: definition.name, description: definition.description, parameters: definition.parameters ?? {} });
	}
	ctx.inject(['tools'], (toolCtx) => {
		for (const definition of definitions) {
			try {
				toolCtx.tools.register(definition);
			} catch (error) {
				toolCtx.logger?.warn?.(`excalidraw: tool "${definition.name}" was not registered: ${String(error?.message ?? error)}`);
			}
		}
	});
}
