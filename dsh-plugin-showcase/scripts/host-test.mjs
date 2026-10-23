/**
 * Host-проверки витрины: роуты, пагинация, чтение установленного и запуск
 * `dsh plugin`. Сеть не нужна: звёзды и установка подменены.
 *
 * Запуск: `node scripts/host-test.mjs`
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { apply, pageOf, readInstalled, searchEntries } from '../lib/index.js';

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

const CATALOG = {
	source: 'https://github.com/Dominic789654/awesome-deepseek-harness',
	builtAt: '2026-10-23T00:00:00.000Z',
	categories: ['Coding', 'Security'],
	entries: [
		{ id: 'a/one', name: 'a/one', url: 'https://github.com/a/one', description: 'Первый плагин', category: 'Coding', repo: 'a/one', owner: 'a', stars: 10, installable: true },
		{ id: 'b/two', name: 'b/two', url: 'https://github.com/b/two', description: 'Второй плагин', category: 'Security', repo: 'b/two', owner: 'b', stars: 0, installable: true },
		{ id: 'c/three', name: 'c/three', url: 'https://github.com/c/three', description: 'Третий, про кодинг', category: 'Coding', repo: 'c/three', owner: 'c', stars: 500, installable: true },
		{ id: 'd/site', name: 'd/site', url: 'https://site.example', description: 'Сайт, не плагин', category: 'Security', repo: null, owner: null, stars: 0, installable: false }
	]
};

// 1. Пагинация: страницы, счётчики, границы.
{
	const first = pageOf(CATALOG, { perPage: 2, page: 1 });
	ok('страниц две', first.pages === 2, String(first.pages));
	ok('всего четыре', first.total === 4);
	ok('на первой странице две записи', first.items.length === 2);
	const second = pageOf(CATALOG, { perPage: 2, page: 2 });
	ok('вторая страница не пуста', second.items.length === 2);
	ok('страницы не пересекаются', second.items[0].id === 'c/three', second.items[0].id);
	const beyond = pageOf(CATALOG, { perPage: 2, page: 99 });
	ok('за последней страницей пусто', beyond.items.length === 0);
	ok('page приводится к последней? нет — остаётся как просили', beyond.page === 99);
}

// 2. Поиск: по имени, описанию, владельцу; несколько слов — все должны найтись.
{
	ok('поиск по описанию', searchEntries(CATALOG.entries, 'кодинг').length === 1);
	ok('поиск по владельцу', searchEntries(CATALOG.entries, 'b/two').length === 1);
	ok('два слова сужают', searchEntries(CATALOG.entries, 'третий кодинг').length === 1);
	ok('пустой запрос — всё', searchEntries(CATALOG.entries, '   ').length === 4);
	ok('нет совпадений — пусто', searchEntries(CATALOG.entries, 'неттакого').length === 0);
}

// 3. Категория и сортировка.
{
	const coding = pageOf(CATALOG, { category: 'Coding' });
	ok('фильтр по категории', coding.total === 2, String(coding.total));
	const byStars = pageOf(CATALOG, { sort: 'stars' });
	ok('сортировка по звёздам', byStars.items[0].id === 'c/three', byStars.items[0].id);
	ok('категория + поиск вместе', pageOf(CATALOG, { category: 'Coding', q: 'второй' }).total === 0);
}

// 4. readInstalled: имя пакета из манифеста и из repository пакета.
{
	const home = await mkdtemp(path.join(tmpdir(), 'showcase-home-'));
	try {
		const dir = path.join(home, 'profiles', 'web');
		await mkdir(path.join(dir, 'node_modules', 'dsh-tui'), { recursive: true });
		await mkdir(path.join(dir, 'node_modules', 'renamed-pkg'), { recursive: true });
		await writeFile(path.join(dir, 'package.json'), JSON.stringify({
			dependencies: {
				'dsh-tui': 'github:ccch1mneyyy/dsh-TUI',
				'renamed-pkg': '^1.0.0'
			}
		}));
		await writeFile(path.join(dir, 'node_modules', 'dsh-tui', 'package.json'), JSON.stringify({ name: 'dsh-tui' }));
		await writeFile(path.join(dir, 'node_modules', 'renamed-pkg', 'package.json'), JSON.stringify({
			name: 'renamed-pkg',
			repository: { type: 'git', url: 'git+https://github.com/omdsh-dev/dsh-at-file.git' }
		}));

		const installed = await readInstalled(home, 'web');
		ok('github-спека в манифесте', installed.get('ccch1mneyyy/dsh-tui') === 'dsh-tui', String(installed.get('ccch1mneyyy/dsh-tui')));
		ok('имя пакета из repository', installed.get('omdsh-dev/dsh-at-file') === 'renamed-pkg', String(installed.get('omdsh-dev/dsh-at-file')));

		const missing = await readInstalled(home, 'nope');
		ok('несуществующий профиль — пусто', missing.size === 0);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
}

// 5. Роуты через фейковый хост: каталог отдаёт установленность, POST без id — 400.
{
	const home = await mkdtemp(path.join(tmpdir(), 'showcase-routes-'));
	const routes = new Map();
	const effects = [];
	const ctx = {
		logger: { error: () => {}, warn: () => {} },
		webServer: { register: (route) => (routes.set(route.path, route.handler), () => routes.delete(route.path)) },
		// Cordis запускает эффект сразу и хранит его disposer.
		effect: (fn) => {
			const dispose = fn();
			effects.push(typeof dispose === 'function' ? dispose : () => {});
			return dispose;
		}
	};
	const previousHome = process.env.DSH_HOME;
	process.env.DSH_HOME = home;
	try {
		apply(ctx, { profile: 'web' });
		ok('пять роутов', routes.size === 5, String(routes.size));
		for (const route of ['catalog', 'installed', 'stars', 'install', 'remove']) {
			ok(`роут ${route}`, routes.has(`/api/plugin-showcase/${route}`));
		}

		/** Ответ роута, собранный из поддельных req/res. */
		const call = (path, method, body, query = '') =>
			new Promise((resolve) => {
				const handler = routes.get(path);
				const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
				req.method = method;
				req.url = path + query;
				const res = {
					writeHead: (status) => (res.status = status),
					end: (payload) => resolve({ status: res.status, body: JSON.parse(payload) }),
				};
				Promise.resolve(handler(req, res));
			});

		const catalog = await call('/api/plugin-showcase/catalog', 'GET', undefined, '?perPage=2');
		ok('каталог отвечает 200', catalog.status === 200, String(catalog.status));
		ok('каталог знает профиль', catalog.body.profile === 'web', catalog.body.profile);
		ok('installable донесён', catalog.body.items[0].installable === true);
		ok('installed по умолчанию false', catalog.body.items[0].installed === false);

		const noId = await call('/api/plugin-showcase/install', 'POST', {});
		ok('POST без id — 400', noId.status === 400, String(noId.status));
		const unknown = await call('/api/plugin-showcase/install', 'POST', { id: 'zzz/none' });
		ok('неизвестная запись — 404', unknown.status === 404, String(unknown.status));

		const stars = await call('/api/plugin-showcase/stars', 'GET', undefined, '?ids=');
		ok('пустой ids — пустая карта', Object.keys(stars.body.stars).length === 0);
	} finally {
		if (previousHome === undefined) delete process.env.DSH_HOME;
		else process.env.DSH_HOME = previousHome;
		await rm(home, { recursive: true, force: true });
	}
}

console.log(`host: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
