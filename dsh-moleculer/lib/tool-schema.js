/**
 * Compile declared tool parameters into the JSON Schema a model provider gets.
 *
 * `ctx.tools.register` takes a *finished* JSON Schema — the compact map
 * (`{ field: { type, description, required: true } }`) that `defineTool` compiles
 * internally is not one. Passing the map straight through sent providers a
 * schema with no root `type` and no `properties`: lenient providers tolerate it,
 * strict ones reject the whole request (an OpenAI-compatible Gemini endpoint
 * answers `400 INVALID_ARGUMENT "value at top-level must be a string"`, with no
 * hint that a tool schema was at fault).
 *
 * Two normalizations matter for strict providers:
 * - `required: true` on a property becomes an entry in the parent's `required`
 *   array, at any depth (a nested object keeping the boolean is invalid schema);
 * - `additionalProperties` is dropped: it is not a field of Gemini's `Schema`,
 *   and an open object is the JSON Schema default anyway.
 *
 * @param spec - per-property parameter definitions, or an already-compiled schema.
 * @returns an object-rooted JSON Schema.
 */
export function toParameterSchema(spec) {
	const schema = spec !== null && typeof spec === 'object' && (spec.type === 'object' || spec.properties !== undefined)
		? normalizeNode(spec)
		: normalizeNode({ type: 'object', properties: spec === null || typeof spec !== 'object' ? {} : spec });
	if (schema.type === undefined) schema.type = 'object';
	if (schema.properties === undefined) schema.properties = {};
	return schema;
}

/** Normalize one schema node and everything below it. */
function normalizeNode(node) {
	if (node === null || typeof node !== 'object') return {};
	const { required: declared, additionalProperties: _open, ...rest } = node;
	const out = { ...rest };
	// A schema that is already compiled carries `required` as a list: keep it,
	// and let the shorthand markers below add to it rather than replace it.
	const inherited = Array.isArray(declared) ? declared.filter((entry) => typeof entry === 'string') : [];
	if (out.properties !== undefined && out.properties !== null && typeof out.properties === 'object') {
		const properties = {};
		const required = [];
		for (const [name, property] of Object.entries(out.properties)) {
			const normalized = normalizeNode(property);
			// A nested property may still carry the declaration shorthand.
			if (property !== null && typeof property === 'object' && property.required === true) required.push(name);
			properties[name] = normalized;
		}
		out.properties = properties;
		const all = [...new Set([...inherited, ...required])];
		if (all.length > 0) out.required = all;
	}
	if (out.items !== undefined) out.items = normalizeNode(out.items);
	if (out.required === undefined && inherited.length > 0) out.required = inherited;
	return out;
}
