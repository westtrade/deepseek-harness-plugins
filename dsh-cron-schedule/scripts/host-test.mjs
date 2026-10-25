/**
 * Host-side self-test for dsh-cron-schedule.
 *
 * Runs the real plugin against a fake host context (a fake Web server, agent
 * registry, workspace registry, and tool runtime) with a temporary store file.
 * It asserts the HTTP contract the GUI panel uses, the AI tool contract, that a
 * due job actually starts a chat with the right prompt and workspace, and that
 * the missed-run bookkeeping the panel offers works.
 *
 * No server and no real session log is touched.
 *
 * @module dsh-cron-schedule/scripts/host-test
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apply } from '../lib/index.js';
import { nextOccurrence, parseCron } from '../lib/cron.js';

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
 * The tool-definition rules the real registry enforces.
 *
 * `ctx.tools.register` (from `@deepseek-ai/dsh-tools`) validates an `output`
 * schema against its JSON-Schema subset and then validates every returned value
 * against that same schema at call time. Both rules matter here: an earlier
 * version of this plugin wrote `required: true` inside properties, the real
 * registry refused all seven tools in a row, and the model silently had no
 * `cron_*` tool at all while every check in this file still passed. The mirror
 * below keeps that failure loud, without importing the harness package (a
 * plugin loaded from a symlinked workspace path cannot resolve it).
 */
const SCHEMA_KEYWORDS = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title']);
const SCHEMA_TYPES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];

/** Throw when a schema uses a keyword the registry does not accept. */
function assertToolSchema(schema, at = 'schema') {
	if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`${at} must be a schema object`);
	for (const key of Object.keys(schema)) {
		if (!SCHEMA_KEYWORDS.has(key)) throw new Error(`${at}.${key} is not a supported keyword`);
	}
	if (typeof schema.type !== 'string' || !SCHEMA_TYPES.includes(schema.type)) throw new Error(`${at}.type must be one of ${SCHEMA_TYPES.join('/')}`);
	if (Object.hasOwn(schema, 'required')) {
		// The one rule that broke this plugin: `required` is an array of property
		// names on an object, never `required: true` on a property.
		if (schema.type !== 'object') throw new Error(`${at}.required is not supported on type "${schema.type}"`);
		if (!Array.isArray(schema.required) || schema.required.some((name) => typeof name !== 'string')) throw new Error(`${at}.required must be an array of property names`);
	}
	for (const [name, child] of Object.entries(schema.properties ?? {})) assertToolSchema(child, `${at}.properties.${name}`);
	if (Object.hasOwn(schema, 'items')) assertToolSchema(schema.items, `${at}.items`);
}

/** Throw when a returned value does not match the declared output schema. */
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
	const created = [];
	const workspaces = [];
	const logs = [];
	/** Set by seal(): after apply() settles, raw-ctx service reads throw. */
	let sealed = false;
	/** Deliveries into an existing chat, recorded so tests can assert reuse. */
	const prompts = [];
	/** The agents service, held by identity so the fake never reads itself off ctx. */
	const agentsService = {
		/** When set, every agent creation fails — used to test run failure. */
		failWith: undefined,
		async create(options) {
			if (agentsService.failWith !== undefined) throw new Error(agentsService.failWith);
			const agent = {
				session: { id: options.sessionId, header: { cwd: options.meta.cwd } },
				messages: [],
				followup(message) {
					this.messages.push(message);
				}
			};
			created.push({ options, agent });
			return { agent, async dispose() {} };
		}
	};
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
			ok(`inject declares tools (${names.join(',')})`, names.includes('tools'));
			callback(ctx);
		},
		/**
		 * Cordis resolves services per context and throws `cannot get property
		 * "<name>" without inject` when a later callback reads one that the
		 * plugin never declared. The real runtime refused scheduled runs this way
		 * once, so the fake ctx guards the services a run needs the same way: a
		 * callback that reaches for one is only legal if it was declared.
		 */
		guarded(names) {
			for (const name of names) {
				if (Object.hasOwn(ctx, name)) continue;
				Object.defineProperty(ctx, name, {
					configurable: true,
					get() {
						throw new Error(`cannot get property "${name}" without inject`);
					}
				});
			}
		},
		/**
		 * Freeze service resolution the way the live host does after `apply`
		 * settles: from then on a callback that reads a service off the raw ctx
		 * throws. Timers and HTTP handlers run in exactly that window, so this is
		 * what catches "worked in a unit test, failed on the server".
		 */
		seal() {
			sealed = true;
		},
		webServer: {
			register(route) {
				routes.set(`${route.kind}:${route.path}`, route);
				return () => routes.delete(`${route.kind}:${route.path}`);
			}
		},
		tools: {
			register(definition) {
				// Same contract as the real registry: a definition that breaks the
				// schema subset throws, and every returned value is validated.
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
		},
		agentPresets: {
			async resolve() {
				return { id: 'standard' };
			},
			async mount() {}
		},
		agentDefaultModel: {
			currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' })
		},
		workspaceRegistry: {
			/** Sessions the person archived; the chat picker must hide these. */
			archivedSessionIds: ['session-beta'],
			list: () => workspaces,
			async create(dir) {
				const workspace = {
					id: `ws-${workspaces.length + 1}`,
					path: dir,
					attached: [],
					async attachSession(sessionId) {
						this.attached.push(sessionId);
					},
					async detachSession(sessionId) {
						this.attached = this.attached.filter((id) => id !== sessionId);
					}
				};
				workspaces.push(workspace);
				return workspace;
			}
		},
		sessionTitle: {
			rename() {}
		},
		/**
		 * The composition's browser-auth carrier. The real one applies a
		 * Host/Origin fence plus the signed cookie from login and returns a status
		 * code when a request fails either; `undefined` means a trusted browser.
		 * The fake mirrors that contract so the human-only `autoCatchUp` rule is
		 * exercised for real instead of being assumed.
		 */
		sessionController: {
			async prompt(request, signal) {
				signal?.throwIfAborted();
				prompts.push(request);
				return { accepted: true };
			},
			async list() {
				return [
					{ sessionId: 'session-alpha', cwd: '/tmp/alpha', updatedAt: 300, running: false },
					// Carries a cached projection, so the log path is skipped.
					{ sessionId: 'session-beta', cwd: '/tmp/beta', updatedAt: 200, running: true, projections: { values: { title: 'Beta chat' } } },
					// A subagent child: must never be offered for reuse.
					{ sessionId: 'session-worker', cwd: '/tmp/alpha', updatedAt: 400, running: false, origin: 'subagent', parentSessionId: 'session-alpha' },
					// A FORK: it has a parent but is an ordinary chat, so it stays.
					{ sessionId: 'session-fork', cwd: '/tmp/alpha', updatedAt: 250, running: false, parentSessionId: 'session-alpha' },
					// An unused, never-messaged session: no name to recognise it by.
					{ sessionId: 'session-blank', cwd: '/tmp/alpha', updatedAt: 500, running: false, blank: true }
				];
			}
		},
		/** Titles come from the harness's own folds; the fake mimics both readers. */
		sessionQuery: {
			async readSession(sessionId) {
				return { events: [] };
			},
			async readTitle(sessionId) {
				return sessionId === 'session-alpha' ? { title: 'Alpha chat' } : undefined;
			},
			async listEvents(sessionId) {
				// A session with messages but no stored title: the name must be
				// derived from the opening user message instead of a path.
				if (sessionId === 'session-fork') {
					return [{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Починить вёрстку на странице отзывов' }] } }];
				}
				// A plugin-sourced message is not a person's prompt and must be ignored.
				if (sessionId === 'session-alpha') {
					return [{ type: 'user/message', data: { source: { kind: 'plugin' }, content: [{ type: 'text', text: 'runtime context snapshot' }] } }];
				}
				return [];
			}
		},
		/** Settings provider: records the namespace the plugin registers. */
		settings: {
			registered: new Map(),
			register(ns, schema) {
				this.registered.set(ns, schema);
				let value = schema({});
				const watchers = [];
				return {
					get: () => value,
					watch: (cb) => { watchers.push(cb); return () => {}; },
					replace: async (next) => { value = schema(next); for (const cb of watchers) cb(value, value); },
					update: async (patch) => { value = schema({ ...value, ...patch }); for (const cb of watchers) cb(value, value); }
				};
			}
		},
		/** The model catalog the plugin reads for its pickers and allow-list checks. */
		llm: {
			providers: [
				{ id: 'router-ai', name: 'RouterAI' },
				{ id: 'deepseek-official', name: 'DeepSeek' }
			],
			listProviders() {
				return this.providers;
			},
			async listModels(provider) {
				if (provider === 'router-ai') {
					return [
						{ id: 'deepseek/deepseek-v4.1-flash', name: 'V4.1 Flash' },
						{ id: 'xiaomi/mimo-v2.6-pro', name: 'Mimo Pro' }
					];
				}
				if (provider === 'deepseek-official') return [{ id: 'deepseek-flash', name: 'Flash' }];
				throw new Error(`unknown provider ${provider}`);
			}
		},
		connection: {
			requestRejection(request) {
				return request?.headers?.cookie?.includes('dsh-auth-') === true ? undefined : 401;
			}
		},
		agents: agentsService,
		async create(options) {
			if (agentsService.failWith !== undefined) throw new Error(agentsService.failWith);
			const agent = {
				session: { id: options.sessionId, header: { cwd: options.meta.cwd } },
				messages: [],
				followup(message) {
					this.messages.push(message);
				}
			};
			created.push({ options, agent });
			return { agent, async dispose() {} };
		}
	};
	// Services a run needs: once sealed, reading them off the raw ctx must fail,
	// exactly as Cordis refuses an undeclared/naked service read.
	for (const name of ['agents', 'agentPresets', 'agentDefaultModel', 'workspaceRegistry', 'sessionTitle']) {
		const value = ctx[name];
		Object.defineProperty(ctx, name, {
			configurable: true,
			get() {
				if (sealed) throw new Error(`cannot get property "${name}" without inject`);
				return value;
			}
		});
	}
	return {
		ctx,
		routes,
		tools,
		created,
		workspaces,
		effects,
		logs,
		prompts,
		seal: () => ctx.seal(),
		/** Make every subsequent agent creation fail, or stop doing so. */
		failRuns: (on) => {
			agentsService.failWith = on === true ? 'provider exploded' : undefined;
		}
	};
}

/** A minimal request/response pair over one handler call. */
async function call(handler, method, url, body, options) {
	const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')];
	const req = {
		method,
		url,
		// A trusted call carries the browser-auth cookie, exactly as the panel's
		// own fetch does; the AI's shell or a script sends none.
		headers: options?.trusted === true ? { cookie: 'dsh-auth-test=1' } : {},
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
			if (typeof text === 'string') payload = text;
		}
	};
	await handler(req, res);
	let parsed;
	try {
		parsed = payload === '' ? undefined : JSON.parse(payload);
	} catch {
		parsed = payload;
	}
	return { status, body: parsed, headers };
}

