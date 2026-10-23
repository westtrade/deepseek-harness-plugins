/**
 * Разбор awesome-списка и постраничная выдача — без сети.
 * Запуск: `node scripts/catalog-test.mjs`
 */

import { parseCatalog } from './build-catalog.mjs';

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

const README = `# Awesome DeepSeek Harness

## Contents

- [Security](#security)

## Security

_Permission rules._

- [7gzgn/dsh-leak-guard](https://github.com/7gzgn/dsh-leak-guard) — Pre-publish credential leak scan.  \`⭐12\`
- [lloydzhou/dsh-bash-guard](https://github.com/lloydzhou/dsh-bash-guard) — Bash guard with scope-based permissions and native inline controls.

## Visualization

- [dshfind](https://dshfind.com/) · [hikariming/dshfind](https://github.com/hikariming/dshfind) — Learning site plus a marketplace.  \`⭐280\`
- [Anionex/dsh-vision-toolkit](https://github.com/Anionex/dsh-vision-toolkit) — Vision toolkit for image understanding.  \`⭐45\` · Team pick 2026-09-26 · [post](https://x.com/tianyi/status/1)

## Resources

- [awesome-dsh-plugin](https://awesome-dsh-plugin.com/) · [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — Curated directory.
`;

// 1. Разбор: категории, имена, слаг репозитория, дубликаты.
{
	const { entries, categories } = parseCatalog(README);
	ok('категорий три (Contents не считается пустым)', categories.length === 3, JSON.stringify(categories));
	ok('записей пять', entries.length === 5, String(entries.length));

	const leak = entries.find((entry) => entry.id === '7gzgn/dsh-leak-guard');
	ok('репозиторий разобран', leak.repo === '7gzgn/dsh-leak-guard', leak.repo);
	ok('владелец для картинки', leak.owner === '7gzgn', leak.owner);
	ok('категория проставлена', leak.category === 'Security', leak.category);
	ok('ставимый', leak.installable === true);
	ok('звёзды из строки', leak.stars === 12, String(leak.stars));
	ok('звёзды вырезаны из описания', !leak.description.includes('⭐'), leak.description);
	ok('Team pick вырезан', !entries.find((entry) => entry.id === 'anionex/dsh-vision-toolkit').description.includes('Team pick'));
}

// 2. Строка с ведущей ссылкой на сайт: берётся GitHub-ссылка, а не сайт.
{
	const { entries } = parseCatalog(README);
	const find = entries.find((entry) => entry.id === 'hikariming/dshfind');
	ok('ведущая ссылка: репозиторий взят из второй ссылки', find?.repo === 'hikariming/dshfind', find?.repo);
	ok('ведущая ссылка: url — GitHub', find?.url.startsWith('https://github.com/'), find?.url);
}

// 3. Записи без GitHub-репозитория непроставляемы.
{
	const { entries } = parseCatalog(README);
	const resource = entries.find((entry) => entry.id === 'awesome-dsh-plugin/awesome-dsh-plugin');
	ok('Resources не ставится', resource?.installable === false, String(resource?.installable));
}

// 4. Снимок звёзд перекрывает строку.
{
	const stars = new Map([['7gzgn/dsh-leak-guard', 999]]);
	const { entries } = parseCatalog(README, stars);
	ok('звёзды из снимка', entries.find((entry) => entry.id === '7gzgn/dsh-leak-guard').stars === 999);
}

// 5. Повторы одного репозитория схлопываются.
{
	const twice = README + '\n## Coding\n\n- [7gzgn/dsh-leak-guard](https://github.com/7gzgn/dsh-leak-guard) — Duplicate entry.\n';
	const { entries } = parseCatalog(twice);
	ok('дубликат схлопнут', entries.filter((entry) => entry.id === '7gzgn/dsh-leak-guard').length === 1);
}

console.log(`catalog: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
