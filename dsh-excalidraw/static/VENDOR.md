# Vendored Excalidraw

- Source: `@excalidraw/excalidraw@0.18.1`
- License: MIT (Excalidraw).
- `assets/` is the package's `dist/prod` tree (the CJK font set is omitted).
- `board-app.js` is built from `../static-src/main.jsx` with `bun build`.
- Re-generate everything with `node scripts/vendor.mjs` after upgrading the package.
