/**
 * Host-половина `dsh-plugin-showcase` — витрина плагинов DeepSeek Harness.
 *
 * Каталог берётся из снимка `lib/catalog.snapshot.json`, который собирает
 * `scripts/build-catalog.mjs` из awesome-списка Dominic789654/awesome-deepseek-harness.
 * Снимок лежит в пакете, поэтому витрина работает без сети.
 *
 * Роуты:
 *
 * - `GET  /api/plugin-showcase/catalog?page&perPage&q&category` — страница каталога;
 * - `GET  /api/plugin-showcase/installed` — что уже стоит в профиле;
 * - `GET  /api/plugin-showcase/stars?ids=a,b` — живые звёзды с GitHub (с кешем);
 * - `POST /api/plugin-showcase/install` `{id}` — `dsh plugin add`;
 * - `POST /api/plugin-showcase/remove` `{id}` — `dsh plugin remove`.
 *
 * Установка идёт той же командой, что человек набрал бы руками в терминале:
 * `dsh plugin --profile <профиль> add github:owner/repo`. Плагин импортирует
 * только `node:` — пакеты харнесса через симлинк недоступны.
 *
 * @module dsh-plugin-showcase
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Cordis-имя сервиса. */
export const name = 'plugin-showcase';

/** Нужен только веб-сервер: витрина — это страница и её роуты. */
export const inject = ['webServer'];

const BASE = '/api/plugin-showcase';
const CATALOG_PATH = `${BASE}/catalog`;
const INSTALLED_PATH = `${BASE}/installed`;
const STARS_PATH = `${BASE}/stars`;
const INSTALL_PATH = `${BASE}/install`;
const REMOVE_PATH = `${BASE}/remove`;

/** Сколько карточек на странице по умолчанию. */
const DEFAULT_PER_PAGE = 24;
const MAX_PER_PAGE = 60;

/** Сколько ждать одну установку, прежде чем сказать «не дождались». */
const INSTALL_TIMEOUT_MS = 180000;

/** Кеш звёзд живёт шесть часов: звёзды за час заметно не меняются. */
const STARS_TTL_MS = 6 * 3600 * 1000;

const PACKAGE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SNAPSHOT_PATH = path.join(PACKAGE_ROOT, 'lib', 'catalog.snapshot.json');

/** Ответ JSON с нужным кодом. */
function sendJson(res, status, payload) {
	res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify(payload));
}

/** Тело запроса как JSON; undefined — если это не JSON. */
async function readJsonBody(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	if (chunks.length === 0) return undefined;
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		return undefined;
	}
}

/** Где живёт профиль: `$DSH_HOME` или `~/.dsh`. */
function resolveDshHome() {
	const configured = process.env.DSH_HOME;
	if (configured !== undefined && configured !== '') return configured;
	return path.join(process.env.HOME ?? process.cwd(), '.dsh');
}

/**
 * Имя профиля, в котором поднят этот процесс: `--profile <name>` в argv.
 * Без флага харнесс грузит профиль `web`, он же и по умолчанию.
 */
function resolveProfileName() {
	const argv = process.argv;
	const at = argv.indexOf('--profile');
	if (at !== -1 && argv[at + 1] !== undefined && !argv[at + 1].startsWith('-')) return argv[at + 1];
	const inline = argv.find((value) => value.startsWith('--profile='));
	if (inline !== undefined) return inline.slice('--profile='.length);
	return 'web';
}

/** Версия снимка каталога: когда собран и сколько в нём записей. */
async function loadSnapshot() {
	const raw = await readFile(SNAPSHOT_PATH, 'utf8');
	return JSON.parse(raw);
}

/**
 * Поиск по каталогу: подстрока в имени, описании или владельце.
 *
 * @param entries записи снимка.
 * @param query строка поиска (регистр не важен).
 * @returns отфильтрованные записи в исходном порядке.
 */
