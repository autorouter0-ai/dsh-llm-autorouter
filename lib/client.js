window.__ModuleLoader__.load({ id: "dsh-llm-autorouter", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
let react = require("react");
let _deepseek_ai_dsh_client_web_react = require("@deepseek-ai/dsh-client-web-react");
let react_jsx_runtime = require("react/jsx-runtime");

//#region src/client/card.css.ts
/** Stylesheet for the AutoRouter plugin card. Scoped by `.dsh-autorouter`. */
const CARD_STYLE_ID = "dsh-llm-autorouter-card-css";
/**
* Visual language copied from the in-tree Plugins cards (`PluginCard` /
* `fields`): accordion chrome, labelled controls, and pill badges, using the
* same `--dsw-alias-*` tokens so this out-of-tree card sits next to 网页搜索.
*/
const CARD_CSS = `
.dsh-autorouter {
  list-style: none;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3);
  transition: border-color .16s, background .16s;
  color: var(--dsw-alias-label-primary);
}
.dsh-autorouter:hover { border-color: var(--dsw-alias-label-dimmed); }
.dsh-autorouter.is-open {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh-autorouter-header {
  width: 100%;
  appearance: none;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
}
.dsh-autorouter-header:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dsh-autorouter-head-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-autorouter-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--dsw-alias-label-primary);
}
.dsh-autorouter-description {
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-autorouter-pending {
  flex: none;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 17px;
  font-weight: 500;
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.dsh-autorouter-chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  transition: transform .16s;
}
.dsh-autorouter.is-open .dsh-autorouter-chevron { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) {
  .dsh-autorouter, .dsh-autorouter-chevron { transition: none; }
}
.dsh-autorouter-body {
  border-top: 1px solid var(--dsw-alias-border-l2);
  margin: 0 16px;
  padding-bottom: 8px;
}
.dsh-autorouter-readonly {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-autorouter-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
}
.dsh-autorouter-field + .dsh-autorouter-field {
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-autorouter-field-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-autorouter-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh-autorouter-badges {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.dsh-autorouter-badge {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 17px;
  white-space: nowrap;
  font-weight: 500;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.dsh-autorouter-badge.is-muted {
  background: none;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-autorouter-reset {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dsh-autorouter-reset:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dsh-autorouter-reset:disabled { cursor: default; }
.dsh-autorouter-input,
.dsh-autorouter-search {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh-autorouter-input:focus-visible,
.dsh-autorouter-search:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
.dsh-autorouter-input:disabled,
.dsh-autorouter-search:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}
.dsh-autorouter-hint,
.dsh-autorouter-status {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-autorouter-status.is-error { color: var(--dsw-alias-label-error); }
.dsh-autorouter-status.is-ok { color: var(--dsw-alias-label-secondary); }
.dsh-autorouter-footer,
.dsh-autorouter-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 4px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-autorouter-toolbar { justify-content: space-between; }
.dsh-autorouter-toolbar .dsh-autorouter-hint,
.dsh-autorouter-toolbar .dsh-autorouter-status { flex: 1; min-width: 0; }
.dsh-autorouter-footer .dsh-autorouter-status,
.dsh-autorouter-footer .dsh-autorouter-hint { flex: 1; min-width: 0; }
.dsh-autorouter-toolbar-actions { display: flex; gap: 8px; }
.dsh-autorouter-btn {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
}
.dsh-autorouter-btn.is-ghost {
  border-color: var(--dsw-alias-border-l2);
  background: none;
  color: var(--dsw-alias-label-secondary);
}
.dsh-autorouter-btn.is-ghost:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh-autorouter-btn.is-primary {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-layer-3);
}
.dsh-autorouter-btn:disabled { opacity: 0.4; cursor: default; }
.dsh-autorouter-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsh-autorouter-models {
  border-top: 1px solid var(--dsw-alias-border-l2);
  padding: 12px 0 4px;
}
.dsh-autorouter-models-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.dsh-autorouter-models-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}
.dsh-autorouter-models-meta {
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-autorouter-group {
  padding: 10px 0;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-autorouter-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}
.dsh-autorouter-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px 8px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.dsh-autorouter-list > li { min-width: 0; }
.dsh-autorouter-model {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.5;
}
.dsh-autorouter-model:hover {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
}
.dsh-autorouter-model input { margin-top: 3px; accent-color: var(--dsw-alias-label-primary); }
.dsh-autorouter-model-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-wrap: anywhere;
}
.dsh-autorouter-model-id {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
`;
/** Install the card stylesheet once per document. */
function ensureCardStyles() {
	if (typeof document === "undefined" || document.getElementById(CARD_STYLE_ID) !== null) return;
	const style = document.createElement("style");
	style.id = CARD_STYLE_ID;
	style.textContent = CARD_CSS;
	document.head.appendChild(style);
}

//#endregion
//#region src/client/locales.ts
/** AutoRouter Plugins card copy. Chinese is the key-set source of truth. */
/** Simplified Chinese dictionary. */
const zh = {
	title: "AutoRouter",
	description: "通过网关连接，并选择聊天要使用的模型。",
	expand: "展开设置：{title}",
	collapse: "收起设置：{title}",
	unsaved: "未保存",
	readOnly: "本部署的设置为只读。",
	apiKey: "API Key",
	apiKeyHint: "不写入设置文件。输入新密钥并保存即可替换；留空表示保持当前密钥。",
	apiKeySet: "已配置密钥。",
	apiKeyUnset: "未配置密钥；配置之前无法从网关获取模型。",
	apiKeyLocked: "启动环境已提供 {ref}，本页不能改写。去掉该环境变量后重启 dsh web，或改用本页写入。",
	baseUrl: "接口地址",
	baseUrlHint: "网关 origin，不含尾斜杠或 /v1。留空则使用提供方默认地址。",
	overridden: "已覆盖",
	reset: "恢复默认",
	save: "保存",
	discard: "放弃修改",
	saveFailed: "本部署没有接受这些值，已保留供你修改。",
	saved: "已保存",
	imported: "已导入 {count} 个模型",
	cleared: "已清空聊天模型列表",
	importClearHint: "未选中任何模型；导入将清空聊天模型列表。",
	discovered: "已获取 {count} 个模型",
	noModels: "网关没有返回可导入模型",
	operationFailed: "操作失败",
	discoverFailed: "无法获取模型",
	discoverHint: "保存连接后，从网关拉取可导入的模型目录。",
	discover: "获取模型",
	catalog: "可导入模型",
	selectedCount: "{selected} / {total} 已选",
	filterPlaceholder: "按名称或 id 筛选",
	groupAria: "{name} 模型",
	importSelected: "导入选中模型",
	capChat: "对话",
	capImage: "图片生成",
	capVideo: "视频生成",
	capUnlabelled: "未标注能力"
};
/** English dictionary checked against the Chinese key set. */
const en = {
	title: "AutoRouter",
	description: "Connect the gateway and choose which models to use in chat.",
	expand: "Show settings: {title}",
	collapse: "Hide settings: {title}",
	unsaved: "Unsaved",
	readOnly: "This deployment stores settings read-only.",
	apiKey: "API key",
	apiKeyHint: "Stored outside the settings file. Type a new key and save to replace it; leave blank to keep the current key.",
	apiKeySet: "A key is configured.",
	apiKeyUnset: "No key is configured; discovery is unavailable until one is.",
	apiKeyLocked: "The launching environment already supplies {ref}, so this page cannot change it. Unset that variable and restart dsh web, or write the key here instead.",
	baseUrl: "Endpoint",
	baseUrlHint: "Gateway origin without a trailing slash or /v1. Leave blank to use the provider default.",
	overridden: "Overridden",
	reset: "Reset to default",
	save: "Save",
	discard: "Discard",
	saveFailed: "The deployment did not accept these values; they were left for you to correct.",
	saved: "Saved",
	imported: "Imported {count} models",
	cleared: "Chat model list cleared",
	importClearHint: "No models selected; importing will clear the chat model list.",
	discovered: "Fetched {count} models",
	noModels: "The gateway returned no models to import",
	operationFailed: "The operation failed",
	discoverFailed: "Could not list models",
	discoverHint: "After saving the connection, fetch the importable catalog from the gateway.",
	discover: "Fetch models",
	catalog: "Importable models",
	selectedCount: "{selected} / {total} selected",
	filterPlaceholder: "Filter by name or id",
	groupAria: "{name} models",
	importSelected: "Import selected models",
	capChat: "Chat",
	capImage: "Image generation",
	capVideo: "Video generation",
	capUnlabelled: "Unlabelled"
};

//#endregion
//#region src/client/index.tsx
/** Browser configuration card for the AutoRouter provider. */
const SETTINGS_NS = "llm-autorouter";
const LOCALE_NS = "llm-autorouter";
const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_API_KEY_ENV = "AUTOROUTER_API_KEY";
const UNLABELLED = "unlabelled";
const CAPABILITY_KEY = {
	chat: "capChat",
	"image-generation": "capImage",
	"video-generation": "capVideo",
	[UNLABELLED]: "capUnlabelled"
};
/** Required browser services. */
const inject = [
	"slots",
	"connection",
	"settingsScope",
	"locale"
];
function isPositiveInt(value) {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function asCandidate(model) {
	if (typeof model !== "object" || model === null || typeof model.id !== "string") return false;
	const row = model;
	if (row.contextWindow !== void 0 && !isPositiveInt(row.contextWindow)) return false;
	if (row.maxTokens !== void 0 && !isPositiveInt(row.maxTokens)) return false;
	if (row.inputModalities === void 0) return true;
	return Array.isArray(row.inputModalities) && row.inputModalities.every((value) => value === "text" || value === "image");
}
/** Map a catalog flash to the toolbar or import footer that should show it. */
function catalogFlashArea(flash) {
	if (flash.kind === "error") return flash.area;
	return flash.key === "imported" ? "import" : "discover";
}
/** Render catalog flash copy for the active locale. */
function catalogFlashText(flash, t) {
	if (flash.kind === "error") return flash.detail;
	if (flash.key === "noModels") return t("noModels");
	if (flash.key === "cleared") return t("cleared");
	if (flash.key === "discovered") return t("discovered", { count: flash.count });
	return t("imported", { count: flash.count });
}
const GROUP_PRIORITY = {
	chat: 0,
	"image-generation": 1,
	"video-generation": 2
};
/** Group models by gateway-advertised capability, retaining unlabelled models. */
function groupModels(models) {
	const groups = /* @__PURE__ */ new Map();
	for (const model of models) {
		const capabilities = model.capabilities?.length === 0 ? void 0 : model.capabilities;
		for (const capability of capabilities ?? [UNLABELLED]) {
			const group = groups.get(capability);
			if (group === void 0) groups.set(capability, [model]);
			else group.push(model);
		}
	}
	return [...groups].map(([capability, members]) => ({
		capability,
		models: members
	})).sort((left, right) => (GROUP_PRIORITY[left.capability] ?? Number.MAX_SAFE_INTEGER) - (GROUP_PRIORITY[right.capability] ?? Number.MAX_SAFE_INTEGER) || left.capability.localeCompare(right.capability));
}
function capabilityLabel(t, capability) {
	const key = CAPABILITY_KEY[capability];
	return key === void 0 ? capability : t(key);
}
function asRecord(value) {
	return typeof value === "object" && value !== null ? value : void 0;
}
function matchesQuery(model, query) {
	if (query.length === 0) return true;
	return `${model.id} ${model.name ?? ""}`.toLowerCase().includes(query);
}
/**
* Pre-check models already saved in the catalog after a refresh. The first
* fetch with an empty catalog still defaults to every chat-capable candidate.
*/
function initialSelection(models, importedIds) {
	const retained = models.filter((model) => importedIds.has(model.id)).map((model) => model.id);
	if (retained.length > 0) return new Set(retained);
	return new Set(models.filter((model) => model.capabilities?.includes("chat") === true).map((model) => model.id));
}
/** Chevron matching the in-tree Plugins accordion. */
function Chevron() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
		className: "dsh-autorouter-chevron",
		width: 14,
		height: 14,
		viewBox: "0 0 14 14",
		fill: "none",
		"aria-hidden": "true",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
			fill: "currentColor"
		})
	});
}
/** Checkbox for a capability group, including the partial-selection state. */
function GroupCheckbox({ checked, partial, disabled, onChange }) {
	const input = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		if (input.current !== null) input.current.indeterminate = partial;
	}, [partial]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
		ref: input,
		type: "checkbox",
		checked,
		disabled,
		onChange
	});
}
/** Render the AutoRouter provider configuration card. */
function AutorouterCard({ scope, useSnapshot, api, t }) {
	const snapshot = useSnapshot((value) => value);
	const config = snapshot.value;
	const storedBaseURL = config?.baseURL ?? DEFAULT_BASE_URL;
	const apiKeyEnv = config?.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
	const userLayer = asRecord(snapshot.user);
	const baseLayer = asRecord(snapshot.base);
	const overridden = userLayer !== void 0 && Object.hasOwn(userLayer, "baseURL");
	const [open, setOpen] = (0, react.useState)(false);
	const [baseURLDraft, setBaseURLDraft] = (0, react.useState)(storedBaseURL);
	const [resetBaseURL, setResetBaseURL] = (0, react.useState)(false);
	const [keyDraft, setKeyDraft] = (0, react.useState)("");
	const [keyConfigured, setKeyConfigured] = (0, react.useState)(false);
	const [keyWritable, setKeyWritable] = (0, react.useState)(true);
	const [candidates, setCandidates] = (0, react.useState)([]);
	const [selected, setSelected] = (0, react.useState)(/* @__PURE__ */ new Set());
	const [query, setQuery] = (0, react.useState)("");
	const [busy, setBusy] = (0, react.useState)(false);
	const [failed, setFailed] = (0, react.useState)(false);
	const [connectionMessage, setConnectionMessage] = (0, react.useState)(void 0);
	const [catalogMessage, setCatalogMessage] = (0, react.useState)(void 0);
	(0, react.useEffect)(() => {
		ensureCardStyles();
	}, []);
	(0, react.useEffect)(() => {
		if (!resetBaseURL) setBaseURLDraft(storedBaseURL);
	}, [storedBaseURL, resetBaseURL]);
	const refreshCredential = async () => {
		try {
			const response = await api.credentials.describe({ refs: [apiKeyEnv] });
			if (!response.result.ok) return;
			const view = response.result.value.credentials[apiKeyEnv];
			setKeyConfigured(view?.configured ?? false);
			setKeyWritable(view?.writable ?? true);
		} catch (_credentialReadFailure) {}
	};
	(0, react.useEffect)(() => {
		let stale = false;
		api.credentials.describe({ refs: [apiKeyEnv] }).then((response) => {
			if (stale || !response.result.ok) return;
			const view = response.result.value.credentials[apiKeyEnv];
			setKeyConfigured(view?.configured ?? false);
			setKeyWritable(view?.writable ?? true);
		}, () => void 0);
		return () => {
			stale = true;
		};
	}, [api.credentials, apiKeyEnv]);
	const trimmedBaseURL = baseURLDraft.trim();
	const dirty = resetBaseURL || trimmedBaseURL !== storedBaseURL || keyDraft.trim().length > 0;
	const disabled = !snapshot.writable || busy;
	const filter = query.trim().toLowerCase();
	const persistConnection = async () => {
		if (resetBaseURL || trimmedBaseURL.length === 0) await scope.unset("baseURL");
		else if (trimmedBaseURL !== storedBaseURL) await scope.set("baseURL", trimmedBaseURL);
		setResetBaseURL(false);
		if (keyDraft.trim().length > 0) {
			const response = await api.credentials.set({
				ref: apiKeyEnv,
				value: keyDraft.trim()
			});
			if (!response.result.ok) throw new Error(response.result.error.message);
			setKeyDraft("");
		}
		await refreshCredential();
	};
	const runConnection = async (action) => {
		setBusy(true);
		setFailed(false);
		setConnectionMessage(void 0);
		try {
			const flash = await action();
			if (flash !== void 0) setConnectionMessage(flash);
		} catch (error) {
			setFailed(true);
			setConnectionMessage({
				kind: "error",
				detail: error instanceof Error ? error.message : t("operationFailed")
			});
		} finally {
			setBusy(false);
		}
	};
	const runCatalog = async (area, action) => {
		setBusy(true);
		setCatalogMessage(void 0);
		try {
			const flash = await action();
			if (flash !== void 0) setCatalogMessage(flash);
		} catch (error) {
			setCatalogMessage({
				kind: "error",
				area,
				detail: error instanceof Error ? error.message : t("operationFailed")
			});
		} finally {
			setBusy(false);
		}
	};
	const save = () => {
		runConnection(async () => {
			await persistConnection();
			return {
				kind: "ok",
				key: "saved"
			};
		});
	};
	const discard = () => {
		setBaseURLDraft(storedBaseURL);
		setResetBaseURL(false);
		setKeyDraft("");
		setFailed(false);
		setConnectionMessage(void 0);
	};
	const resetField = () => {
		setBaseURLDraft(typeof baseLayer?.baseURL === "string" && baseLayer.baseURL.length > 0 ? baseLayer.baseURL : DEFAULT_BASE_URL);
		setResetBaseURL(true);
		setFailed(false);
	};
	const discover = () => {
		runCatalog("discover", async () => {
			await persistConnection();
			const response = await fetch("/plugins/dsh-llm-autorouter/models", { method: "POST" });
			const body = await response.json();
			if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : t("discoverFailed"));
			const models = Array.isArray(body.models) ? body.models.filter(asCandidate) : [];
			setCandidates(models);
			setSelected(initialSelection(models, new Set((config?.models ?? []).map((model) => model.id))));
			setQuery("");
			return models.length === 0 ? {
				kind: "ok",
				key: "noModels"
			} : {
				kind: "ok",
				key: "discovered",
				count: models.length
			};
		});
	};
	const importModels = () => {
		runCatalog("import", async () => {
			await persistConnection();
			const imported = candidates.filter((model) => selected.has(model.id));
			await scope.set("models", imported.map((model) => ({
				id: model.id,
				...model.name === void 0 ? {} : { name: model.name },
				...model.inputModalities !== void 0 && model.inputModalities.length > 0 ? { inputModalities: [...model.inputModalities] } : {},
				...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
				...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens }
			})));
			return imported.length === 0 ? {
				kind: "ok",
				key: "cleared"
			} : {
				kind: "ok",
				key: "imported",
				count: imported.length
			};
		});
	};
	const toggle = (id) => {
		setSelected((current) => {
			const next = new Set(current);
			if (!next.delete(id)) next.add(id);
			return next;
		});
	};
	const toggleGroup = (models) => {
		const ids = models.map((model) => model.id);
		setSelected((current) => {
			const next = new Set(current);
			const allSelected = ids.every((id) => next.has(id));
			for (const id of ids) if (allSelected) next.delete(id);
			else next.add(id);
			return next;
		});
	};
	if (snapshot.status !== "ready") return null;
	const title = t("title");
	const discoverStatus = catalogMessage !== void 0 && catalogFlashArea(catalogMessage) === "discover" ? catalogMessage : void 0;
	const importStatus = catalogMessage !== void 0 && catalogFlashArea(catalogMessage) === "import" ? catalogMessage : void 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
		className: `dsh-autorouter${open ? " is-open" : ""}`,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "dsh-autorouter-header",
			"aria-expanded": open,
			"aria-label": t(open ? "collapse" : "expand", { title }),
			onClick: () => {
				setOpen(!open);
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dsh-autorouter-head-text",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-autorouter-name",
						children: title
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-autorouter-description",
						children: t("description")
					})]
				}),
				dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsh-autorouter-pending",
					children: t("unsaved")
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, {})
			]
		}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-autorouter-body",
			children: [
				!snapshot.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-autorouter-readonly",
					role: "status",
					children: t("readOnly")
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-autorouter-field",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-autorouter-field-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: "dsh-autorouter-label",
								htmlFor: "autorouter-api-key",
								children: t("apiKey")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-autorouter-badges",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: `dsh-autorouter-badge${keyConfigured ? "" : " is-muted"}`,
									children: keyConfigured ? t("apiKeySet") : t("apiKeyUnset")
								})
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "autorouter-api-key",
							className: "dsh-autorouter-input",
							type: "password",
							autoComplete: "off",
							value: keyDraft,
							disabled: !keyWritable || busy,
							onChange: (event) => setKeyDraft(event.target.value)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-autorouter-hint",
							children: keyWritable ? t("apiKeyHint") : t("apiKeyLocked", { ref: apiKeyEnv })
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-autorouter-field",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-autorouter-field-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: "dsh-autorouter-label",
								htmlFor: "autorouter-base-url",
								children: t("baseUrl")
							}), overridden || resetBaseURL ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-autorouter-badges",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-autorouter-badge",
									children: t("overridden")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-autorouter-reset",
									disabled,
									onClick: resetField,
									children: t("reset")
								})]
							}) : null]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: "autorouter-base-url",
							className: "dsh-autorouter-input",
							value: baseURLDraft,
							disabled,
							onChange: (event) => {
								setBaseURLDraft(event.target.value);
								setResetBaseURL(false);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-autorouter-hint",
							children: t("baseUrlHint")
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-autorouter-footer",
					children: [
						failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-autorouter-status is-error",
							role: "status",
							children: t("saveFailed")
						}) : connectionMessage === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: `dsh-autorouter-status${connectionMessage.kind === "error" ? " is-error" : " is-ok"}`,
							role: "status",
							children: connectionMessage.kind === "error" ? connectionMessage.detail : t(connectionMessage.key)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-autorouter-btn is-ghost",
							disabled: !dirty || busy,
							onClick: discard,
							children: t("discard")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-autorouter-btn is-primary",
							disabled: !dirty || busy,
							onClick: save,
							children: t("save")
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-autorouter-toolbar",
					children: [discoverStatus === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-autorouter-hint",
						children: t("discoverHint")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: `dsh-autorouter-status${discoverStatus.kind === "error" ? " is-error" : " is-ok"}`,
						role: "status",
						children: catalogFlashText(discoverStatus, t)
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-autorouter-toolbar-actions",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-autorouter-btn is-ghost",
							disabled: busy,
							onClick: discover,
							children: t("discover")
						})
					})]
				}),
				candidates.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: "dsh-autorouter-models",
					"aria-label": t("catalog"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-autorouter-models-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: "dsh-autorouter-models-title",
								children: t("catalog")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-autorouter-models-meta",
								children: t("selectedCount", {
									selected: selected.size,
									total: candidates.length
								})
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dsh-autorouter-search",
							type: "search",
							placeholder: t("filterPlaceholder"),
							value: query,
							disabled: busy,
							onChange: (event) => setQuery(event.target.value)
						}),
						groupModels(candidates).map((group) => {
							const visible = group.models.filter((model) => matchesQuery(model, filter));
							if (visible.length === 0) return null;
							const selectedCount = visible.filter((model) => selected.has(model.id)).length;
							const groupSelected = selectedCount === visible.length;
							const name = capabilityLabel(t, group.capability);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "dsh-autorouter-group",
								"aria-label": t("groupAria", { name }),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dsh-autorouter-group-head",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupCheckbox, {
											checked: groupSelected,
											partial: selectedCount > 0 && !groupSelected,
											disabled,
											onChange: () => toggleGroup(visible)
										}),
										name,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-autorouter-badge",
											children: visible.length
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: "dsh-autorouter-list",
									children: visible.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-autorouter-model",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: selected.has(model.id),
											disabled,
											onChange: () => toggle(model.id)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "dsh-autorouter-model-text",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: model.name ?? model.id }), model.name === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-autorouter-model-id",
												children: model.id
											})]
										})]
									}) }, model.id))
								})]
							}, group.capability);
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-autorouter-footer",
							children: [importStatus === void 0 ? selected.size === 0 && candidates.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "dsh-autorouter-hint",
								children: t("importClearHint")
							}) : null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: `dsh-autorouter-status${importStatus.kind === "error" ? " is-error" : " is-ok"}`,
								role: "status",
								children: catalogFlashText(importStatus, t)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dsh-autorouter-btn is-primary",
								disabled,
								onClick: importModels,
								children: t("importSelected")
							})]
						})
					]
				})
			]
		}) : null]
	});
}
/** Register the AutoRouter card after the generic plugin-configuration tab exists. */
function apply(ctx) {
	ctx.effect(() => ctx.locale.register(LOCALE_NS, {
		zh,
		en
	}), "dsh-llm-autorouter: dictionaries");
	const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
	const connection = ctx.get("connection");
	const useSnapshot = (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(scope);
	ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
		name: "settings.plugin.item",
		key: SETTINGS_NS,
		locale: LOCALE_NS,
		inject: () => ({
			scope,
			useSnapshot,
			api: connection.api
		})
	}, AutorouterCard));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });