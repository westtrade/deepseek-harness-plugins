/**
 * Wiring smoke test for the client bundle: loads `lib/client.js` in a stubbed
 * module-loader environment (fake `react`, fake slot/locale services) and
 * asserts the two registrations the GUI expects — the panel icon (carrying the
 * total) and the `main` keyed body — plus the `inject` list.
 *
 *   node scripts/client-smoke.mjs
 *
 * @module dsh-project-cost/scripts/client-smoke
 */

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// --- stub platform modules -------------------------------------------------
const calls = [];
const fakeReact = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
	useEffect: () => {},
	useRef: (initial) => ({ current: initial }),
	useCallback: (fn) => fn,
	useMemo: (fn) => fn()
};

function fakeRequire(spec) {
	if (spec === 'react') return fakeReact;
	throw new Error(`unexpected require("${spec}") — client bundles may only use baseline modules`);
}

// --- stub loader facade ----------------------------------------------------
let loaded;
const sandbox = {
	window: {
		__ModuleLoader__: {
			load(entry) {
				loaded = entry;
			}
		}
	},
	// The bundle references document only in other packages' CSS blocks; ours
	// never touches it, but keep a guard surface anyway.
	document: undefined
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), sandbox);

if (loaded === undefined) throw new Error('client bundle never called __ModuleLoader__.load');
if (loaded.id !== 'dsh-project-cost') throw new Error(`wrong module id: ${loaded.id}`);

const mod = loaded.factory(fakeRequire);
if (typeof mod.apply !== 'function') throw new Error('bundle exports no apply');
if (!Array.isArray(mod.inject)) throw new Error('bundle exports no inject');

// --- stub client context ---------------------------------------------------
const effects = [];
const registrations = [];
const dictionaries = [];
const ctx = {
	effect(fn, label) {
		effects.push(label);
		fn();
		return () => {};
	},
	locale: {
		bind(ns) {
			return (key, params) => (params === undefined ? key : `${key}:${JSON.stringify(params)}`);
		},
		register(ns, dicts) {
			dictionaries.push({ ns, locales: Object.keys(dicts) });
			return () => {};
		}
	},
	slots: {
		inject(slot, factory) {
			const registration = factory();
			registrations.push({ slot, ...registration.options });
			return () => {};
		},
		register(options, component) {
			return { options, component };
		}
	},
	layout: {
		selectPanel(id) {
			calls.push(`selectPanel:${id}`);
		}
	}
};

mod.apply(ctx);

// --- assertions ------------------------------------------------------------
const expected = [
	['sidebar.panellist', 'project-cost'],
	['main', 'project-cost']
];
if (registrations.some((entry) => entry.slot === 'sidebar.footer.action')) {
	throw new Error('the sidebar footer link must stay removed — its total moved into the panel icon row');
}
for (const [slot, id] of expected) {
	const hit = registrations.find((entry) => entry.slot === slot && (entry.id === id || entry.key === id));
	if (hit === undefined) throw new Error(`missing registration for ${slot} → ${id}`);
}
const main = registrations.find((entry) => entry.slot === 'main');
if (main.key !== 'project-cost') throw new Error('main panel key must be project-cost');
const panel = registrations.find((entry) => entry.slot === 'sidebar.panellist');
if (typeof panel.label !== 'function' && typeof panel.label !== 'string') throw new Error('panel label must be a string or thunk');
const dicts = dictionaries.find((entry) => entry.ns === 'projectCost');
if (dicts === undefined || !dicts.locales.includes('en') || !dicts.locales.includes('zh')) {
	throw new Error('locale dictionaries must register en and zh under projectCost');
}
if (!mod.inject.includes('slots') || !mod.inject.includes('locale')) {
	throw new Error(`inject list incomplete: ${mod.inject.join(', ')}`);
}
if (!effects.includes('project-cost: tree badges') || !effects.includes('project-cost: chat badges')) {
	throw new Error(`badge decorators must start: got [${effects.join(', ')}]`);
}

console.log('client wiring OK');
console.log('  module id :', loaded.id);
console.log('  inject    :', mod.inject.join(', '));
console.log('  effects   :', effects.join(' | '));
for (const entry of registrations) console.log('  registered:', entry.slot, '→', entry.key ?? entry.id);