export function searchEntries(entries, query) {
	const needle = query.trim().toLowerCase();
	if (needle === '') return entries;
	const words = needle.split(/\s+/);
	return entries.filter((entry) => {
		const haystack = `${entry.name} ${entry.repo ?? ''} ${entry.description} ${entry.category}`.toLowerCase();
		return words.every((word) => haystack.includes(word));
	});
}

/**
 * Одна страница каталога.
 *
 * @param catalog снимок целиком.
 * @param options page (с 1), perPage, q, category, sort (`stars` — по звёздам,
 *   иначе порядок awesome-списка).
 * @returns страница и общие счётчики.
 */
export function pageOf(catalog, options = {}) {
	const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
	const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Number.parseInt(options.perPage, 10) || DEFAULT_PER_PAGE));
	const category = options.category ?? '';

	let items = catalog.entries;
	if (category !== '') items = items.filter((entry) => entry.category === category);
	items = searchEntries(items, options.q ?? '');
	if (options.sort === 'stars') items = [...items].sort((a, b) => b.stars - a.stars);

	const total = items.length;
	const pages = Math.max(1, Math.ceil(total / perPage));
	const start = (page - 1) * perPage;
	return {
		page,
		perPage,
		pages,
		total,
		items: items.slice(start, start + perPage),
		categories: catalog.categories,
		builtAt: catalog.builtAt,
		source: catalog.source
	};
}

/**
 * Что уже установлено в профиле.
 *
 * Имя npm-пакета часто отличается от имени репозитория (`dsh-TUI` ставится как
 * `dsh-tui`), поэтому сопоставление идёт по полю `repository` самого пакета, а
 * при его отсутствии — по имени репозитория.
 *
 * @param home корень `$DSH_HOME`.
 * @param profile имя профиля.
 * @returns карта `<owner/repo>` в нижнем регистре → имя npm-пакета.
 */
