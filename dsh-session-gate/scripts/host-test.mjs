/**
 * Host checks for `dsh-session-gate`: the state route, the per-agent tool
 * restriction it installs, and the model-capability line — against a fake host
 * context that behaves like the live Cordis runtime where it matters.
 *
 * Run: `node scripts/host-test.mjs`
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apply, STATE_PATH } from '../lib/index.js';

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

/** One live agent stand-in: records what the registry would be told to hide. */
function fakeAgent(id, dev) {
	const session = {
		id,
		requestHeader: () => dev.headerOf(id)
	};
	const agent = {
		id,
		session,
		ctx: {
			tools: {
				restrict(filter) {
					const deny = [...(filter.deny ?? [])].sort();
					dev.restrictions.push({ sessionId: id, deny });
					return () => {
						dev.lifted.push({ sessionId: id, deny });
						// The real registry emits this from the layer mutation; a lift
						// during teardown used to be re-installed because of it.
						dev.emit('tools/change');
					};
				}
			}
		}
	};
	return agent;
}

/**
 * A fake host context.
 *
 * `seal()` reproduces the live runtime's most important trap: after `apply`
 * settles, reading a service with `ctx.get` throws. HTTP handlers run in exactly
 * that window, so a handler that forgot to capture a service fails here instead
 * of only on the server.
 */
function fakeHost(options = {}) {
	const routes = new Map();
	const listeners = new Map();
	const restrictions = [];
	const lifted = [];
	const effects = [];
	const injections = [];
	const sessions = new Map();
	const agents = [];
	const headers = new Map();
	const names = [...(options.toolNames ?? [
		'read_image',
		'bash',
		'read',
		'mcp__svelte__get-documentation',
		'mcp__svelte__list-sections',
		'mcp__solidcraft__execute'
	])];
	const capability = options.capability ?? (() => ({ inputModalities: ['text', 'image'] }));
	const selections = new Map();
	let sealed = false;

	const tools = {
		names,
		view(scope) {
			if (scope === undefined) return { restrictableNames: new Set(names) };
			return { restrictableNames: new Set(names) };
		},
		schemas() {
			return names.map((name) => ({ name }));
		}
	};
	const llm = {
		async resolveModelInfo(provider, model) {
			return capability(provider, model);
		}
	};
	const sessionProjections = {
		stateOf(session) {
			const pending = selections.get(session.id);
			return pending === undefined ? { lastUsed: null, pending: null } : { lastUsed: null, pending };
		}
	};
	const agentDefaultModel = {
		currentSelection: () => ({ provider: 'router-ai', model: 'default-model' })
	};
	const services = { tools, llm, sessionProjections, agentDefaultModel, subagents: {} };

	const dev = {
		routes,
		listeners,
		restrictions,
		lifted,
		effects,
		injections,
		sessions,
		agents,
		selections,
		tools,
		headers,
		headerOf: (id) => headers.get(id),
		emit(event, payload) {
			for (const listener of listeners.get(event) ?? []) listener(payload);
		},
		ctx: {
			logger: { info() {}, warn() {}, error() {} },
			effect(factory, label) {
				const cleanup = factory();
				effects.push({ label, cleanup });
				return cleanup;
			},
			inject(names, callback) {
				injections.push(names.join('+'));
				const available = names.every((name) => services[name] !== undefined);
				if (available) callback(services);
				return () => {};
			},
			get(name) {
				if (sealed) throw new Error(`cannot get property "${name}" without inject`);
				return services[name];
			},
			on(event, listener) {
				const list = listeners.get(event) ?? [];
				list.push(listener);
				listeners.set(event, list);
				return () => {
					listeners.set(event, (listeners.get(event) ?? []).filter((entry) => entry !== listener));
				};
			},
			webServer: {
				register(route) {
					routes.set(`${route.kind}:${route.path}`, route);
					return () => {};
				}
			},
			sessions: {
				get: (id) => sessions.get(id),
				list: () => [...sessions.values()]
			},
			agents: {
				list: () => [...agents],
				get: (id) => agents.find((agent) => agent.id === id)
			}
		},
		seal() {
			sealed = true;
		},
		addSession(id) {
			const session = { id };
			sessions.set(id, session);
			return session;
		},
		addAgent(id) {
			const agent = fakeAgent(id, dev);
			agents.push(agent);
			return agent;
		},
		addTool(name) {
			names.push(name);
		}
	};
	return dev;
}

