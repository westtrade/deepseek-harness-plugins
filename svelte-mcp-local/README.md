# svelte-mcp-local

MCP-сервер документации Svelte с локальным кешем. Тот же сервер, что и
`@sveltejs/mcp` — те же четыре инструмента (`get-documentation`,
`list-sections`, `playground-link`, `svelte-autofixer`), тот же код, — но
документация читается с диска, а не с `svelte.dev` при каждом вызове.

## Зачем

Оригинальный сервер ходит в сеть на каждый `list-sections` и на каждый
`get-documentation`: сначала `sections.json`, потом `llms.txt` нужного
раздела. Это 0.5–1.5 с на вызов, а если сайт недоступен — падение процесса:
таймаут `fetch` уходит необработанным и убивает сервер.

Кеш снимает и то, и другое: ответы мгновенные, сеть не нужна вовсе.

## Как устроено

`@sveltejs/mcp` не копируется и не патчится — он запускается как есть, но с
подменённым `globalThis.fetch`: два вида запросов (`sections.json` и
`*.llms.txt`) отдаются из кеша, всё остальное уходит в сеть как обычно.
Поэтому `svelte-autofixer` и `playground-link` ведут себя ровно так же, как в
оригинале — им сеть не нужна и не была нужна.

```
bin/cli.mjs        точка входа: сервер / update / status
lib/server.mjs     запуск оригинального сервера с подменённым fetch
lib/fetch-cache.mjs подмена fetch
lib/slice.mjs      нарезка llms-full.txt на главы по каталогу
lib/update.mjs     скачивание двух файлов и запись кеша
lib/cache.mjs      раскладка кеша на диске
cache/             снимок документации, собранный при сборке
```

## Кеш

Два запроса вместо двухсот трёх:

| файл | что даёт | размер |
|---|---|---|
| `sections.json` | каталог: слаги, заголовки, `use_cases`, порядок глав | 19 КБ |
| `llms-full.txt` | вся документация одним файлом | 1.26 МБ |

`llms-full.txt` разбит на четыре группы (`Start of Svelte documentation`,
`… SvelteKit …`, `… Svelte CLI …`, `… Svelte AI …`). Главы внутри группы
сопоставляются с каталогом **по порядку**, а не поиском по всему файлу:
заголовки не уникальны — `Overview` встречается четыре раза.

Заголовки `# …` внутри блоков кода главами не считаются, иначе shell-примеры
(`# Install a community add-on`) попали бы в оглавление.

Кеш лежит в `cache/` этого пакета — в репозитории он лежит снимком на момент
сборки, поэтому работает офлайн сразу после установки.

## Установка

```sh
cd svelte-mcp-local && bun install   # node_modules не в репозитории
```

## Команды

```sh
svelte-mcp-local            # запустить MCP-сервер (stdio)
svelte-mcp-local update     # обновить кеш из сети
svelte-mcp-local status     # что в кеше
```

`update` качает оба файла и раскладывает главы в `cache/<слаг>/llms.txt`.
Соединение с сайтом иногда не укладывается в таймаут — запросы повторяются.
Обновление атомарно по смыслу: при сетевой ошибке старый кеш остаётся на
месте, сервер продолжает работать.

## Подключение

В профиле dsh (`~/.dsh/profiles/<profile>/cordis.patch.yml`):

```yaml
- id: mcp-svelte
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: svelte
    transport: stdio
    command: /usr/bin/node
    args: ['/path/to/svelte-mcp-local/bin/cli.mjs']
    toolCallTimeoutMs: 180000
```

`node`, а не `bun`: шим `~/.bun/bin/svelte-mcp` не подходит — у него shebang
`#!/usr/bin/env node`, а MCP-клиент запускает процесс с вычищенным окружением,
где node в PATH может не оказаться. Абсолютный путь к `node` снимает вопрос.

## Проверка

```sh
node test/cache.test.mjs
```
