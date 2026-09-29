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

import { randomUUID } from 'node:crypto';

/** Deterministic, greppable session id prefix for scheduled runs. */
export const SCHEDULED_SESSION_PREFIX = 'session-cron';

/**
 * Build the user message a scheduled run starts with.
 *
 * The harness freezes messages created through `createUserMessage` from
 * `@deepseek-ai/dsh-llm`; this is the same plain shape (a fresh uuid id, the
 * `user` role, text content, and a provenance source) so the log carries the
 * job's identity without importing that package.
 *
 * @param job - the stored job record.
 * @returns a frozen user message.
 */
function scheduledMessage(job) {
	return Object.freeze({
		id: randomUUID(),
		role: 'user',
		content: Object.freeze([Object.freeze({ type: 'text', text: job.prompt })]),
		source: Object.freeze({
			kind: 'cron',
			jobId: job.id,
			jobName: job.name,
			expression: job.expression
		})
	});
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
 * A job that names a model runs on exactly that route; otherwise the
 * deployment's current default is used, so an unconfigured job follows the
 * default when it changes.
 *
 * @param runtime - resolved services.
 * @param job - the stored job record.
 * @returns `{ provider, model }`, or undefined when nothing could be resolved.
 */
function agentOptionsFor(runtime, job) {
	if (job !== undefined && job !== null && job.model !== undefined && job.model !== null) {
		return { provider: job.model.provider, model: job.model.model };
	}
	try {
		const selection = runtime.agentDefaultModel.currentSelection();
		return { provider: selection.provider, model: selection.model };
	} catch {
		return undefined;
	}
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
 * @param job - the stored job record.
 * @param sessionId - the chat to write into.
 * @param signal - optional caller cancellation.
 */
async function promptExistingChat(runtime, job, sessionId, signal) {
	const controller = runtime.sessionController;
	if (controller === undefined || typeof controller.prompt !== 'function') {
		throw new Error('writing into an existing chat needs the session controller in this deployment');
	}
	await controller.prompt({
		requestId: randomUUID(),
		sessionId,
		mode: 'queue',
		content: [{ type: 'text', text: job.prompt }]
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
 * @returns `{ sessionId, workspacePath, created, bindable }`.
 */
export async function runJob(runtime, job, options = {}) {
	const signal = options.signal;
	const now = options.now ?? Date.now();
	// A chat picked by the person (or already bound) wins over creating a new one.
	const bound = options.requestedSessionId ?? job.sessionId;

	if (bound !== undefined && job.alwaysNewChat !== true) {
		await promptExistingChat(runtime, job, bound, signal);
		return { sessionId: bound, workspacePath: job.workspacePath, created: false, bindable: false };
	}

	const workspace = await ensureWorkspace(runtime, job.workspacePath);
	signal?.throwIfAborted();
	const sessionId = `${SCHEDULED_SESSION_PREFIX}-${job.id.slice(0, 8)}-${now.toString(36)}`;
	const presetId = await defaultPresetId(runtime);
	const agentOptions = agentOptionsFor(runtime, job);
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
	try {
		signal?.throwIfAborted();
		await workspace.attachSession(sessionId);
		attached = true;
		try {
			runtime.sessionTitle?.rename(handle.agent.session, job.name);
		} catch (error) {
			runtime.logger?.warn?.(`cron-schedule: could not title session "${sessionId}": ${String(error)}`);
		}
		handle.agent.followup(scheduledMessage(job));
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
	return { sessionId, workspacePath: workspace.path, created: true, bindable: job.alwaysNewChat !== true };
}
