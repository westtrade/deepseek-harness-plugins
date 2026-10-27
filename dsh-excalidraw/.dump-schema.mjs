/**
 * Print the JSON Schema DSH derives from this plugin's tool declarations — the
 * exact `parameters` object that goes to the model provider.
 */
import { pathToFileURL } from 'node:url';
const plugins = ['../dsh-excalidraw/lib/index.js', '../dsh-cron-schedule/lib/index.js'].map((p) => new URL(p, import.meta.url));

for (const url of plugins) {
	const mod = await import(url.href);
	const tools = new Map();
	const fakeCtx = {
		logger: { info() {}, warn() {}, error() {} },
		effect() {},
		on() {},
		webServer: { register() { return () => {}; } },
		settings: { register() { return () => {}; } },
		sidebarRightTabs: { register() { return () => {}; } },
		inject(names, callback) {
			const services = {};
			for (const name of names) {
				if (name === 'tools') {
					services.tools = { register(definition) { tools.set(definition.name, definition); } };
				} else services[name] = {};
			}
			callback({ ...fakeCtx, ...services });
		}
	};
	await mod.default?.(fakeCtx, {}) ?? await mod.apply?.(fakeCtx, {});
	console.log(`\n=== ${mod.name} (${mod.name === 'excalidraw' ? 'excalidraw' : 'cron'}) : ${tools.size} tools ===`);
	for (const [name, definition] of tools) {
		console.log(`\n--- ${name}`);
		console.log(JSON.stringify(definition.parameters, null, 1));
	}
}
