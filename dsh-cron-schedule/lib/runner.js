/**
 * Start one scheduled job: create a fresh chat in the job's workspace, attach it
 * to that workspace, and hand it the job's prompt.
 *
 * This mirrors what the Web GUI's "new chat" button does end to end
 * (`workspaceRegistry.create` → `agents.create` → `attachSession` → prompt), so
 * a scheduled run appears in the session list exactly like a hand-started one,
 * with the same presets, permissions, and model defaults.
 *
 * Nothing outside `node:` builtins is imported: a plugin loaded from a
 * symlinked workspace path cannot resolve the harness's own packages, so the
 * user message is built here in the shape the harness freezes its own.
 *
 * @module dsh-cron-schedule/runner
 */

import { createHash, randomUUID } from 'node:crypto';

/** Deterministic, greppable session id prefix for scheduled runs. */
export const SCHEDULED_SESSION_PREFIX = 'session-cron';

/**
 * Fold the setup brief and the task into one message body.
 *
 * The brief exists so the task text can stay short, but the model must read
 * both in the SAME turn: the brief says who the bot is and how to work, and the
 * task tells it what to do now. They are one body of text with a blank line
 * between them — the brief first, then the task.
 *
 * Delivering them as two messages does NOT work: `agent.followup()` both queues
 * a message and wakes the driver, so the first call starts a turn with only the
 * brief, the second lands in the next turn. That costs a whole extra model turn
 * and the bot acts on the brief alone (in this project it answered "Incoming is
 * empty" before it had even been given the task).
 *
 * @param brief - the setup brief, or undefined when the job has none.
 * @param task - the task body.
 * @returns the text to send.
 */
function composeBody(brief, task) {
	return typeof brief === 'string' && brief !== '' ? `${brief}\n\n${task}` : task;
}

/**
 * Build one user message for a scheduled run.
 *
 * The harness freezes messages created through `createUserMessage` from
 * `@deepseek-ai/dsh-llm`; this is the same plain shape (a fresh uuid id, the
 * `user` role, text content, and a provenance source) so the log carries the
 * job's identity without importing that package.
 *
 * @param job - the stored job record.
 * @param text - the message body (defaults to the job's task prompt).
 * @param stage - `init` when this run also carried the setup brief, `task`
 *   otherwise. It is one message either way; the stage only records whether the
 *   brief was part of it.
 * @returns a frozen user message.
 */
function scheduledMessage(job, text = job.prompt, stage = 'task') {
	return Object.freeze({
		id: randomUUID(),
		role: 'user',
		content: Object.freeze([Object.freeze({ type: 'text', text })]),
		source: Object.freeze({
			// `kind: 'user'` on purpose. The Chat view renders a message as a bubble
			// only for that kind (dsh-client-ui-chat: `source.kind !== 'user'` becomes a
			// collapsed "context injection" row), and the harness's own `user-rpc`
			// source is the same shape. A schedule fires *as* the person, so the run's
			// message is theirs: a bubble they can read, not a hidden injection.
			// `kind: 'cron'` was ours alone, and it made the brief invisible — the bot
			// had its instructions, the reader saw nothing.
			kind: 'user',
			jobId: job.id,
			jobName: job.name,
			expression: job.expression,
			stage
		})
	});
}

/**
 * A short fingerprint of the setup brief.
 *
 * Stored beside the chat it was delivered into, so an edited brief is noticed
 * and re-delivered instead of silently doing nothing until the chat is reset.
 *
 * @param text - the brief.
 * @returns a short stable digest.
 */
export function briefFingerprint(text) {
	return createHash('sha1').update(text).digest('hex').slice(0, 12);
}

/**
 * Does this run have to deliver the brief before the task?
 *
 * Yes for a chat that never received it, for a chat the brief changed under,
 * and for every fresh chat (`alwaysNewChat`). A bound or previously used chat
 * that already carries the current brief gets the task alone — that is the
 * whole point of the split.
 *
 * @param job - the stored job record.
 * @param sessionId - the chat this run will write into.
 * @returns true when the brief must be sent again.
 */
function needsBrief(job, sessionId) {
	if (typeof job.initialPrompt !== 'string' || job.initialPrompt === '') return false;
	return job.briefSessionId !== sessionId || job.briefHash !== briefFingerprint(job.initialPrompt);
}

/** Resolve or create the workspace entity for one absolute directory. */
async function ensureWorkspace(runtime, dir) {
	let existing;
	for (const workspace of runtime.workspaceRegistry.list()) {
		if (workspace.path === dir) {
			existing = workspace;
			break;
		}
	}
	if (existing !== undefined) return existing;
	// `workspaceRegistry.create` requires the directory to exist; a scheduled job
	// may legitimately point at one the user has not created yet, so make it.
	await mkdirp(dir);
	return await runtime.workspaceRegistry.create(dir);
}

/** Create a directory tree without importing `node:fs/promises` at module load. */
async function mkdirp(dir) {
	const { mkdir } = await import('node:fs/promises');
	await mkdir(dir, { recursive: true });
}

