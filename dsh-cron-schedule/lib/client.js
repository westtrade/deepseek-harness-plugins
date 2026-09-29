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
		/** Poll interval while the panel is open. */
		const REFRESH_MS = 20000;
		const en = {
			"panel.title": "AI schedules",
			"panel.subtitle": "At each due time a new chat starts in the chosen folder and receives the task",
			"panel.loading": "Loading…",
			"panel.error": "Schedule service unavailable: {message}",
			"panel.empty": "No schedules yet. Add one below.",
			"panel.refresh": "Refresh",
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
			"form.preview": "Next runs: {list}",
			"form.invalid": "Check the form: {message}",
			"column.name": "Name",
			"column.when": "When",
			"column.next": "Next run",
			"column.workspace": "Folder",
			"column.actions": "Actions",
			"job.never": "never",
			"job.run": "Run now",
			"job.running": "Starting…",
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
			"form.preview": "接下来：{list}",
			"form.invalid": "请检查表单：{message}",
			"column.name": "名称",
			"column.when": "时间",
			"column.next": "下次运行",
			"column.workspace": "目录",
			"column.actions": "操作",
			"job.never": "永不",
			"job.run": "立即运行",
			"job.running": "启动中…",
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
		function JobRow({ job, t, onChanged, onError }) {
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
				el("td", { style: { padding: "8px 10px", verticalAlign: "top", color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", wordBreak: "break-all" } },
					job.workspacePath,
					el("div", { style: { marginTop: "2px" } }, job.prompt.length > 120 ? `${job.prompt.slice(0, 120)}…` : job.prompt)),
				el("td", { style: { padding: "8px 10px", verticalAlign: "top" } },
					el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
						button(busy === "run" ? t("job.running") : t("job.run"), run, { compact: true, disabled: busy !== null }),
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
		function AddForm({ t, pickDirectory, workspaces, onAdded, onError }) {
			const [draft, setDraft] = react.useState(() => ({
				preset: "weekdays9",
				expression: "0 9 * * 1-5",
				name: "",
				timeZone: localZone(),
				workspacePath: "",
				prompt: ""
			}));
			const [busy, setBusy] = react.useState(false);
			const [preview, setPreview] = react.useState(null);
			const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
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
						prompt: draft.prompt
					};
					await callHost("POST", JOBS_URL, body);
					setDraft((current) => ({ ...current, name: "", prompt: "" }));
					await onAdded();
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
					gap: "10px"
				}
			},
				el("div", { style: { color: "var(--dsw-alias-label-primary)", fontSize: "13px", fontWeight: 600 } }, t("form.add")),
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
					label(t("form.pickExisting"), el("select", {
						value: "",
						style: { ...inputStyle, minWidth: "220px" },
						onChange: (event) => {
							if (event.target.value !== "") set({ workspacePath: event.target.value });
						}
					},
						el("option", { value: "" }, t("form.pickExistingPlaceholder")),
						(workspaces ?? []).map((workspace) => el("option", {
							key: workspace.id ?? workspace.path,
							value: workspace.path
						}, workspace.title === undefined || workspace.title === "" ? workspace.path : `${workspace.title} — ${workspace.path}`)))),
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
				el("div", null, button(busy ? t("form.adding") : t("form.add"), submit, {
					primary: true,
					disabled: busy || draft.workspacePath.trim() === "" || draft.prompt.trim() === "" || draft.expression.trim() === ""
				})));
		}
		/** The panel body: missed banners, the table, and the add form. */
		function CronPanel({ useWorkspaces, t, pickDirectory }) {
			const [state, setState] = react.useState({ jobs: [], loading: true, error: null });
			const [notice, setNotice] = useNotice();
			const workspaces = useWorkspaces((snapshot) => snapshot.items) ?? [];
			const load = react.useCallback(async () => {
				try {
					const payload = await callHost("GET", JOBS_URL);
					setState({ jobs: Array.isArray(payload?.jobs) ? payload.jobs : [], loading: false, error: null });
				} catch (error) {
					setState((current) => ({ ...current, loading: false, error: error.message }));
				}
			}, []);
			react.useEffect(() => {
				void load();
				const timer = setInterval(() => void load(), REFRESH_MS);
				return () => clearInterval(timer);
			}, [load]);
			const missed = state.jobs.filter((job) => Array.isArray(job.missed) && job.missed.length > 0);
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
											[t("column.name"), t("column.when"), t("column.next"), t("column.workspace"), t("column.actions")].map((heading) => el("th", {
												key: heading,
												style: {
													textAlign: "left",
													padding: "8px 10px",
													color: "var(--dsw-alias-label-tertiary)",
													fontWeight: 500,
													fontSize: "12px"
												}
											}, heading)))),
										el("tbody", null, state.jobs.map((job) => el(JobRow, {
											key: job.id,
											job,
											t,
											onChanged: load,
											onError: setNotice
										}))))),
							el(AddForm, {
								t,
								pickDirectory,
								workspaces: workspaces.map((workspace) => ({
									id: workspace.workspaceId ?? workspace.id ?? workspace.path,
									path: workspace.path,
									title: workspace.title
								})),
								onAdded: async () => {
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
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