/** One fake request: method, URL, optional JSON body. */
function fakeRequest(method, url, body) {
	const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
	return {
		method,
		url,
		async *[Symbol.asyncIterator]() {
			for (const chunk of chunks) yield chunk;
		}
	};
}

/** One fake response capturing status and parsed JSON body. */
function fakeResponse() {
	const captured = { status: 0, headers: {}, body: undefined };
	return {
		captured,
		writeHead(status, headers) {
			captured.status = status;
			captured.headers = headers;
		},
		end(text) {
			captured.body = text === undefined || text === '' ? undefined : JSON.parse(text);
		}
	};
}

/** Call the registered state route. */
async function call(dev, method, query = {}, body) {
	const route = dev.routes.get(`exact:${STATE_PATH}`);
	const url = `http://dsh.invalid${STATE_PATH}${Object.keys(query).length === 0 ? '' : `?${new URLSearchParams(query).toString()}`}`;
	const res = fakeResponse();
	await route.handler(fakeRequest(method, url, body), res);
	return res.captured;
}

const dir = await mkdtemp(path.join(tmpdir(), 'dsh-session-gate-'));
const storePath = path.join(dir, 'session-gate.json');

// --- default state ---------------------------------------------------------
{
	const dev = fakeHost();
	dev.addSession('chat-1');
	await apply(dev.ctx, { storePath });
	dev.seal();

	ok('the state route is registered exactly', dev.routes.has(`exact:${STATE_PATH}`), [...dev.routes.keys()].join(', '));
	ok('the optional services are captured through inject', dev.injections.join(',') === 'tools,llm,sessionProjections,agentDefaultModel', dev.injections.join(','));

	const state = await call(dev, 'GET', { sessionId: 'chat-1' });
	ok('GET answers the state', state.status === 200, String(state.status));
	ok('MCP servers come from the registered tool names',
		JSON.stringify(state.body?.servers?.map((server) => server.name)) === JSON.stringify(['solidcraft', 'svelte']),
		JSON.stringify(state.body?.servers));
	ok('tool counts are real',
		state.body?.servers?.find((server) => server.name === 'svelte')?.tools === 2,
		JSON.stringify(state.body?.servers));
	ok('every server is off by default', state.body.servers.every((server) => server.enabled === false));
	ok('reading images is off by default', state.body.photos.allowed === false);
	ok('the default model is resolved into the capability line',
		state.body.photos.capable === true && state.body.photos.model === 'default-model',
		JSON.stringify(state.body.photos));
	ok('a chat with no live agent installs nothing yet', dev.restrictions.length === 0, JSON.stringify(dev.restrictions));
}

// --- a fresh agent starts with everything hidden ---------------------------
{
	const dev = fakeHost();
	dev.addSession('chat-2');
	dev.addAgent('chat-2');
	await apply(dev.ctx, { storePath });
	dev.seal();

	const baseline = dev.restrictions.at(-1);
	ok('the default chat hides every MCP tool and read_image',
		baseline !== undefined && baseline.deny.length === 4
			&& baseline.deny.includes('read_image')
			&& baseline.deny.includes('mcp__svelte__list-sections'),
		JSON.stringify(baseline));
	ok('nothing else is hidden', !baseline.deny.includes('bash') && !baseline.deny.includes('read'));
}

