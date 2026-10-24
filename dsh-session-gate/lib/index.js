/**
 * Host entry for `dsh-session-gate`: per-chat access to MCP servers and to
 * image reading.
 *
 * The Web GUI shows one button in the composer tool row, beside «Workspace
 * Write». It opens a dialog with a checkbox per MCP server and one switch for
 * `read_image`. Both live in this plugin's store, keyed by session id, and are
 * enforced on the live agent with `tools.restrict()`: every tool of a server the
 * chat has not allowed is removed from what the model sees (and therefore from
 * what it can call) for that chat only, and `read_image` is removed unless the
 * chat allows it.
 *
 * MCP servers and image reading are OFF by default: a chat that never opened
 * the dialog has no MCP tools and cannot read images, and a server that
 * connects later does not appear in any chat until someone ticks it. The store
 * keeps an inclusion list for exactly that reason.
 *
 * The built-in tools the harness ships are ON by default and can be switched
 * off per GROUP (files, planning, subagents, jobs, orchestration, cron, mesh,
 * rooms, board, web, misc), so a chat can be narrowed to the few capabilities
 * it needs. `read_image` is not part of any group: it is the photo switch.
 *
 * Mount it beside the Web server (the web profile already composes one):
 *
 * ```yaml
 * - insert:
 *     - id: session-gate
 *       name: 'file:///…/dsh-session-gate/lib/index.js?rev=1'
 * ```
 *
 * The plugin imports nothing outside `node:` builtins on purpose: a plugin
 * loaded through a symlinked workspace path resolves to its real path, where the
 * harness's own packages are not reachable. Every harness capability is used
 * through injected services instead.
 *
 * @module dsh-session-gate
 */

// The patch layer loads this entry as `…/lib/index.js?rev=N` so bumping `rev`
// re-reads the host code without restarting the Web server. That query only
// busts the cache of THIS module, so it is forwarded to the sibling import —
// otherwise a reload would pick up a new index.js while still running the old
// store code.
const REV = new URL(import.meta.url).search;
const { defaultStorePath, openGateStore, GateInputError } = await import('./store.js' + REV);

/** Cordis service name for this plugin. */
export const name = 'session-gate';

/**
 * Services required: the Web server for the dialog's route, the session store
 * to address a chat, and the agent registry so the restriction is installed on
 * each live chat (and on every chat created afterwards).
 */
export const inject = ['webServer', 'sessions', 'agents'];

/** Exact route answering and changing one chat's access choices. */
export const STATE_PATH = '/api/session-gate/state';

/**
 * MCP tool names are `mcp__<serverName>__<tool>`; capture the server.
 *
 * Non-greedy on the first `__`: a server name in practice never holds a double
 * underscore, while a raw tool name may. The naming scheme itself is ambiguous
 * for a server literally named `a__b`, which the harness does not produce.
 */
const MCP_TOOL = /^mcp__([A-Za-z0-9_-]{1,32}?)__./;

/** The one tool that reads an image file for the model. */
const PHOTO_TOOL = 'read_image';

/**
 * Built-in tool groups, in dialog order.
 *
 * Names are the harness's stable model-facing tool names; a tool that matches
 * none of them falls into `other`, which is also switchable (and ON by default),
 * so a plugin registered later is still controllable instead of invisible to
 * this dialog. MCP tools are not listed here: they are grouped per server.
 */
const TOOL_GROUPS = [
	['files', ['bash', 'read', 'write', 'edit', 'glob', 'grep', 'present']],
	['plan', ['todo_write', 'create_goal', 'get_goal', 'update_goal', 'exit_plan_mode']],
	['agents', ['subagent', 'subagent_fork', 'background_agent', 'list_agents', 'send_message', 'interrupt_agent', 'bg_list', 'bg_message', 'bg_result', 'bg_stop', 'list_subagent_models']],
	['jobs', ['job_list', 'job_output', 'job_kill']],
	['flow', ['workflow', 'ralph']],
	['web', ['web_search', 'web_fetch']],
	['misc', ['ask_user_question', 'skill']]
];

/** Groups recognised by a name prefix, so a plugin's whole family travels together. */
const GROUP_PREFIXES = [
	['cron_', 'cron'],
	['mesh_', 'mesh'],
	['room_', 'rooms'],
	['excalidraw_', 'board']
];

/** Where a tool with no explicit group goes. */
const OTHER_GROUP = 'other';

