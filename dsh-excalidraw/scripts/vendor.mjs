/**
 * Vendor the Excalidraw assets and build the board host app.
 *
 * 1. Copies the production build of `@excalidraw/excalidraw` (served from
 *    `static/assets/`, including its chunks, locales and fonts) from the
 *    workspace `node_modules`. The CJK font (Xiaolai, ~13 MB) is skipped to
 *    keep the plugin lean; the remaining fonts cover Latin/Cyrillic UIs.
 * 2. Builds ESM vendor builds of React/React-DOM from the same `node_modules`
 *    (the Excalidraw prod build imports those as bare specifiers; the board
 *    page maps them to these files).
 * 3. Builds `static-src/main.jsx` into `static/board-app.js` with `bun build`
 *    — React and Excalidraw stay external, so the page's import map provides
 *    one shared instance of each.
 * 4. Writes `static/board.html` — the iframe document the sidebar tab loads,
 *    with the import map wiring everything together.
 *
 * Run from the plugin directory: `node scripts/vendor.mjs`. The produced files
 * are committed, so a normal install never needs a build step.
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

const bunEnv = { ...process.env, BUN_INSTALL: process.env.BUN_INSTALL ?? '/tmp/bun-install', BUN_CACHE_DIR: process.env.BUN_CACHE_DIR ?? '/tmp/bun-cache' };

// --- 1. Excalidraw production tree ------------------------------------
const assetRoot = path.join(excalidrawRoot, 'dist', 'prod');
const assetsDir = path.join(root, 'static', 'assets');
await rm(assetsDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });

async function readdirEntries(dir) {
	const { readdir } = await import('node:fs/promises');
	const names = await readdir(dir);
	return names.map((name) => ({ name, full: path.join(dir, name) }));
}

for (const entry of await readdirEntries(assetRoot)) {
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

// --- 2. ESM vendor builds of React (for the import map) ----------------
const vendorDir = path.join(root, 'static', 'vendor');
await rm(vendorDir, { recursive: true, force: true });
await mkdir(vendorDir, { recursive: true });

const vendorEntries = {
	'react.mjs': `export * from 'react';\nexport { default } from 'react';\n`,
	'react-dom.mjs': `export * from 'react-dom';\nexport { default } from 'react-dom';\n`,
	'react-dom-client.mjs': `export * from 'react-dom/client';\nexport { default } from 'react-dom/client';\n`,
	'jsx-runtime.mjs': `export * from 'react/jsx-runtime';\nexport { default } from 'react/jsx-runtime';\n`,
	'jsx-dev-runtime.mjs': `export * from 'react/jsx-dev-runtime';\nexport { default } from 'react/jsx-dev-runtime';\n`
};
const vendorSrcDir = path.join(root, 'static-src', 'vendor');
await rm(vendorSrcDir, { recursive: true, force: true });
await mkdir(vendorSrcDir, { recursive: true });
for (const [name, source] of Object.entries(vendorEntries)) {
	const src = path.join(vendorSrcDir, name.replace(/\.mjs$/, '.js'));
	await writeFile(src, source);
}
const bun = bunBin();
execFileSync(bun, [
	'build',
	...Object.keys(vendorEntries).map((name) => path.join(vendorSrcDir, name.replace(/\.mjs$/, '.js'))),
	'--outdir', vendorDir,
	'--minify',
	'--target', 'browser',
	'--format', 'esm'
], { stdio: 'inherit', env: bunEnv });
// bun names outputs after the entry files; adopt the .mjs names the page maps.
for (const name of Object.keys(vendorEntries)) {
	const built = path.join(vendorDir, name.replace(/\.mjs$/, '.js'));
	if (existsSync(built)) await import('node:fs/promises').then((fs) => fs.rename(built, path.join(vendorDir, name)));
}

// --- 3. The board app --------------------------------------------------
// React and Excalidraw stay external: the page's import map provides them, so
// one React instance is shared by our app and by Excalidraw's own graph.
const appOut = path.join(root, 'static', 'board-app.js');
execFileSync(bun, [
	'build',
	path.join(root, 'static-src', 'main.jsx'),
	'--outfile', appOut,
	'--minify',
	'--target', 'browser',
	'--external=react',
	'--external=react-dom',
	'--external=react-dom/client',
	'--external=react/jsx-runtime',
	'--external=excalidraw-host'
], { stdio: 'inherit', env: bunEnv });

// --- 4. The iframe document -------------------------------------------
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
  .ex-status { position: absolute; top: 8px; left: 8px; z-index: 20; font: 12px/1.4 system-ui, sans-serif; color: #333; background: rgba(255,255,255,.9); padding: 3px 8px; border-radius: 8px; pointer-events: none; }
  .ex-status-error { color: #b00020; }
</style>
</head>
<body>
<div id="root"><div class="ex-status">Loading…</div></div>
<script type="importmap">
{ "imports": {
  "react": "/api/excalidraw/vendor/react.mjs",
  "react-dom": "/api/excalidraw/vendor/react-dom.mjs",
  "react-dom/client": "/api/excalidraw/vendor/react-dom-client.mjs",
  "react/jsx-runtime": "/api/excalidraw/vendor/jsx-runtime.mjs",
  "react/jsx-dev-runtime": "/api/excalidraw/vendor/jsx-dev-runtime.mjs",
  "excalidraw-host": "/api/excalidraw/assets/index.js"
} }
</script>
<script type="module" src="/api/excalidraw/board-app.js"></script>
</body>
</html>
`;
await writeFile(path.join(root, 'static', 'board.html'), html);

// Record what was vendored, so upgrades know what to re-run.
const vendorNote = `# Vendored Excalidraw

- Source: \`@excalidraw/excalidraw@${pkg.devDependencies?.['@excalidraw/excalidraw'] ?? 'unknown'}\`
- License: MIT (Excalidraw), MIT (React — vendor builds only, runtime not bundled).
- \`assets/\` is the package's \`dist/prod\` tree (the CJK font set is omitted).
- \`vendor/\` are ESM builds of React/React-DOM compiled from the workspace
  \`node_modules\` with \`bun build\`, used by the board page's import map.
- \`board-app.js\` is built from \`../static-src/main.jsx\` with \`bun build\`.
- Re-generate everything with \`node scripts/vendor.mjs\` after upgrading the package.
`;
await writeFile(path.join(root, 'static', 'VENDOR.md'), vendorNote);

console.log(`vendored Excalidraw -> ${assetsDir}`);
console.log(`vendored React ESM  -> ${vendorDir}`);
console.log(`built board app       -> ${appOut}`);