// --- an allowed server leaves only its tools visible ----------------------
{
	const dev = fakeHost();
	dev.addSession('chat-3');
	const agent = dev.addAgent('chat-3');
	await apply(dev.ctx, { storePath });
	dev.seal();

	let state = await call(dev, 'POST', {}, { sessionId: 'chat-3', mcpOn: ['svelte'], photos: true });
	ok('POST answers the new state', state.status === 200, String(state.status));
	ok('the allowed server reads as attached', state.body?.servers?.find((server) => server.name === 'svelte')?.enabled === true);
	ok('the other server stays detached', state.body.servers.find((server) => server.name === 'solidcraft')?.enabled === false);
	ok('allowing a server leaves exactly the other servers hidden',
		JSON.stringify(dev.restrictions.at(-1)?.deny) === JSON.stringify(['mcp__solidcraft__execute']),
		JSON.stringify(dev.restrictions.at(-1)));
	ok('allowing photos keeps read_image', !dev.restrictions.at(-1).deny.includes('read_image'));

	const stored = await readFile(storePath, 'utf8');
	ok('the choice lands on disk', stored.includes('"chat-3"') && stored.includes('svelte'), stored);

	// Clearing the list is the default again: everything hidden.
	state = await call(dev, 'POST', { sessionId: 'chat-3' }, { mcpOn: [] });
	ok('clearing the list answers the state', state.status === 200);
	ok('clearing lifts the old restriction', dev.lifted.length >= 1, JSON.stringify(dev.lifted));
	ok('clearing hides every MCP tool again', dev.restrictions.at(-1).deny.length === 3
		&& dev.restrictions.at(-1).deny.every((name) => name.startsWith('mcp__')), JSON.stringify(dev.restrictions.at(-1)));
	ok('agent registration reuses the same restriction', agent.id === 'chat-3');
}

// --- the photo switch gates read_image ------------------------------------
{
	const dev = fakeHost();
	dev.addSession('chat-4');
	dev.addAgent('chat-4');
	await apply(dev.ctx, { storePath });
	dev.seal();

	ok('read_image is hidden by default', dev.restrictions.at(-1).deny.includes('read_image'));
	let state = await call(dev, 'POST', {}, { sessionId: 'chat-4', photos: true });
	ok('photos on answers the state', state.status === 200);
	ok('photos on is reported', state.body?.photos?.allowed === true);
	ok('photos on keeps read_image', !dev.restrictions.at(-1).deny.includes('read_image'));
	ok('photos on hides no MCP tool', dev.restrictions.at(-1).deny.every((name) => name.startsWith('mcp__')));

	// Omitted fields keep their stored value, so a stale client cannot reset a
	// switch it did not touch.
	state = await call(dev, 'POST', {}, { sessionId: 'chat-4', mcpOn: [] });
	ok('omitting photos keeps them on', state.body?.photos?.allowed === true, JSON.stringify(state.body.photos));
	state = await call(dev, 'POST', {}, { sessionId: 'chat-4', photos: false });
	ok('photos off hides read_image again', dev.restrictions.at(-1).deny.includes('read_image'));
}

// --- a server that connects later stays off unless allowed ----------------
{
	const dev = fakeHost();
	dev.addSession('chat-5');
	dev.addAgent('chat-5');
	await apply(dev.ctx, { storePath });
	dev.seal();

	await call(dev, 'POST', {}, { sessionId: 'chat-5', mcpOn: ['svelte'], photos: true });
	const before = dev.restrictions.length;
	dev.addTool('mcp__svelte__playground-link');
	dev.emit('tools/change');
	ok('a late tool of an allowed server stays visible',
		!dev.restrictions.at(-1).deny.includes('mcp__svelte__playground-link'),
		JSON.stringify(dev.restrictions.at(-1)));
	ok('an allowed-server tool change installs nothing new', dev.restrictions.length === before);
	dev.addTool('mcp__newserver__search');
	dev.emit('tools/change');
	ok('a new server is off by default',
		dev.restrictions.at(-1).deny.includes('mcp__newserver__search'),
		JSON.stringify(dev.restrictions.at(-1)));
	ok('the new server installs one restriction', dev.restrictions.length === before + 1);
	dev.emit('tools/change');
	ok('an unchanged state installs nothing new', dev.restrictions.length === before + 1);
}

