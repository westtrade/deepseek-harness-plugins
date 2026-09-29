window.__ModuleLoader__.load({
	id: "dsh-goal-vector",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		// The composer controls are built from the shell's own primitives, so the
		// goals-vector picker is the same widget as the shipped "Workspace Write"
		// control rather than a lookalike. These are platform seed modules: they
		// resolve through the loader's require without a package dependency.
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
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
		/**
		* Class hook names for the composer trigger.
		*
		* Mirrors the shape of the shipped control: a pill-shaped button carrying a
		* label and a chevron. Attribute-free classes are safe here because every
		* rule is scoped under our own style tag.
		*/
		const GOAL_VECTOR_CLASS = {
			trigger: "dshgv_trigger",
			triggerLabel: "dshgv_triggerLabel",
			chevron: "dshgv_chevron",
			chevronOpen: "dshgv_chevronOpen"
		};
		/**
		* Composer trigger CSS, copied from the shipped `PermissionSelect` styles so
		* the two controls sit in the tool row with identical metrics (28px tall,
		* 13px/500 label, 24px radius, same hover and chevron behaviour).
		*/
		const GOAL_VECTOR_CSS = ".dshgv_trigger{min-width:0;max-width:220px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex}.dshgv_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dshgv_trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.dshgv_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dshgv_triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.dshgv_chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s;display:inline-flex}.dshgv_chevronOpen{transform:rotate(180deg)}";
		/** Style-tag identity, mirroring the loader's `data-plugin-css` convention. */
		const STYLE_TAG = "dsh-goal-vector/composer.css";
		/** Inject the composer stylesheet once per document. */
		function ensureComposerStyle() {
			if (typeof document === "undefined") return;
			const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`;
			if (document.querySelector(selector) !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-goal-vector";
			tag.dataset.pluginCss = STYLE_TAG;
			tag.textContent = GOAL_VECTOR_CSS;
			document.head.appendChild(tag);
		}
		const en = {
			"panel.title": "Goals vectors",
			"panel.subtitle": "Priority-ordered goals the AI follows while working in a project",
			"about.title": "What is a goals vector?",
			"about.lead": "A goals vector is one of the categories of a fairly general theory of control. It describes the ideal mode of functioning (behaviour) of an object. Here it is the list of goals for the AI working in a project.",
			"about.goalTerm": "Goal —",
			"about.goal": "the end result to be reached: an ideal, a material or spiritual need, a task to be solved, a parameter of the thing being built, a plan.",
			"about.orderTerm": "Order —",
			"about.order": "the vector is built by subjective choice, as a hierarchically ordered set of particular goals — the ones that would be achieved under ideal (errorless) control. Their order is the reverse of the order of successive forced abandonment of each goal, should the full set prove impossible. So the first priority is the most important goal, and the last is the least significant — the one whose abandonment is acceptable first.",
			"about.changeTerm": "Change —",
			"about.change": "a vector may change during control, as a function of time or of the process's available possibilities. In this plugin that is literal: a chat's vector can be switched at any moment, and it applies from the next step.",
			"about.prioritiesTerm": "Priorities —",
			"about.priorities": "the same set of goals under different priority orders makes different vectors — and therefore possibly different control.",
			"about.measureTerm": "Measure —",
			"about.measure": "each goal needs some measure of quality (parameters). That is what makes vectors comparable, so that adding and subtracting them means something.",
			"about.defectsTerm": "Defects —",
			"about.defects": "a vector is defective when it holds mutually exclusive or unstable goals, or when it falls outside the objectively possible states of the object — all of which lead to loss of control.",
			"about.summary": "Put figuratively: a goals vector is a list, an inventory of what we want, with numbers assigned in the reverse order of the forced abandonment of each of those wants.",
			"about.exampleTitle": "Example",
			"about.example": "a release vector — 1. do not break existing tests · 2. keep the project's style · 3. touch as few files as possible",
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
		/**
		* Russian dictionary.
		*
		* Russian is a language PACK (`ctx.locale.addLanguage`), not a built-in: the
		* shell ships only `zh` and `en`. Registering it this way adds it to the
		* Language picker in Settings, and its declared fallback to `en` means every
		* OTHER plugin keeps working — a namespace with no `ru` entries falls through
		* to English rather than showing raw keys.
		*/
		const ru = {
			"panel.title": "Векторы целей",
			"panel.subtitle": "Цели по приоритету, которым ИИ следует в работе над проектом",
			"about.title": "Что такое вектор целей?",
			"about.lead": "Вектор целей управления — одна из категорий достаточно общей теории управления. Он представляет собой описание идеального режима функционирования (поведения) объекта. Здесь это список целей для ИИ, работающего в проекте.",
			"about.goalTerm": "Цель —",
			"about.goal": "конечный результат, которого стремимся достигнуть: идеал, материальная или духовная потребность, задача, параметр разрабатываемого изделия, план.",
			"about.orderTerm": "Порядок —",
			"about.order": "вектор строится по субъективному произволу как иерархически упорядоченное множество частных целей — тех, которые должны быть осуществлены в случае идеального (безошибочного) управления. Порядок следования целей в нём обратен порядку последовательного вынужденного отказа от каждой из них, если осуществить полную совокупность невозможно. Соответственно на первом приоритете стоит самая важная цель, на последнем — самая незначительная, отказ от которой допустим первым.",
			"about.changeTerm": "Изменяемость —",
			"about.change": "вектор целей может изменяться в процессе управления — как функция времени либо как функция матрицы возможностей течения процесса. Здесь это буквально так: вектор чата можно сменить в любой момент, и он действует со следующего шага.",
			"about.prioritiesTerm": "Приоритеты —",
			"about.priorities": "одна и та же совокупность целей при разных порядках значимости образует разные векторы целей — а значит, возможно, и разное управление.",
			"about.measureTerm": "Мера качества —",
			"about.measure": "в пределах каждого качества должна быть определена хоть в каком-нибудь смысле мера качества (параметры). Благодаря этому векторы сопоставимы, и сложение с вычитанием обретают смысл.",
			"about.defectsTerm": "Дефекты —",
			"about.defects": "вектор дефективен, если в нём есть взаимно исключающие или неустойчивые цели, либо если он выпадает из объективной матрицы возможных состояний объекта, — всё это ведёт к потере управления.",
			"about.summary": "Образно говоря, вектор целей — это список, перечень того, чего желаем, с номерами, назначенными в порядке, обратном порядку вынужденного отказа от осуществления каждого из этих желаний.",
			"about.exampleTitle": "Пример",
			"about.example": "вектор выпуска релиза — 1. не сломать существующие тесты · 2. сохранить стиль проекта · 3. затронуть как можно меньше файлов",
			"panel.loading": "Загрузка…",
			"panel.error": "Служба векторов целей недоступна: {message}",
			"panel.empty": "Векторов целей пока нет. Добавьте первый ниже.",
			"panel.refresh": "Обновить",
			"panel.count": "Векторов: {count}",
			"form.name": "Название",
			"form.namePlaceholder": "Выпуск релиза 2.0",
			"form.description": "Заметка",
			"form.descriptionPlaceholder": "Для чего этот вектор (необязательно)",
			"form.goals": "Цели по приоритету",
			"form.goalsHint": "Первая строка важнее всех. Меняйте порядок стрелками; от целей с меньшим приоритетом ИИ отказывается первыми.",
			"form.goalPlaceholder": "Цель {index}",
			"form.addGoal": "Добавить цель",
			"form.removeGoal": "Удалить",
			"form.moveUp": "Выше",
			"form.moveDown": "Ниже",
			"form.add": "Добавить вектор",
			"form.adding": "Добавление…",
			"form.save": "Сохранить",
			"form.saving": "Сохранение…",
			"form.cancel": "Отмена",
			"form.invalid": "Проверьте форму: {message}",
			"column.name": "Название",
			"column.goals": "Цели",
			"column.actions": "Действия",
			"vector.edit": "Изменить",
			"vector.delete": "Удалить",
			"vector.updated": "Сохранено «{name}»",
			"vector.deleted": "Удалено «{name}»",
			"composer.label": "Вектор целей",
			"composer.none": "Без вектора",
			"composer.title": "По какому вектору целей должен работать ИИ в этом чате?",
			"composer.saved": "Этот чат следует «{name}»",
			"composer.cleared": "Вектор целей снят",
			"composer.failed": "Не удалось сменить вектор целей: {message}"
		};
		const zh = {
			"panel.title": "目标向量",
			"panel.subtitle": "AI 在项目中工作时遵循的按优先级排列的目标清单",
			"about.title": "什么是目标向量？",
			"about.lead": "目标向量是相当一般的控制理论的范畴之一。它描述对象理想的运行（行为）模式。在这里，它就是 AI 在项目中工作时所遵循的目标清单。",
			"about.goalTerm": "目标——",
			"about.goal": "要达到的最终结果：理想、物质或精神上的需要、需要解决的任务、所开发产品的参数、计划等。",
			"about.orderTerm": "顺序——",
			"about.order": "目标向量按主观意愿构建为分层排列的若干具体目标——即在理想（无差错）控制下应当实现的那些目标。其顺序与依次被迫放弃各目标的顺序相反（当无法实现全部目标时）。因此第一优先级是最重要的目标，最后一条最次要，也是最可以先放弃的。",
			"about.changeTerm": "可变性——",
			"about.change": "目标向量在控制过程中可以改变——它是时间的函数，或是过程可能性的函数。在本插件中这是字面意义上的：会话的向量可随时切换，并从下一步开始生效。",
			"about.prioritiesTerm": "优先级——",
			"about.priorities": "同一组目标按不同的优先级排序，构成不同的目标向量——因而可能导致不同的控制。",
			"about.measureTerm": "度量——",
			"about.measure": "每个目标都需要有某种意义上的质量度量（参数）。有了它，向量之间才可比较，相加与相减才有意义。",
			"about.defectsTerm": "缺陷——",
			"about.defects": "若向量中存在互相排斥或不稳定的目标，或它脱离了对象可能的客观状态集合，则该向量是有缺陷的——这些都会导致失控。",
			"about.summary": "形象地说，目标向量是一份清单，列出我们所期望的东西，其编号顺序与被迫放弃各项期望的顺序相反。",
			"about.exampleTitle": "示例",
			"about.example": "发布向量 —— 1. 不破坏现有测试 · 2. 保持项目风格 · 3. 尽量少改动文件",
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
		/**
		* What a goals vector is, in the words the idea comes from.
		*
		* Shown on the management page because the concept is not self-evident from
		* the form alone: the whole point is that the ORDER carries the meaning, and
		* a reader who misses that will fill the list in the wrong direction.
		*
		* Collapsible (open by default) so the page stays workable once the idea is
		* familiar.
		*/
		function AboutVector({ t }) {
			const [open, setOpen] = react.useState(true);
			const paragraph = (text, key) => el("p", { key, style: { margin: "0 0 8px", fontSize: "12.5px", lineHeight: "19px", color: "var(--dsw-alias-label-secondary, inherit)" } }, text);
			const term = (label, text, key) => el("div", { key, style: { display: "flex", gap: "8px", fontSize: "12.5px", lineHeight: "19px", color: "var(--dsw-alias-label-secondary, inherit)" } },
				el("span", { style: { flex: "none", fontWeight: 600, color: "var(--dsw-alias-label-primary, inherit)" } }, label),
				el("span", null, text));
			return el("div", {
				style: {
					border: "1px solid var(--dsw-alias-border-l4, #d0d3d6)",
					borderRadius: "10px",
					background: "var(--dsw-alias-bg-elevated, transparent)",
					padding: "12px 14px"
				}
			},
				el("button", {
					type: "button",
					onClick: () => setOpen(!open),
					style: {
						display: "flex",
						alignItems: "center",
						gap: "6px",
						width: "100%",
						padding: 0,
						border: "none",
						background: "transparent",
						color: "var(--dsw-alias-label-primary, inherit)",
						font: "inherit",
						fontSize: "13px",
						fontWeight: 600,
						cursor: "pointer",
						textAlign: "left"
					}
				},
					el("span", { "aria-hidden": true, style: { display: "inline-flex", transition: "transform .12s", transform: open ? "rotate(90deg)" : "none" } }, "▸"),
					t("about.title")),
				open ? el("div", { style: { marginTop: "8px" } },
					paragraph(t("about.lead"), "lead"),
					term(t("about.goalTerm"), t("about.goal"), "goal"),
					el("div", { style: { height: "6px" } }),
					term(t("about.orderTerm"), t("about.order"), "order"),
					el("div", { style: { height: "6px" } }),
					term(t("about.changeTerm"), t("about.change"), "change"),
					el("div", { style: { height: "6px" } }),
					term(t("about.prioritiesTerm"), t("about.priorities"), "priorities"),
					el("div", { style: { height: "6px" } }),
					term(t("about.measureTerm"), t("about.measure"), "measure"),
					el("div", { style: { height: "6px" } }),
					term(t("about.defectsTerm"), t("about.defects"), "defects"),
					el("div", { style: { height: "6px" } }),
					el("p", { style: { margin: "10px 0 0", fontSize: "12.5px", lineHeight: "19px", fontWeight: 600, color: "var(--dsw-alias-label-primary, inherit)" } }, t("about.summary")),
					el("p", { style: { margin: "8px 0 0", fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, inherit)" } },
						`${t("about.exampleTitle")}: ${t("about.example")}`)) : null);
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
				el(AboutVector, { t }),
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
			const [open, setOpen] = react.useState(false);
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
			const choose = async (next) => {
				setOpen(false);
				if (next === current) return;
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
			// adopted id visible so the selector never picks an entry it cannot show.
			const options = [...state.vectors];
			if (current !== "" && !options.some((vector) => vector.id === current)) {
				options.unshift({ id: current, name: state.name ?? current });
			}
			const currentLabel = current === "" ? t("composer.none") : (options.find((vector) => vector.id === current)?.name ?? current);
			const items = [
				{ id: "", label: t("composer.none") },
				...options.map((vector) => ({ id: vector.id, label: vector.name, ...(vector.description === undefined || vector.description === "" ? {} : { detail: vector.description }) }))
			];
			// The trigger mirrors the shipped "Workspace Write" control (same pill,
			// same chevron, same `Menu` popup), so the composer tool row keeps one
			// visual language instead of growing a native <select> beside it.
			return el(primitives.Menu, {
				open,
				items,
				selectedId: current,
				onSelect: choose,
				onClose: () => setOpen(false),
				side: "top",
				anchor: el("button", {
					type: "button",
					className: GOAL_VECTOR_CLASS.trigger,
					"aria-label": t("composer.label"),
					title: notice ?? t("composer.title"),
					disabled: busy,
					onClick: () => setOpen(!open),
					children: [
						el("span", { className: GOAL_VECTOR_CLASS.triggerLabel, children: currentLabel }),
						el("span", {
							className: `${GOAL_VECTOR_CLASS.chevron}${open ? ` ${GOAL_VECTOR_CLASS.chevronOpen}` : ""}`,
							"aria-hidden": true,
							children: el(primitives.IconChevronDownOutline14, {})
						})
					]
				})
			});
		}
		/**
		* Client plugin body: the sidebar row, the management page, and the
		* composer selector.
		* @param ctx - client root context carrying slots and locale.
		*/
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ensureComposerStyle();
			ctx.effect(() => {
				ensureComposerStyle();
				return () => {
					document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`)?.remove();
				};
			}, "goal-vector: composer styles");
			// Russian arrives as a language pack: the shell ships only zh and en, so
			// adding it here also makes it selectable in Settings → Language. Its
			// fallback is English, so every other plugin keeps working when Russian
			// is active — their namespaces simply fall through to `en`.
			ctx.effect(() => ctx.locale.addLanguage({ id: "ru", label: "Русский", fallback: "en" }), "goal-vector: russian language pack");
			ctx.effect(() => ctx.locale.register(NS, { zh, en, ru }), "goal-vector: dictionaries");
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
