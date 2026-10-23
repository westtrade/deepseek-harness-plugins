# Vendored Excalidraw

- Source: `@excalidraw/excalidraw@0.18.1`
- License: MIT (Excalidraw), MIT (React — vendor builds only, runtime not bundled).
- `assets/` is the package's `dist/prod` tree (the CJK font set is omitted).
- `vendor/` are ESM builds of React/React-DOM compiled from the workspace
  `node_modules` with `bun build`, used by the board page's import map.
- `board-app.js` is built from `../static-src/main.jsx` with `bun build`.
- Re-generate everything with `node scripts/vendor.mjs` after upgrading the package.