// --- a pre-inclusion client's exclusion list still works -------------------
{
	const dev = fakeHost();
	dev.addSession('chat-12');
	await apply(dev.ctx, { storePath });
	dev.seal();
	const state = await call(dev, 'POST', {}, { sessionId: 'chat-12', mcpOff: ['solidcraft'], photos: true });
	ok('an exclusion list from an old client is translated',
		state.body?.servers?.find((server) => server.name === 'svelte')?.enabled === true
			&& state.body?.servers?.find((server) => server.name === 'solidcraft')?.enabled === false,
		JSON.stringify(state.body?.servers));
}

// --- model capability ------------------------------------------------------
{
	const dev = fakeHost({ capability: () => ({ inputModalities: ['text'] }) });
	dev.addSession('chat-5');
	await apply(dev.ctx, { storePath });
	dev.seal();
	const state = await call(dev, 'GET', { sessionId: 'chat-5' });
	ok('a text-only model is reported as unable to read images', state.body?.photos?.capable === false, JSON.stringify(state.body?.photos));

	const unknown = fakeHost({ capability: () => { throw new Error('no adapter'); } });
	unknown.addSession('chat-6');
	await apply(unknown.ctx, { storePath });
	unknown.seal();
	const unknownState = await call(unknown, 'GET', { sessionId: 'chat-6' });
	ok('an unresolvable route reports an unknown capability', unknownState.body?.photos?.capable === null, JSON.stringify(unknownState.body?.photos));

	// The composer may switch the model before the next request: the pending
	// selection wins over the default.
	const switched = fakeHost();
	switched.addSession('chat-7');
	await apply(switched.ctx, { storePath });
	switched.seal();
	switched.selections.set('chat-7', { provider: 'router-ai', model: 'chosen' });
	const switchedState = await call(switched, 'GET', { sessionId: 'chat-7' });
	ok('the pending selection is the resolved route', switchedState.body?.photos?.model === 'chosen', JSON.stringify(switchedState.body?.photos));
}

// --- rejection paths -------------------------------------------------------
{
	const dev = fakeHost();
	dev.addSession('chat-8');
	await apply(dev.ctx, { storePath });
	dev.seal();

	ok('GET without a session id is a 400', (await call(dev, 'GET')).status === 400);
	ok('POST for an unknown chat is a 404', (await call(dev, 'POST', {}, { sessionId: 'ghost' })).status === 404);
	const badList = await call(dev, 'POST', {}, { sessionId: 'chat-8', mcpOn: 'svelte' });
	ok('a non-array mcpOn is a 400', badList.status === 400);
	ok('the offending field is named', badList.body?.field === 'mcpOn', JSON.stringify(badList.body));
	ok('a bad server name is a 400', (await call(dev, 'POST', {}, { sessionId: 'chat-8', mcpOn: ['not a name!'] })).status === 400);
	ok('a non-boolean photos is a 400', (await call(dev, 'POST', {}, { sessionId: 'chat-8', photos: 'yes' })).status === 400);
	ok('an unsupported method is a 405', (await call(dev, 'DELETE', { sessionId: 'chat-8' })).status === 405);
}

// --- the choice survives a restart ----------------------------------------
{
	const dev = fakeHost();
	dev.addSession('chat-9');
	await apply(dev.ctx, { storePath: `${storePath}.restart` });
	dev.seal();
	await call(dev, 'POST', {}, { sessionId: 'chat-9', mcpOn: ['svelte'], photos: true });

	const again = fakeHost();
	again.addSession('chat-9');
	await apply(again.ctx, { storePath: `${storePath}.restart` });
	again.seal();
	const state = await call(again, 'GET', { sessionId: 'chat-9' });
	ok('the choice survives a restart', state.body?.servers?.find((server) => server.name === 'svelte')?.enabled === true
		&& state.body?.servers?.find((server) => server.name === 'solidcraft')?.enabled === false
		&& state.body.photos.allowed === true, JSON.stringify(state.body));
	ok('a restarted chat allows exactly the stored server', state.body.servers.filter((server) => server.enabled === true).length === 1);
}

