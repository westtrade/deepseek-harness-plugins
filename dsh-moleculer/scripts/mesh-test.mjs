/** Pure checks for the mesh adapter: settings, catalog, lookup, schema mapping. */
import { describeMesh, describeAction, findAction, meshCatalog, meshServices, meshToolDescriptors, normalizeSettings, paramsToJsonSchema } from '../lib/mesh.js';

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => { if (cond) { pass += 1; return; } fail += 1; console.log('FAIL:', label, extra); };

// --- settings ---
ok('defaults are usable', JSON.stringify(normalizeSettings({})).includes('"port":6174'));
ok('namespace is trimmed', normalizeSettings({ namespace: '  prod  ' }).namespace === 'prod');
ok('transport is upper-cased', normalizeSettings({ transporter: 'nats' }).transporter === 'NATS');
ok('a port is validated', (() => { try { normalizeSettings({ port: 70000 }); return false; } catch { return true; } })());
ok('an unknown transport is refused', (() => { try { normalizeSettings({ transporter: 'node:fs' }); return false; } catch { return true; } })());
ok('a bogus namespace is refused', (() => { try { normalizeSettings({ namespace: 'a/b' }); return false; } catch { return true; } })());

// --- catalog ---
const state = {
  namespace: 'demo',
  running: true,
  services: [
    { name: 'math', nodeID: 'n1', local: true, actions: { 'math.add': { params: { a: { type: 'number' } } } } },
    { name: 'orders', version: 2, nodeID: 'n2', local: false, actions: {
      'orders.create': { params: { sku: { type: 'string' }, qty: { type: 'number', default: 1 }, note: { type: 'string', optional: true } } },
      'orders.cancel': { handler: () => true }
    } }
  ]
};
const catalog = meshCatalog(state);
ok('the catalog keeps every service', catalog.services.length === 2, JSON.stringify(catalog.services));
ok('the catalog counts actions', catalog.actions === 3, String(catalog.actions));
ok('the catalog carries action names', catalog.services.find((s) => s.name === 'orders').actions.includes('orders.create'));
ok('the catalog is names only', catalog.services.every((s) => Array.isArray(s.actions) && s.actions.every((name) => typeof name === 'string')));
ok('a version is surfaced', catalog.services.find((s) => s.name === 'orders').version === 2);
ok('a service filter is honoured', meshCatalog(state, 'ord').services.length === 1 && meshCatalog(state, 'ord').actions === 2);
ok('the filter is case-insensitive', meshCatalog(state, 'ORD').services.length === 1);
ok('an empty filter keeps everything', meshCatalog(state, '   ').services.length === 2);
ok('a stopped mesh is reported', meshCatalog({ running: false, services: [] }).running === false);
ok('meshServices keeps available rows', meshServices(state).length === 2);
ok('an unavailable service is dropped', meshServices({ services: [{ name: 'gone', available: false }] }).length === 0);

// --- lookup ---
ok('a dotted action resolves', findAction(state, 'orders.create')?.action === 'orders.create');
ok('...and finds its params', findAction(state, 'orders.create')?.params?.sku?.type === 'string');
ok('the sanitized spelling resolves too', findAction(state, 'orders_create')?.action === 'orders.create');
ok('a $node action resolves', findAction({ services: [{ name: '$node', nodeID: 'n9', actions: { '$node.list': {} } }] }, '$node.list')?.action === '$node.list');
ok('an unknown action does not resolve', findAction(state, 'nope.nope') === undefined);
ok('an empty lookup does not resolve', findAction(state, '  ') === undefined);
const described = describeAction(state, 'orders.create');
ok('describe names the service', described.service === 'orders' && described.action === 'orders.create');
ok('describe names the node', described.nodeID === 'n2');
ok('describe carries the param schema', described.params.properties.sku.type === 'string');
ok('describe of an unknown action returns an error', typeof describeAction(state, 'nope').error === 'string');

// --- tool descriptors: the fixed surface ---
const port = { state: () => state, call: async (action, params) => ({ action, params }) };
const tools = meshToolDescriptors(port);
ok('exactly three tools are published', tools.length === 3, tools.map((t) => t.name).join(','));
ok('the tool names are the meta-API', JSON.stringify(tools.map((t) => t.name)) === JSON.stringify(['mesh_list', 'mesh_describe', 'mesh_call']));
ok('every mesh tool is in the mesh group', tools.every((t) => t.name.startsWith('mesh_')));
ok('the surface does not depend on the mesh size', meshToolDescriptors({ state: () => ({ services: Array.from({ length: 50 }, (_, i) => ({ name: `svc${i}`, nodeID: 'n', actions: { [`svc${i}.a`]: {} } })) }), call: async () => null }).length === 3);
ok('list takes an optional service filter', !tools[0].parameters.service?.required && tools[0].parameters.service?.type === 'string');
ok('describe requires an action', tools[1].parameters.action?.required === true);
ok('call requires an action', tools[2].parameters.action?.required === true);
ok('call accepts free-form params', tools[2].parameters.params?.type === 'object' && tools[2].parameters.params?.additionalProperties === true);
ok('the descriptions point at each other', tools[0].description.includes('mesh_describe') && tools[0].description.includes('mesh_call'));

const listed = await tools[0].execute({});
ok('mesh_list returns the catalog', listed.services.length === 2);
ok('mesh_list filters', (await tools[0].execute({ service: 'ord' })).services.length === 1);
ok('mesh_list renders one line per service', tools[0].render(listed).split('\n').length === 3, tools[0].render(listed));
ok('mesh_list says when the mesh is down', tools[0].render(meshCatalog({ running: false })).includes('not running'));

const describedTool = await tools[1].execute({ action: 'orders_create' });
ok('mesh_describe resolves the sanitized spelling', describedTool.action === 'orders.create');
let threw = '';
try { await tools[1].execute({ action: 'nope' }); } catch (error) { threw = error.message; }
ok('mesh_describe refuses an unknown action', threw.includes('unknown mesh action') && threw.includes('mesh_list'), threw);

const called = await tools[2].execute({ action: 'orders.create', params: { sku: 'ABC' } });
ok('mesh_call forwards the dotted action', called.action === 'orders.create' && called.result.params.sku === 'ABC');
ok('mesh_call defaults params to an empty object', (await tools[2].execute({ action: 'orders.create' })).result.params !== undefined);
threw = '';
try { await tools[2].execute({ action: 'nope' }); } catch (error) { threw = error.message; }
ok('mesh_call refuses an unknown action', threw.includes('unknown mesh action'), threw);
ok('mesh_call renders the result', tools[2].render({ action: 'x', result: { a: 1 } }) === '{"a":1}');
ok('mesh_call renders a string result as-is', tools[2].render({ action: 'x', result: 'pong' }) === 'pong');
ok('mesh_call renders a missing result', tools[2].render({ action: 'x' }) === 'no result');
threw = '';
try { await meshToolDescriptors({ state: () => state, call: async () => { throw new Error('the Moleculer mesh is not running'); } })[2].execute({ action: 'orders.create' }); } catch (error) { threw = error.message; }
ok('a stopped broker surfaces as a tool error', threw.includes('not running'), threw);

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