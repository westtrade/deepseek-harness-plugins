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

import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
				tools.set(definition.name, definition);
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
	ok('six AI tools registered', host.tools.size === 6, [...host.tools.keys()].join(','));
	for (const toolName of ['cron_list', 'cron_create', 'cron_delete', 'cron_run', 'cron_models', 'cron_describe']) {
		ok(`tool ${toolName} present`, host.tools.has(toolName));
	}
	ok('scheduler stop effect registered', host.effects.includes('cron-schedule: scheduler stop'));

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
	// A typo must not become a policy that silently never matches.
	const unknown = await call(settingsRoute.handler, 'POST', '/api/cron-schedule/settings', {
		allowedModels: [{ provider: 'router-ai', model: 'nope/does-not-exist' }]
	}, { trusted: true });
	ok('an unknown model is refused', unknown.status === 400 && unknown.body.field === 'allowedModels', JSON.stringify(unknown.body));

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
	ok('run advanced nextRunAt into the future', afterRun.body.job.nextRunAt > Date.now());

	// --- a failing run is recorded, not thrown ---
	host.failRuns(true);
	const failed = await call(jobRoute.handler, 'POST', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}/run`);
	ok('failed run still answers 200', failed.status === 200, `got ${failed.status}`);
	const afterFail = await call(jobRoute.handler, 'GET', `/api/cron-schedule/jobs/${encodeURIComponent(job.id)}`);
	ok('failure recorded', afterFail.body.job.lastStatus === 'failed' && afterFail.body.job.lastError.includes('provider exploded'), JSON.stringify(afterFail.body.job.lastError));
	ok('failure logged', host.logs.some(([level, text]) => level === 'warn' && text.includes('provider exploded')));

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
	const { writeFile } = await import('node:fs/promises');
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
