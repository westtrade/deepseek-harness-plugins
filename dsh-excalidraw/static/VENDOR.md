# Vendored Excalidraw

- Source: `@excalidraw/excalidraw@0.18.1` (MIT).
- `app/` is the bundled board app: `../static-src/main.jsx` + Excalidraw + React,
  built by `bun build` with code splitting (locale and mermaid chunks).
  Excalidraw's published build imports npm packages by bare specifier, so it
  cannot be served to a browser unbundled.
- `assets/` holds only what Excalidraw fetches by URL at runtime: `fonts/` and
  `data/`. The CJK font set (Xiaolai, ~13 MB) is omitted; CJK text falls back
  to system fonts.
- Re-generate everything with `node scripts/vendor.mjs` after upgrading the package.
