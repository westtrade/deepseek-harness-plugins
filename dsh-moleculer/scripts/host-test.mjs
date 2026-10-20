/**
 * Host checks for `dsh-moleculer`: settings, the broker, the tool surface, the
 * state route, and the notification path — against a fake harness context.
 *
 * The mesh parts run a REAL Moleculer broker on a loopback port, because the
 * thing worth testing is the registry → tools translation, which a mock would
 * only restate.
 *
 * Run: `node scripts/host-test.mjs`
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = '') => { if (cond) { pass += 1; return; } fail += 1; console.log('FAIL:', label, extra); };

/**
 * A fake host context.
 *
 * `seal()` mirrors the live runtime's trap: after `apply` settles, reading a
 * service off the raw context throws, so a callback that forgot to capture one
 * fails here instead of only on the server.
 */
function fakeHost() {
	const routes = new Map();
	const tools = new Map();
	const commands = new Map();
	const effects = [];
	const listeners = new Map();
	const injected = [];
	const sessions = [];
	const agents = new Map();
	const settingsWatchers = new Set();
	let section = {};
	let registeredSchema;
	let pending;
	let sealed = false;

	const settingsScope = {
		get: () => {
			const { normalizeSettings } = section.normalize;
			return normalizeSettings(section.value ?? {});
		},
		watch: (callback) => {
			settingsWatchers.add(callback);
			return () => settingsWatchers.delete(callback);
		}
	};

	const host = {
		routes,
		tools,
		commands,
		effects,
		injected,
		sessions,
		agents,
		get sealedFlag() { return sealed; },
		get settingsSchema() { return registeredSchema; },
		/** Change the settings section and fire the watchers. */
		writeSettings(value) {
			section.value = value;
			pending = value;
			for (const watcher of settingsWatchers) watcher();
		},
		ctx: {
			logger: { info() {}, warn() {}, error() {} },
			effect(factory, label) {
				effects.push(label);
				return factory();
			},
			inject(names, callback) {
				injected.push(Array.isArray(names) ? names.join('+') : String(names));
				callback({
					commands: {
						register(definition) {
							commands.set(definition.name, definition);
							return () => commands.delete(definition.name);
						}
					}
				});
				return () => {};
			},
			get(name) {
				if (sealed) throw new Error(`cannot get property "${name}" without inject`);
				return undefined;
			},
			on(event, listener) {
				const list = listeners.get(event) ?? [];
				list.push(listener);
				listeners.set(event, list);
				return () => {};
			},
			webServer: {
				register(route) {
					routes.set(`${route.kind}:${route.path}`, route);
					return () => routes.delete(`${route.kind}:${route.path}`);
				}
			},
			tools: {
				register(definition) {
					tools.set(definition.name, definition);
					return () => tools.delete(definition.name);
				}
			},
			settings: {
				register(ns, schema, options) {
					registeredSchema = schema;
					section = { normalize: { normalizeSettings: schema }, value: pending ?? options?.base ?? {} };
					return settingsScope;
				}
			},
			sessions: {
				list: () => sessions,
				get: (id) => sessions.find((session) => session.id === id)
			},
			agents: {
				get: (id) => agents.get(id),
				list: () => [...agents.values()]
			}
		},
		/** Add one live session with (or without) a running agent. */
		addSession(id, status) {
			const session = { id };
			sessions.push(session);
			if (status !== undefined) {
				const injected = [];
				agents.set(id, {
					status,
					session,
					inject(message) {
						if (status === 'running') {
							injected.push(message);
							return;
						}
						throw new Error('agent is not running');
					},
					get injected() { return injected; }
				});
			}
			return session;
		},
		seal() { sealed = true; }
	};
	return host;
}

