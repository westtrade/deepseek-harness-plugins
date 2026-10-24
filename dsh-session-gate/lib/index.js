/**
 * Host entry for `dsh-session-gate`: per-chat access to MCP servers and to
 * image reading.
 *
 * The Web GUI shows one button in the composer tool row, beside «Workspace
 * Write». It opens a dialog with a checkbox per MCP server and one switch for
 * `read_image`. Both live in this plugin's store, keyed by session id, and are
 * enforced on the live agent with `tools.restrict()`: a switched-off server's
 * tools are removed from what the model sees (and therefore from what it can
 * call) for that chat only, and `read_image` goes with them when image reading
 * is off. With nothing switched off the chat behaves exactly as before, so the
 * plugin never silently tightens an existing chat.
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

	/**
	 * The MCP servers currently offering tools, with their tool counts.
	 * @returns one entry per server, sorted by name.
	 */
	function serverCatalog() {
		if (tools === undefined) return [];
		const counts = new Map();
		let names = [];
		try {
			const view = tools.view?.(undefined);
			if (view?.restrictableNames !== undefined) names = [...view.restrictableNames];
			else names = (tools.schemas?.(undefined) ?? []).map((schema) => schema.name);
		} catch {
			return [];
		}
		for (const name of names) {
			const parsed = MCP_TOOL.exec(name);
			if (parsed === null) continue;
			counts.set(parsed[1], (counts.get(parsed[1]) ?? 0) + 1);
		}
		return [...counts].map(([server, count]) => ({ name: server, tools: count })).sort((left, right) => left.name.localeCompare(right.name));
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
		const off = new Set(record?.mcpOff ?? []);
		const deny = new Set();
		for (const name of restrictableNames(agent)) {
			const parsed = MCP_TOOL.exec(name);
			if (parsed !== null) {
				if (off.has(parsed[1])) deny.add(name);
				continue;
			}
			if (name === PHOTO_TOOL && record?.photos === false) deny.add(name);
		}
		return deny;
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
	 * Whether one route accepts image input, or `null` when it cannot be told.
	 * @param provider - provider route.
	 * @param model - exact model id.
	 */
	async function imageCapability(provider, model) {
		if (provider === null || model === null) return null;
		const key = `${provider}\u0000${model}`;
		const cached = capabilities.get(key);
		const at = Date.now();
		if (cached !== undefined && at - cached.at < CAPABILITY_TTL_MS) return cached.capable;
		let capable = null;
		try {
			const info = await llm?.resolveModelInfo?.(provider, model);
			const modalities = info?.inputModalities;
			capable = Array.isArray(modalities) ? modalities.includes('image') : null;
		} catch {
			capable = null;
		}
		// ponytail: one flat cache, cleared wholesale; per-route entries would be
		// the next step only if a deployment churns through many models.
		if (capabilities.size > 500) capabilities.clear();
		capabilities.set(key, { at, capable });
		return capable;
	}

	/** One chat's state, as the dialog reads it. */
	async function stateView(sessionId) {
		const record = store.get(sessionId);
		const off = new Set(record?.mcpOff ?? []);
		const photosAllowed = record?.photos ?? true;
		const servers = serverCatalog().map((entry) => ({ ...entry, enabled: !off.has(entry.name) }));
		const route = routeOf(sessionId);
		const capable = await imageCapability(route.provider, route.model);
		return {
			revision,
			sessionId,
			servers,
			photos: {
				allowed: photosAllowed,
				capable,
				provider: route.provider,
				model: route.model
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
			await store.save(sessionId, { mcpOff: body.mcpOff, photos: body.photos });
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
	}, 'session-gate: tool restrictions');
}