/** The deployment's default preset id, when the preset service is available. */
async function defaultPresetId(runtime) {
	if (runtime.agentPresets === undefined) return undefined;
	try {
		const preset = await runtime.agentPresets.resolve(undefined);
		return typeof preset?.id === 'string' ? preset.id : undefined;
	} catch (error) {
		runtime.logger?.warn?.(`cron-schedule: no usable agent preset, running without one: ${String(error)}`);
		return undefined;
	}
}

/**
 * Model/provider selection for a new scheduled session.
 *
 * A job that names a model runs on exactly that route; otherwise `fallback`
 * applies — the model most recently used in a chat, resolved by the caller so
 * a new schedule follows what the person has actually been working in. The
 * deployment default remains the last resort.
 *
 * @param runtime - resolved services.
 * @param job - the stored job record.
 * @param fallback - preferred `{ provider, model }` for a job without one.
 * @returns `{ provider, model }`, or undefined when nothing could be resolved.
 */
function agentOptionsFor(runtime, job, fallback) {
	if (job !== undefined && job !== null && job.model !== undefined && job.model !== null) {
		return { provider: job.model.provider, model: job.model.model };
	}
	if (fallback !== undefined && fallback !== null && typeof fallback.provider === 'string' && typeof fallback.model === 'string') {
		return { provider: fallback.provider, model: fallback.model };
	}
	try {
		const selection = runtime.agentDefaultModel.currentSelection();
		return { provider: selection.provider, model: selection.model };
	} catch {
		return undefined;
	}
}

/**
 * Whether the chat a job points at has been archived by the person.
 *
 * Archiving is a *hiding* action in the harness — the session keeps its slot and
 * its transcript, it is only dropped from the sidebar and the pickers. So a job
 * bound to an archived chat can still deliver into it, and that is the trap: the
 * run reports success, the message lands in a conversation nobody can see, and
 * the schedule looks broken. A chat sent to the archive is, for a schedule, gone
 * — the run must start a fresh one and bind it.
 *
 * @param runtime - resolved services.
 * @param sessionId - the chat the job is bound to.
 * @returns true when that chat is archived.
 */
function isArchivedChat(runtime, sessionId) {
	if (typeof sessionId !== 'string' || sessionId === '') return false;
	try {
		const archived = runtime.workspaceRegistry?.archivedSessionIds;
		return Array.isArray(archived) && archived.includes(sessionId);
	} catch (error) {
		// A registry that cannot answer must not block the run: the delivery is
		// still attempted, and a failure there has its own fallback below.
		runtime.logger?.warn?.(`cron-schedule: could not read the archive set: ${String(error)}`);
		return false;
	}
}

/**
 * Whether a delivery failure means "that chat is not there any more".
 *
 * Only these fall back to a new chat. A rate limit, a model outage or a
 * permission error must surface as a failed run: silently starting a new chat
 * would hide a real problem and scatter one task across conversations.
 *
 * @param error - the rejection from the session controller.
 * @returns true when the chat is gone (deleted, archived away, or unknown).
 */
function isMissingChat(error) {
	const code = typeof error?.code === 'string' ? error.code : '';
	if (code === 'session/not-found' || code === 'SESSION_NOT_FOUND') return true;
	const message = String(error?.message ?? error);
	return /session\s+"[^"]*"\s+not found|unknown session|is archived/i.test(message);
}

/**
 * Deliver one run's prompt into an existing chat.
 *
 * `runtime.sessionController.prompt` is the same admission path the Web
 * composer uses: it resolves the live agent, and for a chat that is no longer
 * live it loads the stored session and resumes an agent on it first. That is
 * what makes a recurring job able to keep writing into one chat across
 * restarts rather than only while the chat happens to be open.
 *
 * The `signal` argument is mandatory on that method, and the request id makes a
 * retry idempotent — a second delivery with the same id is ignored rather than
 * duplicated into the transcript.
 *
 * @param runtime - resolved services.
 * @param sessionId - the chat to write into.
 * @param text - the message body.
 * @param signal - optional caller cancellation.
 */
async function promptExistingChat(runtime, sessionId, text, signal) {
	const controller = runtime.sessionController;
	if (controller === undefined || typeof controller.prompt !== 'function') {
		throw new Error('writing into an existing chat needs the session controller in this deployment');
	}
	await controller.prompt({
		requestId: randomUUID(),
		sessionId,
		mode: 'queue',
		content: [{ type: 'text', text }]
	}, signal ?? new AbortController().signal);
}

