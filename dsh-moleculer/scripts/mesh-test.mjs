/** Pure checks for the mesh adapter: settings, tool derivation, schema mapping. */
import { describeMesh, meshServices, meshTools, normalizeSettings, paramsToJsonSchema } from '../lib/mesh.js';

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => { if (cond) { pass += 1; return; } fail += 1; console.log('FAIL:', label, extra); };

// --- settings ---
ok('defaults are usable', JSON.stringify(normalizeSettings({})).includes('"port":6174'));
ok('namespace is trimmed', normalizeSettings({ namespace: '  prod  ' }).namespace === 'prod');
ok('transport is upper-cased', normalizeSettings({ transporter: 'nats' }).transporter === 'NATS');
ok('a port is validated', (() => { try { normalizeSettings({ port: 70000 }); return false; } catch { return true; } })());
ok('an unknown transport is refused', (() => { try { normalizeSettings({ transporter: 'node:fs' }); return false; } catch { return true; } })());
ok('a bogus namespace is refused', (() => { try { normalizeSettings({ namespace: 'a/b' }); return false; } catch { return true; } })());

// --- tool derivation ---
const state = {
  namespace: 'demo',
  services: [
    { name: 'math', nodeID: 'n1', local: true, actions: { 'math.add': { params: { a: { type: 'number' } } } } },
    { name: 'orders', version: 2, nodeID: 'n2', local: false, actions: {
      'orders.create': { params: { sku: { type: 'string' }, qty: { type: 'number', default: 1 }, note: { type: 'string', optional: true } } },
      'orders.cancel': { handler: () => true }
    } }
  ]
};
const tools = meshTools(state);
// Every published service is exposed, local included: `$node` is the smoke-test
// tool, and a local action is still a legitimate thing to call.
ok('local services are exposed too', tools.some((t) => t.service === 'math'));
ok('remote actions become tools', tools.some((t) => t.action === 'orders.create'), tools.map((t) => t.action).join(','));
ok('tool names are prefixed and sanitized', tools.every((t) => /^mesh_[a-z]+_[a-z]+$/.test(t.name)), tools.map((t) => t.name).join(','));
ok('a tool keeps the real action name', tools.find((t) => t.name === 'mesh_orders_create')?.action === 'orders.create');
ok('a tool names its node', tools.some((t) => t.description.includes('n2')));
ok('a version is surfaced', tools.some((t) => t.description.includes('v2')));
ok('meshServices keeps available rows', meshServices(state).length === 2);
// `$node` must survive sanitization, because it is the local smoke-test tool.
const nodeState = { services: [{ name: '$node', nodeID: 'n9', local: true, actions: { '$node.list': {}, '$node.health': {} } }] };
const nodeTools = meshTools(nodeState);
ok('$node is exposed as tools', nodeTools.length === 2, nodeTools.map((t) => t.name).join(','));
ok('$node tool names are sanitized and clean', nodeTools.every((t) => /^mesh_node_[a-z]+$/.test(t.name)), nodeTools.map((t) => t.name).join(','));
ok('a $node tool keeps the real action', nodeTools[0].action === '$node.list', nodeTools[0].action);
ok('an unavailable service is dropped', meshServices({ services: [{ name: 'gone', available: false }] }).length === 0);

// --- params ---
const schema = paramsToJsonSchema({ sku: { type: 'string' }, qty: { type: 'number', default: 1 }, note: { type: 'string', optional: true } });
ok('typed params become properties', JSON.stringify(schema.properties) === JSON.stringify({ sku: { type: 'string' }, qty: { type: 'number' }, note: { type: 'string' } }), JSON.stringify(schema.properties));
ok('optional and defaulted params are not required', JSON.stringify(schema.required) === JSON.stringify(['sku']), JSON.stringify(schema.required));
ok('an action without params gets a free object', paramsToJsonSchema(undefined).additionalProperties === true);
ok('an unsupported type is dropped, not guessed', Object.keys(paramsToJsonSchema({ x: { type: 'buffer' } }).properties).length === 0);
ok('a bare string type is accepted', paramsToJsonSchema({ x: 'string' }).properties.x.type === 'string');

// --- summary ---
ok('a summary counts nodes and actions', describeMesh(state).includes('node(s)') && describeMesh(state).includes('action(s)'), describeMesh(state));
ok('a stopped mesh says so', describeMesh(undefined).includes('not running'));
ok('an empty mesh says so', describeMesh({ services: [] }).includes('no services'));

console.log(`\nmesh: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
