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
const { applyAutoCatchUp, defaultStorePath, jobView, JobInputError, MAX_PROMPT_CHARS, normalizeAllowedModels, normalizeJob, openJobStore } = await import('./store.js' + REV);
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
export const inject = ['webServer', 'settings', 'connection', 'llm', 'agents', 'agentDefaultModel', 'workspaceRegistry', 'agentPresets', 'sessionTitle', 'sessionController', 'sessionQuery', 'sessions', 'sessionProjections'];

/** Exact route answering the job list and accepting mutations. */
export const JOBS_PATH = '/api/cron-schedule/jobs';

/** Exact route for the plugin settings (currently the model allow-list). */
export const SETTINGS_PATH = '/api/cron-schedule/settings';

/** Exact route listing the chats a job may be bound to. */
export const CHATS_PATH = '/api/cron-schedule/chats';

/**
 * Exact route describing this plugin to a model or a person in one request.
 *
 * The model normally meets the plugin as seven tools in its own tool list. This
 * route exists for the other cases: a chat that started before the plugin was
 * installed, a headless composition, or an agent that only speaks HTTP. It is
 * read-only and needs no browser session, exactly like `GET …/jobs`.
 */
export const MANIFEST_PATH = '/api/cron-schedule/manifest';

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
 * Settings namespace this plugin publishes to the harness settings service.
 *
 * Registering here — rather than only keeping the value in the plugin's own
 * file — is what makes the card appear on Settings → Plugins → Plugin
 * Configuration, because that tab renders exactly the namespaces the Host
 * serves. The plugin's own store stays the fallback for a deployment with no
 * settings provider.
 */
export const SETTINGS_NAMESPACE = 'cron-schedule';

/**
 * A schemastery-shaped schema built without importing schemastery.
 *
 * The plugin may not import the harness's packages (a workspace symlink
 * resolves to its real path, where they are unreachable), but the settings
 * service only needs an object that is callable as a resolver and carries the
 * introspection the service reads: a `toJSON()` for `describe()`, and
 * `type`/`dict`/`inner`/`meta` for its secret walker. This provides exactly
 * that, with the same defaults semantics — absent fields resolve to their
 * defaults.
 *
 * @returns the schema object accepted by `settings.register`.
 */
function cronSettingsSchema() {
	const route = { type: 'object', dict: { provider: { type: 'string' }, model: { type: 'string' } } };
	const schema = (value) => {
		const source = value !== null && typeof value === 'object' ? value : {};
		const list = Array.isArray(source.allowedModels) ? source.allowedModels : [];
		return {
			allowedModels: list
				.filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.provider === 'string' && typeof entry.model === 'string')
				.map((entry) => ({ provider: entry.provider, model: entry.model }))
		};
	};
	schema.type = 'object';
	schema.dict = { allowedModels: { type: 'array', inner: route } };
	schema.meta = {};
	schema.toJSON = () => ({
		type: 'object',
		properties: {
			allowedModels: {
				type: 'array',
				description: 'Models a cron schedule may be assigned; empty means every routed model.',
				items: { type: 'object', properties: { provider: { type: 'string' }, model: { type: 'string' } } }
			}
		}
	});
	return schema;
}

/**
 * Publish the plugin's settings namespace and keep the plugin's own store in
 * step with it, so the value survives whether it was written on the Plugins
 * page or through this plugin's HTTP route.
 *
 * @param ctx - host context.
 * @param store - the plugin's job store, whose settings section mirrors the
 *   namespace for a deployment without a settings provider.
 * @returns the settings scope, or undefined when no provider is composed.
 */
