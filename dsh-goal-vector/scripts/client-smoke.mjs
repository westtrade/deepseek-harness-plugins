/**
 * Client-bundle checks for `dsh-goal-vector`.
 *
 * Evaluates lib/client.js the way the browser does — a CommonJS factory
 * registered on `window.__ModuleLoader__`, requiring only `react` — and asserts
 * the registrations a page and a composer selector need.
 *
 * Run: `node scripts/client-smoke.mjs`
 */

import { readFile } from 'node:fs/promises';

let pass = 0;
let fail = 0;
function ok(label, condition, extra = '') {
	if (condition) {
		pass += 1;
		return;
	}
	fail += 1;
	console.log('FAIL:', label, extra);
}

/** Minimal React stand-in: the bundle only calls createElement and the hooks. */
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
	useEffect: () => {},
	useCallback: (fn) => fn,
	useMemo: (fn) => fn(),
	useRef: (value) => ({ current: value })
};

/**
 * The shell's UI primitives, as the loader hands them over: the bundle must
 * build its composer control from these rather than from a hand-rolled widget.
 */
const primitivesStub = {
	Menu: 'Menu',
	IconChevronDownOutline14: 'IconChevronDownOutline14',
	Tooltip: 'Tooltip',
	RiskConfirmation: 'RiskConfirmation'
};

/** A fake client context recording every registration. */
function fakeContext() {
	const registrations = [];
	const dictionaries = [];
	const effects = [];
	const injections = [];
	const languages = [];
	const ctx = {
		locale: {
			bind: () => (key) => key,
			addLanguage: (input) => {
				languages.push(input);
				return () => {};
			},
			register: (ns, dicts) => {
				dictionaries.push({ ns, dicts });
				return () => {};
			}
		},
		slots: {
			inject: (slot, callback) => {
				injections.push(slot);
				callback();
				return () => {};
			},
			register: (options, component) => {
				registrations.push({ options, component });
				return () => {};
			}
		},
		effect: (factory, label) => {
			effects.push(label);
			return factory();
		}
	};
	return { ctx, registrations, dictionaries, effects, injections, languages };
}

const bundlePath = new URL('../lib/client.js', import.meta.url);
const source = await readFile(bundlePath, 'utf8');

let captured;
globalThis.window = {
	__ModuleLoader__: {
		load: (definition) => {
			captured = definition;
		}
	}
};

// Evaluate the bundle the way the browser does: CommonJS require for the two
// platform seeds it uses, and nothing else.
const requireShim = (specifier) => {
	if (specifier === 'react') return reactStub;
	if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub;
	throw new Error(`unexpected require(${specifier})`);
};
const factory = new Function('require', 'window', 'module', 'exports', source);
const moduleShim = { exports: {} };
factory(requireShim, globalThis.window, moduleShim, moduleShim.exports);

ok('bundle registered itself', captured !== undefined);
ok('module id matches the package', captured?.id === 'dsh-goal-vector', captured?.id);

const host = fakeContext();
const exportsObject = captured.factory(requireShim);
ok('bundle exports apply', typeof exportsObject.apply === 'function');
ok('bundle exports inject', Array.isArray(exportsObject.inject));
ok('the bundle only needs slots and locale', JSON.stringify(exportsObject.inject) === JSON.stringify(['slots', 'locale']), JSON.stringify(exportsObject.inject));
ok('the bundle reuses the shell UI primitives', source.includes('@deepseek-ai/dsh-client-ui-primitives'), 'the composer control must be the shipped widget, not a lookalike');
ok('the composer control is built from the shipped Menu', source.includes('el(primitives.Menu') || source.includes('primitives.Menu,'));
ok('the composer control uses the shipped chevron', source.includes('primitives.IconChevronDownOutline14'));
ok('the composer control is no longer a native select', !source.includes('el("select"'));
ok('the composer trigger has a scoped stylesheet', source.includes('dsh-goal-vector/composer.css') && source.includes('dshgv_trigger'));
ok('the trigger style matches the shipped permission control', source.includes('border-radius:24px') && source.includes('height:28px'));
ok('the stylesheet is injected as a plugin style tag', source.includes('tag.dataset.pluginCss = STYLE_TAG') && source.includes('tag.dataset.plugin = "dsh-goal-vector"'));

exportsObject.apply(host.ctx);

// --- the management page ---
const sidebar = host.registrations.find((entry) => entry.options.name === 'sidebar.panellist');
const main = host.registrations.find((entry) => entry.options.name === 'main');
ok('the sidebar row is registered', sidebar !== undefined);
ok('the main panel is registered', main !== undefined);
ok('the sidebar id and the main key match', sidebar?.options.id === main?.options.key, `${String(sidebar?.options.id)} vs ${String(main?.options.key)}`);
ok('the panel key is goal-vector', main?.options.key === 'goal-vector', String(main?.options.key));
ok('the main panel declares the copy namespace', main?.options.locale === 'goalVector', String(main?.options.locale));
ok('the sidebar label is a thunk (follows the locale)', typeof sidebar?.options.label === 'function');
ok('the sidebar glyph is a component', typeof sidebar?.component === 'function');

