// Подмена fetch для @sveltejs/mcp: документация отдаётся из кеша.
//
// Оригинальный сервер качает sections.json при каждом list-sections и
// llms.txt при каждом get-documentation. Подменяем ровно эти два вида
// запросов; с svelte-autofixer и playground-link сеть не связана.
//
// Промах кеша уходит в сеть — сервер продолжает работать на свежих данных,
// а не падает, как падал при недоступном сайте.

import { cachePaths, readDocs, readSections } from "./cache.mjs";

export function installCacheFetch({ root } = {}) {
  const paths = cachePaths(root);
  const original = globalThis.fetch;
  const sections = readSections(paths);
  const docs = readDocs(paths);

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);

    if (url.endsWith("/docs/experimental/sections.json") && sections) {
      return textResponse(JSON.stringify(sections), "application/json");
    }

    const doc = /^https:\/\/svelte\.dev\/(.+)\/llms\.txt$/.exec(url);
    if (doc && typeof docs[doc[1]] === "string") {
      return textResponse(docs[doc[1]], "text/plain");
    }

    return original(input, init);
  };

  return { restore: () => (globalThis.fetch = original) };
}

function textResponse(text, contentType) {
  return new Response(text, { status: 200, headers: { "content-type": contentType } });
}
