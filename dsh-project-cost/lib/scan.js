/**
 * Session-log scanning for the project-cost meter: Zstandard concatenated-frame
 * decoding plus a line-level fold that pulls exactly two facts out of a
 * session log — which model a call was billed against, and the provider's
 * `usage` accounting for that call.
 *
 * The scanner never full-parses the large `assistant/message` lines (they
 * embed the raw model stream), so a cold scan of every stored session stays
 * cheap enough to run on demand.
 *
 * @module dsh-project-cost/scan
 */

import { zstdDecompressSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** Zstandard frame magic, little-endian. */
const ZSTD_MAGIC = 4247762216;
/** Skippable-frame magic range start (0x184D2A50 ..= 0x184D2A5F). */
const ZSTD_SKIPPABLE_START = 407942224;
/** Skippable-frame magic range length. */
const ZSTD_SKIPPABLE_COUNT = 16;

/**
 * Locate complete Zstandard frames in a concatenated-frame container without
 * decompressing their blocks. A torn final frame is reported as `tornStart`
 * and simply ignored by readers.
 *
 * @param buffer - complete bytes of one session artifact.
 * @returns complete frame ranges plus an optional torn-tail start offset.
 */
export function scanZstdFrames(buffer) {
	const frames = [];
	let offset = 0;
	while (offset < buffer.length) {
		const start = offset;
		if (buffer.length - offset < 4) return { frames, tornStart: start };
		const magic = buffer.readUInt32LE(offset);
		offset += 4;
		if (magic === ZSTD_MAGIC) {
			if (offset === buffer.length) return { frames, tornStart: start };
			const descriptor = buffer.readUInt8(offset);
			offset += 1;
			if ((descriptor & 24) !== 0) throw new Error(`corrupt Zstandard log: reserved frame-header bit at byte ${offset - 1}`);
			const contentSizeFlag = descriptor >>> 6;
			const singleSegment = (descriptor & 32) !== 0;
			const checksum = (descriptor & 4) !== 0;
			const dictionaryFlag = descriptor & 3;
			const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
			const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
			const headerBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
			if (buffer.length - offset < headerBytes) return { frames, tornStart: start };
			offset += headerBytes;
			for (;;) {
				if (buffer.length - offset < 3) return { frames, tornStart: start };
				const blockHeader = buffer.readUIntLE(offset, 3);
				offset += 3;
				const lastBlock = (blockHeader & 1) !== 0;
				const blockType = blockHeader >>> 1 & 3;
				const blockSize = blockHeader >>> 3;
				if (blockType === 3) throw new Error(`corrupt Zstandard log: reserved block type at byte ${offset - 3}`);
				const payloadBytes = blockType === 1 ? 1 : blockSize;
				if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
				offset += payloadBytes;
				if (lastBlock) break;
			}
			if (checksum) {
				if (buffer.length - offset < 4) return { frames, tornStart: start };
				offset += 4;
			}
			frames.push({ start, end: offset });
			continue;
		}
		if (magic >= ZSTD_SKIPPABLE_START && magic < ZSTD_SKIPPABLE_START + ZSTD_SKIPPABLE_COUNT) {
			if (buffer.length - offset < 4) return { frames, tornStart: start };
			const size = buffer.readUInt32LE(offset);
			offset += 4 + size;
			if (offset > buffer.length) return { frames, tornStart: start };
			continue;
		}
		throw new Error(`corrupt Zstandard log: invalid frame magic at byte ${start}`);
	}
	return { frames };
}

/**
 * Decode one session artifact to text.
 *
 * @param buffer - file bytes: a Zstandard concatenated-frame container or a
 *   plain-text JSONL file.
 * @param options - `compressed` selects Zstandard decoding; defaults to
 *   sniffing the Zstandard magic.
 * @returns the artifact's JSONL text (possibly a torn tail's prefix).
 */
export function decodeLogText(buffer, options = {}) {
	const compressed = options.compressed ?? (buffer.length >= 4 && buffer.readUInt32LE(0) === ZSTD_MAGIC);
	if (!compressed) return buffer.toString('utf8');
	const { frames, tornStart } = scanZstdFrames(buffer);
	const chunks = [];
	for (const { start, end } of frames) chunks.push(zstdDecompressSync(buffer.subarray(start, end)).toString('utf8'));
	// A torn final frame keeps whatever it durably holds only after repair; the
	// meter simply ignores it — spend of a torn tail is never billed to us yet.
	void tornStart;
	return chunks.join('');
}

/** Fast envelope probe: `{"type":"..."` at the very start of a line. */
const TYPE_PREFIX = /^\{"type":"([^"]+)"/;

/**
 * Fold one session log (JSONL text) into usage-per-model plus its header.
 *
 * Only four event types matter, so only those lines are fully parsed: `session`
 * (the header naming the session's working directory), `request/header` (the
 * billed `provider`/`model` in force from then on), `assistant/message` (whose
 * `usage` is the provider's exact accounting for that call), and
 * `session/end-seed`. Everything else — tool payloads, embedded model streams —
 * is skipped by the type probe alone, because those lines can themselves
 * contain `"usage":` fragments that a regex lift would misread.
 *
 * A `session/end-seed { inherited: true }` marker is a fork child's exact
 * inherited-prefix cut: usage before it belongs to the parent and must not be
 * counted twice, so the last tagged marker wins and everything before it is
 * dropped.
 *
 * @param text - decoded JSONL text of one session artifact.
 * @returns `{ header, byModel, byTurn, usageEvents }` where `byModel` maps model
 *   id to `{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
 *   calls }` and `byTurn` maps a turn number to that turn's per-model usage.
 */
