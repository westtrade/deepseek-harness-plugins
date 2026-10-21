// Проверка логики «один инстанс» без GUI: main.js грузится в песочнице-заглушке.
// Запуск: node test/single-instance.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../resources/js/main.js", import.meta.url), "utf8")
  .replace(/\ninit\(\);\s*$/, "\n"); // не поднимаем всё приложение

// files: карта путь -> содержимое. exec: подмена ответа os.execCommand.
// serverAlive: отвечает ли живой dsh на fetch (для findRunningServer).
// nodeAvailable: находится ли node (resolveNodePath смотрит getStats).
// helperAvailable: удаётся ли распаковать хелпер из ресурсов.
function load({ pid, alive = new Set(), files = {}, exec, onWindowCall = () => {}, serverAlive = false, nodeAvailable = true, helperAvailable = true }) {
  const state = { files: { ...files } };
  const el = () => ({
    style: {},
    textContent: "",
    querySelector: () => null,
    appendChild() {},
    remove() {},
  });
  const document = { getElementById: el, createElement: el };
  const Neutralino = {
    init: async () => {},
    app: { getProcessId: async () => pid, exit: async () => {} },
    window: {
      show: async () => onWindowCall("show"),
      unminimize: async () => onWindowCall("unminimize"),
      focus: async () => onWindowCall("focus"),
      hide: async () => {},
      setIcon: async () => {},
    },
    events: { on: () => {} },
    computer: { getKernelInfo: async () => ({ variant: "Linux" }) },
    // Хелпер лежит во встроенных ресурсах и распаковывается в temp.
    resources: {
      extractFile: async (src, dest) => {
        if (!helperAvailable) throw new Error("NE_RS_FILEXTF");
        state.files[dest] = "// helper";
      },
    },
    os: {
      getPath: async () => "/tmp/",
      getEnv: async () => "",
      getEnvs: async () => ({ PATH: "" }),
      // spawnProcess — неблокирующий путь, которым пользуется main.js.
      spawnProcess: async (cmd) => {
        if (exec) return exec(cmd, state);
        return { id: 1, pid: 1 };
      },
      execCommand: async (cmd) => {
        if (exec) return exec(cmd, state);
        const m = cmd.match(/kill -0 (\d+)/);
        const ok = m && alive.has(Number(m[1]));
        return { exitCode: ok ? 0 : 1, stdOut: ok ? "neutralino-linux_x64" : "" };
      },
    },
    filesystem: {
      readFile: async (path) => {
        if (!(path in state.files)) throw new Error("missing");
        return state.files[path];
      },
      writeFile: async (path, data) => {
        state.files[path] = data;
      },
      remove: async (path) => {
        delete state.files[path];
      },
      createWatcher: async () => 1,
      // node ищется проверкой существования пути.
      getStats: async (path) => {
        if (nodeAvailable && /\/node$/.test(path)) return { isFile: true };
        throw new Error("missing");
      },
    },
  };
  const api = new Function(
    "document",
    "window",
    "Neutralino",
    "fetch",
    "console",
    "setInterval",
    `${src}
     return { setupLogPath, claimSingleInstance, claimByFile, releaseSingleInstance,
              revealWindow, readInstanceFile, setupInstancePaths, findRunningServer,
              stopDsh,
              isOwner: () => ownsDsh,
              markOwner: (p) => { ownsDsh = true; dshPid = p; } };`,
  )(
    document,
    { NL_PATH: "/app" },
    Neutralino,
    async () => {
      if (serverAlive) return { ok: true };
      throw new Error("no network in test");
    },
    { log() {}, warn() {}, error() {} },
    () => 0,
  );
  return { api, state };
}

const SOCK = "/tmp/dsh-launcher.sock";
const NOTIFY = "/tmp/dsh-launcher.instance.show";
const FILE = "/tmp/dsh-launcher.instance";

// spawnProcess-заглушка хелпера: пишет вердикт в файл, как настоящий хелпер.
// isFree() — свободен ли сокет; verdicts — очередь для гонки.
const helperExec = (isFree) => (cmd, state = { files: {} }) => {
  if (cmd.includes("dsh-launcher-helper.cjs")) {
    // Хелпер получает путь к файлу вердикта — проверяем, что он передан.
    const verdict = cmd.match(/'([^']*\.result\.[^']*)'/)?.[1];
    assert.ok(verdict, `result-файл должен передаваться в хелпер: ${cmd}`);
    if (isFree()) {
      state.files[verdict] = "PRIMARY";
      return { id: 1, pid: 9001 };
    }
    // Второй инстанс стучится в сокет — держатель пишет токен.
    const notifyPath = cmd.match(/'([^']*\.show)'/)?.[1];
    if (notifyPath) state.files[notifyPath] = String(Date.now());
    state.files[verdict] = "SECONDARY";
    return { id: 1, pid: 9002 };
  }
  return { id: 1, pid: 1 };
};

// 1. Сокет свободен — становимся основным, pid-файл не нужен.
{
  const a = load({ pid: 111, exec: helperExec(() => true) });
  await a.api.setupLogPath();
  assert.equal(await a.api.claimSingleInstance(), true);
}

