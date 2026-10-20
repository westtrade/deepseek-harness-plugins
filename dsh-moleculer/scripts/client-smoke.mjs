/** Client-bundle checks for `dsh-moleculer`: wiring, copy, settings card. */
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => { if (cond) { pass += 1; return; } fail += 1; console.log('FAIL:', label, extra); };

const reactStub = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
	useEffect: () => {}, useCallback: (fn) => fn, useMemo: (fn) => fn(), useRef: (value) => ({ current: value })
};

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
let captured;
globalThis.window = { __ModuleLoader__: { load: (definition) => { captured = definition; } } };
const primitivesStub = { IconChevronDownOutline14: 'IconChevronDownOutline14' };
const requireShim = (specifier) => {
	if (specifier === 'react') return reactStub;
	if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub;
	throw new Error(`unexpected require(${specifier})`);
};
const moduleShim = { exports: {} };
new Function('require', 'window', 'module', 'exports', source)(requireShim, globalThis.window, moduleShim, moduleShim.exports);
ok('bundle registers itself', captured?.id === 'dsh-moleculer', captured?.id);

const registrations = [];
const dictionaries = [];
const languages = [];
const ctx = {
	locale: {
		bind: () => (key) => key,
		// Simulates another plugin having registered Russian first: this MUST NOT
		// break the browser half, or the settings card never appears.
		addLanguage: (input) => { languages.push(input); throw new Error('locale "ru" is already registered'); },
		register: (ns, dicts) => { dictionaries.push({ ns, dicts }); return () => {}; }
	},
	slots: {
		inject: (slot, callback) => { callback(); return () => {}; },
		register: (options, component) => { registrations.push({ options, component }); return () => {}; }
	},
	settingsScope: {
		bind: (spec) => ({
			getSnapshot: () => ({ value: {}, revision: 0, status: "host", writable: true }),
			subscribe: () => () => {},
			set: async () => {},
			unset: async () => {}
		})
	},
	effect: (factory) => factory()
};
const exportsObject = captured.factory(requireShim);
ok('exports apply', typeof exportsObject.apply === 'function');
ok('inject names the needed services', JSON.stringify(exportsObject.inject) === JSON.stringify(['slots', 'locale', 'settingsScope']), JSON.stringify(exportsObject.inject));
exportsObject.apply(ctx);

const card = registrations.find((entry) => entry.options.name === 'settings.plugin.item');
ok('the settings card is registered', card !== undefined);
ok('the card claims the settings namespace as a KEYED slot key', card?.options.key === 'dsh-moleculer', JSON.stringify(card?.options));
ok('the card declares the copy namespace', card?.options.locale === 'moleculer', String(card?.options.locale));
ok('the card bridges the settings scope', typeof card?.options.inject === 'function' && card.options.inject().host !== undefined);

const dictionary = dictionaries.find((entry) => entry.ns === 'moleculer');
const enKeys = Object.keys(dictionary?.dicts.en ?? {});
const ruKeys = Object.keys(dictionary?.dicts.ru ?? {});
const zhKeys = Object.keys(dictionary?.dicts.zh ?? {});
ok('three dictionaries ship', enKeys.length > 15, String(enKeys.length));
ok('all dictionaries share one key set', enKeys.length === zhKeys.length && zhKeys.length === ruKeys.length && enKeys.every((k) => zhKeys.includes(k) && ruKeys.includes(k)), `${enKeys.length}/${zhKeys.length}/${ruKeys.length}`);
ok('the plugin still applies when Russian is already registered', registrations.some((entry) => entry.options.name === 'settings.plugin.item'), 'a duplicate language must not sink the card');
ok('it attempts to offer the Russian pack', languages.some((entry) => entry.id === 'ru' && entry.fallback === 'en'), JSON.stringify(languages));

ok('the card reads the host state route', source.includes('/api/moleculer/state'));
ok('the card writes through the settings scope', source.includes('host.set('));
ok('the card offers every supported transporter', ['TCP', 'NATS', 'Redis', 'MQTT', 'AMQP'].every((name) => source.includes(`"${name}"`)));
ok('the card validates the port', source.includes('port must be 1-65535'));
ok('the card polls the mesh state', source.includes('setInterval'));
ok('the card reuses the shell chevron', source.includes('primitives.IconChevronDownOutline14'));
ok('the card collapses and expands', source.includes('aria-expanded') && source.includes('open ? body : null'));
ok('the card starts collapsed, like every shipped card', source.includes('react.useState(false)'));
ok('the card copies the shipped card styles', source.includes('dshmca_card') && source.includes('border-radius:16px') && source.includes('padding:14px 16px'));
ok('the card injects its own stylesheet', source.includes('dsh-moleculer/settings-card.css'));

console.log(`  registered: ${registrations.map((r) => `${r.options.name} → ${r.options.id}`).join(' | ')}`);
console.log(`  copy keys : ${enKeys.length} en / ${zhKeys.length} zh / ${ruKeys.length} ru`);
console.log(`\nclient: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