export function foldSessionLog(text) {
	const lines = text.split('\n');
	let header = undefined;
	let currentModel = '(unknown model)';
	let inheritedCut = 0;
	/** @type {{ seq: number, turn: number | undefined, model: string, usage: object }[]} */
	const billed = [];
	for (const line of lines) {
		if (line === '') continue;
		const type = TYPE_PREFIX.exec(line)?.[1];
		if (type === undefined || type === 'session' || type === 'request/header' || type === 'session/end-seed' || type === 'assistant/message') {
			// Either an unusual envelope ordering or a fold-relevant type: parse.
			const event = JSON.parse(line);
			if (event.type === 'session') {
				header = event;
				continue;
			}
			if (event.type === 'session/end-seed') {
				if (event.data?.inherited === true && event.seq >= inheritedCut) inheritedCut = event.seq;
				continue;
			}
			if (event.type === 'request/header') {
				const config = event.data?.header?.config;
				if (config?.model) currentModel = String(config.model);
				continue;
			}
			if (event.type !== 'assistant/message') continue;
			const usage = event.data?.usage;
			if (!usage) continue;
			const turn = event.data?.turn;
			billed.push({
				seq: event.seq,
				turn: Number.isSafeInteger(turn) ? turn : undefined,
				model: currentModel,
				usage
			});
		}
	}
	// Fork children repeat their parent's event prefix verbatim; the tagged
	// end-seed marker is the exact cut, so anything below it is the parent's.
	const counted = billed.filter((entry) => entry.seq >= inheritedCut);
	const byModel = new Map();
	for (const { model, usage } of counted) {
		let entry = byModel.get(model);
		if (entry === undefined) {
			entry = {
				inputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
				calls: 0
			};
			byModel.set(model, entry);
		}
		entry.inputTokens += usage.inputTokens ?? 0;
		entry.outputTokens += usage.outputTokens ?? 0;
		entry.cacheReadTokens += usage.cacheReadTokens ?? 0;
		entry.cacheWriteTokens += usage.cacheWriteTokens ?? 0;
		entry.calls += 1;
	}
	// Per-turn usage deliberately ignores the fork cut: a chat renders the whole
	// transcript a child inherited, so every visible turn stays priceable there
	// too. Totals still come from `byModel`, which does apply the cut.
	const byTurn = new Map();
	for (const { turn, model, usage } of billed) {
		if (turn === undefined) continue;
		let models = byTurn.get(turn);
		if (models === undefined) {
			models = new Map();
			byTurn.set(turn, models);
		}
		let entry = models.get(model);
		if (entry === undefined) {
			entry = {
				inputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
				calls: 0
			};
			models.set(model, entry);
		}
		entry.inputTokens += usage.inputTokens ?? 0;
		entry.outputTokens += usage.outputTokens ?? 0;
		entry.cacheReadTokens += usage.cacheReadTokens ?? 0;
		entry.cacheWriteTokens += usage.cacheWriteTokens ?? 0;
		entry.calls += 1;
	}
	return {
		header: header ?? {},
		byModel,
		byTurn,
		usageEvents: counted.length
	};
}

/**
 * List every stored session artifact under a harness `sessions/` root.
 *
 * Layout: `<slug>/<session-id>/session.v3.jsonl.zstd` (`.jsonl` when the
 * backend stores uncompressed). The directory slug is not decoded — the
 * session header's `cwd` is the directory of record.
 *
 * @param sessionsRoot - `$DSH_HOME/sessions`.
 * @returns absolute artifact paths that exist right now.
 */
export async function listSessionArtifacts(sessionsRoot) {
	const paths = [];
	let buckets;
	try {
		buckets = await readdir(sessionsRoot, { withFileTypes: true });
	} catch (error) {
		if (error.code === 'ENOENT') return paths;
		throw error;
	}
	for (const bucket of buckets) {
		if (!bucket.isDirectory()) continue;
		const bucketDir = path.join(sessionsRoot, bucket.name);
		for (const session of await readdir(bucketDir, { withFileTypes: true })) {
			if (!session.isDirectory()) continue;
			const sessionDir = path.join(bucketDir, session.name);
			for (const artifact of await readdir(sessionDir, { withFileTypes: true })) {
				if (artifact.isDirectory()) continue;
				if (!/^session\..*\.jsonl(\.zstd)?$/.test(artifact.name)) continue;
				paths.push(path.join(sessionDir, artifact.name));
			}
		}
	}
	return paths.sort();
}

/**
 * Scan one session artifact: decode, fold, and attach file identity.
 *
 * @param artifactPath - absolute path of one session log.
 * @returns `{ path, size, mtime, ...fold }`; `size`/`mtime` key the caller's
 *   cache so unchanged artifacts are never rescanned.
 */
export async function scanSessionArtifact(artifactPath) {
	const stats = await stat(artifactPath);
	const buffer = await readFile(artifactPath);
	const fold = foldSessionLog(decodeLogText(buffer));
	return {
		path: artifactPath,
		size: stats.size,
		mtimeMs: stats.mtimeMs,
		sessionId: String(fold.header.id ?? path.basename(path.dirname(artifactPath))),
		cwd: fold.header.cwd,
		parentSession: fold.header.parentSession,
		byModel: fold.byModel,
		byTurn: fold.byTurn,
		usageEvents: fold.usageEvents
	};
}
