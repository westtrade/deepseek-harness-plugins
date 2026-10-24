window.__ModuleLoader__.load({
	id: "dsh-project-cost",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region lib/types/client/index.js
		/** This package's copy namespace. */
		const NS = "projectCost";
		/**
		* Required browser services: the slot registry (panel + icon
		* registration) and copy.
		*/
		const inject = ["slots", "locale"];
		/** Host route answering the report JSON (registered by the Host half). */
		const REPORT_URL = "/api/project-cost";
		/** Host route answering the remaining routerai.ru credit. */
		const BALANCE_URL = "/api/project-cost/balance";
		/** Auto-refresh interval for open surfaces. */
		const REFRESH_MS = 60000;
		const en = {
			"panel.title": "Project costs",
			"panel.subtitle": "Money spent per directory, priced from routerai.ru",
			"panel.refresh": "Refresh",
			"panel.loading": "Loading…",
			"panel.empty": "No billed model calls yet.",
			"panel.error": "Cost report unavailable: {message}",
			"panel.updated": "Updated {time}",
			"panel.balance": "left on routerai.ru",
			"column.directory": "Directory",
			"column.spent": "Spent",
			"row.sessions": "{sessions} sessions · {tokens} tokens",
			"row.unpriced": "not priced by routerai.ru: {models}",
			"context.cost": "≈ {cost} of context",
			"context.tokens": "Context: {tokens} tokens"
		};
		const zh = {
			"panel.title": "项目花费",
			"panel.subtitle": "按目录统计已花费金额，价格来自 routerai.ru",
			"panel.refresh": "刷新",
			"panel.loading": "加载中…",
			"panel.empty": "尚无计费模型调用。",
			"panel.error": "费用报告不可用：{message}",
			"panel.updated": "更新于 {time}",
			"panel.balance": "routerai.ru 余额",
			"column.directory": "目录",
			"column.spent": "已花费",
			"row.sessions": "{sessions} 个会话 · {tokens} 令牌",
			"row.unpriced": "routerai.ru 无定价：{models}",
			"context.cost": "上下文约 {cost}",
			"context.tokens": "上下文：{tokens} 令牌"
		};
		/** Money the way this meter reports it: `1 234,56 ₽`. */
		function formatRub(value) {
			const formatted = new Intl.NumberFormat("ru-RU", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}).format(value);
			return `${formatted} ₽`;
		}
		/** Plain group formatting for token counts. */
		function formatTokens(value) {
			return new Intl.NumberFormat("ru-RU").format(value);
		}
		/** Last path segment, so a directory row reads like its folder name. */
		function basename(path) {
			const parts = path.split("/").filter((part) => part !== "");
			return parts.length === 0 ? path : parts[parts.length - 1];
		}
		/** Fetch one report; throws on transport or status failure. */
		async function fetchReport() {
			const response = await fetch(REPORT_URL, { cache: "no-store" });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return await response.json();
		}
		/**
		* Fetch the remaining routerai.ru credit. A failure is not an error state
		* for the meter: the spend report stands on its own, so the caller only
		* loses the balance suffix.
		*/
		async function fetchBalance() {
			try {
				const response = await fetch(BALANCE_URL, { cache: "no-store" });
				if (!response.ok) return null;
				const body = await response.json();
				return typeof body?.creditsRub === "number" && Number.isFinite(body.creditsRub) ? body.creditsRub : null;
			} catch {
				return null;
			}
		}
		/**
		* Minimal shared report store so the panel row and the panel body price
		* from one fetch each cycle instead of two. `balanceRub` rides along: it
		* comes from the same refresh so the two numbers on the row agree.
		*/
		const store = {
			report: null,
			balanceRub: null,
			error: null,
			loading: false,
			listeners: new Set()
		};
		function notify() {
			for (const listener of store.listeners) listener();
		}
		function subscribe(listener) {
			store.listeners.add(listener);
			return () => store.listeners.delete(listener);
		}
		async function loadReport() {
			if (store.loading) return;
			store.loading = true;
			notify();
			try {
				const [report, balanceRub] = await Promise.all([fetchReport(), fetchBalance()]);
				store.report = report;
				if (balanceRub !== null) store.balanceRub = balanceRub;
				store.error = null;
			} catch (error) {
				store.error = String(error?.message ?? error);
			} finally {
				store.loading = false;
				notify();
			}
		}
		/** Subscribe a component to the shared report state. */
		function useReport() {
			const [, setTick] = react.useState(0);
			react.useEffect(() => subscribe(() => setTick((tick) => tick + 1)), []);
			return store;
		}
		/**
		* The panellist entry: the ruble glyph, the refresh button, and — on the
		* same row — the total spend with the routerai.ru credit behind a slash.
		*
		* `PanelRow` renders its label from a resolved string and offers no content
		* slot beside it, so the money rides the row's `::after` through one data
		* attribute (the same technique as the tree badges) and the button is
		* positioned against the row's own box. The badge follows the label and
		* hides with it in the collapsed rail, and the button hides there too —
		* the rail's single icon has to keep opening the panel.
		*
		* The button spins whenever a refresh is in flight, whoever started it: the
		* one-minute timer, this button, the panel's own Refresh, or a decorator
		* that asked for a report. All of them go through `loadReport`, so
		* `store.loading` is the single source for that state.
		*/
		function PanelEntry({ size, t }) {
			const state = useReport();
			const host = react.useRef(null);
			const [wide, setWide] = react.useState(false);
			react.useEffect(() => {
				loadReport();
				const timer = setInterval(loadReport, REFRESH_MS);
				return () => clearInterval(timer);
			}, []);
			react.useEffect(() => {
				ensureTreeCostStyle();
				const row = host.current === null ? null : host.current.closest("button");
				if (row === null) return;
				// `PanelRow` renders its title span only while the sidebar is wide.
				const isWide = row.querySelectorAll(":scope > span").length > 1;
				setWide((previous) => previous === isWide ? previous : isWide);
				row.setAttribute(ROW_ATTR, "panel");
				const total = state.report?.totals?.costRub;
				if (total === undefined || total === null || !isWide) {
					row.removeAttribute(TOTAL_ATTR);
					return;
				}
				// Spend and the remaining credit read as one pair: "712,86 ₽ / 975,72 ₽".
				const balance = state.balanceRub;
				const label = typeof balance === "number" && Number.isFinite(balance)
					? `${formatRub(total)} / ${formatRub(balance)}`
					: formatRub(total);
				row.setAttribute(TOTAL_ATTR, label);
			});
			const refresh = react.createElement("span", {
				[REFRESH_ATTR]: state.loading ? "busy" : "idle",
				role: "button",
				tabIndex: 0,
				"aria-label": t === undefined ? "Refresh" : t("panel.refresh"),
				title: t === undefined ? "Refresh" : t("panel.refresh"),
				onClick: (event) => {
					// The row itself selects the panel on click; this control only refreshes.
					event.preventDefault();
					event.stopPropagation();
					loadReport();
				},
				onKeyDown: (event) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					event.preventDefault();
					event.stopPropagation();
					loadReport();
				}
			}, react.createElement("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.6,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true"
			}, react.createElement("path", { d: "M13.5 8a5.5 5.5 0 1 1-1.61-3.89" }), react.createElement("path", { d: "M13.5 2.6V5.5h-2.9" })));
			return react.createElement(react.Fragment, null, react.createElement("span", {
				ref: host,
				"aria-hidden": "true",
				style: {
					fontSize: String(Math.max(10, size - 2)) + "px",
					fontWeight: 600,
					lineHeight: String(size) + "px"
				}
			}, "₽"), wide ? refresh : null);
		}
		/** One directory row: the directory on the left, the money opposite it. */
		function DirectoryRow({ row, title, t }) {
			const usage = row.usage ?? {};
			const tokens = formatTokens((usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.outputTokens ?? 0));
			return react.createElement("div", {
				style: {
					display: "flex",
					alignItems: "baseline",
					gap: "16px",
					padding: "10px 12px",
					borderBottom: "1px solid var(--dsw-alias-border-l4)"
				}
			}, react.createElement("div", {
				style: { flex: "1 1 auto", minWidth: 0 }
			}, react.createElement("div", {
				style: {
					color: "var(--dsw-alias-label-primary)",
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				}
			}, react.createElement("span", { style: { fontWeight: 600 } }, title ?? basename(row.path))), react.createElement("div", {
				style: {
					color: "var(--dsw-alias-label-tertiary)",
					fontSize: "12px",
					lineHeight: "18px",
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap"
				},
				title: row.path
			}, row.path), (row.unpriced ?? []).length > 0 ? react.createElement("div", {
				style: {
					color: "var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-secondary))",
					fontSize: "12px",
					lineHeight: "18px"
				}
			}, t("row.unpriced", { models: row.unpriced.join(", ") })) : null), react.createElement("div", {
				style: { flex: "0 0 auto", textAlign: "right" }
			}, react.createElement("div", {
				style: {
					color: "var(--dsw-alias-label-primary)",
					fontWeight: 600,
					fontVariantNumeric: "tabular-nums",
					whiteSpace: "nowrap"
				}
			}, formatRub(row.costRub ?? 0)), react.createElement("div", {
				style: {
					color: "var(--dsw-alias-label-tertiary)",
					fontSize: "12px",
					lineHeight: "18px",
					whiteSpace: "nowrap"
				}
			}, t("row.sessions", { sessions: String(row.sessions ?? 0), tokens }))));
		}
		/**
		* The central panel: every directory the meter knows about, with the money
		* spent opposite it.
		*/
		function CostPanel({ useWorkspaces, t }) {
			const state = useReport();
			const workspaces = useWorkspaces((snapshot) => snapshot.items) ?? [];
			react.useEffect(() => {
				loadReport();
				const timer = setInterval(loadReport, REFRESH_MS);
				return () => clearInterval(timer);
			}, []);
			const titles = new Map();
			for (const workspace of workspaces) {
				if (typeof workspace.path === "string") titles.set(workspace.path, workspace.title);
			}
			const report = state.report;
			const rows = (report?.directories ?? []).map((row) => react.createElement(DirectoryRow, {
				key: row.path,
				row,
				title: titles.get(row.path),
				t
			}));
			const updated = report === undefined || report === null ? null : new Date(report.generatedAt);
			return react.createElement("div", {
				style: {
					height: "100%",
					overflow: "auto",
					padding: "16px 20px"
				}
			}, react.createElement("div", {
				style: {
					display: "flex",
					alignItems: "baseline",
					gap: "12px",
					marginBottom: "4px"
				}
			}, react.createElement("h2", {
				style: { margin: 0, fontSize: "16px", lineHeight: "24px", color: "var(--dsw-alias-label-primary)" }
			}, t("panel.title")), react.createElement("button", {
				type: "button",
				onClick: loadReport,
				disabled: state.loading,
				style: {
					marginLeft: "auto",
					padding: "4px 12px",
					borderRadius: "12px",
					border: "1px solid var(--dsw-alias-border-l4)",
					background: "transparent",
					color: "var(--dsw-alias-label-secondary)",
					cursor: "pointer"
				}
			}, t("panel.refresh"))), react.createElement("div", {
				style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "18px", marginBottom: "12px" }
			}, t("panel.subtitle")), state.error !== null ? react.createElement("div", {
				style: { color: "var(--dsw-alias-state-error-primary)", padding: "12px 0" }
			}, t("panel.error", { message: state.error })) : report === null ? react.createElement("div", {
				style: { color: "var(--dsw-alias-label-tertiary)", padding: "12px 0" }
			}, t("panel.loading")) : react.createElement("div", {
				style: {
					border: "1px solid var(--dsw-alias-border-l4)",
					borderRadius: "12px",
					overflow: "hidden"
				}
			}, react.createElement("div", {
				style: {
					display: "flex",
					gap: "16px",
					padding: "8px 12px",
					borderBottom: "1px solid var(--dsw-alias-border-l4)",
					color: "var(--dsw-alias-label-tertiary)",
					fontSize: "12px",
					lineHeight: "18px"
				}
			}, react.createElement("div", { style: { flex: "1 1 auto" } }, t("column.directory")), react.createElement("div", {
				style: { flex: "0 0 auto", textAlign: "right" }
			}, t("column.spent"))), rows.length === 0 ? react.createElement("div", {
				style: { padding: "16px 12px", color: "var(--dsw-alias-label-tertiary)" }
			}, t("panel.empty")) : rows, react.createElement("div", {
				style: {
					display: "flex",
					gap: "16px",
					padding: "10px 12px",
					background: "var(--dsw-alias-interactive-bg-hover)"
				}
			}, react.createElement("div", {
				style: { flex: "1 1 auto", color: "var(--dsw-alias-label-secondary)", fontWeight: 600 }
			}, "Итого", typeof state.balanceRub === "number" && Number.isFinite(state.balanceRub) ? react.createElement("div", {
				style: { fontWeight: 400, fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" }
			}, t("panel.balance")) : null), react.createElement("div", {
				style: {
					flex: "0 0 auto",
					color: "var(--dsw-alias-label-primary)",
					fontWeight: 600,
					fontVariantNumeric: "tabular-nums"
				}
			}, typeof state.balanceRub === "number" && Number.isFinite(state.balanceRub) ? `${formatRub(report.totals?.costRub ?? 0)} / ${formatRub(state.balanceRub)}` : formatRub(report.totals?.costRub ?? 0)))), updated !== null ? react.createElement("div", {
				style: { marginTop: "8px", color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" }
			}, t("panel.updated", { time: updated.toLocaleTimeString() })) : null);
		}
		//#region lib/types/client/tree-costs.js
		/**
		* Tree badges: money rendered inside the Workspaces tree rows.
		*
		* The workspace browser rows are package-internal to `dsh-client-ui-workspace`
		* and expose no row-level slot, so the badge is painted as the row's
		* `::after` pseudo-element driven by two data attributes this module keeps
		* in sync. React never touches pseudo-elements or unknown attributes, so
		* decoration survives re-renders; a MutationObserver repairs rows that are
		* remounted and re-applies badges whenever the report refreshes.
		*/
		/** Attribute carrying the total spend painted onto the panel-list row. */
		const TOTAL_ATTR = "data-dshpc-total";
		/** Attribute marking the panel-list row so the refresh button can anchor to it. */
		const ROW_ATTR = "data-dshpc-row";
		/** Attribute driving the refresh glyph: `busy` while a report is in flight. */
		const REFRESH_ATTR = "data-dshpc-refresh";
		/** Attribute carrying the money label painted onto one tree row. */
		const COST_ATTR = "data-dshpc-cost";
		/** Attribute marking the row kind (`dir` | `session`) for badge styling. */
		const KIND_ATTR = "data-dshpc-kind";
		/** Tree rows eligible for decoration (every workspace-browser row is one). */
		const ROW_SELECTOR = '[role="treeitem"]';
		/** The tree container; row churn inside it re-triggers decoration. */
		const TREE_SELECTOR = '[role="tree"]';
		/** Debounce for mutation batches — the tree settles in bursts. */
		const DECORATE_DELAY_MS = 150;
		/** Style tag identity, mirroring the loader's data-plugin-css convention. */
		const TREE_STYLE_TAG = "dsh-project-cost/tree.css";
		/**
		* Badge stylesheet: money at the tree row's right edge (directly right of
		* the session time; `rowActions` is display:none until hover, so the badge
		* owns the far right) and appended to the chat metrics row. Their
		* drop-marker rule is class-based and out-specifies ours, so a drag marker
		* correctly replaces the badge while dragging.
		*/
		const TREE_COST_CSS = '[data-dshpc-cost]::after{content:attr(data-dshpc-cost);flex:none;margin-left:6px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;font-variant-numeric:tabular-nums;white-space:nowrap}[data-dshpc-kind="dir"][data-dshpc-cost]::after{color:var(--dsw-alias-label-secondary);font-weight:600}[data-dshpc-row]{position:relative}[data-dshpc-total]::after{content:attr(data-dshpc-total);flex:none;margin-left:auto;padding-left:12px;padding-right:22px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:22px;font-variant-numeric:tabular-nums;white-space:nowrap}[data-dshpc-refresh]{position:absolute;top:50%;right:4px;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;color:var(--dsw-alias-label-tertiary);cursor:pointer}[data-dshpc-refresh]:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}[data-dshpc-refresh]:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px}[data-dshpc-refresh="busy"]{color:var(--dsw-alias-label-primary)}[data-dshpc-refresh="busy"] svg{animation:dshpc-spin .8s linear infinite}@keyframes dshpc-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}[data-dshpc-turn]::after{content:attr(data-dshpc-turn);flex:none;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:24px;font-variant-numeric:tabular-nums;white-space:nowrap}';
		/** Badge money: spend under a kopeck keeps four digits instead of "0,00". */
		function formatRubBadge(value) {
			if (value > 0 && value < 0.01) {
				const formatted = new Intl.NumberFormat("ru-RU", {
					minimumFractionDigits: 4,
					maximumFractionDigits: 4
				}).format(value);
				return `${formatted} ₽`;
			}
			return formatRub(value);
		}
		/** The React fiber handle hung on a DOM node (React 18/19 internals key). */
		function reactFiberOf(element) {
			for (const key of Object.keys(element)) {
				if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) return element[key];
			}
			return undefined;
		}
		/**
		* Resolve one tree row to its report key by walking the fiber chain up to
		* the row component: `ProjectRowItem` carries `group.cwd` (the directory
		* path), `SessionNodeItem` carries `node.id` (the session id). Rows we
		* cannot resolve (files tree, JSON trees, the ungrouped bucket) are left
		* undecorated.
		*/
		function rowIdentity(element) {
			let fiber = reactFiberOf(element);
			for (let depth = 0; fiber !== null && fiber !== undefined && depth < 16; depth += 1, fiber = fiber.return) {
				const props = fiber.memoizedProps;
				if (props === null || typeof props !== "object") continue;
				const group = props.group;
				if (group !== null && typeof group === "object" && typeof group.cwd === "string") {
					return { kind: "dir", key: group.cwd };
				}
				const node = props.node;
				if (node !== null && typeof node === "object" && typeof node.id === "string" && typeof node.updatedAt === "number") {
					return { kind: "session", key: node.id };
				}
			}
			return undefined;
		}
		/** Money per directory path and per session id, indexed from the report. */
		function costIndex(report) {
			const dirs = new Map();
			const sessions = new Map();
			for (const dir of report?.directories ?? []) {
				if (typeof dir.path === "string") dirs.set(dir.path, dir.costRub ?? 0);
			}
			for (const entry of report?.sessions ?? []) {
				if (typeof entry.sessionId === "string") sessions.set(entry.sessionId, entry.costRub ?? 0);
			}
			return { dirs, sessions };
		}
		/** Paint (or clear) the badge attribute on every resolvable tree row. */
		function decorateTreeRows() {
			const { dirs, sessions } = costIndex(store.report);
			for (const row of document.querySelectorAll(ROW_SELECTOR)) {
				const identity = rowIdentity(row);
				let text;
				let kind;
				if (identity !== undefined) {
					const cost = identity.kind === "dir" ? dirs.get(identity.key) : sessions.get(identity.key);
					if (cost !== undefined && cost > 0) {
						text = formatRubBadge(cost);
						kind = identity.kind;
					}
				}
				if (text === undefined) {
					if (row.hasAttribute(COST_ATTR)) {
						row.removeAttribute(COST_ATTR);
						row.removeAttribute(KIND_ATTR);
					}
					continue;
				}
				if (row.getAttribute(COST_ATTR) !== text) row.setAttribute(COST_ATTR, text);
				if (row.getAttribute(KIND_ATTR) !== kind) row.setAttribute(KIND_ATTR, kind);
			}
		}
		/** The injected stylesheet, created once per document. */
		function ensureTreeCostStyle() {
			const selector = `style[data-plugin-css=${JSON.stringify(TREE_STYLE_TAG)}]`;
			if (document.querySelector(selector) !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-project-cost";
			tag.dataset.pluginCss = TREE_STYLE_TAG;
			tag.textContent = TREE_COST_CSS;
			document.head.appendChild(tag);
		}
		/** A mutation matters only when it lands in or beside the tree. */
		function mutationTouchesTree(mutation) {
			const target = mutation.target;
			if (target.nodeType === 1 && target.closest(TREE_SELECTOR) !== null) return true;
			for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
				if (node.nodeType !== 1) continue;
				if (node.matches(ROW_SELECTOR) || node.matches(TREE_SELECTOR) || node.closest(TREE_SELECTOR) !== null) return true;
			}
			return false;
		}
		/**
		* Start tree decoration; returns the disposer. No-op outside the DOM.
		*/
		function startTreeCosts() {
			if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
			ensureTreeCostStyle();
			let timer;
			let stopped = false;
			const run = () => {
				timer = undefined;
				if (!stopped) decorateTreeRows();
			};
			const schedule = () => {
				if (timer === undefined && !stopped) timer = setTimeout(run, DECORATE_DELAY_MS);
			};
			const observer = new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					if (mutationTouchesTree(mutation)) {
						schedule();
						return;
					}
				}
			});
			observer.observe(document.body, { childList: true, subtree: true });
			const unsubscribe = subscribe(schedule);
			loadReport();
			decorateTreeRows();
			return () => {
				stopped = true;
				observer.disconnect();
				unsubscribe();
				if (timer !== undefined) clearTimeout(timer);
				for (const row of document.querySelectorAll(`[${COST_ATTR}]`)) {
					row.removeAttribute(COST_ATTR);
					row.removeAttribute(KIND_ATTR);
				}
				document.querySelector(`style[data-plugin-css=${JSON.stringify(TREE_STYLE_TAG)}]`)?.remove();
			};
		}
		//#endregion
		//#region lib/types/client/chat-costs.js
		/**
		* Chat metrics badges: money appended to the message-footer metrics row
		* (`Usage …` / `Ran for …` / clock) under each assistant turn.
		*
		* The row is package-internal to `dsh-client-ui-chat` and exposes no slot,
		* so the badge rides the row's `::after` through one data attribute — the
		* tree badge technique. The money itself is the Host's per-turn price from
		* the report (`sessions[].turns`), which comes from the same
		* `assistant/message` accounting as the tree and panel, so a turn stays
		* priceable even when the chat cannot prove its exact usage disclosure or
		* attribute a model. A turn the report has not scanned yet (a live one)
		* falls back to the `TurnUsagePanel` fiber's usage priced over
		* `/api/project-cost/prices`, or over the routerai.ru catalog directly when
		* that route is missing.
		*/
		/** Attribute carrying the turn's money label on one metrics row. */
		const TURN_ATTR = "data-dshpc-turn";
		/** Host route answering the routerai.ru price table. */
		const PRICES_URL = "/api/project-cost/prices";
		/** Public routerai.ru catalog: fallback when the host route is unavailable. */
		const CATALOG_URL = "https://routerai.ru/api/v1/models";
		/** Message tails are the only metrics rows we decorate (stable data attribute). */
		const TAIL_SELECTOR = "[data-turn-tail]";
		/** Normalize a routerai.ru catalog body into the host's `{ id: price }` shape. */
		function parseCatalogModels(body) {
			const rows = Array.isArray(body) ? body : body?.data;
			const models = {};
			if (!Array.isArray(rows)) return models;
			for (const row of rows) {
				if (row === null || typeof row.id !== "string" || row.pricing === undefined) continue;
				const pricing = row.pricing;
				const read = pricing.input_cache_read;
				const write = pricing.input_cache_write;
				models[row.id] = {
					prompt: Number(pricing.prompt ?? 0),
					completion: Number(pricing.completion ?? 0),
					cacheRead: read === undefined || read === null ? null : Number(read),
					cacheWrite: write === undefined || write === null ? null : Number(write)
				};
			}
			return models;
		}
		/**
		* Price table: one fetch per page, reused for every visible turn. The host
		* route wins (normalized, offline-tolerant through its snapshot); a direct
		* catalog fetch covers a host that predates the route (the catalog sends
		* `access-control-allow-origin: *`). Both failures leave no badges.
		*/
		let pricesPromise;
		function priceTable() {
			if (pricesPromise === undefined) {
				const load = (url, parse) => fetch(url, {
					cache: "no-store"
				}).then((response) => {
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					return response.json();
				}).then((body) => {
					const models = parse(body);
					if (Object.keys(models).length === 0) throw new Error("empty price table");
					return models;
				});
				pricesPromise = load(PRICES_URL, (body) => body?.models ?? {}).catch(() => load(CATALOG_URL, parseCatalogModels)).catch(() => {
					pricesPromise = undefined;
					return {};
				});
			}
			return pricesPromise;
		}
		/** Price lookup over the routerai.ru table (mirrors lib/cost.js `lookupPrice`). */
		function lookupModelPrice(models, modelId) {
			const bare = modelId.startsWith("~") ? modelId.slice(1) : modelId;
			for (const candidate of [modelId, bare, "~" + bare, bare.toLowerCase(), modelId.toLowerCase()]) {
				const hit = models[candidate];
				if (hit !== undefined) return hit;
			}
			return undefined;
		}
		/** Resolve one turn's price row from its attributed routes. */
		function priceForUsage(usage, models) {
			const routes = Array.isArray(usage.routes) ? usage.routes : [];
			const route = routes[0];
			if (route === undefined || typeof route.model !== "string") return undefined;
			if (typeof route.provider === "string") {
				const combined = lookupModelPrice(models, `${route.provider}/${route.model}`);
				if (combined !== undefined) return combined;
			}
			return lookupModelPrice(models, route.model);
		}
		/** Price one turn's usage in rubles (mirrors lib/cost.js `costRub`). */
		function turnCostRub(usage, price) {
			const cacheRead = price.cacheRead ?? price.prompt;
			const cacheWrite = price.cacheWrite ?? price.prompt;
			return usage.uncachedInputTokens * price.prompt + usage.outputTokens * price.completion + (usage.cacheReadTokens ?? 0) * cacheRead + (usage.cacheWriteTokens ?? 0) * cacheWrite;
		}
		/** Turn usage off the `TurnUsagePanel` fiber, when the turn proved it. */
		function turnUsageOf(tail) {
			for (const trigger of tail.querySelectorAll('button[aria-haspopup="dialog"]')) {
				let fiber = reactFiberOf(trigger);
				for (let depth = 0; fiber !== null && fiber !== undefined && depth < 16; depth += 1, fiber = fiber.return) {
					const props = fiber.memoizedProps;
					if (props === null || typeof props !== "object") continue;
					const usage = props.usage;
					if (usage !== null && typeof usage === "object" && typeof usage.uncachedInputTokens === "number" && typeof usage.outputTokens === "number") return usage;
				}
			}
			return undefined;
		}
		/**
		* One tail's metrics row: the actions strip holding the pills and the clock.
		* It is a direct child of the tail and exists even when the Usage pill is
		* absent, so gap turns are decorated too.
		*/
		function metricsRowOf(tail) {
			const direct = tail.querySelector(':scope > [class*="_actions"]');
			if (direct !== null) return direct;
			for (const trigger of tail.querySelectorAll('button[aria-haspopup="dialog"]')) {
				const pill = trigger.parentElement;
				if (pill !== null && pill.parentElement !== null) return pill.parentElement;
			}
			return undefined;
		}
		/** Money per turn, indexed per session from the report's Host-priced map. */
		function turnCostIndex(report) {
			const index = new Map();
			for (const entry of report?.sessions ?? []) {
				if (typeof entry?.sessionId !== "string" || entry.turns === undefined || entry.turns === null) continue;
				index.set(entry.sessionId, entry.turns);
			}
			return index;
		}
		/** The session id owning one chat element (`sessionId` on the chat shell). */
		function sessionIdOf(element) {
			let fiber = reactFiberOf(element);
			for (let depth = 0; fiber !== null && fiber !== undefined && depth < 24; depth += 1, fiber = fiber.return) {
				const props = fiber.memoizedProps;
				if (props === null || typeof props !== "object") continue;
				const id = props.sessionId;
				if (typeof id === "string" && id.startsWith("session-")) return id;
			}
			return undefined;
		}
		/** Paint (or clear) the money badge on every message metrics row. */
		function decorateChatRows(models) {
			const turns = turnCostIndex(store.report);
			for (const tail of document.querySelectorAll(TAIL_SELECTOR)) {
				const row = metricsRowOf(tail);
				if (row === undefined) continue;
				let cost;
				// The Host's per-turn price is authoritative: it also covers turns
				// whose exact disclosure or model attribution the chat lacks.
				const sessionId = sessionIdOf(tail);
				if (sessionId !== undefined) {
					const map = turns.get(sessionId);
					const hostCost = map === undefined ? undefined : map[tail.getAttribute("data-turn-tail")];
					if (typeof hostCost === "number") cost = hostCost;
				}
				// A turn the report has not scanned yet (a live one) prices from the
				// proven usage pill instead.
				if (cost === undefined && models !== undefined) {
					const usage = turnUsageOf(tail);
					if (usage !== undefined) {
						const price = priceForUsage(usage, models);
						if (price !== undefined) cost = turnCostRub(usage, price);
					}
				}
				const text = cost !== undefined && cost > 0 ? formatRubBadge(cost) : undefined;
				if (text === undefined) {
					if (row.hasAttribute(TURN_ATTR)) row.removeAttribute(TURN_ATTR);
					continue;
				}
				if (row.getAttribute(TURN_ATTR) !== text) row.setAttribute(TURN_ATTR, text);
			}
		}
		/** A mutation matters only when it lands in or beside a message tail. */
		function mutationTouchesChat(mutation) {
			const target = mutation.target;
			if (target.nodeType === 1 && target.closest(TAIL_SELECTOR) !== null) return true;
			for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
				if (node.nodeType !== 1) continue;
				if (node.matches(TAIL_SELECTOR) || node.querySelector(TAIL_SELECTOR) !== null) return true;
			}
			return false;
		}
		/** Start chat metrics decoration; returns the disposer. No-op outside the DOM. */
		function startChatCosts() {
			if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
			ensureTreeCostStyle();
			let stopped = false;
			let models;
			let timer;
			const run = () => {
				timer = undefined;
				if (!stopped) decorateChatRows(models);
			};
			const schedule = () => {
				if (timer === undefined && !stopped) timer = setTimeout(run, DECORATE_DELAY_MS);
			};
			const observer = new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					if (mutationTouchesChat(mutation)) {
						schedule();
						return;
					}
				}
			});
			observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
			// Report refreshes repaint the badges (Host prices may arrive after the
			// rows rendered); the price table only serves the live-turn fallback.
			const unsubscribe = subscribe(schedule);
			loadReport();
			priceTable().then((table) => {
				models = table;
				schedule();
			});
			decorateChatRows(models);
			return () => {
				stopped = true;
				observer.disconnect();
				unsubscribe();
				if (timer !== undefined) clearTimeout(timer);
				for (const row of document.querySelectorAll(`[${TURN_ATTR}]`)) row.removeAttribute(TURN_ATTR);
			};
		}
		//#endregion
		/**
		* Composer dock chip: what the current context costs to send.
		*
		* The token count comes from the `contextPressure` projection — the same
		* feed as the shipped context meter beside the send button — and the route
		* from `modelSelection`, so the chip prices the model the next request will
		* actually use. Prices reuse the table the badges already load, so the chip
		* costs no extra request.
		*
		* Renders nothing until both the projection and the price are known, the
		* same way the shipped meter stays silent without a reported capacity.
		*
		* @param props - the dock's session projections and copy seat.
		* @returns the chip, or nothing.
		*/
		function ContextCostDock({ useProjection, t }) {
			const pressure = useProjection("contextPressure");
			const selection = useProjection("modelSelection");
			const [table, setTable] = react.useState(null);
			react.useEffect(() => {
				let live = true;
				void priceTable().then((models) => {
					if (live) setTable(models);
				});
				return () => {
					live = false;
				};
			}, []);
			// `projectedTokens` is pressure plus whatever the surface added since the
			// last usage sample: the best estimate of the next prompt's size.
			const tokens = pressure?.projectedTokens ?? pressure?.pressureTokens;
			const route = selection?.next ?? selection?.lastUsed;
			if (typeof tokens !== "number" || tokens <= 0) return null;
			if (route === null || route === undefined || typeof route.model !== "string") return null;
			if (table === null) return null;
			const price = lookupModelPrice(table, `${route.provider}/${route.model}`) ?? lookupModelPrice(table, route.model);
			if (price === undefined) return null;
			// ponytail: the whole context at the prompt rate. Cache hits bill
			// cheaper, so this is an upper bound; split `cacheRead` out once the
			// pressure projection reports cached tokens.
			const cost = tokens * price.prompt;
			return react.createElement("div", {
				style: { display: "flex", justifyContent: "center", padding: "2px 0" },
				title: `${t("context.tokens", { tokens: formatTokens(tokens) })} · ${route.provider}/${route.model}`
			}, react.createElement("span", {
				style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", lineHeight: "16px" }
			}, t("context.cost", { cost: formatRub(cost) })));
		}
		/**
		* Client plugin body: register the panel icon (carrying the total spend) and
		* the panel body.
		* @param ctx - client root context carrying slots and locale.
		*/
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "project-cost: dictionaries");
			ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: "project-cost",
				order: 60,
				locale: NS,
				label: () => t("panel.title")
			}, PanelEntry)), "project-cost: panel icon");
			ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: "project-cost",
				locale: NS
			}, CostPanel)), "project-cost: panel body");
			ctx.effect(() => ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "project-cost-context",
				order: 30,
				locale: NS
			}, ContextCostDock)), "project-cost: context cost dock");
			ctx.effect(() => startTreeCosts(), "project-cost: tree badges");
			ctx.effect(() => startChatCosts(), "project-cost: chat badges");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
