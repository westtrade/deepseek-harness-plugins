/**
 * Host entry for `dsh-moleculer`: a Moleculer broker inside DeepSeek Harness.
 *
 * What it does, in the order the pieces depend on each other:
 *
 * 1. starts a broker from the durable harness settings, so it joins whatever
 *    namespace/transporter the peers use;
 * 2. publishes the mesh's REMOTE actions to the model as callable tools —
 *    Moleculer already describes its actions, so the names and params are read,
 *    not invented;
 * 3. serves those same tools over MCP (Streamable HTTP) for an external MCP
 *    client;
 * 4. notifies a working model when the mesh changes (a node joins, leaves, or
 *    its services move).
 *
 * The plugin imports `moleculer` and the MCP SDK as ordinary dependencies; it
 * imports nothing from the harness, which a symlinked workspace path cannot
 * resolve. Every harness capability arrives through an injected service.
 *
 * @module dsh-moleculer
 */

import { randomUUID } from 'node:crypto';

const REV = new URL(import.meta.url).search;
const { describeMesh, meshTools, normalizeSettings } = await import('./mesh.js' + REV);

/** Cordis service name for this plugin. */
export const name = 'moleculer';

/** Services required: web routes, settings, tools, sessions and agents. */
export const inject = ['webServer', 'settings', 'tools', 'sessions', 'agents'];

/** Settings namespace the panel writes. */
export const SETTINGS_NS = 'dsh-moleculer';

/** Exact route answering the live mesh state for the panel. */
export const STATE_PATH = '/api/moleculer/state';

/** Exact route for the MCP Streamable HTTP endpoint. */
export const MCP_PATH = '/api/moleculer/mcp';

/** Tool-name prefix, so mesh tools are recognisable among harness tools. */
const TOOL_PREFIX = 'mesh';

/** Mesh changes are coalesced for this long before the model is told once. */
const NOTIFY_DEBOUNCE_MS = 1500;

/** Send one JSON response. */
function sendJson(res, status, payload) {
	res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
	res.end(JSON.stringify(payload));
}

/**
 * Host plugin body.
 *
 * @param ctx - host context.
 */