/**
 * Schema pricing, mirroring `dsh-token-meter`'s fixed-density heuristic: four
 * characters per token plus one framing block for the whole array. Replicating
 * it (instead of importing the package) keeps the numbers the dialog shows in
 * step with the Usage line the shell renders, without a dependency the plugin
 * cannot resolve from its symlinked path.
 */
const CHARS_PER_TOKEN = 4;
const TOOL_SCHEMA_OVERHEAD = 4;

/** Every group id the dialog can show, in display order. */
const GROUP_ORDER = ['files', 'plan', 'agents', 'jobs', 'flow', 'cron', 'mesh', 'rooms', 'board', 'web', 'misc', OTHER_GROUP];

/** The group one tool name belongs to; photos are handled by their own switch. */
function groupOfTool(name) {
	for (const [id, tools] of TOOL_GROUPS) {
		if (tools.includes(name)) return id;
	}
	for (const [prefix, id] of GROUP_PREFIXES) {
		if (name.startsWith(prefix)) return id;
	}
	return OTHER_GROUP;
}

/** How long one model's image capability is trusted, in milliseconds. */
const CAPABILITY_TTL_MS = 60_000;

/** Largest accepted request body. */
const MAX_BODY_BYTES = 16 * 1024;

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
 * Host plugin body: open the store, keep every live chat's tool restriction in
 * step with it, and serve the state route.
 *
 * @param ctx - host context.
 * @param config - `storePath`, `home`.
 */
