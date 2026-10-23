#!/usr/bin/env node
// svelte-mcp-local — MCP-сервер документации Svelte с локальным кешем.
//
//   svelte-mcp-local            запустить сервер (его вызывает MCP-клиент)
//   svelte-mcp-local update     обновить кеш из сети
//   svelte-mcp-local status     показать состояние кеша
//
// Без аргументов работает как обычный stdio-MCP, поэтому в конфиге клиента
// достаточно указать этот файл.

import { PACKAGE_ROOT, cachePaths, cacheStats } from "../lib/cache.mjs";
import { updateCache } from "../lib/update.mjs";
import { startServer } from "../lib/server.mjs";

const command = process.argv[2];

if (command === "update") {
  const paths = cachePaths(PACKAGE_ROOT);
  try {
    const result = await updateCache({ log: (m) => console.error(m), root: PACKAGE_ROOT });
    console.log(
      `Кеш обновлён: ${result.chapters}/${result.sections} глав, ` +
        `${(result.bytes / 1024).toFixed(0)} КБ` +
        (result.fetched.length ? `, докачано отдельно: ${result.fetched.length}` : "") +
        (result.empty.length ? `, пустых: ${result.empty.length}` : ""),
    );
    process.exit(result.empty.length ? 1 : 0);
  } catch (e) {
    console.error(`Обновление не удалось: ${e.message}`);
    console.error(`Старый кеш в ${paths.dir} не тронут.`);
    process.exit(1);
  }
}

if (command === "status") {
  const stats = cacheStats(cachePaths(PACKAGE_ROOT));
  if (!stats.ready) {
    console.log("Кеш пуст — запустите: svelte-mcp-local update");
    process.exit(1);
  }
  console.log(
    `Кеш: ${stats.docs}/${stats.sections} глав, ${(stats.bytes / 1024).toFixed(0)} КБ, ${PACKAGE_ROOT}/cache`,
  );
  process.exit(0);
}

if (command && command !== "serve") {
  console.error(`Неизвестная команда: ${command}`);
  console.error("Доступно: update, status (без аргументов — запуск сервера)");
  process.exit(2);
}

// stdio: stdout принадлежит протоколу, поэтому сообщения уходят в stderr.
const stats = cacheStats(cachePaths(PACKAGE_ROOT));
if (!stats.ready) {
  console.error("svelte-mcp-local: кеш пуст, документация будет качаться из сети");
} else if (stats.docs < stats.sections) {
  console.error(
    `svelte-mcp-local: в кеше ${stats.docs} из ${stats.sections} глав, остальные — из сети`,
  );
}
await startServer({ root: PACKAGE_ROOT });
