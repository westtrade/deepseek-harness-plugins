/**
 * Host-side self-test for dsh-excalidraw.
 *
 * Runs the real plugin against a fake host context (fake Web server and tool
 * registry) with a temporary store file. It asserts the board API, the static
 * board app (including traversal denial), the model-facing tools, and that
 * every tool output satisfies its declared schema — the same registry contract
 * the harness enforces.
 *
 * @module dsh-excalidraw/scripts/host-test
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
import { apply, renderBoardLines } from '../lib/index.js';

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

/**
 * The tool-definition rules the real registry enforces (mirrored from
 * `@deepseek-ai/dsh-tools`): `required` is an array on object nodes, never
 * `required: true` on a property, and only the supported keywords are allowed.
 */
const SCHEMA_KEYWORDS = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title']);
const SCHEMA_TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];

function assertToolSchema(schema, at = 'schema') {
	if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`${at} must be a schema object`);
	for (const key of Object.keys(schema)) {
		if (!SCHEMA_KEYWORDS.has(key)) throw new Error(`${at}.${key} is not a supported keyword`);
	}
	if (typeof schema.type !== 'string' || !SCHEMA_TYPES.includes(schema.type)) throw new Error(`${at}.type must be one of ${SCHEMA_TYPES.join('/')}`);
	if (Object.hasOwn(schema, 'required')) {
		if (schema.type !== 'object') throw new Error(`${at}.required is not supported on type "${schema.type}"`);
		if (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== 'string')) throw new Error(`${at}.required must be an array of property names`);
	}
	for (const [name, child] of Object.entries(schema.properties ?? {})) assertToolSchema(child, `${at}.properties.${name}`);
	if (Object.hasOwn(schema, 'items')) assertToolSchema(schema.items, `${at}.items`);
}

function assertToolValue(schema, value, at = 'value') {
	const typeOf = (entry) => entry === null ? 'null' : Array.isArray(entry) ? 'array' : Number.isInteger(entry) ? 'integer' : typeof entry;
	const matches = (entry) => typeOf(entry) === schema.type || (schema.type === 'number' && typeOf(entry) === 'integer');
	if (!matches(value)) throw new Error(`${at} must be ${schema.type}, got ${typeOf(value)}`);
	if (Object.hasOwn(schema, 'enum') && !schema.enum.includes(value)) throw new Error(`${at} must be one of ${JSON.stringify(schema.enum)}`);
	if (schema.type === 'object') {
		for (const name of schema.required ?? []) if (!Object.hasOwn(value, name)) throw new Error(`${at}.${name} is required`);
		for (const [name, entry] of Object.entries(value)) {
			const child = schema.properties?.[name];
			if (child === undefined) {
				if (schema.additionalProperties === false) throw new Error(`${at}.${name} is not declared in the output schema`);
				continue;
			}
			assertToolValue(child, entry, `${at}.${name}`);
		}
	}
	if (schema.type === 'array' && schema.items !== undefined) value.forEach((entry, index) => assertToolValue(schema.items, entry, `${at}[${index}]`));
}

/** A fake host context recording every registration. */
function fakeContext() {
	const effects = [];
	const routes = new Map();
	const tools = new Map();
	const logs = [];
	const ctx = {
		logger: {
			info: (message) => logs.push(['info', String(message)]),
			warn: (message) => logs.push(['warn', String(message)]),
			error: (message) => logs.push(['error', String(message)])
		},
		effect(factory, label) {
			effects.push(label);
			const disposer = factory();
			return disposer;
		},
		inject(names, callback) {
			ok(`inject declares the tools service (${names.join(',')})`, names.includes('tools'));
			callback(ctx);
		},
		webServer: {
			register(route) {
				routes.set(`${route.kind}:${route.path}`, route);
				return () => routes.delete(`${route.kind}:${route.path}`);
			}
		},
		tools: {
			register(definition) {
				// Same contract as the real registry: schema subset + output check.
				assertToolSchema(definition.output?.schema, `${definition.name}.output.schema`);
				tools.set(definition.name, {
					...definition,
					async execute(args, exec) {
						const value = await definition.execute(args, exec);
						assertToolValue(definition.output.schema, JSON.parse(JSON.stringify(value)), `${definition.name} output`);
						return value;
					}
				});
				return () => tools.delete(definition.name);
			}
		}
	};
	return { ctx, routes, tools, effects, logs };
}

