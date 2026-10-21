const DSH_CMD = "dsh --profile web --no-open";
const LOG_FILE_NAME = "dsh-launcher.log";
const INSTANCE_FILE_NAME = "dsh-launcher.instance";
const SERVER_PORT = 3080;
const TRAY_ICON_REL = "/resources/icons/1792170388472b.png";

let dshPid = null;
// Владеем ли мы dsh-сервером. Если он уже работал до нас — не владеем и не гасим его.
let ownsDsh = false;
let isWindows = false;
let logPath = LOG_FILE_NAME;
let logTimer = null;
let serverUrl = null;

// Один инстанс: сокет (resources/js/single-instance.cjs) + запасной pid-файл.
let instancePath = INSTANCE_FILE_NAME;
let isPrimary = false;

const $frameWrap = document.getElementById("frameWrap");
const $loading = document.getElementById("loading");
const $status = document.getElementById("status");
const $lastLine = document.getElementById("lastLine");

// ---------- UI ----------

function showLoading(message) {
  $loading.style.display = "flex";
  $status.textContent = message;
  const iframe = $frameWrap.querySelector("iframe");
  if (iframe) iframe.remove();
  const center = $frameWrap.querySelector(".center");
  if (center) center.remove();
}

function showError(message) {
  const center = document.createElement("div");
  center.className = "center";
  const title = document.createElement("h3");
  title.style.color = "#ff7b7b";
  title.textContent = "Ошибка";
  const text = document.createElement("p");
  text.textContent = message;
  const button = document.createElement("button");
  button.textContent = "Повторить";
  button.onclick = () => location.reload();
  center.append(title, text, button);

  $loading.style.display = "none";
  const iframe = $frameWrap.querySelector("iframe");
  if (iframe) iframe.remove();
  const oldCenter = $frameWrap.querySelector(".center");
  if (oldCenter) oldCenter.remove();
  $frameWrap.appendChild(center);
}

function showIframe(url) {
  $loading.style.display = "none";
  const center = $frameWrap.querySelector(".center");
  if (center) center.remove();
  const oldIframe = $frameWrap.querySelector("iframe");
  if (oldIframe) oldIframe.remove();
  const iframe = document.createElement("iframe");
  iframe.src = url;
  $frameWrap.appendChild(iframe);
}

// ---------- Логи ----------

