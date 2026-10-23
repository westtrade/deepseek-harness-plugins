# dsh-excalidraw

Доска **Excalidraw** для каждого чата в DeepSeek Harness. Плагин добавляет
в правую боковую панель (где сейчас открываются файлы) вкладку **Excalidraw**
— общий белый холст: рисует человек в браузере, а агент может читать доску и
рисовать на ней инструментами `excalidraw_read` / `excalidraw_write`.

## Что делает

- **У каждого чата своя доска.** Сцена хранится на хосте по id сессии
  (`$DSH_HOME/excalidraw-boards.json`) и переживает перезагрузку плагина.
- **Вкладка в правом сайдбаре** регистрируется рядом с файлами: свежий
  Excalidraw (продакшн-сборка из `@excalidraw/excalidraw`, MIT) отдаётся с
  хоста и открывается в iframe. Изменения сохраняются автоматически
  (дебаунс ~0.8 c).
- **Инструменты агента**:
  - `excalidraw_read` — прочитать сцену текущего чата (или указанного
    `sessionId`): все элементы с координатами, размерами, цветами и текстом;
  - `excalidraw_write` — нарисовать: `upsert` (добавить/заменить элементы по
    id, id можно не указывать), `deleteIds` (удалить), `clear` (очистить).
    Агент пишет в ту же доску, которую видит человек, — изменения появляются
    мгновенно.

## Установка

Ссылка на каталог плагина и запись в слой патча профиля:

```sh
git clone https://github.com/westtrade/deepseek-harness-plugins ~/deepseek-harness-plugins
mkdir -p ~/.dsh/profiles/node_modules
ln -sfn ~/deepseek-harness-plugins/dsh-excalidraw \
        ~/.dsh/profiles/node_modules/dsh-excalidraw
```

`~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: excalidraw
      name: 'file:///home/USER/.dsh/profiles/node_modules/dsh-excalidraw/lib/index.js?rev=1'
      config: {}
```

Обновите страницу GUI (без `patchReload: live` — перезапустите `dsh web`).
Вкладка появляется в правой панели рядом с файлами; откройте её для любого
чата.

## Как это устроено

- `lib/index.js` — хостовый плагин: статика (приложение доски и вендоренные
  ассеты Excalidraw) под `/api/excalidraw/*` и API доски
  `GET/PUT /api/excalidraw/boards/<sessionId>`.
- `lib/store.js` — хранилище сцен (один JSON-файл, атомарная запись через
  временный файл + `rename`).
- `lib/client.js` — клиентский плагин: тип вкладки через
  `ctx.sidebarRightTabs.register(...)` и тело/заголовок через слоты
  `sidebar.right.pane.tab` / `sidebar.right.pane.tab.title`.
- `static/` — вендоренные ассеты (`assets/` = `dist/prod` из
  `@excalidraw/excalidraw`, без CJK-шрифта ~13 МБ) и собранное приложение
  (`board-app.js`, `board.html`). Всё закоммичено — обычная установка ничего
  не собирает.
- `static-src/main.jsx` — исходник приложения доски (React + Excalidraw).
  Собирается командой `node scripts/vendor.mjs` (нужны `bun` и пакеты из
  `devDependencies`); после апгрейда `@excalidraw/excalidraw` пересоберите
  и перекоммитьте `static/`.

## Безопасность

- Статика отдаётся только из `static/`; выход за её пределы (`..`,
  `%2e%2e`, NUL) запрещён.
- API доски открыто любому вызывающему на том же хосте — это iframe вкладки и
  инструменты агента; «человек или ИИ» разделения для доски не требуется.

## Проверка

```sh
node scripts/host-test.mjs    # API доски, статика, инструменты, контракты схем: 32
node scripts/client-smoke.mjs # обвязка вкладки: 29
```
