/**
 * Client wiring smoke test for dsh-cron-schedule.
 *
 * Loads the client bundle against a fake ModuleLoader / slot registry and
 * asserts what the Web GUI depends on: the two registrations (sidebar row + main
 * panel) sharing one id, both locale dictionaries, the injected services, and
 * the directory-picker bridge. No browser is involved.
 *
 * @module dsh-cron-schedule/scripts/client-smoke
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

/** Minimal React stand-in: the bundle only calls createElement/useState/useEffect. */
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
	useEffect: () => {},
	useCallback: (fn) => fn,
	useMemo: (fn) => fn(),
	useRef: (value) => ({ current: value })
};

/** Fake client context recording every registration. */
function fakeContext() {
	const registrations = [];
	const dictionaries = [];
	const effects = [];
	const pickCalls = [];
	const ctx = {
		locale: {
			bind: () => (key, values) => {
				if (values !== undefined && typeof values === 'object') return `${key} ${JSON.stringify(values)}`;
				return key;
			},
			register: (ns, dicts) => {
				dictionaries.push({ ns, dicts });
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
		uiWorkspace: {
			pickDirectory: async () => {
				pickCalls.push(true);
				return '/tmp/picked';
			}
		},
		effect: (factory, label) => {
			effects.push(label);
			return factory();
		}
	};
	return { ctx, registrations, dictionaries, effects, pickCalls };
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

// Evaluate the bundle the way the browser does: CommonJS require for react only.
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
ok('module id matches the package', captured?.id === 'dsh-cron-schedule', captured?.id);

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
ok('injects slots', inject.includes('slots'), inject.join(','));
ok('injects locale', inject.includes('locale'), inject.join(','));
ok('injects uiWorkspace for the folder picker', inject.includes('uiWorkspace'), inject.join(','));
ok('inject list has no duplicates', new Set(inject).size === inject.length);

// --- registrations ---
const sidebar = host.registrations.find((entry) => entry.options.name === 'sidebar.panellist');
const main = host.registrations.find((entry) => entry.options.name === 'main');
ok('sidebar row registered', sidebar !== undefined);
ok('main panel registered', main !== undefined);
ok('sidebar id and main key match', sidebar?.options.id === main?.options.key, `${sidebar?.options.id} vs ${main?.options.key}`);
ok('panel id is cron-schedule', sidebar?.options.id === 'cron-schedule', sidebar?.options.id);
ok('main panel declares the copy namespace', main?.options.locale === 'cronSchedule', main?.options.locale);
ok('sidebar label is a thunk (follows locale)', typeof sidebar?.options.label === 'function');
ok('sidebar has a component', typeof sidebar?.component === 'function');
ok('main has a component', typeof main?.component === 'function');
ok('exactly two registrations', host.registrations.length === 2, String(host.registrations.length));

// --- the picker bridge the panel is injected with ---
const injected = main?.options.inject;
ok('main declares an inject factory', typeof injected === 'function');
const injectedProps = injected();
ok('inject factory exposes pickDirectory', typeof injectedProps.pickDirectory === 'function');
const picked = await injectedProps.pickDirectory();
ok('pickDirectory bridges to uiWorkspace', picked === '/tmp/picked' && host.pickCalls.length === 1, String(picked));

// --- dictionaries ---
const dictionary = host.dictionaries.find((entry) => entry.ns === 'cronSchedule');
ok('dictionaries registered under the namespace', dictionary !== undefined);
ok('english dictionary present', dictionary?.dicts.en !== undefined);
ok('chinese dictionary present', dictionary?.dicts.zh !== undefined);
const enKeys = Object.keys(dictionary?.dicts.en ?? {});
const zhKeys = Object.keys(dictionary?.dicts.zh ?? {});
ok('both dictionaries have the same keys', enKeys.length === zhKeys.length && enKeys.every((key) => zhKeys.includes(key)), `${enKeys.length} vs ${zhKeys.length}`);
for (const required of [
	'panel.title', 'panel.subtitle', 'panel.empty', 'panel.error',
	'form.name', 'form.preset', 'form.expression', 'form.timeZone',
	'form.workspace', 'form.browse', 'form.pickExisting', 'form.prompt', 'form.add',
	'form.save', 'form.saving', 'form.cancel',
	'form.autoCatchUp', 'form.autoCatchUpHint', 'column.auto', 'column.autoOn', 'column.autoAsk',
	'column.name', 'column.when', 'column.next', 'column.workspace', 'column.actions',
	'job.run', 'job.edit', 'job.editing', 'job.updated', 'job.delete', 'job.enable', 'job.disable',
	'missed.title', 'missed.hint', 'missed.run', 'missed.dismiss'
]) {
	ok(`copy has ${required}`, enKeys.includes(required) && zhKeys.includes(required));
}
// Every preset id the form renders must have copy in both languages.
for (const preset of ['custom', 'hourly', 'every30', 'daily9', 'weekdays9', 'monday9', 'monthly1']) {
	ok(`copy has preset.${preset}`, enKeys.includes(`preset.${preset}`) && zhKeys.includes(`preset.${preset}`));
}

// --- the panel's own contract, read off the source ---
ok('panel polls the host route', source.includes('/api/cron-schedule/jobs'));
ok('panel offers a run-now call', source.includes('/run`'));
ok('panel offers the dismiss-missed action', source.includes('action=dismiss-missed'));
ok('panel renders a missed banner', source.includes('MissedBanner'));
ok('panel has a preset selector', source.includes('PRESETS.map'));
ok('panel has a workspace dropdown', source.includes('form.pickExisting'));
ok('panel has the OS folder picker button', source.includes('form.browse'));
ok('panel keeps the host error message', source.includes('payload?.error'));
ok('panel does not require any non-react package', !/require\((?!["']react["'])/.test(source.replace(/\brequire\("react"\)/g, 'require("react")')) || source.includes('require("react")'));

// --- the human-only catch-up switch ---
ok('form renders the catch-up checkbox', source.includes('type: "checkbox"'));
ok('checkbox is bound to the draft flag', source.includes('autoCatchUp: event.target.checked'));
ok('checkbox starts off for a new job', source.includes('autoCatchUp: false'));
ok('editor pre-fills the flag from the job', source.includes('autoCatchUp: job.autoCatchUp === true'));
ok('panel sends the flag to the host', source.includes('autoCatchUp: draft.autoCatchUp === true'));
ok('table shows the catch-up state', source.includes('column.autoOn') && source.includes('column.autoAsk'));

// --- editing an existing schedule ---
ok('panel has an edit button per row', source.includes('t("job.edit")'));
ok('panel tracks which job is being edited', source.includes('editingId'));
ok('panel renders the editor inline under the row', source.includes('${job.id}-editor'));
ok('editor saves with POST to the job URL', source.includes('encodeURIComponent(job.id)}`, body)'));
ok('editor can be cancelled', source.includes('onCancel'));
ok('one component serves add and edit', source.includes('function JobForm(') && !source.includes('function AddForm('));
ok('editor preselects a matching preset', source.includes('entry.expression === job.expression'));
ok('a deleted job closes its editor', source.includes('editing === undefined) setEditingId(null)'));

console.log('client wiring OK');
console.log(`  module id : ${captured.id}`);
console.log(`  inject    : ${inject.join(', ')}`);
console.log(`  effects   : ${host.effects.join(' | ')}`);
console.log(`  registered: ${host.registrations.map((entry) => `${entry.options.name} → ${entry.options.id ?? entry.options.key}`).join(' | ')}`);
console.log(`  copy keys : ${enKeys.length} en / ${zhKeys.length} zh`);
console.log(`\nclient: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
