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
 * Flatten the remote mesh into MCP tool descriptors.
 *
 * Moleculer's action `params` is already a JSON-schema-ish record, so it is
 * translated rather than re-invented; a parameter without a supported type is
 * dropped instead of guessed, because a wrong schema is worse than a loose one.
 *
 * @param state - live mesh state.
 * @param prefix - tool name prefix, keeps mesh tools greppable.
 * @returns one descriptor per remote action.
 */
export function meshTools(state, prefix = 'mesh') {
	const tools = [];
	for (const service of meshServices(state)) {
		for (const [fullName, action] of Object.entries(service.actions ?? {})) {
			const actionName = fullName.includes('.') ? fullName.slice(fullName.indexOf('.') + 1) : fullName;
			const toolName = `${prefix}_${service.name}_${actionName}`.replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 64);
			tools.push({
				name: toolName,
				description: `Call ${fullName} on Moleculer node ${service.nodeID}${service.version === undefined ? '' : ` (v${service.version})`}.`,
				action: fullName,
				service: service.name,
				inputSchema: paramsToJsonSchema(action?.params)
			});
		}
	}
	return tools;
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
	return `Moleculer mesh "${state.namespace ?? '?'}": ${String(nodes.length)} node(s), ${String(services.length)} service(s), ${String(meshTools(state).length)} action(s).`;
}