async function readLastLine() {
  try {
    const content = await Neutralino.filesystem.readFile(logPath);
    const cleaned = content
      .replace(/\x1B\[[0-9;?]*[ -\/]*[@-~]/g, "")
      .replace(/\r/g, "")
      .trim();
    const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
    const last = lines.length ? lines[lines.length - 1].trim() : "";
    $lastLine.textContent = last;
  } catch {
    if (!$lastLine.textContent) {
      $lastLine.textContent = "Ожидание вывода процесса...";
    }
  }
}

function startLogPolling(intervalMs = 400) {
  stopLogPolling();
  readLastLine();
  logTimer = setInterval(readLastLine, intervalMs);
}

function stopLogPolling() {
  if (logTimer) {
    clearInterval(logTimer);
    logTimer = null;
  }
}

async function setupLogPath() {
  try {
    const tempPath = await Neutralino.os.getPath("temp");
    const cleanPath = tempPath.replace(/[\/\\]+$/, "");
    const sep = cleanPath.includes("\\") ? "\\" : "/";
    logPath = `${cleanPath}${sep}${LOG_FILE_NAME}`;
    instancePath = `${cleanPath}${sep}${INSTANCE_FILE_NAME}`;
  } catch {
    logPath = LOG_FILE_NAME;
    instancePath = INSTANCE_FILE_NAME;
  }
  await setupInstancePaths();
}

// ---------- Один инстанс ----------

// Хелпер resources/js/single-instance.cjs держит настоящий OS-сокет:
// unix socket на Linux/macOS, named pipe на Windows. Эксклюзивность
// гарантирует ядро (второй bind на тот же адрес невозможен), поэтому
// гонки двух одновременных запусков здесь нет по определению.
//
// Лежит внутри встроенных ресурсов, а не рядом с бинарём: так он есть при
// любом способе запуска — из dist/, из AppImage, из ~/.local/opt (ярлык).
// Перед запуском распаковываем его в temp, потому что node нужен реальный файл.
const INSTANCE_HELPER_RES = "/resources/js/single-instance.cjs";

let helperPath = "dsh-launcher-helper.cjs";
let socketPath = "dsh-launcher.sock";
let notifyPath = "dsh-launcher.show";
let resultPath = "dsh-launcher.result";
let notifyTimer = null;
let lastShowToken = "";

function socketPathFor(tempDir) {
  return isWindows
    ? `\\\\.\\pipe\\dsh-launcher-${hashForPipe(tempDir)}`
    : `${tempDir}/dsh-launcher.sock`;
}

// Имя pipe — от пути temp, чтобы разные установки не мешали друг другу.
function hashForPipe(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

async function setupInstancePaths() {
  let tempDir = ".";
  try {
    const raw = await Neutralino.os.getPath("temp");
    tempDir = raw.replace(/[\/\\]+$/, "");
  } catch {
    /* остался "." */
  }
  const sep = isWindows ? "\\" : "/";
  helperPath = `${tempDir}${sep}dsh-launcher-helper.cjs`;
  socketPath = socketPathFor(tempDir);
  notifyPath = `${tempDir}${sep}${INSTANCE_FILE_NAME}.show`;
  resultPath = `${tempDir}${sep}${INSTANCE_FILE_NAME}.result`;
}

// Достаём хелпер из встроенных ресурсов в temp (один раз за запуск).
async function extractHelper() {
  try {
    await Neutralino.resources.extractFile(INSTANCE_HELPER_RES, helperPath);
    return true;
  } catch (e) {
    console.warn("Не удалось распаковать хелпер:", e);
    return false;
  }
}

// Возвращает true, если мы единственный инстанс.
//
// ВАЖНО: os.execCommand в Neutralino синхронный — он ждёт завершения процесса
// в потоке сервера ядра. На это время окно не может ни подключиться по
// WebSocket (NE_CL_IVCTOKN), ни принять закрытие, ни обработать клик в трее.
// Поэтому запускаем хелпер через spawnProcess (без блокировки) и опрашиваем
// файл с вердиктом.
async function claimSingleInstance() {
  const pid = await Neutralino.app.getProcessId().catch(() => 0);
  // cmd.exe не понимает одинарные кавычки, sh — двойные с $; квотируем по платформе.
  const q = isWindows
    ? (s) => `"${String(s)}"`
    : (s) => `'${String(s).split("'").join("'\\''")}'`;

  // Обнуляем запрос до проверки: иначе просьба «покажись», пришедшая во время
  // нашего старта, будет принята за исходное состояние, и окно не развернётся.
  await Neutralino.filesystem.writeFile(notifyPath, "").catch(() => {});
  lastShowToken = "";

  if (!(await extractHelper())) {
    console.warn("хелпер недоступен, single-instance через pid-файл");
    return claimByFile(pid);
  }

  // Второй признак живого окна — pid-файл. Нужен, когда держателя сокета нет:
  // например, приложение запущено старой версией, где хелпер не поднимался.
  const running = await readInstanceFile();
  if (running?.pid && running.pid !== pid && (await processAlive(running.pid))) {
    console.log("single-instance: живой инстанс по pid-файлу, уступаем");
    await Neutralino.filesystem
      .writeFile(notifyPath, String(Date.now()))
      .catch(() => {});
    return false;
  }

  const nodePath = await resolveNodePath();
  if (!nodePath) {
    console.warn("node не найден, single-instance через pid-файл");
    return claimByFile(pid);
  }

  // Каждый запуск — свой файл вердикта.
  const verdictPath = `${resultPath}.${pid}`;
  await Neutralino.filesystem.remove(verdictPath).catch(() => {});

  const cmd = `${q(nodePath)} ${q(helperPath)} probe ${q(socketPath)} ${q(notifyPath)} ${pid} ${q(verdictPath)}`;
  try {
    // PATH дополняем и здесь: node может быть шимом asdf/bun, которым нужен
    // свой каталог в PATH. Из ярлыка PATH урезан, и без этого шим не стартует.
    await Neutralino.os.spawnProcess(cmd, { envs: await envWithFullPath() });
  } catch (e) {
    console.warn("single-instance helper failed:", e);
    return claimByFile(pid);
  }

  for (let i = 0; i < 40; i++) {
    await sleep(100);
    let out = "";
    try {
      out = (await Neutralino.filesystem.readFile(verdictPath)).trim();
    } catch {
      continue; /* хелпер ещё решает */
    }
    if (out.startsWith("PRIMARY")) {
      console.log("single-instance: primary,", out);
      // Пишем и pid-файл: если следующая версия или окружение не поднимет
      // хелпер, она всё равно увидит живое окно.
      await Neutralino.filesystem.writeFile(instancePath, `${pid}\n`).catch(() => {});
      return true;
    }
    if (out === "SECONDARY") {
      console.log("single-instance: secondary, уступаем окно");
      return false;
    }
    if (out.startsWith("ERROR")) {
      console.warn("single-instance helper unavailable:", out);
      return claimByFile(pid);
    }
  }
  console.warn("single-instance helper timeout — считаем себя основным");
  return claimByFile(pid);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Где искать инструменты. Из ярлыка PATH урезан (нет ~/.asdf и ~/.bun), поэтому
// к нему добавляем известные каталоги установки — тем же списком пользуются
// и запуск dsh, и поиск node.
function extraBinDirs(home) {
  return [
    `${home}/.local/share/pnpm/bin`,
    `${home}/.asdf/shims`,
    `${home}/.asdf/bin`,
    `${home}/.local/bin`,
    `${home}/.bun/bin`,
    `${home}/.proto/shims`,
    `${home}/.proto/bin`,
    `${home}/.deno/bin`,
    `${home}/go/bin`,
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin",
    "/snap/bin",
  ].filter(Boolean);
}

async function resolveNodePath() {
  if (isWindows) return "node";
  const env = await Neutralino.os.getEnvs().catch(() => ({}));
  const home = env.HOME || (await Neutralino.os.getEnv("HOME").catch(() => ""));
  // NODE из окружения — самый точный вариант, если задан.
  const explicit = await Neutralino.os.getEnv("NODE").catch(() => "");
  const dirs = [
    ...(env.PATH || "").split(":"),
    ...extraBinDirs(home),
    "/opt/homebrew/bin",
  ].filter(Boolean);
  for (const dir of explicit ? [explicit] : dirs) {
    const p = explicit ? dir : `${dir}/node`;
    try {
      await Neutralino.filesystem.getStats(p);
      return p;
    } catch {
      /* нет такого */
    }
  }
  return null;
}

// Окружение с полным PATH — для процессов, которые запускает приложение.
async function envWithFullPath() {
  const envs = await Neutralino.os.getEnvs().catch(() => ({}));
  if (isWindows) return envs;
  const home = envs.HOME || (await Neutralino.os.getEnv("HOME").catch(() => ""));
  const merged = new Set(
    [...(envs.PATH || "").split(":"), ...extraBinDirs(home)].filter(Boolean),
  );
  return { ...envs, PATH: Array.from(merged).join(":") };
}

async function claimByFile(pid) {
  const existing = await readInstanceFile();
  if (existing?.pid && (await processAlive(existing.pid))) {
    // Запасной путь: просьба «покажись» идёт тем же файлом-токеном.
    await Neutralino.filesystem
      .writeFile(notifyPath, String(Date.now()))
      .catch(() => {});
    return false;
  }
  try {
    await Neutralino.filesystem.writeFile(instancePath, `${pid}\n`);
  } catch (e) {
    console.warn("Не удалось создать файл инстанса:", e);
    return true;
  }
  const check = await readInstanceFile();
  if (check?.pid !== pid) {
    if (check?.pid) {
      await Neutralino.filesystem
        .writeFile(notifyPath, String(Date.now()))
        .catch(() => {});
    }
    return false;
  }
  return true;
}

async function readInstanceFile() {
  try {
    const raw = await Neutralino.filesystem.readFile(instancePath);
    const [pidLine = "", token = ""] = raw.split("\n");
    return { pid: Number(pidLine.trim()) || null, token: token.trim() };
  } catch {
    return null;
  }
}

// Жив ли процесс. Без execCommand: он синхронный и вешает ядро, поэтому
// проверяем неблокирующим spawnProcess, который пишет результат в файл.
async function processAlive(pid) {
  if (!pid) return false;
  const checkPath = `${resultPath}.alive`;
  await Neutralino.filesystem.remove(checkPath).catch(() => {});
  const cmd = isWindows
    ? `cmd /c tasklist /FI "PID eq ${pid}" /NH /FO CSV > "${checkPath}" 2>nul`
    : `sh -c 'if kill -0 ${pid} 2>/dev/null; then ps -p ${pid} -o comm= > "${checkPath}"; fi'`;
  try {
    await Neutralino.os.spawnProcess(cmd);
  } catch {
    return false;
  }
  // Даём процессу проверки время, затем читаем.
  for (let i = 0; i < 15; i++) {
    await sleep(100);
    let out = "";
    try {
      out = (await Neutralino.filesystem.readFile(checkPath)).trim();
    } catch {
      continue;
    }
    if (out) {
      await Neutralino.filesystem.remove(checkPath).catch(() => {});
      return /neutralino|deepseek/i.test(out);
    }
  }
  return false;
}

async function releaseSingleInstance() {
  // Хелпер умирает сам, когда умирает приложение (он следит за нашим pid),
  // поэтому тут чистим только запасной pid-файл.
  const current = await readInstanceFile();
  const pid = await Neutralino.app.getProcessId().catch(() => 0);
  if (current?.pid === pid) {
    await Neutralino.filesystem.remove(instancePath).catch(() => {});
  }
}

// Просьба «развернись» приходит файлом: держатель сокета пишет туда токен,
// когда второй инстанс стучится в сокет. Штатный путь — watcher (событие без
// опроса), интервал — только страховка на случай, если watcher не поднялся.
async function watchShowRequests() {
  // Базовая точка — пусто: claimSingleInstance обнулил файл перед проверкой,
  // поэтому любой непустой токен означает «второй инстанс уже стучался».
  lastShowToken = "";
  try {
    await Neutralino.filesystem.writeFile(notifyPath, "");
  } catch {
    /* нет доступа к temp — сработает интервал */
  }

  try {
    await Neutralino.filesystem.createWatcher(notifyPath);
    // Файл перезаписывается (modify) или пересоздаётся (add) — важно и то, и другое.
    Neutralino.events.on("watchFile", () => checkShowToken());
  } catch (e) {
    console.warn("watchFile недоступен, остаётся интервал:", e);
  }

  // Подхватываем запрос, пришедший, пока мы регистрировали watcher.
  await checkShowToken();
  notifyTimer = setInterval(checkShowToken, 700);
}

async function checkShowToken() {
  try {
    const token = (await Neutralino.filesystem.readFile(notifyPath)).trim();
    if (token && token !== lastShowToken) {
      lastShowToken = token;
      await revealWindow();
    }
  } catch {
    /* файла ещё нет */
  }
}

async function revealWindow() {
  // Порядок важен: show() сам выходит, если окно уже видимо, а unminimize()
  // на Linux делает gtk_window_present — он не показывает скрытое окно, только
  // поднимает видимое. Поэтому сначала show() (вернуть из трея), затем
  // unminimize()/focus() на случай, если оно свёрнуто в панель.
  for (const step of [
    () => Neutralino.window.show(),
    () => Neutralino.window.unminimize(),
    () => Neutralino.window.focus(),
  ]) {
    try {
      await step();
    } catch (e) {
      console.warn("revealWindow step failed:", e);
    }
  }
}

// ---------- Сеть ----------

async function fetchWithTimeout(url, timeoutMs = 2000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "no-store",
      mode: "no-cors",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

async function extractUrlFromLog() {
  try {
    const content = await Neutralino.filesystem.readFile(logPath);
    const m = content.match(/dsh web:\s*(http[^\s]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// ---------- Запуск dsh ----------

async function startDsh() {
  try {
    const envs = await Neutralino.os.getEnvs();
    let cmd = DSH_CMD;

    if (!isWindows) {
      const HOME =
        envs.HOME || (await Neutralino.os.getEnv("HOME").catch(() => "")) || "";

      const merged = new Set(
        [...(envs.PATH || "").split(":"), ...extraBinDirs(HOME)].filter(Boolean),
      );
      envs.PATH = Array.from(merged).join(":");
      console.log("Augmented PATH:", envs.PATH);
      // Полный путь к dsh больше не ищем: `sh -lc 'command -v dsh'` синхронный
      // и вешает ядро на старте. Достаточно дополненного PATH — им же
      // пользуется spawnProcess ниже.
    }

    console.log("Launch command:", cmd);

    let launchCommand;
    if (isWindows) {
      launchCommand = `cmd /c ${cmd} > "${logPath}" 2>&1`;
    } else {
      const escaped = logPath.split("'").join("'\\''");
      launchCommand = `sh -c '${cmd} > '${escaped}' 2>&1'`;
    }

    const proc = await Neutralino.os.spawnProcess(launchCommand, { envs });
    dshPid = proc.pid;
    console.log("dsh spawned, pid =", dshPid);
    return true;
  } catch (e) {
    console.error("Не удалось запустить dsh:", e);
    return false;
  }
}

async function stopDsh() {
  console.log("stopDsh called, PID:", dshPid);

  // Чужой dsh (запущен не нами) не убиваем: приложение всего лишь его окно.
  if (!ownsDsh) {
    console.log("dsh не наш — оставляем работать");
    return;
  }

  if (dshPid) {
    try {
      let cmd;
      if (isWindows) {
        cmd = `taskkill /F /T /PID ${dshPid}`;
      } else {
        cmd = `pkill -P ${dshPid} 2>/dev/null; kill -- -${dshPid} 2>/dev/null; kill -9 ${dshPid} 2>/dev/null`;
      }
      console.log("Killing process tree:", cmd);
      await Neutralino.os.execCommand(cmd, { background: true });
    } catch (e) {
      console.warn("stopDsh error:", e);
    }
  }

  // Убийство «всего, что на порту» убрано намеренно: там мог оказаться
  // dsh, поднятый другим окном или из терминала.
  dshPid = null;
  ownsDsh = false;
}

async function waitForServerUrl(timeoutSeconds = 60) {
  for (let s = 1; s <= timeoutSeconds; s++) {
    const url = await extractUrlFromLog();
    if (url) {
      try {
        await fetchWithTimeout(url, 2000);
        return url;
      } catch {
        /* сервер еще не поднялся */
      }
    }
    showLoading(`Ожидание URL сервера... ${s}/${timeoutSeconds}s`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// ---------- Трей ----------

async function setupTray() {
  try {
    const base = (window.NL_PATH || "").replace(/\/$/, "");

    await Neutralino.os.setTray({
      icon: TRAY_ICON_REL, // <-- именно icon, не iconPath
      tooltip: "DeepSeek Harness",
      menuItems: [
        { id: "SHOW", text: "Развернуть" },
        { id: "EXIT", text: "Закрыть" },
      ],
    });

    Neutralino.events.on("trayMenuItemClicked", (evt) => {
      console.log("Tray menu clicked:", evt.detail.id);
      if (evt.detail.id === "SHOW") revealWindow();
      if (evt.detail.id === "EXIT") {
        stopDsh().then(() => Neutralino.app.exit());
      }
    });

    console.log("Tray icon created successfully");
  } catch (e) {
    console.error("Tray creation failed:", e);
  }
}

// ---------- Инициализация ----------

async function init() {
  await Neutralino.init();

  // ОС нужна уже для путей сокета (unix socket vs named pipe).
  isWindows =
    (await Neutralino.computer
      .getKernelInfo()
      .then((k) => k.variant === "Windows NT")
      .catch(() => false)) || false;

  await setupLogPath();

  // Иконка окна / таскбара
  try {
    const base = (window.NL_PATH || "").replace(/\/$/, "");
    await Neutralino.window.setIcon(TRAY_ICON_REL);
    console.log("Window icon set");
  } catch (e) {
    console.warn("window.setIcon failed:", e);
  }

  // Крестик окна -> свернуть в трей
  Neutralino.events.on("windowClose", async () => {
    console.log("windowClose - hiding to tray");
    await Neutralino.window.hide();
  });

  // Реальный выход
  Neutralino.events.on("appExit", async () => {
    // Вторичный инстанс не владеет dsh — иначе он убьёт сервер основного окна.
    if (!isPrimary) return;
    console.log("appExit - stopping dsh");
    stopLogPolling();
    if (notifyTimer) clearInterval(notifyTimer);
    await stopDsh();
    await releaseSingleInstance();
  });

  // Уже запущен другой экземпляр? Просим его развернуться и выходим сами.
  isPrimary = await claimSingleInstance();
  if (!isPrimary) {
    console.log("Другой экземпляр уже запущен, выходим");
    await Neutralino.window.hide().catch(() => {});
    await Neutralino.app.exit();
    return;
  }

  await watchShowRequests();

  // Трей сразу при старте
  await setupTray();

  showLoading("Проверка сервера...");

  // Уже работающий dsh — чужой или от прошлого запуска — не трогаем:
  // подключаемся к нему. Иначе открытие второго окна убивало живой сервер.
  const existingUrl = await findRunningServer();
  if (existingUrl) {
    console.log("dsh уже запущен, подключаемся:", existingUrl);
    serverUrl = existingUrl;
    ownsDsh = false;
    showIframe(serverUrl);
    return;
  }

  showLoading("Запуск DeepSeek Harness...");
  startLogPolling();

  const started = await startDsh();
  if (!started) {
    stopLogPolling();
    showError(
      "Не удалось запустить dsh. Проверьте, что команда доступна в PATH.",
    );
    return;
  }
  ownsDsh = true;

  const url = await waitForServerUrl(60);
  stopLogPolling();

  if (!url) {
    await stopDsh();
    showError("Не удалось получить URL сервера за 60 секунд.");
    return;
  }

  serverUrl = url;
  showIframe(serverUrl);
}

// Адрес живого dsh: сначала пробуем порт по умолчанию, потом URL из общего лога.
async function findRunningServer() {
  const candidates = [`http://127.0.0.1:${SERVER_PORT}`, await extractUrlFromLog()];
  for (const url of candidates) {
    if (!url) continue;
    try {
      await fetchWithTimeout(url, 1500);
      return url;
    } catch {
      /* не отвечает */
    }
  }
  return null;
}

init();