export async function apply(ctx, config = {}) {
	const store = await openGateStore({
		file: config.storePath ?? defaultStorePath(config.home)
	});
	/** Bumped on every save so a client can tell the state apart cheaply. */
	let revision = 1;

	/**
	 * Optional harness services, captured through `ctx.inject` because the raw
	 * context refuses `get()` once `apply` settles. All of them are optional: a
	 * deployment without the LLM runtime still serves the dialog, just without
	 * the model-capability line.
	 */
	let tools;
	let llm;
	let projections;
	let defaultModel;

	/** The exact disposer installed per live agent. */
	const installed = new Map();
	/**
	 * Guard against the re-entrancy of our own restriction changes:
	 * `tools.restrict()` and its disposal both emit `tools/change`, so without
	 * this depth counter the listener would answer its own edit. A teardown that
	 * lifts restrictions would then RE-INSTALL one from the store on an agent
	 * whose plugin is going away — an orphan that nothing can ever lift.
	 */
	let applying = 0;

	/** Set once the plugin is being disposed: no reaction may install anything. */
	let closed = false;

	/** Run one restriction change without our own `tools/change` echoing back. */
	function withoutReaction(work) {
		applying += 1;
		try {
			return work();
		} finally {
			applying -= 1;
		}
	}

	/** One model's image capability, cached briefly. */
	const capabilities = new Map();

	/**
	 * Every tool name the agent scope could restrict, in its own view. Using the
	 * agent's view (not the global one) is what keeps `restrict()` from naming a
	 * server registered directly in that agent's own layer.
	 *
	 * @param agent - live agent.
	 * @returns the known global tool names.
	 */
	function restrictableNames(agent) {
		if (tools === undefined) return [];
		try {
			const view = tools.view?.(agent);
			if (view?.restrictableNames !== undefined) return [...view.restrictableNames];
		} catch {
			// Fall through to the visible list: a restriction naming nothing is
			// still better than no restriction at all.
		}
		try {
			return (tools.schemas?.(agent) ?? []).map((schema) => schema.name);
		} catch {
			return [];
		}
	}

	/** What the plugin has ever seen, so a group switched off everywhere keeps its price. */
	const seenSchemas = new Map();

	/**
	 * The scopes whose views make up the dialog's catalogue.
	 *
	 * Part of the harness registers its tools globally (MCP, this repo's plugins)
	 * and part inside an agent preset's scope (files, web, goals, jobs, skills,
	 * `read_image`), so the global view alone is not the tool list a chat sees.
	 * The union over the global view and every live agent describes the whole
	 * registry; each agent is still only ever restricted by its own view.
	 *
	 * @returns the scopes to read, global first.
	 */
	function catalogScopes() {
		const scopes = [undefined];
		try {
			for (const agent of ctx.agents.list()) scopes.push(agent);
		} catch {
			// No agent registry: the global view is all there is.
		}
		return scopes;
	}

	/** The wire schemas, keyed by tool name, for pricing the dialog's rows. */
	function schemaCatalog() {
		const catalog = new Map();
		if (tools === undefined) return seenSchemas;
		for (const scope of catalogScopes()) {
			try {
				for (const schema of tools.schemas?.(scope) ?? []) {
					const wire = {
						name: schema.name,
						description: schema.description ?? '',
						parameters: schema.parameters ?? {}
					};
					if (!catalog.has(wire.name)) catalog.set(wire.name, wire);
					if (!seenSchemas.has(wire.name)) seenSchemas.set(wire.name, wire);
				}
			} catch {
				// A scope that cannot be read simply contributes nothing.
			}
		}
		// Missing today (hidden by a restriction everywhere) is not lost: the
		// price of a switch should describe what turning it ON would cost.
		for (const [name, schema] of seenSchemas) if (!catalog.has(name)) catalog.set(name, schema);
		return catalog;
	}

	/**
	 * What one set of tools costs in the request, by the same heuristic as the
	 * Usage line.
	 * @param names - tool names in the set.
	 * @param schemas - the wire schemas, keyed by name.
	 * @returns characters and estimated tokens.
	 */
	function priceOf(names, schemas) {
		const picked = [];
		for (const name of names) {
			const schema = schemas.get(name);
			if (schema !== undefined) picked.push(schema);
		}
		if (picked.length === 0) return { chars: 0, tokens: 0 };
		const chars = JSON.stringify(picked).length;
		return { chars, tokens: Math.ceil(chars / CHARS_PER_TOKEN) + TOOL_SCHEMA_OVERHEAD };
	}

	/** Share of the model's context window one price takes, or null when unknown. */
	function percentOf(tokens, contextWindow) {
		return contextWindow === null || contextWindow === undefined ? null : (tokens / contextWindow) * 100;
	}

	/**
	 * Every tool name the dialog can show, across the catalogue scopes.
	 *
	 * `knownNames`, not `restrictableNames`: a tool an agent preset registers in
	 * the agent's OWN layer (the subagent runtime does that for its delegation
	 * tool) is known and callable but cannot be masked by a restriction. It still
	 * belongs in the dialog, and the scoped guard covers its CALLS.
	 */
	function catalogToolNames() {
		if (tools === undefined) return [];
		const names = new Set();
		for (const scope of catalogScopes()) {
			try {
				const view = tools.view?.(scope);
				if (view?.knownNames !== undefined) {
					for (const name of view.knownNames) names.add(name);
					continue;
				}
			} catch {
				// Fall through to the visible list.
			}
			try {
				for (const schema of tools.schemas?.(scope) ?? []) names.add(schema.name);
			} catch {
				// A scope that cannot be read contributes nothing.
			}
		}
		return [...names];
	}

	/**
	 * The built-in tool groups, each with its tools and count. MCP tools and
	 * `read_image` are excluded: they have their own controls.
	 * @returns one entry per non-empty group, in display order.
	 */
	function groupCatalog() {
		const byGroup = new Map(GROUP_ORDER.map((id) => [id, []]));
		for (const name of catalogToolNames()) {
			if (MCP_TOOL.exec(name) !== null || name === PHOTO_TOOL) continue;
			byGroup.get(groupOfTool(name)).push(name);
		}
		return [...byGroup]
			.filter(([, names]) => names.length > 0)
			.map(([id, names]) => ({ id, tools: names.length, names: names.sort() }));
	}

	/**
	 * The MCP servers currently offering tools, with their tool counts.
	 * @returns one entry per server, sorted by name.
	 */
	function serverCatalog() {
		/** @type {Map<string, string[]>} */
		const counts = new Map();
		for (const name of catalogToolNames()) {
			const parsed = MCP_TOOL.exec(name);
			if (parsed === null) continue;
			const names = counts.get(parsed[1]) ?? [];
			names.push(name);
			counts.set(parsed[1], names);
		}
		return [...counts]
			.map(([server, names]) => ({ name: server, tools: names.length, names: names.sort() }))
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	/**
	 * The tools one chat must not see.
	 *
	 * Names come from the live agent's own view, so the set always matches what
	 * the registry would accept — a server that connected after the chat's last
	 * save is picked up on the next `tools/change`.
	 *
	 * @param agent - live agent.
	 * @returns the tool names to hide.
	 */
	function deniedTools(agent) {
		const record = store.get(agent.session.id);
		const on = new Set(record?.mcpOn ?? []);
		const off = new Set(record?.groupsOff ?? []);
		const deny = new Set();
		for (const name of restrictableNames(agent)) {
			const parsed = MCP_TOOL.exec(name);
			if (parsed !== null) {
				// Default off: a server is usable only when the chat allows it.
				if (!on.has(parsed[1])) deny.add(name);
				continue;
			}
			if (name === PHOTO_TOOL) {
				if (record?.photos !== true) deny.add(name);
				continue;
			}
			// Built-in groups are on by default; only an explicit off hides them.
			if (off.has(groupOfTool(name))) deny.add(name);
		}
		return deny;
	}

	/**
	 * Why one tool call must be refused right now, or undefined when it may run.
	 *
	 * One policy, two enforcers: `applyAgent` hides the tools a restriction can
	 * hide, and this guard answers calls — including the ones the registry keeps
	 * out of reach of a restriction (an agent's own registrations). The guard
	 * reads the store on every call, so it always describes the chat's CURRENT
	 * choice, not the snapshot the restriction was built from.
	 *
	 * @param agent - the calling agent.
	 * @param name - the tool name the model asked for.
	 * @returns a short subject for the denial message, or undefined.
	 */
	function blockedReason(agent, name) {
		const record = store.get(agent.session.id);
		const parsed = MCP_TOOL.exec(name);
		if (parsed !== null) return (record?.mcpOn ?? []).includes(parsed[1]) ? undefined : `MCP server "${parsed[1]}"`;
		if (name === PHOTO_TOOL) return record?.photos === true ? undefined : 'image reading';
		const group = groupOfTool(name);
		return (record?.groupsOff ?? []).includes(group) ? `tool group "${group}"` : undefined;
	}

	/** The per-agent call guard, so a tool a restriction cannot hide still says no. */
	const guards = new Map();

	/** Install one agent's call guard, once. */
	function installGuard(agent) {
		if (guards.has(agent)) return;
		try {
			const dispose = agent.ctx.tools.guard((exec) => {
				const name = exec?.name;
				if (typeof name !== 'string') return undefined;
				const blocked = blockedReason(agent, name);
				return blocked === undefined
					? undefined
					: `session-gate: ${blocked} is switched off in this chat; the person can enable it in the model-access dialog`;
			});
			guards.set(agent, dispose);
		} catch (error) {
			ctx.logger?.warn?.(`session-gate: could not install a call guard: ${String(error?.message ?? error)}`);
		}
	}

	/** Release one agent's call guard. */
	function forgetGuard(agent) {
		const dispose = guards.get(agent);
		if (dispose === undefined) return;
		guards.delete(agent);
		try {
			dispose();
		} catch (error) {
			ctx.logger?.warn?.(`session-gate: releasing a call guard failed: ${String(error?.message ?? error)}`);
		}
	}

	/**
	 * Bring one live agent's restriction in step with the store.
	 *
	 * Restrictions intersect and lift only by disposal, so a change replaces the
	 * installed one instead of stacking another.
	 *
	 * @param agent - live agent to update.
	 */
	function applyAgent(agent) {
		const sessionId = agent?.session?.id;
		if (typeof sessionId !== 'string' || sessionId === '') return;
		installGuard(agent);
		let deny;
		try {
			deny = deniedTools(agent);
		} catch (error) {
			ctx.logger?.warn?.(`session-gate: cannot read the tool list for ${sessionId}: ${String(error?.message ?? error)}`);
			return;
		}
		const signature = [...deny].sort().join('\n');
		const current = installed.get(agent);
		if (current !== undefined && current.signature === signature) return;
		withoutReaction(() => {
			try {
				current?.dispose?.();
			} catch (error) {
				ctx.logger?.warn?.(`session-gate: lifting an old restriction failed: ${String(error?.message ?? error)}`);
			}
			installed.delete(agent);
			if (deny.size === 0 || closed) return;
			try {
				const dispose = agent.ctx.tools.restrict({ deny });
				installed.set(agent, { dispose, signature });
			} catch (error) {
				ctx.logger?.warn?.(`session-gate: could not hide tools in ${sessionId}: ${String(error?.message ?? error)}`);
			}
		});
	}

	/** Lift one agent's restriction and forget it. */
	function forgetAgent(agent) {
		const current = installed.get(agent);
		if (current === undefined) return;
		installed.delete(agent);
		withoutReaction(() => {
			try {
				current.dispose?.();
			} catch (error) {
				ctx.logger?.warn?.(`session-gate: lifting a restriction failed: ${String(error?.message ?? error)}`);
			}
		});
	}

	/**
	 * Which route one chat will use for its next request.
	 *
	 * The pending selection wins over the last used one (the composer can switch
	 * the model mid-chat), then the logged header, then the deployment default —
	 * which is what a brand-new chat with no request yet uses.
	 *
	 * @param sessionId - exact session id.
	 * @returns the provider and model, with `null` for an unresolved pair.
	 */
	function routeOf(sessionId) {
		let session;
		try {
			session = ctx.sessions.get(sessionId);
		} catch {
			session = undefined;
		}
		let provider;
		let model;
		try {
			const state = session === undefined ? undefined : projections?.stateOf?.(session, 'modelSelection');
			const picked = state?.pending ?? state?.lastUsed ?? undefined;
			if (picked !== undefined) {
				provider = picked.provider;
				model = picked.model;
			}
		} catch {
			// A deployment without the projection falls through to the header.
		}
		if (provider === undefined) {
			try {
				const header = session?.requestHeader?.()?.config;
				if (header !== undefined) {
					provider = header.provider;
					model = header.model;
				}
			} catch {
				// No logged request yet.
			}
		}
		if (provider === undefined) {
			try {
				const fallback = defaultModel?.currentSelection?.();
				if (fallback !== undefined) {
					provider = fallback.provider;
					model = fallback.model;
				}
			} catch {
				// No default selection configured.
			}
		}
		return { provider: provider ?? null, model: model ?? null };
	}

	/**
	 * What one route accepts and how much room it has.
	 * @param provider - provider route.
	 * @param model - exact model id.
	 * @returns image capability and context window; both null when unknown.
	 */
	async function modelFacts(provider, model) {
		if (provider === null || model === null) return { capable: null, contextWindow: null };
		const key = `${provider}\u0000${model}`;
		const cached = capabilities.get(key);
		const at = Date.now();
		if (cached !== undefined && at - cached.at < CAPABILITY_TTL_MS) return cached;
		let capable = null;
		let contextWindow = null;
		try {
			const info = await llm?.resolveModelInfo?.(provider, model);
			const modalities = info?.inputModalities;
			capable = Array.isArray(modalities) ? modalities.includes('image') : null;
			const window = info?.context?.contextWindow;
			contextWindow = Number.isInteger(window) && window > 0 ? window : null;
		} catch {
			capable = null;
			contextWindow = null;
		}
		const facts = { at, capable, contextWindow };
		// ponytail: one flat cache, cleared wholesale; per-route entries would be
		// the next step only if a deployment churns through many models.
		if (capabilities.size > 500) capabilities.clear();
		capabilities.set(key, facts);
		return facts;
	}

	/** One chat's state, as the dialog reads it. */
	async function stateView(sessionId) {
		const record = store.get(sessionId);
		const on = new Set(record?.mcpOn ?? []);
		const off = new Set(record?.groupsOff ?? []);
		const photosAllowed = record?.photos === true;
		const route = routeOf(sessionId);
		const facts = await modelFacts(route.provider, route.model);
		const schemas = schemaCatalog();
		const price = (names) => {
			const priced = priceOf(names, schemas);
			return { chars: priced.chars, tokens: priced.tokens, percent: percentOf(priced.tokens, facts.contextWindow) };
		};
		const servers = serverCatalog().map((entry) => ({
			...entry,
			enabled: on.has(entry.name),
			...price(entry.names)
		}));
		const groups = groupCatalog().map((entry) => ({
			...entry,
			enabled: !off.has(entry.id),
			...price(entry.names)
		}));
		// The total prices what the chat allows RIGHT NOW, so it moves as boxes
		// are ticked — that is the number a person is actually managing.
		const enabledNames = [];
		for (const entry of servers) if (entry.enabled) enabledNames.push(...entry.names);
		for (const entry of groups) if (entry.enabled) enabledNames.push(...entry.names);
		if (photosAllowed) enabledNames.push(PHOTO_TOOL);
		const photoPrice = price([PHOTO_TOOL]);
		return {
			revision,
			sessionId,
			servers,
			groups,
			photos: {
				allowed: photosAllowed,
				capable: facts.capable,
				provider: route.provider,
				model: route.model,
				...photoPrice
			},
			cost: {
				contextWindow: facts.contextWindow,
				...price(enabledNames)
			}
		};
	}

	/** Read the request body as JSON, or throw a GateInputError. */
	async function readJson(req) {
		const text = await readBody(req);
		if (text === undefined) throw new GateInputError('request body is too large');
		if (text.trim() === '') return {};
		try {
			const parsed = JSON.parse(text);
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new GateInputError('request body must be a JSON object');
			}
			return parsed;
		} catch (error) {
			if (error instanceof GateInputError) throw error;
			throw new GateInputError(`invalid JSON: ${String(error?.message ?? error)}`);
		}
	}

	/** The route used by the composer's access dialog. */
	const stateHandler = async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://dsh.invalid');
		try {
			if (req.method === 'GET' || req.method === 'HEAD') {
				const sessionId = String(url.searchParams.get('sessionId') ?? '');
				if (sessionId === '') throw new GateInputError('sessionId is required', 'sessionId');
				sendJson(res, 200, await stateView(sessionId));
				return;
			}
			if (req.method !== 'POST') {
				res.writeHead(405, { allow: 'GET, HEAD, POST' });
				res.end();
				return;
			}
			const body = await readJson(req);
			const sessionId = String(url.searchParams.get('sessionId') ?? body.sessionId ?? '');
			if (sessionId === '') throw new GateInputError('sessionId is required', 'sessionId');
			// A session id the caller made up would otherwise be stored forever;
			// only a chat this deployment knows is accepted.
			if (ctx.sessions.get(sessionId) === undefined) {
				sendJson(res, 404, { error: `session "${sessionId}" is not live` });
				return;
			}
			// A page that still runs the pre-inclusion client sends `mcpOff`. It
			// is translated rather than ignored: the difference between the two
			// shapes is not something a person should have to refresh to notice.
			const mcpOn = body.mcpOn === undefined && Array.isArray(body.mcpOff)
				? serverCatalog().map((server) => server.name).filter((name) => !body.mcpOff.includes(name))
				: body.mcpOn;
			await store.save(sessionId, { mcpOn, groupsOff: body.groupsOff, photos: body.photos });
			revision += 1;
			for (const agent of ctx.agents.list()) {
				if (agent.session?.id === sessionId) applyAgent(agent);
			}
			sendJson(res, 200, await stateView(sessionId));
		} catch (error) {
			if (error instanceof GateInputError) {
				sendJson(res, 400, { error: error.message, field: error.field });
				return;
			}
			ctx.logger?.error?.(error);
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: STATE_PATH,
		handler: stateHandler
	}), 'session-gate: state route');

	// Optional services. `tools` is the one that matters: it arrives before any
	// chat does, but capturing it through `inject` keeps the raw context sealed.
	ctx.inject(['tools'], (scope) => {
		tools = scope.tools;
		for (const agent of ctx.agents.list()) applyAgent(agent);
	});
	ctx.inject(['llm'], (scope) => {
		llm = scope.llm;
	});
	ctx.inject(['sessionProjections'], (scope) => {
		projections = scope.sessionProjections;
	});
	ctx.inject(['agentDefaultModel'], (scope) => {
		defaultModel = scope.agentDefaultModel;
	});

	for (const agent of ctx.agents.list()) applyAgent(agent);
	ctx.on('agent/created', ({ agent }) => {
		applyAgent(agent);
	});
	ctx.on('agent/disposed', ({ agent }) => {
		forgetAgent(agent);
		forgetGuard(agent);
	});
	const offToolsChange = ctx.on('tools/change', () => {
		// Our own restriction edit emits this event too; see `applying`.
		if (closed || applying > 0) return;
		for (const agent of ctx.agents.list()) applyAgent(agent);
	});
	ctx.effect(() => () => {
		// Stop reacting BEFORE lifting: a lift itself emits `tools/change`, and a
		// reaction during teardown would install a fresh restriction that outlives
		// this plugin instance.
		closed = true;
		offToolsChange();
		for (const agent of [...installed.keys()]) forgetAgent(agent);
		for (const agent of [...guards.keys()]) forgetGuard(agent);
	}, 'session-gate: tool restrictions');
}
