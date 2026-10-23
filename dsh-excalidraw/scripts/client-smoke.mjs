/**
 * Client wiring smoke test for dsh-excalidraw.
 *
 * Loads the client bundle against a fake ModuleLoader / slot registry and
 * asserts what the Web GUI depends on: the sidebar-right tab type, its body
 * and title registrations, the injected services, and that the body actually
 * renders an iframe pointed at the board app for the right session. No browser
 * is involved.
 *
 * @module dsh-excalidraw/scripts/client-smoke
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(here, '..', 'lib', 'client.js');

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

/** Minimal React stand-in: the bundle only calls createElement/useState. */
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}]
};

/** Fake client context recording every registration. */
function fakeContext() {
	const registrations = [];
	const dictionaries = [];
	const effects = [];
	const tabTypes = [];
	const ctx = {
		locale: {
			bind: () => (key) => key,
			register: (ns, dicts) => {
				dictionaries.push({ ns, dicts });
				return () => {};
			}
		},
		sidebarRightTabs: {
			register: (definition) => {
				tabTypes.push(definition);
				return () => {};
			}
		},
		slots: {
			inject: (slot, callback) => {
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
	return { ctx, registrations, dictionaries, effects, tabTypes };
}

const source = await readFile(bundlePath, 'utf8');
let captured;
globalThis.window = {
	__ModuleLoader__: {
		load: (definition) => {
			captured = definition;
		}
	}
};

const factory = new Function('require', 'window', 'module', 'exports', source);
const moduleShim = { exports: {} };
factory(
	(specifier) => {
		if (specifier === 'react') return reactStub;
		throw new Error(`unexpected require(${specifier})`);
	},
	globalThis.window,
	moduleShim,
	moduleShim.exports
);

ok('bundle registered itself', captured !== undefined);
ok('module id matches the package', captured?.id === 'dsh-excalidraw', captured?.id);

const host = fakeContext();
const exportsObject = captured.factory((specifier) => {
	if (specifier === 'react') return reactStub;
	throw new Error(`unexpected require(${specifier})`);
});
ok('bundle exports apply', typeof exportsObject.apply === 'function');
ok('bundle exports inject', Array.isArray(exportsObject.inject));

exportsObject.apply(host.ctx);

// --- inject list ---
const inject = exportsObject.inject;
for (const service of ['slots', 'locale', 'sidebarRightTabs']) {
	ok(`injects ${service}`, inject.includes(service), inject.join(','));
}
ok('inject list has no duplicates', new Set(inject).size === inject.length);

// --- registrations ---
const body = host.registrations.find((entry) => entry.options.name === 'sidebar.right.pane.tab' && entry.options.key === 'excalidraw');
const title = host.registrations.find((entry) => entry.options.name === 'sidebar.right.pane.tab.title' && entry.options.key === 'excalidraw');
ok('the tab body is registered under the files seat', body !== undefined);
ok('the tab title is registered', title !== undefined);
ok('only the two registrations exist', host.registrations.length === 2, String(host.registrations.length));
ok('body and title share the copy namespace', body?.options.locale === 'excalidraw' && title?.options.locale === 'excalidraw');

const tabType = host.tabTypes.find((entry) => entry.id === 'excalidraw');
ok('the tab type is registered', tabType !== undefined);
ok('the tab type is an extension', tabType.priority === 'extension');
ok('the tab type has a title thunk', typeof tabType.title === 'function');
ok('the tab type offers a guide entry', Array.isArray(tabType.guide) && tabType.guide.length === 1);
ok('the guide entry has a glyph', typeof tabType.guide[0].icon === 'function');

// --- dictionaries ---
const dictionary = host.dictionaries.find((entry) => entry.ns === 'excalidraw');
ok('dictionaries registered under the namespace', dictionary !== undefined);
const enKeys = Object.keys(dictionary?.dicts.en ?? {});
const zhKeys = Object.keys(dictionary?.dicts.zh ?? {});
const ruKeys = Object.keys(dictionary?.dicts.ru ?? {});
ok('all three dictionaries carry the same keys', enKeys.length === zhKeys.length && enKeys.length === ruKeys.length && enKeys.every((key) => zhKeys.includes(key) && ruKeys.includes(key)), `${enKeys.length}/${zhKeys.length}/${ruKeys.length}`);
for (const required of ['tab.title', 'tab.guide', 'tab.guideDescription', 'tab.loading', 'tab.noSession']) {
	ok(`copy has ${required}`, enKeys.includes(required));
}

// --- the body renders an iframe for the right session ---
const t = (key) => key;
const noSession = body.component({ sessionId: undefined, t });
ok('without a session the body explains', noSession.children.includes('tab.noSession'));
const withSession = body.component({ sessionId: 'session-123', t });
const frame = withSession.type === 'iframe' ? withSession : undefined;
ok('with a session the body renders an iframe', frame !== undefined);
ok('the iframe points at the board app for this chat', typeof frame.props.src === 'string' && frame.props.src === '/api/excalidraw/board.html?session=session-123', frame.props.src);
ok('the iframe fills the tab', frame.props.style?.width === '100%' && frame.props.style?.height === '100%');
ok('the title renders the copy', title.component({ t }).children.includes('tab.title'));

console.log(`client: pass=${pass} fail=${fail}`);
if (fail > 0) process.exit(1);
