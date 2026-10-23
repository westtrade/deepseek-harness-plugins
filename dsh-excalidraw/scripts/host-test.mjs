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
import { apply } from '../lib/index.js';

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
	ok('two AI tools registered', host.tools.size === 2, [...host.tools.keys()].join(','));
	for (const toolName of ['excalidraw_read', 'excalidraw_write']) {
		ok(`tool ${toolName} present`, host.tools.has(toolName));
	}
	ok('board route effect registered', host.effects.includes('excalidraw: board route'));

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
	const noSession = await callBoard('GET', '/api/excalidraw/boards/');
	ok('boards require a session id', noSession.status === 400, String(noSession.status));

	// --- the static board app ---
	const app = await callBoard('GET', '/api/excalidraw/board.html');
	ok('board.html serves', app.status === 200 && app.headers['content-type'].startsWith('text/html') && app.raw.includes('excalidraw-host'), `${app.status} ${app.headers['content-type']}`);
	const bundle = await callBoard('GET', '/api/excalidraw/board-app.js');
	ok('board app bundle serves', bundle.status === 200 && bundle.headers['content-type'].startsWith('text/javascript') && bundle.raw.includes('excalidraw-host'));
	const asset = await callBoard('GET', '/api/excalidraw/assets/index.js');
	ok('the Excalidraw prod build serves', asset.status === 200 && asset.headers['content-type'].startsWith('text/javascript') && asset.raw.length > 100000, `${asset.status} ${asset.raw?.length ?? 0}`);
	const css = await callBoard('GET', '/api/excalidraw/assets/index.css');
	ok('the Excalidraw styles serve', css.status === 200 && css.headers['content-type'].startsWith('text/css'));
	for (const [path, type] of [
		['/api/excalidraw/vendor/react.mjs', 'text/javascript'],
		['/api/excalidraw/vendor/react-dom.mjs', 'text/javascript'],
		['/api/excalidraw/vendor/react-dom-client.mjs', 'text/javascript'],
		['/api/excalidraw/vendor/jsx-runtime.mjs', 'text/javascript']
	]) {
		const vendor = await callBoard('GET', path);
		ok(`${path} serves`, vendor.status === 200 && vendor.headers['content-type'].startsWith(type) && vendor.raw.length > 1000, `${vendor.status} ${vendor.raw?.length ?? 0}`);
	}
	ok('board.html has the import map for React', app.raw.includes('"react": "/api/excalidraw/vendor/react.mjs"') && app.raw.includes('"react-dom/client"'));
	ok('board.html maps Excalidraw to the asset tree', app.raw.includes('"excalidraw-host": "/api/excalidraw/assets/index.js"'));
	ok('static answers revalidate', app.headers['cache-control'] === 'no-cache', String(app.headers['cache-control']));
	const font = await callBoard('GET', '/api/excalidraw/assets/fonts/Virgil/Virgil-Regular.woff2');
	ok('a font serves', font.status === 200 && font.headers['content-type'] === 'font/woff2', `${font.status} ${font.headers['content-type']}`);
	const missing = await callBoard('GET', '/api/excalidraw/assets/nope.js');
	ok('an unknown asset is a 404', missing.status === 404, String(missing.status));
	// Dot segments are normalized away by the URL parser and can never reach a
	// file outside the static tree; the result must be a denial (403/404), never
	// the plugin source.
	const traversal = await callBoard('GET', '/api/excalidraw/assets/%2e%2e/%2e%2e/lib/index.js');
	ok('path traversal is refused', (traversal.status === 403 || traversal.status === 404) && !traversal.raw.includes('registerTools'), `${traversal.status}`);

	// --- the AI tools ---
	const signal = () => ({ signal: new AbortController().signal, agent: { session: { id: 'session-alpha' } } });
	const readTool = host.tools.get('excalidraw_read');
	const readValue = await readTool.execute({}, signal());
	ok('excalidraw_read defaults to the calling chat', readValue.sessionId === 'session-alpha');
	ok('excalidraw_read returns the drawn elements', readValue.elements.length === 2 && readValue.elements[1].text === 'привет');
	ok('excalidraw_read renders for the model', readTool.output.render({}, readValue)[0].text.includes('2 element(s)'));
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
	const invalidUpsert = await writeTool.execute({ upsert: [null] }, signal()).then(() => undefined, (error) => error);
	ok('a malformed upsert entry is refused', invalidUpsert instanceof Error, String(invalidUpsert?.message));
} finally {
	await rm(dir, { recursive: true, force: true });
}

console.log(`host: pass=${pass} fail=${fail}`);
if (fail > 0) process.exit(1);