/**
 * Run one job now: deliver its prompt into the bound chat, or start a new one.
 *
 * A job with `alwaysNewChat` (or with no chat bound yet) creates a fresh chat
 * in its workspace and, unless the box is ticked, reports that id back so the
 * caller can remember it as the job's chat. Every later run writes into that
 * same chat, which is what makes a recurring task accumulate one conversation
 * instead of leaving a trail of one-shot sessions.
 *
 * The created agent is owned by the caller's plugin fiber (that is how
 * `runtime.agents.create` is traced), so a scheduled chat lives while the plugin
 * lives, exactly like a chat the GUI started.
 *
 * @param runtime - the resolved services (`agents`, `agentPresets`,
 *   `workspaceRegistry`, `agentDefaultModel`, `sessionController`,
 *   `sessionTitle`, `logger`), captured inside the plugin's injection scope — a
 *   raw ctx cannot resolve services from a later timer or HTTP callback.
 * @param job - the stored job record.
 * @param options - `signal` (cancellation), `now` (epoch ms, for the id), and
 *   `requestedSessionId` (an explicit chat to bind for this run).
 * @returns `{ sessionId, workspacePath, created, bindable, briefSessionId?,
 *   briefHash? }` — the last two say which chat received this run's setup brief,
 *   and which version of it, so the store can skip re-sending it.
 */
export async function runJob(runtime, job, options = {}) {
	const signal = options.signal;
	const now = options.now ?? Date.now();
	// A chat picked by the person (or already bound) wins over creating a new one —
	// unless it has been archived, which for a schedule means "that chat is gone":
	// delivering into it would report success into a conversation nobody sees.
	const bound = options.requestedSessionId ?? job.sessionId;
	const archived = isArchivedChat(runtime, bound);

	if (bound !== undefined && !archived && job.alwaysNewChat !== true) {
		try {
			// The chat may predate the brief (the field was added later) or the person
			// may have rewritten it: carry it again, folded into this run's message.
			const briefed = needsBrief(job, bound);
			await promptExistingChat(runtime, bound, briefed ? composeBody(job.initialPrompt, job.prompt) : job.prompt, signal);
			return {
				sessionId: bound,
				workspacePath: job.workspacePath,
				created: false,
				bindable: false,
				...(briefed ? { briefSessionId: bound, briefHash: briefFingerprint(job.initialPrompt) } : {})
			};
		} catch (error) {
			// The chat may have been deleted (or archived between the check above and
			// the delivery). Starting a new one keeps the schedule working; any other
			// failure is the run's own and must be reported as one.
			if (!isMissingChat(error)) throw error;
			runtime.logger?.warn?.(`cron-schedule: chat "${bound}" is gone (${String(error?.message ?? error)}); starting a new one`);
		}
	}
	if (archived) {
		runtime.logger?.info?.(`cron-schedule: chat "${bound}" is archived; starting a new one`);
	}

	const workspace = await ensureWorkspace(runtime, job.workspacePath);
	signal?.throwIfAborted();
	const sessionId = `${SCHEDULED_SESSION_PREFIX}-${job.id.slice(0, 8)}-${now.toString(36)}`;
	const presetId = await defaultPresetId(runtime);
	const agentOptions = agentOptionsFor(runtime, job, options.fallbackModel);
	const handle = await runtime.agents.create({
		sessionId,
		signal,
		meta: {
			cwd: workspace.path,
			...(presetId === undefined ? {} : { agentPreset: presetId })
		},
		...(agentOptions === undefined ? {} : { agentOptions }),
		setup: async (agentCtx) => {
			if (presetId !== undefined) await runtime.agentPresets.mount(agentCtx, presetId);
		}
	});
	let attached = false;
	/**
	 * A fresh chat needs the brief first, then the task, so later runs on this
	 * chat repeat only the task. `alwaysNewChat` jobs make every run "new", so
	 * they get both each time — a fresh chat starts without the brief, by
	 * definition. What was delivered is reported back for the store to record.
	 */
	const briefed = typeof job.initialPrompt === 'string' && job.initialPrompt !== '';
	try {
		signal?.throwIfAborted();
		await workspace.attachSession(sessionId);
		attached = true;
		try {
			runtime.sessionTitle?.rename(handle.agent.session, job.name);
		} catch (error) {
			runtime.logger?.warn?.(`cron-schedule: could not title session "${sessionId}": ${String(error)}`);
		}
		// Exactly one followup: a second call would be queued for the NEXT turn, so
		// the model would act on the first message alone (see composeBody).
		handle.agent.followup(scheduledMessage(job, briefed ? composeBody(job.initialPrompt, job.prompt) : job.prompt, briefed ? 'init' : 'task'));
	} catch (error) {
		// Roll the half-created session back so a failed run leaves no ghost chat.
		if (attached) {
			try {
				await workspace.detachSession(sessionId);
			} catch (detachError) {
				runtime.logger?.warn?.(`cron-schedule: detach for session "${sessionId}" failed: ${String(detachError)}`);
			}
		}
		try {
			await handle.dispose();
		} catch (disposeError) {
			runtime.logger?.warn?.(`cron-schedule: disposal for session "${sessionId}" failed: ${String(disposeError)}`);
		}
		throw error;
	}
	// `bindable` tells the caller to remember this chat for the job — but not
	// when the box is ticked, since that job wants a fresh chat every time.
	return {
		sessionId,
		workspacePath: workspace.path,
		created: true,
		bindable: job.alwaysNewChat !== true,
		...(briefed ? { briefSessionId: sessionId, briefHash: briefFingerprint(job.initialPrompt) } : {})
	};
}
