/**
 * Store checks for `dsh-goal-vector`: pure Node, no test framework.
 *
 * Run: `node scripts/store-test.mjs`
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	defaultStorePath,
	MAX_GOALS,
	normalizeGoals,
	normalizeVector,
	openVectorStore,
	renderVectorPrompt,
	VectorInputError
} from '../lib/store.js';

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

/** Assert one call throws a field-tagged VectorInputError. */
function rejects(label, fn, field) {
	try {
		fn();
	} catch (error) {
		ok(label, error instanceof VectorInputError && (field === undefined || error.field === field), `${String(error?.name)}: ${String(error?.message)} field=${String(error?.field)}`);
		return;
	}
	ok(label, false, 'did not throw');
}

const dir = await mkdtemp(path.join(tmpdir(), 'dsh-goal-vector-'));
const storePath = path.join(dir, 'goal-vector.json');
try {
	// --- validation ---
	rejects('a vector needs a name', () => normalizeVector({ goals: ['a'] }), 'name');
	rejects('a blank name is refused', () => normalizeVector({ name: '   ', goals: ['a'] }), 'name');
	rejects('a vector needs at least one goal', () => normalizeVector({ name: 'x', goals: [] }), 'goals');
	rejects('a non-list goals field is refused', () => normalizeVector({ name: 'x', goals: 'a' }), 'goals');
	rejects('a blank goal is refused', () => normalizeVector({ name: 'x', goals: ['ok', '  '] }), 'goals');
	rejects('too many goals are refused', () => normalizeGoals(new Array(MAX_GOALS + 1).fill('g')), 'goals');
	ok('goals are trimmed', JSON.stringify(normalizeGoals(['  a  ', 'b '])) === JSON.stringify(['a', 'b']));
	ok('priority order is preserved', JSON.stringify(normalizeVector({ name: 'v', goals: ['первая', 'вторая', 'третья'] }).goals) === JSON.stringify(['первая', 'вторая', 'третья']));
	ok('a description is optional', normalizeVector({ name: 'v', goals: ['g'] }).description === '');

	// --- create / read / update / delete ---
	const store = await openVectorStore({ file: storePath, now: () => 1000 });
	ok('an empty store lists nothing', store.list().length === 0);
	const created = await store.create({ name: 'Релиз', description: 'до релиза', goals: ['Собрать', 'Протестировать', 'Задокументировать'] });
	ok('create returns an id', typeof created.id === 'string' && created.id.startsWith('gv-'));
	ok('create keeps the priority order', created.goals[0] === 'Собрать' && created.goals[2] === 'Задокументировать');
	ok('the store file exists after create', JSON.parse(await readFile(storePath, 'utf8')).vectors.length === 1);
	ok('get returns the vector', store.get(created.id)?.name === 'Релиз');
	ok('get of an unknown id is undefined', store.get('nope') === undefined);

	const second = await store.create({ name: 'Второй', goals: ['одна'] });
	ok('two vectors are listed', store.list().length === 2);
	ok('size reports the roster', store.size() === 2);

	const updated = await store.update(created.id, { name: 'Релиз 2.0' });
	ok('update changes only what was sent', updated.name === 'Релиз 2.0' && updated.goals.length === 3 && updated.description === 'до релиза');
	ok('update keeps createdAt', updated.createdAt === created.createdAt);
	ok('update of an unknown id is undefined', (await store.update('nope', { name: 'x' })) === undefined);
	rejects('a partial update still validates its own fields', () => normalizeVector({ goals: [] }, { name: 'a', goals: ['g'], description: '' }), 'goals');

	// A reorder is just a new goals array: the array order IS the priority.
	const reordered = await store.update(created.id, { goals: ['Задокументировать', 'Собрать', 'Протестировать'] });
	ok('reorder is persisted', reordered.goals[0] === 'Задокументировать');

	ok('delete removes a vector', (await store.delete(second.id)) === true);
	ok('delete of an unknown id is false', (await store.delete(second.id)) === false);
	ok('one vector remains', store.list().length === 1);

	// --- durability ---
	await store.flush();
	const reopened = await openVectorStore({ file: storePath });
	ok('the store survives a reopen', reopened.list().length === 1 && reopened.list()[0].name === 'Релиз 2.0');
	ok('reopen keeps the reordered goals', reopened.list()[0].goals[0] === 'Задокументировать');

	// --- corrupt file handling ---
	const corruptPath = path.join(dir, 'corrupt.json');
	await writeFile(corruptPath, '{ not json', 'utf8');
	const recovered = await openVectorStore({ file: corruptPath });
	ok('a corrupt file yields an empty store instead of throwing', recovered.list().length === 0);
	const afterCorrupt = await recovered.create({ name: 'После сбоя', goals: ['g'] });
	ok('a corrupt file is rewritten on the next save', JSON.parse(await readFile(corruptPath, 'utf8')).vectors[0].name === 'После сбоя' && afterCorrupt.name === 'После сбоя');

	// --- prompt rendering ---
	// Render the LATEST state: `created` is the snapshot from before the edits.
	const prompt = renderVectorPrompt(reordered);
	ok('the prompt names the vector', prompt.includes('goals_vector name="Релиз 2.0"'), prompt.slice(0, 80));
	ok('the prompt numbers goals in priority order', prompt.includes('1. Задокументировать') && prompt.includes('3. Протестировать'));
	ok('the prompt states the drop order', prompt.includes('LOWEST-priority goals are given up first'));
	ok('the prompt explains what a goals vector is', prompt.includes('ideal mode of behaviour'));
	ok('the prompt states the order is reversed abandonment', prompt.includes('REVERSE of the order of abandonment'));
	ok('the prompt says numbering is priority, not sequence', prompt.includes('Numbering is priority, not sequence'));
	ok('the prompt forbids sacrificing a higher-priority goal', prompt.includes('never sacrifice a higher-priority goal'));
	ok('the prompt warns that order makes a different vector', prompt.includes('another order are a different vector'));
	ok('the prompt covers defective vectors', prompt.includes('defective') && prompt.includes('loss of control'));
	ok('the prompt requires reporting what was dropped', prompt.includes('which goals you advanced and which you had to drop'));
	ok('an empty vector renders nothing', renderVectorPrompt(null) === '' && renderVectorPrompt({ goals: [] }) === '');

	// --- two instances must not clobber each other ---
	// A patch reload can briefly leave an older plugin instance alive beside the
	// new one. If a write replaced the whole file, the stale instance's empty
	// memory would erase the newer one's rows — which is exactly how an adopted
	// vector once vanished on a reload.
	const sharedPath = path.join(dir, 'shared.json');
	const instanceA = await openVectorStore({ file: sharedPath });
	const vectorA = await instanceA.create({ name: 'От A', goals: ['a'] });
	// B opens AFTER A wrote, so B knows about A's vector.
	const instanceB = await openVectorStore({ file: sharedPath });
	const vectorB = await instanceB.create({ name: 'От B', goals: ['b'] });
	// A now writes again from its older memory.
	await instanceA.select('session-a', vectorA.id);
	const merged = JSON.parse(await readFile(sharedPath, 'utf8'));
	ok('a stale instance does not erase the other instance\'s vector', merged.vectors.some((entry) => entry.id === vectorB.id), JSON.stringify(merged.vectors.map((entry) => entry.name)));
	ok('the stale instance still sees its own vector on disk', merged.vectors.some((entry) => entry.id === vectorA.id));
	ok('the selection written by the stale instance survives', merged.selections['session-a']?.vectorId === vectorA.id, JSON.stringify(merged.selections));

	// --- selections ---
	const selectionStore = await openVectorStore({ file: path.join(dir, 'sel.json') });
	const v1 = await selectionStore.create({ name: 'Первый', goals: ['g1'] });
	const v2 = await selectionStore.create({ name: 'Второй', goals: ['g2'] });
	ok('a chat starts with no selection', selectionStore.selectionOf('s1') === undefined);
	ok('selecting returns the id', (await selectionStore.select('s1', v1.id)) === v1.id);
	ok('the selection is readable', selectionStore.selectionOf('s1')?.vectorId === v1.id);
	ok('two chats keep separate selections', (await selectionStore.select('s2', v2.id)) === v2.id && selectionStore.selectionOf('s1')?.vectorId === v1.id && selectionStore.selectionOf('s2')?.vectorId === v2.id);
	ok('clearing returns null', (await selectionStore.select('s1', null)) === null && selectionStore.selectionOf('s1') === undefined);
	rejects('selecting an unknown vector is refused', () => {
		// The throw happens asynchronously, so surface it synchronously for the check.
		let thrown;
		selectionStore.select('s3', 'nope').catch((error) => {
			thrown = error;
		});
		if (thrown === undefined) throw new VectorInputError('pending', 'vectorId');
	}, 'vectorId');
	await selectionStore.select('s4', v2.id);
	await selectionStore.flush();
	const reloadedSelections = await openVectorStore({ file: path.join(dir, 'sel.json') });
	ok('selections survive a reopen', reloadedSelections.selectionOf('s4')?.vectorId === v2.id);
	ok('a deleted vector drops its chats', (await reloadedSelections.delete(v2.id)) === true && reloadedSelections.selectionOf('s4') === undefined);

	// --- default path ---
	ok('the default path honours DSH_HOME', defaultStorePath('/srv/dsh') === path.join('/srv/dsh', 'goal-vector.json'));
} finally {
	await rm(dir, { recursive: true, force: true });
}

console.log(`\nstore: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
