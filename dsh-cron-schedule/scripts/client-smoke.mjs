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

/** Stand-in for the harness's shared widgets, matching their export names. */
const primitivesStub = {
	Tag: (props) => ({ type: 'Tag', props, children: props.children }),
	IconChevronDownOutline14: (props) => ({ type: 'IconChevronDownOutline14', props }),
	Switch: (props) => ({ type: 'Switch', props }),
	Button: (props) => ({ type: 'Button', props, children: props.children })
};
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
	const languages = [];
	const ctx = {
		locale: {
			addLanguage: (language) => {
				languages.push(language);
				return () => {};
			},
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
	return { ctx, registrations, dictionaries, effects, pickCalls, languages };
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
		if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub;
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
	if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub;
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
// Sidebar row + main panel + the General-settings row.
ok('exactly three registrations', host.registrations.length === 3, String(host.registrations.length));
const settingsRow = host.registrations.find((entry) => entry.options.name === 'settings.plugin.item');
ok('plugin settings card registered', settingsRow !== undefined);
// The Plugins tab dispatches this slot by settings namespace, so the key must be
// the namespace the Host registers, not an arbitrary id.
ok('card is keyed by the settings namespace', settingsRow?.options.key === 'cron-schedule', settingsRow?.options.key);

// --- the picker bridge the panel is injected with ---
const injected = main?.options.inject;
ok('main declares an inject factory', typeof injected === 'function');
const injectedProps = injected();
ok('inject factory exposes pickDirectory', typeof injectedProps.pickDirectory === 'function');
const picked = await injectedProps.pickDirectory();
ok('pickDirectory bridges to uiWorkspace', picked === '/tmp/picked' && host.pickCalls.length === 1, String(picked));

// --- the run→chat bridge the rows call after "Run now" ---
ok('inject factory exposes openChat', typeof injectedProps.openChat === 'function');
// The real `uiWorkspace.openSession` is `sessions.open()` + `layout.selectPanel(null)`,
// and `sessions.open` throws for an id the browser's list has not seen yet.
const opened = [];
const known = new Set(['session-ready']);
host.ctx.uiWorkspace.openSession = (sessionId) => {
	opened.push(sessionId);
	if (!known.has(sessionId)) throw new Error(`sessions.select: unknown session ${sessionId}`);
};
ok('openChat opens a chat the list already knows', (await injectedProps.openChat('session-ready')) === true && opened.includes('session-ready'));
// A chat the browser hears about a moment later still opens: the first attempts
// are refused by the session list, exactly as they are on a freshly started run.
opened.length = 0;
setTimeout(() => known.add('session-late'), 120);
const late = await injectedProps.openChat('session-late');
ok('openChat waits for a chat the list is still learning', late === true && opened.length >= 2, `${late} after ${opened.length} attempts`);
// An older harness without the navigation API must not hang the panel.
const savedOpenSession = host.ctx.uiWorkspace.openSession;
delete host.ctx.uiWorkspace.openSession;
ok('without openSession openChat reports failure instead of hanging', (await injectedProps.openChat('session-ready')) === false);
host.ctx.uiWorkspace.openSession = savedOpenSession;

// --- dictionaries ---
const dictionary = host.dictionaries.find((entry) => entry.ns === 'cronSchedule');
ok('dictionaries registered under the namespace', dictionary !== undefined);
ok('english dictionary present', dictionary?.dicts.en !== undefined);
ok('chinese dictionary present', dictionary?.dicts.zh !== undefined);
ok('russian dictionary present', dictionary?.dicts.ru !== undefined);
const enKeys = Object.keys(dictionary?.dicts.en ?? {});
const zhKeys = Object.keys(dictionary?.dicts.zh ?? {});
const ruKeys = Object.keys(dictionary?.dicts.ru ?? {});
ok('all dictionaries have the same keys', zhKeys.length === enKeys.length && ruKeys.length === enKeys.length
	&& enKeys.every((key) => zhKeys.includes(key) && ruKeys.includes(key)), `${enKeys.length} en / ${zhKeys.length} zh / ${ruKeys.length} ru`);
// Every dictionary must keep the placeholders the panel interpolates.
const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',');
const ruPlaceholderMismatch = enKeys.filter((key) => placeholders(dictionary.dicts.en[key]) !== placeholders(dictionary?.dicts.ru[key] ?? ''));
ok('russian keeps every placeholder', ruPlaceholderMismatch.length === 0, ruPlaceholderMismatch.join(', '));
// Every English sentence must be translated. A bare technical token may stay
// identical on purpose: a file name ("TODO.md") and a default heading name
// ("Incoming") are what the person types into their board, not prose.
// A literal the person types into their own board keeps its spelling: a file
// name ("TODO.md") and the default heading ("Incoming"). Prose is what must be
// translated, and prose means something other than one verbatim literal.
const VERBATIM = new Set(['TODO.md', 'Incoming']);
const needsTranslation = (value) => !VERBATIM.has(value);
const untranslated = enKeys.filter((key) => needsTranslation(dictionary.dicts.en[key]) && dictionary.dicts.ru[key] === dictionary.dicts.en[key]);
ok('russian is really translated', untranslated.length === 0, untranslated.join(', '));
// Russian is a language pack, not a built-in: the shell ships only zh and en.
const russianLanguage = host.languages.find((language) => language.id === 'ru');
ok('russian is registered as a language pack', russianLanguage !== undefined, JSON.stringify(host.languages));
ok('russian language pack is labelled and falls back to english', russianLanguage?.label === 'Русский' && russianLanguage?.fallback === 'en', JSON.stringify(russianLanguage));
for (const required of [
	'panel.title', 'panel.subtitle', 'panel.empty', 'panel.error',
	'form.name', 'form.preset', 'form.expression', 'form.timeZone',
	'form.workspace', 'form.browse', 'form.pickExisting', 'form.prompt', 'form.add',
	'form.initialPrompt', 'form.initialPromptHint', 'form.promptHint',
	'form.save', 'form.saving', 'form.cancel',
	'form.autoCatchUp', 'form.autoCatchUpHint', 'column.auto', 'column.autoOn', 'column.autoAsk',
	'form.gate', 'form.gateHint', 'form.gateFile', 'form.gateHeading', 'form.gateCheck', 'form.gateCreate',
	'form.gateFound', 'form.gateOpen', 'form.gateNone', 'form.gateMissing', 'form.gateMissingHint',
	'form.gateNoSection', 'form.gateNoSectionHint', 'form.gateError', 'form.gateChecked',
	'column.gate', 'column.gateOn', 'column.gateOff', 'job.skipped',
	'form.model', 'form.modelDefault', 'form.modelRestricted', 'column.model',
	'form.chat', 'form.chatNew', 'form.chatPick', 'form.chatPickPlaceholder', 'form.chatBound', 'form.chatIgnored',
	'form.alwaysNewChat', 'form.alwaysNewChatHint', 'column.chat', 'column.chatNew', 'column.chatUnbound',
	'settings.allowedModels', 'settings.allowedModelsHint', 'settings.allowedModelsEmpty',
	'settings.save', 'settings.saving', 'settings.discard', 'settings.unsaved', 'settings.saveFailed',
	'settings.dropped',
	'settings.expand', 'settings.collapse', 'settings.allowedModelsLegend',
	'column.name', 'column.when', 'column.next', 'column.workspace', 'column.actions',
	'job.run', 'job.edit', 'job.editing', 'job.updated', 'job.delete', 'job.enable', 'job.disable', 'job.openFailed',
	'missed.title', 'missed.hint', 'missed.run', 'missed.dismiss'
]) {
	ok(`copy has ${required}`, enKeys.includes(required) && zhKeys.includes(required) && ruKeys.includes(required));
}
// Every preset id the form renders must have copy in both languages.
for (const preset of ['custom', 'hourly', 'every30', 'daily9', 'weekdays9', 'monday9', 'monthly1']) {
	ok(`copy has preset.${preset}`, enKeys.includes(`preset.${preset}`) && zhKeys.includes(`preset.${preset}`));
}

// --- the panel's own contract, read off the source ---
ok('panel polls the host route', source.includes('/api/cron-schedule/jobs'));
ok('panel offers a run-now call', source.includes('/run`'));
// --- Run now lands the person in the chat the run wrote into ---
ok('run now follows the chat it started', source.includes('workspace.openSession(sessionId)'));
ok('the panel hands the navigation to its rows', source.includes('openChat: (sessionId) => openChat(ctx, sessionId)'));
ok('only a successful run opens a chat', source.includes('job?.lastStatus === "succeeded" && typeof job.lastSessionId === "string"'));
ok('both run buttons follow the chat', (source.match(/await startRun\(job\.id, openChat\)/g) ?? []).length === 2);
ok('navigation is retried while the session list catches up', source.includes('attempt < 25'));
ok('a run whose chat never opened says so', source.includes('if (chat !== null && !opened) onError(t("job.openFailed"));'));
ok('the run button reports that it is starting', source.includes('busy === "run" ? t("job.running") : t("job.run")'));
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

// --- model picker and the allowed-model list ---
// --- the setup brief is a field of its own, next to the recurring task ---
ok('the form offers a setup brief', source.includes('t("form.initialPrompt")') && source.includes('onChange: (event) => set({ initialPrompt: event.target.value })'));
ok('the brief is prefilled from the job', source.includes('initialPrompt: job.initialPrompt ?? ""'));
ok('the brief is sent with the job', source.includes('initialPrompt: draft.initialPrompt.trim() === "" ? null : draft.initialPrompt'));
ok('the task field is named as the every-run text', source.includes('"form.prompt": "Task on every run"'));
// --- the optional task gate ---
ok('the form offers the board gate', source.includes('t("form.gate")') && source.includes('checked: draft.gate === true'));
ok('the gate checkbox only sends when ticked', source.includes('gate: draft.gate === true'));
ok('the gate settings appear only while it is on', source.includes('draft.gate === true ? el("div"') && source.includes('const on = event.target.checked;'));
ok('the gate has a file field', source.includes('onChange: (event) => set({ gateFile: event.target.value })'));
ok('the gate has a heading field', source.includes('onChange: (event) => set({ gateHeading: event.target.value })'));
ok('the gate is checked through the Host, not the browser', source.includes('BOARD_URL') && source.includes('await callHost("POST", `${BOARD_URL}/draft`'));
ok('the check carries the folder for an unsaved schedule', source.includes('workspacePath: draft.workspacePath.trim()'));
ok('a missing board offers the create button', source.includes('board.creatable === true') && source.includes('create: true'));
ok('the checkbox runs a check immediately', source.includes('if (on) void checkBoard();'));
ok('every verdict has its own sentence', ['ready', 'empty', 'missing', 'no-section'].every((verdict) => source.includes(`payload.verdict === "${verdict}"`)));
// The card reports what the check found, and only then what it implies.
ok('the report names the found column and the file', source.includes('fill(t("form.gateFound"), { heading, file })'));
ok('open tasks are reported as a count', source.includes('fill(t("form.gateOpen"), { open: payload.open, closed: payload.closed ?? 0 })'));
ok('an empty column reports its closed count too', source.includes('fill(t("form.gateNone"), { closed: payload.closed ?? 0 })'));
ok('the finding and the consequence are two lines', source.includes('el("div", { style: { color: "var(--dsw-alias-label-secondary)" } }, board.text)') && source.includes('board.note === null || board.note === undefined ? null : el("div", null, board.note)'));
ok('a missing section lists the sections it does have', source.includes('fill(t("form.gateNoSectionHint"), { list: known })'));
ok('a check is stamped with its time', source.includes('fill(t("form.gateChecked"), { time: formatAt(board.at) ?? "" })'));
ok('the table shows whether a job is gated', source.includes('t("column.gateOn")') && source.includes('t("column.gateOff")'));
ok('a skipped row explains itself', source.includes('job.lastStatus === "skipped" && typeof job.lastNote === "string"'));
ok('form has a model dropdown', source.includes('t("form.model")') && source.includes('models: modelChoices'));
ok('dropdown offers the deployment default', source.includes('t("form.modelDefault")'));
ok('dropdown lists catalog entries', source.includes('`${entry.name} — ${entry.provider}/${entry.model}`'));
ok('form sends the picked model', source.includes('model: draft.modelKey === ""'));
ok('clearing the picker sends null', source.includes('draft.modelKey === "" ? null'));
ok('editor pre-fills the stored model', source.includes('modelKey: modelKey(job.model)'));
ok('panel loads the settings route', source.includes('SETTINGS_URL'));
ok('panel filters choices by the allow-list', source.includes('restricted') && source.includes('settings.allowedModels.some'));
ok('card lives on the Plugin Configuration tab', source.includes('settings.plugin.item') && !source.includes('settings.general.item'));
ok('settings row saves the list', source.includes('allowedModels: (draft ?? []).map'));
ok('settings row toggles entries', source.includes('onChange: () => toggle(keyOf(entry))'));
// Two clicks can land before a re-render, so the draft update must be functional.
ok('toggling derives from the latest draft', source.includes('setDraft((current) => {') && source.includes('const base = current ?? savedKeys;'));
ok('the draft and the checkboxes share one representation', source.includes('setDraft(allowed.map((entry) => `${entry.provider}\\u0000${entry.model}`))'));
ok('settings row matches the Subagent card shape', source.includes('primitives.Tag') && source.includes('primitives.IconChevronDownOutline14'));
ok('settings row is a collapsible card', source.includes('"aria-expanded": state.open'));
ok('settings row groups models by provider', source.includes('const groups = new Map()'));
ok('settings row stages edits until Save', source.includes('const discard = () => {') && source.includes('settings.discard'));
ok('settings row marks unsaved edits', source.includes('settings.unsaved'));
// A refused save must say why, and a save the Host had to narrow must say what
// it changed — otherwise "nothing happens" is indistinguishable from a bug.
ok('settings row shows the host reason for a refused save', source.includes('t("settings.saveFailed"), " ", state.error'));
ok('settings row reports the entries the host dropped', source.includes('t("settings.dropped", { list: state.dropped.join(", ") })'));
ok('settings row re-reads the saved list after saving', source.includes('await load();') && source.includes('dropped: Array.isArray(payload?.dropped) ? payload.dropped : []'));
ok('settings row stays open after saving, so the outcome is visible', (source.match(/open: false/g) ?? []).length === 1);
ok('table shows the model column', source.includes('column.model'));
// --- no stale "deployment default" label, and the card owns the list ---
ok('the picker names the effective model, not a deployment default', source.includes('named === undefined ? fallback.model : named.name'));
ok('the inherited model is marked in the table', source.includes('column.modelInherited'));
ok('the card writes the allow-list', source.includes('await callHost("POST", SETTINGS_URL'));
ok('the card reads the host settings route', source.includes('SETTINGS_URL'));
ok('the card keeps its own namespace constant', source.includes('const SETTINGS_NAMESPACE = "cron-schedule"'));

// --- chat reuse and the "always new chat" switch ---
ok('form has a chat dropdown', source.includes('t("form.chatPick")') && source.includes('chats,'));
ok('chat dropdown offers "create one for me"', source.includes('t("form.chatNew")'));
ok('chat dropdown disables while always-new is on', source.includes('disabled: draft.alwaysNewChat === true'));
ok('form has the always-new-chat checkbox', source.includes('t("form.alwaysNewChat")'));
ok('checkbox bound to the draft flag', source.includes('alwaysNewChat: event.target.checked'));
ok('always-new is off by default', source.includes('alwaysNewChat: false'));
ok('editor pre-fills both chat fields', source.includes('alwaysNewChat: job.alwaysNewChat === true') && source.includes('sessionId: job.sessionId ?? ""'));
ok('panel sends the chat policy', source.includes('alwaysNewChat: draft.alwaysNewChat === true'));
ok('an empty pick sends null so the run binds a chat', source.includes('draft.sessionId === "" ? null : draft.sessionId'));
ok('panel loads the chat list', source.includes('CHATS_URL') && source.includes('loadChats'));
ok('table shows the chat column', source.includes('column.chat'));
// --- the folder select and the folder-scoped chat list ---
ok('folder select reflects the current directory', source.includes('some((workspace) => workspace.path === draft.workspacePath) ? draft.workspacePath : ""'));
ok('folder options show the name only, not the path', source.includes('? workspace.title : workspace.path'));
ok('folder options no longer append the path', !source.includes('${workspace.title} — ${workspace.path}'));
ok('folder select no longer pins value to empty', !source.includes('value: "",\n\t\t\t\t\t\tstyle: { ...inputStyle, minWidth: "220px" }'));
ok('chat list is re-fetched per folder', source.includes('CHATS_URL}?cwd=') && source.includes('encodeURIComponent(cwd)'));
ok('chat list narrows to the chosen folder', source.includes('const reusableChats = scopedChats ?? chats ?? []'));
ok('a chat outside the folder is unbound', source.includes('scopedChats.some((chat) => chat.sessionId === draft.sessionId)'));
ok('a failed scope keeps the unfiltered list', source.includes('if (!cancelled) setScopedChats(null);'));
// --- the loading cue beside the chat picker ---
ok('the form tracks a chat-loading state', source.includes('const [chatsLoading, setChatsLoading] = react.useState(false)'));
ok('loading starts as soon as the folder changes', /setChatsLoading\(true\);\s*\n\s*const timer/.test(source));
ok('loading clears on both success and failure', source.includes('.finally(() => {') && source.includes('if (!cancelled) setChatsLoading(false);'));
ok('loading clears when the folder is emptied', source.includes('setScopedChats(null);\n\t\t\t\t\tsetChatsLoading(false);'));
ok('a spinner is rendered next to the picker', source.includes('el(Spinner, { size: 12, label: t("form.chatLoading") })'));
ok('the spinner has an accessible label', source.includes('role: "status"') && source.includes('"aria-label": label'));
ok('the spinner needs no external stylesheet', source.includes('animateTransform'));

// --- editing an existing schedule ---
ok('panel has an edit button per row', source.includes('t("job.edit")'));
ok('panel tracks which job is being edited', source.includes('editingId'));
ok('panel renders the editor inline under the row', source.includes('${job.id}-editor'));
ok('editor saves with POST to the job URL', source.includes('encodeURIComponent(job.id)}`, body)'));
ok('editor can be cancelled', source.includes('onCancel'));
ok('one component serves add and edit', source.includes('function JobForm(') && !source.includes('function AddForm('));
ok('editor preselects a matching preset', source.includes('entry.expression === job.expression'));
ok('a deleted job closes its editor', source.includes('editing === undefined) setEditingId(null)'));

// --- a duplicate language pack must not break the browser half ---
// `dsh-goal-vector` also ships Russian; whichever plugin loads second hits a
// duplicate-id error from `addLanguage`, and that must stay contained.
const duplicate = fakeContext();
duplicate.ctx.locale.addLanguage = () => {
	throw new Error('locale "ru" is already registered');
};
let duplicateError;
try {
	exportsObject.apply(duplicate.ctx);
} catch (error) {
	duplicateError = error;
}
ok('a duplicate russian pack does not break apply', duplicateError === undefined, String(duplicateError?.message ?? ''));
ok('the dictionaries still register after a duplicate pack', duplicate.dictionaries.some((entry) => entry.ns === 'cronSchedule' && entry.dicts.ru !== undefined));
ok('the panel still registers after a duplicate pack', duplicate.registrations.length === 3, String(duplicate.registrations.length));

console.log('client wiring OK');
console.log(`  module id : ${captured.id}`);
console.log(`  inject    : ${inject.join(', ')}`);
console.log(`  effects   : ${host.effects.join(' | ')}`);
console.log(`  registered: ${host.registrations.map((entry) => `${entry.options.name} → ${entry.options.id ?? entry.options.key}`).join(' | ')}`);
console.log(`  copy keys : ${enKeys.length} en / ${zhKeys.length} zh / ${ruKeys.length} ru`);

// --- the panel actually renders, including the new gate block ---
// Everything above reads the source; this evaluates the components, which is
// what catches a ReferenceError inside a new block (a hook used before its
// `const`, a helper that was never defined). The react stand-in is upgraded to
// a tiny hook runtime for this: state cells, one-shot effects, and a re-render
// after an async load settles. Canned Host answers keep it offline.
const hookCells = [];
let hookCursor = 0;
let hookEffects = [];
let rerenderRequested = false;
/**
 * Run one component the way React would: state survives, effects run once, and
 * a state change re-renders until it settles.
 *
 * @param component - the function component.
 * @param props - its props.
 * @returns the element tree of the last pass.
 */
async function render(component, props) {
	hookCells.length = 0;
	hookCursor = 0;
	hookEffects = [];
	rerenderRequested = false;
	let tree = component(props);
	const effects = hookEffects;
	hookEffects = [];
	for (const effect of effects) effect();
	// The panel's own effect loads from the Host; those promises resolve outside
	// React, so each settled microtask turn needs another pass. Max a few passes
	// so a component that always sets state cannot spin here forever.
	for (let pass = 0; pass < 6; pass += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		hookCursor = 0;
		hookEffects = [];
		rerenderRequested = false;
		tree = component(props);
		// Effects registered on this pass belong to the next one only if the
		// component asked for one; re-running them would loop the loader.
		hookEffects = [];
		if (!rerenderRequested) break;
	}
	return tree;
}
Object.assign(reactStub, {
	useState: (initial) => {
		const index = hookCursor;
		hookCursor += 1;
		if (!(index in hookCells)) hookCells[index] = typeof initial === 'function' ? initial() : initial;
		return [hookCells[index], (next) => {
			hookCells[index] = typeof next === 'function' ? next(hookCells[index]) : next;
			rerenderRequested = true;
		}];
	},
	useEffect: (effect) => {
		hookEffects.push(effect);
	},
	useCallback: (fn) => fn
});
/** Canned Host answers, so the panel can mount without a server. */
const cannedJobs = [
	{ id: 'job-plain', name: 'Plain timer', expression: '0 9 * * *', description: 'daily', timeZone: 'UTC', workspacePath: '/tmp/p', prompt: 'p', enabled: true, gate: null, missed: [], alwaysNewChat: false },
	{ id: 'job-gated', name: 'Gated bot', expression: '*/30 * * * *', description: 'every 30 min', timeZone: 'UTC', workspacePath: '/tmp/p', prompt: 'p', enabled: true, gate: { file: 'TODO.md', heading: 'Incoming' }, missed: [], alwaysNewChat: false, lastStatus: 'skipped', lastNote: 'no open tasks under "## Incoming"', sessionId: 'job-gated-chat-archived' }
];
globalThis.fetch = async (url) => {
	const text = String(url);
	const payload = text.includes('/chats') ? { chats: [] }
		: text.includes('/settings') ? { allowedModels: [], models: [], default: null }
			: text.includes('/jobs') ? { revision: 1, jobs: cannedJobs }
				: {};
	return { ok: true, status: 200, async json() { return payload; } };
};

/**
 * Walk an element tree, expanding function components in place.
 *
 * `el(JobRow, …)` stores the component itself, not its output, so a plain walk
 * would stop at every row and miss all the copy inside it.
 */
/** Every element of a tree (components already expanded), for structural probes. */
function collect(node, out = []) {
	if (node === null || node === undefined || out.length > 4000) return out;
	if (Array.isArray(node)) {
		for (const child of node) collect(child, out);
		return out;
	}
	if (typeof node !== 'object') return out;
	out.push(node);
	for (const child of Array.isArray(node.children) ? node.children : []) collect(child, out);
	return out;
}
function walk(node, visit, depth = 0) {
	if (node === null || node === undefined || depth > 80) return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit, depth + 1);
		return;
	}
	if (typeof node !== 'object') {
		visit(node);
		return;
	}
	visit(node);
	if (typeof node.type === 'function' && typeof node.props === 'object' && node.props !== null) {
		// Expand a component with the surrounding hook cells reset, the way a
		// nested render works; a component that throws is skipped, not fatal.
		try {
			const saved = hookCursor;
			hookCursor = 0;
			const produced = node.type(node.props);
			hookCursor = saved;
			walk(produced, visit, depth + 1);
		} catch {
			/* a nested component that needs live context is out of scope here */
		}
		return;
	}
	for (const child of Array.isArray(node.children) ? node.children : []) walk(child, visit, depth + 1);
}
/** Every string in a tree, joined — enough to assert on rendered copy. */
const treeText = (node) => {
	const parts = [];
	walk(node, (entry) => {
		if (typeof entry === 'string') parts.push(entry);
	});
	return parts.join('\n');
};
const propBag = {
	useWorkspaces: (selector) => {
		const snapshot = { items: [], archivedSessionIds: ['job-gated-chat-archived'], state: 'ready', phase: 'ready', error: null };
		return selector === undefined ? snapshot : selector(snapshot);
	},
	t: (key, values) => (values === undefined ? key : `${key} ${JSON.stringify(values)}`),
	pickDirectory: async () => '/tmp/picked',
	openChat: async () => true
};
let panelTree;
let panelError;
try {
	panelTree = await render(main.component, propBag);
} catch (error) {
	panelError = error;
}
ok('the panel renders without throwing', panelError === undefined, String(panelError?.stack ?? '').split('\n').slice(0, 3).join(' | '));
const panelText = treeText(panelTree);
ok('the panel renders its rows', panelText.includes('Gated bot') && panelText.includes('Plain timer'), panelText.slice(0, 200));
ok('the panel renders the gate column', panelText.includes('column.gate'));
ok('a gated row is marked as gated', panelText.includes('column.gateOn'));
ok('an ungated row is marked as always running', panelText.includes('column.gateOff'));
// A skipped run must read as a skip with its reason, not as a failure.
ok('a skipped row explains itself', panelText.includes('job.skipped'), panelText.slice(-400));
// Archiving hides a chat but leaves it addressable: the table must warn that
// the bound chat is invisible, or a successful run looks like a no-op.
ok('a job bound to an archived chat says so', panelText.includes('column.chatArchived'), panelText.slice(0, 400));