function registerSettingsSection(ctx, store, settings) {
	try {
		if (settings === undefined || settings === null || typeof settings.register !== 'function') return undefined;
		const scope = settings.register(SETTINGS_NAMESPACE, cronSettingsSchema(), {
			base: { allowedModels: store.settings().allowedModels },
			applies: 'live'
		});
		// A write from the Plugins page must reach the cron routes, and a write
		// from them must be visible there; mirroring both ways keeps one value.
		scope.watch((next) => {
			const list = Array.isArray(next?.allowedModels) ? next.allowedModels : [];
			void store.setSettings({ allowedModels: list }).catch((error) => {
				ctx.logger.warn(`cron-schedule: could not mirror settings into the store: ${String(error?.message ?? error)}`);
			});
		});
		return scope;
	} catch (error) {
		ctx.logger.warn(`cron-schedule: settings namespace unavailable: ${String(error?.message ?? error)}`);
		return undefined;
	}
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
		// Delivers a run into an already-existing chat, resuming a cold session
		// first when needed — the same admission path the Web composer uses.
		sessionController: ctx.sessionController,
		// Reads each chat's own log so the dropdown shows real titles, including
		// for stored-but-closed chats that have no live session object.
		sessionQuery: ctx.sessionQuery,
		// The live session store, for reading a chat's last-used model.
		sessions: ctx.sessions,
		// Publishes this plugin's settings namespace to the Plugins page.
		settings: ctx.settings,
		sessionProjections: ctx.sessionProjections,
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
	/**
	 * The tool surface this plugin declares, for the manifest route. Filled by
	 * {@link registerTools} from the same definitions it registers, so the
	 * description cannot drift from what the registry holds.
	 */
	const toolCatalog = [];
	const scheduler = createScheduler({
		store,
		logger: ctx.logger,
		onChange: () => {
			revision += 1;
		},
		// A run without its own model follows the model used most recently in a
		// chat; that resolution is async, so it is awaited here and handed in.
		run: async (job, options) => runJob(runtime, job, { ...options, fallbackModel: await preferredModel() })
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

	/**
	 * The plugin's own settings namespace, registered with the harness settings
	 * service so it appears on Settings → Plugins → Plugin Configuration beside
	 * the shipped cards. The store keeps the same value as a fallback for a
	 * deployment that composes no settings provider.
	 */
	const settingsSection = registerSettingsSection(ctx, store, runtime.settings);

	/** The current allow-list: the settings namespace first, the store otherwise. */
	const allowedModels = () => {
		const fromSettings = settingsSection?.get()?.allowedModels;
		return Array.isArray(fromSettings) && fromSettings.length > 0 ? fromSettings : store.settings().allowedModels;
	};

	/**
	 * The model a schedule falls back to when it names none.
	 *
	 * That is the model most recently used in a chat — the same one the composer's
	 * picker shows — so a person who has been working in one model gets it for a
	 * new schedule too. The deployment default is only the last resort.
	 *
	 * @returns `{ provider, model }`, or undefined when nothing is known.
	 */
	async function preferredModel() {
		try {
			const controller = runtime.sessionController;
			if (controller !== undefined && typeof controller.list === 'function') {
				const raw = await controller.list();
				const sessions = Array.isArray(raw) ? raw : (Array.isArray(raw?.value) ? raw.value : (Array.isArray(raw?.items) ? raw.items : []));
				const ordered = [...sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
				for (const entry of ordered.slice(0, 25)) {
					const session = runtime.sessions?.get?.(entry.sessionId);
					if (session === undefined) continue;
					const state = runtime.sessionProjections?.stateOf?.(session, 'modelSelection');
					const used = state?.lastUsed;
					if (used !== null && used !== undefined && typeof used.provider === 'string' && typeof used.model === 'string') {
						return { provider: used.provider, model: used.model };
					}
				}
			}
		} catch (error) {
			ctx.logger.warn(`cron-schedule: could not read the last used model: ${String(error?.message ?? error)}`);
		}
		try {
			const selection = runtime.agentDefaultModel.currentSelection();
			return { provider: selection.provider, model: selection.model };
		} catch {
			return undefined;
		}
	}

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
			...(base.initialPrompt === null || base.initialPrompt === undefined ? {} : { initialPrompt: base.initialPrompt }),
			enabled: base.enabled,
			alwaysNewChat: base.alwaysNewChat === true,
			overdue: base.overdue,
			missed: base.missed,
			...(base.sessionId === null ? {} : { sessionId: base.sessionId }),
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
				const after = view(store.get(id) ?? existing);
				// The run is synchronous, so its outcome is already stored. Repeat
				// the two fields a caller cares about at the top level: a script or
				// an agent then needs no second request (and no knowledge of the
				// job view) to learn which chat the task reached.
				sendJson(res, 200, {
					ok: true,
					job: after,
					sessionId: after.lastSessionId ?? null,
					lastStatus: after.lastStatus ?? null
				});
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
	 *
	 * A person's write keeps only what this deployment can route (plus entries
	 * from a provider that could not be listed at all) and answers the rest as
	 * `dropped`, so a model that has since left the catalog cannot block the
	 * whole card from ever being saved.
	 */
	const settingsHandler = async (req, res) => {
		try {
			if (req.method === 'GET' || req.method === 'HEAD') {
				const catalog = await modelCatalog();
				// `default` is the model a schedule without its own choice runs on:
				// the most recently used one in a chat, not the deployment default.
				const fallback = await preferredModel();
				sendJson(res, 200, {
					allowedModels: allowedModels(),
					models: catalog.models,
					failures: catalog.failures,
					default: fallback ?? null
				});
				return;
			}
			if (req.method !== 'POST') {
				res.writeHead(405, { allow: 'GET, HEAD, POST' });
				res.end();
				return;
			}
			const person = trust(req).trusted === true;
			if (!person) {
				throw new JobInputError('the allowed-model list can only be changed by a person in the Web panel', 'allowedModels');
			}
			const body = await readJson(req);
			const catalog = await modelCatalog();
			const available = catalog.models.map((entry) => ({ provider: entry.provider, model: entry.model }));
			const keyOf = (entry) => `${entry.provider}\u0000${entry.model}`;
			const routable = new Set(available.map(keyOf));
			/*
			 * The panel can only render and tick models the catalog lists, yet it
			 * always posts the whole list — entries stored earlier included. Once a
			 * provider drops or renames a model, such an entry is invisible in the
			 * card, so a person cannot untick it, and refusing the write would leave
			 * the list unsavable for good. A person's write therefore drops the
			 * entries this deployment no longer serves and reports them back; only
			 * their shape is validated.
			 *
			 * A provider whose listing failed cannot be checked at all, so its
			 * entries are kept as they are: an unrelated provider hiccup must not
			 * quietly erase the list. `'(all)'` is the sentinel for "nothing could
			 * be listed", which also leaves nothing verifiable.
			 */
			const unverifiable = new Set(catalog.failures.map((failure) => failure.provider));
			const blind = catalog.models.length === 0 && catalog.failures.length > 0;
			const keep = (entry) => blind || routable.has(keyOf(entry)) || unverifiable.has(entry.provider);
			const asked = normalizeAllowedModels(body.allowedModels);
			const next = asked.filter(keep);
			const dropped = asked.filter((entry) => !keep(entry)).map((entry) => `${entry.provider}/${entry.model}`);
			if (dropped.length > 0) {
				ctx.logger.warn(`cron-schedule: not saved as allowed models, this deployment cannot route them: ${dropped.join(', ')}`);
			}
			await store.setSettings({ allowedModels: next });
			// Keep the settings namespace authoritative too, so the Plugins page
			// shows the same list this route just stored.
			try {
				await settingsSection?.replace({ allowedModels: next });
			} catch (error) {
				ctx.logger.warn(`cron-schedule: could not update the settings namespace: ${String(error?.message ?? error)}`);
			}
			revision += 1;
			sendJson(res, 200, { ok: true, allowedModels: allowedModels(), dropped });
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
	 * The chat list the panel's "existing chat" dropdown offers.
	 *
	 * Read through `sessionController.list()`, which returns every attached and
	 * persisted session without activating an agent. Titles come from the
	 * `title` projection, so the dropdown shows the same names as the sidebar;
	 * a session that has no title yet falls back to its working directory.
	 */
	/**
	 * The title of one session, folded from its own log.
	 *
	 * The `session/title` event is the source of truth (the same fold the harness
	 * uses for the sidebar), so this reads the log through `sessionQuery` rather
	 * than a projection cell — which needs a live session object and would leave
	 * every stored-but-closed chat untitled.
	 *
	 * @param sessionId - the session to look up.
	 * @returns the title, or undefined when the chat has none yet.
	 */
	/**
	 * Title cache: a session's title is stable once set, and reading a log is the
	 * expensive part, so the first answer is kept and reused. Entries without a
	 * title are cached too, but expire quickly, because the harness generates one
	 * from the first messages shortly after a chat starts.
	 */
	const titleCache = new Map();
	const TITLE_MISS_TTL_MS = 30000;

	/**
	 * The name of one chat, folded from its own log.
	 *
	 * The `session/title` event is the source of truth (the same fold the harness
	 * uses for the sidebar). A chat that never got a stored title — one whose
	 * title generation never ran, which is the norm for sessions created
	 * programmatically — falls back to the opening of its first user message, the
	 * same input the harness itself derives a fallback title from. Returning
	 * `undefined` here would make the caller show a bare directory path, which
	 * tells the reader nothing about the conversation.
	 *
	 * @param sessionId - the session to look up.
	 * @returns the title, or undefined when the chat has no usable text at all.
	 */
	async function titleOf(sessionId) {
		const cached = titleCache.get(sessionId);
		if (cached !== undefined && (cached.title !== undefined || Date.now() - cached.at < TITLE_MISS_TTL_MS)) {
			return cached.title;
		}
		const query = runtime.sessionQuery;
		if (query === undefined) return undefined;
		let title;
		try {
			// `readTitle` is the harness's own log-backed fold and, unlike a full
			// `readSession`, it does not re-validate the log: a forked session's
			// inherited prefix fails that validation, which is why every fork
			// previously fell through to showing its directory path.
			if (typeof query.readTitle === 'function') {
				const snapshot = await query.readTitle(sessionId);
				const text = snapshot?.title;
				if (typeof text === 'string' && text.trim() !== '') title = text;
			}
		} catch (error) {
			ctx.logger.warn(`cron-schedule: could not read the title of "${sessionId}": ${String(error?.message ?? error)}`);
		}
		if (title === undefined) {
			// No stored title: derive one from the first real user message, the same
			// input the harness's own fallback title uses. A session whose title
			// generation never ran — the norm for programmatically created chats —
			// would otherwise show only a bare directory path.
			try {
				const events = typeof query.listEvents === 'function' ? await query.listEvents(sessionId) : [];
				for (const event of Array.isArray(events) ? events : []) {
					if (event?.type !== 'user/message') continue;
					if (event.data?.source?.kind !== 'user') continue;
					const content = Array.isArray(event.data?.content) ? event.data.content : [];
					const text = content.filter((block) => block?.type === 'text').map((block) => block.text).join('\n').trim();
					if (text === '') continue;
					const words = text.split(/\s+/).slice(0, 8).join(' ');
					title = words.length > 60 ? `${words.slice(0, 57)}…` : words;
					break;
				}
			} catch (error) {
				ctx.logger.warn(`cron-schedule: could not derive a name for "${sessionId}": ${String(error?.message ?? error)}`);
			}
		}
		titleCache.set(sessionId, { at: Date.now(), title });
		return title;
	}

	/**
	 * The archived session ids, as the workspace registry holds them.
	 *
	 * A missing registry (a headless composition) means nothing is archived, so
	 * the list stays complete rather than silently emptying.
	 *
	 * @returns an array of session ids.
	 */
	function archivedSessionIds() {
		try {
			const ids = runtime.workspaceRegistry?.archivedSessionIds;
			return Array.isArray(ids) ? ids.map(String) : [];
		} catch (error) {
			ctx.logger.warn(`cron-schedule: could not read the archived-session set: ${String(error?.message ?? error)}`);
			return [];
		}
	}

	/**
	 * The chat list a run may be bound to, newest activity first.
	 *
	 * Cost matters here: a deployment can hold hundreds of stored sessions, and
	 * folding every log to find a title took ten seconds. So titles come from the
	 * `list()` projection when it carries one, and the log is read only for the
	 * small page actually returned.
	 *
	 * @param limit - how many chats to return.
	 * @param cwd - when given, only chats created in that directory. Filtering
	 *   happens BEFORE the page limit, so a workspace's chats can never be
	 *   pushed out of the list by newer chats from other projects.
	 * @returns the chat rows, newest first, without archived, subagent or blank
	 *   chats, each with a readable name.
	 */
	async function listChats(limit = 100, cwd) {
		const controller = runtime.sessionController;
		if (controller === undefined || typeof controller.list !== 'function') return [];
		const raw = await controller.list();
		// A remote-wrapped controller answers `{ ok, value }`; a direct service
		// call answers the array. Accept both so the route is transport-agnostic.
		const sessions = Array.isArray(raw) ? raw : (Array.isArray(raw?.value) ? raw.value : (Array.isArray(raw?.items) ? raw.items : []));
		// Archived chats are hidden on purpose: the person put them away, so
		// offering them for reuse would resurface exactly what they filed off.
		const archived = new Set(archivedSessionIds());
		// Subagent chats are hidden too: they belong to a parent run's delegation,
		// so a schedule must never post into one. The test is `origin` alone —
		// `parentSessionId` is NOT a proxy, because a forked chat also carries a
		// parent and is an ordinary chat the person may well want to reuse.
		// Blank sessions are hidden as well: a chat with no messages is a chat the
		// person never used, and it would show up with no name to recognise.
		const visible = sessions.filter((entry) => !archived.has(entry.sessionId)
			&& entry.origin !== 'subagent'
			&& entry.blank !== true);
		const scoped = typeof cwd === 'string' && cwd !== ''
			? visible.filter((entry) => entry.cwd === cwd)
			: visible;
		const ordered = [...scoped].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
		const page = Number.isFinite(limit) && limit > 0 ? ordered.slice(0, limit) : ordered;
		const rows = new Array(page.length);
		// Two passes: rows the cached projection can title are resolved at once,
		// and only the rest read their log — with a small concurrency cap, because
		// a burst of log reads is what made this route slow in the first place.
		const pending = [];
		page.forEach((entry, index) => {
			const projected = entry.projections?.values?.title;
			if (typeof projected === 'string' && projected.trim() !== '') {
				rows[index] = { entry, title: projected };
				return;
			}
			pending.push(index);
		});
		const CONCURRENCY = 8;
		let cursor = 0;
		const worker = async () => {
			while (cursor < pending.length) {
				const index = pending[cursor];
				cursor += 1;
				rows[index] = { entry: page[index], title: await titleOf(page[index].sessionId) };
			}
		};
		await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
		return rows.map(({ entry, title }) => ({
			sessionId: entry.sessionId,
			title: title ?? entry.cwd ?? entry.sessionId,
			...(typeof entry.cwd === 'string' ? { cwd: entry.cwd } : {}),
			updatedAt: entry.updatedAt
		}));
	}

	/**
	 * The self-description route.
	 *
	 * Everything an agent needs to use this plugin without reading its sources:
	 * the tools it can call (with their descriptions), the fields a job takes,
	 * and the HTTP routes with a flag saying which of them a person must be
	 * behind.
	 */
	const manifestHandler = async (req, res) => {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405, { allow: 'GET, HEAD' });
			res.end();
			return;
		}
		sendJson(res, 200, {
			plugin: name,
			package: 'dsh-cron-schedule',
			summary: 'Durable cron schedules: at each due time the harness starts a new chat in a chosen directory and sends it a task, or continues one chat for a recurring task.',
			tools: toolCatalog.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })),
			job: {
				name: 'string, 1–120 chars — short human label',
				expression: 'string, 5-field cron, e.g. "*/30 * * * *" — must fire at least once',
				timeZone: 'IANA zone, e.g. "Europe/Moscow" (default "UTC")',
				workspacePath: 'absolute directory the chat runs in (created when missing)',
				prompt: `string, 1–${MAX_PROMPT_CHARS} chars — the task delivered on every run`,
				initialPrompt: `string, 0–${MAX_PROMPT_CHARS} chars, optional — our setup brief, delivered once into the chat the job creates (before the first task); absent means the task alone`,
				enabled: 'boolean (default true) — whether the schedule fires',
				model: '{ provider, model } | null — must be an entry of cron_models / the allow-list; null means the deployment default',
				alwaysNewChat: 'boolean (default false) — every run starts a fresh chat; otherwise the first run creates one and later runs continue it',
				sessionId: 'string | null — bind an existing chat (from cron_chats); ignored while alwaysNewChat is on',
				autoCatchUp: 'boolean — HUMAN ONLY: replay runs missed while DSH was down (the AI tools drop this field)'
			},
			fields: ['id', 'name', 'expression', 'description', 'timeZone', 'workspacePath', 'prompt', 'initialPrompt', 'enabled', 'alwaysNewChat', 'overdue', 'missed', 'sessionId', 'nextRunAt', 'lastStatus', 'lastSessionId', 'lastError'],
			lastStatus: ['started', 'succeeded', 'failed'],
			endpoints: [
				{ method: 'GET', path: MANIFEST_PATH, humanOnly: false, purpose: 'this description' },
				{ method: 'GET', path: JOBS_PATH, humanOnly: false, purpose: 'list schedules with their next run and last outcome' },
				{ method: 'POST', path: JOBS_PATH, humanOnly: false, purpose: 'create a schedule; ?action=dismiss-missed { id } clears missed runs' },
				{ method: 'GET', path: `${JOB_PATH_PREFIX}<id>`, humanOnly: false, purpose: 'read one schedule' },
				{ method: 'POST', path: `${JOB_PATH_PREFIX}<id>/run`, humanOnly: false, purpose: 'run now, out of band; answers sessionId/lastStatus of that run' },
				{ method: 'POST', path: `${JOB_PATH_PREFIX}<id>`, humanOnly: false, purpose: 'patch a schedule (any subset of the job fields) or toggle enabled' },
				{ method: 'DELETE', path: `${JOB_PATH_PREFIX}<id>`, humanOnly: false, purpose: 'delete a schedule' },
				{ method: 'POST', path: `${JOB_PATH_PREFIX}preview`, humanOnly: false, purpose: '{ expression, timeZone } -> description + next occurrences' },
				{ method: 'GET', path: CHATS_PATH, humanOnly: false, purpose: 'existing chats a schedule may post into' },
				{ method: 'GET', path: SETTINGS_PATH, humanOnly: false, purpose: 'model allow-list + routable catalog + default model' },
				{ method: 'POST', path: SETTINGS_PATH, humanOnly: true, purpose: 'change the model allow-list (a person at the Web panel only)' }
			],
			notes: [
				'Schedules are open to any caller: list, create, edit, run and delete all work for the AI too. Human-only: raising autoCatchUp (400 unless a signed browser session) and the model allow-list (POST …/settings).',
				'Error answers are { error, field? }; a rejected field names itself in `field`.',
				'Every run is synchronous from the route: when POST …/run answers, job.lastStatus is started | succeeded | failed and job.lastSessionId names the chat the run reached.'
			]
		});
	};

	const chatsHandler = async (req, res) => {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405, { allow: 'GET, HEAD' });
			res.end();
			return;
		}
		try {
			// A dropdown does not need every stored session; the newest page is the
			// useful set and keeps the answer fast. `?cwd=` narrows it to one
			// workspace, which the form sends once a folder is chosen.
			const cwd = new URL(req.url ?? '/', 'http://dsh.invalid').searchParams.get('cwd') ?? undefined;
			sendJson(res, 200, { chats: await listChats(60, cwd) });
		} catch (error) {
			ctx.logger.error(error);
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: CHATS_PATH,
		handler: chatsHandler
	}), 'cron-schedule: chats route');
	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: MANIFEST_PATH,
		handler: manifestHandler
	}), 'cron-schedule: manifest route');
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

	registerTools(ctx, { store, scheduler, locale, toolJob, modelCatalog, allowedModels, routableEntries, runtime, listChats, toolCatalog });
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
	const { store, scheduler, locale, toolJob, modelCatalog, allowedModels, routableEntries, runtime, listChats, toolCatalog = [] } = deps;
	/** One text block. */
	const text = (value) => [{ type: 'text', text: value }];

	/** Every declared tool; published to the manifest, registered at the end. */
	const definitions = [];
	/** Declare one tool; the whole list is registered once it is complete. */
	const register = (definition) => {
		definitions.push(definition);
	};

	/*
		 * Output schemas use the harness's JSON-Schema subset, and they list
		 * exactly what `execute` returns: `required` is an array on the object
		 * (never `required: true` on a property), and with
		 * `additionalProperties: false` an undeclared key is a failure at call
		 * time. The test suite checks both against the real returned values.
		 */
		const jobShape = {
			type: 'object',
			additionalProperties: false,
			required: ['id', 'name', 'expression', 'description', 'timeZone', 'workspacePath', 'prompt', 'enabled', 'alwaysNewChat', 'overdue', 'missed'],
			properties: {
				id: { type: 'string' },
				name: { type: 'string' },
				expression: { type: 'string' },
				description: { type: 'string' },
				timeZone: { type: 'string' },
				workspacePath: { type: 'string' },
				prompt: { type: 'string' },
				initialPrompt: { type: 'string' },
				enabled: { type: 'boolean' },
				alwaysNewChat: { type: 'boolean' },
				overdue: { type: 'boolean' },
				missed: { type: 'array', items: { type: 'number' } },
				sessionId: { type: 'string' },
				nextRunAt: { type: 'number' },
				lastStatus: { type: 'string', enum: ['started', 'succeeded', 'failed'] },
				lastSessionId: { type: 'string' },
				lastError: { type: 'string' }
			}
		};
		const listOutput = {
			schema: {
				type: 'object',
				additionalProperties: false,
				required: ['jobs'],
				properties: {
					jobs: { type: 'array', items: jobShape }
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

		register({
			name: 'cron_list',
			description: 'List every cron schedule: id, on/off, cron expression, human description, next run time, and the workspace directory each job runs in.',
			parameters: {},
			output: listOutput,
			async execute() {
				return { jobs: store.list().map(toolJob) };
			}
		});

		register({
			name: 'cron_create',
			description: 'Create a cron schedule. At each due time the harness starts a NEW chat in the given workspace directory and sends it the prompt as the first user message. Use cron_describe first when unsure about an expression, and cron_models to see which models you may pick.',
			parameters: {
				name: { type: 'string', required: true, description: 'Short human label for the schedule.' },
				expression: { type: 'string', required: true, description: 'Standard 5-field cron expression in the job time zone, e.g. "0 9 * * 1-5" for 09:00 on weekdays.' },
				workspacePath: { type: 'string', required: true, description: 'Absolute directory the new chat runs in. It is created when missing.' },
				prompt: { type: 'string', required: true, description: 'The task text delivered to the AI on every run.' },
				initialPrompt: { type: 'string', description: 'Optional setup brief (who the bot is, standing rules, paths). Delivered ONCE into the chat the job creates, before the first task — use it so the task text does not have to repeat the whole brief every run.' },
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
					required: ['id', 'name', 'expression', 'workspacePath', 'alwaysNewChat'],
					properties: {
						id: { type: 'string' },
						name: { type: 'string' },
						expression: { type: 'string' },
						workspacePath: { type: 'string' },
						nextRunAt: { type: 'number' },
						alwaysNewChat: { type: 'boolean' },
						initialPrompt: { type: 'string' },
						sessionId: { type: 'string' },
						provider: { type: 'string' },
						model: { type: 'string' }
					}
				},
				render: (_args, value) => text(`Created cron schedule ${value.id} ("${value.name}"): ${value.expression}${value.initialPrompt === undefined ? '' : ' with a setup brief sent once into its new chat'}, next run ${value.nextRunAt === undefined ? 'never' : new Date(value.nextRunAt).toISOString()} in ${value.workspacePath}${value.model === undefined ? '' : ` on ${value.provider}/${value.model}`}. ${value.alwaysNewChat === true ? 'Every run starts a new chat.' : (value.sessionId === undefined ? 'The first run creates a chat and later runs continue it.' : `Runs post into chat ${value.sessionId}.`)}`)
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
					alwaysNewChat: fresh.alwaysNewChat === true,
					...(fresh.initialPrompt === undefined ? {} : { initialPrompt: fresh.initialPrompt }),
					...(fresh.nextRunAt === undefined ? {} : { nextRunAt: fresh.nextRunAt }),
					...(fresh.sessionId === undefined ? {} : { sessionId: fresh.sessionId }),
					...(fresh.model === undefined ? {} : { provider: fresh.model.provider, model: fresh.model.model })
				};
			}
		});

		register({
			name: 'cron_delete',
			description: 'Delete one cron schedule by its id or its exact name. The schedule stops firing immediately; chats it already started are untouched.',
			parameters: {
				id: { type: 'string', required: true, description: 'Schedule id from cron_list or cron_create. An exact, unique schedule name is accepted too.' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					required: ['deleted', 'id'],
					properties: {
						deleted: { type: 'boolean' },
						id: { type: 'string' }
					}
				},
				render: (_args, value) => text(value.deleted ? `Deleted cron schedule ${value.id}.` : `No cron schedule matching ${value.id}.`)
			},
			async execute(args) {
				const wanted = String(args.id);
				const existing = findJob(wanted);
				if (existing === undefined) return { deleted: false, id: wanted };
				const deleted = await store.delete(existing.id);
				scheduler.rearm();
				return { deleted, id: existing.id };
			}
		});

		register({
			name: 'cron_run',
			description: 'Start one cron schedule immediately, out of band, without changing when it fires next. Useful to test a schedule right after creating it. The answer names the chat the run wrote into, so you can point the person at it.',
			parameters: {
				id: { type: 'string', required: true, description: 'Schedule id from cron_list or cron_create. An exact, unique schedule name is accepted too.' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					required: ['started', 'id'],
					properties: {
						started: { type: 'boolean' },
						id: { type: 'string' },
						sessionId: { type: 'string' },
						lastStatus: { type: 'string', enum: ['started', 'succeeded', 'failed'] },
						lastError: { type: 'string' }
					}
				},
				render: (_args, value) => text(value.started
					? `Started cron schedule ${value.id} now: ${value.lastStatus === 'succeeded' ? `the run went into chat ${value.sessionId ?? '(unknown)'}` : `the run ${value.lastStatus ?? 'did not finish'}${value.lastError === undefined ? '' : `: ${value.lastError}`}`}.`
					: `No cron schedule matching ${value.id}.`)
			},
			async execute(args) {
				const wanted = String(args.id);
				const existing = findJob(wanted);
				if (existing === undefined) return { started: false, id: wanted };
				await scheduler.runNow(existing.id);
				// The run is synchronous here, so the stored record already knows its
				// outcome: report it instead of making the model call cron_list again.
				const after = store.get(existing.id);
				return {
					started: true,
					id: existing.id,
					...(typeof after?.lastSessionId === 'string' ? { sessionId: after.lastSessionId } : {}),
					...(typeof after?.lastStatus === 'string' ? { lastStatus: after.lastStatus } : {}),
					...(typeof after?.lastError === 'string' ? { lastError: after.lastError } : {})
				};
			}
		});

		register({
			name: 'cron_chats',
			description: 'List existing chats a schedule can post into. Normally you do not need this: a repeating schedule with no chat creates one on its first run and continues it thereafter. Use this only to target a specific existing chat via cron_create sessionId, or to check which chat a schedule is bound to.',
			parameters: {},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					required: ['chats'],
					properties: {
						chats: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: ['sessionId', 'title'],
								properties: {
									sessionId: { type: 'string' },
									title: { type: 'string' },
									cwd: { type: 'string' }
								}
							}
						}
					}
				},
				render: (_args, value) => text(value.chats.length === 0
					? 'There are no existing chats to post into.'
					: `Existing chats:\n${value.chats.map((chat) => `  ${chat.sessionId}  ${chat.title}${chat.cwd === undefined ? '' : `  (${chat.cwd})`}`).join('\n')}`)
			},
			async execute() {
				return { chats: (await listChats(50)).map((chat) => ({
					sessionId: chat.sessionId,
					title: chat.title,
					...(chat.cwd === undefined ? {} : { cwd: chat.cwd })
				})) };
			}
		});

		register({
			name: 'cron_models',
			description: 'List the models you may schedule on. When the person configured an allowed-model list, only those entries are accepted by cron_create; otherwise every model this deployment routes is listed and the deployment default is used when you omit the model.',
			parameters: {},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					required: ['restricted', 'models'],
					properties: {
						restricted: { type: 'boolean' },
						models: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: ['provider', 'model', 'name'],
								properties: {
									provider: { type: 'string' },
									model: { type: 'string' },
									name: { type: 'string' }
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
		});

		register({
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
					required: ['description', 'next'],
					properties: {
						description: { type: 'string' },
						next: { type: 'array', items: { type: 'string' } }
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
		});
	/**
	 * Publish the declared surface first, then hand it to the registry.
	 *
	 * A composition with no `tools` service never fires the inject callback below,
	 * and such a deployment is exactly who the manifest route is for — so the
	 * catalog is filled from the declarations, not from what registered. A
	 * definition the registry rejects is logged here rather than thrown: an
	 * exception would abandon every later registration, which is how this plugin
	 * once shipped a panel whose tools the model never saw at all (every output
	 * schema declared `required: true` inside a property, while the harness
	 * subset wants `required: [...]` on the object, so the first `register`
	 * threw). One bad tool must cost one tool, and say so in the log.
	 */
	for (const definition of definitions) {
		toolCatalog.push({ name: definition.name, description: definition.description, parameters: definition.parameters ?? {} });
	}
	ctx.inject(['tools'], (toolCtx) => {
		for (const definition of definitions) {
			try {
				toolCtx.tools.register(definition);
			} catch (error) {
				toolCtx.logger?.warn?.(`cron-schedule: tool "${definition.name}" was not registered: ${String(error?.message ?? error)}`);
			}
		}
	});

	/**
	 * Resolve a schedule by id, or by its exact name when that name is unique.
	 *
	 * The model has the id from `cron_list`, but a person usually talks about the
	 * name — accepting both removes a lookup round trip. An ambiguous name is
	 * refused rather than guessed: deleting or starting the wrong schedule is a
	 * worse answer than "say which one".
	 *
	 * @param wanted - id or exact name from the tool call.
	 * @returns the stored job, or undefined when nothing matches.
	 * @throws {Error} when several schedules share that name.
	 */
	function findJob(wanted) {
		const byId = store.get(wanted);
		if (byId !== undefined) return byId;
		const matches = store.list().filter((job) => job.name === wanted);
		if (matches.length > 1) {
			throw new Error(`${matches.length} schedules are named "${wanted}": ${matches.map((job) => job.id).join(', ')} — pass the id instead`);
		}
		return matches[0];
	}
}
