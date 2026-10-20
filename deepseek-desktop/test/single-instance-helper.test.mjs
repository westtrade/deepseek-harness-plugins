// Проверка single-instance.cjs: несколько «запусков» на одном сокете.
// Запуск: node test/single-instance-helper.test.mjs
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("../extensions/single-instance.cjs", import.meta.url));
const dir = join(tmpdir(), `dsh-si-${process.pid}`);
const sock = join(dir, "app.sock");
const notify = join(dir, "notify");
const result = join(dir, "result");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

// Приложение, чью жизнь держатель обязан отслеживать: это сам тест.
const appPid = process.pid;

function probe() {
  try {
    return execFileSync(
      process.execPath,
      [helper, "probe", sock, notify, String(appPid), result],
      { timeout: 20000, encoding: "utf8" },
    ).trim();
  } catch (err) {
    return `ERROR:${err.stdout || err.message}`;
  }
}

const first = probe();
assert.match(first, /^PRIMARY:\d+$/, `первый запуск должен стать основным, получили: ${first}`);

const second = probe();
assert.equal(second, "SECONDARY", "второй запуск должен уступить");

assert.ok(existsSync(notify), "второй запуск должен записать запрос на показ окна");
assert.ok(Number(readFileSync(notify, "utf8")) > 0, "токен запроса — время");

// Гонка: несколько одновременных проверок — новых основных быть не должно.
const parallel = await Promise.all(
  Array.from({ length: 5 }, () => {
    return new Promise((resolve) => {
      execFile(
        process.execPath,
        [helper, "probe", sock, notify, String(appPid), result],
        { timeout: 20000, encoding: "utf8" },
        (err, stdout) => resolve((stdout || "").trim() || `ERROR:${err?.message}`),
      );
    });
  }),
);
const primaries = parallel.filter((r) => r.startsWith("PRIMARY"));
assert.equal(
  primaries.length,
  0,
  `основной уже есть, все должны уступить: ${parallel.join(" | ")}`,
);

console.log("single-instance-helper: ok");
