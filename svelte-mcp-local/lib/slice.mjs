// Нарезка llms-full.txt на главы по каталогу sections.json.
//
// llms-full.txt — вся документация одним файлом: четыре группы, помеченные
// "# Start of <Name> documentation", внутри группы главы, каждая с заголовком
// первого уровня. Каталог даёт слаги и порядок глав внутри группы, поэтому
// главы сопоставляются по порядку, а не поиском по всему файлу: заголовки
// не уникальны (Overview встречается четыре раза).

const GROUPS = {
  Svelte: "svelte",
  SvelteKit: "kit",
  "Svelte CLI": "cli",
  "Svelte AI": "ai",
};

// Заголовки внутри ``` / ```` блоков — это примеры кода, а не главы. Учитываем
// длину фенса: ```` (четыре бэктика) может содержать ``` (три) внутри.
function parseHeadings(full) {
  const heads = [];
  let fence = null;
  let pos = 0;
  for (const line of full.split("\n")) {
    const trimmed = line.trim();
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fenceMatch) {
      const f = fenceMatch[1];
      if (fence === null) fence = f;
      else if (f[0] === fence[0] && f.length >= fence.length) fence = null;
    } else if (fence === null && trimmed.startsWith("# ")) {
      heads.push({ start: pos, title: trimmed.slice(2).trim() });
    }
    pos += line.length + 1; // + "\n"
  }
  return heads;
}

function parseGroups(full) {
  const markers = [];
  const re = /^# Start of (.+?) documentation$/gm;
  for (let m = re.exec(full); m; m = re.exec(full)) {
    markers.push({ start: m.index, name: m[1] });
  }
  const bounds = markers.map((m) => m.start);
  bounds.push(full.length);
  return { markers, bounds };
}

// Метка для сравнения: разметка в заголовке каталога и в файле может
// отличаться (бэктики, `**`), но текст один и тот же.
function normalize(title) {
  return title
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Глава = текст после строки заголовка до следующего заголовка своей группы
// или до начала следующей группы.
function chapterBody(full, head, next, groupEnd) {
  const end = next === undefined ? groupEnd : Math.min(next, groupEnd);
  const slice = full.slice(head.start, end);
  const nl = slice.indexOf("\n");
  return nl === -1 ? "" : slice.slice(nl + 1).trim();
}

/**
 * Разложить llms-full.txt на главы по каталогу.
 *
 * @param sections Каталог как отдаёт сайт: { "docs/svelte/...": { slug, metadata } }.
 * @param full Текст llms-full.txt.
 * @returns {{ chapters: Map<string, string>, missing: string[] }} главы по слагу
 *   и секции каталога, которым не нашлось заголовка.
 */
export function sliceChapters(sections, full) {
  const { markers, bounds } = parseGroups(full);
  const heads = parseHeadings(full);
  const groupOf = (pos) => {
    for (let i = 0; i < markers.length; i++) {
      if (markers[i].start <= pos && pos < bounds[i + 1]) return markers[i].name;
    }
    return null;
  };

  // Секции каталога, сгруппированные так же, как группы файла.
  const byGroup = new Map();
  for (const [key, section] of Object.entries(sections)) {
    const prefix = key.split("/")[1];
    const group = Object.keys(GROUPS).find((g) => GROUPS[g] === prefix);
    if (!group) continue;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push({ slug: section.slug ?? key, title: section.metadata?.title ?? "" });
  }

  const chapters = new Map();
  const missing = [];
  for (const [group, list] of byGroup) {
    const index = markers.findIndex((m) => m.name === group);
    if (index === -1) {
      missing.push(...list.map((s) => s.slug));
      continue;
    }
    const groupEnd = bounds[index + 1];
    const own = heads.filter((h) => h.start >= markers[index].start && h.start < groupEnd);

    // Внутри группы порядок каталога и файла совпадает — идём вперёд.
    let cursor = 0;
    for (const section of list) {
      const wanted = normalize(section.title);
      let at = cursor;
      while (at < own.length && normalize(own[at].title) !== wanted) at++;
      if (at === own.length) {
        missing.push(section.slug);
        continue;
      }
      const next = own[at + 1]?.start;
      chapters.set(section.slug, chapterBody(full, own[at], next, groupEnd));
      cursor = at + 1;
    }
  }
  return { chapters, missing };
}

export const SECTIONS_URL = "https://svelte.dev/docs/experimental/sections.json";
export const FULL_URL = "https://svelte.dev/llms-full.txt";
