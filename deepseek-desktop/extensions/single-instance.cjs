#!/usr/bin/env node
// Один инстанс приложения.
//
//   probe <socket> <notify> <appPid> <resultFile>
//     -> печатает PRIMARY:<holderPid> | SECONDARY | ERROR:<text>
//   serve <socket> <notify> <appPid> <resultFile>
//     -> держит сокет, при подключении пишет токен в <notify>
//
// Linux/macOS: unix domain socket. Windows: named pipe. Один код на всех трёх
// платформах, без npm-зависимостей.
//
// Кто основной, решает ядро: эксклюзивность даёт bind, второй bind на тот же
// адрес невозможен. Проверка «подключились — значит занято» этого не даёт:
// пока первый инстанс поднимается, адрес временно свободен, и два
// одновременных старта оба сочли бы себя первыми.
"use strict";

const net = require("node:net");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const [, , mode, socketPath, notifyPath, appPidArg, resultFile] = process.argv;
const appPid = Number(appPidArg) || 0;

function done(text, code = 0) {
  process.stdout.write(text + "\n");
  process.exit(code);
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function writeResult(text) {
  if (!resultFile) return done(text);
  try {
    fs.writeFileSync(resultFile, text);
  } catch {}
}

// --- serve: держим сокет, пока живёт приложение ---
function serve() {
  // Владеем ли мы адресом. Снимать сокет при выходе можно только своему
  // процессу: проигравший serve иначе удалит сокет живого держателя.
  let ownsSocket = false;

  const cleanup = () => {
    if (!ownsSocket || process.platform === "win32") return;
    try {
      fs.unlinkSync(socketPath);
    } catch {}
  };

  const server = net.createServer((socket) => {
    socket.on("error", () => {});
    socket.on("data", () => {
      try {
        fs.writeFileSync(notifyPath, String(Date.now()));
      } catch {}
      socket.end();
    });
  });

  let retriedStale = false;
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      // Файл сокета мог остаться от убитого процесса. Он «занят» только если
      // на нём кто-то реально слушает — проверяем подключением.
      if (!retriedStale && process.platform !== "win32") {
        retriedStale = true;
        const probeSocket = net.connect(socketPath);
        probeSocket.on("connect", () => {
          // Живой держатель — мы вторичный. Заодно просим его показать окно.
          probeSocket.write("show");
          probeSocket.end();
          writeResult("SECONDARY");
          process.exit(0);
        });
        probeSocket.on("error", () => {
          // Никто не слушает: сокет устарел, забираем адрес себе.
          try {
            fs.unlinkSync(socketPath);
          } catch {}
          server.listen(socketPath, onListening);
        });
        return;
      }
      writeResult("SECONDARY");
      process.exit(0);
    }
    writeResult(`ERROR:${err.code || err.message}`);
    process.exit(1);
  });

  function onListening() {
    // Адрес наш — с этого момента мы единственный основной инстанс.
    ownsSocket = true;
    writeResult("PRIMARY");
    // Живём ровно столько, сколько приложение: иначе после падения останется
    // висящий сокет и следующее приложение решит, что первое ещё живо.
    const timer = setInterval(() => {
      if (!alive(appPid)) process.exit(0);
    }, 1000);
    timer.unref();
    for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      process.on(sig, () => process.exit(0));
    }
  }

  server.listen(socketPath, onListening);
  process.on("exit", cleanup);
}

// --- probe: поднимаем держателя и ждём его вердикта ---
function probe() {
  // Путь к файлу вердикта даёт вызывающая сторона и он уже уникален на запуск.
  // Добавлять сюда ещё и свой pid нельзя: опрашивающий ждёт ровно переданный
  // путь, не нашёл бы его и по таймауту решил, что мы основной.
  const myResult = resultFile;

  const poll = () => {
    try {
      return fs.readFileSync(myResult, "utf8").trim();
    } catch {
      return "";
    }
  };

  try {
    fs.unlinkSync(myResult);
  } catch {}

  // Держатель — отдельный процесс: он должен пережить выход probe.
  let child;
  try {
    child = spawn(
      process.execPath,
      [__filename, "serve", socketPath, notifyPath, String(appPid), myResult],
      { detached: true, stdio: "ignore" },
    );
  } catch (err) {
    done(`ERROR:${err.message}`, 1);
    return;
  }
  child.unref();

  const deadline = Date.now() + 5000;
  const check = () => {
    const text = poll();
    if (text === "PRIMARY") return done(`PRIMARY:${child.pid}`);
    if (text === "SECONDARY") return done("SECONDARY");
    if (text.startsWith("ERROR")) return done(text, 1);
    if (Date.now() > deadline) return done("ERROR:holder did not start", 1);
    setTimeout(check, 40);
  };
  check();
}

if (mode === "serve") serve();
else if (mode === "probe") probe();
else done(`ERROR:unknown mode ${mode}`, 2);
