window.__ModuleLoader__.load({
	id: "dsh-plugin-showcase",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region lib/types/client/index.js
		/** This package's copy namespace. */
		const NS = "pluginShowcase";
		/** Sidebar row id and main-panel key: the same string links the two. */
		const PANEL_ID = "plugin-showcase";
		/** Browser services: the slot registry and copy. */
		const inject = ["slots", "locale"];

		/** Host routes (registered by the Host half). */
		const CATALOG_URL = "/api/plugin-showcase/catalog";
		const STARS_URL = "/api/plugin-showcase/stars";
		const INSTALL_URL = "/api/plugin-showcase/install";
		const REMOVE_URL = "/api/plugin-showcase/remove";

		/** Карточек на странице. */
		const PER_PAGE = 24;

		const en = {
			"panel.title": "Plugin showcase",
			"panel.subtitle": "Community plugins for DeepSeek Harness, installable from here",
			"panel.source": "Catalog: {source} · snapshot {date}",
			"panel.search": "Search by name or what it does…",
			"panel.category": "All categories",
			"panel.sort": "Sort",
			"panel.sortDefault": "Catalog order",
			"panel.sortStars": "By stars",
			"panel.loading": "Loading the catalog…",
			"panel.empty": "Nothing matches that search.",
			"panel.error": "Catalog unavailable: {message}",
			"panel.count": "{total} plugins",
			"panel.page": "Page {page} of {pages}",
			"panel.prev": "Back",
			"panel.next": "Next",
			"card.stars": "{count} stars",
			"card.install": "Install",
			"card.remove": "Remove",
			"card.installed": "Installed",
			"card.repo": "Open on GitHub",
			"card.installing": "Installing…",
			"card.removing": "Removing…",
			"notice.installed": "{name} installed — restart the profile to load it",
			"notice.removed": "{name} removed — restart the profile to unload it",
			"notice.failed": "Failed: {message}"
		};
		const zh = {
			"panel.title": "插件展示",
			"panel.subtitle": "DeepSeek Harness 社区插件，可在此直接安装",
			"panel.source": "目录：{source} · 快照 {date}",
			"panel.search": "按名称或功能搜索…",
			"panel.category": "全部类别",
			"panel.sort": "排序",
			"panel.sortDefault": "目录顺序",
			"panel.sortStars": "按星标",
			"panel.loading": "正在加载目录…",
			"panel.empty": "没有匹配的结果。",
			"panel.error": "目录不可用：{message}",
			"panel.count": "{total} 个插件",
			"panel.page": "第 {page} / {pages} 页",
			"panel.prev": "上一页",
			"panel.next": "下一页",
			"card.stars": "{count} 星",
			"card.install": "安装",
			"card.remove": "卸载",
			"card.installed": "已安装",
			"card.repo": "在 GitHub 打开",
			"card.installing": "安装中…",
			"card.removing": "卸载中…",
			"notice.installed": "{name} 已安装 — 重启配置后生效",
			"notice.removed": "{name} 已卸载 — 重启配置后生效",
			"notice.failed": "失败：{message}"
		};
		const ru = {
			"panel.title": "Витрина плагинов",
			"panel.subtitle": "Плагины сообщества для DeepSeek Harness, ставятся прямо отсюда",
			"panel.source": "Каталог: {source} · снимок {date}",
			"panel.search": "Поиск по названию или описанию…",
			"panel.category": "Все категории",
			"panel.sort": "Сортировка",
			"panel.sortDefault": "Порядок каталога",
			"panel.sortStars": "По звёздам",
			"panel.loading": "Загружаю каталог…",
			"panel.empty": "Ничего не нашлось.",
			"panel.error": "Каталог недоступен: {message}",
			"panel.count": "Плагинов: {total}",
			"panel.page": "Страница {page} из {pages}",
			"panel.prev": "Назад",
			"panel.next": "Вперёд",
			"card.stars": "{count} звёзд",
			"card.install": "Установить",
			"card.remove": "Удалить",
			"card.installed": "Установлен",
			"card.repo": "Открыть на GitHub",
			"card.installing": "Устанавливаю…",
			"card.removing": "Удаляю…",
			"notice.installed": "{name} установлен — перезапустите профиль, чтобы он загрузился",
			"notice.removed": "{name} удалён — перезапустите профиль, чтобы он выгрузился",
			"notice.failed": "Не вышло: {message}"
		};

		/** Подстановка `{name}` в строку словаря. */
		function fill(template, values) {
			return String(template).replace(/\{(\w+)\}/g, (whole, key) =>
				values[key] === undefined ? whole : String(values[key])
			);
		}

		/** Маленький хелпер разметки. */
		function el(tag, props, ...children) {
			return react.createElement(tag, props, ...children);
		}

		const COLORS = {
			card: "var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-elevated, #fff))",
			border: "var(--dsw-alias-border-l4, #d7dbe0)",
			primary: "var(--dsw-alias-interactive-bg-primary, #3a6df0)",
			labelPrimary: "var(--dsw-alias-label-primary, inherit)",
			labelSecondary: "var(--dsw-alias-label-secondary, inherit)",
			labelTertiary: "var(--dsw-alias-label-tertiary, inherit)",
			error: "var(--dsw-alias-state-error-primary, #c0392b)"
		};

		const inputStyle = {
			boxSizing: "border-box",
			padding: "6px 10px",
			borderRadius: "8px",
			border: `1px solid ${COLORS.border}`,
			background: "var(--dsw-alias-bg-base, transparent)",
			color: COLORS.labelPrimary,
			font: "inherit",
			fontSize: "13px"
		};

		/** Кнопка в общем стиле панели. */
		function button(label, onClick, options = {}) {
			return el(
				"button",
				{
					type: "button",
					onClick,
					disabled: options.disabled === true,
					title: options.title,
					style: {
						padding: options.compact === true ? "3px 9px" : "6px 12px",
						borderRadius: "7px",
						border: options.primary === true ? "none" : `1px solid ${COLORS.border}`,
						background: options.primary === true ? COLORS.primary : "transparent",
						color: options.primary === true ? "var(--dsw-alias-label-inverse, #fff)" : COLORS.labelPrimary,
						font: "inherit",
						fontSize: options.compact === true ? "12px" : "13px",
						cursor: options.disabled === true ? "default" : "pointer",
						opacity: options.disabled === true ? 0.5 : 1,
						whiteSpace: "nowrap"
					}
				},
				label
			);
		}

		/** Плашка со звёздами: `★ 1.2k`. */
		function formatStars(count) {
			if (count >= 1000) {
				const short = count / 1000;
				return `${short >= 10 ? Math.round(short) : short.toFixed(1).replace(/\.0$/, "")}k`;
			}
			return String(count);
		}

		/** Запрос к Host с разбором ошибки. */
		async function callHost(method, url, body) {
			const response = await fetch(url, {
				method,
				cache: "no-store",
				...(body === undefined
					? {}
					: { headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
			});
			let payload;
			try {
				payload = await response.json();
			} catch {
				payload = undefined;
			}
			if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);
			return payload;
		}

		/** Уведомление, тающее через несколько секунд. */
		function useNotice() {
			const [notice, setNotice] = react.useState(null);
			react.useEffect(() => {
				if (notice === null) return undefined;
				const timer = setTimeout(() => setNotice(null), 8000);
				return () => clearTimeout(timer);
			}, [notice]);
			return [notice, setNotice];
		}

		/**
		 * Картинка плагина.
		 *
		 * Аватар владельца репозитория — единственная картинка, которая есть
		 * почти у каждой записи: awesome-список не хранит превью. Он грузится с
		 * github.com напрямую; при ошибке остаётся монограмма.
		 */
		function CardImage({ entry }) {
			const [failed, setFailed] = react.useState(false);
			const letter = (entry.owner ?? entry.name).slice(0, 1).toUpperCase();
			const base = {
				width: "40px",
				height: "40px",
				borderRadius: "10px",
				flexShrink: 0,
				overflow: "hidden",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: "16px",
				fontWeight: 600,
				color: COLORS.labelSecondary,
				background: "var(--dsw-alias-bg-layer-2, #eef1f5)"
			};
			if (entry.owner === null || failed) return el("div", { style: base }, letter);
			return el(
				"div",
				{ style: base },
				el("img", {
					src: `https://github.com/${entry.owner}.png?size=80`,
					alt: "",
					width: 40,
					height: 40,
					loading: "lazy",
					referrerPolicy: "no-referrer",
					onError: () => setFailed(true),
					style: { width: "100%", height: "100%", objectFit: "cover" }
				})
			);
		}

		/**
		 * Одна карточка каталога: картинка, имя, категория, звёзды, описание и
		 * кнопка установки.
		 */
		function PluginCard({ entry, stars, busy, t, onInstall, onRemove }) {
			const count = stars === undefined ? entry.stars : stars;
			const action = entry.installed
				? button(t("card.remove"), () => onRemove(entry), {
						compact: true,
						title: entry.packageName ?? entry.repo ?? ""
					})
				: button(t("card.install"), () => onInstall(entry), {
						compact: true,
						primary: true,
						disabled: !entry.installable
					});

			return el(
				"div",
				{
					style: {
						display: "flex",
						flexDirection: "column",
						gap: "10px",
						padding: "12px",
						borderRadius: "12px",
						border: `1px solid ${entry.installed ? COLORS.primary : COLORS.border}`,
						background: COLORS.card,
						minHeight: "150px"
					}
				},
				el(
					"div",
					{ style: { display: "flex", gap: "10px", alignItems: "flex-start" } },
					el(CardImage, { entry }),
					el(
						"div",
						{ style: { minWidth: 0, flex: 1 } },
						el(
							"div",
							{
								style: {
									fontSize: "13px",
									fontWeight: 600,
									color: COLORS.labelPrimary,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								title: entry.repo ?? entry.url
							},
							entry.name
						),
						el(
							"div",
							{ style: { fontSize: "11px", color: COLORS.labelTertiary, marginTop: "2px" } },
							entry.category,
							count > 0 ? ` · ★ ${formatStars(count)}` : ""
						)
					)
				),
				el(
					"div",
					{
						style: {
							fontSize: "12px",
							lineHeight: "1.45",
							color: COLORS.labelSecondary,
							flex: 1,
							display: "-webkit-box",
							WebkitLineClamp: 3,
							WebkitBoxOrient: "vertical",
							overflow: "hidden"
						}
					},
					entry.description
				),
				el(
					"div",
					{ style: { display: "flex", gap: "8px", alignItems: "center", justifyContent: "space-between" } },
					el(
						"a",
						{
							href: entry.url,
							target: "_blank",
							rel: "noreferrer noopener",
							title: t("card.repo"),
							style: { fontSize: "12px", color: COLORS.labelTertiary, textDecoration: "none" }
						},
						entry.repo ?? entry.url
					),
					busy ? el("span", { style: { fontSize: "12px", color: COLORS.labelTertiary } }, busy) : action
				)
			);
		}

		/** Список страниц: `1 … 4 5 6 … 20`. */
		function pageNumbers(page, pages) {
			if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
			const wanted = new Set([1, pages, page, page - 1, page + 1]);
			const sorted = [...wanted].filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
			const result = [];
			for (let index = 0; index < sorted.length; index++) {
				if (index > 0 && sorted[index] - sorted[index - 1] > 1) result.push("…");
				result.push(sorted[index]);
			}
			return result;
		}

		/**
		 * Страница витрины: поиск, категория, сортировка, сетка карточек и
		 * постраничный переход.
		 */
		function ShowcasePanel({ t }) {
			const [state, setState] = react.useState({
				loading: true,
				error: null,
				page: 1,
				pages: 1,
				total: 0,
				items: [],
				categories: [],
				builtAt: null,
				source: null
			});
			const [query, setQuery] = react.useState("");
			const [debounced, setDebounced] = react.useState("");
			const [category, setCategory] = react.useState("");
			const [sort, setSort] = react.useState("");
			const [page, setPage] = react.useState(1);
			const [busy, setBusy] = react.useState({});
			const [stars, setStars] = react.useState({});
			const [notice, setNotice] = useNotice();

			// Поиск не должен бить по серверу на каждую букву.
			react.useEffect(() => {
				const timer = setTimeout(() => {
					setDebounced(query);
					setPage(1);
				}, 300);
				return () => clearTimeout(timer);
			}, [query]);

			const load = react.useCallback(async () => {
				const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
				if (debounced.trim() !== "") params.set("q", debounced.trim());
				if (category !== "") params.set("category", category);
				if (sort !== "") params.set("sort", sort);
				try {
					const payload = await callHost("GET", `${CATALOG_URL}?${params.toString()}`);
					setState({
						loading: false,
						error: null,
						page: payload.page,
						pages: payload.pages,
						total: payload.total,
						items: payload.items,
						categories: payload.categories,
						builtAt: payload.builtAt,
						source: payload.source
					});
				} catch (error) {
					setState((current) => ({ ...current, loading: false, error: error.message }));
				}
			}, [page, debounced, category, sort]);

			react.useEffect(() => {
				void load();
			}, [load]);

			// Живые звёзды для видимой страницы: снимок знает их не обо всех.
			react.useEffect(() => {
				const repos = state.items.map((item) => item.repo).filter((repo) => repo !== null);
				if (repos.length === 0) return undefined;
				let alive = true;
				callHost("GET", `${STARS_URL}?ids=${encodeURIComponent(repos.join(","))}`)
					.then((payload) => {
						if (alive && payload?.stars !== undefined) setStars((current) => ({ ...current, ...payload.stars }));
					})
					.catch(() => {
						/* звёзды — украшение: снимок остаётся запасным вариантом */
					});
				return () => {
					alive = false;
				};
			}, [state.items]);

			const run = async (entry, mode) => {
				setBusy((current) => ({ ...current, [entry.id]: mode === "install" ? t("card.installing") : t("card.removing") }));
				try {
					const payload = await callHost("POST", mode === "install" ? INSTALL_URL : REMOVE_URL, { id: entry.id });
					const name = payload?.packageName ?? entry.repo ?? entry.name;
					setNotice(
						fill(mode === "install" ? t("notice.installed") : t("notice.removed"), { name })
					);
					setBusy((current) => {
						const next = { ...current };
						delete next[entry.id];
						return next;
					});
					await load();
				} catch (error) {
					setNotice(fill(t("notice.failed"), { message: error.message }));
					setBusy((current) => {
						const next = { ...current };
						delete next[entry.id];
						return next;
					});
				}
			};

			if (state.loading && state.items.length === 0) {
				return el("div", { style: { padding: "16px", fontSize: "13px" } }, t("panel.loading"));
			}

			const built = state.builtAt === null ? "" : new Date(state.builtAt).toLocaleDateString();
			const numbers = pageNumbers(state.page, state.pages);

			return el(
				"div",
				{ style: { padding: "16px", display: "flex", flexDirection: "column", gap: "14px" } },
				el(
					"div",
					null,
					el("h2", { style: { margin: "0 0 4px", fontSize: "16px" } }, t("panel.title")),
					el("div", { style: { fontSize: "12px", color: COLORS.labelTertiary } }, t("panel.subtitle")),
					state.source === null
						? null
						: el(
								"div",
								{ style: { fontSize: "11px", color: COLORS.labelTertiary, marginTop: "2px" } },
								fill(t("panel.source"), { source: state.source, date: built })
							)
				),
				el(
					"div",
					{ style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
					el("input", {
						type: "search",
						value: query,
						placeholder: t("panel.search"),
						onChange: (event) => setQuery(event.target.value),
						style: { ...inputStyle, flex: "1 1 260px", minWidth: "200px" }
					}),
					el(
						"select",
						{
							value: category,
							onChange: (event) => {
								setCategory(event.target.value);
								setPage(1);
							},
							style: inputStyle
						},
						el("option", { value: "" }, t("panel.category")),
						state.categories.map((name) => el("option", { key: name, value: name }, name))
					),
					el(
						"select",
						{
							value: sort,
							onChange: (event) => {
								setSort(event.target.value);
								setPage(1);
							},
							style: inputStyle
						},
						el("option", { value: "" }, t("panel.sortDefault")),
						el("option", { value: "stars" }, t("panel.sortStars"))
					),
					el("span", { style: { fontSize: "12px", color: COLORS.labelTertiary } },
						fill(t("panel.count"), { total: state.total }))
				),
				state.error === null
					? null
					: el("div", { style: { color: COLORS.error, fontSize: "13px" } },
							fill(t("panel.error"), { message: state.error })),
				notice === null
					? null
					: el("div", { style: { fontSize: "13px", color: COLORS.labelSecondary } }, notice),
				state.items.length === 0
					? el("div", { style: { fontSize: "13px", color: COLORS.labelTertiary } }, t("panel.empty"))
					: el(
							"div",
							{
								style: {
									display: "grid",
									gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
									gap: "12px"
								}
							},
							state.items.map((entry) =>
								el(PluginCard, {
									key: entry.id,
									entry,
									t,
									stars: stars[entry.repo] ?? undefined,
									busy: busy[entry.id] ?? null,
									onInstall: (target) => void run(target, "install"),
									onRemove: (target) => void run(target, "remove")
								})
							)
						),
				el(
					"div",
					{ style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } },
					button(t("panel.prev"), () => setPage((current) => Math.max(1, current - 1)), {
						compact: true,
						disabled: state.page <= 1
					}),
					numbers.map((value, index) =>
						value === "…"
							? el("span", { key: `gap-${index}`, style: { fontSize: "12px", color: COLORS.labelTertiary } }, "…")
							: button(String(value), () => setPage(value), {
									compact: true,
									primary: value === state.page
								})
					),
					button(t("panel.next"), () => setPage((current) => Math.min(state.pages, current + 1)), {
						compact: true,
						disabled: state.page >= state.pages
					}),
					el("span", { style: { fontSize: "12px", color: COLORS.labelTertiary, marginLeft: "6px" } },
						fill(t("panel.page"), { page: state.page, pages: state.pages }))
				)
			);
		}

		/** Иконка в боковом меню: сетка из четырёх квадратов. */
		function ShowcaseGlyph({ size = 16 }) {
			return el(
				"svg",
				{ width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
				el("rect", { x: 1.5, y: 1.5, width: 5.5, height: 5.5, rx: 1.2, stroke: "currentColor", strokeWidth: 1.4 }),
				el("rect", { x: 9, y: 1.5, width: 5.5, height: 5.5, rx: 1.2, stroke: "currentColor", strokeWidth: 1.4 }),
				el("rect", { x: 1.5, y: 9, width: 5.5, height: 5.5, rx: 1.2, stroke: "currentColor", strokeWidth: 1.4 }),
				el("rect", { x: 9, y: 9, width: 5.5, height: 5.5, rx: 1.2, stroke: "currentColor", strokeWidth: 1.4 })
			);
		}

		/**
		 * Тело клиентского плагина: строка в сайдбаре и страница витрины.
		 * @param ctx клиентский контекст со слотами и словарями.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en, ru }), "plugin-showcase: dictionaries");
			// Русский подключаем пакетом языка: оболочка везёт только zh и en.
			ctx.effect(() => {
				try {
					return ctx.locale.addLanguage({ id: "ru", label: "Русский", fallback: "en" });
				} catch {
					return () => {};
				}
			}, "plugin-showcase: russian language pack");
			ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 90,
				label: () => t("panel.title")
			}, ShowcaseGlyph)), "plugin-showcase: sidebar row");
			ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: NS
			}, ShowcasePanel)), "plugin-showcase: showcase page");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