/** A minimal request/response pair over one handler call. */
async function call(handler, method, url) {
	const req = { method, url, headers: {}, async *[Symbol.asyncIterator]() {}, resume() {} };
	let status = 0;
	let payload = '';
	const headers = {};
	const res = {
		headersSent: false,
		writeHead(code, extra) { status = code; this.headersSent = true; Object.assign(headers, extra ?? {}); },
		setHeader(k, v) { headers[k] = v; },
		end(text) { if (typeof text === 'string') payload = text; }
	};
	await handler(req, res);
	let body;
	try { body = payload === '' ? undefined : JSON.parse(payload); } catch { body = payload; }
	return { status, body, headers };
}

const PORT = 16100 + Math.floor(Math.random() * 400);

const host = fakeHost();
// The base port belongs to the running harness, so the suite boots on its own
// port from the start instead of colliding with the live broker.
host.writeSettings({ namespace: 'dsh-test', transporter: 'TCP', host: '127.0.0.1', port: PORT, nodeID: 'harness' });
const { apply, MCP_PATH, SETTINGS_NS, STATE_PATH } = await import('../lib/index.js');
await apply(host.ctx, {});
// `apply` no longer blocks on the network, so give the broker a moment to boot.
await new Promise((resolve) => setTimeout(resolve, 2500));

ok('the state route is registered', host.routes.has(`exact:${STATE_PATH}`));
ok('the MCP route is registered', host.routes.has(`exact:${MCP_PATH}`));
ok('the settings namespace is registered', SETTINGS_NS === 'dsh-moleculer');
ok('the broker stops with the plugin', host.effects.includes('moleculer: broker stop'));
// `settings.describe()` serializes with schema.toJSON(); a bare function throws
// there and takes the whole describe mirror down, hiding every settings card.
ok('the settings schema is serializable', typeof host.settingsSchema?.toJSON === 'function' && host.settingsSchema.toJSON().type === 'object');
ok('the schema still resolves values', host.settingsSchema({ port: 1234 }).port === 1234);
ok('the settings watcher is registered', host.effects.includes('moleculer: settings watch'));
ok('the /moleculer command is registered', host.commands.has('moleculer'), [...host.commands.keys()].join(','));
ok('the state route reports the command as ready', (await call(host.routes.get(`exact:${STATE_PATH}`).handler, 'GET', STATE_PATH)).body.command === true);
const command = host.commands.get('moleculer');
ok('the command advertises its verbs', String(command?.input?.hint).includes('start'), String(command?.input?.hint));

const stateRoute = host.routes.get(`exact:${STATE_PATH}`);
const initial = await call(stateRoute.handler, 'GET', STATE_PATH);
ok('the state route answers 200', initial.status === 200, JSON.stringify(initial.body).slice(0, 200));
ok('the broker reports running', initial.body.state.running === true, JSON.stringify(initial.body.state).slice(0, 160));
// `$node` is published deliberately: it is the local smoke-test tool.
ok('a fresh broker publishes the local $node tools', initial.body.tools.length > 0 && initial.body.tools.every((name) => name.startsWith('mesh_node_')), initial.body.tools.join(','));
ok('the summary mentions the namespace', initial.body.summary.includes('dsh'), initial.body.summary);

// --- the chat command ---
const statusReply = await command.handler({ rawInput: '' });
ok('the command reports status', statusReply.kind === 'success' && statusReply.text.includes('running'), statusReply.text);
const badVerb = await command.handler({ rawInput: 'frobnicate' });
ok('the command refuses an unknown verb', badVerb.kind === 'error' && badVerb.text.includes('unknown verb'), badVerb.text);
const stopped = await command.handler({ rawInput: 'stop' });
ok('the command stops the mesh', stopped.kind === 'success' && (await call(stateRoute.handler, 'GET', STATE_PATH)).body.state.running === false, stopped.text);
ok('stopping removes the mesh tools', (await call(stateRoute.handler, 'GET', STATE_PATH)).body.tools.length === 0);
const restarted = await command.handler({ rawInput: 'restart' });
ok('the command restarts the mesh', restarted.kind === 'success' && (await call(stateRoute.handler, 'GET', STATE_PATH)).body.state.running === true, restarted.text);

