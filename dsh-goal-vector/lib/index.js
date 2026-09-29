/**
 * Host entry for `dsh-goal-vector`: goals vectors («векторы целей») for the LLM
 * working in a project.
 *
 * A goals vector is a named, priority-ordered list of goals: the first item is
 * the most important, the last is the one to drop first. A chat may adopt one
 * vector; while it is adopted the vector is rendered into the model's prompt on
 * every step, so the model keeps following it for the whole session. With no
 * vector adopted the chat behaves exactly as before.
 *
 * Mount it beside the Web server (the web profile already composes one):
 *
 * ```yaml
 * - insert:
 *     - id: goal-vector
 *       name: 'file:///…/dsh-goal-vector/lib/index.js?rev=1'
 * ```
 *
 * The plugin imports nothing outside `node:` builtins on purpose: a plugin
 * loaded through a symlinked workspace path resolves to its real path, where the
 * harness's own packages are not reachable. Every harness capability is used
 * through injected services instead.
 *
 * @module dsh-goal-vector
 */

// The patch layer loads this entry as `…/lib/index.js?rev=N` so bumping `rev`
// re-reads the host code without restarting the Web server. That query only
// busts the cache of THIS module, so it is forwarded to every sibling import —
// otherwise a reload would pick up a new index.js while still running the old
// store code.
const REV = new URL(import.meta.url).search;
const { defaultStorePath, openVectorStore, renderVectorPrompt, VectorInputError } = await import('./store.js' + REV);

/** Cordis service name for this plugin. */
export const name = 'goal-vector';

/**
 * Services required: the Web server for the panel's routes, the session store
 * to address a chat, and the agent registry so a per-agent prompt section can
 * be installed as each agent appears.
 */
export const inject = ['webServer', 'sessions', 'agents'];

/** Exact route answering the vector list and accepting mutations. */
export const VECTORS_PATH = '/api/goal-vector/vectors';

/**
 * Prefix under which one vector is addressed (`/api/goal-vector/vectors/<id>`).
 *
 * Registered WITHOUT the trailing slash: `webServer.match` tests
 * `pathname.startsWith(prefix + '/')`, so a prefix that already ends in `/`
 * would need a double slash and would never match — requests would then fall
 * through to the `/api` auth fence and answer a bare 401.
 */
export const VECTOR_PATH_PREFIX = `${VECTORS_PATH}/`;

/** Exact route answering and changing the vector adopted by one chat. */
export const SELECTION_PATH = '/api/goal-vector/selection';

/**
 * Prompt-section placement.
 *
 * Deliberately in the low hundreds: the goals vector is *policy*, not tool
 * guidance, so it lands right after the plan policy and well before the
 * per-tool sections. Ordering matters because the vector is itself a priority
 * list — it must be read as instruction, not as one more tool note.
 */
const GOAL_VECTOR_SECTION_ORDER = 550;

/** Section name; unique per agent scope, so no collision with other plugins. */
const SECTION_NAME = 'goal-vector:policy';

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
 * Host plugin body: open the store, install the per-agent prompt section,
 * register the routes and the model-facing tools.
 *
 * @param ctx - host context.
 * @param config - `storePath`, `home`.
 */