export async function readInstalled(home, profile) {
	const dir = path.join(home, 'profiles', profile);
	const manifestPath = path.join(dir, 'package.json');
	const installed = new Map();

	let dependencies = {};
	try {
		const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
		dependencies = manifest.dependencies ?? {};
	} catch {
		return installed;
	}

	for (const [name, spec] of Object.entries(dependencies)) {
		// `github:owner/repo#main` в манифесте — самый быстрый путь.
		const specRepo = /github:([^/#]+)\/([^#/]+)/.exec(String(spec));
		if (specRepo) installed.set(`${specRepo[1]}/${specRepo[2]}`.toLowerCase(), name);

		try {
			const manifestOfPackage = JSON.parse(
				await readFile(path.join(dir, 'node_modules', name, 'package.json'), 'utf8'),
			);
			const repository = manifestOfPackage.repository;
			const url = typeof repository === 'string' ? repository : repository?.url;
			const repo = typeof url === 'string' ? /github\.com[/:]([^/#]+)\/([^/#.]+)/.exec(url) : null;
			if (repo) installed.set(`${repo[1]}/${repo[2]}`.toLowerCase(), name);
		} catch {
			/* пакета может не быть на диске — сопоставления по ссылке хватает */
		}
	}
	return installed;
}

/**
 * Запустить `dsh plugin …` тем же node, которым работает харнесс.
 *
 * @param home `$DSH_HOME` для дочернего процесса.
 * @param args аргументы после `plugin` (например `add github:owner/repo`).
 * @returns вывод и код возврата.
 */
function runDshPlugin(home, args) {
	return new Promise((resolve) => {
		const bin = process.argv[1];
		const child = spawn(process.execPath, [bin, 'plugin', ...args], {
			env: { ...process.env, DSH_HOME: home },
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let output = '';
		child.stdout.on('data', (chunk) => (output += chunk));
		child.stderr.on('data', (chunk) => (output += chunk));

		const timer = setTimeout(() => {
			child.kill('SIGTERM');
			resolve({ code: null, output: `${output}\nпревышено время ожидания (${INSTALL_TIMEOUT_MS} мс)` });
		}, INSTALL_TIMEOUT_MS);

		child.on('error', (error) => {
			clearTimeout(timer);
			resolve({ code: null, output: `${output}\n${error.message}` });
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ code, output: output.trim() });
		});
	});
}

/**
 * Живые звёзды с GitHub через shields.io (свой кеш в `$DSH_HOME`).
 *
 * Снимок каталога содержит звёзды только у части записей: awesome-список
 * хранит их нерегулярно. Витрина дозапрашивает актуальные для видимой страницы
 * и запоминает их на шесть часов.
 */
class StarCache {
	constructor(home) {
		this.file = path.join(home, 'plugin-showcase-stars.json');
		this.entries = new Map();
		this.loaded = false;
		this.pending = new Map();
	}

	async load() {
		if (this.loaded) return;
		this.loaded = true;
		try {
			const raw = JSON.parse(await readFile(this.file, 'utf8'));
			for (const [repo, value] of Object.entries(raw)) this.entries.set(repo, value);
		} catch {
			/* кеша ещё нет */
		}
	}

	/** Свежая запись кеша или undefined. */
	fresh(repo) {
		const hit = this.entries.get(repo);
		return hit !== undefined && Date.now() - hit.at < STARS_TTL_MS ? hit.stars : undefined;
	}

	async save() {
		try {
			await mkdir(path.dirname(this.file), { recursive: true });
			await writeFile(this.file, JSON.stringify(Object.fromEntries(this.entries)));
		} catch {
			/* кеш — не ценность, ради которой стоит падать */
		}
	}

	/** Одна сеть-попытка; `null` — не получилось. */
	async fetchOne(repo) {
		try {
			const response = await fetch(`https://img.shields.io/github/stars/${repo}.json`, {
				headers: { 'user-agent': 'dsh-plugin-showcase' },
				signal: AbortSignal.timeout(12000)
			});
			if (!response.ok) return null;
			const payload = await response.json();
			const raw = String(payload?.message ?? '');
			const match = /^([\d.]+)\s*([kK])?$/.exec(raw);
			if (!match) return null;
			const value = Number.parseFloat(match[1]);
			if (!Number.isFinite(value)) return null;
			const stars = Math.round(match[2] ? value * 1000 : value);
			this.entries.set(repo, { stars, at: Date.now() });
			return stars;
		} catch {
			return null;
		}
	}

	/**
	 * Звёзды для набора репозиториев: из кеша, недостающие — из сети.
	 * @returns карта repo → звёзды (только то, что удалось узнать).
	 */
	async get(repos) {
		await this.load();
		const result = {};
		const missing = [];
		for (const repo of repos) {
			const cached = this.fresh(repo);
			if (cached !== undefined) result[repo] = cached;
			else missing.push(repo);
		}

		// Замерено: 12 параллельных запросов дают ~13.6 шт/с без единого отказа,
		// на больших залпах shields.io начинает отвечать 403.
		const queue = [...missing];
		const workers = Array.from({ length: Math.min(12, queue.length) }, async () => {
			while (queue.length > 0) {
				const repo = queue.shift();
				const inflight = this.pending.get(repo);
				if (inflight !== undefined) {
					const stars = await inflight;
					if (stars !== null) result[repo] = stars;
					continue;
				}
				const promise = this.fetchOne(repo);
				this.pending.set(repo, promise);
				const stars = await promise;
				this.pending.delete(repo);
				if (stars !== null) result[repo] = stars;
			}
		});
		await Promise.all(workers);
		if (missing.length > 0) await this.save();
		return result;
	}
}

/**
 * Точка входа Cordis.
 *
 * @param ctx хост-контекст с `webServer`.
 * @param config конфиг из патча: `{ profile?: string }`.
 */
export function apply(ctx, config = {}) {
	const home = resolveDshHome();
	const profile = config.profile ?? resolveProfileName();
	const stars = new StarCache(home);

	let snapshot;
	const catalog = async () => {
		snapshot ??= await loadSnapshot();
		return snapshot;
	};

	const catalogHandler = async (req, res) => {
		try {
			const url = new URL(req.url, 'http://x');
			const data = pageOf(await catalog(), {
				page: url.searchParams.get('page') ?? 1,
				perPage: url.searchParams.get('perPage') ?? DEFAULT_PER_PAGE,
				q: url.searchParams.get('q') ?? '',
				category: url.searchParams.get('category') ?? '',
				sort: url.searchParams.get('sort') ?? ''
			});
			const installed = await readInstalled(home, profile);
			data.items = data.items.map((entry) => ({
				...entry,
				installed: entry.repo === null ? false : installed.has(entry.repo.toLowerCase()),
				packageName: entry.repo === null ? null : installed.get(entry.repo.toLowerCase()) ?? null
			}));
			data.profile = profile;
			sendJson(res, 200, data);
		} catch (error) {
			ctx.logger?.error?.(error);
			sendJson(res, 500, { error: `каталог недоступен: ${error?.message ?? error}` });
		}
	};

	const installedHandler = async (req, res) => {
		try {
			const installed = await readInstalled(home, profile);
			sendJson(res, 200, { profile, installed: Object.fromEntries(installed) });
		} catch (error) {
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	const starsHandler = async (req, res) => {
		try {
			const url = new URL(req.url, 'http://x');
			const repos = (url.searchParams.get('ids') ?? '')
				.split(',')
				.map((value) => value.trim())
				.filter((value) => /^[^/]+\/[^/]+$/.test(value));
			if (repos.length === 0) {
				sendJson(res, 200, { stars: {} });
				return;
			}
			sendJson(res, 200, { stars: await stars.get(repos.slice(0, MAX_PER_PAGE)) });
		} catch (error) {
			sendJson(res, 500, { error: String(error?.message ?? error) });
		}
	};

	const mutate = async (req, res, mode) => {
		const body = await readJsonBody(req);
		const id = typeof body?.id === 'string' ? body.id : '';
		if (id === '') {
			sendJson(res, 400, { error: 'не передан id записи' });
			return;
		}
		const data = await catalog().catch(() => undefined);
		const entry = data?.entries.find((candidate) => candidate.id === id);
		if (entry === undefined) {
			sendJson(res, 404, { error: `нет записи «${id}»` });
			return;
		}
		if (entry.repo === null) {
			sendJson(res, 400, { error: 'у записи нет GitHub-репозитория — ставить нечего' });
			return;
		}
		if (!entry.installable) {
			sendJson(res, 400, { error: `категория «${entry.category}» — не плагин` });
			return;
		}

		const installed = await readInstalled(home, profile);
		const packageName = installed.get(entry.repo.toLowerCase());

		if (mode === 'install' && packageName !== undefined) {
			sendJson(res, 200, { ok: true, changed: false, packageName, output: `уже установлен как ${packageName}` });
			return;
		}
		if (mode === 'remove' && packageName === undefined) {
			sendJson(res, 200, { ok: true, changed: false, packageName: null, output: 'не установлен' });
			return;
		}

		const args =
			mode === 'install'
				? ['--profile', profile, 'add', `github:${entry.repo}`]
				: ['--profile', profile, 'remove', packageName];
		const result = await runDshPlugin(home, args);
		const ok = result.code === 0;
		sendJson(res, ok ? 200 : 500, {
			ok,
			changed: ok,
			packageName: mode === 'install' ? (ok ? (await readInstalled(home, profile)).get(entry.repo.toLowerCase()) ?? null : null) : packageName,
			output: result.output,
			restartRequired: ok
		});
	};

	const installHandler = (req, res) => mutate(req, res, 'install');
	const removeHandler = (req, res) => mutate(req, res, 'remove');

	ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: CATALOG_PATH, handler: catalogHandler }), 'plugin-showcase: catalog route');
	ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: INSTALLED_PATH, handler: installedHandler }), 'plugin-showcase: installed route');
	ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: STARS_PATH, handler: starsHandler }), 'plugin-showcase: stars route');
	ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: INSTALL_PATH, handler: installHandler }), 'plugin-showcase: install route');
	ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: REMOVE_PATH, handler: removeHandler }), 'plugin-showcase: remove route');
}