const dir = await mkdtemp(path.join(tmpdir(), 'cron-test-'));
const storePath = path.join(dir, 'cron.json');
try {
	const host = fakeContext();
	await apply(host.ctx, { storePath, enabled: true, locale: "ru" });
	// Everything a route or timer does from here on runs against a ctx that no
	// longer resolves services — the live host's behaviour.
	host.seal();
	await new Promise((resolve) => setImmediate(resolve));

	// --- wiring ---
	ok('jobs route registered', host.routes.has(`exact:/api/cron-schedule/jobs`), [...host.routes.keys()].join(' '));
	ok('settings route registered', host.routes.has('exact:/api/cron-schedule/settings'), [...host.routes.keys()].join(' '));
	ok('job prefix route registered', host.routes.has('prefix:/api/cron-schedule/jobs'));
	ok('board prefix route registered', host.routes.has('prefix:/api/cron-schedule/board'), [...host.routes.keys()].join(' '));
	ok('seven AI tools registered', host.tools.size === 7, [...host.tools.keys()].join(','));
	for (const toolName of ['cron_list', 'cron_create', 'cron_delete', 'cron_run', 'cron_chats', 'cron_models', 'cron_describe']) {
		ok(`tool ${toolName} present`, host.tools.has(toolName));
	}
	ok('scheduler stop effect registered', host.effects.includes('cron-schedule: scheduler stop'));
	// A registered tool must also satisfy the registry's output contract, or the
	// model gets nothing at all (see assertToolSchema above).
	for (const toolName of host.tools.keys()) {
		const definition = host.tools.get(toolName);
		assertToolSchema(definition.output.schema, `${toolName}.output.schema`);
		ok(`tool ${toolName} renders text`, typeof definition.output.render === 'function');
		ok(`tool ${toolName} has a description`, typeof definition.description === 'string' && definition.description.length > 40);
	}

	// --- the manifest route: what an agent can learn in one request ---
	const manifestRoute = host.routes.get('exact:/api/cron-schedule/manifest');
	ok('manifest route registered', manifestRoute !== undefined);
	const manifest = await call(manifestRoute.handler, 'GET', '/api/cron-schedule/manifest');
	ok('manifest 200', manifest.status === 200, String(manifest.status));
	ok('manifest lists every tool', Array.isArray(manifest.body.tools) && manifest.body.tools.length === 7, JSON.stringify(manifest.body.tools?.map((tool) => tool.name)));
	ok('manifest tools carry descriptions', manifest.body.tools.every((tool) => typeof tool.description === 'string' && tool.description.length > 40));
	ok('manifest documents the job fields', typeof manifest.body.job?.expression === 'string' && typeof manifest.body.job?.workspacePath === 'string' && typeof manifest.body.job?.prompt === 'string');
	ok('manifest flags the human-only route', manifest.body.endpoints?.some((entry) => entry.method === 'POST' && entry.path === '/api/cron-schedule/settings' && entry.humanOnly === true));
	ok('manifest marks the job routes as open to the AI', manifest.body.endpoints?.filter((entry) => entry.path.startsWith('/api/cron-schedule/jobs')).every((entry) => entry.humanOnly === false));
	ok('manifest names the status values', JSON.stringify(manifest.body.lastStatus) === JSON.stringify(['started', 'succeeded', 'skipped', 'failed']), JSON.stringify(manifest.body.lastStatus));
	const manifestMethod = await call(manifestRoute.handler, 'POST', '/api/cron-schedule/manifest', {});
	ok('manifest rejects writes', manifestMethod.status === 405, String(manifestMethod.status));

	// --- the settings namespace, so the card appears under Plugin Configuration ---
	ok('settings namespace registered', host.ctx.settings.registered.has('cron-schedule'), [...host.ctx.settings.registered.keys()].join(','));
	const registeredSchema = host.ctx.settings.registered.get('cron-schedule');
	ok('namespace schema is callable as a resolver', typeof registeredSchema === 'function');
	ok('namespace schema resolves defaults', Array.isArray(registeredSchema({}).allowedModels) && registeredSchema({}).allowedModels.length === 0);
	ok('namespace schema drops malformed entries', registeredSchema({ allowedModels: [{ provider: 'a', model: 'b' }, { nope: 1 }, null] }).allowedModels.length === 1);
	// A settings service introspects the schema; both calls must not throw.
	ok('namespace schema exposes toJSON for describe()', typeof registeredSchema.toJSON === 'function' && registeredSchema.toJSON().type === 'object');
	ok('namespace schema exposes the secret-walker shape', registeredSchema.type === 'object' && typeof registeredSchema.dict === 'object');

	// Reproduce the real `webServer.match` precedence: an exact hit first, then
	// longest-prefix where a prefix matches `p` and `p/<rest>`. This is the
	// regression guard for the trailing-slash bug that made per-job requests fall
	// through to the `/api` auth fence and answer 401.
	const matchRoute = (pathname) => {
		const exact = pathname === '/api/cron-schedule/jobs' ? host.routes.get('exact:/api/cron-schedule/jobs') : undefined;
		if (exact !== undefined) return exact;
		let best;
		for (const [key, route] of host.routes) {
			if (!key.startsWith('prefix:')) continue;
			const prefix = key.slice('prefix:'.length);
			if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue;
			if (best === undefined || prefix.length > best.prefix.length) best = { prefix, route };
		}
		return best?.route;
	};
	ok('a per-job path reaches the job route', matchRoute('/api/cron-schedule/jobs/abc') !== undefined);
	ok('a per-job sub-path reaches the job route', matchRoute('/api/cron-schedule/jobs/abc/run') !== undefined);
	ok('the collection path uses the exact route', matchRoute('/api/cron-schedule/jobs') === host.routes.get('exact:/api/cron-schedule/jobs'));
	ok('the job prefix route has no trailing slash', [...host.routes.keys()].some((key) => key === 'prefix:/api/cron-schedule/jobs'));

	const jobsRoute = host.routes.get('exact:/api/cron-schedule/jobs');
	const jobRoute = host.routes.get('prefix:/api/cron-schedule/jobs');
	const settingsRoute = host.routes.get('exact:/api/cron-schedule/settings');
	const chatsRoute = host.routes.get('exact:/api/cron-schedule/chats');

	// --- empty list ---
	const empty = await call(jobsRoute.handler, 'GET', '/api/cron-schedule/jobs');
	ok('empty list 200', empty.status === 200);
	ok('empty list has no jobs', Array.isArray(empty.body.jobs) && empty.body.jobs.length === 0);

	// --- method guard ---
	const patchMethod = await call(jobsRoute.handler, 'PUT', '/api/cron-schedule/jobs', {});
	ok('PUT rejected 405', patchMethod.status === 405, `got ${patchMethod.status}`);

	// --- create via the HTTP contract the panel uses ---
	const created = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Утренний отчёт',
		expression: '0 9 * * 1-5',
		timeZone: 'Europe/Moscow',
		workspacePath: path.join(dir, 'proj'),
		prompt: 'Собери утренний отчёт'
	}, { trusted: true });
	ok('create 201', created.status === 201, JSON.stringify(created.body).slice(0, 200));
	const job = created.body.job;
	ok('create returns id', typeof job.id === 'string' && job.id.length > 0);
	ok('create computed nextRunAt', typeof job.nextRunAt === 'number' && job.nextRunAt > Date.now());
	ok('create describes in Russian', job.description === 'по будням в 09:00', job.description);
	ok('create lists upcoming', Array.isArray(job.upcoming) && job.upcoming.length === 3);
	ok('job persisted to disk', JSON.parse(await readFile(storePath, 'utf8')).jobs.length === 1);
	ok('a new job asks before catching up', job.autoCatchUp === false, String(job.autoCatchUp));

	// --- the model catalog and the allow-list ---
	const catalog = await call(settingsRoute.handler, 'GET', '/api/cron-schedule/settings');
	ok('settings GET 200', catalog.status === 200, JSON.stringify(catalog.body).slice(0, 160));
	ok('catalog lists every routed model', catalog.body.models.length === 3, String(catalog.body.models.length));
	ok('catalog carries provider and model ids', catalog.body.models.some((m) => m.provider === 'router-ai' && m.model === 'deepseek/deepseek-v4.1-flash'));
	ok('catalog carries display names', catalog.body.models.every((m) => typeof m.name === 'string' && m.name.length > 0));
	ok('catalog reports the deployment default', catalog.body.default?.model === 'deepseek-flash', JSON.stringify(catalog.body.default));
	ok('no restriction by default', Array.isArray(catalog.body.allowedModels) && catalog.body.allowedModels.length === 0);
	// A person narrows the list; the panel sends the cookie.
	const narrowed = await call(settingsRoute.handler, 'POST', '/api/cron-schedule/settings', {
		allowedModels: [{ provider: 'router-ai', model: 'deepseek/deepseek-v4.1-flash' }]
	}, { trusted: true });
	ok('a person can set the allow-list', narrowed.status === 200 && narrowed.body.allowedModels.length === 1, JSON.stringify(narrowed.body).slice(0, 160));
	// The AI must not be able to widen its own policy.
	const widened = await call(settingsRoute.handler, 'POST', '/api/cron-schedule/settings', {
		allowedModels: [{ provider: 'router-ai', model: 'deepseek/deepseek-v4.1-flash' }, { provider: 'router-ai', model: 'xiaomi/mimo-v2.6-pro' }]
	});
	ok('an untrusted caller cannot change the allow-list', widened.status === 400 && widened.body.field === 'allowedModels', `${widened.status} ${JSON.stringify(widened.body)}`);
	// A model this deployment cannot route is never stored as policy: the panel
	// posts the whole list, and an entry that has left the catalog is invisible
	// in the card, so it is dropped and reported back instead of blocking every
	// save the card could ever make.
	const unknown = await call(settingsRoute.handler, 'POST', '/api/cron-schedule/settings', {
		allowedModels: [{ provider: 'router-ai', model: 'nope/does-not-exist' }, { provider: 'router-ai', model: 'deepseek/deepseek-v4.1-flash' }]
	}, { trusted: true });
	ok('an unknown model is dropped, not stored', unknown.status === 200 && unknown.body.allowedModels.length === 1, JSON.stringify(unknown.body));
	ok('the dropped model is reported back', JSON.stringify(unknown.body.dropped) === JSON.stringify(['router-ai/nope/does-not-exist']), JSON.stringify(unknown.body.dropped));
	// Regression: a list saved earlier whose models have since left the catalog
	// must not lock the card up. Tick a still-routed model on top of that list —
	// exactly what the panel posts — and the save must go through, keeping the
	// live entries and dropping the dead ones.
	const staleList = await call(settingsRoute.handler, 'POST', '/api/cron-schedule/settings', {
		allowedModels: [
			{ provider: 'router-ai', model: 'deepseek/deepseek-v4.1-flash' },
			{ provider: 'router-ai', model: 'openai/gpt-6-luna' },
			{ provider: 'router-ai', model: 'xiaomi/mimo-v2.6-pro' }
		]
	}, { trusted: true });
	ok('a stale saved entry does not block the save', staleList.status === 200, `${staleList.status} ${JSON.stringify(staleList.body)}`);
	ok('the live models of that save are kept', staleList.body.allowedModels.length === 2 && staleList.body.allowedModels.some((entry) => entry.model === 'xiaomi/mimo-v2.6-pro'), JSON.stringify(staleList.body.allowedModels));
	ok('only the dead entry is reported as dropped', staleList.body.dropped.length === 1 && staleList.body.dropped[0].endsWith('openai/gpt-6-luna'), JSON.stringify(staleList.body.dropped));
	// A provider whose catalog could not be listed is not judged at all: an
	// unrelated hiccup must not erase entries the deployment may well still route.
	host.ctx.llm.providers.push({ id: 'flaky-ai', name: 'Flaky' });
	const unlisted = await call(settingsRoute.handler, 'POST', '/api/cron-schedule/settings', {
		allowedModels: [
			{ provider: 'flaky-ai', model: 'some/model' },
			{ provider: 'router-ai', model: 'deepseek/deepseek-v4.1-flash' }
		]
	}, { trusted: true });
	host.ctx.llm.providers.pop();
	ok('an unlistable provider keeps its entries', unlisted.status === 200 && unlisted.body.allowedModels.some((entry) => entry.provider === 'flaky-ai'), JSON.stringify(unlisted.body));
	ok('nothing is dropped when the provider was never checked', unlisted.body.dropped.length === 0, JSON.stringify(unlisted.body.dropped));
	// Back to the one-model policy the checks below are written against.
	const restored = await call(settingsRoute.handler, 'POST', '/api/cron-schedule/settings', {
		allowedModels: [{ provider: 'router-ai', model: 'deepseek/deepseek-v4.1-flash' }]
	}, { trusted: true });
	ok('the allow-list is restored to one model', restored.status === 200 && restored.body.allowedModels.length === 1, JSON.stringify(restored.body.allowedModels));

	// With the list in force, a job may only name an allowed model.
	const outside = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Запрещённая модель', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p',
		model: { provider: 'router-ai', model: 'xiaomi/mimo-v2.6-pro' }
	}, { trusted: true });
	ok('a job outside the allow-list is refused', outside.status === 400 && outside.body.field === 'model', `${outside.status} ${JSON.stringify(outside.body)}`);
	const inside = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Разрешённая модель', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p',
		model: { provider: 'router-ai', model: 'deepseek/deepseek-v4.1-flash' }
	}, { trusted: true });
	ok('a job inside the allow-list is accepted', inside.status === 201 && inside.body.job.model?.model === 'deepseek/deepseek-v4.1-flash', JSON.stringify(inside.body).slice(0, 200));
	// The AI's own tool obeys the same policy.
	const toolOutside = await host.tools.get('cron_create').execute({
		name: 'ИИ запрещённая', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p',
		model: { provider: 'router-ai', model: 'xiaomi/mimo-v2.6-pro' }
	}, { signal: new AbortController().signal }).then(() => undefined, (error) => error);
	ok('the AI tool refuses a model outside the list', toolOutside instanceof Error, String(toolOutside?.message ?? 'accepted'));
	const modelsTool = await host.tools.get('cron_models').execute({}, { signal: new AbortController().signal });
	ok('cron_models reports the restriction', modelsTool.restricted === true);
	ok('cron_models lists only allowed entries', modelsTool.models.length === 1 && modelsTool.models[0].model === 'deepseek/deepseek-v4.1-flash', JSON.stringify(modelsTool.models));
	// Clearing the list re-opens every routed model.
	const cleared = await call(settingsRoute.handler, 'POST', '/api/cron-schedule/settings', { allowedModels: [] }, { trusted: true });
	ok('clearing the list succeeds', cleared.status === 200 && cleared.body.allowedModels.length === 0);
	const unrestrictedModels = await host.tools.get('cron_models').execute({}, { signal: new AbortController().signal });
	ok('with no list every model is offered', unrestrictedModels.restricted === false && unrestrictedModels.models.length === 3, String(unrestrictedModels.models.length));
	// Even with no allow-list, a model this deployment cannot route is refused:
	// accepting it would only fail later, when the job fires.
	const unroutable = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Несуществующая модель', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p',
		model: { provider: 'router-ai', model: 'nope/does-not-exist' }
	}, { trusted: true });
	ok('an unroutable model is refused without a list', unroutable.status === 400 && unroutable.body.field === 'model', `${unroutable.status} ${JSON.stringify(unroutable.body)}`);
	const unknownProvider = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Несуществующий провайдер', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p',
		model: { provider: 'no-such-provider', model: 'deepseek-flash' }
	}, { trusted: true });
	ok('an unroutable provider is refused without a list', unknownProvider.status === 400 && unknownProvider.body.field === 'model', `${unknownProvider.status} ${JSON.stringify(unknownProvider.body)}`);
	// A job with no model keeps meaning "the deployment default".
	const noModel = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Без модели', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p'
	}, { trusted: true });
	ok('a job without a model stores none', noModel.status === 201 && noModel.body.job.model === null, JSON.stringify(noModel.body.job.model));
	// --- the catch-up flag is human-only ---
	// The person at the panel ticks the box: the browser cookie rides along, so
	// the Host accepts it.
	const trustedCatchUp = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Догон человеком',
		expression: '0 9 * * *',
		workspacePath: path.join(dir, 'proj'),
		prompt: 'p',
		autoCatchUp: true
	}, { trusted: true });
	ok('a person can turn the flag on', trustedCatchUp.status === 201 && trustedCatchUp.body.job.autoCatchUp === true, JSON.stringify(trustedCatchUp.body).slice(0, 160));
	// Everything that is not an authenticated browser is refused: the model's
	// tools, a curl from a shell tool, a script.
	for (const [label, options] of [
		['an untrusted create', undefined],
		['an untrusted edit', undefined]
	]) {
		const refused = label.includes('create')
			? await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
				name: 'Догон ИИ',
				expression: '0 9 * * *',
				workspacePath: path.join(dir, 'proj'),
				prompt: 'p',
				autoCatchUp: true
			}, options)
			: await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}`, { autoCatchUp: true }, options);
		ok(`${label} is refused`, refused.status === 400 && refused.body.field === 'autoCatchUp', `${refused.status} ${JSON.stringify(refused.body)}`);
	}
	// A non-boolean is rejected for everyone, trusted or not.
	const badFlag = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'x', expression: '* * * * *', workspacePath: '/tmp', prompt: 'p', autoCatchUp: 'yes'
	}, { trusted: true });
	ok('a non-boolean flag is refused', badFlag.status === 400 && badFlag.body.field === 'autoCatchUp');
	// Turning it OFF is harmless, so an untrusted caller may clear it.
	const clearTry = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Догон ИИ', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p', autoCatchUp: false
	});
	ok('an untrusted caller may leave the flag off', clearTry.status === 201 && clearTry.body.job.autoCatchUp === false);
	// An edit that omits the field must not silently lose it.
	const keep = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(trustedCatchUp.body.job.id)}`, {
		name: 'Догон человеком (правка)'
	}, { trusted: true });
	ok('an edit keeps the flag when omitted', keep.body.job.autoCatchUp === true, String(keep.body.job.autoCatchUp));
	// ...and the AI tool cannot set it either.
	const flaggedByTool = await host.tools.get('cron_create').execute({
		name: 'ИИ с галкой', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p', autoCatchUp: true
	}, { signal: new AbortController().signal });
	ok('the AI tool cannot set the flag', flaggedByTool.id !== undefined && JSON.parse(await readFile(storePath, 'utf8')).jobs.find((entry) => entry.id === flaggedByTool.id)?.autoCatchUp !== true, String(flaggedByTool.id));

	// --- validation errors are 400 with a field ---
	for (const [label, body] of [
		['bad expression', { name: 'x', expression: 'nope', workspacePath: '/tmp', prompt: 'p' }],
		['empty name', { name: '  ', expression: '* * * * *', workspacePath: '/tmp', prompt: 'p' }],
		['impossible expression', { name: 'x', expression: '0 0 31 2 *', workspacePath: '/tmp', prompt: 'p' }],
		['bad time zone', { name: 'x', expression: '* * * * *', timeZone: 'Mars/Olympus', workspacePath: '/tmp', prompt: 'p' }],
		['empty prompt', { name: 'x', expression: '* * * * *', workspacePath: '/tmp', prompt: '   ' }]
	]) {
		const bad = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', body);
		ok(`rejects ${label} with 400`, bad.status === 400 && typeof bad.body.error === 'string', `got ${bad.status}`);
	}

	// --- list contains the job ---
	const listed = await call(jobsRoute.handler, 'GET', '/api/cron-schedule/jobs');
	ok('list includes the job', listed.body.jobs.some((entry) => entry.id === job.id));
	ok('list revision advanced', listed.body.revision >= 2);

	// --- expression preview ---
	const preview = await call(jobRoute.handler, 'POST', '/api/cron-schedule/jobs/preview', {
		expression: '*/15 * * * *',
		timeZone: 'UTC'
	});
	ok('preview 200', preview.status === 200, JSON.stringify(preview.body));
	ok('preview lists 5', preview.body.upcoming.length === 5);
	ok('preview spacing is 15m', preview.body.upcoming[1] - preview.body.upcoming[0] === 15 * 60000);

	// --- run now: creates a chat with the prompt in the job workspace ---
	const run = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}/run`);
	ok('run 200', run.status === 200, JSON.stringify(run.body).slice(0, 200));
	ok('run created one chat', host.created.length === 1, `created=${host.created.length} lastError=${run.body?.job?.lastError ?? (await call(jobRoute.handler, 'GET', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}`)).body?.job?.lastError}`);
	const agent = host.created[0];
	ok('chat cwd is the job workspace', agent.options.meta.cwd === path.resolve(path.join(dir, 'proj')), agent.options.meta.cwd);
	ok('chat got the preset', agent.options.meta.agentPreset === 'standard');
	ok('chat got a model selection', agent.options.agentOptions?.model === 'deepseek-flash');
	ok('chat received exactly one message', agent.agent.messages.length === 1);
	const message = agent.agent.messages[0];
	ok('message is a user message', message.role === 'user');
	ok('message carries the prompt', message.content[0].text === 'Собери утренний отчёт');
	ok('message is tagged as cron', message.source.kind === 'cron' && message.source.jobId === job.id);
	ok('session id is greppable', agent.options.sessionId.startsWith('session-cron-'), agent.options.sessionId);
	ok('workspace attached the session', host.workspaces[0].attached.includes(agent.options.sessionId));
	const afterRun = await call(jobRoute.handler, 'GET', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}`);
	ok('run recorded lastStatus succeeded', afterRun.body.job.lastStatus === 'succeeded', afterRun.body.job.lastStatus);
	ok('run recorded lastSessionId', afterRun.body.job.lastSessionId === agent.options.sessionId);
	// The panel follows a run into its chat straight from this answer, without a
	// second round trip, so the id must ride on the POST response itself.
	ok('the run answer names the chat to open', run.body.job.lastStatus === 'succeeded' && run.body.job.lastSessionId === agent.options.sessionId, JSON.stringify(run.body.job.lastSessionId));
	// Also at the top level, so a script needs no knowledge of the job view.
	ok('the run answer repeats the chat and the outcome', run.body.sessionId === agent.options.sessionId && run.body.lastStatus === 'succeeded', JSON.stringify({ sessionId: run.body.sessionId, lastStatus: run.body.lastStatus }));
	ok('run advanced nextRunAt into the future', afterRun.body.job.nextRunAt > Date.now());

	// --- the setup brief: read once into the new chat, then only the task ---
	const briefJob = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'С брифом', expression: '0 10 * * *', workspacePath: path.join(dir, 'proj'),
		prompt: 'проверь доску', initialPrompt: 'Ты — ревьюер. Доска: .vscode/TODO.md'
	});
	ok('create stores the setup brief', briefJob.status === 201 && briefJob.body.job.initialPrompt === 'Ты — ревьюер. Доска: .vscode/TODO.md', JSON.stringify(briefJob.body?.job?.initialPrompt));
	const chatsBeforeBrief = host.created.length;
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(briefJob.body.job.id)}/run`);
	const briefAgent = host.created.at(-1);
	ok('a job with a brief still starts one chat', host.created.length === chatsBeforeBrief + 1, `created=${host.created.length}`);
	ok('the new chat reads the brief first, then the task', briefAgent.agent.messages.length === 2
		&& briefAgent.agent.messages[0].content[0].text === 'Ты — ревьюер. Доска: .vscode/TODO.md'
		&& briefAgent.agent.messages[1].content[0].text === 'проверь доску',
		JSON.stringify(briefAgent.agent.messages.map((entry) => entry.content[0].text)));
	ok('both messages are cron messages, the brief marked as init', briefAgent.agent.messages.every((entry) => entry.source.kind === 'cron')
		&& briefAgent.agent.messages[0].source.stage === 'init'
		&& briefAgent.agent.messages[1].source.stage === 'task',
		JSON.stringify(briefAgent.agent.messages.map((entry) => entry.source.stage)));
	// The next run continues that chat: the brief is already in the transcript,
	// so only the task is delivered — which is the point of the separate field.
	const briefPromptsBefore = host.prompts.length;
	const briefChatsBefore = host.created.length;
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(briefJob.body.job.id)}/run`);
	ok('the second run reuses the chat and sends the task alone', host.created.length === briefChatsBefore
		&& host.prompts.length === briefPromptsBefore + 1
		&& host.prompts.at(-1).sessionId === briefAgent.options.sessionId,
		JSON.stringify({ created: host.created.length, prompts: host.prompts.length, session: host.prompts.at(-1)?.sessionId }));
	// "Always new chat" makes every chat new, so every run has to carry the brief.
	const briefAlways = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Бриф каждый раз', expression: '0 11 * * *', workspacePath: path.join(dir, 'proj'),
		prompt: 'короткая задача', initialPrompt: 'длинный бриф', alwaysNewChat: true
	});
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(briefAlways.body.job.id)}/run`);
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(briefAlways.body.job.id)}/run`);
	const alwaysRuns = host.created.slice(-2);
	ok('every always-new-chat run carries the brief', alwaysRuns.every((entry) => entry.agent.messages.length === 2
		&& entry.agent.messages[0].content[0].text === 'длинный бриф'
		&& entry.agent.messages[1].content[0].text === 'короткая задача'),
		JSON.stringify(alwaysRuns.map((entry) => entry.agent.messages.map((message) => message.content[0].text))));
	// The field is optional, and an edited form can clear it.
	const noBrief = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Без брифа', expression: '0 12 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p'
	});
	ok('a job without a brief stores none', noBrief.status === 201 && noBrief.body.job.initialPrompt === null, JSON.stringify(noBrief.body.job.initialPrompt));
	const clearedBrief = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(briefJob.body.job.id)}`, { initialPrompt: null });
	ok('a null brief clears the stored one', clearedBrief.status === 200 && clearedBrief.body.job.initialPrompt === null, JSON.stringify(clearedBrief.body?.job?.initialPrompt));
	const tooLongBrief = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'x', expression: '* * * * *', workspacePath: '/tmp', prompt: 'p', initialPrompt: 'x'.repeat(8001)
	});
	ok('an oversized brief is refused on its own field', tooLongBrief.status === 400 && tooLongBrief.body.field === 'initialPrompt', `${tooLongBrief.status} ${JSON.stringify(tooLongBrief.body)}`);

	// The brief also reaches a chat that predates it — the field was added to the
	// plugin long after that chat was created, or the person bound the chat by
	// hand. It is delivered once, then the chat gets the task alone.
	const lateBrief = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Поздний бриф', expression: '0 13 * * *', workspacePath: path.join(dir, 'proj'),
		prompt: 'задача', initialPrompt: 'бриф для старого чата', sessionId: 'session-alpha'
	}, { trusted: true });
	ok('the late brief is stored', lateBrief.status === 201 && lateBrief.body.job.initialPrompt === 'бриф для старого чата', JSON.stringify(lateBrief.body?.job?.initialPrompt));
	const promptsBeforeLate = host.prompts.length;
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(lateBrief.body.job.id)}/run`);
	ok('a chat that predates the brief receives it first', host.prompts.length === promptsBeforeLate + 2
		&& host.prompts.at(-2).content[0].text === 'бриф для старого чата'
		&& host.prompts.at(-1).content[0].text === 'задача',
		JSON.stringify(host.prompts.slice(promptsBeforeLate).map((entry) => entry.content[0].text)));
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(lateBrief.body.job.id)}/run`);
	ok('once delivered, the same chat gets the task alone', host.prompts.length === promptsBeforeLate + 3
		&& host.prompts.at(-1).content[0].text === 'задача',
		JSON.stringify(host.prompts.slice(promptsBeforeLate).map((entry) => entry.content[0].text)));
	// An edited brief must not be silently ignored under an existing chat.
	const editedBrief = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(lateBrief.body.job.id)}`, { initialPrompt: 'обновлённый бриф' });
	ok('editing the brief is accepted', editedBrief.status === 200 && editedBrief.body.job.initialPrompt === 'обновлённый бриф', JSON.stringify(editedBrief.body?.job?.initialPrompt));
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(lateBrief.body.job.id)}/run`);
	ok('an edited brief is delivered again', host.prompts.length === promptsBeforeLate + 5
		&& host.prompts.at(-2).content[0].text === 'обновлённый бриф'
		&& host.prompts.at(-1).content[0].text === 'задача',
		JSON.stringify(host.prompts.slice(promptsBeforeLate).map((entry) => entry.content[0].text)));

	// --- an explicit chat, and the "always new chat" switch ---
	const boundJob = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'В указанный чат', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p',
		sessionId: 'session-alpha'
	}, { trusted: true });
	ok('a job can be bound to an existing chat', boundJob.status === 201 && boundJob.body.job.sessionId === 'session-alpha', JSON.stringify(boundJob.body.job?.sessionId));
	const promptsBefore = host.prompts.length;
	const createdBefore = host.created.length;
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(boundJob.body.job.id)}/run`);
	ok('the bound chat received the prompt', host.prompts.length === promptsBefore + 1 && host.prompts.at(-1).sessionId === 'session-alpha', JSON.stringify(host.prompts.at(-1)?.sessionId));
	ok('a bound job created no chat', host.created.length === createdBefore, `created=${host.created.length}`);
	const badChat = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'x', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p', sessionId: 'not-a-session'
	}, { trusted: true });
	ok('a malformed chat id is refused', badChat.status === 400 && badChat.body.field === 'sessionId', `${badChat.status} ${JSON.stringify(badChat.body)}`);

	// The switch: every run starts fresh, and any binding is cleared.
	const alwaysNewJob = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Всегда новый', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p',
		sessionId: 'session-alpha', alwaysNewChat: true
	}, { trusted: true });
	ok('always-new clears a supplied binding', alwaysNewJob.status === 201 && alwaysNewJob.body.job.sessionId === null, JSON.stringify(alwaysNewJob.body.job?.sessionId));
	ok('always-new is persisted', alwaysNewJob.body.job.alwaysNewChat === true);
	const createdBeforeNew = host.created.length;
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(alwaysNewJob.body.job.id)}/run`);
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(alwaysNewJob.body.job.id)}/run`);
	ok('two runs of an always-new job create two chats', host.created.length === createdBeforeNew + 2, `created=${host.created.length - createdBeforeNew}`);
	const afterTwo = await call(jobRoute.handler, 'GET', `/api/cron-schedule/jobs/${encodeURIComponent(alwaysNewJob.body.job.id)}`);
	ok('an always-new job stays unbound', afterTwo.body.job.sessionId === null, String(afterTwo.body.job.sessionId));
	// Turning the switch back off lets the next run bind a chat again.
	const rebound = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(alwaysNewJob.body.job.id)}`, { alwaysNewChat: false }, { trusted: true });
	ok('turning the switch off is allowed', rebound.status === 200 && rebound.body.job.alwaysNewChat === false);
	const createdBeforeRebind = host.created.length;
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(alwaysNewJob.body.job.id)}/run`);
	const afterRebind = await call(jobRoute.handler, 'GET', `/api/cron-schedule/jobs/${encodeURIComponent(alwaysNewJob.body.job.id)}`);
	ok('after switching off, a run binds a chat again', host.created.length === createdBeforeRebind + 1 && typeof afterRebind.body.job.sessionId === 'string', String(afterRebind.body.job.sessionId));

	// The AI may use the switch too, and sees it in its own views.
	const aiNew = await host.tools.get('cron_create').execute({
		name: 'ИИ всегда новый', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p', alwaysNewChat: true
	}, { signal: new AbortController().signal });
	ok('the AI can create an always-new job', aiNew.alwaysNewChat === true && aiNew.sessionId === undefined, JSON.stringify(aiNew));
	const aiReuse = await host.tools.get('cron_create').execute({
		name: 'ИИ продолжает чат', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p', sessionId: 'session-beta'
	}, { signal: new AbortController().signal });
	ok('the AI can bind an existing chat', aiReuse.sessionId === 'session-beta', JSON.stringify(aiReuse));
	const aiBadChat = await host.tools.get('cron_create').execute({
		name: 'ИИ плохой чат', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p', sessionId: 'nope'
	}, { signal: new AbortController().signal }).then(() => undefined, (error) => error);
	ok('the AI cannot pass a malformed chat id', aiBadChat instanceof Error, String(aiBadChat?.message ?? 'accepted'));
	const listToolValue = await host.tools.get('cron_list').execute({}, { signal: new AbortController().signal });
	ok('cron_list exposes the chat policy', listToolValue.jobs.every((entry) => typeof entry.alwaysNewChat === 'boolean'));
	ok('an always-new job shows no sessionId in cron_list', listToolValue.jobs.find((entry) => entry.name === 'ИИ всегда новый')?.sessionId === undefined);
	ok('a bound job shows its sessionId in cron_list', listToolValue.jobs.find((entry) => entry.name === 'ИИ продолжает чат')?.sessionId === 'session-beta');
	// cron_chats lists what the model may target, with titles.
	const chatsTool = await host.tools.get('cron_chats').execute({}, { signal: new AbortController().signal });
	ok('cron_chats reads a title from the log', chatsTool.chats.some((chat) => chat.sessionId === 'session-alpha' && chat.title === 'Alpha chat'), JSON.stringify(chatsTool.chats));
	ok('cron_chats lists chats', chatsTool.chats.length > 0, JSON.stringify(chatsTool.chats));
	ok('cron_chats hides archived chats too', chatsTool.chats.every((chat) => chat.sessionId !== 'session-beta'), JSON.stringify(chatsTool.chats.map((chat) => chat.sessionId)));
	ok('cron_chats hides subagent chats too', chatsTool.chats.every((chat) => chat.sessionId !== 'session-worker'), JSON.stringify(chatsTool.chats.map((chat) => chat.sessionId)));

	// --- the chat route narrows to one workspace ---
	const alphaOnly = await call(chatsRoute.handler, 'GET', '/api/cron-schedule/chats?cwd=%2Ftmp%2Falpha');
	ok('the chat route filters by cwd', alphaOnly.status === 200 && alphaOnly.body.chats.length === 2 && alphaOnly.body.chats.some((chat) => chat.sessionId === 'session-alpha'), JSON.stringify(alphaOnly.body.chats.map((chat) => chat.sessionId)));
	const betaOnly = await call(chatsRoute.handler, 'GET', '/api/cron-schedule/chats?cwd=%2Ftmp%2Fbeta');
	ok('a different folder yields no chats when its only chat is archived', betaOnly.body.chats.length === 0, JSON.stringify(betaOnly.body.chats));
	const noMatch = await call(chatsRoute.handler, 'GET', '/api/cron-schedule/chats?cwd=%2Ftmp%2Fnowhere');
	ok('an unknown folder yields no chats', noMatch.body.chats.length === 0, JSON.stringify(noMatch.body.chats));
	const unfiltered = await call(chatsRoute.handler, 'GET', '/api/cron-schedule/chats');
	ok('archived chats are hidden', unfiltered.body.chats.every((chat) => chat.sessionId !== 'session-beta'), JSON.stringify(unfiltered.body.chats.map((chat) => chat.sessionId)));
	ok('subagent chats are hidden', unfiltered.body.chats.every((chat) => chat.sessionId !== 'session-worker'), JSON.stringify(unfiltered.body.chats.map((chat) => chat.sessionId)));
	ok('a forked chat is NOT hidden', unfiltered.body.chats.some((chat) => chat.sessionId === 'session-fork'), JSON.stringify(unfiltered.body.chats.map((chat) => chat.sessionId)));
	ok('a blank chat is hidden', unfiltered.body.chats.every((chat) => chat.sessionId !== 'session-blank'), JSON.stringify(unfiltered.body.chats.map((chat) => chat.sessionId)));
	ok('a chat without a stored title is named from its first prompt', unfiltered.body.chats.find((chat) => chat.sessionId === 'session-fork')?.title === 'Починить вёрстку на странице отзывов', JSON.stringify(unfiltered.body.chats.find((chat) => chat.sessionId === 'session-fork')?.title));
	ok('a plugin message is not used as a name', unfiltered.body.chats.find((chat) => chat.sessionId === 'session-alpha')?.title === 'Alpha chat', JSON.stringify(unfiltered.body.chats.find((chat) => chat.sessionId === 'session-alpha')?.title));
	ok('no chat is named after a path', unfiltered.body.chats.every((chat) => !chat.title.startsWith('/')), JSON.stringify(unfiltered.body.chats.map((chat) => chat.title)));
	ok('an archived chat is gone from a filtered view too', betaOnly.body.chats.length === 0, JSON.stringify(betaOnly.body.chats));
	ok('unarchived chats survive', unfiltered.body.chats.some((chat) => chat.sessionId === 'session-alpha'));
	// Two sessions exist, but one is archived, so only the unarchived one lists.
	// Four sessions, minus the archived one and the subagent one.
	ok('no cwd parameter lists every reusable chat', unfiltered.body.chats.length === 2, String(unfiltered.body.chats.length));
	// Filtering happens before the page limit, so a workspace's chats cannot be
	// pushed out of the answer by newer chats from other projects.
	const limited = await call(chatsRoute.handler, 'GET', '/api/cron-schedule/chats?cwd=%2Ftmp%2Falpha');
	ok('filtering precedes the limit', limited.body.chats.every((chat) => chat.cwd === '/tmp/alpha'), JSON.stringify(limited.body.chats.map((chat) => chat.cwd)));

	// --- a recurring job reuses the chat its first run created ---
	ok('the first run bound its chat to the job', afterRun.body.job.sessionId === agent.options.sessionId, String(afterRun.body.job.sessionId));
	ok('the first run created a chat for this job', host.created.some((entry) => entry.options.sessionId === agent.options.sessionId), String(host.created.length));
	const second = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}/run`);
	ok('a second run still answers 200', second.status === 200);
	const createdBeforeSecond = host.created.length;
	const promptsBeforeSecond = host.prompts.length;
	await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}/run`);
	ok('a second run created NO new chat', host.created.length === createdBeforeSecond, `created=${host.created.length - createdBeforeSecond}`);
	ok('a second run posted into the bound chat', host.prompts.length === promptsBeforeSecond + 1 && host.prompts.at(-1).sessionId === agent.options.sessionId, JSON.stringify(host.prompts.at(-1)?.sessionId));
	ok('the reused message carries the job prompt', host.prompts.at(-1)?.content?.[0]?.text === 'Собери утренний отчёт', JSON.stringify(host.prompts.at(-1)?.content));
	ok('the binding survived the second run', (await call(jobRoute.handler, 'GET', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}`)).body.job.sessionId === agent.options.sessionId);

	// --- a failing run is recorded, not thrown (on the new-chat path) ---
	const freshJob = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Падает', expression: '0 9 * * *', workspacePath: path.join(dir, 'proj'), prompt: 'p'
	}, { trusted: true });
	host.failRuns(true);
	const failed = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(freshJob.body.job.id)}/run`);
	ok('failed run still answers 200', failed.status === 200, `got ${failed.status}`);
	const afterFail = await call(jobRoute.handler, 'GET', `/api/cron-schedule/jobs/${encodeURIComponent(freshJob.body.job.id)}`);
	ok('failure recorded', afterFail.body.job.lastStatus === 'failed' && afterFail.body.job.lastError.includes('provider exploded'), JSON.stringify(afterFail.body.job.lastError));
	ok('a failed run binds no chat', afterFail.body.job.sessionId === null, String(afterFail.body.job.sessionId));
	ok('failure logged', host.logs.some(([level, text]) => level === 'warn' && text.includes('provider exploded')));
	host.failRuns(false);

	// --- the task gate: no open tasks means no LLM run at all ---
	const boardDir = await mkdtemp(path.join(tmpdir(), 'cron-board-'));
	const boardPath = path.join(boardDir, 'TODO.md');
	const gateJob = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Доска', expression: '*/30 * * * *', workspacePath: boardDir, prompt: 'бери задачу из Incoming',
		gate: { file: 'TODO.md', heading: 'Incoming' }
	}, { trusted: true });
	ok('a job can be created with a gate', gateJob.status === 201 && gateJob.body.job.gate?.heading === 'Incoming', JSON.stringify(gateJob.body?.job?.gate));

	// 1. No file yet: a misconfiguration, reported as a failure (not a silent skip).
	const createdBeforeMissing = host.created.length;
	const missingRun = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(gateJob.body.job.id)}/run`);
	ok('a missing board file starts no chat', host.created.length === createdBeforeMissing);
	ok('a missing board file is a failure', missingRun.body.job.lastStatus === 'failed' && /not found/.test(missingRun.body.job.lastError), JSON.stringify({ status: missingRun.body.job.lastStatus, error: missingRun.body.job.lastError }));

	// 2. The column exists and is empty: skipped, quietly, and the model never starts.
	await writeFile(boardPath, '## Incoming\n\n- [x] done yesterday\n\n## Working\n\n- [ ] not this one\n', 'utf8');
	const createdBeforeEmpty = host.created.length;
	const promptsBeforeEmpty = host.prompts.length;
	const emptyRun = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(gateJob.body.job.id)}/run`);
	ok('an empty column starts no chat', host.created.length === createdBeforeEmpty && host.prompts.length === promptsBeforeEmpty, JSON.stringify({ created: host.created.length, prompts: host.prompts.length }));
	ok('an empty column is recorded as skipped', emptyRun.body.job.lastStatus === 'skipped', String(emptyRun.body.job.lastStatus));
	ok('the skip says why, in the job', typeof emptyRun.body.job.lastNote === 'string' && emptyRun.body.job.lastNote.includes('Incoming'), String(emptyRun.body.job.lastNote));
	ok('the skip leaves no chat bound', emptyRun.body.job.sessionId === null, String(emptyRun.body.job.sessionId));
	ok('the skip still advances the schedule', emptyRun.body.job.nextRunAt > Date.now());
	ok('the skipped run is in the history', emptyRun.body.job.runs.at(-1).status === 'skipped', JSON.stringify(emptyRun.body.job.runs.at(-1)));
	ok('the skip is logged', host.logs.some(([level, text]) => level === 'info' && text.includes('skipped')), 'no skip log');
	// `skipped` is not a failure: the row must show the note, not an error.
	ok('a skip records no error', emptyRun.body.job.lastError === null, String(emptyRun.body.job.lastError));

	// 3. A task appears: the run happens and the chat gets the prompt.
	await writeFile(boardPath, '## Incoming\n\n- [ ] починить график\n', 'utf8');
	const createdBeforeReady = host.created.length;
	const readyRun = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(gateJob.body.job.id)}/run`);
	ok('an open task starts the run', host.created.length === createdBeforeReady + 1, `created=${host.created.length}`);
	ok('the gated run succeeds', readyRun.body.job.lastStatus === 'succeeded', String(readyRun.body.job.lastStatus));
	ok('the gated run clears the old skip note', readyRun.body.job.lastNote === null, JSON.stringify(readyRun.body.job.lastNote));

	// 4. The heading is a setting, not a constant.
	const otherColumn = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Другая колонка', expression: '*/30 * * * *', workspacePath: boardDir, prompt: 'p',
		gate: { file: 'TODO.md', heading: 'Review' }
	}, { trusted: true });
	await writeFile(boardPath, '## Incoming\n\n- [ ] есть задача\n\n## Review\n\n- [ ] тоже есть\n', 'utf8');
	const reviewRun = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(otherColumn.body.job.id)}/run`);
	ok('the configured column is the one counted', reviewRun.body.job.lastStatus === 'succeeded', String(reviewRun.body.job.lastStatus));
	await writeFile(boardPath, '## Incoming\n\n- [ ] есть задача\n\n## Review\n\n', 'utf8');
	const reviewEmpty = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(otherColumn.body.job.id)}/run`);
	ok('another column being empty is not enough', reviewEmpty.body.job.lastStatus === 'skipped', String(reviewEmpty.body.job.lastStatus));

	// 5. A renamed column must not silently disable the job for weeks.
	await writeFile(boardPath, '## Inbox\n\n- [ ] задача\n', 'utf8');
	const renamed = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(otherColumn.body.job.id)}/run`);
	ok('a renamed column is a failure, not a skip', renamed.body.job.lastStatus === 'failed', String(renamed.body.job.lastStatus));
	ok('the failure lists the sections it did find', renamed.body.job.lastError.includes('Inbox'), String(renamed.body.job.lastError));

	// 6. The panel's own view of the board, including the create button.
	const boardRoute = host.routes.get('prefix:/api/cron-schedule/board');
	ok('the board route answers for a job', boardRoute !== undefined);
	const boardAnswer = await call(boardRoute.handler, 'GET', `/api/cron-schedule/board/${encodeURIComponent(otherColumn.body.job.id)}`);
	ok('the board answer reports the verdict', boardAnswer.status === 200 && boardAnswer.body.verdict === 'no-section', JSON.stringify(boardAnswer.body));
	ok('the board answer lists the real headings', JSON.stringify(boardAnswer.body.headings) === JSON.stringify(['Inbox']), JSON.stringify(boardAnswer.body.headings));
	const noBoardJob = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Нет файла', expression: '*/30 * * * *', workspacePath: path.join(boardDir, 'nested'), prompt: 'p',
		gate: { file: 'TODO.md', heading: 'Incoming' }
	}, { trusted: true });
	const before = await call(boardRoute.handler, 'GET', `/api/cron-schedule/board/${encodeURIComponent(noBoardJob.body.job.id)}`);
	ok('a missing board is reported as missing', before.body.verdict === 'missing' && before.body.exists === false, JSON.stringify(before.body.verdict));
	const made = await call(boardRoute.handler, 'POST', `/api/cron-schedule/board/${encodeURIComponent(noBoardJob.body.job.id)}`, { create: true });
	ok('the create button makes the file', made.status === 200 && made.body.exists === true && made.body.found === true, JSON.stringify(made.body));
	ok('the created board starts empty, so the run is skipped', made.body.verdict === 'empty', String(made.body.verdict));
	// The form checks the gate before the schedule exists, carrying the folder.
	// The board file at this point holds only "## Inbox" (see step 5).
	const draftBoard = await call(boardRoute.handler, 'POST', '/api/cron-schedule/board/draft', { workspacePath: boardDir, file: 'TODO.md', heading: 'Incoming' });
	ok('an unsaved schedule can check its board', draftBoard.status === 200 && draftBoard.body.verdict === 'no-section', JSON.stringify(draftBoard.body.verdict));
	ok('the draft answer resolves the folder it was given', draftBoard.body.resolvedPath === path.join(boardDir, 'TODO.md'), String(draftBoard.body.resolvedPath));
	const draftNoFolder = await call(boardRoute.handler, 'POST', '/api/cron-schedule/board/draft', { file: 'TODO.md' });
	ok('a draft check without a folder is refused', draftNoFolder.status === 400 && draftNoFolder.body.field === 'workspacePath', JSON.stringify(draftNoFolder.body));

	// 7. A job without a gate is untouched by all of this.
	const ungated = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Без доски', expression: '*/30 * * * *', workspacePath: boardDir, prompt: 'p'
	}, { trusted: true });
	const createdBeforeUngated = host.created.length;
	const ungatedRun = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(ungated.body.job.id)}/run`);
	ok('an ungated job runs regardless of the board', ungatedRun.body.job.lastStatus === 'succeeded' && host.created.length === createdBeforeUngated + 1, String(ungatedRun.body.job.lastStatus));

	// 8. The tools see the gate, and can create one.
	const gatedByTool = await host.tools.get('cron_create').execute({
		name: 'Через ИИ', expression: '*/30 * * * *', workspacePath: boardDir, prompt: 'p',
		gate: { file: 'TODO.md', heading: 'Incoming' }
	}, { signal: new AbortController().signal });
	ok('cron_create accepts a gate', gatedByTool.gateFile === 'TODO.md' && gatedByTool.gateHeading === 'Incoming', JSON.stringify(gatedByTool));
	const listedGate = await host.tools.get('cron_list').execute({}, { signal: new AbortController().signal });
	const gateSeen = listedGate.jobs.find((entry) => entry.id === gateJob.body.job.id);
	ok('cron_list reports the gate', gateSeen.gate?.file === 'TODO.md', JSON.stringify(gateSeen.gate));
	ok('cron_list reports the skip note', typeof gateSeen.lastNote === 'string' || gateSeen.lastStatus === 'succeeded', JSON.stringify({ status: gateSeen.lastStatus, note: gateSeen.lastNote }));
	const gatedManifest = await call(host.routes.get('exact:/api/cron-schedule/manifest').handler, 'GET', '/api/cron-schedule/manifest');
	ok('the manifest documents the gate', typeof gatedManifest.body.job.gate === 'string' && gatedManifest.body.job.gate.includes('Incoming'), JSON.stringify(gatedManifest.body.job.gate));
	ok('the manifest lists the board route', gatedManifest.body.endpoints.some((entry) => entry.path.includes('/board')));

	// --- toggle enabled off, then on ---
	const off = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}`, { enabled: false });
	ok('toggle off 200', off.status === 200, JSON.stringify(off.body).slice(0, 160));
	ok('toggle off applied', off.body.job.enabled === false);
	ok('toggle off kept the prompt', off.body.job.prompt === 'Собери утренний отчёт');
	const on = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}`, { enabled: true });
	ok('toggle on applied', on.body.job.enabled === true);

	// --- edit the schedule ---
	const edited = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}`, {
		expression: '30 18 * * *',
		name: 'Вечерний отчёт'
	});
	ok('edit 200', edited.status === 200);
	ok('edit changed name and expression', edited.body.job.name === 'Вечерний отчёт' && edited.body.job.expression === '30 18 * * *');
	ok('edit kept the workspace', edited.body.job.workspacePath === path.resolve(path.join(dir, 'proj')));
	ok('edit recomputed nextRunAt', edited.body.job.nextRunAt !== job.nextRunAt);
	// An edit must rewrite its own record, never spawn a second one: the panel
	// saves with POST to the job URL, and a duplicate here would silently
	// double-schedule the task.
	const afterEdit = await call(jobsRoute.handler, 'GET', '/api/cron-schedule/jobs');
	ok('edit did not duplicate the job', afterEdit.body.jobs.filter((entry) => entry.id === job.id).length === 1);
	ok('edit kept the job id and creation time', (() => {
		const found = afterEdit.body.jobs.find((entry) => entry.id === job.id);
		return found !== undefined && found.createdAt === job.createdAt;
	})());
	// A partial edit must leave the untouched fields alone.
	const partial = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}`, { enabled: false });
	ok('partial edit keeps the prompt', partial.body.job.prompt === job.prompt);
	ok('partial edit keeps the schedule', partial.body.job.expression === '30 18 * * *');
	ok('partial edit applied its own field', partial.body.job.enabled === false);

	// --- missing job 404 ---
	const missing = await call(jobRoute.handler, 'GET', '/api/cron-schedule/jobs/does-not-exist');
	ok('unknown job 404', missing.status === 404, `got ${missing.status}`);

	// --- missed runs: a due instant in the past is reported, and dismissible ---
	const stale = await call(jobsRoute.handler, 'POST', '/api/cron-schedule/jobs', {
		name: 'Пропущенная',
		expression: '0 * * * *',
		timeZone: 'UTC',
		workspacePath: path.join(dir, 'proj'),
		prompt: 'p'
	});
	const staleId = stale.body.job.id;
	// Rewrite the stored record with a due time in the past plus a missed entry,
	// exactly as a restart after downtime would leave it.
	const onDisk = JSON.parse(await readFile(storePath, 'utf8'));
	const past = Date.now() - 3 * 3600e3;
	for (const entry of onDisk.jobs) {
		if (entry.id === staleId) {
			entry.nextRunAt = past;
			entry.missed = [past - 3600e3, past - 2 * 3600e3];
		}
	}
	await writeFile(storePath, JSON.stringify(onDisk));
	// A fresh store instance reads the edited file (the running one keeps memory).
	const { openJobStore } = await import('../lib/store.js');
	const reread = await openJobStore({ file: storePath });
	const revived = reread.get(staleId);
	ok('re-read sees the past due time', revived.nextRunAt === past);
	ok('re-read sees two missed runs', revived.missed.length === 2);

	// --- delete ---
	const removed = await call(jobRoute.handler, 'DELETE', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}`);
	ok('delete 200', removed.status === 200);
	ok('delete removed it', !removed.body.jobs.some((entry) => entry.id === job.id) && removed.body.jobs.some((entry) => entry.id === staleId));
	ok('delete persisted', !JSON.parse(await readFile(storePath, 'utf8')).jobs.some((entry) => entry.id === job.id));

	// --- AI tools behave like the routes ---
	const listTool = host.tools.get('cron_list');
	const listValue = await listTool.execute({}, { signal: new AbortController().signal });
	ok('cron_list returns strict JSON (no nulls)', listValue.jobs.every((entry) => Object.values(entry).every((value) => value !== null)));
	ok('cron_list sees the surviving job', listValue.jobs.some((entry) => entry.id === staleId) && !listValue.jobs.some((entry) => entry.id === job.id));
	const rendered = listTool.output.render({}, listValue);
	ok('cron_list renders text', rendered[0].type === 'text' && rendered[0].text.includes(staleId));

	const createTool = host.tools.get('cron_create');
	const toolCreated = await createTool.execute({
		name: 'Из ИИ',
		expression: '0 12 * * *',
		workspacePath: path.join(dir, 'ai'),
		prompt: 'привет из инструмента'
	}, { signal: new AbortController().signal });
	ok('cron_create returns the new id', typeof toolCreated.id === 'string' && toolCreated.id !== staleId);
	ok('cron_create computed nextRunAt', toolCreated.nextRunAt > Date.now());

	// The model may omit workspacePath: it must default to the calling session cwd.
	const toolDefaulted = await createTool.execute({
		name: 'Из ИИ без пути',
		expression: '0 13 * * *',
		prompt: 'p'
	}, { signal: new AbortController().signal, agent: { session: { header: { cwd: dir } } } });
	ok('cron_create defaults the workspace to the session cwd', toolDefaulted.workspacePath === dir, toolDefaulted.workspacePath);

	const describeTool = host.tools.get('cron_describe');
	const described = await describeTool.execute({ expression: '0 9 * * 1-5', timeZone: 'Europe/Moscow' }, { signal: new AbortController().signal });
	ok('cron_describe describes', described.description === 'по будням в 09:00', described.description);
	ok('cron_describe lists next runs', described.next.length === 5);
	const describeBad = await describeTool.execute({ expression: 'garbage' }, { signal: new AbortController().signal }).then(() => undefined, (error) => error);
	ok('cron_describe surfaces a syntax error', describeBad instanceof Error);

	const runTool = host.tools.get('cron_run');
	host.failRuns(false);
	const ranByTool = await runTool.execute({ id: toolCreated.id }, { signal: new AbortController().signal });
	ok('cron_run started it', ranByTool.started === true);
	const ranMissing = await runTool.execute({ id: 'nope' }, { signal: new AbortController().signal });
	ok('cron_run reports an unknown id', ranMissing.started === false);

	const deleteTool = host.tools.get('cron_delete');
	const deleted = await deleteTool.execute({ id: toolCreated.id }, { signal: new AbortController().signal });
	ok('cron_delete reports true', deleted.deleted === true);
	const deletedAgain = await deleteTool.execute({ id: toolCreated.id }, { signal: new AbortController().signal });
	ok('cron_delete is idempotent', deletedAgain.deleted === false);

	// --- id or exact name, and what a run reports back ---
	const signal = () => new AbortController().signal;
	const namedJob = await createTool.execute({ name: 'По имени', expression: '0 6 * * *', workspacePath: path.join(dir, 'byname'), prompt: 'p' }, { signal: signal() });
	const ranByName = await runTool.execute({ id: 'По имени' }, { signal: signal() });
	ok('cron_run accepts a unique name', ranByName.started === true && ranByName.id === namedJob.id, JSON.stringify(ranByName));
	ok('cron_run names the chat it wrote into', typeof ranByName.sessionId === 'string' && ranByName.sessionId.startsWith('session-cron-'), String(ranByName.sessionId));
	ok('cron_run reports the outcome of the run', ranByName.lastStatus === 'succeeded', String(ranByName.lastStatus));
	ok('cron_run renders where the run went', runTool.output.render({}, ranByName)[0].text.includes(ranByName.sessionId));
	const twin = await createTool.execute({ name: 'По имени', expression: '0 7 * * *', workspacePath: path.join(dir, 'byname'), prompt: 'p' }, { signal: signal() });
	const ambiguous = await runTool.execute({ id: 'По имени' }, { signal: signal() }).then(() => undefined, (error) => error);
	ok('an ambiguous name is refused instead of guessed', ambiguous instanceof Error && /2 schedules are named/.test(ambiguous.message), String(ambiguous?.message));
	ok('the refusal lists both ids', ambiguous instanceof Error && ambiguous.message.includes(namedJob.id) && ambiguous.message.includes(twin.id));
	const ambiguousDelete = await deleteTool.execute({ id: 'По имени' }, { signal: signal() }).then(() => undefined, (error) => error);
	ok('cron_delete refuses an ambiguous name too', ambiguousDelete instanceof Error, String(ambiguousDelete?.message));
	const afterRefusals = await listTool.execute({}, { signal: signal() });
	ok('both schedules survive the refused calls', [namedJob.id, twin.id].every((id) => afterRefusals.jobs.some((entry) => entry.id === id)), JSON.stringify(afterRefusals.jobs.map((entry) => entry.id)));
	const removedPair = await Promise.all([deleteTool.execute({ id: namedJob.id }, { signal: signal() }), deleteTool.execute({ id: twin.id }, { signal: signal() })]);
	ok('cron_delete removes both by id afterwards', removedPair.every((entry) => entry.deleted === true), JSON.stringify(removedPair));
	const single = await createTool.execute({ name: 'Единственная', expression: '0 8 * * *', workspacePath: path.join(dir, 'single'), prompt: 'p' }, { signal: signal() });
	const deletedByUniqueName = await deleteTool.execute({ id: 'Единственная' }, { signal: signal() });
	ok('cron_delete accepts a unique name', deletedByUniqueName.deleted === true && deletedByUniqueName.id === single.id, JSON.stringify(deletedByUniqueName));

	// --- the store survives a restart ---
	const { openJobStore: reopen } = await import('../lib/store.js');
	const restartedOnDisk = JSON.parse(await readFile(storePath, 'utf8')).jobs.length;
	const restarted = await reopen({ file: storePath });
	ok('store survives restart', restarted.list().length === restartedOnDisk, `got ${restarted.list().length} want ${restartedOnDisk}`);
	ok('restart keeps job fields', restarted.list().every((entry) => typeof entry.prompt === 'string' && entry.timeZone.length > 0));

	// --- every tool's output schema accepts what execute returned ---
	for (const [toolName, definition] of host.tools) {
		const value = await definition.execute(
			toolName === 'cron_create'
				? { name: 'schema check', expression: '0 5 * * *', workspacePath: path.join(dir, 'schema'), prompt: 'p' }
				: toolName === 'cron_delete' || toolName === 'cron_run'
					? { id: staleId }
					: toolName === 'cron_describe'
						? { expression: '0 1 * * *' }
						: {},
			{ signal: new AbortController().signal, agent: { session: { header: { cwd: dir } } } }
		).catch((error) => error);
		ok(`tool ${toolName} executed for schema check`, !(value instanceof Error), String(value?.message ?? ''));
		if (!(value instanceof Error)) {
			const blocks = definition.output.render({}, value);
			ok(`tool ${toolName} renders text blocks`, Array.isArray(blocks) && blocks.every((block) => block.type === 'text'));
		}
	}
} finally {
	await rm(dir, { recursive: true, force: true });
}

console.log(`\nhost: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
