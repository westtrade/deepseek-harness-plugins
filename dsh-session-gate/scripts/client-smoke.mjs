/**
 * Client-bundle checks for `dsh-session-gate`.
 *
 * Evaluates lib/client.js the way the browser does — a CommonJS factory
 * registered on `window.__ModuleLoader__`, requiring only `react` and the
 * shell's UI primitives — and asserts the registrations the composer control
 * and its dialog need.
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
	Fragment: 'Fragment',
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
	useEffect: () => {},
	useCallback: (fn) => fn,
	useMemo: (fn) => fn(),
	useRef: (value) => ({ current: value })
};

/**
 * The shell's UI primitives, as the loader hands them over: the dialog must be
 * the shipped Modal with the shipped Switch and Button, not a lookalike.
 */
const primitivesStub = {
	Modal: 'Modal',
	Button: 'Button',
	Switch: 'Switch',
	IconChecklistOutline14: 'IconChecklistOutline14',
	Tooltip: 'Tooltip'
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
ok('module id matches the package', captured?.id === 'dsh-session-gate', captured?.id);

const host = fakeContext();
const exportsObject = captured.factory(requireShim);
ok('bundle exports apply', typeof exportsObject.apply === 'function');
ok('bundle exports inject', Array.isArray(exportsObject.inject));
ok('the bundle only needs slots and locale', JSON.stringify(exportsObject.inject) === JSON.stringify(['slots', 'locale']), JSON.stringify(exportsObject.inject));

exportsObject.apply(host.ctx);

// --- the composer control --------------------------------------------------
ok('the control rides the composer tool row', host.injections.includes('conversation.input.left'), JSON.stringify(host.injections));
const control = host.registrations.find((entry) => entry.options.name === 'conversation.input.left');
ok('the control is registered in conversation.input.left', control !== undefined);
ok('the control sorts just after the workspace-write group', control?.options.order === 10, String(control?.options.order));
ok('the control is a component', typeof control?.component === 'function');
ok('the control is localized through its own namespace', control?.options.locale === 'sessionGate', control?.options.locale);
ok('the control state comes from the host route', source.includes('/api/session-gate/state'));
ok('the dialog saves an inclusion list and the switched-off groups',
	source.includes('{ sessionId, mcpOn, groupsOff, photos }') && !source.includes('mcpOff'));
ok('the dialog prices schemas', source.includes('cost.withPercent') && source.includes('compactTokens'));
ok('no lookalike dialog is hand-rolled', source.includes('el(primitives.Modal') && !source.includes('createPortal'));
ok('the dialog uses the shipped switch', source.includes('el(primitives.Switch'));
ok('the dialog uses the shipped button', source.includes('el(primitives.Button'));
ok('the MCP servers are real checkboxes', source.includes('type: "checkbox"'));
ok('the trigger carries a checklist glyph', source.includes('primitives.IconChecklistOutline14'));

// --- the stylesheet --------------------------------------------------------
ok('the trigger has a scoped stylesheet', source.includes('dsh-session-gate/composer.css') && source.includes('dshsg_trigger'));
ok('the trigger style matches the shipped permission control', source.includes('border-radius:24px') && source.includes('height:28px'));
ok('the stylesheet is injected as a plugin style tag', source.includes('tag.dataset.pluginCss = STYLE_TAG') && source.includes('tag.dataset.plugin = "dsh-session-gate"'));

// --- copy ------------------------------------------------------------------
ok('three dictionaries are registered', host.dictionaries.length === 1
	&& ['en', 'ru', 'zh'].every((locale) => host.dictionaries[0].dicts[locale] !== undefined),
	JSON.stringify(Object.keys(host.dictionaries[0]?.dicts ?? {})));
ok('the namespace matches the injected locale', host.dictionaries[0]?.ns === 'sessionGate', host.dictionaries[0]?.ns);
const keys = Object.keys(host.dictionaries[0].dicts.en).sort();
ok('there are dialog copy keys', keys.includes('modal.title') && keys.includes('mcp.title') && keys.includes('photos.title'), keys.join(','));
ok('Russian covers every English key', keys.every((key) => host.dictionaries[0].dicts.ru[key] !== undefined));
ok('Chinese covers every English key', keys.every((key) => host.dictionaries[0].dicts.zh[key] !== undefined));
ok('Russian is added as a language pack', host.languages.some((language) => language.id === 'ru' && language.fallback === 'en'), JSON.stringify(host.languages));

console.log(`\n${String(pass)} passed, ${String(fail)} failed`);
if (fail > 0) process.exitCode = 1;