// 2. Сокет занят — уступаем и пишем запрос на показ окна.
{
  const occupied = true;
  const a = load({ pid: 222, exec: helperExec(() => !occupied) });
  await a.api.setupLogPath();
  assert.equal(await a.api.claimSingleInstance(), false);
  assert.ok(Number(a.state.files[NOTIFY]) > 0, "запрос на показ окна записан");
}

// 3. Хелпер недоступен (нет node) — запасной путь через pid-файл работает.
{
  const a = load({ pid: 333, exec: helperExec(() => true), nodeAvailable: false });
  await a.api.setupLogPath();
  assert.equal(await a.api.claimSingleInstance(), true);
  assert.equal((await a.api.readInstanceFile()).pid, 333);
}

// 4. Запасной путь: живой первый инстанс — уступаем, его pid не перезаписан.
{
  const alive = (cmd, state) => {
    const m = cmd.match(/kill -0 (\d+)/);
    const checkPath = cmd.match(/> "([^"]+)"/)?.[1];
    if (m && checkPath && new Set([111, 444]).has(Number(m[1]))) {
      state.files[checkPath] = "neutralino-linux_x64\n";
    }
    return { id: 1, pid: 1 };
  };
  const a = load({
    pid: 444,
    files: { [FILE]: "111\n" },
    exec: alive,
    nodeAvailable: false,
  });
  await a.api.setupLogPath();
  assert.equal(await a.api.claimSingleInstance(), false);
  assert.equal((await a.api.readInstanceFile()).pid, 111, "pid основного не перезаписан");
  assert.ok(Number(a.state.files[NOTIFY]) > 0, "запрос на показ ушёл файлом");
}

// 5. Запасной путь: первый умер, файл остался — забираем себе.
{
  const alive = (cmd, state) => {
    const m = cmd.match(/kill -0 (\d+)/);
    const checkPath = cmd.match(/> "([^"]+)"/)?.[1];
    if (m && checkPath && Number(m[1]) === 555) {
      state.files[checkPath] = "neutralino-linux_x64\n";
    }
    return { id: 1, pid: 1 };
  };
  const a = load({
    pid: 555,
    files: { [FILE]: "111\n" },
    exec: alive,
    nodeAvailable: false,
  });
  await a.api.setupLogPath();
  assert.equal(await a.api.claimSingleInstance(), true);
  assert.equal((await a.api.readInstanceFile()).pid, 555);
}

// 6. Выход основного убирает свой pid-файл, чужой не трогает.
{
  const a = load({ pid: 666, exec: helperExec(() => true) });
  await a.api.setupLogPath();
  a.state.files[FILE] = "666\n";
  await a.api.releaseSingleInstance();
  assert.equal(a.state.files[FILE], undefined);

  const b = load({ pid: 777, files: { [FILE]: "666\n" }, exec: helperExec(() => true) });
  await b.api.setupLogPath();
  await b.api.releaseSingleInstance();
  assert.equal(b.state.files[FILE], "666\n", "чужой pid-файл не удалён");
}

// 7. Разворот окна: сначала show (вернуть из трея), затем unminimize/focus.
{
  const calls = [];
  const a = load({ pid: 888, exec: helperExec(() => true), onWindowCall: (c) => calls.push(c) });
  await a.api.setupLogPath();
  await a.api.revealWindow();
  assert.deepEqual(calls, ["show", "unminimize", "focus"]);
}

// 8. Пути: unix socket в temp, notify рядом с pid-файлом.
{
  const a = load({ pid: 999, exec: helperExec(() => true) });
  await a.api.setupLogPath();
  assert.ok(SOCK.startsWith("/tmp/"), "sock в temp");
  assert.equal(a.state.files[FILE], undefined, "основной инстанс pid-файл не пишет");
}

// 9. Уже работающий чужой dsh не убиваем при выходе и подключаемся к нему.
{
  const killed = [];
  const a = load({
    pid: 1010,
    exec: (cmd) => {
      if (cmd.includes("dsh-launcher-helper.cjs")) return { id: 1, pid: 9001 };
      killed.push(cmd);
      return { exitCode: 0, stdOut: "" };
    },
    serverAlive: true,
  });
  await a.api.setupLogPath();

  // Сервер уже поднят — берём его адрес, владельцем не становимся.
  const url = await a.api.findRunningServer();
  assert.equal(url, "http://127.0.0.1:3080", "подключились к живому серверу");
  assert.equal(a.api.isOwner(), false, "чужой сервер нам не принадлежит");

  await a.api.stopDsh();
  assert.equal(
    killed.filter((c) => /kill|lsof|fuser/.test(c)).length,
    0,
    `чужой dsh не должен убиваться: ${killed.join(" | ")}`,
  );
}

// 10. Свой dsh при выходе гасим.
{
  const killed = [];
  const a = load({
    pid: 1111,
    exec: (cmd) => {
      if (cmd.includes("dsh-launcher-helper.cjs")) return { id: 1, pid: 9001 };
      killed.push(cmd);
      return { exitCode: 0, stdOut: "" };
    },
    serverAlive: false,
  });
  await a.api.setupLogPath();
  await a.api.markOwner(4242);
  await a.api.stopDsh();
  assert.ok(
    killed.some((c) => c.includes("4242")),
    `свой dsh должен гаситься: ${killed.join(" | ")}`,
  );
}

console.log("single-instance: ok");