/** A minimal request/response pair over one handler call. */
async function call(handler, method, url, body) {
	const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
	const req = {
		method,
		url,
		headers: {},
		async *[Symbol.asyncIterator]() {
			for (const chunk of chunks) yield chunk;
		},
		resume() {}
	};
	let status = 0;
	let payload = '';
	const headers = {};
	const res = {
		writeHead(code, extra) {
			status = code;
			Object.assign(headers, extra ?? {});
		},
		setHeader(key, value) {
			headers[key] = value;
		},
		end(text) {
			if (Buffer.isBuffer(text)) payload = text.toString('utf8');
			else if (typeof text === 'string') payload = text;
		}
	};
	await handler(req, res);
	let parsed;
	try {
		parsed = payload === '' ? undefined : JSON.parse(payload);
	} catch {
		parsed = payload;
	}
	return { status, body: parsed, headers, raw: payload };
}

const dir = await mkdtemp(path.join(tmpdir(), 'excalidraw-test-'));
const storePath = path.join(dir, 'boards.json');
try {
	const host = fakeContext();
	await apply(host.ctx, { storePath });

	// --- wiring ---
	ok('board route registered', host.routes.has('prefix:/api/excalidraw'), [...host.routes.keys()].join(' '));
	ok('four AI tools registered', host.tools.size === 4, [...host.tools.keys()].join(','));
	for (const toolName of ['excalidraw_read', 'excalidraw_write', 'excalidraw_library', 'excalidraw_library_add']) {
		ok(`tool ${toolName} present`, host.tools.has(toolName));
	}
	ok('board route effect registered', host.effects.includes('excalidraw: board route'));

	// --- discovery routes: how a caller finds its own board ---
	const route = host.routes.get('prefix:/api/excalidraw');
	const callBoard = (method, url, body) => call(route.handler, method, url, body);

	// --- the board API ---
	const empty = await callBoard('GET', '/api/excalidraw/boards/session-alpha');
	ok('a fresh chat has an empty board', empty.status === 200 && Array.isArray(empty.body.board.elements) && empty.body.board.elements.length === 0, JSON.stringify(empty.body).slice(0, 160));

	const scene = {
		elements: [
			{ id: 'rect-1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50 },
			{ id: 'text-1', type: 'text', x: 5, y: 5, text: 'привет' }
		],
		appState: { viewBackgroundColor: '#fff' }
	};
	const saved = await callBoard('PUT', '/api/excalidraw/boards/session-alpha', scene);
	ok('a chat can save its board', saved.status === 200 && saved.body.board.elements.length === 2, JSON.stringify(saved.body).slice(0, 160));
	ok('the scene round-trips', saved.body.board.elements[0].id === 'rect-1' && saved.body.board.appState.viewBackgroundColor === '#fff');
	ok('the board persisted to disk', JSON.parse(await readFile(storePath, 'utf8')).boards['session-alpha'].elements.length === 2);

	const reread = await callBoard('GET', '/api/excalidraw/boards/session-alpha');
	ok('the board reads back', reread.body.board.elements.length === 2 && reread.body.board.elements[1].text === 'привет');
	ok('boards are per chat', (await callBoard('GET', '/api/excalidraw/boards/session-beta')).body.board.elements.length === 0);

	const badMethod = await callBoard('POST', '/api/excalidraw/boards/session-alpha', scene);
	ok('boards reject other methods', badMethod.status === 405, String(badMethod.status));

	// A board can be forgotten, not only emptied: the listing route is how a
	// caller finds one by hand, so test runs must not leave entries behind.
	await callBoard('PUT', '/api/excalidraw/boards/session-doomed', scene);
	ok('the listing shows the doomed board', (await callBoard('GET', '/api/excalidraw/boards')).body.boards.some((entry) => entry.sessionId === 'session-doomed'));
	const removedBoard = await callBoard('DELETE', '/api/excalidraw/boards/session-doomed');
	ok('a board can be deleted', removedBoard.status === 200 && removedBoard.body.deleted === true, JSON.stringify(removedBoard.body));
	ok('a deleted board is gone from the listing', !(await callBoard('GET', '/api/excalidraw/boards')).body.boards.some((entry) => entry.sessionId === 'session-doomed'));
	ok('a deleted board reads back empty', (await callBoard('GET', '/api/excalidraw/boards/session-doomed')).body.board.elements.length === 0);
	const removedAgain = await callBoard('DELETE', '/api/excalidraw/boards/session-doomed');
	ok('deleting twice is honest about it', removedAgain.body.deleted === false);
	const noSession = await callBoard('GET', '/api/excalidraw/boards/');
	ok('boards require a session id', noSession.status === 400, String(noSession.status));

	// --- the static board app ---
	const app = await callBoard('GET', '/api/excalidraw/board.html');
	ok('board.html serves', app.status === 200 && app.headers['content-type'].startsWith('text/html'), `${app.status} ${app.headers['content-type']}`);
	ok('board.html loads the bundled app', app.raw.includes('/api/excalidraw/app/main.js'));
	// Without the stylesheet the wrapper has no height, the canvas grows to a
	// nonsense size and the board draws nothing (it looked blank for a while).
	ok('board.html links the Excalidraw stylesheet', app.raw.includes('/api/excalidraw/app/excalidraw.css'));
	ok('board.html gives the board wrapper a height', /\.ex-root\s*\{[^}]*height:\s*100%/.test(app.raw));
	ok('board.html points Excalidraw at the asset tree', app.raw.includes('EXCALIDRAW_ASSET_PATH = "/api/excalidraw/assets/"'));
	// The page installs its error hook before the module graph, so a bundle that
	// fails to load says so instead of sitting on "Loading…" (which it once did).
	ok('board.html installs the error hook before the bundle', app.raw.indexOf('__boardStatus') < app.raw.indexOf('/api/excalidraw/app/main.js'));
	ok('static answers revalidate', app.headers['cache-control'] === 'no-cache', String(app.headers['cache-control']));

	const entry = await callBoard('GET', '/api/excalidraw/app/main.js');
	ok('the bundled entry serves', entry.status === 200 && entry.headers['content-type'].startsWith('text/javascript') && entry.raw.length > 200000, `${entry.status} ${entry.raw?.length ?? 0}`);
	// Self-contained: everything Excalidraw imports from npm is in the bundle, so
	// no bare specifier may survive (the browser has no way to resolve one).
	ok('the bundle carries Excalidraw', entry.raw.includes('Excalidraw'));
	// Only real import statements matter: the bundle also carries prose that
	// mentions a package name (zustand's deprecation warning, for one).
	const bareSpecifiers = [...entry.raw.matchAll(/(?:^|[;}])\s*import\s*(?:[^"'\`]*?from\s*)?"([^"]+)"/g)]
		.map((match) => match[1])
		.filter((specifier) => !specifier.startsWith('.') && !specifier.startsWith('/'));
	ok('the bundle carries no bare imports', bareSpecifiers.length === 0, bareSpecifiers.slice(0, 5).join(','));
	ok('the bundle is a production build', !entry.raw.includes('jsxDEV') && !entry.raw.includes('__DEV__'));

	// A chunk from the split graph (locales/mermaid) must resolve from the same tree.
	const { readdir } = await import('node:fs/promises');
	const appDir = path.join(here, '..', 'static', 'app');
	const chunkName = (await readdir(appDir)).find((name) => name.startsWith('main-') && name.endsWith('.js'));
	const chunk = await callBoard('GET', `/api/excalidraw/app/${chunkName}`);
	ok('a split chunk serves', chunk.status === 200 && chunk.headers['content-type'].startsWith('text/javascript'), `${chunk.status} ${chunkName}`);

	const stylesheet = await callBoard('GET', '/api/excalidraw/app/excalidraw.css');
	ok('the stylesheet serves', stylesheet.status === 200 && stylesheet.headers['content-type'].startsWith('text/css') && stylesheet.raw.includes('.excalidraw'), `${stylesheet.status} ${stylesheet.raw?.length ?? 0}`);

	const font = await callBoard('GET', '/api/excalidraw/assets/fonts/Virgil/Virgil-Regular.woff2');
	ok('a font serves', font.status === 200 && font.headers['content-type'] === 'font/woff2', `${font.status} ${font.headers['content-type']}`);
	const missing = await callBoard('GET', '/api/excalidraw/assets/nope.js');
	ok('an unknown asset is a 404', missing.status === 404, String(missing.status));
	// Dot segments are normalized away by the URL parser and can never reach a
	// file outside the static tree; the result must be a denial (403/404), never
	// the plugin source.
	const traversal = await callBoard('GET', '/api/excalidraw/assets/%2e%2e/%2e%2e/lib/index.js');
	ok('path traversal is refused', (traversal.status === 403 || traversal.status === 404) && !traversal.raw.includes('registerTools'), `${traversal.status}`);

	// --- the manifest: everything an agent needs, in one request ---
	const manifest = await callBoard('GET', '/api/excalidraw/manifest');
	ok('the manifest serves', manifest.status === 200, String(manifest.status));
	ok('the manifest lists every tool', Array.isArray(manifest.body.tools) && manifest.body.tools.length === 4, JSON.stringify(manifest.body.tools?.map((tool) => tool.name)));
	ok('the manifest tools carry descriptions', manifest.body.tools.every((tool) => typeof tool.description === 'string' && tool.description.length > 40));
	ok('the manifest says how to find your board', typeof manifest.body.findingYourBoard?.fromTheTools === 'string' && manifest.body.findingYourBoard.fromTheShell.includes('$DSH_SESSION_ID'));
	ok('the manifest documents the board listing route', manifest.body.findingYourBoard.byListing.includes('/api/excalidraw/boards'));
	ok('the manifest lists the endpoints', Array.isArray(manifest.body.endpoints) && manifest.body.endpoints.length >= 4);
	ok('the manifest offers element skeletons', Array.isArray(manifest.body.elementSkeleton?.examples) && manifest.body.elementSkeleton.examples.length >= 4);
	ok('the manifest warns about arrow skeletons', manifest.body.elementSkeleton.avoid.includes('arrow'), String(manifest.body.elementSkeleton.avoid));
	const manifestWrite = await callBoard('POST', '/api/excalidraw/manifest', {});
	ok('the manifest rejects writes', manifestWrite.status === 405, String(manifestWrite.status));
	ok('the manifest needs no session cookie', manifest.headers['content-type']?.startsWith('application/json') === true);

	// --- listing boards: find one without knowing a session id ---
	const listing = await callBoard('GET', '/api/excalidraw/boards');
	ok('the board listing serves', listing.status === 200 && Array.isArray(listing.body.boards), JSON.stringify(listing.body).slice(0, 120));
	ok('the listing names the boards that exist', listing.body.boards.some((entry) => entry.sessionId === 'session-alpha'), JSON.stringify(listing.body.boards));
	ok('the listing carries a timestamp and a size', listing.body.boards.every((entry) => typeof entry.updatedAt === 'number' && typeof entry.elements === 'number'));
	ok('the listing is newest first', listing.body.boards[0].updatedAt >= listing.body.boards[listing.body.boards.length - 1].updatedAt);

	// --- the shared library: one list for every chat's board ---
	const library = await callBoard('GET', '/api/excalidraw/library');
	ok('the library starts empty', library.status === 200 && Array.isArray(library.body.items) && library.body.items.length === 0, JSON.stringify(library.body).slice(0, 120));
	const addedTemplate = await callBoard('POST', '/api/excalidraw/library', {
		name: 'Домик',
		elements: [{ type: 'rectangle', x: 0, y: 0, width: 80, height: 60 }, { type: 'text', x: 8, y: 16, text: 'дом' }]
	});
	ok('a template can be added', addedTemplate.status === 201 && typeof addedTemplate.body.item.id === 'string', JSON.stringify(addedTemplate.body).slice(0, 160));
	ok('the template keeps its name and elements', addedTemplate.body.item.name === 'Домик' && addedTemplate.body.item.elements.length === 2);
	ok('the template is published by default', addedTemplate.body.item.status === 'published');
	ok('adding bumps the revision', addedTemplate.body.revision > 0);
	const afterAdd = await callBoard('GET', '/api/excalidraw/library');
	ok('the library lists the template', afterAdd.body.items.length === 1 && afterAdd.body.items[0].id === addedTemplate.body.item.id);
	ok('the board answer carries the library revision', (await callBoard('GET', '/api/excalidraw/boards/session-alpha')).body.libraryRevision === afterAdd.body.revision);
	const second = await callBoard('POST', '/api/excalidraw/library', { name: 'Круг', elements: [{ type: 'ellipse', x: 0, y: 0, width: 50, height: 50 }] });
	ok('the library holds both templates', (await callBoard('GET', '/api/excalidraw/library')).body.items.length === 2);
	const libraryReplaced = await callBoard('PUT', '/api/excalidraw/library', { items: [{ id: second.body.item.id, name: 'Круг (новый)', elements: second.body.item.elements }] });
	ok('the library can be replaced wholesale', libraryReplaced.status === 200 && libraryReplaced.body.items.length === 1 && libraryReplaced.body.items[0].name === 'Круг (новый)', JSON.stringify(libraryReplaced.body.items?.map((item) => item.name)));
	const removedTemplate = await callBoard('DELETE', `/api/excalidraw/library/${encodeURIComponent(second.body.item.id)}`);
	ok('a template can be deleted', removedTemplate.status === 200 && removedTemplate.body.deleted === true);
	ok('the library is empty again', (await callBoard('GET', '/api/excalidraw/library')).body.items.length === 0);
	const badLibraryMethod = await callBoard('PATCH', '/api/excalidraw/library', {});
	ok('the library rejects unknown methods', badLibraryMethod.status === 405, String(badLibraryMethod.status));

	// --- the AI tools ---
	const signal = () => ({ signal: new AbortController().signal, agent: { session: { id: 'session-alpha' } } });
	const readTool = host.tools.get('excalidraw_read');
	const readValue = await readTool.execute({}, signal());
	ok('excalidraw_read defaults to the calling chat', readValue.sessionId === 'session-alpha');
	ok('excalidraw_read returns the drawn elements', readValue.elements.length === 2 && readValue.elements[1].text === 'привет');
	ok('excalidraw_read renders for the model', readTool.output.render({}, readValue)[0].text.includes('2 element(s)'));
	const linesView = readTool.output.render({}, readValue)[0].text;
	ok('the default view is one short line per element', /\.{0,4}1 rectangle/.test(linesView) || linesView.split('\n')[1].trim().startsWith('1 '), linesView);
	ok('the compact view keeps ids and drops bookkeeping fields', linesView.includes('id=') && !linesView.includes('versionNonce') && !linesView.includes('seed'));
	ok('deleted elements are hidden from the compact view', renderBoardLines({ sessionId: 'session-alpha', elements: [...readValue.elements, { id: 'gone', type: 'rectangle', x: 0, y: 0, width: 1, height: 1, isDeleted: true }] }).includes('1 deleted hidden'));
	ok('format json still returns the canonical elements', readTool.output.render({ format: 'json' }, readValue)[0].text.includes('"type"'));
	const readOther = await readTool.execute({ sessionId: 'session-beta' }, signal());
	ok('excalidraw_read accepts an explicit session', readOther.sessionId === 'session-beta' && readOther.elements.length === 0);
	const readNoSession = await readTool.execute({}, { signal: new AbortController().signal }).then(() => undefined, (error) => error);
	ok('a chatless call is refused', readNoSession instanceof Error, String(readNoSession?.message));

	const writeTool = host.tools.get('excalidraw_write');
	const added = await writeTool.execute({
		upsert: [
			{ id: 'rect-2', type: 'rectangle', x: 0, y: 0 },
			{ type: 'ellipse', x: 50, y: 50 }
		]
	}, signal());
	ok('excalidraw_write adds elements', added.added === 2 && added.elementsCount === 4, JSON.stringify(added));
	ok('an idless element gets one', (await readTool.execute({}, signal())).elements.some((entry) => entry.type === 'ellipse' && typeof entry.id === 'string' && entry.id.startsWith('ex-')));
	const replaced = await writeTool.execute({ upsert: [{ id: 'rect-1', type: 'diamond', x: 99 }] }, signal());
	ok('excalidraw_write replaces by id', replaced.updated === 1 && replaced.elementsCount === 4, JSON.stringify(replaced));
	const deleted = await writeTool.execute({ deleteIds: ['rect-1', 'text-1'] }, signal());
	ok('excalidraw_write deletes by id', deleted.deleted === 2 && deleted.elementsCount === 2, JSON.stringify(deleted));
	const cleared = await writeTool.execute({ clear: true }, signal());
	ok('excalidraw_write clears the board', cleared.elementsCount === 0, JSON.stringify(cleared));
	const libraryTool = host.tools.get('excalidraw_library');
	const libraryAddTool = host.tools.get('excalidraw_library_add');
	const emptyLibrary = await libraryTool.execute({}, signal());
	ok('the library tool reports an empty library', Array.isArray(emptyLibrary.items) && emptyLibrary.items.length === 0);
	const addedByTool = await libraryAddTool.execute({ name: 'Танк', elements: [{ type: 'rectangle', x: 0, y: 0, width: 120, height: 60 }] }, signal());
	ok('the AI can add a template', typeof addedByTool.id === 'string' && addedByTool.libraryCount === 1, JSON.stringify(addedByTool));
	const listedByTool = await libraryTool.execute({}, signal());
	ok('the AI sees its template', listedByTool.items.length === 1 && listedByTool.items[0].name === 'Танк' && listedByTool.items[0].elementsCount === 1);
	const readTemplate = await libraryTool.execute({ id: addedByTool.id }, signal());
	ok('the AI can read a template in full', Array.isArray(readTemplate.items[0].elements) && readTemplate.items[0].elements[0].type === 'rectangle');
	const missingTemplate = await libraryTool.execute({ id: 'nope' }, signal()).then(() => undefined, (error) => error);
	ok('an unknown template is refused', missingTemplate instanceof Error);
	const emptyTemplate = await libraryAddTool.execute({ name: 'Пусто', elements: [] }, signal()).then(() => undefined, (error) => error);
	ok('an empty template is refused', emptyTemplate instanceof Error);
	await callBoard('DELETE', `/api/excalidraw/library/${encodeURIComponent(addedByTool.id)}`);

	const invalidUpsert = await writeTool.execute({ upsert: [null] }, signal()).then(() => undefined, (error) => error);
	ok('a malformed upsert entry is refused', invalidUpsert instanceof Error, String(invalidUpsert?.message));
} finally {
	await rm(dir, { recursive: true, force: true });
}

console.log(`host: pass=${pass} fail=${fail}`);
if (fail > 0) process.exit(1);
