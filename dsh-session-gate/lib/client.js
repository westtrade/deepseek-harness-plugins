window.__ModuleLoader__.load({
	id: "dsh-session-gate",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		// The dialog is built from the shell's own primitives, so the access
		// control is the same widget language as the shipped "Workspace Write"
		// control rather than a lookalike. These are platform seed modules: they
		// resolve through the loader's require without a package dependency.
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/index.js
		/** This package's copy namespace. */
		const NS = "sessionGate";
		/** Browser services: the slot registry and copy. */
		const inject = ["slots", "locale"];
		/** Host route answering and changing one chat's access choices. */
		const STATE_URL = "/api/session-gate/state";
		/**
		 * Class hook names for the composer trigger.
		 *
		 * Mirrors the shape of the shipped control: a pill-shaped button carrying a
		 * label and an icon. Attribute-free classes are safe here because every
		 * rule is scoped under our own style tag.
		 */
		const TRIGGER_CLASS = {
			trigger: "dshsg_trigger",
			triggerLabel: "dshsg_triggerLabel",
			icon: "dshsg_icon"
		};
		/**
		 * Composer trigger CSS, copied from the shipped `PermissionSelect` styles so
		 * the two controls sit in the tool row with identical metrics (28px tall,
		 * 13px/500 label, 24px radius, same hover behaviour).
		 */
		const TRIGGER_CSS = ".dshsg_trigger{min-width:0;max-width:220px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex}.dshsg_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dshsg_trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.dshsg_trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.dshsg_triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.dshsg_icon{color:var(--dsw-alias-label-caption);flex:none;display:inline-flex}";
		/** Style-tag identity, mirroring the loader's `data-plugin-css` convention. */
		const STYLE_TAG = "dsh-session-gate/composer.css";
		/** Inject the composer stylesheet once per document. */
		function ensureComposerStyle() {
			if (typeof document === "undefined") return;
			const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG)}]`;
			if (document.querySelector(selector) !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-gate";
			tag.dataset.pluginCss = STYLE_TAG;
			tag.textContent = TRIGGER_CSS;
			document.head.appendChild(tag);
		}
		const en = {
			"trigger.label": "Access",
			"trigger.title": "MCP servers and photo reading in this chat",
			"trigger.aria": "Chat tool access",
			"modal.title": "Chat access",
			"modal.description": "What the model may use in this chat. Changes apply at once and are kept.",
			"modal.close": "Close",
			"mcp.title": "MCP servers",
			"mcp.empty": "No MCP servers are connected in this deployment.",
			"mcp.hint": "Checked servers are available to the model in this chat; everything starts unchecked.",
			"mcp.tools": "{count} tool(s)",
			"tools.title": "Tools",
			"tools.hint": "Checked groups are available to the model in this chat. read_image has its own switch below.",
			"group.files": "Files and code",
			"group.plan": "Planning",
			"group.agents": "Subagents",
			"group.jobs": "Background jobs",
			"group.flow": "Orchestration",
			"group.cron": "Schedules (cron)",
			"group.mesh": "Moleculer mesh",
			"group.rooms": "Team rooms",
			"group.board": "Whiteboard",
			"group.web": "Web",
			"group.misc": "Misc",
			"group.other": "Other tools",
			"photos.title": "The model may read images",
			"photos.hint": "Allows the read_image tool: PNG, JPEG, WebP and GIF files. Off by default.",
			"photos.capable": "Model {model} accepts image input.",
			"photos.incapable": "Model {model} does not accept image input, so photos cannot be read in this chat.",
			"photos.unknown": "Whether the model accepts images could not be determined.",
			"cost.tokens": "~{tokens} t",
			"cost.withPercent": "~{tokens} t · {percent}% ctx",
			"cost.total": "Enabled now: ~{tokens} t · {percent}% of context",
			"cost.totalNoContext": "Enabled now: ~{tokens} t",
			"error.load": "Could not load the access state: {message}",
			"error.save": "Could not save: {message}"
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
			"trigger.label": "Доступ",
			"trigger.title": "MCP-серверы и чтение фото в этом чате",
			"trigger.aria": "Доступ к инструментам в чате",
			"modal.title": "Доступ в этом чате",
			"modal.description": "Что модель может использовать в этом чате. Изменения действуют сразу и сохраняются.",
			"modal.close": "Закрыть",
			"mcp.title": "MCP-серверы",
			"mcp.empty": "В этом профиле нет подключённых MCP-серверов.",
			"mcp.hint": "Отмеченные серверы доступны модели в этом чате; по умолчанию не отмечено ничего.",
			"mcp.tools": "инструментов: {count}",
			"tools.title": "Инструменты",
			"tools.hint": "Отмеченные группы доступны модели в этом чате. read_image управляется отдельным переключателем ниже.",
			"group.files": "Файлы и код",
			"group.plan": "Планирование",
			"group.agents": "Субагенты",
			"group.jobs": "Фоновые задачи",
			"group.flow": "Оркестрация",
			"group.cron": "Расписания (cron)",
			"group.mesh": "Сеть Moleculer",
			"group.rooms": "Комнаты",
			"group.board": "Доска",
			"group.web": "Веб",
			"group.misc": "Прочее",
			"group.other": "Другие инструменты",
			"photos.title": "Агент может читать фотографии",
			"photos.hint": "Разрешает инструмент read_image: файлы PNG, JPEG, WebP и GIF. По умолчанию выключено.",
			"photos.capable": "Модель {model} принимает изображения.",
			"photos.incapable": "Модель {model} не принимает изображения — прочитать фото в этом чате не получится.",
			"photos.unknown": "Не удалось определить, принимает ли модель изображения.",
			"cost.tokens": "≈{tokens} т",
			"cost.withPercent": "≈{tokens} т · {percent}% контекста",
			"cost.total": "Сейчас включено: ≈{tokens} т · {percent}% контекста",
			"cost.totalNoContext": "Сейчас включено: ≈{tokens} т",
			"error.load": "Не удалось загрузить состояние доступа: {message}",
			"error.save": "Не удалось сохранить: {message}"
		};
		const zh = {
			"trigger.label": "访问",
			"trigger.title": "本会话的 MCP 服务器与图片读取",
			"trigger.aria": "本会话的工具访问",
			"modal.title": "本会话的访问权限",
			"modal.description": "模型在本会话中可以使用什么。修改立即生效并会保存。",
			"modal.close": "关闭",
			"mcp.title": "MCP 服务器",
			"mcp.empty": "此部署中没有已连接的 MCP 服务器。",
			"mcp.hint": "勾选的服务器在本会话中对模型可用；默认全部未勾选。",
			"mcp.tools": "{count} 个工具",
			"tools.title": "工具",
			"tools.hint": "勾选的工具组在本会话中对模型可用。read_image 由下方独立开关控制。",
			"group.files": "文件与代码",
			"group.plan": "规划",
			"group.agents": "子代理",
			"group.jobs": "后台任务",
			"group.flow": "编排",
			"group.cron": "定时任务 (cron)",
			"group.mesh": "Moleculer 网格",
			"group.rooms": "团队房间",
			"group.board": "白板",
			"group.web": "网络",
			"group.misc": "其他",
			"group.other": "其他工具",
			"photos.title": "模型可以读取图片",
			"photos.hint": "启用 read_image 工具：PNG、JPEG、WebP 和 GIF 文件。默认关闭。",
			"photos.capable": "模型 {model} 接受图片输入。",
			"photos.incapable": "模型 {model} 不接受图片输入，因此本会话无法读取图片。",
			"photos.unknown": "无法确定模型是否接受图片。",
			"cost.tokens": "约 {tokens} 词元",
			"cost.withPercent": "约 {tokens} 词元 · 占上下文 {percent}%",
			"cost.total": "当前已启用：约 {tokens} 词元 · 占上下文 {percent}%",
			"cost.totalNoContext": "当前已启用：约 {tokens} 词元",
			"error.load": "无法加载访问状态：{message}",
			"error.save": "无法保存：{message}"
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
		/** Localized label for one tool group, falling back to its id. */
		function groupLabel(t, id) {
			const key = `group.${id}`;
			const label = t(key);
			return label === undefined || label === "" || label === key ? id : label;
		}
		/** Compact token count: 940, 3.4k, 12.1k. */
		function compactTokens(value) {
			if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "0";
			return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
		}
		/** One decimal of a percentage, with a floor for "there is some cost". */
		function percentText(value) {
			if (typeof value !== "number" || !Number.isFinite(value)) return null;
			if (value > 0 && value < 0.05) return "<0.1";
			return value >= 10 ? value.toFixed(0) : value.toFixed(1);
		}
		/** The price of one row's schemas, or null when the Host could not price it. */
		function costText(t, entry) {
			if (entry === undefined || entry === null || typeof entry.tokens !== "number") return null;
			const percent = percentText(entry.percent);
			return percent === null
				? fill(t("cost.tokens"), { tokens: compactTokens(entry.tokens) })
				: fill(t("cost.withPercent"), { tokens: compactTokens(entry.tokens), percent });
		}
		/** Right-hand column of a row: tool count and its schema price. */
		function rowMeta(t, entry) {
			const price = costText(t, entry);
			return el("span", {
				style: {
					marginLeft: "auto",
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-end",
					whiteSpace: "nowrap",
					lineHeight: "15px"
				}
			},
				el("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, inherit)" } }, fill(t("mcp.tools"), { count: entry.tools })),
				price === null ? null : el("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-caption, inherit)" } }, price));
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
		/** Section heading in the dialog. */
		function sectionHeading(text) {
			return el("div", { style: { fontSize: "12px", fontWeight: 600, color: "var(--dsw-alias-label-secondary, inherit)" } }, text);
		}
		/** One muted explainer line. */
		function hint(text) {
			return el("div", { style: { fontSize: "11.5px", lineHeight: "16px", color: "var(--dsw-alias-label-tertiary, inherit)" } }, text);
		}
		/** One MCP server row: a real checkbox, the name, and its tool count. */
		function ServerRow({ server, busy, t, onToggle }) {
			return el("label", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "8px",
					padding: "5px 0",
					cursor: busy ? "default" : "pointer"
				}
			},
				el("input", {
					type: "checkbox",
					checked: server.enabled === true,
					disabled: busy,
					onChange: () => onToggle(server.name),
					style: { accentColor: "var(--dsw-alias-interactive-bg-primary, #3a6df0)", margin: 0 }
				}),
				el("span", {
					style: {
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
						fontSize: "13px",
						color: "var(--dsw-alias-label-primary, inherit)"
					}
				}, server.name),
				rowMeta(t, server));
		}
		/**
		 * The access dialog: one checkbox per MCP server and one switch for image
		 * reading. Every change is written immediately, so there is no Save button
		 * to forget; a failure reloads the Host state rather than leaving the
		 * checkboxes lying about what the chat actually does.
		 */
		function AccessDialog({ open, t, state, busy, error, onClose, onToggleServer, onToggleGroup, onTogglePhotos }) {
			const servers = state?.servers ?? [];
			const photos = state?.photos;
			const capable = photos?.capable;
			const photoHint = photos === undefined
				? ""
				: capable === true
					? fill(t("photos.capable"), { model: photos.model })
					: capable === false
						? fill(t("photos.incapable"), { model: photos.model })
						: t("photos.unknown");
			const serverRows = servers.length === 0
				? [hint(t("mcp.empty"))]
				: servers.map((server) => el(ServerRow, {
					key: server.name,
					server,
					busy,
					t,
					onToggle: onToggleServer
				}));
			const groups = state?.groups ?? [];
			const rows = groups.map((group) => el("label", {
				key: group.id,
				title: Array.isArray(group.names) ? group.names.join(", ") : undefined,
				style: {
					display: "flex",
					alignItems: "center",
					gap: "8px",
					padding: "5px 0",
					cursor: busy ? "default" : "pointer"
				}
			},
				el("input", {
					type: "checkbox",
					checked: group.enabled === true,
					disabled: busy,
					onChange: () => onToggleGroup(group.id),
					style: { accentColor: "var(--dsw-alias-interactive-bg-primary, #3a6df0)", margin: 0 }
				}),
				el("span", { style: { fontSize: "13px", color: "var(--dsw-alias-label-primary, inherit)" } }, groupLabel(t, group.id)),
				rowMeta(t, group)));
			return el(primitives.Modal, {
				open,
				title: t("modal.title"),
				description: t("modal.description"),
				closeLabel: t("modal.close"),
				onClose,
				footer: el(primitives.Button, { variant: "primary", onClick: onClose }, t("modal.close")),
				children: el("div", { style: { display: "flex", flexDirection: "column", gap: "16px", maxHeight: "58vh", overflowY: "auto" } },
					el("section", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
						sectionHeading(t("mcp.title")),
						...serverRows,
						hint(t("mcp.hint"))),
					el("section", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
						sectionHeading(t("tools.title")),
						...rows,
						hint(t("tools.hint"))),
					el("section", { style: { display: "flex", alignItems: "flex-start", gap: "12px" } },
						el("div", { style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" } },
							sectionHeading(t("photos.title")),
							hint(t("photos.hint")),
							photos === undefined ? null : hint(photoHint),
							photos === undefined || costText(t, photos) === null ? null : hint(costText(t, photos))),
						el(primitives.Switch, {
							checked: photos?.allowed === true,
							disabled: busy || photos === undefined,
							label: t("photos.title"),
							onChange: () => onTogglePhotos()
						})),
					state === null || state.cost === undefined
						? null
						: el("div", {
							style: {
								borderTop: "1px solid var(--dsw-alias-border-l2, #e1e3e5)",
								paddingTop: "8px",
								fontSize: "11.5px",
								color: "var(--dsw-alias-label-secondary, inherit)"
							}
						}, percentText(state.cost.percent) === null
							? fill(t("cost.totalNoContext"), { tokens: compactTokens(state.cost.tokens) })
							: fill(t("cost.total"), { tokens: compactTokens(state.cost.tokens), percent: percentText(state.cost.percent) })),
					error === null || error === undefined
						? null
						: el("div", {
							style: { fontSize: "12.5px", color: "var(--dsw-alias-state-error-primary, #c0392b)" }
						}, error))});
		}
		/**
		 * The composer control: a button beside «Workspace Write» that opens the
		 * access dialog.
		 *
		 * The state comes from the Host (the plugin's own store), so it follows a
		 * change made in another tab on the next open. The dialog is rendered from
		 * the same component, which is why the button is useful both on a fresh chat
		 * (the session already exists, it just has no messages) and mid-conversation.
		 */
		function AccessButton({ sessionId, t }) {
			const [state, setState] = react.useState(null);
			const [open, setOpen] = react.useState(false);
			const [busy, setBusy] = react.useState(false);
			const [error, setError] = react.useState(null);
			const load = react.useCallback(async () => {
				if (typeof sessionId !== "string" || sessionId === "") return;
				try {
					const payload = await callHost("GET", `${STATE_URL}?sessionId=${encodeURIComponent(sessionId)}`);
					setState(payload);
					setError(null);
				} catch (failure) {
					setError(fill(t("error.load"), { message: failure.message }));
				}
			}, [sessionId, t]);
			react.useEffect(() => {
				void load();
			}, [load]);
			// Re-read on every open: the model can change mid-chat, and another tab
			// may have edited the same chat.
			react.useEffect(() => {
				if (open) void load();
			}, [open, load]);
			const persist = react.useCallback(async (mcpOn, groupsOff, photos) => {
				if (typeof sessionId !== "string" || sessionId === "") return;
				setBusy(true);
				try {
					const payload = await callHost("POST", STATE_URL, { sessionId, mcpOn, groupsOff, photos });
					setState(payload);
					setError(null);
				} catch (failure) {
					setError(fill(t("error.save"), { message: failure.message }));
					await load();
				} finally {
					setBusy(false);
				}
			}, [sessionId, t, load]);
			// What the chat allows, as the Host reports it: everything is off
			// until someone ticks it.
			const currentOn = state === null
				? []
				: state.servers.filter((server) => server.enabled === true).map((server) => server.name);
			const currentOff = state === null
				? []
				: state.groups.filter((group) => group.enabled !== true).map((group) => group.id);
			const toggleServer = async (name) => {
				if (state === null) return;
				const nextOn = currentOn.includes(name)
					? currentOn.filter((entry) => entry !== name)
					: [...currentOn, name];
				// Show the tick at once; the save response reconciles it with the Host.
				setState({
					...state,
					servers: state.servers.map((server) => (server.name === name ? { ...server, enabled: server.enabled !== true } : server))
				});
				await persist(nextOn, currentOff, state.photos?.allowed === true);
			};
			const toggleGroup = async (id) => {
				if (state === null) return;
				const nextOff = currentOff.includes(id)
					? currentOff.filter((entry) => entry !== id)
					: [...currentOff, id];
				// Show the tick at once; the save response reconciles it with the Host.
				setState({
					...state,
					groups: state.groups.map((group) => (group.id === id ? { ...group, enabled: group.enabled !== true } : group))
				});
				await persist(currentOn, nextOff, state.photos?.allowed === true);
			};
			const togglePhotos = async () => {
				if (state === null) return;
				await persist(currentOn, currentOff, state.photos?.allowed !== true);
			};
			const total = state === null ? 0 : state.servers.length;
			const enabled = state === null ? 0 : state.servers.filter((server) => server.enabled === true).length;
			const label = total === 0 ? t("trigger.label") : `${t("trigger.label")} ${String(enabled)}/${String(total)}`;
			return el(react.Fragment, null,
				el("button", {
					type: "button",
					className: TRIGGER_CLASS.trigger,
					"aria-label": t("trigger.aria"),
					title: error ?? t("trigger.title"),
					onClick: () => setOpen(true),
					children: [
						el("span", {
							className: TRIGGER_CLASS.icon,
							"aria-hidden": true,
							children: el(primitives.IconChecklistOutline14, {})
						}),
						el("span", { className: TRIGGER_CLASS.triggerLabel, children: label })
					]
				}),
				el(AccessDialog, {
					open,
					t,
					state,
					busy,
					error,
					onClose: () => setOpen(false),
					onToggleServer: toggleServer,
					onToggleGroup: toggleGroup,
					onTogglePhotos: togglePhotos
				}));
		}
		/**
		 * Client plugin body: the language pack, the dictionaries, and the composer
		 * control.
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
			}, "session-gate: composer styles");
			// Russian arrives as a language pack: the shell ships only zh and en, so
			// adding it here also makes it selectable in Settings → Language. Its
			// fallback is English, so every other plugin keeps working when Russian
			// is active. Another plugin may have registered it first (`addLanguage`
			// throws on a duplicate id), and one plugin failing to apply must not take
			// the whole browser half down with it.
			ctx.effect(() => {
				try {
					return ctx.locale.addLanguage({ id: "ru", label: "Русский", fallback: "en" });
				} catch {
					return () => {};
				}
			}, "session-gate: russian language pack");
			ctx.effect(() => ctx.locale.register(NS, { zh, en, ru }), "session-gate: dictionaries");
			// The control rides the composer's tool row, directly beside the shipped
			// permission and plan controls. `conversation.input.left` is a list, so
			// this entry sits beside other plugins' controls instead of replacing any.
			ctx.effect(() => ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "session-gate",
				order: 10,
				locale: NS
			}, AccessButton)), "session-gate: composer control");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
