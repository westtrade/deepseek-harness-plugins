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
		/**
		 * Browser services: the slot registry, copy, the right-sidebar tab registry,
		 * and the sidebar controller (read for its live layout while pairing tabs).
		 */
		const inject = ["slots", "locale", "sidebarRightTabs", "sidebarRight"];

		const en = {
			"tab.title": "Board",
			"tab.noSession": "Open a board from a chat."
		};
		const zh = {
			"tab.title": "白板",
			"tab.noSession": "请从会话中打开白板。"
		};
		const ru = {
			"tab.title": "Доска",
			"tab.noSession": "Откройте доску из чата."
		};

		/** Small inline-styled element helper. */
		function el(tag, props, ...children) {
			return react.createElement(tag, props, ...children);
		}

		/**
		 * The board tab body: an iframe hosting the Excalidraw app for this chat.
		 *
		 * The iframe is the whole tab: the board app is a separate document that
		 * talks to the Host directly (same origin), so this component has nothing to
		 * know about Excalidraw itself.
		 *
		 * The pairing with the files tab is the watcher's job (see
		 * {@link keepBoardBesideFiles}), so the body only renders the board.
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
			// The tab body's own height is not guaranteed, so the board lives in a
			// box that always has room: the iframe fills it absolutely.
			return el("div", {
				style: {
					position: "relative",
					height: "100%",
					minHeight: "360px",
					overflow: "hidden"
				}
			}, el("iframe", {
				src: `${BOARD_URL}?session=${encodeURIComponent(sessionId)}`,
				title: t("tab.title"),
				style: { position: "absolute", inset: 0, width: "100%", height: "100%", border: "0", display: "block", background: "#fff" }
			}));
		}

		/** The tab chip title. */
		function BoardTitle({ t }) {
			return el("span", null, t("tab.title"));
		}

		/**
		 * Whether the panel is showing this chat with less than the pair of tabs.
		 *
		 * The sidebar seeds exactly ONE page when an empty column expands, and it
		 * seeds the compass page as soon as two tab types are registered. This
		 * plugin therefore contributes no guide entry — files stays the seed — and
		 * this predicate decides when the board still has to join it.
		 *
		 * @param surface - the session's sidebar surface, or undefined.
		 * @param kinds - the tab kinds to keep side by side.
		 * @returns true when the column is open and a tab of the pair is missing.
		 */
		function needsPairing(surface, kinds) {
			if (surface === undefined || surface === null) return false;
			if (surface.layout?.expanded !== true) return false;
			const present = Object.values(surface.layout.tabs ?? {}).map((tab) => tab.kind);
			return kinds.some((kind) => !present.includes(kind));
		}

		/**
		 * Open the files tab and the board beside it, files first and in focus.
		 *
		 * Each `openTab` is a store intent: the first opens (or focuses) files, the
		 * second inserts the board after it, and the third brings files back to the
		 * front — tabs keep insertion order, so the strip reads
		 * “[Files] [Доска]” with Files active, which is the shape the panel had
		 * before this plugin existed plus one tab.
		 *
		 * @param ctx - client root context carrying the sidebar controller.
		 * @param kinds - the kinds to place, in strip order.
		 */
		function pairTabs(ctx, kinds) {
			for (const kind of kinds) {
				try {
					ctx.sidebarRight.openTab(kind);
				} catch {
					// A deployment without that tab type, or a seat mid-navigation.
				}
			}
			try {
				ctx.sidebarRight.openTab(kinds[0]);
			} catch {
				/* files is optional too */
			}
		}

		/**
		 * Watch the right panel and pair the tabs when it opens.
		 *
		 * The client services expose no “panel expanded” event — the sidebar owns
		 * its layout store privately — so this reads the controller's live binding,
		 * which the seat refreshes on every commit. The poll only looks at two
		 * fields, and acts on the collapsed → expanded edge, so closing the board
		 * tab while the panel stays open is respected instead of undone.
		 *
		 * @param ctx - client root context carrying the sidebar controller.
		 */
		function keepBoardBesideFiles(ctx) {
			const kinds = ["files", TAB_KIND];
			const wasOpen = new Map();
			const timer = setInterval(() => {
				const binding = ctx.sidebarRight?.binding;
				if (binding === undefined || binding === null) return;
				const surface = binding.surfaces?.[binding.sessionId];
				const open = surface?.layout?.expanded === true;
				const was = wasOpen.get(binding.sessionId) === true;
				wasOpen.set(binding.sessionId, open);
				if (!open || was) return;
				if (!needsPairing(surface, kinds)) return;
				pairTabs(ctx, kinds);
			}, 300);
			ctx.effect(() => () => clearInterval(timer), "excalidraw: tab pairing");
		}

		/**
		 * Client plugin body: register the tab type, its body and chip title, and
		 * keep it beside the files tab.
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
				// No guide entry on purpose: with two entries the sidebar would seed
				// its compass page instead of opening on the files tab.
				guide: []
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
			keepBoardBesideFiles(ctx);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
