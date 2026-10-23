/**
 * Собирает каталог витрины из awesome-списка DeepSeek Harness.
 *
 * Источник — README.md и .stars-snapshot.tsv репозитория
 * Dominic789654/awesome-deepseek-harness. Разбор идёт по строкам списка:
 *
 *     - [owner/repo](https://github.com/owner/repo) — Описание.
 *     - [Сайт](https://site.example) · [owner/repo](…) — Описание.
 *
 * Заголовки `## …` задают категорию. Хвост со звёздами (`⭐123`) в описание не
 * попадает.
 *
 * Запуск:
 *   node scripts/build-catalog.mjs              # обновить снимок
 *   node scripts/build-catalog.mjs --dry-run    # только посчитать
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE_REPO = 'Dominic789654/awesome-deepseek-harness';
const SOURCE_URL = `https://github.com/${SOURCE_REPO}`;
const RAW = `https://raw.githubusercontent.com/${SOURCE_REPO}/main`;
const OUT = fileURLToPath(new URL('../lib/catalog.snapshot.json', import.meta.url));

/** Сколько символов описания хранить: в карточке всё равно видно две строки. */
const DESCRIPTION_LIMIT = 220;

/** Строка списка: `- [текст](url) — описание`. */
const ENTRY = /^- \[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*(?:—|–|-)\s*(.+)$/;

/**
 * Строка с ведущей ссылкой на сайт: `- [Сайт](…) · [owner/repo](github…) — …`.
 * Группы те же и в том же порядке: имя, url, описание.
 */
const ENTRY_WITH_LEADING_LINK = /^- \[[^\]]+\]\(https?:\/\/[^)]+\)\s*·\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*(?:—|–|-)\s*(.+)$/;

/** GitHub-репозиторий: https://github.com/<owner>/<repo>, без хвостов. */
const REPO_URL = /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/;

/** Категории, которые не являются плагинами: их показываем, но ставить нельзя. */
const NOT_INSTALLABLE = new Set(['Resources', 'Contents', 'Contributing', 'Star History', 'License']);

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

/** `⭐123`, `⭐1.2k`, `⭐45 · Team pick …` → число звёзд или 0. */
function starCount(text) {
  const match = /⭐\s*([\d.]+)\s*([kK]?)/.exec(text);
  if (!match) return 0;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return 0;
  return Math.round(match[2] ? value * 1000 : value);
}

/** Убирает из описания хвост со звёздами и служебные пометки-team pick. */
function cleanDescription(text) {
  return text
    .replace(/\s*`?⭐[^`·]*`?/g, ' ')
    .replace(/\s*·\s*Team pick[^·]*/gi, ' ')
    .replace(/\s*·\s*\[post\]\([^)]*\)/gi, ' ')
    .replace(/\s*·\s*\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Снимок звёзд: `<owner>/<repo>\t<stars>\t<date>`. */
function parseStars(tsv) {
  const stars = new Map();
  for (const line of tsv.split('\n')) {
    const [repo, count] = line.split('\t');
    if (!repo || repo.startsWith('#') || !/^\d+$/.test(count ?? '')) continue;
    stars.set(repo.trim().toLowerCase(), Number(count));
  }
  return stars;
}

/**
 * Разобрать README в записи каталога.
 *
 * @param readme текст README.md.
 * @param stars снимок звёзд.
 * @returns {{ entries: object[], categories: string[] }} записи в порядке файла.
 */
export function parseCatalog(readme, stars = new Map()) {
  const entries = [];
  const categories = [];
  const seen = new Set();
  // Записи до первого `##` — блок «Recently added» из шапки README.
  let category = 'Recently added';

  for (const line of readme.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      category = heading[1];
      continue;
    }
    if (!line.startsWith('- [')) continue;

    // Обе формы несут группы в одном порядке: имя, url, описание.
    const match = ENTRY_WITH_LEADING_LINK.exec(line) ?? ENTRY.exec(line);
    if (!match) continue;

    const [, name, url, rawDescription] = match;
    const description = cleanDescription(rawDescription).slice(0, DESCRIPTION_LIMIT);
    if (description === '') continue;

    const repo = REPO_URL.exec(url);
    const key = repo ? `${repo[1]}/${repo[2]}`.toLowerCase() : url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (!categories.includes(category)) categories.push(category);

    entries.push({
      id: key,
      name: name.trim(),
      url: url.trim(),
      description,
      category,
      repo: repo ? `${repo[1]}/${repo[2]}` : null,
      owner: repo ? repo[1] : null,
      stars: repo ? (stars.get(key) ?? starCount(line)) : 0,
      installable: repo !== null && !NOT_INSTALLABLE.has(category)
    });
  }

  return { entries, categories };
}

// Скрипт импортируется тестом ради parseCatalog, поэтому сборка запускается
// только при прямом вызове.
const runDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

async function main() {
	const dryRun = process.argv.includes('--dry-run');

	console.log(`Скачиваю README из ${SOURCE_REPO}`);
	const readme = await get(`${RAW}/README.md`);
	console.log('Скачиваю снимок звёзд');
	const starsTsv = await get(`${RAW}/.stars-snapshot.tsv`).catch(() => '');

	const stars = parseStars(starsTsv);
	const { entries, categories } = parseCatalog(readme, stars);

	const installable = entries.filter((entry) => entry.installable).length;
	const withStars = entries.filter((entry) => entry.stars > 0).length;
	console.log(
		`Записей: ${entries.length} (ставимых: ${installable}), категорий: ${categories.length}, со звёздами: ${withStars}`,
	);

	if (dryRun) return;

	const snapshot = { source: SOURCE_URL, builtAt: new Date().toISOString(), categories, entries };
	await writeFile(OUT, JSON.stringify(snapshot) + '\n');
	console.log(`Записано: ${OUT}`);
}

if (runDirectly) await main();