export async function apply(ctx, config = {}) {
	const store = await openVectorStore({
		file: config.storePath ?? defaultStorePath(config.home)
	});
	/** Broadcast hook: bumped after every mutation so the panel can poll cheaply. */
	let revision = 1;

	/**
	 * The prompt section each agent gets, keyed by agent so it can be disposed
	 * with the agent.
	 *
	 * The selection lives in the plugin's own store rather than in the session
	 * log: the harness refuses to restore a session holding an event type it does
	 * not know, and a plugin cannot extend that whitelist — a plugin-owned event
	 * type would make every adopting chat unloadable after a restart. Keeping the
	 * mapping beside the vectors also means one file answers both "what vectors
	 * exist" and "which one this chat follows".
	 *
	 * @type {Map<object, { dispose: () => Promise<void> | void }>}
	 */
	const promptFibers = new Map();

	/**
	 * Install the per-agent prompt section.
	 *
	 * The section is registered in the AGENT's scope (`agent.ctx`), not globally,
	 * so it is invisible to every other chat and unwinds automatically when the
	 * agent goes away. Its text is re-read on every model step, which is what
	 * makes a mid-session change (or an edit to the vector itself) take effect
	 * immediately.
	 *
	 * @param agent - the live agent to equip.
	 */
	function installPrompt(agent) {
		if (promptFibers.has(agent)) return;
		try {
			const fiber = agent.ctx.inject(['systemPrompt'], (scope) => {
				scope.systemPrompt.section({
					name: SECTION_NAME,
					order: GOAL_VECTOR_SECTION_ORDER,
					text: () => vectorTextFor(agent.session)
				});
			});
			promptFibers.set(agent, fiber);
		} catch (error) {
			ctx.logger?.warn?.(`goal-vector: could not install the prompt section: ${String(error?.message ?? error)}`);
		}
	}

	/** Dispose one agent's prompt section. */
	function disposePrompt(agent) {
		const fiber = promptFibers.get(agent);
		if (fiber === undefined) return;
		promptFibers.delete(agent);
		try {
			const task = fiber.dispose();
			if (task !== undefined && typeof task.catch === 'function') {
				task.catch((error) => {
					ctx.logger?.warn?.(`goal-vector: prompt cleanup failed: ${String(error?.message ?? error)}`);
				});
			}
		} catch (error) {
			ctx.logger?.warn?.(`goal-vector: prompt cleanup failed: ${String(error?.message ?? error)}`);
		}
	}

	for (const agent of ctx.agents.list()) installPrompt(agent);
	ctx.on('agent/created', ({ agent }) => {
		installPrompt(agent);
	});
	ctx.on('agent/disposed', ({ agent }) => {
		disposePrompt(agent);
	});
	ctx.effect(() => () => {
		for (const agent of [...promptFibers.keys()]) disposePrompt(agent);
	}, 'goal-vector: prompt sections');

	/**
	 * The instruction block for one session, or an empty string.
	 *
	 * A vector deleted after being adopted reads as "no vector" rather than an
	 * error: the chat simply goes back to normal behaviour.
	 *
	 * @param session - live session.
	 * @returns the prompt text for the vector this session follows.
	 */
	function vectorTextFor(session) {
		const selection = store.selectionOf(session?.id);
		if (selection === undefined) return '';
		const vector = store.get(selection.vectorId);
		if (vector === undefined) return '';
		return renderVectorPrompt(vector);
	}

	/**
	 * Read the request body as JSON, or throw a VectorInputError.
	 * @param req - the incoming request.
	 * @returns the parsed body.
	 */
	async function readJson(req) {
		const text = await readBody(req);
		if (text === undefined) throw new VectorInputError('request body is too large');
		if (text.trim() === '') return {};
		try {
			const parsed = JSON.parse(text);
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new VectorInputError('request body must be a JSON object');
			}
			return parsed;
		} catch (error) {
			if (error instanceof VectorInputError) throw error;
			throw new VectorInputError(`invalid JSON: ${String(error?.message ?? error)}`);
		}
	}

	/** One session's live state plus its adopted-vector facts, for the panel. */
	function selectionView(sessionId) {
		const selection = store.selectionOf(sessionId);
		const vector = selection === undefined ? undefined : store.get(selection.vectorId);
		return {
			sessionId,
			vectorId: vector === undefined ? null : vector.id,
			name: vector === undefined ? null : vector.name,
			active: vector !== undefined
		};
	}

	/** The collection route: list, create, and edit vectors. */
	const vectorsHandler = async (req, res) => {
		try {
			if (req.method === 'GET' || req.method === 'HEAD') {
				sendJson(res, 200, { revision, vectors: store.list() });
				return;
			}
			if (req.method !== 'POST') {
				res.writeHead(405, { allow: 'GET, HEAD, POST' });
				res.end();
				return;
			}
			const body = await readJson(req);
			const created = await store.create(body);
			revision += 1;
			sendJson(res, 201, { ok: true, vector: created });
		} catch (error) {
			if (error instanceof VectorInputError) {
				sendJson(res, 400, { error: error.message, field: error.field });
				return;
			}
			ctx.logger.error(error);
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	/** One vector: read, edit, delete. */
	const vectorHandler = async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://dsh.invalid');
		const rest = url.pathname.startsWith(VECTOR_PATH_PREFIX) ? url.pathname.slice(VECTOR_PATH_PREFIX.length) : '';
		const id = decodeURIComponent(rest.split('/')[0] ?? '');
		try {
			if (id === '') throw new VectorInputError('vector id is required in the path', 'id');
			const existing = store.get(id);
			if (existing === undefined) {
				sendJson(res, 404, { error: `unknown goals vector "${id}"` });
				return;
			}
			if (req.method === 'GET' || req.method === 'HEAD') {
				sendJson(res, 200, { vector: existing });
				return;
			}
			if (req.method === 'DELETE') {
				await store.delete(id);
				revision += 1;
				sendJson(res, 200, { ok: true, vectors: store.list() });
				return;
			}
			if (req.method !== 'POST') {
				res.writeHead(405, { allow: 'GET, HEAD, POST, DELETE' });
				res.end();
				return;
			}
			const body = await readJson(req);
			const updated = await store.update(id, body);
			revision += 1;
			sendJson(res, 200, { ok: true, vector: updated });
		} catch (error) {
			if (error instanceof VectorInputError) {
				sendJson(res, 400, { error: error.message, field: error.field });
				return;
			}
			ctx.logger.error(error);
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	/** The selection route used by the composer selector. */
	const selectionHandler = async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://dsh.invalid');
		try {
			// GET addresses the chat by query; POST may also carry it in the body,
			// which is what the composer's selector sends.
			const body = req.method === 'POST' ? await readJson(req) : {};
			const sessionId = String(url.searchParams.get('sessionId') ?? body.sessionId ?? '');
			if (sessionId === '') throw new VectorInputError('sessionId is required', 'sessionId');
			if (req.method === 'GET' || req.method === 'HEAD') {
				sendJson(res, 200, { selection: selectionView(sessionId), vectors: store.list() });
				return;
			}
			if (req.method !== 'POST') {
				res.writeHead(405, { allow: 'GET, HEAD, POST' });
				res.end();
				return;
			}
			// A session id the caller made up would otherwise be stored forever;
			// only a chat this deployment knows is accepted.
			if (ctx.sessions.get(sessionId) === undefined) {
				sendJson(res, 404, { error: `session "${sessionId}" is not live` });
				return;
			}
			await store.select(sessionId, body.vectorId ?? null);
			sendJson(res, 200, { ok: true, selection: selectionView(sessionId) });
		} catch (error) {
			if (error instanceof VectorInputError) {
				sendJson(res, 400, { error: error.message, field: error.field });
				return;
			}
			ctx.logger.error(error);
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: VECTORS_PATH,
		handler: vectorsHandler
	}), 'goal-vector: vectors route');
	ctx.effect(() => ctx.webServer.register({
		kind: 'prefix',
		path: VECTORS_PATH,
		handler: vectorHandler
	}), 'goal-vector: vector route');
	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: SELECTION_PATH,
		handler: selectionHandler
	}), 'goal-vector: selection route');

	registerTools(ctx, { store, onChanged: () => { revision += 1; } });
}

