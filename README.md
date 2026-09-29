# deepseek-harness-plugins

Плагины для [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (команда `dsh`).

## `dsh-project-cost`

Учёт стоимости проектов: считает потраченные деньги по каждому проекту
(директории) по ценам [routerai.ru](https://routerai.ru/) и показывает сумму
в веб-интерфейсе — **прямо в дереве Workspaces** (бейдж справа в строке
директории и рядом с временем в строках сессий), **в строке метрик чата**
(после «Usage … / Ran for … / времени» под каждым ответом ассистента) и в
строке «Project costs» сайдбара — слева иконка, справа общая потраченная
сумма; клик открывает панель с таблицей.

```sh
node dsh-project-cost/scripts/report.mjs        # быстро: отчёт в терминале
node dsh-project-cost/scripts/report.mjs --json # сырой JSON
node dsh-project-cost/scripts/client-smoke.mjs  # проверка клиентской обвязки
```

Подробности и установка: [dsh-project-cost/README.md](dsh-project-cost/README.md).

## `dsh-cron-schedule`

Планировщик задач для ИИ: **в заданное время создаётся новый чат в выбранном
каталоге и получает задачу**. В веб-интерфейсе — панель «AI schedules» с
таблицей задач, добавлением и удалением, пресетами расписания и произвольным
cron-выражением, выбором каталога селектором существующих workspace или
файлпикером ОС. Для каждой задачи можно выбрать модель, а список допустимых
моделей задаётся на странице Settings. Пропущенные за время простоя запуски
показываются списком с кнопками «Выполнить» и «Пропустить» (либо догоняются
сами, если человек поставил галочку). ИИ сам может управлять расписаниями через
инструменты `cron_create`, `cron_list`, `cron_models`, `cron_describe`,
`cron_run`, `cron_delete`.

```sh
node dsh-cron-schedule/scripts/cron-test.mjs    # движок расписаний
node dsh-cron-schedule/scripts/store-test.mjs   # хранилище и планировщик
node dsh-cron-schedule/scripts/host-test.mjs    # маршруты и запуск чата
node dsh-cron-schedule/scripts/client-smoke.mjs # обвязка панели
```

Подробности и установка: [dsh-cron-schedule/README.md](dsh-cron-schedule/README.md).

## Лицензия

MIT — см. [LICENSE](LICENSE).
