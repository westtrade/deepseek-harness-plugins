/**
 * Mesh configuration for `dsh-moleculer`.
 *
 * Two layers, deliberately separated:
 *
 * - `settings` — the durable broker options the harness Settings UI edits
 *   (namespace, transporter address, node id). The harness owns persistence.
 * - `state` — what the broker actually found at runtime (live nodes, published
 *   services). Never persisted: a stale peer list is worse than none.
 *
 * This module also owns the MODEL-FACING surface. It is a fixed, tiny API
 * (`mesh_list` → `mesh_describe` → `mesh_call`) instead of one tool per mesh
 * action: a mesh with 200 actions would otherwise push 200 tool descriptions
 * into every request, and the model would pay for them on every turn whether
 * it used them or not. The catalog is fetched on demand instead, so the
 * context cost is proportional to what the model actually asks about.
 *
 * Only `node:` builtins are imported here: this module is loaded through a
 * symlinked workspace path, where the harness packages are not resolvable.
 *
 * @module dsh-moleculer/mesh
 */

/** Transports Moleculer can reach a peer over. */
export const TRANSPORTS = ['TCP', 'NATS', 'Redis', 'MQTT', 'AMQP'];

/** Default broker listen port. Moleculer's own TCP default. */
export const DEFAULT_PORT = 6174;

/** How long a discovery wait may block, in milliseconds. */
export const DISCOVERY_TIMEOUT_MS = 4000;

/**
 * The fixed tool names this plugin publishes, in the order a caller uses them.
 *
 * Kept as an exported constant because the state route, the `/moleculer`
 * command and the tests all need to name them.
 */
export const META_TOOL_SUFFIXES = ['list', 'describe', 'call'];

/**
 * Normalize the durable settings section.
 *
 * Unknown transports are refused rather than passed through: Moleculer treats
 * an unknown name as a module path, so a typo would turn into an attempted
 * import of an attacker-chosen package.
 *
 * @param value - raw settings section.
 * @returns the resolved settings.
 * @throws {Error} when a field is unusable.
 */
export function normalizeSettings(value = {}) {
	const namespace = typeof value.namespace === 'string' && value.namespace.trim() !== ''
		? value.namespace.trim()
		: 'dsh';
	if (!/^[A-Za-z0-9_-]{1,64}$/.test(namespace)) {
		throw new Error('namespace must be 1-64 characters of A-Z, a-z, 0-9, _ or -');
	}
	const transporter = typeof value.transporter === 'string' ? value.transporter.toUpperCase() : 'TCP';
	if (!TRANSPORTS.includes(transporter)) {
		throw new Error(`transporter must be one of ${TRANSPORTS.join(', ')}`);
	}
	const port = Number.isInteger(value.port) ? value.port : DEFAULT_PORT;
	if (port < 1 || port > 65535) throw new Error('port must be 1-65535');
	const host = typeof value.host === 'string' && value.host.trim() !== '' ? value.host.trim() : '127.0.0.1';
	const nodeID = typeof value.nodeID === 'string' && value.nodeID.trim() !== '' ? value.nodeID.trim() : '';
	// Peers are the addresses this broker DIALS. Its own host:port is never one of
	// them: dialling yourself makes Moleculer retry its own socket forever.
	const own = `${host}:${String(port)}`;
	const peers = (Array.isArray(value.peers) ? value.peers : typeof value.peers === 'string' ? value.peers.split(',') : [])
		.map((peer) => String(peer).trim())
		.filter((peer) => peer !== '' && peer !== own);
	return { namespace, transporter, host, port, nodeID, peers };
}

/**
 * Build the list of mesh services worth exposing.
 *
 * Everything the broker publishes goes in, including its own `$node` internals
 * and local services: `$node` is what lets a caller ask the mesh about itself
 * (`$node.services`, `$node.actions`, `$node.health`), which is the cheapest way
 * to prove the MCP bridge works before any peer exists.
 *
 * ponytail: no filtering at all — one broker in this deployment publishes no
 * business services, so there is nothing to drown in noise. Add a deny-list
 * when a peer's internals actually start burying the real tools.
 *
 * @param state - live mesh state.
 * @returns `{ name, version, fullName, nodeID, actions }` rows.
 */
export function meshServices(state) {
	return (state.services ?? []).filter((service) => service.available !== false);
}

