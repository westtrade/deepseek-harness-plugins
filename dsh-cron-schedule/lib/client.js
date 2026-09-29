window.__ModuleLoader__.load({
	id: "dsh-cron-schedule",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region lib/types/client/index.js
		/** This package's copy namespace. */
		const NS = "cronSchedule";
		/** Sidebar row id and main-panel key: the same string links the two. */
		const PANEL_ID = "cron-schedule";
		/** Browser services: slot registry, the OS directory picker, copy. */
		const inject = ["slots", "locale", "uiWorkspace"];
		/** Host routes (registered by the Host half). */
		const JOBS_URL = "/api/cron-schedule/jobs";
		/** Host route answering the plugin settings and the routable model catalog. */
		const SETTINGS_URL = "/api/cron-schedule/settings";
		/** Host route listing the chats a schedule can post into. */
		const CHATS_URL = "/api/cron-schedule/chats";
		/** Poll interval while the panel is open. */
		const REFRESH_MS = 20000;
		const en = {
			"panel.title": "AI schedules",
			"panel.subtitle": "At each due time a new chat starts in the chosen folder and receives the task",
			"panel.loading": "Loading…",
			"panel.error": "Schedule service unavailable: {message}",
			"panel.empty": "No schedules yet. Add one below.",
			"panel.refresh": "Refresh",
			"settings.allowedModels": "Models the AI may schedule on",
			"settings.allowedModelsHint": "Empty means no restriction: the AI may pick any routed model. Add entries to limit both the panel's picker and the AI's cron_create to this list. Only a person can change it.",
			"settings.allowedModelsEmpty": "No restriction — every routed model is allowed.",
			"settings.addModel": "Add model",
			"settings.addModelPlaceholder": "— pick a model to allow —",
			"settings.remove": "Remove",
			"settings.save": "Save list",
			"form.name": "Name",
			"form.namePlaceholder": "Morning report",
			"form.preset": "When",
			"form.expression": "Cron expression",
			"form.timeZone": "Time zone",
			"form.workspace": "Working folder",
			"form.workspacePlaceholder": "/home/you/project or pick below",
			"form.browse": "Choose folder…",
			"form.pickExisting": "Existing workspace",
			"form.pickExistingPlaceholder": "— pick a saved workspace —",
			"form.prompt": "Task for the AI",
			"form.promptPlaceholder": "What should the new chat do?",
			"form.add": "Add schedule",
			"form.adding": "Adding…",
			"form.save": "Save changes",
			"form.saving": "Saving…",
			"form.cancel": "Cancel",
			"form.preview": "Next runs: {list}",
			"form.invalid": "Check the form: {message}",
			"form.chat": "Chat",
			"form.chatNew": "First run creates a chat, later runs continue it",
			"form.chatPick": "Reuse an existing chat",
			"form.chatPickPlaceholder": "— pick a chat —",
			"form.chatLoading": "Loading chats…",
			"form.chatBound": "Bound chat: {id}",
			"form.chatIgnored": "Ignored while \"always new chat\" is on",
			"form.alwaysNewChat": "Always start a new chat",
			"form.alwaysNewChatHint": "On: every run starts a fresh chat. Off: the first run creates one and every later run continues it, so a recurring task builds one conversation.",
			"column.chat": "Chat",
			"column.chatNew": "new each run",
			"column.chatUnbound": "not yet created",
			"form.model": "Model",
			"form.modelDefault": "Deployment default",
			"form.modelRestricted": "Only models allowed in Settings can be picked",
			"form.autoCatchUp": "Catch up missed runs after a restart",
			"form.autoCatchUpHint": "On: runs missed while DSH was off start by themselves at the next launch. Off: they wait for you to press Run. Only a person can change this.",
			"column.model": "Model",
			"column.auto": "Catch-up",
			"column.autoOn": "auto",
			"column.autoAsk": "ask",
			"column.name": "Name",
			"column.when": "When",
			"column.next": "Next run",
			"column.workspace": "Folder",
			"column.actions": "Actions",
			"job.never": "never",
			"job.run": "Run now",
			"job.running": "Starting…",
			"job.edit": "Edit",
			"job.editing": "Editing…",
			"job.updated": "Saved \"{name}\"",
			"job.delete": "Delete",
			"job.enable": "Enable",
			"job.disable": "Disable",
			"job.off": "off",
			"job.last": "Last: {status} {time}",
			"job.lastFailed": "Last run failed: {message}",
			"job.open": "Open chat",
			"missed.title": "{count} run(s) were missed while DSH was off",
			"missed.hint": "The time passed, but no chat was started. Run them or dismiss.",
			"missed.run": "Run",
			"missed.dismiss": "Dismiss",
			"preset.custom": "Custom expression",
			"preset.hourly": "Every hour",
			"preset.every30": "Every 30 minutes",
			"preset.daily9": "Every day at 09:00",
			"preset.weekdays9": "Weekdays at 09:00",
			"preset.monday9": "Mondays at 09:00",
			"preset.monthly1": "1st of the month at 09:00"
		};
		const zh = {
			"panel.title": "AI 定时任务",
			"panel.subtitle": "到点后在指定目录新建会话并把任务发给 AI",
			"panel.loading": "加载中…",
			"panel.error": "定时服务不可用：{message}",
			"panel.empty": "还没有任务，请在下方添加。",
			"panel.refresh": "刷新",
			"settings.allowedModels": "允许 AI 使用的模型",
			"settings.allowedModelsHint": "留空表示不限制：AI 可以选择任何可路由的模型。添加条目后，面板的下拉框和 AI 的 cron_create 都只能使用该列表。只有人可以修改。",
			"settings.allowedModelsEmpty": "未限制 — 允许所有可路由模型。",
			"settings.addModel": "添加模型",
			"settings.addModelPlaceholder": "— 选择要允许的模型 —",
			"settings.remove": "移除",
			"settings.save": "保存列表",
			"form.name": "名称",
			"form.namePlaceholder": "早间报告",
			"form.preset": "时间",
			"form.expression": "Cron 表达式",
			"form.timeZone": "时区",
			"form.workspace": "工作目录",
			"form.workspacePlaceholder": "/home/you/project 或从下方选择",
			"form.browse": "选择目录…",
			"form.pickExisting": "已有工作区",
			"form.pickExistingPlaceholder": "— 选择已保存的工作区 —",
			"form.prompt": "交给 AI 的任务",
			"form.promptPlaceholder": "新会话需要做什么？",
			"form.add": "添加任务",
			"form.adding": "添加中…",
			"form.save": "保存修改",
			"form.saving": "保存中…",
			"form.cancel": "取消",
			"form.preview": "接下来：{list}",
			"form.invalid": "请检查表单：{message}",
			"form.chat": "会话",
			"form.chatNew": "首次运行创建会话，之后继续使用",
			"form.chatPick": "复用已有会话",
			"form.chatPickPlaceholder": "— 选择会话 —",
			"form.chatLoading": "正在加载会话…",
			"form.chatBound": "已绑定会话：{id}",
			"form.chatIgnored": "开启「每次新建会话」时忽略此项",
			"form.alwaysNewChat": "每次运行都新建会话",
			"form.alwaysNewChatHint": "开启：每次运行都创建新会话。关闭：首次运行创建会话，之后一直沿用，使重复任务形成一段连续对话。",
			"column.chat": "会话",
			"column.chatNew": "每次新建",
			"column.chatUnbound": "尚未创建",
			"form.model": "模型",
			"form.modelDefault": "部署默认",
			"form.modelRestricted": "只能选择在设置中允许的模型",
			"form.autoCatchUp": "重启后自动补跑错过的任务",
			"form.autoCatchUpHint": "开启：DSH 关闭期间错过的运行会在下次启动时自行开始。关闭：等待你点击「补跑」。只有人可以修改此项。",
			"column.model": "模型",
			"column.auto": "补跑",
			"column.autoOn": "自动",
			"column.autoAsk": "询问",
			"column.name": "名称",
			"column.when": "时间",
			"column.next": "下次运行",
			"column.workspace": "目录",
			"column.actions": "操作",
			"job.never": "永不",
			"job.run": "立即运行",
			"job.running": "启动中…",
			"job.edit": "编辑",
			"job.editing": "编辑中…",
			"job.updated": "已保存“{name}”",
			"job.delete": "删除",
			"job.enable": "启用",
			"job.disable": "停用",
			"job.off": "已停用",
			"job.last": "上次：{status} {time}",
			"job.lastFailed": "上次运行失败：{message}",
			"job.open": "打开会话",
			"missed.title": "DSH 关闭期间错过了 {count} 次运行",
			"missed.hint": "时间已过，但没有启动会话。可以补跑或忽略。",
			"missed.run": "补跑",
			"missed.dismiss": "忽略",
			"preset.custom": "自定义表达式",
			"preset.hourly": "每小时",
			"preset.every30": "每 30 分钟",
			"preset.daily9": "每天 09:00",
			"preset.weekdays9": "工作日 09:00",
			"preset.monday9": "每周一 09:00",
			"preset.monthly1": "每月 1 日 09:00"
		};
		/** Schedule presets offered in the form; the value is a cron expression. */
		const PRESETS = [
			{ id: "hourly", expression: "0 * * * *" },
			{ id: "every30", expression: "*/30 * * * *" },
			{ id: "daily9", expression: "0 9 * * *" },
			{ id: "weekdays9", expression: "0 9 * * 1-5" },
			{ id: "monday9", expression: "0 9 * * 1" },
			{ id: "monthly1", expression: "0 9 1 * *" },
			{ id: "custom", expression: "" }
		];
		/** The viewer's zone, used as the form default and for time labels. */
		function localZone() {
			try {
				return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
			} catch {
				return "UTC";
			}
		}
		/** Render one instant in the job's own zone. */
		function formatAt(value, timeZone, withDate) {
			if (typeof value !== "number" || !Number.isFinite(value)) return null;
			const options = {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
				...(withDate === false ? {} : { day: "2-digit", month: "2-digit" })
			};
			try {
				return new Intl.DateTimeFormat("ru-RU", { ...options, timeZone }).format(new Date(value));
			} catch {
				return new Intl.DateTimeFormat("ru-RU", options).format(new Date(value));
			}
		}
		/** `1 234,56` style grouping for counts. */
		function formatCount(value) {
			return new Intl.NumberFormat("ru-RU").format(value);
		}
		/** Interpolate `{name}` placeholders in one copy string. */
		function fill(template, values) {
			let out = template;
			for (const [key, value] of Object.entries(values ?? {})) out = out.split(`{${key}}`).join(String(value));
			return out;
		}
		/** Small inline-styled element helper. */
		function el(tag, props, ...children) {
			return react.createElement(tag, props, ...children);
		}
		/** Shared field label. */
		function label(text, child) {
			return el("label", { style: { display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 } },
				el("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "16px" } }, text),
				child);
		}
		/**
		* A small rotating indicator for an in-flight fetch.
		*
		* Drawn as an SVG with its own `animateTransform` so it needs no stylesheet
		* and no global keyframes — the bundle ships no CSS for this panel.
		*
		* @param props - `size` in pixels and an accessible `label`.
		* @returns the spinner element.
		*/
		function Spinner({ size, label }) {
			const dimension = typeof size === "number" ? size : 12;
			return el("svg", {
				width: dimension,
				height: dimension,
				viewBox: "0 0 16 16",
				fill: "none",
				role: "status",
				"aria-label": label,
				style: { display: "block", flex: "none" }
			},
				el("circle", { cx: "8", cy: "8", r: "6", stroke: "currentColor", strokeWidth: "2", opacity: "0.25" }),
				el("path", { d: "M8 2a6 6 0 0 1 6 6", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round" },
					el("animateTransform", {
						attributeName: "transform",
						type: "rotate",
						from: "0 8 8",
						to: "360 8 8",
						dur: "0.8s",
						repeatCount: "indefinite"
					})));
		}
		/** Shared text input. */
		const inputStyle = {
			boxSizing: "border-box",
			width: "100%",
			padding: "6px 10px",
			borderRadius: "8px",
			border: "1px solid var(--dsw-alias-border-l4)",
			background: "var(--dsw-alias-bg-base, transparent)",
			color: "var(--dsw-alias-label-primary)",
			fontSize: "13px",
			lineHeight: "20px",
			fontFamily: "inherit"
		};
		/** Shared button. */
		function button(text, onClick, options) {
			const opts = options ?? {};
			return el("button", {
				type: "button",
				onClick,
				disabled: opts.disabled === true,
				title: opts.title,
				style: {
					padding: opts.compact === true ? "3px 10px" : "6px 14px",
					borderRadius: "12px",
					border: "1px solid var(--dsw-alias-border-l4)",
					background: opts.primary === true ? "var(--dsw-alias-interactive-bg-primary, var(--dsw-alias-border-l4))" : "transparent",
					color: opts.primary === true ? "var(--dsw-alias-label-inverse, var(--dsw-alias-label-primary))" : "var(--dsw-alias-label-secondary)",
					cursor: opts.disabled === true ? "default" : "pointer",
					opacity: opts.disabled === true ? 0.5 : 1,
					fontSize: "13px",
					lineHeight: "20px",
					fontFamily: "inherit",
					whiteSpace: "nowrap"
				}
			}, text);
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
		/** One row in the schedules table. */
		function JobRow({ job, t, editing, chats, onEdit, onChanged, onError }) {
			const [busy, setBusy] = react.useState(null);
			const next = formatAt(job.nextRunAt, job.timeZone);
			const last = formatAt(job.lastRunAt, job.timeZone);
			const run = async () => {
				setBusy("run");
				try {
					await callHost("POST", `${JOBS_URL}/${encodeURIComponent(job.id)}/run`);
				} catch (error) {
					onError(error.message);
				} finally {
					setBusy(null);
					await onChanged();
				}
			};
			const remove = async () => {
				setBusy("delete");
				try {
					await callHost("DELETE", `${JOBS_URL}/${encodeURIComponent(job.id)}`);
				} catch (error) {
					onError(error.message);
				} finally {
					setBusy(null);
					await onChanged();
				}
			};
			const toggle = async () => {
				setBusy("toggle");
				try {
					await callHost("POST", `${JOBS_URL}/${encodeURIComponent(job.id)}`, { enabled: job.enabled !== true });
				} catch (error) {
					onError(error.message);
				} finally {
					setBusy(null);
					await onChanged();
				}
			};
			return el("tr", { style: { borderTop: "1px solid var(--dsw-alias-border-l4)" } },
				el("td", { style: { padding: "8px 10px", verticalAlign: "top" } },
					el("div", { style: { color: "var(--dsw-alias-label-primary)", fontWeight: 600 } }, job.name),
					job.lastStatus !== null && job.lastStatus !== undefined
						? el("div", {
							style: {
								fontSize: "11px",
								lineHeight: "16px",
								color: job.lastStatus === "failed" ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-label-tertiary)"
							}
						}, job.lastStatus === "failed" && typeof job.lastError === "string"
							? t("job.lastFailed", { message: job.lastError })
							: t("job.last", { status: job.lastStatus, time: last ?? "" }))
						: null),
				el("td", { style: { padding: "8px 10px", verticalAlign: "top", color: "var(--dsw-alias-label-secondary)" } },
					el("div", null, job.expression),
					el("div", { style: { fontSize: "11px", lineHeight: "16px", color: "var(--dsw-alias-label-tertiary)" } }, job.description),
					el("div", { style: { fontSize: "11px", lineHeight: "16px", color: "var(--dsw-alias-label-tertiary)" } }, job.timeZone)),
				el("td", { style: { padding: "8px 10px", verticalAlign: "top", color: "var(--dsw-alias-label-secondary)", fontVariantNumeric: "tabular-nums" } },
					job.enabled !== true
						? t("job.off")
						: next === null ? t("job.never") : next),
				el("td", {
					style: {
						padding: "8px 10px",
						verticalAlign: "top",
						fontSize: "12px",
						color: job.alwaysNewChat === true || job.sessionId === null || job.sessionId === undefined
							? "var(--dsw-alias-label-tertiary)"
							: "var(--dsw-alias-label-secondary)",
						wordBreak: "break-all"
					}
				}, job.alwaysNewChat === true
					? t("column.chatNew")
					: (job.sessionId === null || job.sessionId === undefined
						? t("column.chatUnbound")
						: (chats ?? []).find((chat) => chat.sessionId === job.sessionId)?.title ?? job.sessionId)),
				el("td", {
					style: {
						padding: "8px 10px",
						verticalAlign: "top",
						fontSize: "12px",
						color: job.model === null || job.model === undefined ? "var(--dsw-alias-label-tertiary)" : "var(--dsw-alias-label-secondary)",
						wordBreak: "break-all"
					}
				}, job.model === null || job.model === undefined
					? t("form.modelDefault")
					: `${job.model.provider}/${job.model.model}`),
				el("td", {
					style: {
						padding: "8px 10px",
						verticalAlign: "top",
						fontSize: "12px",
						color: job.autoCatchUp === true ? "var(--dsw-alias-label-secondary)" : "var(--dsw-alias-label-tertiary)"
					},
					title: t("form.autoCatchUpHint")
				}, job.autoCatchUp === true ? t("column.autoOn") : t("column.autoAsk")),
				el("td", { style: { padding: "8px 10px", verticalAlign: "top", color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", wordBreak: "break-all" } },
					job.workspacePath,
					el("div", { style: { marginTop: "2px" } }, job.prompt.length > 120 ? `${job.prompt.slice(0, 120)}…` : job.prompt)),
				el("td", { style: { padding: "8px 10px", verticalAlign: "top" } },
					el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
						button(t("job.run"), run, { compact: true, disabled: busy !== null }),
						button(editing === true ? t("job.editing") : t("job.edit"), () => onEdit?.(job.id), {
							compact: true,
							disabled: busy !== null,
							title: t("job.edit")
						}),
						button(job.enabled === true ? t("job.disable") : t("job.enable"), toggle, { compact: true, disabled: busy !== null }),
						button(t("job.delete"), remove, { compact: true, disabled: busy !== null }))));
		}
		/** The missed-runs banner for one job. */
		function MissedBanner({ job, t, onChanged, onError }) {
			const [busy, setBusy] = react.useState(false);
			if (!Array.isArray(job.missed) || job.missed.length === 0) return null;
			const run = async () => {
				setBusy(true);
				try {
					await callHost("POST", `${JOBS_URL}/${encodeURIComponent(job.id)}/run`);
				} catch (error) {
					onError(error.message);
				} finally {
					setBusy(false);
					await onChanged();
				}
			};
			const dismiss = async () => {
				setBusy(true);
				try {
					await callHost("POST", `${JOBS_URL}?action=dismiss-missed`, { id: job.id });
				} catch (error) {
					onError(error.message);
				} finally {
					setBusy(false);
					await onChanged();
				}
			};
			const times = job.missed.slice(-5).map((at) => formatAt(at, job.timeZone)).filter(Boolean);
			return el("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "10px",
					flexWrap: "wrap",
					padding: "8px 12px",
					marginBottom: "8px",
					borderRadius: "10px",
					border: "1px solid var(--dsw-alias-border-l4)",
					background: "var(--dsw-alias-bg-elevated, transparent)"
				}
			},
				el("div", { style: { minWidth: 0 } },
					el("div", { style: { color: "var(--dsw-alias-label-primary)", fontSize: "13px" } },
						`${job.name}: `, fill(t("missed.title"), { count: formatCount(job.missed.length) })),
					el("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", lineHeight: "16px" } },
						`${t("missed.hint")} ${times.join(", ")}`)),
				el("div", { style: { marginLeft: "auto", display: "flex", gap: "6px" } },
					button(busy ? t("job.running") : t("missed.run"), run, { compact: true, primary: true, disabled: busy }),
					button(t("missed.dismiss"), dismiss, { compact: true, disabled: busy })));
		}
		/** The add form: presets, a cron expression, a folder, and the task. */
		/**
		* The schedule editor, used both to add a job and to change an existing
		* one.
		*
		* When `job` is given the form opens pre-filled and saves with POST to the
		* job's own URL; otherwise it starts from the default preset and creates a
		* new job on the collection URL. Keeping one component means the folder
		* picker, the preset list, and the live next-run preview behave identically
		* on both paths.
		*/
		function JobForm({ t, pickDirectory, workspaces, job, models, defaultModel, restricted, chats, onDone, onCancel, onError }) {
			const editing = job !== undefined && job !== null;
			/**
			 * Chats offered for reuse, narrowed to the chosen folder.
			 *
			 * The list has to follow the folder field, so it is fetched here
			 * rather than once by the panel: a chat belongs to the directory it
			 * was created in, and offering chats from other projects would let a
			 * schedule post into a conversation that has nothing to do with it.
			 */
			const [scopedChats, setScopedChats] = react.useState(null);
			/** `"provider\u0000model"` ↔ `""` for "use the deployment default". */
			const modelKey = (entry) => (entry === undefined || entry === null ? "" : `${entry.provider}\u0000${entry.model}`);
			const [draft, setDraft] = react.useState(() => editing
				? {
					// The stored expression may match a preset exactly; selecting it
					// keeps the dropdown honest instead of always reading "custom".
					preset: (PRESETS.find((entry) => entry.expression === job.expression) ?? { id: "custom" }).id,
					expression: job.expression,
					name: job.name,
					timeZone: job.timeZone,
					workspacePath: job.workspacePath,
					prompt: job.prompt,
					autoCatchUp: job.autoCatchUp === true,
					alwaysNewChat: job.alwaysNewChat === true,
					sessionId: job.sessionId ?? "",
					modelKey: modelKey(job.model)
				}
				: {
					preset: "weekdays9",
					expression: "0 9 * * 1-5",
					name: "",
					timeZone: localZone(),
					workspacePath: "",
					prompt: "",
					// Off by default: a new schedule asks before replaying downtime.
					autoCatchUp: false,
					// Off by default: a repeating schedule reuses the chat it creates.
					alwaysNewChat: false,
					sessionId: "",
					modelKey: ""
				});
			const [busy, setBusy] = react.useState(false);
			const [preview, setPreview] = react.useState(null);
			/**
			 * Whether the folder-scoped chat list is being fetched.
			 *
			 * Set immediately when the folder changes — not when the request is
			 * sent — because the 250 ms debounce plus the round trip is exactly the
			 * pause the spinner exists to explain.
			 */
			const [chatsLoading, setChatsLoading] = react.useState(false);
			const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
			// Keep the reusable-chat list in step with the chosen folder. An empty
			// folder means "no filter yet", so the panel's unfiltered list stands in
			// until a directory is picked.
			react.useEffect(() => {
				const cwd = draft.workspacePath.trim();
				if (cwd === "") {
					setScopedChats(null);
					setChatsLoading(false);
					return undefined;
				}
				let cancelled = false;
				setChatsLoading(true);
				const timer = setTimeout(() => {
					fetch(`${CHATS_URL}?cwd=${encodeURIComponent(cwd)}`, { cache: "no-store" })
						.then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
						.then((payload) => {
							if (!cancelled) setScopedChats(Array.isArray(payload?.chats) ? payload.chats : []);
						})
						.catch(() => {
							// On failure keep the unfiltered list rather than pretending
							// the workspace has no chats at all.
							if (!cancelled) setScopedChats(null);
						})
						.finally(() => {
							if (!cancelled) setChatsLoading(false);
						});
				}, 250);
				return () => {
					cancelled = true;
					clearTimeout(timer);
				};
			}, [draft.workspacePath]);
			// A chat from another folder must not stay selected once the folder
			// changes, or the job would keep posting into the wrong conversation.
			react.useEffect(() => {
				if (scopedChats === null || draft.sessionId === "") return;
				if (scopedChats.some((chat) => chat.sessionId === draft.sessionId)) return;
				setDraft((current) => ({ ...current, sessionId: "" }));
			}, [scopedChats, draft.sessionId]);
			const reusableChats = scopedChats ?? chats ?? [];
			// Preview the next runs whenever the expression settles, so a typo shows
			// up before the schedule is saved.
			react.useEffect(() => {
				const expression = draft.expression.trim();
				if (expression === "") {
					setPreview(null);
					return undefined;
				}
				let cancelled = false;
				const timer = setTimeout(() => {
					fetch(`${JOBS_URL}/preview`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ expression, timeZone: draft.timeZone })
					}).then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
						.then((payload) => {
							if (!cancelled) setPreview(payload);
						})
						.catch(() => {
							if (!cancelled) setPreview(null);
						});
				}, 300);
				return () => {
					cancelled = true;
					clearTimeout(timer);
				};
			}, [draft.expression, draft.timeZone]);
			const browse = async () => {
				try {
					const picked = await pickDirectory();
					if (typeof picked === "string" && picked !== "") set({ workspacePath: picked });
				} catch (error) {
					onError(error?.message ?? String(error));
				}
			};
			const submit = async () => {
				setBusy(true);
				try {
					const body = {
						name: draft.name.trim() === "" ? draft.expression : draft.name.trim(),
						expression: draft.expression.trim(),
						timeZone: draft.timeZone.trim() === "" ? "UTC" : draft.timeZone.trim(),
						workspacePath: draft.workspacePath.trim(),
						prompt: draft.prompt,
						// Sent only from here: the Host refuses this flag from any
						// caller that is not an authenticated browser session, so the
						// panel is the one place it can be turned on.
						autoCatchUp: draft.autoCatchUp === true,
						// The chat policy: when "always new" is on the Host clears any
						// binding; otherwise an explicit id binds that chat, and an
						// empty value lets the first run create and remember one.
						alwaysNewChat: draft.alwaysNewChat === true,
						sessionId: draft.alwaysNewChat === true || draft.sessionId === "" ? null : draft.sessionId,
						// `null` clears a stored choice, so the job follows the
						// deployment default again.
						model: draft.modelKey === "" ? null : (() => {
							const [provider, model] = draft.modelKey.split("\u0000");
							return { provider, model };
						})()
					};
					if (editing) {
						await callHost("POST", `${JOBS_URL}/${encodeURIComponent(job.id)}`, body);
					} else {
						await callHost("POST", JOBS_URL, body);
					}
					await onDone(body.name);
				} catch (error) {
					onError(error.message);
				} finally {
					setBusy(false);
				}
			};
			const next = preview === null || !Array.isArray(preview.upcoming) || preview.upcoming.length === 0
				? null
				: preview.upcoming.map((at) => formatAt(at, draft.timeZone)).join(", ");
			return el("div", {
				style: {
					border: "1px solid var(--dsw-alias-border-l4)",
					borderRadius: "12px",
					padding: "12px 14px",
					display: "flex",
					flexDirection: "column",
					gap: "10px",
					...(editing ? { background: "var(--dsw-alias-bg-elevated, transparent)" } : {})
				}
			},
				el("div", { style: { color: "var(--dsw-alias-label-primary)", fontSize: "13px", fontWeight: 600 } },
					editing ? `${t("job.edit")}: ${job.name}` : t("form.add")),
				el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } },
					label(t("form.preset"), el("select", {
						value: draft.preset,
						style: { ...inputStyle, minWidth: "180px" },
						onChange: (event) => {
							const id = event.target.value;
							const found = PRESETS.find((entry) => entry.id === id);
							set({
								preset: id,
								...(found === undefined || found.expression === "" ? {} : { expression: found.expression })
							});
						}
					}, PRESETS.map((entry) => el("option", { key: entry.id, value: entry.id }, t(`preset.${entry.id}`))))),
					label(t("form.expression"), el("input", {
						value: draft.expression,
						placeholder: "0 9 * * 1-5",
						style: { ...inputStyle, minWidth: "180px", fontFamily: "ui-monospace, monospace" },
						onChange: (event) => set({ expression: event.target.value, preset: "custom" })
					})),
					label(t("form.timeZone"), el("input", {
						value: draft.timeZone,
						placeholder: "Europe/Moscow",
						style: { ...inputStyle, minWidth: "150px" },
						onChange: (event) => set({ timeZone: event.target.value })
					})),
					// Model picker: the allowed list when a person configured one in
					// Settings, otherwise every model this deployment routes.
					label(t("form.model"), el("select", {
						value: draft.modelKey,
						style: { ...inputStyle, minWidth: "220px" },
						title: restricted ? t("form.modelRestricted") : undefined,
						onChange: (event) => set({ modelKey: event.target.value })
					},
						el("option", { value: "" }, defaultModel === null || defaultModel === undefined
							? t("form.modelDefault")
							: `${t("form.modelDefault")} — ${defaultModel.model}`),
						(models ?? []).map((entry) => el("option", {
							key: `${entry.provider}\u0000${entry.model}`,
							value: `${entry.provider}\u0000${entry.model}`
						}, `${entry.name} — ${entry.provider}/${entry.model}`)))),
					label(t("form.name"), el("input", {
						value: draft.name,
						placeholder: t("form.namePlaceholder"),
						style: { ...inputStyle, minWidth: "160px" },
						onChange: (event) => set({ name: event.target.value })
					}))),
				next === null
					? null
					: el("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" } },
						fill(t("form.preview"), { list: next })),
				el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" } },
					// Bound to the current directory so the control shows what is
					// selected instead of snapping back to the placeholder. A path
					// typed by hand simply has no matching option, which reads as
					// the placeholder while the text field below keeps the value.
					// The option label is the workspace name only: the full path is
					// already visible in the field below, so repeating it here only
					// widens the control and truncates the list.
					label(t("form.pickExisting"), el("select", {
						value: (workspaces ?? []).some((workspace) => workspace.path === draft.workspacePath) ? draft.workspacePath : "",
						style: { ...inputStyle, minWidth: "220px" },
						onChange: (event) => {
							if (event.target.value !== "") set({ workspacePath: event.target.value });
						}
					},
						el("option", { value: "" }, t("form.pickExistingPlaceholder")),
						(workspaces ?? []).map((workspace) => el("option", {
							key: workspace.id ?? workspace.path,
							value: workspace.path
						}, typeof workspace.title === "string" && workspace.title !== "" ? workspace.title : workspace.path)))),
					el("div", { style: { flex: 1, minWidth: "240px" } },
						label(t("form.workspace"), el("div", { style: { display: "flex", gap: "6px" } },
							el("input", {
								value: draft.workspacePath,
								placeholder: t("form.workspacePlaceholder"),
								style: { ...inputStyle, flex: 1 },
								onChange: (event) => set({ workspacePath: event.target.value })
							}),
							button(t("form.browse"), browse, { compact: true }))))),
				label(t("form.prompt"), el("textarea", {
					value: draft.prompt,
					placeholder: t("form.promptPlaceholder"),
					rows: 3,
					style: { ...inputStyle, resize: "vertical", fontFamily: "inherit" },
					onChange: (event) => set({ prompt: event.target.value })
				})),
				// Chat policy: reuse one chat across runs, or start fresh each time.
				el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" } },
					// The label carries the spinner: switching folders refetches this
					// list, and without a cue the dropdown just looks empty.
					el("label", { style: { display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 } },
						el("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: "6px",
								color: "var(--dsw-alias-label-tertiary)",
								fontSize: "12px",
								lineHeight: "16px"
							}
						},
							el("span", null, t("form.chatPick")),
							chatsLoading ? el(Spinner, { size: 12, label: t("form.chatLoading") }) : null,
							chatsLoading
								? el("span", { style: { color: "var(--dsw-alias-label-tertiary)" } }, t("form.chatLoading"))
								: null),
						el("select", {
							value: draft.sessionId,
							disabled: draft.alwaysNewChat === true,
							style: { ...inputStyle, minWidth: "280px", opacity: draft.alwaysNewChat === true ? 0.5 : 1 },
							title: draft.alwaysNewChat === true ? t("form.chatIgnored") : undefined,
							onChange: (event) => set({ sessionId: event.target.value })
						},
							el("option", { value: "" }, draft.sessionId === "" ? t("form.chatNew") : t("form.chatPickPlaceholder")),
							// Keep a bound chat selectable even if it fell out of the list.
							...(draft.sessionId === "" || reusableChats.some((chat) => chat.sessionId === draft.sessionId)
								? []
								: [el("option", { key: draft.sessionId, value: draft.sessionId }, fill(t("form.chatBound"), { id: draft.sessionId }))]),
							reusableChats.map((chat) => el("option", {
								key: chat.sessionId,
								value: chat.sessionId
							}, `${chat.title} — ${chat.sessionId}`))))),
				el("label", {
					style: { display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" },
					title: t("form.alwaysNewChatHint")
				},
					el("input", {
						type: "checkbox",
						checked: draft.alwaysNewChat === true,
						style: { marginTop: "2px", flex: "none", accentColor: "var(--dsw-alias-interactive-bg-primary)" },
						onChange: (event) => set({ alwaysNewChat: event.target.checked })
					}),
					el("span", { style: { minWidth: 0 } },
						el("span", { style: { display: "block", color: "var(--dsw-alias-label-secondary)", fontSize: "13px", lineHeight: "20px" } },
							t("form.alwaysNewChat")),
						el("span", { style: { display: "block", color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", lineHeight: "16px" } },
							t("form.alwaysNewChatHint")))),
				// Human-only switch: the Host rejects this flag from any caller
				// without an authenticated browser session, so it cannot be set by
				// the AI, a script, or a curl.
				el("label", {
					style: { display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" },
					title: t("form.autoCatchUpHint")
				},
					el("input", {
						type: "checkbox",
						checked: draft.autoCatchUp === true,
						style: { marginTop: "2px", flex: "none", accentColor: "var(--dsw-alias-interactive-bg-primary)" },
						onChange: (event) => set({ autoCatchUp: event.target.checked })
					}),
					el("span", { style: { minWidth: 0 } },
						el("span", { style: { display: "block", color: "var(--dsw-alias-label-secondary)", fontSize: "13px", lineHeight: "20px" } },
							t("form.autoCatchUp")),
						el("span", { style: { display: "block", color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", lineHeight: "16px" } },
							t("form.autoCatchUpHint")))),
				el("div", { style: { display: "flex", gap: "8px" } },
					button(busy
						? (editing ? t("form.saving") : t("form.adding"))
						: (editing ? t("form.save") : t("form.add")), submit, {
						primary: true,
						disabled: busy || draft.workspacePath.trim() === "" || draft.prompt.trim() === "" || draft.expression.trim() === ""
					}),
					editing ? button(t("form.cancel"), () => onCancel?.(), { disabled: busy }) : null));
		}
		/** The panel body: missed banners, the table, and the add form. */
		function CronPanel({ useWorkspaces, t, pickDirectory }) {
			const [state, setState] = react.useState({ jobs: [], loading: true, error: null });
			/** The model allow-list plus the routable catalog, from the host. */
			const [settings, setSettings] = react.useState({ allowedModels: [], models: [], default: null, loaded: false });
			/** The chats a job may be bound to, for the form's dropdown. */
			const [chats, setChats] = react.useState([]);
			const [notice, setNotice] = useNotice();
			/** Id of the job whose editor is open, or null when none is. */
			const [editingId, setEditingId] = react.useState(null);
			const workspaces = useWorkspaces((snapshot) => snapshot.items) ?? [];
			const load = react.useCallback(async () => {
				try {
					const payload = await callHost("GET", JOBS_URL);
					setState({ jobs: Array.isArray(payload?.jobs) ? payload.jobs : [], loading: false, error: null });
				} catch (error) {
					setState((current) => ({ ...current, loading: false, error: error.message }));
				}
			}, []);
			const loadChats = react.useCallback(async () => {
				try {
					const payload = await callHost("GET", CHATS_URL);
					setChats(Array.isArray(payload?.chats) ? payload.chats : []);
				} catch {
					// Without the list the picker still offers "create one for me".
					setChats([]);
				}
			}, []);
			const loadSettings = react.useCallback(async () => {
				try {
					const payload = await callHost("GET", SETTINGS_URL);
					setSettings({
						allowedModels: Array.isArray(payload?.allowedModels) ? payload.allowedModels : [],
						models: Array.isArray(payload?.models) ? payload.models : [],
						default: payload?.default ?? null,
						loaded: true
					});
				} catch {
					// The panel still works without the catalog: the model picker
					// simply offers only the deployment default.
					setSettings({ allowedModels: [], models: [], default: null, loaded: true });
				}
			}, []);
			react.useEffect(() => {
				void load();
				void loadSettings();
				void loadChats();
				const timer = setInterval(() => {
					void load();
					void loadSettings();
					void loadChats();
				}, REFRESH_MS);
				return () => clearInterval(timer);
			}, [load, loadSettings, loadChats]);
			// The job form offers exactly what the person allowed; an empty
			// allow-list means "no restriction", so the whole catalog is offered.
			const restricted = settings.allowedModels.length > 0;
			const modelChoices = restricted
				? settings.models.filter((entry) => settings.allowedModels.some((allowed) => allowed.provider === entry.provider && allowed.model === entry.model))
				: settings.models;
			const missed = state.jobs.filter((job) => Array.isArray(job.missed) && job.missed.length > 0);
			const workspaceOptions = workspaces.map((workspace) => ({
				id: workspace.workspaceId ?? workspace.id ?? workspace.path,
				path: workspace.path,
				title: workspace.title
			}));
			// A deleted job must not leave a dangling editor open.
			const editing = editingId === null ? undefined : state.jobs.find((job) => job.id === editingId);
			react.useEffect(() => {
				if (editingId !== null && !state.loading && editing === undefined) setEditingId(null);
			}, [editingId, editing, state.loading]);
			return el("div", { style: { height: "100%", overflow: "auto", padding: "16px 20px" } },
				el("div", { style: { display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "4px" } },
					el("h2", { style: { margin: 0, fontSize: "16px", lineHeight: "24px", color: "var(--dsw-alias-label-primary)" } }, t("panel.title")),
					button(t("panel.refresh"), () => void load(), { compact: true })),
				el("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "18px", marginBottom: "12px" } }, t("panel.subtitle")),
				notice === null ? null : el("div", {
					style: {
						padding: "8px 12px",
						marginBottom: "10px",
						borderRadius: "10px",
						border: "1px solid var(--dsw-alias-border-l4)",
						color: "var(--dsw-alias-state-error-primary)",
						fontSize: "13px"
					}
				}, notice),
				state.error !== null
					? el("div", { style: { color: "var(--dsw-alias-state-error-primary)", padding: "12px 0" } }, fill(t("panel.error"), { message: state.error }))
					: state.loading
						? el("div", { style: { color: "var(--dsw-alias-label-tertiary)", padding: "12px 0" } }, t("panel.loading"))
						: el("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
							missed.length === 0 ? null : el("div", null, missed.map((job) => el(MissedBanner, {
								key: `missed-${job.id}`,
								job,
								t,
								onChanged: load,
								onError: setNotice
							}))),
							state.jobs.length === 0
								? el("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "13px" } }, t("panel.empty"))
								: el("div", { style: { border: "1px solid var(--dsw-alias-border-l4)", borderRadius: "12px", overflow: "hidden" } },
									el("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" } },
										el("thead", null, el("tr", { style: { background: "var(--dsw-alias-bg-elevated, transparent)" } },
											[t("column.name"), t("column.when"), t("column.next"), t("column.chat"), t("column.model"), t("column.auto"), t("column.workspace"), t("column.actions")].map((heading) => el("th", {
												key: heading,
												style: {
													textAlign: "left",
													padding: "8px 10px",
													color: "var(--dsw-alias-label-tertiary)",
													fontWeight: 500,
													fontSize: "12px"
												}
											}, heading)))),
										el("tbody", null, state.jobs.flatMap((job) => {
											const row = el(JobRow, {
												key: job.id,
												job,
												t,
												chats,
												editing: job.id === editingId,
												onEdit: (id) => setEditingId((current) => (current === id ? null : id)),
												onChanged: load,
												onError: setNotice
											});
											if (job.id !== editingId) return [row];
											// The editor renders in place, directly under its own row.
											return [row, el("tr", { key: `${job.id}-editor` },
												el("td", { colSpan: 8, style: { padding: "0 10px 12px" } },
													el(JobForm, {
														t,
														pickDirectory,
														workspaces: workspaceOptions,
														models: modelChoices,
														defaultModel: settings.default,
														restricted,
														chats,
														job,
														onDone: async (name) => {
															setEditingId(null);
															await load();
															setNotice(fill(t("job.updated"), { name }));
														},
														onCancel: () => setEditingId(null),
														onError: setNotice
													})))];
										})))),
							el(JobForm, {
								t,
								pickDirectory,
								workspaces: workspaceOptions,
								models: modelChoices,
								defaultModel: settings.default,
								restricted,
								chats,
								onDone: async () => {
									await load();
									setNotice(null);
								},
								onError: setNotice
							})));
		}
		/** Sidebar glyph: a small clock, drawn inline so no icon package is needed. */
		function CronGlyph({ size }) {
			const dimension = typeof size === "number" ? size : 16;
			return el("svg", {
				width: dimension,
				height: dimension,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				style: { display: "block" }
			},
				el("circle", { cx: "8", cy: "8", r: "6.25", stroke: "currentColor", strokeWidth: "1.5" }),
				el("path", { d: "M8 4.75V8l2.5 1.6", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }));
		}
		/**
		* The Settings row: the list of models the AI may schedule on.
		*
		* An empty list means "no restriction" — the AI may pick any model this
		* deployment routes. Once the person adds entries, both the panel's picker
		* and `cron_create` are limited to them, so the list is the policy that
		* bounds what the AI can schedule. Writing it is refused by the Host for
		* anything but an authenticated browser session.
		*/
		function ModelAllowListRow({ t }) {
			const [state, setState] = react.useState({ allowedModels: [], models: [], loading: true, saving: false });
			const [notice, setNotice] = useNotice();
			/** A copy of the allow-list that edits mutate locally before saving. */
			const [draft, setDraft] = react.useState(null);
			/** `"provider\u0000model"` of the catalog entry picked in the dropdown. */
			const [picker, setPicker] = react.useState("");
			const load = react.useCallback(async () => {
				try {
					const payload = await callHost("GET", SETTINGS_URL);
					const allowed = Array.isArray(payload?.allowedModels) ? payload.allowedModels : [];
					setState({
						allowedModels: allowed,
						models: Array.isArray(payload?.models) ? payload.models : [],
						loading: false,
						saving: false
					});
					setDraft(allowed.map((entry) => ({ ...entry })));
				} catch (error) {
					setState((current) => ({ ...current, loading: false }));
					setNotice(error.message);
				}
			}, []);
			react.useEffect(() => {
				void load();
			}, [load]);
			const rows = draft ?? state.allowedModels;
			const keyOf = (entry) => `${entry.provider}\u0000${entry.model}`;
			const present = new Set(rows.map(keyOf));
			const add = (key) => {
				if (key === "") return;
				const [provider, model] = key.split("\u0000");
				if (present.has(key)) return;
				setDraft([...rows, { provider, model }]);
				setPicker("");
			};
			const remove = (key) => setDraft(rows.filter((entry) => keyOf(entry) !== key));
			const save = async () => {
				setState((current) => ({ ...current, saving: true }));
				try {
					await callHost("POST", SETTINGS_URL, { allowedModels: rows });
					await load();
					setNotice(null);
				} catch (error) {
					setState((current) => ({ ...current, saving: false }));
					setNotice(error.message);
				}
			};
			const dirty = JSON.stringify(rows) !== JSON.stringify(state.allowedModels);
			const nameOf = (entry) => state.models.find((model) => keyOf(model) === keyOf(entry))?.name ?? entry.model;
			return el("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
				el("div", { style: { color: "var(--dsw-alias-label-primary)", fontSize: "13px", lineHeight: "20px" } }, t("settings.allowedModels")),
				el("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "11px", lineHeight: "16px" } }, t("settings.allowedModelsHint")),
				notice === null ? null : el("div", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: "12px" } }, notice),
				state.loading
					? el("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" } }, t("panel.loading"))
					: el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
						rows.length === 0
							? el("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" } }, t("settings.allowedModelsEmpty"))
							: el("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
								rows.map((entry) => el("div", {
									key: keyOf(entry),
									style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }
								},
									el("span", { style: { color: "var(--dsw-alias-label-secondary)", wordBreak: "break-all" } },
										`${nameOf(entry)} — ${entry.provider}/${entry.model}`),
									el("span", { style: { marginLeft: "auto" } },
										button(t("settings.remove"), () => remove(keyOf(entry)), { compact: true }))))),
						el("div", { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } },
							el("select", {
								value: picker,
								style: { ...inputStyle, maxWidth: "360px" },
								onChange: (event) => setPicker(event.target.value)
							},
								el("option", { value: "" }, t("settings.addModelPlaceholder")),
								state.models
									.filter((entry) => !present.has(keyOf(entry)))
									.map((entry) => el("option", { key: keyOf(entry), value: keyOf(entry) },
										`${entry.name} — ${entry.provider}/${entry.model}`))),
							button(t("settings.addModel"), () => add(picker), { compact: true, disabled: picker === "" }),
							button(state.saving ? t("form.saving") : t("settings.save"), save, { compact: true, primary: true, disabled: state.saving || !dirty }))));
		}
		/**
		* Client plugin body: the sidebar row carrying the clock glyph and the main
		* panel with the schedule table.
		* @param ctx - client root context carrying slots, locale, and uiWorkspace.
		*/
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "cron-schedule: dictionaries");
			// The same id links the sidebar row to the main panel: the sidebar passes
			// this id to layout.selectPanel().
			ctx.effect(() => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 70,
				label: () => t("panel.title")
			}, CronGlyph)), "cron-schedule: panel icon");
			ctx.effect(() => ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: NS,
				inject: () => ({ pickDirectory: () => ctx.uiWorkspace.pickDirectory() })
			}, CronPanel)), "cron-schedule: panel body");
			// The model allow-list lives on the General settings page, next to the
			// other deployment-wide choices.
			ctx.effect(() => ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "cron-schedule-models",
				order: 60,
				locale: NS
			}, ModelAllowListRow)), "cron-schedule: settings row");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
