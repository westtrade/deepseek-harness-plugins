// Обновление кеша: скачать два файла и разложить главы по каталогу.
//
// Два запроса вместо двухсот трёх: sections.json — каталог (19 КБ),
// llms-full.txt — вся документация (1.26 МБ).

import { FULL_URL, SECTIONS_URL, sliceChapters } from "./slice.mjs";
import { cachePaths, writeCache } from "./cache.mjs";

// Соединение с сайтом периодически не укладывается в таймаут — повторяем.
async function get(url, { timeoutMs = 60000, attempts = 4 } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return res;
    } catch (e) {
      last = e;
      if (i < attempts) await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  throw last;
}

/**
 * Обновить кеш целиком.
 *
 * @param options.log куда писать прогресс.
 * @param options.root каталог пакета (по умолчанию — этот пакет).
 * @returns сводка: сколько глав записано и что пришлось докачивать отдельно.
 */
export async function updateCache({ log = () => {}, root } = {}) {
  const paths = cachePaths(root);

  log(`Скачиваю ${SECTIONS_URL}`);
  const sections = await (await get(SECTIONS_URL)).json();
  log(`Скачиваю ${FULL_URL}`);
  const full = await (await get(FULL_URL)).text();

  const { chapters, missing } = sliceChapters(sections, full);
  log(`Нарезано глав: ${chapters.size} из ${Object.keys(sections).length}`);

  // Глава без заголовка в llms-full: дотягиваем отдельным запросом, иначе в
  // кеше осталась бы дыра, заметная только при запросе этой главы.
  const fetched = [];
  for (const slug of missing) {
    try {
      chapters.set(slug, (await (await get(`https://svelte.dev/${slug}/llms.txt`, { timeoutMs: 30000 })).text()).trim());
      fetched.push(slug);
    } catch (e) {
      log(`не удалось докачать ${slug}: ${e.message}`);
    }
  }
  if (fetched.length) log(`Докачано отдельно: ${fetched.length}`);

  const docs = Object.fromEntries(chapters);
  writeCache(paths, sections, docs);

  const empty = Object.entries(docs)
    .filter(([, body]) => !body)
    .map(([slug]) => slug);
  const bytes = Object.values(docs).reduce((sum, body) => sum + Buffer.byteLength(body), 0);
  return { sections: Object.keys(sections).length, chapters: chapters.size, fetched, empty, bytes };
}