/**
 * One service row plus its action names, as the model will read it.
 *
 * Names only, never schemas: this is the cheap index the model asks for first,
 * and a service may publish dozens of actions.
 *
 * @param state - live mesh state.
 * @param filter - only services whose name contains this substring (case-insensitive).
 * @returns compact catalog rows.
 */
export function meshCatalog(state, filter = '') {
	const wanted = String(filter ?? '').trim().toLowerCase();
	const services = meshServices(state)
		.filter((service) => wanted === '' || String(service.name).toLowerCase().includes(wanted))
		.map((service) => ({
			name: service.name,
			nodeID: service.nodeID,
			...(service.version === undefined ? {} : { version: service.version }),
			local: service.local === true,
			actions: Object.keys(service.actions ?? {})
		}));
	return {
		namespace: state?.namespace ?? '',
		running: state?.running === true,
		services,
		actions: services.reduce((total, service) => total + service.actions.length, 0)
	};
}

/**
 * Resolve one action reference to its service and descriptor.
 *
 * The model may quote the dotted Moleculer name (`orders.create`) or the
 * sanitized spelling it saw in the catalog (`orders_create`); both resolve, so
 * a copy-paste from either place works.
 *
 * @param state - live mesh state.
 * @param wanted - action name as the model wrote it.
 * @returns `{ service, action, params }`, or undefined when nothing matches.
 */
export function findAction(state, wanted) {
	const raw = String(wanted ?? '').trim();
	if (raw === '') return undefined;
	const sanitized = sanitize(raw);
	const matches = [];
	for (const service of meshServices(state)) {
		for (const [action, descriptor] of Object.entries(service.actions ?? {})) {
			if (action === raw) return { service, action, params: descriptor?.params ?? null };
			if (sanitize(action) !== sanitized) continue;
			matches.push({ service, action, params: descriptor?.params ?? null });
		}
	}
	// A sanitized name can be ambiguous (`a.b_c` and `a_b.c` both become
	// `a_b_c`); the first hit wins and the dotted form always stays available.
	return matches[0];
}

/**
 * Everything known about one action, on demand.
 *
 * @param state - live mesh state.
 * @param wanted - action reference.
 * @returns a describe payload, or `{ error }` when the action is unknown.
 */
export function describeAction(state, wanted) {
	const found = findAction(state, wanted);
	if (found === undefined) {
		return { error: `unknown mesh action "${String(wanted ?? '')}"; call ${'mesh_list'} to see available actions` };
	}
	const schema = paramsToJsonSchema(found.params);
	return {
		action: found.action,
		service: found.service.name,
		nodeID: found.service.nodeID,
		...(found.service.version === undefined ? {} : { version: found.service.version }),
		params: schema
	};
}

/**
 * The three tool descriptors this plugin publishes.
 *
 * `port` is the broker side the tools need and nothing else:
 * `state()` returns the live snapshot, `call(action, params)` invokes one
 * action. Keeping it an argument (instead of importing the broker) is what
 * lets the whole catalog be tested without a network.
 *
 * @param port - live mesh access.
 * @param prefix - tool-name prefix, keeps mesh tools greppable.
 * @returns `{ name, description, parameters, render, execute }` rows.
 */
export function meshToolDescriptors(port, prefix = 'mesh') {
	const name = (suffix) => `${prefix}_${suffix}`;
	return [
		{
			name: name('list'),
			description:
				'List the live Moleculer mesh: every service and its action names (no schemas). '
				+ 'Start here, then use ' + name('describe') + ' for one action and ' + name('call') + ' to invoke it. '
				+ 'Pass `service` to filter.',
			parameters: {
				service: { type: 'string', description: 'Only services whose name contains this text (case-insensitive). Omit for the whole mesh.' }
			},
			render: (value) => renderCatalog(value),
			async execute(args) {
				return meshCatalog(port.state(), args?.service ?? '');
			}
		},
		{
			name: name('describe'),
			description:
				'Describe one mesh action: its service, node and parameter schema. '
				+ 'Call it before ' + name('call') + ' when you need the argument shape.',
			parameters: {
				action: { type: 'string', required: true, description: 'Action name, e.g. "orders.create" or the dotted name from ' + name('list') + '.' }
			},
			render: (value) => JSON.stringify(value),
			async execute(args) {
				const described = describeAction(port.state(), args?.action);
				if (described.error !== undefined) throw new Error(described.error);
				return described;
			}
		},
		{
			name: name('call'),
			description:
				'Invoke one Moleculer action. `params` is passed to the action unchanged. '
				+ 'Use ' + name('list') + ' to find the action name and ' + name('describe') + ' for its parameters.',
			parameters: {
				action: { type: 'string', required: true, description: 'Action name, e.g. "orders.create".' },
				params: { type: 'object', additionalProperties: true, description: 'Arguments forwarded to the action. Omit for actions that take none.' }
			},
			render: (value) => renderCall(value),
			async execute(args) {
				const found = findAction(port.state(), args?.action);
				if (found === undefined) throw new Error(`unknown mesh action "${String(args?.action ?? '')}"; call ${name('list')} to see available actions`);
				const result = await port.call(found.action, args?.params ?? {});
				return { action: found.action, result };
			}
		}
	];
}

