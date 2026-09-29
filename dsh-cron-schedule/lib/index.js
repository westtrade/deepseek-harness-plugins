/**
 * Host entry for `dsh-cron-schedule`: a durable cron scheduler that starts a new
 * chat in a chosen workspace when a job comes due, plus the HTTP surface the GUI
 * panel and the AI-facing tools share.
 *
 * Mount it beside the Web server (the web profile already composes one):
 *
 * ```yaml
 * - insert:
 *     - id: cron-schedule
 *       name: 'file:///…/dsh-cron-schedule/lib/index.js?rev=1'
 *       config:
 *         enabled: true
 * ```
 *
 * The plugin imports nothing outside `node:` builtins on purpose: a plugin
 * loaded through a symlinked workspace path resolves to its real path, where the
 * harness's own packages are not reachable. Every harness capability is used
 * through injected services instead.
 *
 * @module dsh-cron-schedule
 */

// The patch layer loads this entry as `…/lib/index.js?rev=N` so bumping `rev`
// re-reads the host code without restarting the Web server. That query only
// busts the cache of THIS module, so it is forwarded to every sibling import —
// otherwise a reload would pick up a new index.js while still running the old
// store/scheduler/cron code.
const REV = new URL(import.meta.url).search;
const { applyAutoCatchUp, defaultStorePath, jobView, JobInputError, normalizeAllowedModels, normalizeJob, openJobStore } = await import('./store.js' + REV);
const { createScheduler } = await import('./scheduler.js' + REV);
const { runJob } = await import('./runner.js' + REV);
const { describeCron, upcoming } = await import('./cron.js' + REV);

/** Cordis service name for this plugin. */
export const name = 'cron-schedule';

/**
 * Services required: the Web server for the panel's route, the rest to run a
 * chat. `connection` is the composition's browser-auth carrier and is declared
 * so the human-only `autoCatchUp` flag can be attributed to a real browser
 * session (see {@link makeTrustCheck}).
 */
export const inject = ['webServer', 'connection', 'llm', 'agents', 'agentDefaultModel', 'workspaceRegistry', 'agentPresets', 'sessionTitle'];

/** Exact route answering the job list and accepting mutations. */
export const JOBS_PATH = '/api/cron-schedule/jobs';

/** Exact route for the plugin settings (currently the model allow-list). */
export const SETTINGS_PATH = '/api/cron-schedule/settings';

/**
 * Prefix under which one job is addressed (`/api/cron-schedule/jobs/<id>`).
 *
 * Registered WITHOUT the trailing slash: `webServer.match` tests
 * `pathname.startsWith(prefix + '/')`, so a prefix that already ends in `/`
 * would need a double slash and would never match — requests would then fall
 * through to the `/api` auth fence and answer a bare 401.
 */
export const JOB_PATH_PREFIX = `${JOBS_PATH}/`;

/** Largest accepted request body. */
const MAX_BODY_BYTES = 64 * 1024;

/** Send one JSON response. */
function sendJson(res, status, payload) {
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store'
	});
	res.end(JSON.stringify(payload));
}

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

/**
 * Host plugin body: open the store, start the scheduler, register the routes and
 * the AI-facing tools.
 *
 * Async so the durable job list is loaded before the first request or tick can
 * arrive; Cordis awaits the returned promise before activating dependents.
 *
 * @param ctx - host context.
 * @param config - `enabled` (default true), `storePath`, `home`, `locale`.
 */
