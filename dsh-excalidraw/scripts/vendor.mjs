/**
 * Vendor the Excalidraw assets and build the board host app.
 *
 * 1. Copies the production build of `@excalidraw/excalidraw` (served from
 *    `static/assets/`, including its chunks, locales and fonts) from
 *    `node_modules`. The CJK font (Xiaolai, ~13 MB) is skipped to keep the
 *    plugin lean; the remaining fonts cover Latin/Cyrillic UIs.
 * 2. Builds `static-src/main.jsx` into `static/board-app.js` with `bun build`
 *    (React bundled, Excalidraw imported by URL at runtime).
 * 3. Writes `static/board.html` — the iframe document the sidebar tab loads.
 *
 * Run from the plugin directory: `node scripts/vendor.mjs`. The produced files
 * are committed, so a normal install never needs a build step.
 */

import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

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
	console.error('missing @excalidraw/excalidraw — run `npm install @excalidraw/excalidraw` (or `bun add`) at the workspace root first');
	process.exit(1);
}
/** Locate the bundler: `bun` on PATH, the known asdf/bun install, or $BUN_BIN. */
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

const sourceRoot = path.join(excalidrawRoot, 'dist', 'prod');

const assetsDir = path.join(root, 'static', 'assets');
await rm(assetsDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });

// Copy the production tree, skipping the heavy CJK font set.
for (const entry of await readdirEntries(sourceRoot)) {
	if (entry.name === 'fonts') {
		await mkdir(path.join(assetsDir, 'fonts'), { recursive: true });
		for (const font of await readdirEntries(entry.full)) {
			if (font.name === 'Xiaolai') continue;
			await cp(font.full, path.join(assetsDir, 'fonts', font.name), { recursive: true });
		}
		continue;
	}
	await cp(entry.full, path.join(assetsDir, entry.name), { recursive: true });
}

async function readdirEntries(dir) {
	const { readdir } = await import('node:fs/promises');
	const names = await readdir(dir);
	return names.map((name) => ({ name, full: path.join(dir, name) }));
}

// Build the board app. Excalidraw stays external — the source imports it under
// a synthetic specifier that board.html maps to the served asset URL.
const bun = bunBin();
const appOut = path.join(root, 'static', 'board-app.js');
execFileSync(bun, [
	'build',
	path.join(root, 'static-src', 'main.jsx'),
	'--outfile', appOut,
	'--minify',
	'--target', 'browser',
	'--external=excalidraw-host'
], { stdio: 'inherit', env: { ...process.env, BUN_INSTALL: process.env.BUN_INSTALL ?? '/tmp/bun-install', BUN_CACHE_DIR: process.env.BUN_CACHE_DIR ?? '/tmp/bun-cache' } });

// The iframe document.
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Excalidraw</title>
<link rel="stylesheet" href="/api/excalidraw/assets/index.css" />
<style>
  html, body, #root { height: 100%; margin: 0; }
  .ex-root { position: relative; height: 100%; }
  .ex-status { position: absolute; top: 8px; right: 8px; z-index: 2; font: 12px/1.4 system-ui, sans-serif; color: #666; background: rgba(255,255,255,.85); padding: 2px 8px; border-radius: 8px; pointer-events: none; }
  .ex-status-loading, .ex-status-no-session { left: 8px; right: auto; }
</style>
</head>
<body>
<div id="root"></div>
<script type="importmap">
{ "imports": { "excalidraw-host": "/api/excalidraw/assets/index.js" } }
</script>
<script type="module" src="/api/excalidraw/board-app.js"></script>
</body>
</html>
`;
await writeFile(path.join(root, 'static', 'board.html'), html);

// Record what was vendored, so upgrades know what to re-run.
const vendorNote = `# Vendored Excalidraw

- Source: \`@excalidraw/excalidraw@${pkg.dependencies?.['@excalidraw/excalidraw'] ?? pkg.devDependencies?.['@excalidraw/excalidraw'] ?? 'unknown'}\`
- License: MIT (Excalidraw).
- \`assets/\` is the package's \`dist/prod\` tree (the CJK font set is omitted).
- \`board-app.js\` is built from \`../static-src/main.jsx\` with \`bun build\`.
- Re-generate everything with \`node scripts/vendor.mjs\` after upgrading the package.
`;
await writeFile(path.join(root, 'static', 'VENDOR.md'), vendorNote);

console.log(`vendored Excalidraw -> ${assetsDir}`);
console.log(`built board app -> ${appOut}`);