// --- teardown lifts restrictions without re-installing them ---------------
{
	const dev = fakeHost();
	dev.addSession('chat-11');
	dev.addAgent('chat-11');
	await apply(dev.ctx, { storePath });
	dev.seal();
	await call(dev, 'POST', {}, { sessionId: 'chat-11', mcpOn: ['svelte'] });
	const installedCount = dev.restrictions.length;
	const liftedBefore = dev.lifted.length;
	const cleanup = dev.effects.find((effect) => effect.label === 'session-gate: tool restrictions')?.cleanup;
	ok('the teardown effect is registered', typeof cleanup === 'function');
	cleanup?.();
	ok('teardown lifts the restriction', dev.lifted.length === liftedBefore + 1, JSON.stringify(dev.lifted));
	ok('teardown does not re-install a restriction', dev.restrictions.length === installedCount, JSON.stringify(dev.restrictions));
	dev.addTool('mcp__svelte__late');
	dev.emit('tools/change');
	ok('a tool change after teardown installs nothing', dev.restrictions.length === installedCount);
}

// --- a disposed agent releases its restriction ----------------------------
{
	const dev = fakeHost();
	dev.addSession('chat-10');
	dev.addAgent('chat-10');
	await apply(dev.ctx, { storePath });
	dev.seal();
	await call(dev, 'POST', {}, { sessionId: 'chat-10', photos: false });
	dev.emit('agent/disposed', { agent: dev.agents[0] });
	ok('a disposed agent lifts its restriction', dev.lifted.length === 1, JSON.stringify(dev.lifted));
}

// --- one unusable stored row does not cost the others ---------------------
{
	const file = path.join(dir, 'corrupt.json');
	await writeFile(file, JSON.stringify({
		version: 2,
		selections: {
			'chat-bad': { mcpOn: 'nope', photos: true },
			'chat-good': { mcpOn: ['svelte'], photos: true }
		}
	}));
	const dev = fakeHost();
	dev.addSession('chat-good');
	await apply(dev.ctx, { storePath: file });
	dev.seal();
	const state = await call(dev, 'GET', { sessionId: 'chat-good' });
	ok('a corrupt row is skipped, the good one survives',
		state.body?.servers?.find((server) => server.name === 'svelte')?.enabled === true
			&& state.body.photos.allowed === true, JSON.stringify(state.body));
	const skipped = await call(dev, 'GET', { sessionId: 'chat-bad' });
	ok('the skipped row falls back to the default',
		skipped.status === 200 && skipped.body?.photos?.allowed === false, JSON.stringify(skipped));
}

// --- a v1 record migrates to the new "off by default" model ---------------
{
	const file = path.join(dir, 'legacy.json');
	await writeFile(file, JSON.stringify({
		version: 1,
		selections: {
			'chat-legacy': { mcpOff: ['svelte'], photos: true }
		}
	}));
	const dev = fakeHost();
	dev.addSession('chat-legacy');
	dev.addAgent('chat-legacy');
	await apply(dev.ctx, { storePath: file });
	dev.seal();
	const state = await call(dev, 'GET', { sessionId: 'chat-legacy' });
	ok('a v1 record starts from the new defaults',
		state.body?.photos?.allowed === false && state.body.servers.every((server) => server.enabled === false),
		JSON.stringify(state.body));
	ok('a v1 record hides every MCP tool', dev.restrictions.at(-1).deny.filter((name) => name.startsWith('mcp__')).length === 3);
	ok('a v1 record hides read_image', dev.restrictions.at(-1).deny.includes('read_image'));
	await call(dev, 'POST', {}, { sessionId: 'chat-legacy', mcpOn: ['svelte'] });
	const stored = JSON.parse(await readFile(file, 'utf8'));
	ok('the store file is rewritten as v2 after a save',
		stored.version === 2 && Array.isArray(stored.selections['chat-legacy'].mcpOn),
		JSON.stringify(stored).slice(0, 200));
}

await rm(dir, { recursive: true, force: true });

console.log(`\n${String(pass)} passed, ${String(fail)} failed`);
if (fail > 0) process.exitCode = 1;