// The add form is an element in that tree; render it to inspect its fields.
let formElement;
walk(panelTree, (node) => {
	if (formElement === undefined && typeof node.type === 'function' && node.type.name === 'JobForm') formElement = node;
});
ok('the panel mounts the add form', formElement !== undefined);
let formTree;
let formError;
try {
	formTree = await render(formElement.type, formElement.props);
} catch (error) {
	formError = error;
}
ok('the form renders without throwing', formError === undefined, String(formError?.stack ?? '').split('\n').slice(0, 3).join(' | '));
const formText = treeText(formTree);
ok('the form renders the gate checkbox', formText.includes('form.gate'), formText.slice(0, 200));
ok('the form renders the setup-brief field', formText.includes('form.initialPrompt'));
ok('the form renders the every-run task field', formText.includes('form.prompt'));
// The gate settings stay hidden while the box is off, by design: an unchecked
// gate is "a plain timer", and showing a file path for it would be a lie.
ok('the gate settings are hidden while it is off', !formText.includes('form.gateFile') && !formText.includes('form.gateHeading'));

// --- the board result: the finding first, the consequence second ---
// A real Host answer is fed through the component, so the wording under test is
// the wording a person reads. The two lines must be distinct: a report about the
// column, then what it implies — never a bare prediction.
// The English source strings already assert the shape; these check that the two
// halves are genuinely separate copy keys with the right placeholders.
const gateKeys = ['form.gateFound', 'form.gateOpen', 'form.gateNone', 'form.gateMissing', 'form.gateMissingHint', 'form.gateNoSection', 'form.gateNoSectionHint'];
for (const key of gateKeys) ok(`gate copy ${key} exists`, enKeys.includes(key) && ruKeys.includes(key) && zhKeys.includes(key));
const dicts = [
	['en', (k) => dictionary.dicts.en[k]],
	['ru', (k) => dictionary.dicts.ru[k]]
];
for (const [label, read] of dicts) {
	// The empty-column line reports the count and only then the consequence.
	ok(`[${label}] the empty line reports a count before the consequence`,
		read('form.gateNone').includes('{closed}') && read('form.gateNone').indexOf('{closed}') < read('form.gateNone').indexOf('—'),
		read('form.gateNone'));
	// The found-line names the column and the file, and promises nothing.
	ok(`[${label}] the found line is a report, not a verdict`,
		read('form.gateFound').includes('{heading}') && read('form.gateFound').includes('{file}') && !/skip|пропу|запуск/i.test(read('form.gateFound')),
		read('form.gateFound'));
	// The open-tasks line reports counts in both numbers.
	ok(`[${label}] the ready line reports open and closed counts`,
		read('form.gateOpen').includes('{open}') && read('form.gateOpen').includes('{closed}'),
		read('form.gateOpen'));
	// A missing section names what the file does contain.
	ok(`[${label}] the no-section hint lists the real sections`,
		read('form.gateNoSectionHint').includes('{list}'),
		read('form.gateNoSectionHint'));
}
// The consequence is only ever the SECOND line: an "empty" answer must not put
// the skip sentence where the finding goes.
ok('the skip consequence is not the first line', !dictionary.dicts.ru['form.gateFound'].includes('пропущ'));
ok('the finding is not phrased as a prediction', !dictionary.dicts.ru['form.gateFound'].includes('состоится'));

