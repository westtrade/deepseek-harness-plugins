/**
 * The parameter compiler, and the audit that guards it.
 *
 * The failure this covers is a whole turn dying with a provider error that never
 * mentions a tool: `400 INVALID_ARGUMENT "value at top-level must be a string"`,
 * and later `"value at properties.model.properties.model must be a list"`. Both
 * came from sending declarations instead of JSON Schema.
 */
import { toParameterSchema } from '../lib/tool-schema.js';

let pass = 0;
let fail = 0;
/** Record one check. */
function ok(name, condition, detail) {
	if (condition) {
		pass += 1;
		return;
	}
	fail += 1;
	console.log(`FAIL: ${name}${detail === undefined ? '' : ` — ${detail}`}`);
}

// --- the root is a schema, never a bare map ---------------------------------
const compiled = toParameterSchema({
	task: { type: 'string', required: true, description: 'what to do' },
	verbose: { type: 'boolean' }
});
ok('the root has a type', compiled.type === 'object');
ok('properties are kept', compiled.properties.task.type === 'string' && compiled.properties.verbose.type === 'boolean');
ok('required becomes a list on the root', JSON.stringify(compiled.required) === '["task"]');
ok('description survives', compiled.properties.task.description === 'what to do');
ok('required: true is gone from the property', compiled.properties.task.required === undefined);

// --- the reported bug: nested required ---------------------------------------
const nested = toParameterSchema({
	model: {
		type: 'object',
		properties: {
			provider: { type: 'string', required: true },
			model: { type: 'string', required: true }
		}
	}
});
ok('a nested object keeps its type', nested.properties.model.type === 'object');
ok('nested required becomes a list', JSON.stringify(nested.properties.model.required) === '["provider","model"]');
ok('no boolean required survives anywhere', !JSON.stringify(nested).includes('"required":true'));

// --- additionalProperties is not a Gemini Schema field ----------------------
const open = toParameterSchema({
	gate: { type: 'object', additionalProperties: false, properties: { file: { type: 'string' } } }
});
ok('additionalProperties is dropped', open.properties.gate.additionalProperties === undefined);
ok('the rest of the object survives', open.properties.gate.properties.file.type === 'string');

// --- arrays and their items -------------------------------------------------
const array = toParameterSchema({
	upsert: { type: 'array', required: true, items: { type: 'object' }, description: 'elements' }
});
ok('array items survive', array.properties.upsert.items.type === 'object');
ok('array required is on the root', JSON.stringify(array.required) === '["upsert"]');

// --- already-compiled schemas pass through ----------------------------------
const already = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] };
const roundTrip = toParameterSchema(already);
ok('a compiled schema is kept', roundTrip.properties.a.type === 'string' && JSON.stringify(roundTrip.required) === '["a"]');

// --- edge cases -------------------------------------------------------------
ok('an empty declaration becomes an empty object', JSON.stringify(toParameterSchema({})) === '{"type":"object","properties":{}}');
ok('undefined becomes an empty object', toParameterSchema(undefined).type === 'object');
ok('null becomes an empty object', toParameterSchema(null).type === 'object');
ok('a null property does not crash', toParameterSchema({ a: null }).properties.a !== undefined);

// --- nothing produced may carry a boolean required --------------------------
for (const [label, schema] of [['compiled', compiled], ['nested', nested], ['open', open], ['array', array]]) {
	ok(`no "required":true in the ${label} schema`, !JSON.stringify(schema).includes('"required":true'));
}

console.log(`schema: pass=${pass} fail=${fail}`);
process.exitCode = fail === 0 ? 0 : 1;
