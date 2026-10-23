/**
 * Vendor the Excalidraw assets and build the board app.
 *
 * The published `@excalidraw/excalidraw` build is *not* a standalone browser
 * bundle: it imports a dozen npm packages by bare specifier (radix, jotai,
 * roughjs, clsx, nanoid…). A browser cannot load that over HTTP, so the graph is
 * resolved here, once, by `bun build`. The result — our board app plus Excalidraw
 * plus React — becomes `static/app/`, a self-contained ESM tree with code-split
 * chunks for locales and mermaid.
 *
 * Only the runtime-by-URL assets (fonts, embedded data) are copied next to it:
 * Excalidraw resolves those against `window.EXCALIDRAW_ASSET_PATH`.
 *
 * Run from the plugin directory: `node scripts/vendor.mjs`. The output is
 * committed, so installing the plugin never needs a build step. Requires the
 * devDependencies (`bun install` at the workspace root) and `bun` on PATH.
 */

import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pkg = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(path.join(root, 'package.json'), 'utf8')));

/** Find a package by walking up the node_modules chain from the plugin root. */
function findPackage(name) {
	let dir = root;
	for (;;) {
		const candidate = path.join(dir, 'node_modules', name);
		if (existsSync(candidate)) return candidate;
		const parent = path.dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}
const excalidrawRoot = findPackage('@excalidraw/excalidraw');
if (excalidrawRoot === undefined) {
	console.error('missing @excalidraw/excalidraw — install the devDependencies first (`bun install` at the workspace root)');
	process.exit(1);
}

/** Locate the bundler. */
function bunBin() {
	const candidates = [
		process.env.BUN_BIN,
		'/home/io/.asdf/installs/bun/1.4.2/bin/bun'
	].filter(Boolean);
	for (const candidate of candidates) if (existsSync(candidate)) return candidate;
	for (const dir of process.env.PATH?.split(path.delimiter) ?? []) {
		const candidate = path.join(dir, 'bun');
		if (existsSync(candidate)) return candidate;
	}
	throw new Error('bun not found — set BUN_BIN to a bun binary');
}
const bun = bunBin();
const bunEnv = {
	...process.env,
	BUN_INSTALL: process.env.BUN_INSTALL ?? '/tmp/bun-install',
	BUN_CACHE_DIR: process.env.BUN_CACHE_DIR ?? '/tmp/bun-cache'
};

async function readdirEntries(dir) {
	const { readdir } = await import('node:fs/promises');
	const names = await readdir(dir);
	return names.map((name) => ({ name, full: path.join(dir, name) }));
}

// --- 1. Runtime-by-URL assets (fonts, embedded data) -------------------
const assetRoot = path.join(excalidrawRoot, 'dist', 'prod');
const assetsDir = path.join(root, 'static', 'assets');
await rm(assetsDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });
for (const entry of await readdirEntries(assetRoot)) {
	if (entry.name !== 'fonts' && entry.name !== 'data') continue;
	if (entry.name === 'fonts') {
		await mkdir(path.join(assetsDir, 'fonts'), { recursive: true });
		for (const font of await readdirEntries(entry.full)) {
			// The CJK font set is ~13 MB of subsets; without it the browser falls
			// back to system fonts for CJK text, and everything else still loads.
			if (font.name === 'Xiaolai') continue;
			await cp(font.full, path.join(assetsDir, 'fonts', font.name), { recursive: true });
		}
		continue;
	}
	await cp(entry.full, path.join(assetsDir, entry.name), { recursive: true });
}

// --- 2. The board app: app + Excalidraw + React in one ESM tree --------
const appDir = path.join(root, 'static', 'app');
await rm(appDir, { recursive: true, force: true });
execFileSync(bun, [
	'build',
	path.join(root, 'static-src', 'main.jsx'),
	'--outdir', appDir,
	'--minify',
	'--target', 'browser',
	'--splitting',
	'--define', 'process.env.NODE_ENV="production"'
], { stdio: 'inherit', env: bunEnv });

// --- 2b. The stylesheet ------------------------------------------------
// `@excalidraw/excalidraw`'s `./index.css` export is condition-gated, so the
// production stylesheet is copied verbatim next to the bundle and linked from
// the page. Without it the canvas has no definite size (see main.jsx).
await cp(path.join(assetRoot, 'index.css'), path.join(appDir, 'excalidraw.css'));

// --- 3. The iframe document -------------------------------------------
// The inline handler is installed BEFORE the module graph: a module that fails
// to load never runs its own error listener, and the tab would sit on
// "Loading…" forever with no clue why (which is exactly what it used to do).
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Excalidraw</title>
<link rel="stylesheet" href="/api/excalidraw/app/excalidraw.css" />
<style>
  html, body, #root { height: 100%; margin: 0; background: #fff; }
  /* Excalidraw sizes itself to 100% of its parent: the wrapper must own the
     viewport, or the canvas collapses to nothing. */
  .ex-root { position: relative; width: 100%; height: 100%; }
  #board-status { position: fixed; top: 8px; left: 8px; z-index: 30; max-width: calc(100% - 16px); font: 12px/1.4 system-ui, sans-serif; color: #333; background: rgba(255,255,255,.94); border: 1px solid rgba(0,0,0,.1); padding: 3px 8px; border-radius: 8px; pointer-events: none; }
  #board-status.error { color: #b00020; border-color: rgba(176,0,32,.4); white-space: pre-wrap; }
</style>
</head>
<body>
<div id="board-status">Loading…</div>
<div id="root"></div>
<script>
  // Read by Excalidraw for its font and embedded-data URLs.
  window.EXCALIDRAW_ASSET_PATH = "/api/excalidraw/assets/";
  (function () {
    var status = document.getElementById("board-status");
    var show = function (message) {
      if (!status) return;
      status.textContent = "board failed: " + message;
      status.className = "error";
    };
    window.addEventListener("error", function (event) {
      show((event && (event.message || event.error)) || "unknown error");
    });
    window.addEventListener("unhandledrejection", function (event) {
      show((event && event.reason) || "unhandled rejection");
    });
    window.__boardStatus = function (text, isError) {
      if (!status) return;
      status.textContent = text;
      status.className = isError ? "error" : "";
    };
  }());
</script>
<script type="module" src="/api/excalidraw/app/main.js" onerror="window.__boardStatus && window.__boardStatus('board failed: bundle did not load', true)"></script>
</body>
</html>
`;
await writeFile(path.join(root, 'static', 'board.html'), html);

// --- 4. Record what was vendored --------------------------------------
const vendorNote = `# Vendored Excalidraw

- Source: \`@excalidraw/excalidraw@${pkg.devDependencies?.['@excalidraw/excalidraw'] ?? 'unknown'}\` (MIT).
- \`app/\` is the bundled board app: \`../static-src/main.jsx\` + Excalidraw + React,
  built by \`bun build\` with code splitting (locale and mermaid chunks).
  Excalidraw's published build imports npm packages by bare specifier, so it
  cannot be served to a browser unbundled.
- \`assets/\` holds only what Excalidraw fetches by URL at runtime: \`fonts/\` and
  \`data/\`. The CJK font set (Xiaolai, ~13 MB) is omitted; CJK text falls back
  to system fonts.
- Re-generate everything with \`node scripts/vendor.mjs\` after upgrading the package.
`;
await writeFile(path.join(root, 'static', 'VENDOR.md'), vendorNote);

console.log(`assets -> ${assetsDir}`);
console.log(`board  -> ${appDir}`);
