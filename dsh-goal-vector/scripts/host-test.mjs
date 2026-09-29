/**
 * Host checks for `dsh-goal-vector`: routes, the per-agent prompt section, and
 * the model-facing tools — against a fake host context that behaves like the
 * live Cordis runtime where it matters.
 *
 * Run: `node scripts/host-test.mjs`
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

/**
 * A fake host context.
 *
 * `seal()` reproduces the live runtime's most important trap: after `apply`
 * settles, reading a service off the raw context throws. Timers and HTTP
 * handlers run in exactly that window, so a callback that forgot to capture a
 * service fails here instead of only on the server.
 */
function fakeHost() {
	const routes = new Map();
	const tools = new Map();
	const effects = [];
	const injections = [];
	const listeners = new Map();
	const sessions = new Map();
	const agents = [];
	const started = [];
	const sections = [];
	let sealed = false;

	const host = {
		routes,
		tools,
		effects,
		injections,
		listeners,
		agents,
		sessions,
		started,
		sections,
		ctx: {
			logger: { info() {}, warn() {}, error() {} },
			effect(factory, label) {
				effects.push(label);
				return factory();
			},
			inject(names, callback) {
				injections.push(Array.isArray(names) ? names.join('+') : String(names));
				// `tools` is always present; `subagents` is faked, because the real one
				// needs a live parent agent and a real provider backend.
				callback({
					tools: { register: (definition) => tools.set(definition.name, definition) },
					subagents: {
						list: () => ['spawn', 'fork'],
						start: async (provider, request) => {
							started.push({ provider, request });
							return {
								id: 'child-1',
								result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'готово' }] }),
								dispose: async () => {}
							};
						}
					}
				});
				return () => {};
			},
			get(name) {
				if (sealed) throw new Error(`cannot get property "${name}" without inject`);
				return undefined;
			},
			webServer: {
				register(route) {
					routes.set(`${route.kind}:${route.path}`, route);
					return () => {};
				}
			},
			sessions: {
				get: (id) => sessions.get(id),
				list: () => [...sessions.values()]
			},
			agents: {
				list: () => [...agents]
			},
			on(event, listener) {
				const list = listeners.get(event) ?? [];
				list.push(listener);
				listeners.set(event, list);
				return () => {};
			}
		},
		/** Create one fake live session. */
		addSession(id) {
			const session = { id };
			sessions.set(id, session);
			return session;
		},
		/**
		 * Create one fake live agent.
		 *
		 * `agent.ctx.inject` runs its callback immediately — exactly the scoped
		 * registration the real per-agent context performs — and records the prompt
		 * section it installs.
		 */
		addAgent(id) {
			const session = sessions.get(id) ?? host.addSession(id);
			const agent = { id, session, sections: [] };
			agent.ctx = {
				inject(names, callback) {
					callback({
						systemPrompt: {
							section(entry) {
								agent.sections.push(entry);
								sections.push({ agent, entry });
								return () => {
									const at = agent.sections.indexOf(entry);
									if (at >= 0) agent.sections.splice(at, 1);
								};
							}
						}
					});
					return { dispose: async () => {} };
				}
			};
			agents.push(agent);
			return agent;
		},
		/** Fire one host lifecycle event. */
		emit(event, payload) {
			for (const listener of listeners.get(event) ?? []) listener(payload);
		},
		/** Freeze service resolution the way the live host does after `apply`. */
		seal() {
			sealed = true;
		}
	};
	return host;
}

/** A minimal request/response pair over one handler call. */
async function call(handler, method, url, body) {
	const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')];
	const req = {
		method,
		url,
		headers: {},
		async *[Symbol.asyncIterator]() {
			for (const chunk of chunks) yield chunk;
		},
		resume() {}
	};
	let status = 0;
	let payload = '';
	const headers = {};
	const res = {
		writeHead(code, extra) {
			status = code;
			Object.assign(headers, extra ?? {});
		},
		setHeader(key, value) {
			headers[key] = value;
		},
		end(text) {
			if (typeof text === 'string') payload = text;
		}
	};
	await handler(req, res);
	let parsed;
	try {
		parsed = payload === '' ? undefined : JSON.parse(payload);
	} catch {
		parsed = payload;
	}
	return { status, body: parsed, headers };
}

