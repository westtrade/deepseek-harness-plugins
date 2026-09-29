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
const { defaultStorePath, jobView, JobInputError, normalizeJob, openJobStore } = await import('./store.js' + REV);
const { createScheduler } = await import('./scheduler.js' + REV);
const { runJob } = await import('./runner.js' + REV);
const { describeCron, upcoming } = await import('./cron.js' + REV);

/** Cordis service name for this plugin. */
export const name = 'cron-schedule';

/** Services required: the Web server for the panel's route, the rest to run a chat. */
export const inject = ['webServer', 'agents', 'agentDefaultModel', 'workspaceRegistry', 'agentPresets', 'sessionTitle'];

/** Exact route answering the job list and accepting mutations. */
export const JOBS_PATH = '/api/cron-schedule/jobs';

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
			const job = normalizeJob(body, undefined, Date.now());
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
			const next = normalizeJob(body, existing, Date.now());
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

	registerTools(ctx, { store, scheduler, locale, toolJob });
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
	const { store, scheduler, locale, toolJob } = deps;
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
			description: 'Create a cron schedule. At each due time the harness starts a NEW chat in the given workspace directory and sends it the prompt as the first user message. Use cron_describe first when unsure about an expression.',
			parameters: {
				name: { type: 'string', required: true, description: 'Short human label for the schedule.' },
				expression: { type: 'string', required: true, description: 'Standard 5-field cron expression in the job time zone, e.g. "0 9 * * 1-5" for 09:00 on weekdays.' },
				workspacePath: { type: 'string', required: true, description: 'Absolute directory the new chat runs in. It is created when missing.' },
				prompt: { type: 'string', required: true, description: 'The task text delivered to the AI as the first message of each new chat.' },
				timeZone: { type: 'string', description: 'IANA time zone for the expression, e.g. "Europe/Moscow". Defaults to UTC.' },
				enabled: { type: 'boolean', description: 'Whether the schedule is active. Defaults to true.' }
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
						nextRunAt: { type: 'number' }
					}
				},
				render: (_args, value) => text(`Created cron schedule ${value.id} ("${value.name}"): ${value.expression}, next run ${new Date(value.nextRunAt).toISOString()} in ${value.workspacePath}.`)
			},
			async execute(args, exec) {
				const source = { ...args };
				if (source.workspacePath === undefined || String(source.workspacePath).trim() === '') {
					// Default to the calling chat's directory so "schedule this here"
					// works without the model guessing a path.
					const cwd = exec.agent?.session?.header?.cwd;
					if (typeof cwd !== 'string' || cwd === '') throw new Error('cron_create needs workspacePath, and this session has no working directory to default to');
					source.workspacePath = cwd;
				}
				const job = normalizeJob(source, undefined, Date.now());
				const stored = await store.put(job);
				await scheduler.reschedule(stored.id);
				const fresh = store.get(stored.id);
				return {
					id: fresh.id,
					name: fresh.name,
					expression: fresh.expression,
					workspacePath: fresh.workspacePath,
					nextRunAt: fresh.nextRunAt
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
