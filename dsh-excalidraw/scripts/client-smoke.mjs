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
	useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
	// Effects run immediately: the pairing assertion below depends on it.
	useEffect: (run) => { run(); },
	useRef: (value) => ({ current: value })
};

/** Fake client context recording every registration. */
function fakeContext() {
	const disposers = [];
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
			const disposer = factory();
			if (typeof disposer === 'function') disposers.push(disposer);
			return disposer;
		}
	};
	return { ctx, registrations, dictionaries, effects, tabTypes, disposers };
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
for (const service of ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']) {
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
// No guide entry: with two guide entries the sidebar seeds its compass page
// instead of opening on the files tab, which is the behaviour being fixed.
ok('the tab type contributes no guide entry', Array.isArray(tabType.guide) && tabType.guide.length === 0, JSON.stringify(tabType.guide));

// --- dictionaries ---
const dictionary = host.dictionaries.find((entry) => entry.ns === 'excalidraw');
ok('dictionaries registered under the namespace', dictionary !== undefined);
const enKeys = Object.keys(dictionary?.dicts.en ?? {});
const zhKeys = Object.keys(dictionary?.dicts.zh ?? {});
const ruKeys = Object.keys(dictionary?.dicts.ru ?? {});
ok('all three dictionaries carry the same keys', enKeys.length === zhKeys.length && enKeys.length === ruKeys.length && enKeys.every((key) => zhKeys.includes(key) && ruKeys.includes(key)), `${enKeys.length}/${zhKeys.length}/${ruKeys.length}`);
for (const required of ['tab.title', 'tab.noSession']) {
	ok(`copy has ${required}`, enKeys.includes(required));
}
ok('the chip reads as a board, not the library name', dictionary.dicts.ru['tab.title'] === 'Доска' && dictionary.dicts.en['tab.title'] === 'Board', JSON.stringify([dictionary.dicts.ru['tab.title'], dictionary.dicts.en['tab.title']]));

// --- the body renders an iframe for the right session ---
const t = (key) => key;
const noSession = body.component({ sessionId: undefined, t });
ok('without a session the body explains', Array.isArray(noSession.children) && noSession.children.includes('tab.noSession'), JSON.stringify(noSession).slice(0, 160));
const withSession = body.component({ sessionId: 'session-123', t });
ok('with a session the body renders a sized wrapper', withSession.type === 'div' && withSession.props.style?.minHeight === '360px');
const frame = withSession.children?.[0];
ok('the wrapper contains the iframe', frame?.type === 'iframe');
ok('the iframe points at the board app for this chat', typeof frame.props.src === 'string' && frame.props.src === '/api/excalidraw/board.html?session=session-123', frame.props.src);
ok('the iframe fills the wrapper', frame.props.style?.width === '100%' && frame.props.style?.height === '100%' && frame.props.style?.position === 'absolute');
ok('the title renders the copy', title.component({ t }).children.includes('tab.title'));

// --- the panel watcher that keeps files + board side by side ---------------
ok('the watcher is registered as an effect', host.effects.includes('excalidraw: tab pairing'), host.effects.join(' | '));
const opened = [];
const surfaces = { 'session-123': { layout: { expanded: true, tabs: { 'tab-1': { kind: 'files' } } } } };
host.ctx.sidebarRight = {
	binding: { sessionId: 'session-123', surfaces },
	openTab: (kind) => opened.push(kind)
};
// Run the poll once by hand: the effect registered a real interval.
await new Promise((resolve) => setTimeout(resolve, 500));
ok('an open panel pairs the board beside files', opened.join(',') === 'files,excalidraw,files', opened.join(','));
ok('files is focused last, so the strip opens on it', opened[opened.length - 1] === 'files', opened.join(','));

// A collapsed panel must not be opened behind the person's back.
opened.length = 0;
surfaces['session-123'].layout.expanded = false;
await new Promise((resolve) => setTimeout(resolve, 500));
ok('a collapsed panel is left alone', opened.length === 0, opened.join(','));

// Re-opening pairs again (the edge), and an already paired panel is untouched.
opened.length = 0;
surfaces['session-123'].layout.expanded = true;
surfaces['session-123'].layout.tabs = { 'tab-1': { kind: 'files' }, 'tab-2': { kind: 'excalidraw' } };
await new Promise((resolve) => setTimeout(resolve, 500));
ok('a paired panel is not touched again', opened.length === 0, opened.join(','));

console.log(`client: pass=${pass} fail=${fail}`);
// The plugin arms a polling interval; dispose the effects so the process ends.
for (const dispose of host.disposers) {
	try {
		dispose();
	} catch {
		/* nothing to release */
	}
}
process.exit(fail > 0 ? 1 : 0);
