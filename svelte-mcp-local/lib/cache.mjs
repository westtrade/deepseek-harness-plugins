// Локальный кеш документации: чтение и запись.
//
// Кеш — два файла в каталоге пакета (cache/): sections.json с каталогом и
// docs.json с текстами глав по слагам. Снимок при сборке лежит там же, поэтому
// сервер работает офлайн сразу, без первого похода в сеть.

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function cachePaths(root = PACKAGE_ROOT) {
  const dir = join(root, "cache");
  return {
    dir,
    sections: join(dir, "sections.json"),
    docs: join(dir, "docs.json"),
  };
}

function readJson(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function readSections(paths) {
  return readJson(paths.sections);
}

export function readDocs(paths) {
  return readJson(paths.docs) ?? {};
}

export function writeCache(paths, sections, docs) {
  rmSync(paths.dir, { recursive: true, force: true });
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.sections, JSON.stringify(sections) + "\n");
  writeFileSync(paths.docs, JSON.stringify(docs) + "\n");
}

// Сколько глав в кеше и сколько они занимают.
export function cacheStats(paths) {
  const sections = readSections(paths);
  if (!sections) return { ready: false, sections: 0, docs: 0, bytes: 0 };
  const docs = readDocs(paths);
  let bytes = 0;
  let found = 0;
  for (const slug of Object.keys(sections)) {
    const body = docs[slug];
    if (typeof body === "string") {
      found++;
      bytes += Buffer.byteLength(body);
    }
  }
  return { ready: found > 0, sections: Object.keys(sections).length, docs: found, bytes };
}
