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

/** Model/provider selection for a new scheduled session. */
function defaultAgentOptions(runtime) {
	try {
		const selection = runtime.agentDefaultModel.currentSelection();
		return { provider: selection.provider, model: selection.model };
	} catch {
		return undefined;
	}
}

/**
 * Run one job now: create its chat and deliver the prompt.
 *
 * The created agent is owned by the caller's plugin fiber (that is how
 * `runtime.agents.create` is traced), so a scheduled chat lives while the plugin
 * lives, exactly like a chat the GUI started.
 *
 * @param runtime - the resolved services (`agents`, `agentPresets`,
 *   `workspaceRegistry`, `agentDefaultModel`, `sessionTitle`, `logger`), captured
 *   inside the plugin's injection scope — a raw ctx cannot resolve services from
 *   a later timer or HTTP callback.
 * @param job - the stored job record.
 * @param options - `signal` (cancellation) and `now` (epoch ms, for the id).
 * @returns `{ sessionId, workspacePath }`.
 */
export async function runJob(runtime, job, options = {}) {
	const signal = options.signal;
	const now = options.now ?? Date.now();
	const workspace = await ensureWorkspace(runtime, job.workspacePath);
	signal?.throwIfAborted();
	const sessionId = `${SCHEDULED_SESSION_PREFIX}-${job.id.slice(0, 8)}-${now.toString(36)}`;
	const presetId = await defaultPresetId(runtime);
	const agentOptions = defaultAgentOptions(runtime);
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
	return { sessionId, workspacePath: workspace.path };
}
