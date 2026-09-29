window.__ModuleLoader__.load({
	id: "dsh-goal-vector",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region lib/types/client/index.js
		/** This package's copy namespace. */
		const NS = "goalVector";
		/** Sidebar row id and main-panel key: the same string links the two. */
		const PANEL_ID = "goal-vector";
		/** Browser services: the slot registry and copy. */
		const inject = ["slots", "locale"];
		/** Host routes (registered by the Host half). */
		const VECTORS_URL = "/api/goal-vector/vectors";
		/** Host route answering and changing one chat's adopted vector. */
		const SELECTION_URL = "/api/goal-vector/selection";
		/** Poll interval while the page is open. */
		const REFRESH_MS = 20000;
		const en = {
			"panel.title": "Goals vectors",
			"panel.subtitle": "A goals vector is a priority-ordered list of goals for the AI: goal 1 matters most, and the lowest-priority goals are the ones to drop first",
			"panel.loading": "Loading…",
			"panel.error": "Goals-vector service unavailable: {message}",
			"panel.empty": "No goals vectors yet. Add one below.",
			"panel.refresh": "Refresh",
			"panel.count": "{count} vector(s)",
			"form.name": "Name",
			"form.namePlaceholder": "Release 2.0",
			"form.description": "Note",
			"form.descriptionPlaceholder": "What this vector is for (optional)",
			"form.goals": "Goals in priority order",
			"form.goalsHint": "The first line matters most. Move lines with the arrows; the AI drops the lowest-priority goals first.",
			"form.goalPlaceholder": "Goal {index}",
			"form.addGoal": "Add goal",
			"form.removeGoal": "Remove",
			"form.moveUp": "Move up",
			"form.moveDown": "Move down",
			"form.add": "Add vector",
			"form.adding": "Adding…",
			"form.save": "Save changes",
			"form.saving": "Saving…",
			"form.cancel": "Cancel",
			"form.invalid": "Check the form: {message}",
			"column.name": "Name",
			"column.goals": "Goals",
			"column.actions": "Actions",
			"vector.edit": "Edit",
			"vector.delete": "Delete",
			"vector.updated": "Saved \"{name}\"",
			"vector.deleted": "Deleted \"{name}\"",
			"composer.label": "Goals vector",
			"composer.none": "No vector",
			"composer.title": "Which goals vector should the AI follow in this chat?",
			"composer.saved": "This chat now follows \"{name}\"",
			"composer.cleared": "Goals vector cleared",
			"composer.failed": "Could not change the goals vector: {message}"
		};
		const zh = {
			"panel.title": "目标向量",
			"panel.subtitle": "目标向量是按优先级排列的目标清单：第 1 条最重要，优先级最低的目标最先放弃",
			"panel.loading": "加载中…",
			"panel.error": "目标向量服务不可用：{message}",
			"panel.empty": "还没有目标向量，请在下方添加。",
			"panel.refresh": "刷新",
			"panel.count": "{count} 个向量",
			"form.name": "名称",
			"form.namePlaceholder": "发布 2.0",
			"form.description": "备注",
			"form.descriptionPlaceholder": "这个向量的用途（可选）",
			"form.goals": "按优先级排列的目标",
			"form.goalsHint": "第一行最重要。可用箭头调整顺序；AI 会最先放弃优先级最低的目标。",
			"form.goalPlaceholder": "目标 {index}",
			"form.addGoal": "添加目标",
			"form.removeGoal": "删除",
			"form.moveUp": "上移",
			"form.moveDown": "下移",
			"form.add": "添加向量",
			"form.adding": "添加中…",
			"form.save": "保存修改",
			"form.saving": "保存中…",
			"form.cancel": "取消",
			"form.invalid": "请检查表单：{message}",
			"column.name": "名称",
			"column.goals": "目标",
			"column.actions": "操作",
			"vector.edit": "编辑",
			"vector.delete": "删除",
			"vector.updated": "已保存“{name}”",
			"vector.deleted": "已删除“{name}”",
			"composer.label": "目标向量",
			"composer.none": "无向量",
			"composer.title": "本会话中 AI 应遵循哪个目标向量？",
			"composer.saved": "本会话开始遵循“{name}”",
			"composer.cleared": "已清除目标向量",
			"composer.failed": "无法修改目标向量：{message}"
		};
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
		/** One host call; throws the server's message on a non-2xx answer. */
		async function callHost(method, url, body) {
			const response = await fetch(url, {
				method,
				cache: "no-store",
				...(body === undefined ? {} : {
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body)
				})
			});
			let payload;
			try {
				payload = await response.json();
			} catch {
				payload = undefined;
			}
			if (!response.ok) {
				const message = payload?.error ?? `HTTP ${response.status}`;
				const error = new Error(message);
				error.field = payload?.field;
				throw error;
			}
			return payload;
		}
		/** Shared status line that clears itself. */
		function useNotice() {
			const [notice, setNotice] = react.useState(null);
			react.useEffect(() => {
				if (notice === null) return undefined;
				const timer = setTimeout(() => setNotice(null), 6000);
				return () => clearTimeout(timer);
			}, [notice]);
			return [notice, setNotice];
		}
		const inputStyle = {
			boxSizing: "border-box",
			padding: "6px 8px",
			borderRadius: "6px",
			border: "1px solid var(--dsw-alias-border-l4, #d0d3d6)",
			background: "var(--dsw-alias-bg-base, transparent)",
			color: "var(--dsw-alias-label-primary, inherit)",
			font: "inherit",
			fontSize: "13px"
		};
		/** One labelled field. */
		function label(text, child) {
			return el("label", { style: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--dsw-alias-label-secondary, inherit)" } },
				el("span", null, text),
				child);
		}
		/** One button. */
		function button(text, onClick, options = {}) {
			return el("button", {
				type: "button",
				onClick,
				disabled: options.disabled === true,
				title: options.title,
				style: {
					padding: options.compact === true ? "3px 8px" : "6px 12px",
					borderRadius: "6px",
					border: options.primary === true ? "none" : "1px solid var(--dsw-alias-border-l4, #d0d3d6)",
					background: options.primary === true ? "var(--dsw-alias-interactive-bg-primary, #3a6df0)" : "transparent",
					color: options.primary === true ? "var(--dsw-alias-label-inverse, #fff)" : "var(--dsw-alias-label-primary, inherit)",
					font: "inherit",
					fontSize: options.compact === true ? "12px" : "13px",
					cursor: options.disabled === true ? "default" : "pointer",
					opacity: options.disabled === true ? 0.5 : 1,
					whiteSpace: "nowrap"
				}
			}, text);
		}
		/**
		* The vector editor, used both to add a vector and to change an existing
		* one. Keeping one component means the goal list, its reordering, and the
		* validation behave identically on both paths.
		*/
		function VectorForm({ t, vector, onDone, onCancel, onError }) {
			const editing = vector !== undefined && vector !== null;
			const [draft, setDraft] = react.useState(() => editing
				? { name: vector.name, description: vector.description, goals: [...vector.goals] }
				: { name: "", description: "", goals: [""] });
			const [busy, setBusy] = react.useState(false);
			const goals = draft.goals;
			const setGoal = (index, value) => setDraft((current) => {
				const next = [...current.goals];
				next[index] = value;
				return { ...current, goals: next };
			});
			const addGoal = () => setDraft((current) => ({ ...current, goals: [...current.goals, ""] }));
			const removeGoal = (index) => setDraft((current) => ({
				...current,
				goals: current.goals.length === 1 ? [""] : current.goals.filter((_, at) => at !== index)
			}));
			const move = (index, delta) => setDraft((current) => {
				const target = index + delta;
				if (target < 0 || target >= current.goals.length) return current;
				const next = [...current.goals];
				const [moved] = next.splice(index, 1);
				next.splice(target, 0, moved);
				return { ...current, goals: next };
			});
			const save = async () => {
				setBusy(true);
				try {
					const body = {
						name: draft.name,
						description: draft.description,
						// Blank trailing rows are dropped: the person often leaves one
						// empty line ready for the next goal.
						goals: goals.map((goal) => goal.trim()).filter((goal) => goal !== "")
					};
					if (editing) {
						await callHost("POST", `${VECTORS_URL}/${encodeURIComponent(vector.id)}`, body);
					} else {
						await callHost("POST", VECTORS_URL, body);
					}
					await onDone(body.name);
				} catch (error) {
					onError(fill(t("form.invalid"), { message: error.message }));
				} finally {
					setBusy(false);
				}
			};
			const canSave = !busy && draft.name.trim() !== "" && goals.some((goal) => goal.trim() !== "");
			return el("div", { style: { display: "flex", flexDirection: "column", gap: "10px", padding: "12px", border: "1px solid var(--dsw-alias-border-l4, #d0d3d6)", borderRadius: "10px", background: "var(--dsw-alias-bg-elevated, transparent)" } },
				el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } },
					el("div", { style: { flex: "1 1 220px" } }, label(t("form.name"), el("input", {
						value: draft.name,
						placeholder: t("form.namePlaceholder"),
						style: { ...inputStyle, width: "100%" },
						onChange: (event) => setDraft((current) => ({ ...current, name: event.target.value }))
					}))),
					el("div", { style: { flex: "2 1 320px" } }, label(t("form.description"), el("input", {
						value: draft.description,
						placeholder: t("form.descriptionPlaceholder"),
						style: { ...inputStyle, width: "100%" },
						onChange: (event) => setDraft((current) => ({ ...current, description: event.target.value }))
					})))),
				el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
					el("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary, inherit)" } }, t("form.goals")),
					el("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, inherit)" } }, t("form.goalsHint")),
					...goals.map((goal, index) => el("div", { key: `goal-${String(index)}`, style: { display: "flex", gap: "6px", alignItems: "center" } },
						el("span", { style: { minWidth: "20px", textAlign: "right", fontSize: "12px", color: "var(--dsw-alias-label-tertiary, inherit)" } }, `${String(index + 1)}.`),
						el("input", {
							value: goal,
							placeholder: fill(t("form.goalPlaceholder"), { index: index + 1 }),
							style: { ...inputStyle, flex: 1 },
							onChange: (event) => setGoal(index, event.target.value)
						}),
						button("↑", () => move(index, -1), { compact: true, disabled: index === 0, title: t("form.moveUp") }),
						button("↓", () => move(index, 1), { compact: true, disabled: index === goals.length - 1, title: t("form.moveDown") }),
						button("✕", () => removeGoal(index), { compact: true, title: t("form.removeGoal") }))),
					el("div", null, button(t("form.addGoal"), addGoal, { compact: true }))),
				el("div", { style: { display: "flex", gap: "8px" } },
					button(busy ? (editing ? t("form.saving") : t("form.adding")) : (editing ? t("form.save") : t("form.add")), save, { primary: true, disabled: !canSave }),
					editing ? button(t("form.cancel"), onCancel, { compact: true }) : null));
		}
		/** One row in the vectors table. */
		function VectorRow({ vector, t, editing, onEdit, onChanged, onError }) {
			const [busy, setBusy] = react.useState(false);
			const remove = async () => {
				setBusy(true);
				try {
					await callHost("DELETE", `${VECTORS_URL}/${encodeURIComponent(vector.id)}`);
					await onChanged();
				} catch (error) {
					onError(error.message);
				} finally {
					setBusy(false);
				}
			};
			return el("tr", null,
				el("td", { style: { padding: "8px 10px", verticalAlign: "top" } },
					el("div", { style: { fontWeight: 600 } }, vector.name),
					vector.description === "" ? null : el("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, inherit)" } }, vector.description)),
				el("td", { style: { padding: "8px 10px", verticalAlign: "top" } },
					el("ol", { style: { margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--dsw-alias-label-secondary, inherit)" } },
						...vector.goals.map((goal, index) => el("li", { key: `g-${String(index)}` }, goal)))),
				el("td", { style: { padding: "8px 10px", verticalAlign: "top", whiteSpace: "nowrap" } },
					button(t("vector.edit"), onEdit, { compact: true, disabled: busy }),
					" ",
					button(t("vector.delete"), remove, { compact: true, disabled: busy })));
		}
		/** The management page: the vectors table with an in-place editor. */
		function GoalVectorPanel({ t }) {
			const [state, setState] = react.useState({ vectors: [], loading: true, error: null });
			const [editingId, setEditingId] = react.useState(null);
			const [adding, setAdding] = react.useState(false);
			const [notice, setNotice] = useNotice();
			const load = react.useCallback(async () => {
				try {
					const payload = await callHost("GET", VECTORS_URL);
					setState({ vectors: Array.isArray(payload?.vectors) ? payload.vectors : [], loading: false, error: null });
				} catch (error) {
					setState((current) => ({ ...current, loading: false, error: error.message }));
				}
			}, []);
			react.useEffect(() => {
				void load();
				const timer = setInterval(() => void load(), REFRESH_MS);
				return () => clearInterval(timer);
			}, [load]);
			// A deleted vector must not leave a dangling editor open.
			const editing = editingId === null ? undefined : state.vectors.find((vector) => vector.id === editingId);
			react.useEffect(() => {
				if (editingId !== null && !state.loading && editing === undefined) setEditingId(null);
			}, [editingId, editing, state.loading]);
			const headingStyle = { textAlign: "left", padding: "6px 10px", fontSize: "12px", color: "var(--dsw-alias-label-tertiary, inherit)" };
			const body = state.loading
				? el("div", { style: { fontSize: "13px" } }, t("panel.loading"))
				: state.vectors.length === 0
					? el("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-tertiary, inherit)" } }, t("panel.empty"))
					: el("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" } },
						el("thead", null, el("tr", null,
							el("th", { style: headingStyle }, t("column.name")),
							el("th", { style: headingStyle }, t("column.goals")),
							el("th", { style: headingStyle }, t("column.actions")))),
						el("tbody", null, state.vectors.flatMap((vector) => {
							const row = el(VectorRow, {
								key: vector.id,
								vector,
								t,
								editing: vector.id === editingId,
								onEdit: () => setEditingId((current) => (current === vector.id ? null : vector.id)),
								onChanged: load,
								onError: setNotice
							});
							if (vector.id !== editingId) return [row];
							// The editor renders in place, directly under its own row.
							const editor = el("tr", { key: `${vector.id}-editor` },
								el("td", { colSpan: 3, style: { padding: "0 10px 12px" } },
									el(VectorForm, {
										t,
										vector,
										onDone: async (name) => {
											setEditingId(null);
											await load();
											setNotice(fill(t("vector.updated"), { name }));
										},
										onCancel: () => setEditingId(null),
										onError: setNotice
									})));
							return [row, editor];
						})));
			return el("div", { style: { padding: "16px", display: "flex", flexDirection: "column", gap: "12px", maxWidth: "900px" } },
				el("div", null,
					el("h2", { style: { margin: "0 0 4px", fontSize: "16px" } }, t("panel.title")),
					el("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, inherit)" } }, t("panel.subtitle"))),
				state.error === null ? null : el("div", { style: { color: "var(--dsw-alias-state-error-primary, #c0392b)", fontSize: "13px" } }, fill(t("panel.error"), { message: state.error })),
				notice === null ? null : el("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary, inherit)" } }, notice),
				el("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
					button(t("panel.refresh"), load, { compact: true }),
					button(t("form.add"), () => setAdding(true), { compact: true, primary: true, disabled: adding }),
					el("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, inherit)" } }, fill(t("panel.count"), { count: state.vectors.length }))),
				adding ? el(VectorForm, {
					t,
					vector: undefined,
					onDone: async (name) => {
						setAdding(false);
						await load();
						setNotice(fill(t("vector.updated"), { name }));
					},
					onCancel: () => setAdding(false),
					onError: setNotice
				}) : null,
				body);
		}
		/** The sidebar row: a small priority-ordered list glyph. */
		function VectorGlyph({ size = 16 }) {
			return el("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
				el("path", { d: "M2 3.5h12M2 8h9M2 12.5h6", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }),
				el("circle", { cx: 13.5, cy: 12.5, r: 1.5, fill: "currentColor" }));
		}
		/**
		* The composer selector: which goals vector this chat follows.
		*
		* It sits in the composer's tool row beside the permission and plan
		* controls. The current value comes from the Host (the plugin's own store),
		* so it follows a selection made anywhere — this selector, the model's own
		* `goal_vector_adopt` call, or another tab — on the next poll.
		*
		* The selection is deliberately NOT a session projection: the harness
		* refuses to restore a session holding an event type it does not know, and
		* a plugin cannot extend that whitelist. Keeping the mapping in the plugin's
		* store is what makes adoption survive a restart.
		*/
		function GoalVectorSelect({ sessionId, t }) {
			const [state, setState] = react.useState({ vectors: [], current: "", name: null });
			const [busy, setBusy] = react.useState(false);
			const [notice, setNotice] = useNotice();
			const load = react.useCallback(async () => {
				if (typeof sessionId !== "string" || sessionId === "") return;
				try {
					const payload = await callHost("GET", `${SELECTION_URL}?sessionId=${encodeURIComponent(sessionId)}`);
					setState({
						vectors: Array.isArray(payload?.vectors) ? payload.vectors : [],
						current: payload?.selection?.vectorId ?? "",
						name: payload?.selection?.name ?? null
					});
				} catch {
					// Without the list the selector still shows the last known choice, so
					// a transient failure is not worth an error line in the composer.
					setState((current) => current);
				}
			}, [sessionId]);
			react.useEffect(() => {
				void load();
				const timer = setInterval(() => void load(), REFRESH_MS);
				return () => clearInterval(timer);
			}, [load]);
			const current = state.current;
			const choose = async (event) => {
				const next = event.target.value;
				setBusy(true);
				// Show the pick immediately; the poll reconciles it with the Host.
				setState((previous) => ({ ...previous, current: next, name: previous.vectors.find((vector) => vector.id === next)?.name ?? null }));
				try {
					const payload = await callHost("POST", SELECTION_URL, { sessionId, vectorId: next === "" ? null : next });
					const name = payload?.selection?.name ?? null;
					setNotice(name === null ? t("composer.cleared") : fill(t("composer.saved"), { name }));
					await load();
				} catch (error) {
					setNotice(fill(t("composer.failed"), { message: error.message }));
					await load();
				} finally {
					setBusy(false);
				}
			};
			// A vector deleted after being adopted vanishes from the list; keep the
			// adopted id visible so the selector never lies about the current state.
			const options = [...state.vectors];
			if (current !== "" && !options.some((vector) => vector.id === current)) {
				options.unshift({ id: current, name: state.name ?? current });
			}
			return el("div", { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } },
				el("select", {
					value: current,
					disabled: busy,
					title: notice ?? t("composer.title"),
					"aria-label": t("composer.label"),
					onChange: choose,
					style: {
						maxWidth: "200px",
						height: "28px",
						color: current === "" ? "var(--dsw-alias-label-tertiary, inherit)" : "var(--dsw-alias-state-business-primary, #3a6df0)",
						whiteSpace: "nowrap",
						cursor: busy ? "default" : "pointer",
						appearance: "none",
						backgroundColor: "transparent",
						border: "none",
						borderRadius: "8px",
						outline: "none",
						padding: "0 4px",
						font: "inherit",
						fontSize: "13px",
						fontWeight: 500,
						textOverflow: "ellipsis"
					}
				},
					el("option", { value: "" }, t("composer.none")),
					...options.map((vector) => el("option", { key: vector.id, value: vector.id }, vector.name))));
		}
		/**
		* Client plugin body: the sidebar row, the management page, and the
		* composer selector.
		* @param ctx - client root context carrying slots and locale.
		*/
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "goal-vector: dictionaries");
			// The same id links the sidebar row to the main panel: the sidebar passes
			// this id to layout.selectPanel().
			ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 80,
				label: () => t("panel.title")
			}, VectorGlyph)), "goal-vector: panel icon");
			ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: NS
			}, GoalVectorPanel)), "goal-vector: panel body");
			// The per-chat picker rides the composer's tool row, next to the
			// permission and plan controls.
			ctx.effect(() => ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "goal-vector",
				order: 20,
				locale: NS
			}, GoalVectorSelect)), "goal-vector: composer selector");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
