// Пересборка десктоп-пакета «наверняка»: чистим dist, собираем, ПРОВЕРЯЕМ,
// что в артефакт реально попал текущий код. Без проверки уже был случай:
// AppImage от прошлой сборки выглядел готовым, а внутри был старый баг.
//
// Запуск: bun run build   (или node scripts/build.mjs [--no-appimage])
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const binName = "deepseek-launcher";
const wantAppImage = !process.argv.includes("--no-appimage");
const neu = join(root, "node_modules", ".bin", "neu");

const step = (msg) => console.log(`\n▸ ${msg}`);
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

if (!existsSync(neu)) fail("нет node_modules — сначала `bun install`");

// В свежем клоне bin/ нет: он в .gitignore. Без рантайма собирать нечего.
if (!existsSync(join(root, "bin", "neutralino-linux_x64"))) {
  step("Нет bin/ — скачиваю рантайм (neu update)");
  execFileSync(neu, ["update"], { cwd: root, stdio: "inherit" });
}

// Клиентская библиотека грузится страницей напрямую, neu update её не качает.
if (!existsSync(join(root, "resources", "neutralino.js"))) {
  fail("нет resources/neutralino.js — положите клиентскую библиотеку @neutralinojs/lib");
}

// Маркер из исходника: он обязан оказаться внутри собранного бинаря.
const mainJs = readFileSync(join(root, "resources", "js", "main.js"), "utf8");
const marker = mainJs.match(/const INSTANCE_HELPER_REL = "[^"]+"/)?.[0];
const extJs = readFileSync(join(root, "extensions", "single-instance.cjs"), "utf8");
const extMarker = extJs.match(/PRIMARY:\$?\{?child\.pid|"PRIMARY"/)?.[0];
if (!marker || !extMarker) fail("не нашёл маркеры в исходниках — проверка невозможна");

// 1. Чистый dist: старые артефакты не должны пережить сборку.
step("Чищу dist/");
rmSync(dist, { recursive: true, force: true });

// 2. Бинари с ресурсами ВНУТРИ: без этого AppImage собирается без кода и не работает.
step("neu build --embed-resources");
execFileSync(neu, ["build", "--embed-resources"], { cwd: root, stdio: "inherit" });

// 3. Проверяем бинарь: свежий по времени и содержит наш код.
step("Проверяю бинарь");
const linuxBin = join(dist, binName, `${binName}-linux_x64`);
if (!existsSync(linuxBin)) fail(`нет ${linuxBin}`);
const binBytes = readFileSync(linuxBin);
if (!binBytes.includes(Buffer.from(marker))) {
  fail(`в бинаре нет текущего кода (маркер ${marker}) — ресурсы не вшились`);
}
if (!binBytes.includes(Buffer.from("single-instance.cjs"))) {
  fail("в бинаре нет расширения single-instance.cjs");
}
console.log(
  `  ok: ${(binBytes.length / 1024 / 1024).toFixed(1)} МБ, код внутри, изменён ${statSync(linuxBin).mtime.toLocaleString("ru-RU")}`,
);

// 4. AppImage: только Linux, и только если он вообще нужен.
if (wantAppImage && process.platform === "linux") {
  step("neu builder appimage");
  // Без FUSE appimagetool падает (code 127) — режим извлечения решает это.
  execFileSync(neu, ["builder", "appimage"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1" },
  });

  step("Проверяю AppImage");
  const appImage = join(dist, "linux", `com.example.myapp-1.0.0-x64.AppImage`);
  if (!existsSync(appImage)) fail(`нет ${appImage}`);
  // Содержимое AppImage сжимается (SquashFS), поэтому проверяем не байты,
  // а свежесть: он обязан быть новее бинаря, из которого собран.
  if (statSync(appImage).mtimeMs < statSync(linuxBin).mtimeMs) {
    fail("AppImage старше бинаря — упакован из прошлой сборки");
  }
  console.log(
    `  ok: ${(statSync(appImage).size / 1024 / 1024).toFixed(1)} МБ, ${statSync(appImage).mtime.toLocaleString("ru-RU")}`,
  );
}

console.log("\n✔ Пакет пересобран и проверен.");
console.log(`  запуск: dist/${binName}/${binName}-linux_x64`);
