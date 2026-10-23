window.__ModuleLoader__.load({
	id: "dsh-excalidraw",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region lib/types/client/index.js
		/** This package's copy namespace. */
		const NS = "excalidraw";
		/** The sidebar tab id and the slot key of the board. */
		const TAB_ID = "excalidraw";
		/** The tab kind: the right sidebar groups tabs by kind. */
		const TAB_KIND = "excalidraw";
		/** The board app, served by the Host half. */
		const BOARD_URL = "/api/excalidraw/board.html";
		/** Browser services: the slot registry, copy, and the right-sidebar tabs. */
		const inject = ["slots", "locale", "sidebarRightTabs"];

		const en = {
			"tab.title": "Excalidraw",
			"tab.guide": "Shared whiteboard for this chat",
			"tab.guideDescription": "Draw together with the bot: the board lives in the right sidebar, and the AI can read it and draw on it too.",
			"tab.loading": "Board is loading…",
			"tab.noSession": "Open a board from a chat."
		};
		const zh = {
			"tab.title": "Excalidraw",
			"tab.guide": "本会话共享白板",
			"tab.guideDescription": "与机器人一起画：白板位于右侧边栏，AI 也可以读取和绘制。",
			"tab.loading": "白板加载中…",
			"tab.noSession": "请从会话中打开白板。"
		};
		const ru = {
			"tab.title": "Excalidraw",
			"tab.guide": "Общая доска для этого чата",
			"tab.guideDescription": "Рисуйте вместе с ботом: доска живёт в правой боковой панели, и ИИ тоже может её читать и рисовать на ней.",
			"tab.loading": "Доска загружается…",
			"tab.noSession": "Откройте доску из чата."
		};

		/** Small inline-styled element helper. */
		function el(tag, props, ...children) {
			return react.createElement(tag, props, ...children);
		}

		/** The tab glyph: a small canvas/pen mark, drawn inline. */
		function BoardGlyph({ size }) {
			const dimension = typeof size === "number" ? size : 16;
			return el("svg", {
				width: dimension,
				height: dimension,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				style: { display: "block" }
			},
				el("rect", { x: "1.5", y: "2", width: "13", height: "11", rx: "2", stroke: "currentColor", strokeWidth: "1.4" }),
				el("path", { d: "M4.5 12.5L7 10l3 2.5", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }),
				el("path", { d: "M10 5l1.6-1.6a1 1 0 0 1 1.4 1.4L7.4 10.4 5.5 11l.6-1.9L9.5 5.6", fill: "currentColor", opacity: ".7" }));
		}

		/**
		 * The board tab body: an iframe hosting the Excalidraw app for this chat.
		 *
		 * The iframe is the whole tab: the board app is a separate document that
		 * talks to the Host directly (same origin), so this component has nothing to
		 * know about Excalidraw itself.
		 */
		function BoardBody({ sessionId, t }) {
			if (typeof sessionId !== "string" || sessionId === "") {
				return el("div", {
					style: {
						padding: "16px",
						fontSize: "13px",
						color: "var(--dsw-alias-label-tertiary)"
					}
				}, t("tab.noSession"));
			}
			return el("iframe", {
				src: `${BOARD_URL}?session=${encodeURIComponent(sessionId)}`,
				title: t("tab.title"),
				style: { width: "100%", height: "100%", border: "0", display: "block", background: "#fff" }
			});
		}

		/** The tab chip title. */
		function BoardTitle({ t }) {
			return el("span", null, t("tab.title"));
		}

		/**
		 * Client plugin body: register the tab type, its body, and its chip title.
		 * @param ctx - client root context carrying the tab registry and the slots.
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en, ru }), "excalidraw: dictionaries");
			ctx.effect(() => ctx.sidebarRightTabs.register({
				id: TAB_ID,
				kind: TAB_KIND,
				priority: "extension",
				title: () => t("tab.title"),
				guide: [{
					// Right after the files tab in the “add tab” compass.
					order: 15,
					title: () => t("tab.guide"),
					description: () => t("tab.guideDescription"),
					icon: BoardGlyph
				}]
			}), "excalidraw: tab type");
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: TAB_ID,
				locale: NS,
				inject: () => ({})
			}, BoardBody)), "excalidraw: tab body");
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
				name: "sidebar.right.pane.tab.title",
				key: TAB_ID,
				locale: NS
			}, BoardTitle)), "excalidraw: tab title");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
