// Проверка нарезки и раскладки кеша без сети.
// Запуск: node test/cache.test.mjs

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sliceChapters } from "../lib/slice.mjs";
import { cachePaths, cacheStats, readDocs, readSections, writeCache } from "../lib/cache.mjs";

// llms-full.txt по структуре: четыре группы, главы с заголовком первого уровня.
// Заголовки "# ..." внутри ``` блоков главами не считаются — именно на этом
// ломался наивный парсер (13 «глав» из комментариев shell-скриптов).
const FULL = `# Start of Svelte documentation

# Overview

Intro of svelte.

# What are runes?

Runes intro.

\`\`\`sh
# Install a community addon-on
npx sv add my-addon
\`\`\`

Runes tail.

# Start of SvelteKit documentation

# Overview

Intro of kit.

# Routing

Routing text.

# Start of Svelte CLI documentation

# Overview

Intro of cli.

# Start of Svelte AI documentation

# Overview

Intro of ai.
`;

const SECTIONS = {
  "docs/svelte/overview": { slug: "docs/svelte/overview", metadata: { title: "Overview" } },
  "docs/svelte/what-are-runes": {
    slug: "docs/svelte/what-are-runes",
    metadata: { title: "What are runes?" },
  },
  "docs/kit/overview": { slug: "docs/kit/overview", metadata: { title: "Overview" } },
  "docs/kit/routing": { slug: "docs/kit/routing", metadata: { title: "Routing" } },
  "docs/cli/overview": { slug: "docs/cli/overview", metadata: { title: "Overview" } },
  "docs/ai/overview": { slug: "docs/ai/overview", metadata: { title: "Overview" } },
};

// 1. Одинаковые заголовки (Overview ×4) разбираются по группам и порядку.
{
  const { chapters, missing } = sliceChapters(SECTIONS, FULL);
  assert.equal(missing.length, 0, "все главы найдены");
  assert.equal(chapters.size, 6);
  assert.equal(chapters.get("docs/svelte/overview"), "Intro of svelte.");
  assert.equal(chapters.get("docs/kit/overview"), "Intro of kit.");
  assert.equal(chapters.get("docs/cli/overview"), "Intro of cli.");
  assert.equal(chapters.get("docs/ai/overview"), "Intro of ai.");
}

// 2. "# ..." внутри ``` — не глава: содержимое остаётся в своей главе.
{
  const { chapters } = sliceChapters(SECTIONS, FULL);
  const body = chapters.get("docs/svelte/what-are-runes");
  assert.ok(body.includes("# Install a community addon-on"), "код-блок внутри главы цел");
  assert.ok(body.includes("Runes tail."), "глава не оборвалась на код-блоке");
}

// 3. Секция, которой нет в файле, попадает в missing, а не теряется молча.
{
  const sections = {
    ...SECTIONS,
    "docs/kit/nowhere": { slug: "docs/kit/nowhere", metadata: { title: "Nowhere" } },
  };
  const { missing } = sliceChapters(sections, FULL);
  assert.deepEqual(missing, ["docs/kit/nowhere"]);
}

// 4. Раскладка кеша: каталог, глава по слагу, статистика.
{
  const root = mkdtempSync(join(tmpdir(), "svelte-mcp-local-"));
  try {
    const paths = cachePaths(root);
    writeCache(paths, SECTIONS, { "docs/svelte/what-are-runes": "Runes intro." });
    assert.equal(readDocs(paths)["docs/svelte/what-are-runes"], "Runes intro.");
    assert.deepEqual(Object.keys(readSections(paths)).length, 6);
    assert.equal(readDocs(paths)["docs/kit/routing"], undefined, "отсутствующей главы нет");

    const stats = cacheStats(paths);
    assert.equal(stats.ready, true);
    assert.equal(stats.sections, 6);
    assert.equal(stats.docs, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("svelte-mcp-local: ok");