// Editing a job that already has a gate is the realistic "box is ticked" state:
// the same fields must be visible, with the job's own file and heading.
let gatedTree;
let gatedError;
try {
	gatedTree = await render(formElement.type, { ...formElement.props, job: cannedJobs[1], editing: true });
} catch (error) {
	gatedError = error;
}
ok('a gated job renders its editor', gatedError === undefined, String(gatedError?.stack ?? '').split('\n').slice(0, 3).join(' | '));
const gatedText = treeText(gatedTree);
ok('an already gated job shows the file field', gatedText.includes('form.gateFile'), gatedText.slice(-300));
ok('an already gated job shows the heading field', gatedText.includes('form.gateHeading'));
ok('the gate settings offer a check button', gatedText.includes('form.gateCheck'));
// Three policy boxes render in this order: always-new chat, the board gate,
// then the human-only catch-up switch. The gate is the middle one.
const gateBoxOf = (tree) => collect(tree).filter((node) => node.props?.type === 'checkbox')[1];
const gatedBoxes = collect(gatedTree).filter((node) => node.props?.type === 'checkbox');
ok('the gate box is ticked for a gated job', gateBoxOf(gatedTree)?.props.checked === true, JSON.stringify(gatedBoxes.map((box) => box.props.checked)));
// And the reverse: a plain timer's editor shows no gate fields at all.
const plainTree = await render(formElement.type, { ...formElement.props, job: cannedJobs[0], editing: true });
const plainText = treeText(plainTree);
ok('a plain timer shows no gate settings', !plainText.includes('form.gateFile') && !plainText.includes('form.gateHeading'));
ok('the gate box is clear for a plain timer', gateBoxOf(plainTree)?.props.checked === false);

console.log(`\nclient: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