export async function apply(ctx, config = {}) {
	const locale = config.locale === 'en' ? 'en' : 'ru';
	const store = await openJobStore({
		file: config.storePath ?? defaultStorePath(config.home)
	});
	/**
	 * The services a run needs, captured once.
	 *
	 * Cordis resolves services per context: reading `ctx.agentPresets` inside a
	 * later callback (a timer tick, an HTTP handler) throws `cannot get property
	 * "agentPresets" without inject` because that read happens outside the
	 * injection scope. Collecting the references here — where the plugin's own
	 * `inject` list is in force — and handing them to the runner keeps scheduled
	 * runs working from any callback.
	 */
	const runtime = {
		agents: ctx.agents,
		agentDefaultModel: ctx.agentDefaultModel,
		workspaceRegistry: ctx.workspaceRegistry,
		agentPresets: ctx.agentPresets,
		sessionTitle: ctx.sessionTitle,
		// The model catalog, for the panel's model pickers and for validating the
		// allow-list against models this deployment can really route.
		llm: ctx.llm,
		// Held for the human-only `autoCatchUp` attribution, which runs inside a
		// request handler where the raw ctx can no longer resolve services.
		connection: ctx.connection,
		logger: ctx.logger
	};
	/** Broadcast hook: bumped after every mutation so the panel can poll cheaply. */
	let revision = 1;
	const scheduler = createScheduler({
		store,
		logger: ctx.logger,
		onChange: () => {
			revision += 1;
		},
		run: (job, options) => runJob(runtime, job, options)
	});

	ctx.effect(() => () => {
		void scheduler.stop();
	}, 'cron-schedule: scheduler stop');

	if (config.enabled !== false) {
		await store.flush();
		await scheduler.start();
	}

	/**
	 * Decide whether one request comes from a real browser session — i.e. from
	 * the person driving the Web panel.
	 *
	 * This is the only thing standing between the AI and the `autoCatchUp` flag,
	 * so it does not trust the request body, a header the caller could set, or
	 * which of our own routes was used. It asks the composition's `connection`
	 * service, whose `requestRejection` applies the Host/Origin fence plus the
	 * signed browser cookie issued at login:
	 *
	 * - `undefined` means the request passed both — a human at the GUI.
	 * - a status code (401/403) means it did not — the model's own tools, a
	 *   `curl` from a shell tool, a script, or a LAN caller.
	 *
	 * When no `connection` service exists (a headless composition), nothing is
	 * trusted, so the flag can never be raised there either.
	 *
	 * @param req - the incoming request.
	 * @returns `{ trusted }` describing the caller.
	 */
	function trust(req) {
		const connection = runtime.connection;
		if (connection === undefined || connection === null || typeof connection.requestRejection !== 'function') {
			return { trusted: false };
		}
		try {
			return { trusted: connection.requestRejection(req) === undefined };
		} catch (error) {
			ctx.logger.warn(`cron-schedule: could not attribute the request: ${String(error?.message ?? error)}`);
			return { trusted: false };
		}
	}

	/**
	 * Every model this deployment can actually route, as `{ provider, model,
	 * name }`, grouped by provider. Read from the LLM service, so the list is the
	 * deployment's real catalog rather than a hard-coded guess.
	 *
	 * @returns `{ models, failures }` — a provider that cannot list its catalog is
	 *   reported instead of failing the whole call.
	 */
	async function modelCatalog() {
		const models = [];
		const failures = [];
		let providers = [];
		try {
			providers = runtime.llm.listProviders();
		} catch (error) {
			return { models, failures: [{ provider: '(all)', message: String(error?.message ?? error) }] };
		}
		for (const provider of providers) {
			try {
				const listed = await runtime.llm.listModels(provider.id);
				for (const entry of listed) {
					models.push({
						provider: provider.id,
						model: entry.id,
						name: entry.name,
						providerName: provider.name
					});
				}
			} catch (error) {
				failures.push({ provider: provider.id, message: String(error?.message ?? error) });
			}
		}
		return { models, failures };
	}

	/** The current allow-list, as the store holds it. */
	const allowedModels = () => store.settings().allowedModels;

	/**
	 * The catalog as a flat `{ provider, model }` list, for validation.
	 *
	 * Cached briefly: a burst of panel saves should not re-list every provider,
	 * but a stale entry is harmless because the check only rejects typos.
	 */
	let catalogCache = { at: 0, entries: [] };
	async function routableEntries() {
		if (Date.now() - catalogCache.at < 30000 && catalogCache.entries.length > 0) return catalogCache.entries;
		try {
			const catalog = await modelCatalog();
			if (catalog.models.length > 0) {
				catalogCache = { at: Date.now(), entries: catalog.models.map((entry) => ({ provider: entry.provider, model: entry.model })) };
			}
		} catch (error) {
			ctx.logger.warn(`cron-schedule: could not read the model catalog: ${String(error?.message ?? error)}`);
		}
		return catalogCache.entries;
	}

	/** Read the request body as JSON, or throw a JobInputError. */
	async function readJson(req) {
		const text = await readBody(req);
		if (text === undefined) throw new JobInputError('request body is too large');
		if (text.trim() === '') return {};
		try {
			const parsed = JSON.parse(text);
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new JobInputError('request body must be a JSON object');
			}
			return parsed;
		} catch (error) {
			if (error instanceof JobInputError) throw error;
			throw new JobInputError(`invalid JSON: ${String(error?.message ?? error)}`);
		}
	}

	/** One job view plus its upcoming occurrences, for the panel. */
	function view(job) {
		const base = jobView(job, locale);
		let preview = [];
		try {
			preview = upcoming(job.expression, job.timeZone, Date.now(), 3);
		} catch {
			preview = [];
		}
		return { ...base, upcoming: preview };
	}

	/**
	 * The tool-facing view of one job.
	 *
	 * Tool output schemas are strict (`additionalProperties: false`, and a
	 * `null` is not a number), so this drops every absent field instead of
	 * emitting the panel's explicit nulls.
	 */
	function toolJob(job) {
		const base = jobView(job, locale);
		return {
			id: base.id,
			name: base.name,
			expression: base.expression,
			description: base.description,
			timeZone: base.timeZone,
			workspacePath: base.workspacePath,
			prompt: base.prompt,
			enabled: base.enabled,
			overdue: base.overdue,
			missed: base.missed,
			...(base.nextRunAt === null ? {} : { nextRunAt: base.nextRunAt }),
			...(base.lastStatus === null ? {} : { lastStatus: base.lastStatus }),
			...(base.lastSessionId === null ? {} : { lastSessionId: base.lastSessionId }),
			...(base.lastError === null ? {} : { lastError: base.lastError })
		};
	}

	/** The collection route: list, create, and bulk actions. */
	const jobsHandler = async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://dsh.invalid');
		try {
			if (req.method === 'GET' || req.method === 'HEAD') {
				sendJson(res, 200, {
					revision,
					locale,
					jobs: store.list().map(view)
				});
				return;
			}
			if (req.method !== 'POST') {
				res.writeHead(405, { allow: 'GET, HEAD, POST' });
				res.end();
				return;
			}
			const action = url.searchParams.get('action');
			const body = await readJson(req);
			if (action === 'dismiss-missed') {
				const id = String(body.id ?? '');
				if (store.get(id) === undefined) throw new JobInputError('unknown job id', 'id');
				await scheduler.dismissMissed(id);
				sendJson(res, 200, { ok: true, jobs: store.list().map(view) });
				return;
			}
			const job = applyAutoCatchUp(normalizeJob(body, undefined, Date.now(), allowedModels(), await routableEntries()), body, trust(req));
			const stored = await store.put(job);
			await scheduler.reschedule(stored.id);
			sendJson(res, 201, { ok: true, job: view(store.get(stored.id)) });
		} catch (error) {
			if (error instanceof JobInputError) {
				sendJson(res, 400, { error: error.message, field: error.field });
				return;
			}
			ctx.logger.error(error);
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	/** One job: patch, delete, run now, or preview an expression. */
	const jobHandler = async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://dsh.invalid');
		const rest = url.pathname.startsWith(JOB_PATH_PREFIX) ? url.pathname.slice(JOB_PATH_PREFIX.length) : '';
		const [rawId, sub] = rest.split('/');
		const id = decodeURIComponent(rawId ?? '');
		try {
			if (req.method === 'POST' && id === 'preview') {
				const body = await readJson(req);
				const expression = String(body.expression ?? '');
				const timeZone = body.timeZone === undefined ? 'UTC' : String(body.timeZone);
				const at = upcoming(expression, timeZone, Date.now(), 5);
				sendJson(res, 200, { description: describeCron(expression, locale), upcoming: at });
				return;
			}
			if (id === '') throw new JobInputError('job id is required in the path', 'id');
			const existing = store.get(id);
			if (existing === undefined) {
				sendJson(res, 404, { error: `unknown job "${id}"` });
				return;
			}
			if (req.method === 'GET' || req.method === 'HEAD') {
				sendJson(res, 200, { job: view(existing) });
				return;
			}
			if (req.method === 'DELETE') {
				await store.delete(id);
				scheduler.rearm();
				sendJson(res, 200, { ok: true, jobs: store.list().map(view) });
				return;
			}
			if (req.method !== 'POST') {
				res.writeHead(405, { allow: 'GET, HEAD, POST, DELETE' });
				res.end();
				return;
			}
			if (sub === 'run') {
				await scheduler.runNow(id);
				sendJson(res, 200, { ok: true, job: view(store.get(id) ?? existing) });
				return;
			}
			const body = await readJson(req);
			// `normalizeJob` fills every omitted field from the existing record, so
			// both a full edit and a bare `{enabled:false}` toggle work here.
			const next = applyAutoCatchUp(normalizeJob(body, existing, Date.now(), allowedModels(), await routableEntries()), body, trust(req));
			await store.put({ ...next, id: existing.id, createdAt: existing.createdAt });
			await scheduler.reschedule(id);
			sendJson(res, 200, { ok: true, job: view(store.get(id)) });
		} catch (error) {
			if (error instanceof JobInputError) {
				sendJson(res, 400, { error: error.message, field: error.field });
				return;
			}
			ctx.logger.error(error);
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	/**
	 * The settings route: read the model allow-list and the routable catalog, and
	 * write the allow-list.
	 *
	 * Only a person may change the list, for the same reason the catch-up switch
	 * is guarded: it is the policy that constrains what the AI is allowed to
	 * schedule, so the AI must not be able to widen it. Reading stays open, since
	 * the panel needs the catalog to render its pickers.
	 */
	const settingsHandler = async (req, res) => {
		try {
			if (req.method === 'GET' || req.method === 'HEAD') {
				const catalog = await modelCatalog();
				let fallback = null;
				try {
					const selection = runtime.agentDefaultModel.currentSelection();
					fallback = { provider: selection.provider, model: selection.model };
				} catch {
					fallback = null;
				}
				sendJson(res, 200, {
					allowedModels: allowedModels(),
					models: catalog.models,
					failures: catalog.failures,
					default: fallback
				});
				return;
			}
			if (req.method !== 'POST') {
				res.writeHead(405, { allow: 'GET, HEAD, POST' });
				res.end();
				return;
			}
			if (trust(req).trusted !== true) {
				throw new JobInputError('the allowed-model list can only be changed by a person in the Web panel', 'allowedModels');
			}
			const body = await readJson(req);
			const catalog = await modelCatalog();
			const available = catalog.models.map((entry) => ({ provider: entry.provider, model: entry.model }));
			const next = normalizeAllowedModels(body.allowedModels, available);
			await store.setSettings({ allowedModels: next });
			revision += 1;
			sendJson(res, 200, { ok: true, allowedModels: allowedModels() });
		} catch (error) {
			if (error instanceof JobInputError) {
				sendJson(res, 400, { error: error.message, field: error.field });
				return;
			}
			ctx.logger.error(error);
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: SETTINGS_PATH,
		handler: settingsHandler
	}), 'cron-schedule: settings route');
	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: JOBS_PATH,
		handler: jobsHandler
	}), 'cron-schedule: jobs route');
	ctx.effect(() => ctx.webServer.register({
		kind: 'prefix',
		path: JOBS_PATH,
		handler: jobHandler
	}), 'cron-schedule: job route');

	registerTools(ctx, { store, scheduler, locale, toolJob, modelCatalog, allowedModels, routableEntries, runtime });
}