/**
 * Reproduce the real `webServer.match` precedence: an exact hit first, then
 * longest-prefix where a prefix matches `p` and `p/<rest>`. This is the
 * regression guard for the trailing-slash bug that made per-vector requests fall
 * through to the `/api` auth fence and answer 401.
 */
function makeMatcher(routes) {
	return (pathname) => {
		const exact = routes.get(`exact:${pathname}`);
		if (exact !== undefined) return exact;
		let best;
		for (const [key, route] of routes) {
			if (!key.startsWith('prefix:')) continue;
			const prefix = key.slice('prefix:'.length);
			if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue;
			if (best === undefined || prefix.length > best.prefix.length) best = { prefix, route };
		}
		return best?.route;
	};
}

const dir = await mkdtemp(path.join(tmpdir(), 'dsh-goal-vector-host-'));
const storePath = path.join(dir, 'goal-vector.json');
try {
	const { apply, SELECTION_PATH, VECTORS_PATH } = await import('../lib/index.js');

	// --- wiring ---
	const host = fakeHost();
	await apply(host.ctx, { storePath });
	ok('the vectors route is registered', host.routes.has(`exact:${VECTORS_PATH}`));
	ok('the vector prefix route is registered', host.routes.has(`prefix:${VECTORS_PATH}`));
	ok('the selection route is registered', host.routes.has(`exact:${SELECTION_PATH}`));
	ok('the prefix route has no trailing slash', [...host.routes.keys()].includes(`prefix:${VECTORS_PATH}`), String(VECTORS_PATH));
	ok('no session projection is registered', host.injections.every((entry) => !entry.includes('sessionProjections')), host.injections.join(' | '));
	ok('the tools runtime was injected', host.injections.includes('tools'), host.injections.join(' | '));
	ok('the subagent runtime was injected separately', host.injections.includes('tools+subagents'), host.injections.join(' | '));
	ok('all four tools are registered', ['goal_vector_list', 'goal_vector_create', 'goal_vector_adopt', 'goal_vector_delegate'].every((name) => host.tools.has(name)), [...host.tools.keys()].join(', '));
	ok('the agent lifecycle is observed', host.listeners.has('agent/created') && host.listeners.has('agent/disposed'));

	const match = makeMatcher(host.routes);
	ok('a per-vector path reaches the prefix route', match(`${VECTORS_PATH}/gv-1`) !== undefined);
	ok('the collection path uses the exact route', match(VECTORS_PATH) === host.routes.get(`exact:${VECTORS_PATH}`));
	ok('the selection path is exact', match(SELECTION_PATH) === host.routes.get(`exact:${SELECTION_PATH}`));

	// --- an agent gets a prompt section whose text is dynamic ---
	const agent = host.addAgent('session-a');
	host.emit('agent/created', { agent });
	ok('an agent receives exactly one prompt section', agent.sections.length === 1, String(agent.sections.length));
	const section = agent.sections[0];
	ok('the section is named', section?.name === 'goal-vector:policy', String(section?.name));
	ok('the section order is a finite number', Number.isFinite(section?.order), String(section?.order));
	ok('the section text is a function (re-read every step)', typeof section?.text === 'function');
	ok('no vector means no prompt text', section.text() === '');

	// From here on, service reads off the raw ctx must fail — like the live host.
	host.seal();

	// --- empty list ---
	const listRoute = host.routes.get(`exact:${VECTORS_PATH}`);
	const empty = await call(listRoute.handler, 'GET', VECTORS_PATH);
	ok('an empty list answers 200', empty.status === 200, JSON.stringify(empty.body));
	ok('an empty list has no vectors', Array.isArray(empty.body.vectors) && empty.body.vectors.length === 0);

	// --- method guard ---
	const put = await call(listRoute.handler, 'PUT', VECTORS_PATH);
	ok('an unsupported method answers 405', put.status === 405, String(put.status));
	ok('405 advertises the allowed methods', put.headers.allow === 'GET, HEAD, POST', String(put.headers.allow));

	// --- create ---
	const created = await call(listRoute.handler, 'POST', VECTORS_PATH, {
		name: 'Выпустить релиз',
		description: 'до публикации',
		goals: ['Собрать артефакт', 'Прогнать тесты', 'Обновить README']
	});
	ok('create answers 201', created.status === 201, JSON.stringify(created.body).slice(0, 200));
	const vector = created.body.vector;
	ok('create returns an id', typeof vector.id === 'string' && vector.id.startsWith('gv-'));
	ok('create preserves the priority order', vector.goals[0] === 'Собрать артефакт' && vector.goals[2] === 'Обновить README');
	ok('the vector is persisted to disk', JSON.parse(await readFile(storePath, 'utf8')).vectors.length === 1);

	// --- validation errors are 400 with a field ---
	const noName = await call(listRoute.handler, 'POST', VECTORS_PATH, { goals: ['g'] });
	ok('a missing name answers 400', noName.status === 400, String(noName.status));
	ok('the error names the offending field', noName.body.field === 'name', String(noName.body.field));
	const noGoals = await call(listRoute.handler, 'POST', VECTORS_PATH, { name: 'x', goals: [] });
	ok('an empty goals list answers 400 with field=goals', noGoals.status === 400 && noGoals.body.field === 'goals', JSON.stringify(noGoals.body));
	const badJson = await call(listRoute.handler, 'POST', VECTORS_PATH, undefined);
	ok('an empty body is refused with field=name', badJson.status === 400 && badJson.body.field === 'name', JSON.stringify(badJson.body));

	// --- edit and delete ---
	const oneRoute = host.routes.get(`prefix:${VECTORS_PATH}`);
	const partial = await call(oneRoute.handler, 'POST', `${VECTORS_PATH}/${vector.id}`, { name: 'Выпустить релиз 2.0' });
	ok('a partial edit answers 200', partial.status === 200, JSON.stringify(partial.body).slice(0, 200));
	ok('a partial edit keeps the goals', partial.body.vector.goals.length === 3 && partial.body.vector.name === 'Выпустить релиз 2.0');
	const reordered = await call(oneRoute.handler, 'POST', `${VECTORS_PATH}/${vector.id}`, { goals: ['Обновить README', 'Собрать артефакт', 'Прогнать тесты'] });
	ok('a reorder is persisted', reordered.body.vector.goals[0] === 'Обновить README');
	const afterEdit = await call(listRoute.handler, 'GET', VECTORS_PATH);
	ok('an edit did not duplicate the vector', afterEdit.body.vectors.filter((entry) => entry.id === vector.id).length === 1);
	const missing = await call(oneRoute.handler, 'GET', `${VECTORS_PATH}/nope`);
	ok('an unknown vector answers 404', missing.status === 404, String(missing.status));

	// --- the prompt section follows the adopted vector ---
	const selectionRoute = host.routes.get(`exact:${SELECTION_PATH}`);
	const beforeAdopt = await call(selectionRoute.handler, 'GET', `${SELECTION_PATH}?sessionId=session-a`);
	ok('the selection route lists the vectors', beforeAdopt.status === 200 && beforeAdopt.body.vectors.length === 1, JSON.stringify(beforeAdopt.body).slice(0, 200));
	ok('the selection starts empty', beforeAdopt.body.selection.vectorId === null);

	const adopted = await call(selectionRoute.handler, 'POST', SELECTION_PATH, { sessionId: 'session-a', vectorId: vector.id });
	ok('adopting answers 200', adopted.status === 200, JSON.stringify(adopted.body).slice(0, 200));
	ok('adopting reports the vector', adopted.body.selection.vectorId === vector.id && adopted.body.selection.active === true);
	ok('adopting writes the selection to disk', JSON.parse(await readFile(storePath, 'utf8')).selections['session-a']?.vectorId === vector.id);
	const prompt = section.text();
	ok('the adopted vector reaches the prompt', prompt.includes('goals_vector') && prompt.includes('1. Обновить README'), prompt.slice(0, 140));
	ok('the prompt states the drop order', prompt.includes('LOWEST-priority goals are given up first'));
	ok('the prompt explains the concept to the model', prompt.includes('ideal mode of behaviour') && prompt.includes('REVERSE of the order'));

	// Editing the vector must change the text of a chat already following it —
	// this is why the store keeps the id, not the rendered text.
	await call(oneRoute.handler, 'POST', `${VECTORS_PATH}/${vector.id}`, { goals: ['Новая главная цель'] });
	ok('editing a vector updates an adopting chat', section.text().includes('1. Новая главная цель'));

	// The state is per-chat: another agent must not see it.
	const other = host.addAgent('session-b');
	host.emit('agent/created', { agent: other });
	ok('another chat sees no vector', other.sections[0].text() === '');

	// Deleting it must degrade to "no vector" rather than throw.
	await call(oneRoute.handler, 'DELETE', `${VECTORS_PATH}/${vector.id}`);
	ok('deleting an adopted vector clears the prompt', section.text() === '');

	const cleared = await call(selectionRoute.handler, 'POST', SELECTION_PATH, { sessionId: 'session-a', vectorId: null });
	ok('clearing answers 200 and reports no vector', cleared.status === 200 && cleared.body.selection.vectorId === null);
	const noSession = await call(selectionRoute.handler, 'POST', SELECTION_PATH, {});
	ok('a missing sessionId answers 400 with field=sessionId', noSession.status === 400 && noSession.body.field === 'sessionId', JSON.stringify(noSession.body));
	const unknownSession = await call(selectionRoute.handler, 'POST', SELECTION_PATH, { sessionId: 'nope', vectorId: 'x' });
	ok('an unknown session answers 404', unknownSession.status === 404, String(unknownSession.status));

	// --- adoption through the model tool ---
	const second = await call(listRoute.handler, 'POST', VECTORS_PATH, { name: 'Второй', goals: ['a', 'b'] });
	const adoptTool = host.tools.get('goal_vector_adopt');
	const adoptResult = await adoptTool.execute({ vectorId: second.body.vector.id }, { agent: { session: { id: 'session-a' } } });
	ok('the adopt tool reports the vector', adoptResult.active === true && adoptResult.name === 'Второй', JSON.stringify(adoptResult));
	ok('the adopt tool reaches the prompt', section.text().includes('1. a'));
	const adoptClear = await adoptTool.execute({ vectorId: null }, { agent: { session: { id: 'session-a' } } });
	ok('the adopt tool can clear', adoptClear.active === false && section.text() === '');
	let adoptUnknown = null;
	try {
		await adoptTool.execute({ vectorId: 'nope' }, { agent: { session: { id: 'session-a' } } });
	} catch (error) {
		adoptUnknown = error;
	}
	ok('the adopt tool refuses an unknown id', adoptUnknown !== null && String(adoptUnknown.message).includes('unknown goals vector'), String(adoptUnknown?.message));

	// --- create and list through the model tools ---
	const createTool = host.tools.get('goal_vector_create');
	const createdByModel = await createTool.execute({ name: 'От ИИ', goals: ['раз', 'два'], description: 'создано моделью' }, {});
	ok('the create tool returns an id and keeps the order', typeof createdByModel.id === 'string' && createdByModel.goals[0] === 'раз');
	ok('the create tool persists', JSON.parse(await readFile(storePath, 'utf8')).vectors.some((entry) => entry.id === createdByModel.id));
	const listTool = host.tools.get('goal_vector_list');
	const listed = await listTool.execute({}, {});
	ok('the list tool sees the new vector', listed.vectors.some((entry) => entry.id === createdByModel.id));
	ok('the list tool sets description for every vector', listed.vectors.every((entry) => typeof entry.description === 'string'));
	ok('the list tool carries goals arrays', listed.vectors.every((entry) => Array.isArray(entry.goals)));

	// --- delegation ---
	const delegateTool = host.tools.get('goal_vector_delegate');
	let delegateUnknown = null;
	try {
		await delegateTool.execute({ vectorId: 'nope', prompt: 'x', description: 'test' }, { agent: { session: { id: 'session-a' } } });
	} catch (error) {
		delegateUnknown = error;
	}
	ok('the delegate tool refuses an unknown vector', delegateUnknown !== null && String(delegateUnknown.message).includes('unknown goals vector'), String(delegateUnknown?.message));

	// Delegate on a real vector: the child must receive the vector as its
	// persona, so it follows the goals from its very first step.
	const delegated = await delegateTool.execute({ vectorId: createdByModel.id, prompt: 'сделай работу', description: 'Delegate work' }, { agent: { session: { id: 'session-a' } } });
	ok('the delegate tool returns the child summary', delegated.status === 'completed' && delegated.summary === 'готово', JSON.stringify(delegated));
	const kid = host.started.at(-1);
	ok('the delegation used the spawn provider by default', kid?.provider === 'spawn', String(kid?.provider));
	ok('the child received the vector as its persona', typeof kid?.request?.persona === 'string' && kid.request.persona.includes('goals_vector') && kid.request.persona.includes('1. раз'), String(kid?.request?.persona).slice(0, 120));
	ok('the child received the task text', kid?.request?.prompt?.[0]?.text === 'сделай работу');
	ok('the delegation carries a label', kid?.request?.label === 'Delegate work');
	let badProvider = null;
	try {
		await delegateTool.execute({ vectorId: createdByModel.id, prompt: 'x', description: 'y', provider: 'nope' }, { agent: { session: { id: 'session-a' } } });
	} catch (error) {
		badProvider = error;
	}
	ok('the delegate tool refuses an unknown provider', badProvider !== null && String(badProvider.message).includes('unknown subagent provider'), String(badProvider?.message));

	// --- tool output schemas accept what execute returned ---
	const schemaOf = (name) => host.tools.get(name).output.schema;
	const checkShape = (schema, value, label) => {
		const props = schema.properties ?? {};
		for (const key of schema.required ?? []) {
			ok(`${label}: carries required "${key}"`, value[key] !== undefined, JSON.stringify(value));
		}
		for (const [key, sub] of Object.entries(props)) {
			if (value[key] === undefined) continue;
			if (sub.type === 'boolean') ok(`${label}: ${key} is boolean`, typeof value[key] === 'boolean');
			else if (sub.type === 'string') ok(`${label}: ${key} is string`, typeof value[key] === 'string', String(value[key]));
			else if (sub.type === 'array') ok(`${label}: ${key} is array`, Array.isArray(value[key]));
			else if (sub.type === 'object') ok(`${label}: ${key} is object`, value[key] !== null && typeof value[key] === 'object');
		}
	};
	checkShape(schemaOf('goal_vector_create'), createdByModel, 'create');
	checkShape(schemaOf('goal_vector_list'), listed, 'list');
	checkShape(schemaOf('goal_vector_adopt'), adoptResult, 'adopt');
	checkShape(schemaOf('goal_vector_delegate'), delegated, 'delegate');
	ok('adopt output allows an absent vectorId', schemaOf('goal_vector_adopt').properties.vectorId.required === undefined, JSON.stringify(schemaOf('goal_vector_adopt').properties.vectorId));

	// --- the store survives a restart ---
	// Adopt again first: the checks above deliberately cleared this chat.
	await adoptTool.execute({ vectorId: createdByModel.id }, { agent: { session: { id: 'session-a' } } });
	const reopened = fakeHost();
	await apply(reopened.ctx, { storePath });
	const reopenedList = await call(reopened.routes.get(`exact:${VECTORS_PATH}`).handler, 'GET', VECTORS_PATH);
	ok('a reopened host sees the persisted vectors', reopenedList.body.vectors.length >= 2, String(reopenedList.body.vectors.length));
	const revived = reopened.addAgent('session-a');
	reopened.emit('agent/created', { agent: revived });
	ok('a reopened host restores the adopted vector for a chat', revived.sections[0].text().includes('goals_vector'), revived.sections[0].text().slice(0, 100));

	// --- a selection for a second chat lives alongside the first ---
	reopened.addSession('session-c');
	const secondChat = await call(reopened.routes.get(`exact:${SELECTION_PATH}`).handler, 'POST', SELECTION_PATH, { sessionId: 'session-c', vectorId: createdByModel.id });
	ok('a second chat can adopt a vector', secondChat.status === 200 && secondChat.body.selection.vectorId === createdByModel.id, JSON.stringify(secondChat.body).slice(0, 160));
	const stored = JSON.parse(await readFile(storePath, 'utf8')).selections;
	ok('both chats are stored', stored['session-a'] !== undefined && stored['session-c'] !== undefined, JSON.stringify(stored));

	console.log(`\nhost: pass=${pass} fail=${fail}`);
	process.exit(fail === 0 ? 0 : 1);
} finally {
	await rm(dir, { recursive: true, force: true });
}
