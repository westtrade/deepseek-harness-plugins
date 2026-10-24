# deepseek-harness-plugins

Плагины для [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (команда `dsh`).

## `dsh-project-cost`

Учёт стоимости проектов: считает потраченные деньги по каждому проекту
(директории) по ценам [routerai.ru](https://routerai.ru/) и показывает сумму
в веб-интерфейсе — **прямо в дереве Workspaces** (бейдж справа в строке
директории и рядом с временем в строках сессий), **в строке метрик чата**
(после «Usage … / Ran for … / времени» под каждым ответом ассистента) и в
строке «Project costs» сайдбара — слева иконка, справа **«потрачено /
остаток»** (общая сумма, слэш и остаток денег на routerai.ru) и **кнопка
обновления, которая крутится, пока идёт запрос**; клик по строке открывает
панель с таблицей.

```sh
node dsh-project-cost/scripts/report.mjs        # быстро: отчёт в терминале
node dsh-project-cost/scripts/report.mjs --json # сырой JSON
node dsh-project-cost/scripts/client-smoke.mjs  # проверка клиентской обвязки
node dsh-project-cost/scripts/balance-smoke.mjs # баланс: ключ и разбор ответа
```

Подробности и установка: [dsh-project-cost/README.md](dsh-project-cost/README.md).

## `dsh-cron-schedule`

Планировщик задач для ИИ: **в заданное время создаётся новый чат в выбранном
каталоге и получает задачу**. В веб-интерфейсе — панель «AI schedules» с
таблицей задач, добавлением и удалением, пресетами расписания и произвольным
cron-выражением, выбором каталога селектором существующих workspace или
файлпикером ОС. Для каждой задачи можно выбрать модель и чат: по умолчанию первый запуск
создаёт чат и дальше задача ведёт его же, либо включается галка «всегда новый
чат». Список допустимых моделей задаётся на странице Settings. Пропущенные за время простоя запуски
показываются списком с кнопками «Выполнить» и «Пропустить» (либо догоняются
сами, если человек поставил галочку). ИИ сам может управлять расписаниями через
инструменты `cron_create`, `cron_list`, `cron_chats`, `cron_models`,
`cron_describe`, `cron_run`, `cron_delete`.

```sh
node dsh-cron-schedule/scripts/cron-test.mjs    # движок расписаний
node dsh-cron-schedule/scripts/store-test.mjs   # хранилище и планировщик
node dsh-cron-schedule/scripts/host-test.mjs    # маршруты и запуск чата
node dsh-cron-schedule/scripts/client-smoke.mjs # обвязка панели
```

Подробности и установка: [dsh-cron-schedule/README.md](dsh-cron-schedule/README.md).

## `dsh-goal-vector`

Векторы целей (ВЦ) для ИИ: именованный список целей, упорядоченный **по
приоритету**, которому модель следует во время работы (первая цель — самая
важная, последняя — та, от которой отказываются первой). В веб-интерфейсе —
страница **«Goals vectors»** с созданием, редактированием, удалением и
перестановкой целей стрелками, а также **селектор в композере** рядом с
«Workspace Write»: им выбирается ВЦ для текущего чата (по умолчанию —
**«No vector»**, обычный режим). Пока ВЦ принят, он подставляется в системный
промпт на каждом шаге модели и действует до снятия. ИИ сам может создавать ВЦ,
принимать их и запускать **подагента с ВЦ** через инструменты
`goal_vector_list`, `goal_vector_create`, `goal_vector_adopt`,
`goal_vector_delegate`.

```sh
node dsh-goal-vector/scripts/store-test.mjs    # хранилище и выборы чатов
node dsh-goal-vector/scripts/host-test.mjs     # маршруты, промпт, инструменты
node dsh-goal-vector/scripts/client-smoke.mjs  # обвязка панели и селектора
```

Подробности и установка: [dsh-goal-vector/README.md](dsh-goal-vector/README.md).

## `dsh-session-gate`

Доступ к инструментам в отдельном чате: рядом с «Workspace Write» в композере —
кнопка **«Доступ»**, открывающая модалку с галочками. Ими отмечается, **какие
MCP-серверы подключены к этому чату** (снятая галочка убирает все
`mcp__<сервер>__*` из того, что видит и может вызвать модель именно здесь), и
**может ли агент читать фотографии** (инструмент `read_image`; рядом видно,
принимает ли изображения модель чата). Кнопка доступна и в новом чате, и в
процессе общения; изменения действуют со следующего шага и сохраняются в
`$DSH_HOME/session-gate.json`. По умолчанию всё включено — плагин только
ограничивает, ничего не ужесточая сам.

```sh
node dsh-session-gate/scripts/host-test.mjs    # маршрут, ограничения, модель, хранилище
node dsh-session-gate/scripts/client-smoke.mjs # бандл: слот, примитивы, словари
```

Подробности и установка: [dsh-session-gate/README.md](dsh-session-gate/README.md).

## `dsh-moleculer`

Интеграция с [Moleculer](https://moleculer.services/): плагин поднимает узел
сети внутри харнесса и соединяется с другими узлами по TCP/NATS/Redis/MQTT/AMQP
(параметры подключения — в **Settings**). Каждый сервис сети публикуется как
инструмент модели `mesh_<сервис>_<действие>`; через них же узел рассказывает о
себе (`mesh_node_health`, `mesh_node_services`, `mesh_node_actions`). Тот же
набор отдаётся **по MCP** (`POST /api/moleculer/mcp`), поэтому к сети может
подключиться любой внешний MCP-клиент. Когда узел присоединяется, уходит или
меняет сервисы, работающая модель получает сообщение об этом — отдыхающие не
будятся. Управление из чата: `/moleculer start|stop|restart|status`.

```sh
npm install                                    # moleculer + MCP SDK
node dsh-moleculer/scripts/mesh-test.mjs       # каталог и схемы
node dsh-moleculer/scripts/host-test.mjs       # брокер, инструменты, команда
node dsh-moleculer/scripts/client-smoke.mjs    # карточка настроек
```

Подробности и установка: [dsh-moleculer/README.md](dsh-moleculer/README.md).

## `svelte-mcp-local`

MCP-сервер документации Svelte с локальным кешем: тот же
[`@sveltejs/mcp`](https://www.npmjs.com/package/@sveltejs/mcp) — те же четыре
инструмента (`get-documentation`, `list-sections`, `playground-link`,
`svelte-autofixer`) — но документация читается с диска, а не с `svelte.dev`
на каждый вызов. Ответы совпадают с сетевыми байт в байт, а при недоступном
сайте сервер больше не падает. Кеш лежит в пакете снимком на момент сборки.

```sh
bun install                        # зависимости пакета
node bin/cli.mjs status            # что в кеше
node bin/cli.mjs update            # обновить кеш из сети
node test/cache.test.mjs           # нарезка глав и раскладка кеша
```

Подробности: [svelte-mcp-local/README.md](svelte-mcp-local/README.md).

## `dsh-plugin-showcase`

Витрина плагинов: страница с каталогом community-плагинов DeepSeek Harness —
картинка, короткое описание, звёзды, ссылка на GitHub и кнопка
«Установить» / «Удалить» с постраничным переходом и поиском. Каталог (7501
запись, 22 категории) собирается из
[Dominic789654/awesome-deepseek-harness](https://github.com/Dominic789654/awesome-deepseek-harness)
и лежит снимком в пакете, поэтому витрина работает без сети; звёзды
подтягиваются с GitHub и кешируются на шесть часов. Кнопка запускает ту же
команду, что человек набрал бы руками: `dsh plugin --profile web add
github:owner/repo`; изменение подхватывается после перезапуска профиля.

```sh
node scripts/build-catalog.mjs      # пересобрать каталог из awesome-списка
node scripts/catalog-test.mjs       # разбор списка
node scripts/host-test.mjs          # роуты, пагинация, поиск, профиль
node scripts/client-smoke.mjs       # клиентский бандл
```

Подробности: [dsh-plugin-showcase/README.md](dsh-plugin-showcase/README.md).

## `deepseek-desktop`

Десктопное приложение: запускает `dsh --profile web` и показывает веб-интерфейс
в своём окне. Крестик прячет окно в трей, иконка в трее возвращает его.
**Инстанс всегда один**: повторный запуск не открывает второе окно, а
разворачивает уже работающее (в том числе свёрнутое) и завершается сам; уже
поднятый dsh при этом не перезапускается.

```sh
bun install         # сборка: neu и плагин builder
bun run build       # бинари со вшитым кодом + AppImage, с проверкой
bun test            # тесты одного инстанса
```

Подробности: [deepseek-desktop/README.md](deepseek-desktop/README.md).

## Лицензия

MIT — см. [LICENSE](LICENSE).
