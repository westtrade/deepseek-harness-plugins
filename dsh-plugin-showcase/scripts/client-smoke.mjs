/**
 * Проверка клиентского бандла: `lib/client.js` исполняется как в браузере —
 * CommonJS-фабрика на `window.__ModuleLoader__`, из внешнего только `react`.
 *
 * Запуск: `node scripts/client-smoke.mjs`
 */

import { readFile } from 'node:fs/promises';

let pass = 0;
let fail = 0;
function ok(label, condition, extra = '') {
	if (condition) {
		pass += 1;
		return;
	}
	fail += 1;
	console.log('FAIL:', label, extra);
}

/** Минимальный React: бандл зовёт createElement и хуки. */
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
	useEffect: () => {},
	useCallback: (fn) => fn,
	useMemo: (fn) => fn(),
	useRef: (value) => ({ current: value })
};

/** Фейковый клиентский контекст: записывает регистрации. */
function fakeContext() {
	const slots = [];
	const dictionaries = [];
	const effects = [];
	const languages = [];
	let activeSlot = null;
	const ctx = {
		locale: {
			bind: () => (key) => key,
			register: (ns, dicts) => {
				dictionaries.push({ ns, dicts });
				return () => {};
			},
			addLanguage: (input) => {
				languages.push(input);
				return () => {};
			}
		},
		slots: {
			// Бандл зовёт ctx.slots.register ВНУТРИ фабрики inject, поэтому
			// регистрация запоминает слот, в который её позвали.
			inject: (name, factory) => {
				effects.push(name);
				activeSlot = name;
				try {
					return factory();
				} finally {
					activeSlot = null;
				}
			},
			register: (spec, component) => {
				slots.push({ slot: activeSlot, spec, component });
				return () => {};
			}
		},
		effect: (fn) => {
			const dispose = fn();
			effects.push(typeof dispose === 'function' ? dispose : () => {});
			return dispose;
		}
	};
	return { ctx, slots, dictionaries, languages };
}

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');

let registration;
globalThis.window = {
	__ModuleLoader__: {
		load: (input) => {
			registration = input;
		}
	}
};

// eslint-disable-next-line no-new-func
new Function('window', source)(globalThis.window);

ok('бандл зарегистрировался', registration !== undefined);
ok('id совпадает с именем пакета', registration?.id === 'dsh-plugin-showcase', registration?.id);

const module = registration.factory((name) => {
	if (name === 'react') return reactStub;
	throw new Error(`неожиданный require: ${name}`);
});

ok('экспортирует apply', typeof module.apply === 'function');
ok('экспортирует inject', Array.isArray(module.inject));
ok('inject — slots и locale', JSON.stringify(module.inject) === JSON.stringify(['slots', 'locale']));

const { ctx, slots, dictionaries, languages } = fakeContext();
module.apply(ctx);

ok('словари зарегистрированы', dictionaries.length === 1, String(dictionaries.length));
const dicts = dictionaries[0]?.dicts ?? {};
ok('три языка', ['en', 'zh', 'ru'].every((lang) => dicts[lang] !== undefined));
ok('русский словарь не пуст', Object.keys(dicts.ru ?? {}).length > 5);
ok('ключи en и ru совпадают',
	JSON.stringify(Object.keys(dicts.en ?? {}).sort()) === JSON.stringify(Object.keys(dicts.ru ?? {}).sort()));
ok('язык ru добавлен', languages.some((lang) => lang.id === 'ru'));

ok('строка в сайдбаре', slots.some((slot) => slot.slot === 'sidebar.panellist' && slot.spec.id === 'plugin-showcase'));
ok('страница в main', slots.some((slot) => slot.slot === 'main' && slot.spec.key === 'plugin-showcase'));

const sidebar = slots.find((slot) => slot.slot === 'sidebar.panellist');
const glyph = sidebar?.component?.({ size: 16 });
ok('иконка рисуется', glyph?.type === 'svg', String(glyph?.type));

const page = slots.find((slot) => slot.slot === 'main');
ok('компонент страницы — функция', typeof page?.component === 'function');
ok('ключ панели и строки совпадают', sidebar?.spec.id === page?.spec.key);

console.log(`client: ${pass} ok, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
