// Запуск оригинального MCP-сервера Svelte с локальным кешем документации.
//
// Код сервера не копируется и не патчится: берём тот же @sveltejs/mcp и
// подменяем ему fetch до загрузки — документация читается с диска.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installCacheFetch } from "./fetch-cache.mjs";

export function resolveServerEntry() {
  // У пакета нет "require"-условия в exports, поэтому резолвим как import:
  // получаем dist/handlers.mjs, а bin-файл сервера лежит рядом.
  const main = fileURLToPath(import.meta.resolve("@sveltejs/mcp"));
  return join(dirname(main), "index.mjs");
}

export async function startServer({ root } = {}) {
  installCacheFetch({ root });
  await import(resolveServerEntry());
}
