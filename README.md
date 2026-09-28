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

## Лицензия

MIT — см. [LICENSE](LICENSE).