const wrongMethod = await call(stateRoute.handler, 'POST', STATE_PATH);
ok('the state route refuses a write', wrongMethod.status === 405, String(wrongMethod.status));

// --- a real peer joins the same mesh ---
host.writeSettings({ namespace: 'dsh-test', transporter: 'TCP', host: '127.0.0.1', port: PORT, nodeID: 'harness' });
await new Promise((resolve) => setTimeout(resolve, 2500));

host.seal();
// Create the agents first: the point is a model that is ALREADY working when the
// mesh changes, so the notification has to arrive for a session that predates it.
const busy = host.addSession('session-busy', 'running');
const idle = host.addSession('session-idle', 'idle');
const { ServiceBroker } = require('moleculer');
const peer = new ServiceBroker({ logger: false, namespace: 'dsh-test', nodeID: 'peer', transporter: 'TCP' });
peer.createService({
	name: 'orders',
	actions: {
		create: { params: { sku: { type: 'string' }, qty: { type: 'number', optional: true } }, handler: (ctx) => ({ id: 'o-1', ...ctx.params }) },
		ping: { handler: () => 'pong' }
	}
});
await peer.start();
await new Promise((resolve) => setTimeout(resolve, 3000));

const joined = await call(stateRoute.handler, 'GET', STATE_PATH);
ok('the peer service appears in the state', joined.body.state.services.some((s) => s.name === 'orders'), joined.body.state.services.map((s) => s.name).join(','));
ok('the peer service is marked remote', joined.body.state.services.find((s) => s.name === 'orders')?.local === false);
ok('remote actions become tools', joined.body.tools.some((name) => name.includes('orders_create')), joined.body.tools.join(','));
ok('a local service is not republished', !joined.body.tools.some((name) => name.startsWith('mesh_$node')));

const createTool = host.tools.get([...host.tools.keys()].find((name) => name.includes('orders_create')));
ok('the generated tool has a description', typeof createTool?.description === 'string' && createTool.description.length > 0);
ok('the generated tool exposes the remote params', Object.keys(createTool?.parameters ?? {}).includes('sku'), JSON.stringify(createTool?.parameters));
const called = await createTool.execute({ sku: 'ABC', qty: 2 }, {});
ok('calling the tool reaches the peer', called.result?.id === 'o-1' && called.result?.sku === 'ABC', JSON.stringify(called));

const pingTool = host.tools.get([...host.tools.keys()].find((name) => name.includes('orders_ping')));
ok('a param-less action still becomes a tool', pingTool !== undefined);
ok('a param-less action calls cleanly', (await pingTool.execute({}, {})).result === 'pong');

// --- the model was told about the change, but only because it was working ---
await new Promise((resolve) => setTimeout(resolve, 1000));
ok('a running agent is notified', busy !== undefined && host.agents.get('session-busy').injected.length > 0, String(host.agents.get('session-busy').injected.length));
ok('the notice names the mesh', (host.agents.get('session-busy').injected[0]?.content?.[0]?.text ?? '').includes('Moleculer mesh'));
ok('the notice carries a source', host.agents.get('session-busy').injected[0]?.source?.plugin === 'moleculer');
ok('an idle agent is not woken', host.agents.get('session-idle').injected.length === 0);

// --- the peer leaves ---
await peer.stop();
await new Promise((resolve) => setTimeout(resolve, 3500));
const left = await call(stateRoute.handler, 'GET', STATE_PATH);
ok('the departed service leaves the tool surface', !left.body.tools.some((name) => name.includes('orders_')), left.body.tools.join(','));
ok('the registry keeps no stale tool', ![...host.tools.keys()].some((name) => name.includes('orders_')));

await new Promise((resolve) => setTimeout(resolve, 300));
console.log(`\nhost: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