/**
 * Register the model-facing tools: the model can list and create goals vectors,
 * adopt one for its own chat, and delegate work to a subagent that follows a
 * chosen vector from its first step.
 *
 * @param ctx - host context carrying `tools` (looked up lazily so a deployment
 *   without the tool runtime still serves the panel).
 * @param deps - the store and the change hook.
 */
function registerTools(ctx, deps) {
	const { store, onChanged } = deps;
	/** One text block. */
	const text = (value) => [{ type: 'text', text: value }];
	/** A tool definition in the shape the registry validates. */
	const tool = (definition) => definition;
	/** The tool-facing view of one vector (no timestamps: the schema is strict). */
	const toolVector = (vector) => ({
		id: vector.id,
		name: vector.name,
		description: vector.description,
		goals: [...vector.goals]
	});

	ctx.inject(['tools'], (toolCtx) => {
		const vectorShape = {
			type: 'object',
			additionalProperties: false,
			properties: {
				id: { type: 'string', required: true },
				name: { type: 'string', required: true },
				description: { type: 'string', required: true },
				goals: { type: 'array', required: true, items: { type: 'string' } }
			}
		};

		toolCtx.tools.register(tool({
			name: 'goal_vector_list',
			description: 'List every goals vector (ВЦ) defined in this deployment, with its goals in priority order. A goals vector describes the ideal mode of behaviour for the object being controlled, built as a hierarchy of particular goals. Its order is the REVERSE of the order in which the goals would be given up: goal 1 is the most important, and the lowest-priority goals are the ones to drop first when the whole set cannot be achieved.',
			parameters: {},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					properties: {
						vectors: { type: 'array', required: true, items: vectorShape }
					}
				},
				render: (_args, value) => text(value.vectors.length === 0
					? 'No goals vectors are defined.'
					: value.vectors.map((vector) => `${vector.id} | ${vector.name}${vector.description === '' ? '' : ` — ${vector.description}`}\n${vector.goals.map((goal, index) => `  ${String(index + 1)}. ${goal}`).join('\n')}`).join('\n\n'))
			},
			async execute() {
				return { vectors: store.list().map(toolVector) };
			}
		}));

		toolCtx.tools.register(tool({
			name: 'goal_vector_create',
			description: 'Create a goals vector (ВЦ): a hierarchy of goals for the LLM working in a project, describing the ideal mode of behaviour. The order is the priority, and it is the reverse of the order of abandonment: put the most important goal first, and the goal to give up first last. The same goals in another order are a different vector, so choose the order deliberately. Call goal_vector_list first to avoid duplicating an existing vector.',
			parameters: {
				name: { type: 'string', required: true, description: 'Short human label for the vector, e.g. "Выпустить релиз 2.0".' },
				goals: { type: 'array', required: true, items: { type: 'string' }, description: 'Goals in priority order: index 0 is the most important, the last entry is the least important.' },
				description: { type: 'string', description: 'Optional one-line note about what this vector is for.' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					properties: {
						id: { type: 'string', required: true },
						name: { type: 'string', required: true },
						goals: { type: 'array', required: true, items: { type: 'string' } }
					}
				},
				render: (_args, value) => text(`Created goals vector ${value.id} ("${value.name}") with ${String(value.goals.length)} goal(s), highest priority first. Adopt it with goal_vector_adopt, or start a subagent on it with goal_vector_delegate.`)
			},
			async execute(args) {
				const created = await store.create({
					name: args.name,
					goals: args.goals,
					description: args.description
				});
				onChanged();
				return { id: created.id, name: created.name, goals: [...created.goals] };
			}
		}));

		toolCtx.tools.register(tool({
			name: 'goal_vector_adopt',
			description: 'Adopt a goals vector for THIS chat, or clear the current one. While a vector is adopted it is injected into your instructions on every step, so you keep following it until it is cleared. Pass vectorId from goal_vector_list, or null to go back to working without a vector.',
			parameters: {
				vectorId: { type: 'string', nullable: true, required: true, description: 'Exact vector id from goal_vector_list, or null to clear the vector for this chat.' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					properties: {
						vectorId: { type: 'string' },
						name: { type: 'string' },
						active: { type: 'boolean', required: true }
					}
				},
				render: (_args, value) => text(value.active
					? `This chat now follows the goals vector "${String(value.name)}" (${String(value.vectorId)}) from its next step on.`
					: 'This chat no longer follows a goals vector; it works in the normal mode.')
			},
			async execute(args, exec) {
				const session = exec.agent?.session;
				if (session === undefined) throw new Error('goal_vector_adopt needs a calling chat (exec.agent.session was undefined)');
				const vectorId = args.vectorId ?? null;
				await store.select(session.id, vectorId);
				if (vectorId === null) return { active: false };
				const vector = store.get(vectorId);
				return { active: true, vectorId: vector.id, name: vector.name };
			}
		}));
	});

	// The delegation tool needs `subagents`, which is a separate optional
	// service. It is injected on its own so a deployment without the subagent
	// runtime still gets the panel, the selector, and the other three tools.
	ctx.inject(['tools', 'subagents'], (toolCtx) => {
		toolCtx.tools.register(tool({
			name: 'goal_vector_delegate',
			description: 'Start a subagent that follows a goals vector from its very first step. The child receives the vector as its own instructions plus the task text you pass. Use this to push a priority-ordered set of goals down to a worker instead of restating them. The delegation runs in the foreground and returns the child\'s final answer.',
			parameters: {
				vectorId: { type: 'string', required: true, description: 'Exact vector id from goal_vector_list that the subagent must follow.' },
				prompt: { type: 'string', required: true, description: 'The task text for the subagent. State the concrete work; the vector supplies the goals and their priority.' },
				description: { type: 'string', required: true, description: 'Short 3-5 word label for this delegation, shown in the UI.' },
				provider: { type: 'string', description: 'Subagent provider name. Defaults to "spawn" (a fresh child with no parent context). Use "fork" to let the child inherit this conversation.' }
			},
			output: {
				schema: {
					type: 'object',
					additionalProperties: false,
					properties: {
						status: { type: 'string', required: true },
						vectorId: { type: 'string', required: true },
						summary: { type: 'string', required: true }
					}
				},
				render: (_args, value) => text(value.summary)
			},
			async execute(args, exec) {
				const parent = exec.agent;
				if (parent === undefined) throw new Error('goal_vector_delegate needs a calling chat (exec.agent was undefined)');
				const vector = store.get(String(args.vectorId));
				if (vector === undefined) throw new Error(`unknown goals vector "${String(args.vectorId)}"; call goal_vector_list for the exact ids`);
				const subagents = toolCtx.subagents;
				const provider = typeof args.provider === 'string' && args.provider !== '' ? args.provider : 'spawn';
				if (!subagents.list().includes(provider)) {
					throw new Error(`unknown subagent provider "${provider}"; available: ${subagents.list().join(', ') || '(none)'}`);
				}
				// The vector rides the child's `persona`: the subagent framework
				// installs it as a scoped prompt section in the child's creation
				// window, so the goals are in force from the very first step — before
				// the child has read anything. The task goes in the prompt.
				const run = await subagents.start(provider, {
					label: String(args.description),
					prompt: [{ type: 'text', text: String(args.prompt) }],
					parent,
					persona: renderVectorPrompt(vector),
					signal: exec.signal
				});
				try {
					const result = await run.result;
					const summary = result.output
						.filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
						.map((block) => block.text)
						.join('')
						.trim();
					if (result.stopReason !== 'completed') {
						return {
							status: String(result.stopReason),
							vectorId: vector.id,
							summary: `The subagent on goals vector "${vector.name}" ended with status "${String(result.stopReason)}".${summary === '' ? '' : `\n\nPartial answer:\n${summary}`}`
						};
					}
					return {
						status: 'completed',
						vectorId: vector.id,
						summary: summary === '' ? `The subagent on goals vector "${vector.name}" finished without a text answer.` : summary
					};
				} finally {
					try {
						await run.dispose();
					} catch (error) {
						ctx.logger?.warn?.(`goal-vector: disposing a delegated run failed: ${String(error?.message ?? error)}`);
					}
				}
			}
		}));
	});
}