/** Render a catalog as compact lines, one service per line. */
function renderCatalog(value) {
	if (value === undefined || value === null) return 'no mesh catalog';
	if (value.running !== true) return 'The Moleculer mesh is not running.';
	const services = value.services ?? [];
	if (services.length === 0) return `Moleculer mesh "${value.namespace ?? '?'}" has no services.`;
	const lines = services.map((service) => `${service.name}${service.version === undefined ? '' : `@${String(service.version)}`} [${service.local === true ? 'local' : 'remote'} ${service.nodeID}]: ${service.actions.length === 0 ? '(no actions)' : service.actions.join(', ')}`);
	return `Moleculer mesh "${value.namespace ?? '?'}": ${String(services.length)} service(s), ${String(value.actions ?? 0)} action(s)\n${lines.join('\n')}`;
}

/** Render one call result for the model. */
function renderCall(value) {
	const payload = value?.result;
	if (payload === undefined) return 'no result';
	try {
		return typeof payload === 'string' ? payload : JSON.stringify(payload);
	} catch {
		return String(payload);
	}
}

/** Collapse one action or service name to its comparable, model-friendly form. */
function sanitize(value) {
	return String(value).replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 64);
}

/**
 * Translate Moleculer action params into a JSON Schema object.
 *
 * Moleculer's shorthand is `{ field: { type, optional, default } }`; a bare
 * string means a type. Anything else is skipped, and the schema falls back to a
 * free object so the call still works.
 *
 * @param params - Moleculer params record.
 * @returns an object JSON Schema.
 */
export function paramsToJsonSchema(params) {
	const properties = {};
	const required = [];
	if (params !== null && typeof params === 'object' && !Array.isArray(params)) {
		for (const [field, spec] of Object.entries(params)) {
			const descriptor = typeof spec === 'string' ? { type: spec } : spec;
			if (descriptor === null || typeof descriptor !== 'object') continue;
			const type = normalizeType(descriptor.type);
			if (type === undefined) continue;
			properties[field] = {
				type,
				...(typeof descriptor.description === 'string' && descriptor.description !== '' ? { description: descriptor.description } : {})
			};
			if (descriptor.optional !== true && descriptor.default === undefined) required.push(field);
		}
	}
	return {
		type: 'object',
		additionalProperties: true,
		properties,
		...(required.length === 0 ? {} : { required })
	};
}

/** Map one Moleculer type name onto a JSON Schema type, or undefined. */
function normalizeType(type) {
	if (type === undefined || type === null) return undefined;
	const name = typeof type === 'string' ? type.toLowerCase() : '';
	if (name === 'string') return 'string';
	if (name === 'number' || name === 'numeric' || name === 'integer') return 'number';
	if (name === 'boolean' || name === 'bool') return 'boolean';
	if (name === 'array') return 'array';
	if (name === 'object') return 'object';
	return undefined;
}

/**
 * One-line summary of the mesh, for the model and for the panel.
 * @param state - live mesh state.
 * @returns a human sentence.
 */
export function describeMesh(state) {
	if (state === undefined || state === null) return 'The Moleculer mesh is not running.';
	const services = meshServices(state);
	if (services.length === 0) return `Moleculer mesh "${state.namespace ?? '?'}" has no services.`;
	const nodes = [...new Set(services.map((service) => service.nodeID))];
	const actions = services.reduce((total, service) => total + Object.keys(service.actions ?? {}).length, 0);
	return `Moleculer mesh "${state.namespace ?? '?'}": ${String(nodes.length)} node(s), ${String(services.length)} service(s), ${String(actions)} action(s).`;
}