/**
 * Register the AI-facing tools: the model can list, create, delete, and trigger
 * schedules, and ask for a description of an expression before saving it.
 *
 * @param ctx - host context carrying `tools` (looked up lazily so a deployment
 *   without the tool runtime still runs the scheduler).
 * @param deps - store, scheduler, locale, and the view helper.
 */
function registerTools(ctx, deps) {
	const { store, scheduler, locale, toolJob, modelCatalog, allowedModels, routableEntries, runtime } = deps;
	/** One text block. */
	const text = (value) => [{ type: 'text', text: value }];
	/** A tool definition in the shape the registry validates. */
	const tool = (definition) => definition;

	ctx.inject(['tools'], (toolCtx) => {
		const jobShape = {
			type: 'object',
			additionalProperties: false,
			properties: {
				id: { type: 'string', required: true },
				name: { type: 'string', required: true },
				expression: { type: 'string', required: true },
				description: { type: 'string', required: true },
				timeZone: { type: 'string', required: true },
				workspacePath: { type: 'string', required: true },
				prompt: { type: 'string', required: true },
				enabled: { type: 'boolean', required: true },
				model: { type: 'object', additionalProperties: false, properties: {
					provider: { type: 'string', required: true },
					model: { type: 'string', required: true }
				} },
				nextRunAt: { type: 'number' },
				lastRunAt: { type: 'number' },
				lastStatus: { type: 'string' },
				lastSessionId: { type: 'string' },
				lastError: { type: 'string' },
				missed: { type: 'array', items: { type: 'number' } },
				overdue: { type: 'boolean', required: true }
			}
		};
		const listOutput = {
			schema: {
				type: 'object',
				additionalProperties: false,
				properties: {
					jobs: { type: 'array', required: true, items: jobShape }
				}
			},
			render: (_args, value) => text(value.jobs.length === 0
				? 'No cron schedules are defined.'
				: value.jobs.map((job) => {
					const when = job.nextRunAt === undefined || job.nextRunAt === null
						? 'never'
						: new Date(job.nextRunAt).toISOString();
					return `${job.id} | ${job.enabled ? 'on ' : 'off'} | ${job.expression} (${job.description}) | next: ${when} | ${job.workspacePath}`;
				}).join('\n'))
		};

		toolCtx.tools.register(tool({
			name: 'cron_list',
			description: 'List every cron schedule: id, on/off, cron expression, human description, next run time, and the workspace directory each job runs in.',
			parameters: {},
			output: listOutput,
			async execute() {
				return { jobs: store.list().map(toolJob) };
			}
		}));

		toolCtx.tools.register(tool({
			name: 'cron_create',
			description: 'Create a cron schedule. At each due time the harness starts a NEW chat in the given workspace directory and sends it the prompt as the first user message. Use cron_describe first when unsure about an expression, and cron_models to see which models you may pick.',
			parameters: {
				name: { type: 'string', required: true, description: 'Short human label for the schedule.' },
				expression: { type: 'string', required: true, description: 'Standard 5-field cron expression in the job time zone, e.g. "0 9 * * 1-5" for 09:00 on weekdays.' },
				workspacePath: { type: 'string', required: true, description: 'Absolute directory the new chat runs in. It is created when missing.' },
				prompt: { type: 'string', required: true, description: 'The task text delivered to the AI as the first message of each new chat.' },
				timeZone: { type: 'string', description: 'IANA time zone for the expression, e.g. "Europe/Moscow". Defaults to UTC.' },
				enabled: { type: 'boolean', description: 'Whether the schedule is active. Defaults to true.' },
				model: {
					type: 'object',
					additionalProperties: false,
					description: 'Model the scheduled chat runs on. Call cron_models first and pick an entry from that list; omit to use the deployment default.',
					properties: {
						provider: { type: 'string', required: true, description: 'Provider id, exactly as cron_models reports it.' },
						model: { type: 'string', required: true, description: 'Model id, exactly as cron_models reports it.' }
					}
				}
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					properties: {
						id: { type: 'string', required: true },
						name: { type: 'string', required: true },
						expression: { type: 'string', required: true },
						workspacePath: { type: 'string', required: true },
						nextRunAt: { type: 'number' },
						provider: { type: 'string' },
						model: { type: 'string' }
					}
				},
				render: (_args, value) => text(`Created cron schedule ${value.id} ("${value.name}"): ${value.expression}, next run ${new Date(value.nextRunAt).toISOString()} in ${value.workspacePath}${value.model === undefined ? '' : ` on ${value.provider}/${value.model}`}.`)
			},
			async execute(args, exec) {
				const source = { ...args };
				// The AI must never be able to schedule an unattended catch-up.
				// `normalizeJob` already ignores this field on create, but dropping it
				// here too keeps the rule visible at the tool boundary — and the Host
				// route rejects the flag outright from any untrusted caller.
				delete source.autoCatchUp;
				if (source.workspacePath === undefined || String(source.workspacePath).trim() === '') {
					// Default to the calling chat's directory so "schedule this here"
					// works without the model guessing a path.
					const cwd = exec.agent?.session?.header?.cwd;
					if (typeof cwd !== 'string' || cwd === '') throw new Error('cron_create needs workspacePath, and this session has no working directory to default to');
					source.workspacePath = cwd;
				}
				// The person's allow-list is the policy for AI-created jobs too: a
				// model outside it is refused here as well as on the HTTP route.
				const job = normalizeJob(source, undefined, Date.now(), allowedModels(), await routableEntries());
				const stored = await store.put(job);
				await scheduler.reschedule(stored.id);
				const fresh = store.get(stored.id);
				return {
					id: fresh.id,
					name: fresh.name,
					expression: fresh.expression,
					workspacePath: fresh.workspacePath,
					nextRunAt: fresh.nextRunAt,
					...(fresh.model === undefined ? {} : { provider: fresh.model.provider, model: fresh.model.model })
				};
			}
		}));

		toolCtx.tools.register(tool({
			name: 'cron_delete',
			description: 'Delete one cron schedule by its exact id from cron_list or cron_create. The schedule stops firing immediately; chats it already started are untouched.',
			parameters: {
				id: { type: 'string', required: true, description: 'Exact schedule id.' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					properties: {
						deleted: { type: 'boolean', required: true },
						id: { type: 'string', required: true }
					}
				},
				render: (_args, value) => text(value.deleted ? `Deleted cron schedule ${value.id}.` : `No cron schedule with id ${value.id}.`)
			},
			async execute(args) {
				const id = String(args.id);
				const deleted = await store.delete(id);
				scheduler.rearm();
				return { deleted, id };
			}
		}));

		toolCtx.tools.register(tool({
			name: 'cron_run',
			description: 'Start one cron schedule immediately, out of band, without changing when it fires next. Useful to test a schedule right after creating it.',
			parameters: {
				id: { type: 'string', required: true, description: 'Exact schedule id.' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					properties: {
						started: { type: 'boolean', required: true },
						id: { type: 'string', required: true }
					}
				},
				render: (_args, value) => text(value.started ? `Started cron schedule ${value.id} now.` : `No cron schedule with id ${value.id}.`)
			},
			async execute(args) {
				const id = String(args.id);
				const started = await scheduler.runNow(id);
				return { started, id };
			}
		}));

		toolCtx.tools.register(tool({
			name: 'cron_models',
			description: 'List the models you may schedule on. When the person configured an allowed-model list, only those entries are accepted by cron_create; otherwise every model this deployment routes is listed and the deployment default is used when you omit the model.',
			parameters: {},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					properties: {
						restricted: { type: 'boolean', required: true },
						models: {
							type: 'array',
							required: true,
							items: {
								type: 'object',
								additionalProperties: false,
								properties: {
									provider: { type: 'string', required: true },
									model: { type: 'string', required: true },
									name: { type: 'string', required: true }
								}
							}
						},
						defaultProvider: { type: 'string' },
						defaultModel: { type: 'string' }
					}
				},
				render: (_args, value) => text(value.models.length === 0
					? 'No model is available to schedule on in this deployment.'
					: `${value.restricted ? 'You may only schedule these models' : 'Any of these models may be scheduled'}:\n${value.models.map((entry) => `  ${entry.provider}/${entry.model}  (${entry.name})`).join('\n')}${value.defaultModel === undefined ? '' : `\nDefault when omitted: ${value.defaultProvider}/${value.defaultModel}`}`)
			},
			async execute() {
				const allowed = allowedModels();
				const restricted = allowed.length > 0;
				const catalog = await modelCatalog();
				const byKey = new Map(catalog.models.map((entry) => [`${entry.provider}\u0000${entry.model}`, entry]));
				const models = (restricted ? allowed : catalog.models.map((entry) => ({ provider: entry.provider, model: entry.model })))
					.map((entry) => {
						const found = byKey.get(`${entry.provider}\u0000${entry.model}`);
						return { provider: entry.provider, model: entry.model, name: found?.name ?? entry.model };
					});
				let defaultProvider;
				let defaultModel;
				try {
					const selection = runtime.agentDefaultModel.currentSelection();
					defaultProvider = selection.provider;
					defaultModel = selection.model;
				} catch {
					defaultProvider = undefined;
					defaultModel = undefined;
				}
				return {
					restricted,
					models,
					...(defaultProvider === undefined ? {} : { defaultProvider }),
					...(defaultModel === undefined ? {} : { defaultModel })
				};
			}
		}));

		toolCtx.tools.register(tool({
			name: 'cron_describe',
			description: 'Explain a cron expression and list its next occurrences without saving anything. Use it to confirm a schedule before cron_create.',
			parameters: {
				expression: { type: 'string', required: true, description: 'Standard 5-field cron expression, e.g. "*/15 9-18 * * 1-5".' },
				timeZone: { type: 'string', description: 'IANA time zone, e.g. "Europe/Moscow". Defaults to UTC.' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					properties: {
						description: { type: 'string', required: true },
						next: { type: 'array', required: true, items: { type: 'string' } }
					}
				},
				render: (_args, value) => text(`${value.description}\nNext: ${value.next.join(', ') || 'never'}`)
			},
			async execute(args) {
				const expression = String(args.expression);
				const timeZone = args.timeZone === undefined ? 'UTC' : String(args.timeZone);
				const next = upcoming(expression, timeZone, Date.now(), 5).map((at) => new Date(at).toISOString());
				return { description: describeCron(expression, locale), next };
			}
		}));
	});
}