// --- the composer selector ---
const composer = host.registrations.find((entry) => entry.options.name === 'conversation.input.left');
ok('the composer selector is registered', composer !== undefined);
ok('the composer selector rides the left tool row (next to Workspace Write)', composer?.options.name === 'conversation.input.left', String(composer?.options.name));
ok('the composer selector has its own id', composer?.options.id === 'goal-vector', String(composer?.options.id));
ok('the composer selector declares the copy namespace', composer?.options.locale === 'goalVector', String(composer?.options.locale));
ok('exactly three registrations', host.registrations.length === 3, String(host.registrations.length));
ok('every registration went through slots.inject', host.injections.length === 3, host.injections.join(', '));

// --- dictionaries ---
const dictionary = host.dictionaries.find((entry) => entry.ns === 'goalVector');
ok('dictionaries are registered under the namespace', dictionary !== undefined);
const enKeys = Object.keys(dictionary?.dicts.en ?? {});
const zhKeys = Object.keys(dictionary?.dicts.zh ?? {});
const ruKeys = Object.keys(dictionary?.dicts.ru ?? {});
ok('all three dictionaries have the same keys',
	enKeys.length === zhKeys.length && zhKeys.length === ruKeys.length
	&& enKeys.every((key) => zhKeys.includes(key) && ruKeys.includes(key)),
	`${enKeys.length} en / ${zhKeys.length} zh / ${ruKeys.length} ru`);
ok('every dictionary is non-empty', enKeys.length > 20, String(enKeys.length));
for (const key of ['panel.title', 'form.name', 'form.goals', 'column.actions', 'composer.label', 'composer.none']) {
	ok(`the "${key}" copy exists in all three languages`, enKeys.includes(key) && zhKeys.includes(key) && ruKeys.includes(key), key);
}

// --- Russian as a language pack ---
const pack = host.languages.find((entry) => entry.id === 'ru');
ok('Russian is registered as a language pack', pack !== undefined, JSON.stringify(host.languages));
ok('the Russian pack declares a label', pack?.label === 'Русский', String(pack?.label));
ok('the Russian pack falls back to English', pack?.fallback === 'en', String(pack?.fallback));
ok('the Russian copy is actually Russian', (dictionary?.dicts.ru?.['composer.none'] ?? '').includes('Без вектора'), String(dictionary?.dicts.ru?.['composer.none']));
ok('the Russian copy is not a copy of the English one', dictionary?.dicts.ru?.['panel.title'] !== dictionary?.dicts.en?.['panel.title'], String(dictionary?.dicts.ru?.['panel.title']));

// --- source-level facts a headless smoke cannot render ---
ok('the panel talks to the vectors route', source.includes('/api/goal-vector/vectors'));
ok('the selector talks to the selection route', source.includes('/api/goal-vector/selection'));
ok('the panel polls the host', source.includes('setInterval'));
ok('the panel keeps the host error message', source.includes('payload?.error'));
ok('one component serves add and edit', source.includes('function VectorForm(') && !source.includes('function AddForm('));
ok('the goal rows can be reordered', source.includes('const move = (index, delta)') && source.includes('"↑"') && source.includes('"↓"'));
ok('a deleted vector closes its editor', source.includes('editing === undefined) setEditingId(null)'));
ok('the editor drops blank trailing rows', source.includes('filter((goal) => goal !== "")'));
ok('the selector offers a "no vector" option', source.includes('t("composer.none")'));
ok('the selector sends the adopting chat id', source.includes('{ sessionId, vectorId: next === "" ? null : next }'));
ok('the selector does NOT read a session projection', !source.includes('useProjection'), 'the selection lives in the Host store, not in the session log');
ok('the page explains what a goals vector is', source.includes('function AboutVector(') && source.includes('el(AboutVector, { t })'));
ok('the explanation defines the term', source.includes('about.goal') && source.includes('about.lead'));
ok('the explanation stresses the reverse drop order', source.includes('about.order') && source.includes('about.summary'));
ok('the explanation keeps the measure-of-quality point', source.includes('about.measure'));
ok('the explanation states the goals hold under ideal control', source.includes('about.order') && /errorless|безошибочного/.test(source));
ok('the explanation notes a vector can change over time', source.includes('about.change') && source.includes('about.changeTerm'));
ok('the explanation notes that priority order makes different vectors', source.includes('about.priorities') && source.includes('about.prioritiesTerm'));
ok('the explanation covers defective vectors', source.includes('about.defects') && source.includes('about.defectsTerm'));
ok('the summary keeps the figurative wording', /inventory of what we want|перечень того, чего желаем/.test(source));
ok('the explanation is collapsible and open by default', source.includes('react.useState(true)') && source.includes('setOpen(!open)'));

console.log('client wiring OK');
console.log(`  module id : ${captured.id}`);
console.log(`  inject    : ${exportsObject.inject.join(', ')}`);
console.log(`  effects   : ${host.effects.join(' | ')}`);
console.log(`  registered: ${host.registrations.map((entry) => `${entry.options.name} → ${String(entry.options.id ?? entry.options.key)}`).join(' | ')}`);
console.log(`  copy keys : ${enKeys.length} en / ${zhKeys.length} zh / ${ruKeys.length} ru`);
console.log(`\nclient: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
