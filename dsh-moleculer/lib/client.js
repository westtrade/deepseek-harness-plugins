window.__ModuleLoader__.load({
	id: "dsh-moleculer",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		// Shell primitives: the card wears the same chevron as every other plugin card.
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/index.js
		/** This package's copy namespace. */
		const NS = "moleculer";
		/** Services the browser half needs: the slot registry, copy, and settings. */
		const inject = ["slots", "locale", "settingsScope"];
		/** Settings namespace the Host half registered. */
		const SETTINGS_NS = "dsh-moleculer";
		/** Host route with the live mesh state. */
		const STATE_URL = "/api/moleculer/state";
		/** Poll interval while the card is open. */
		const REFRESH_MS = 5000;
		const en = {
			"panel.title": "Moleculer mesh",
			"panel.description": "Broker connection and the live mesh for the AI",
			"a11y.expand": "Expand",
			"a11y.collapse": "Collapse",
			"settings.namespace": "Namespace",
			"settings.namespaceHint": "Peers must share the namespace to see each other.",
			"settings.transporter": "Transporter",
			"settings.host": "Host",
			"settings.port": "Port",
			"settings.nodeID": "Node ID",
			"settings.nodeIDHint": "Empty lets Moleculer generate one.",
			"settings.apply": "Apply",
			"settings.applying": "Applying…",
			"settings.saved": "Saved",
			"settings.invalid": "Check the settings: {message}",
			"state.title": "Live mesh",
			"state.stopped": "Broker is not running",
			"state.tools": "{count} tool(s) exposed",
			"state.nodes": "Nodes",
			"state.services": "Services",
			"state.empty": "No remote services yet — start a peer on this namespace."
		};
		const zh = {
			"panel.title": "Moleculer 网格",
			"panel.description": "AI 使用的 Broker 连接与实时网格",
			"a11y.expand": "展开",
			"a11y.collapse": "收起",
			"settings.namespace": "命名空间",
			"settings.namespaceHint": "对等节点必须使用同一命名空间才能互相发现。",
			"settings.transporter": "传输方式",
			"settings.host": "主机",
			"settings.port": "端口",
			"settings.nodeID": "节点 ID",
			"settings.nodeIDHint": "留空则由 Moleculer 自动生成。",
			"settings.apply": "应用",
			"settings.applying": "应用中…",
			"settings.saved": "已保存",
			"settings.invalid": "请检查设置：{message}",
			"state.title": "实时网格",
			"state.stopped": "Broker 未运行",
			"state.tools": "已暴露 {count} 个工具",
			"state.nodes": "节点",
			"state.services": "服务",
			"state.empty": "还没有远程服务——请在同一命名空间启动对等节点。"
		};
		const ru = {
			"panel.title": "Сеть Moleculer",
			"panel.description": "Подключение брокера и живая сеть для ИИ",
			"a11y.expand": "Развернуть",
			"a11y.collapse": "Свернуть",
			"settings.namespace": "Пространство имён",
			"settings.namespaceHint": "Узлы видят друг друга, только если пространство имён совпадает.",
			"settings.transporter": "Транспорт",
			"settings.host": "Хост",
			"settings.port": "Порт",
			"settings.nodeID": "ID узла",
			"settings.nodeIDHint": "Пусто — Moleculer сгенерирует сам.",
			"settings.apply": "Применить",
			"settings.applying": "Применение…",
			"settings.saved": "Сохранено",
			"settings.invalid": "Проверьте настройки: {message}",
			"state.title": "Живая сеть",
			"state.stopped": "Брокер не запущен",
			"state.tools": "Инструментов доступно: {count}",
			"state.nodes": "Узлы",
			"state.services": "Сервисы",
			"state.empty": "Удалённых сервисов пока нет — запустите узел в этом пространстве имён."
		};
		/**
		* Card styles, copied from the harness's own plugin card so this one folds
		* and unfolds exactly like the shipped cards next to it (same border,
		* radius, header padding, chevron rotation).
		*/
		const CARD_CSS = ".dshmca_card{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;list-style:none;transition:border-color .16s,background .16s}.dshmca_card:hover{border-color:var(--dsw-alias-label-dimmed)}.dshmca_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.dshmca_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.dshmca_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.dshmca_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.dshmca_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.dshmca_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.dshmca_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.dshmca_chevronOpen{transform:rotate(180deg)}.dshmca_body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding:12px 0 14px;display:flex;flex-direction:column;gap:10px}";
		/** Style-tag identity, mirroring the loader's `data-plugin-css` convention. */
		const CARD_STYLE_TAG = "dsh-moleculer/settings-card.css";
		/** Inject the card stylesheet once per document. */
		function ensureCardStyle() {
			if (typeof document === "undefined") return;
			if (document.querySelector(`style[data-plugin-css=${JSON.stringify(CARD_STYLE_TAG)}]`) !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-moleculer";
			tag.dataset.pluginCss = CARD_STYLE_TAG;
			tag.textContent = CARD_CSS;
			document.head.appendChild(tag);
		}
		/** Create one element. */
		function el(tag, props, ...children) {
			return react.createElement(tag, props, ...children);
		}
		/** Interpolate `{name}` placeholders in one copy string. */
		function fill(template, values) {
			let out = template;
			for (const [key, value] of Object.entries(values ?? {})) out = out.split(`{${key}}`).join(String(value));
			return out;
		}
		const inputStyle = {
			boxSizing: "border-box",
			padding: "5px 8px",
			borderRadius: "6px",
			border: "1px solid var(--dsw-alias-border-l4, #d0d3d6)",
			background: "var(--dsw-alias-bg-base, transparent)",
			color: "var(--dsw-alias-label-primary, inherit)",
			font: "inherit",
			fontSize: "13px"
		};
		/** One labelled field. */
		function label(text, child) {
			return el("label", { style: { display: "flex", flexDirection: "column", gap: "3px", fontSize: "12px", color: "var(--dsw-alias-label-secondary, inherit)" } },
				el("span", null, text),
				child);
		}
		/** One button. */
		function button(text, onClick, options = {}) {
			return el("button", {
				type: "button",
				onClick,
				disabled: options.disabled === true,
				style: {
					padding: "5px 12px",
					borderRadius: "6px",
					border: options.primary === true ? "none" : "1px solid var(--dsw-alias-border-l4, #d0d3d6)",
					background: options.primary === true ? "var(--dsw-alias-interactive-bg-primary, #3a6df0)" : "transparent",
					color: options.primary === true ? "var(--dsw-alias-label-inverse, #fff)" : "var(--dsw-alias-label-primary, inherit)",
					font: "inherit",
					fontSize: "13px",
					cursor: options.disabled === true ? "default" : "pointer",
					opacity: options.disabled === true ? 0.5 : 1
				}
			}, text);
		}
		/** One host call; throws the server's message on a non-2xx answer. */
		async function callHost(method, url) {
			const response = await fetch(url, { method, cache: "no-store" });
			let payload;
			try {
				payload = await response.json();
			} catch {
				payload = undefined;
			}
			if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`);
			return payload;
		}
		/**
		* The settings card.
		*
		* The harness persists the namespace; this card only reads and writes the
		* section, so no local copy of the values is kept beyond the edited draft.
		* The live mesh below it is the Host's own view, so what the person sees is
		* what the model gets.
		*/
		function MeshSettingsCard({ t, host }) {
			const [open, setOpen] = react.useState(false);
			const [draft, setDraft] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [notice, setNotice] = react.useState(null);
			const [state, setState] = react.useState(null);
			const snapshot = host.getSnapshot();
			const saved = snapshot?.value ?? {};
			react.useEffect(() => {
				if (draft !== null) return;
				setDraft({
					namespace: saved.namespace ?? "dsh",
					transporter: saved.transporter ?? "TCP",
					host: saved.host ?? "127.0.0.1",
					port: String(saved.port ?? 6174),
					nodeID: saved.nodeID ?? ""
				});
			}, [snapshot?.revision]);
			const loadState = react.useCallback(async () => {
				try {
					setState(await callHost("GET", STATE_URL));
				} catch {
					setState(null);
				}
			}, []);
			react.useEffect(() => {
				void loadState();
				const timer = setInterval(() => void loadState(), REFRESH_MS);
				return () => clearInterval(timer);
			}, [loadState]);
			if (draft === null) return null;
			const field = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
			const apply = async () => {
				setBusy(true);
				try {
					const port = Number(draft.port);
					if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("port must be 1-65535");
					await Promise.all([
						host.set("namespace", draft.namespace.trim()),
						host.set("transporter", draft.transporter),
						host.set("host", draft.host.trim()),
						host.set("port", port),
						host.set("nodeID", draft.nodeID.trim())
					]);
					setNotice(t("settings.saved"));
					await loadState();
				} catch (error) {
					setNotice(fill(t("settings.invalid"), { message: error.message }));
				} finally {
					setBusy(false);
				}
			};
			const services = state?.state?.services ?? [];
			const nodes = [...new Set(services.map((service) => service.nodeID))];
			const title = t("panel.title");
			const body = el("div", { className: "dshmca_body" },
				el("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" } },
					label(t("settings.namespace"), el("input", {
						value: draft.namespace,
						style: inputStyle,
						onChange: (event) => field("namespace", event.target.value)
					})),
					label(t("settings.transporter"), el("select", {
						value: draft.transporter,
						style: inputStyle,
						onChange: (event) => field("transporter", event.target.value)
					}, ...["TCP", "NATS", "Redis", "MQTT", "AMQP"].map((name) => el("option", { key: name, value: name }, name)))),
					label(t("settings.host"), el("input", { value: draft.host, style: inputStyle, onChange: (event) => field("host", event.target.value) })),
					label(t("settings.port"), el("input", { value: draft.port, style: inputStyle, onChange: (event) => field("port", event.target.value) })),
					label(t("settings.nodeID"), el("input", { value: draft.nodeID, style: inputStyle, onChange: (event) => field("nodeID", event.target.value) }))),
				el("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, inherit)" } }, t("settings.namespaceHint")),
				el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
					button(busy ? t("settings.applying") : t("settings.apply"), apply, { primary: true, disabled: busy }),
					notice === null ? null : el("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, inherit)" } }, notice)),
				el("div", { style: { borderTop: "1px solid var(--dsw-alias-border-l4, #d0d3d6)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "4px" } },
					el("div", { style: { fontSize: "12px", fontWeight: 600 } }, t("state.title")),
					state?.state?.running !== true
						? el("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, inherit)" } }, t("state.stopped"))
						: el("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, inherit)" } },
							`${t("state.nodes")}: ${String(nodes.length)} · ${t("state.services")}: ${String(services.length)} · ${fill(t("state.tools"), { count: state?.tools?.length ?? 0 })}`),
					services.length === 0
						? el("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, inherit)" } }, t("state.empty"))
						: el("ul", { style: { margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--dsw-alias-label-secondary, inherit)" } },
							...services.map((service) => el("li", { key: `${service.nodeID}-${service.name}` }, `${service.name} @ ${service.nodeID}`)))));
			return el("li", { className: `dshmca_card${open ? " dshmca_cardOpen" : ""}` },
				el("button", {
					type: "button",
					className: "dshmca_header",
					"aria-expanded": open,
					"aria-label": `${t(open ? "a11y.collapse" : "a11y.expand")}: ${title}`,
					onClick: () => setOpen(!open)
				},
					el("span", { className: "dshmca_headText" },
						el("span", { className: "dshmca_name" }, title),
						el("span", { className: "dshmca_description" }, t("panel.description"))),
					el(primitives.IconChevronDownOutline14, { className: `dshmca_chevron${open ? " dshmca_chevronOpen" : ""}` })),
				open ? body : null);
		}
		/**
		* Client plugin body: the settings card, shown on the Plugins settings tab.
		* @param ctx - client root context carrying slots, locale, and settingsScope.
		*/
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ensureCardStyle();
			ctx.effect(() => {
				ensureCardStyle();
				return () => document.querySelector(`style[data-plugin-css=${JSON.stringify(CARD_STYLE_TAG)}]`)?.remove();
			}, "moleculer: card styles");
			const host = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
			ctx.effect(() => {
				// Another plugin may already have registered Russian: `addLanguage`
				// throws on a duplicate id, and one plugin failing to apply must not
				// take the whole browser half down with it.
				try {
					return ctx.locale.addLanguage({ id: "ru", label: "Русский", fallback: "en" });
				} catch {
					return () => {};
				}
			}, "moleculer: russian language pack");
			ctx.effect(() => ctx.locale.register(NS, { zh, en, ru }), "moleculer: dictionaries");
			ctx.effect(() => ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				// KEYED slot: the Plugins tab dispatches by `entryKey`, which is the
				// settings namespace, so the card must claim that key (not an `id`).
				key: SETTINGS_NS,
				order: 40,
				locale: NS,
				inject: () => ({ host })
			}, MeshSettingsCard)), "moleculer: settings card");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