export async function apply(ctx) {
	const { ServiceBroker } = await import('moleculer');

	/** Live mesh projection; rebuilt from the registry after every change. */
	let state = { running: false, namespace: '', nodeID: '', services: [] };
	/** Whether the `/moleculer` chat command is registered (it needs `commands`). */
	let commandReady = false;
	/** Tools currently registered, by public name. */
	const registered = new Map();
	/** Alerts waiting to be delivered to busy agents. */
	let notifyTimer;

	/** Read the durable settings section. */
	function settings() {
		return settingsScope.get();
	}

	/**
	 * Snapshot the broker registry into the flat shape the panel, the tools and
	 * the MCP server all read.
	 *
	 * `withActions` is what makes the tool surface possible: Moleculer returns the
	 * remote action names and their param schemas here.
	 *
	 * @param broker - the live broker.
	 * @returns the mesh state.
	 */
	function snapshot(broker) {
		const services = broker.registry.getServiceList({ withActions: true }).map((service) => ({
			name: service.name,
			version: service.version,
			fullName: service.fullName,
			nodeID: service.nodeID,
			local: service.local === true,
			available: service.available !== false,
			actions: Object.fromEntries(Object.entries(service.actions ?? {}).map(([key, action]) => [key, { params: action?.params ?? null }]))
		}));
		return {
			running: true,
			namespace: broker.namespace,
			nodeID: broker.nodeID,
			services
		};
	}

	/**
	 * Rebuild the model-facing tool surface from the registry.
	 *
	 * Two phases, mirroring the MCP client: derive the whole next generation
	 * first, then swap. A failure while deriving leaves the previous tools in
	 * place, so a transient registry hiccup cannot strip the model's tools.
	 *
	 * @param broker - the live broker.
	 */
	function resyncTools(broker) {
		let next;
		try {
			next = meshTools(snapshot(broker), TOOL_PREFIX);
		} catch (error) {
			ctx.logger.warn(`moleculer: could not derive mesh tools: ${String(error?.message ?? error)}`);
			return;
		}
		const wanted = new Set(next.map((tool) => tool.name));
		for (const [toolName, dispose] of registered) {
			if (wanted.has(toolName)) continue;
			registered.delete(toolName);
			try {
				dispose();
			} catch (error) {
				ctx.logger.warn(`moleculer: could not drop tool ${toolName}: ${String(error?.message ?? error)}`);
			}
		}
		for (const tool of next) {
			if (registered.has(tool.name)) continue;
			try {
				registered.set(tool.name, ctx.tools.register({
					name: tool.name,
					description: tool.description,
					parameters: tool.inputSchema.properties,
					output: {
						schema: { type: 'object', additionalProperties: true, properties: {} },
						render: (_args, value) => [{ type: 'text', text: formatMeshResult(value) }]
					},
					async execute(args, exec) {
						// The broker is re-read per call: the node that owned this action
						// may have left, and Moleculer fails over to another one.
						const result = await broker.call(tool.action, args, {
							...(exec.signal === undefined ? {} : { timeout: undefined })
						});
						return { ok: true, action: tool.action, result };
					}
				}));
			} catch (error) {
				ctx.logger.warn(`moleculer: could not register tool ${tool.name}: ${String(error?.message ?? error)}`);
			}
		}
	}

	/** Render one mesh call result for the model. */
	function formatMeshResult(value) {
		const payload = value?.result;
		if (payload === undefined) return 'no result';
		try {
			return typeof payload === 'string' ? payload : JSON.stringify(payload);
		} catch {
			return String(payload);
		}
	}

	/**
	 * Tell every busy agent that the mesh changed.
	 *
	 * Only a WORKING model is interrupted: injecting into an idle agent would
	 * create a turn nobody asked for. Agents are found through their sessions so
	 * the plugin does not need to track who is running a task.
	 *
	 * @param reason - what changed, phrased for the model.
	 */
	function notifyBusyAgents(reason) {
		for (const session of ctx.sessions.list()) {
			const agent = ctx.agents.get(session.id);
			if (agent === undefined) continue;
			// `running` is the agent loop's own status; anything else is at rest.
			if (agent.status !== 'running') continue;
			try {
				agent.inject({
					id: randomUUID(),
					role: 'user',
					content: [{ type: 'text', text: `[Moleculer mesh] ${reason}` }],
					source: { kind: 'plugin', plugin: 'moleculer' }
				});
			} catch (error) {
				ctx.logger.warn(`moleculer: could not notify session ${session.id}: ${String(error?.message ?? error)}`);
			}
		}
	}

	/** Recompute state, resync tools, and notify once the mesh settles. */
	function refresh(broker, reason) {
		state = snapshot(broker);
		resyncTools(broker);
		if (reason === undefined) return;
		if (notifyTimer !== undefined) clearTimeout(notifyTimer);
		notifyTimer = setTimeout(() => {
			notifyTimer = undefined;
			if (live === undefined) return;
			notifyBusyAgents(`${reason} ${describeMesh(state)}`);
		}, NOTIFY_DEBOUNCE_MS);
	}

	/** The running broker, or undefined. */
	let live;

	/**
	 * Start a broker from the current settings.
	 *
	 * Kept separate from `apply` so a settings change can restart it without
	 * reloading the plugin.
	 */
	async function startBroker() {
		await stopBroker();
		const config = settings();
		const broker = new ServiceBroker({
			nodeID: config.nodeID === '' ? undefined : config.nodeID,
			namespace: config.namespace,
			transporter: {
				type: config.transporter,
				// `urls` is who we DIAL; `port`/`hostname` is who we listen as.
				// Pointing `urls` at our own address makes Moleculer retry its own
				// socket forever, so the settings drop that entry before we get here.
				options: config.transporter === 'TCP'
					? { port: config.port, hostname: config.host, ...(config.peers.length === 0 ? {} : { urls: config.peers }) }
					: {}
			},
			logger: false,
			// ponytail: no heartbeat tuning, no retry policy — Moleculer's defaults
			// reconnect on their own; add knobs when a real network needs them.
			retryPolicy: { enabled: true, maxDelay: 2000 }
		});
		broker.localBus.on('$node.connected', (payload) => refresh(broker, `Node ${payload?.node?.id ?? '?'} joined the mesh.`));
		broker.localBus.on('$node.disconnected', (payload) => refresh(broker, `Node ${payload?.node?.id ?? '?'} left the mesh.`));
		broker.localBus.on('$services.changed', (payload) => {
			if (payload?.local === true) return;
			refresh(broker, 'The mesh service list changed.');
		});
		await broker.start();
		live = broker;
		refresh(broker, 'The mesh started.');
	}

	/** Stop the running broker, if any. */
	async function stopBroker() {
		if (notifyTimer !== undefined) {
			clearTimeout(notifyTimer);
			notifyTimer = undefined;
		}
		for (const [toolName, dispose] of registered) {
			registered.delete(toolName);
			try {
				dispose();
			} catch {
				// A tool already gone is not an error worth stopping shutdown over.
			}
		}
		if (live === undefined) return;
		const broker = live;
		live = undefined;
		try {
			await broker.stop();
		} catch (error) {
			ctx.logger.warn(`moleculer: broker shutdown failed: ${String(error?.message ?? error)}`);
		}
		state = { running: false, namespace: '', nodeID: '', services: [] };
	}

	// --- settings: the harness owns persistence ---
	//
	// `register` takes a schema FUNCTION and returns a scoped handle, so the
	// resolved value and the change feed come from the same registration.
	//
	// The schema is a plain function PLUS a `toJSON()`: `register` only CALLS the
	// schema, but `settings.describe()` serializes it with `schema.toJSON()`, and a
	// bare function has none — which throws and takes the whole describe mirror
	// down, so no settings card anywhere could be dispatched.
	const settingsSchema = (raw) => normalizeSettings(raw ?? {});
	settingsSchema.toJSON = () => ({
		type: 'object',
		properties: {
			namespace: { type: 'string' },
			transporter: { type: 'string' },
			host: { type: 'string' },
			port: { type: 'number' },
			nodeID: { type: 'string' },
			peers: { type: 'string' }
		}
	});
	const settingsScope = ctx.settings.register(SETTINGS_NS, settingsSchema, {
		base: { namespace: 'dsh', transporter: 'TCP', host: '127.0.0.1', port: 6174, nodeID: '', peers: '' }
	});

	ctx.effect(() => settingsScope.watch(() => {
		startBroker().catch((error) => ctx.logger.error(`moleculer: restart failed: ${String(error?.message ?? error)}`));
	}), 'moleculer: settings watch');

	// --- the panel's read surface ---
	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: STATE_PATH,
		handler: (req, res) => {
			if (req.method !== 'GET' && req.method !== 'HEAD') {
				res.writeHead(405, { allow: 'GET, HEAD' });
				res.end();
				return;
			}
			sendJson(res, 200, {
				state,
				tools: [...registered.keys()],
				command: commandReady,
				summary: describeMesh(state)
			});
		}
	}), 'moleculer: state route');

	// --- the same mesh over MCP, for an external MCP client ---
	//
	// One McpServer per HTTP session, held beside its Streamable HTTP transport:
	// the SDK requires the pair, and one server shared across sessions would
	// cross the clients' state.
	//
	// ponytail: the server is built per session and the tool set is that
	// session's snapshot; a mesh change reaches an MCP client only by
	// reconnecting. Push a `tools/list_changed` when an MCP client actually
	// needs it — sessions here are short and rare.
	const mcpSessions = new Map();

	/** Build one MCP server publishing the current mesh tools. */
	async function createMcpServer() {
		const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
		const { z } = await import('zod');
		const server = new McpServer({ name: 'dsh-moleculer', version: '0.1.0' });
		const typeOf = (type) => type === 'number' ? z.number().optional()
			: type === 'boolean' ? z.boolean().optional()
				: type === 'array' ? z.array(z.unknown()).optional()
					: z.string().optional();
		for (const tool of meshTools(state, TOOL_PREFIX)) {
			const shape = {};
			for (const [field, property] of Object.entries(tool.inputSchema.properties ?? {})) {
				shape[field] = typeOf(property.type);
			}
			server.registerTool(tool.name, { description: tool.description, inputSchema: shape }, async (args) => {
				try {
					const result = await live?.call(tool.action, args ?? {});
					return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }] };
				} catch (error) {
					return { isError: true, content: [{ type: 'text', text: `Moleculer call ${tool.action} failed: ${String(error?.message ?? error)}` }] };
				}
			});
		}
		return server;
	}

	ctx.effect(() => ctx.webServer.register({
		kind: 'exact',
		path: MCP_PATH,
		handler: async (req, res) => {
			const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
			const raw = req.headers['mcp-session-id'];
			const sessionId = Array.isArray(raw) ? raw[0] : raw;
			let entry = sessionId === undefined ? undefined : mcpSessions.get(sessionId);
			try {
				if (entry === undefined) {
					// No sessionIdGenerator: the transport stays stateless, so no ids
					// accumulate and no per-client state has to be reaped.
					const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
					const server = await createMcpServer();
					await server.connect(transport);
					entry = { server, transport };
				}
				await entry.transport.handleRequest(req, res);
			} catch (error) {
				ctx.logger.warn(`moleculer: MCP request failed: ${String(error?.message ?? error)}`);
				if (!res.headersSent) {
					res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
					res.end(JSON.stringify({ error: String(error?.message ?? error) }));
				}
			}
		}
	}), 'moleculer: mcp route');

	// --- chat control: /moleculer starts, stops, and reports the mesh ---
	//
	// `commands` is optional: a deployment without the command runtime keeps the
	// panel, the tools and the MCP endpoint.
	ctx.inject(['commands'], (commandCtx) => {
		commandCtx.commands.register({
			name: 'moleculer',
			description: 'Start, stop, restart, or inspect the Moleculer mesh',
			input: { hint: '[start|stop|restart|status]' },
			handler: async ({ rawInput }) => {
				const verb = String(rawInput ?? '').trim().toLowerCase();
				try {
					if (verb === '' || verb === 'status') {
						return {
							kind: 'success',
							text: `${state.running ? 'running' : 'stopped'} — ${describeMesh(state)}\nTools: ${registered.size === 0 ? 'none' : [...registered.keys()].join(', ')}`
						};
					}
					if (verb === 'start') {
						await startBroker();
						return { kind: 'success', text: `Moleculer mesh started. ${describeMesh(state)}` };
					}
					if (verb === 'stop') {
						await stopBroker();
						return { kind: 'success', text: 'Moleculer mesh stopped; its tools were removed.' };
					}
					if (verb === 'restart') {
						await startBroker();
						return { kind: 'success', text: `Moleculer mesh restarted. ${describeMesh(state)}` };
					}
					return { kind: 'error', text: `unknown verb "${verb}" — use /moleculer start|stop|restart|status` };
				} catch (error) {
					return { kind: 'error', text: `moleculer: ${String(error?.message ?? error)}` };
				}
			}
		});
		commandReady = true;
	});

	ctx.effect(() => () => {
		void stopBroker();
	}, 'moleculer: broker stop');

	// Startup is deliberately NOT awaited: `broker.start()` resolves only once the
	// transporter settles a connection attempt, and a peer that is down would then
	// hold up the whole harness boot. A failure is logged and the panel still
	// opens, so the person can fix the settings.
	void startBroker().catch((error) => {
		ctx.logger.error(`moleculer: broker did not start: ${String(error?.message ?? error)}`);
	});
}
