# deepseek-desktop

Окно для DeepSeek Harness: при запуске поднимает `dsh --profile web` и
показывает его интерфейс. Крестик прячет окно в трей, клик по иконке в трее
возвращает его. Собран на Neutralinojs.

Держит **один инстанс**: повторный запуск не открывает второе окно, а
разворачивает уже работающее (в том числе свёрнутое в трей) и завершается сам.
dsh-сервер второго окно не трогает — если он уже поднят, окно к нему
подключается.

```sh
bun install        # зависимости сборки (neu + builder)
bun run build      # бинари со вшитым кодом + AppImage, с проверкой результата
bun run build:bin  # только бинари, без AppImage
bun test           # тесты одного инстанса
bun start          # neu run, разработка
```

Готовое к запуску: `dist/deepseek-launcher/deepseek-launcher-linux_x64` или
`dist/linux/*.AppImage`.

Один инстанс работает через unix-сокет (named pipe на Windows) в
[`resources/js/single-instance.cjs`](resources/js/single-instance.cjs): кто успел
занять адрес, тот и основной, повторный запуск просит его показать окно.
Хелпер лежит во встроенных ресурсах и распаковывается в temp при старте —
поэтому работает и из `dist/`, и из AppImage, и из копии, поставленной
ярлыком. Рантайм ищется по `bin/` (качается `neu update`); клиентская
библиотека — `resources/neutralino.js`.

## License

[MIT](LICENSE)

## Icon credits

- `trayIcon.png` — Made by [Freepik](https://www.freepik.com) and downloaded from [Flaticon](https://www.flaticon.com)
