import z from "@deepseek-ai/schemastery";
import { CONTEXT_WINDOW_EXCEEDED_CODE, CallId, EMPTY_RESPONSE_CODE, LlmAdapter, LlmError, ProviderRequestId, QUOTA_EXCEEDED_CODE, ReasoningEffortId, RetryPolicySchema, assertUsableApiKey, attributionHeaders, contentHasImage, isContextWindowExceededError, isQuotaExceededError, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { MAX_TIMER_DELAY_MS, idleWatchdog, timeoutOf } from "@deepseek-ai/dsh-timeout";
import { EventSourceParserStream } from "eventsource-parser/stream";
//#region src/serialize.ts
/**
* Serialize harness messages into OpenAI-compatible chat completions for the
* AutoRouter relay. User text is joined; assistant text becomes `content`, tool
* calls become `tool_calls`, and tool results become separate tool messages.
* Assistant reasoning is replayed as `reasoning_content` only on tool-call
* turns, as required by thinking-mode passback. User image blocks resolve
* through the durable attachment store into `image_url` data URLs. Unknown
* declaration-merged block types retain the adapter's documented extension
* fallback.
*
* Adapted from `@deepseek-ai/dsh-llm-deepseek/src/serialize.ts` (MIT).
*
* @module dsh-llm-autorouter/serialize
*/
/** Validate the adapter-owned effort before resolving its wire fields. */
function reasoningEffort(effort) {
	if (effort === "off" || effort === "low" || effort === "high" || effort === "max") return effort;
	throw new LlmError(`The AutoRouter relay adapter does not support reasoning effort "${effort}"`, "UNSUPPORTED_REASONING_EFFORT");
}
/**
* Resolve one legal thinking/effort pair without exposing `off` as a wire
* effort. This adapter is neutral by default: with no configured thinking or
* effort nothing is put on the wire, so a relay that multiplexes arbitrary
* upstreams keeps provider defaults until the deployment opts in.
*/
function resolveThinking(options, defaults) {
	if (options.purpose === "session-title") return { thinking: "disabled" };
	const effort = options.reasoningEffort === void 0 ? defaults.reasoningEffort : reasoningEffort(options.reasoningEffort);
	if (defaults.thinking === "disabled" && effort !== void 0 && effort !== "off") throw new LlmError(`The AutoRouter relay adapter does not support reasoning effort "${effort}"`, "UNSUPPORTED_REASONING_EFFORT");
	if (effort === "off") return { thinking: "disabled" };
	if (effort === "low" || effort === "high" || effort === "max") return {
		thinking: "enabled",
		reasoningEffort: effort
	};
	return defaults.thinking === void 0 ? {} : { thinking: defaults.thinking };
}
/** Reject image content on roles the OpenAI chat-completions history cannot carry. */
function assertNoImage(blocks, role) {
	if (contentHasImage(blocks)) throw new LlmError(`The AutoRouter relay adapter cannot place image content on a ${role} message.`, "UNSUPPORTED_CONTENT");
}
/** Join the text blocks of a message (used for user/tool-result content). */
function flattenText(blocks) {
	return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
/**
* Serialize user (or nested tool-result) blocks. Text-only stays a string so
* existing gateways keep seeing the same body; images become OpenAI vision parts.
*/
async function serializeUserContent(blocks, attachments) {
	const parts = [];
	let hasImage = false;
	for (const block of blocks) {
		if (block.type === "text") {
			if (block.text.length > 0) parts.push({
				type: "text",
				text: block.text
			});
			continue;
		}
		if (block.type !== "image") continue;
		if (attachments === void 0) throw new LlmError("The AutoRouter relay adapter needs the durable attachment service to send image content.", "UNSUPPORTED_CONTENT");
		const stored = await attachments.readImage(block.attachment);
		parts.push({
			type: "image_url",
			image_url: { url: `data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString("base64")}` }
		});
		hasImage = true;
	}
	if (!hasImage) return parts.filter((part) => part.type === "text").map((part) => part.text).join("");
	return parts;
}
/** Serialize one assistant message (text + reasoning + tool calls). */
function serializeAssistant(message) {
	const text = flattenText(message.content);
	const reasoning = message.content.filter((block) => block.type === "reasoning").map((block) => block.text).join("");
	const toolCalls = message.content.filter((block) => block.type === "tool-call").map((block) => ({
		id: block.id,
		type: "function",
		function: {
			name: block.name,
			arguments: block.arguments
		}
	}));
	return {
		role: "assistant",
		content: text,
		...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
		...toolCalls.length > 0 ? { tool_calls: toolCalls } : {}
	};
}
/**
* Serialize the conversation. `tool-result` blocks become standalone
* `{role: 'tool'}` messages; the harness puts each tool result in its own
* user-role message, so a mixed user message contributes its text first and
* its tool results as separate wire messages after.
* @param messages - the harness conversation, in order.
* @param attachments - durable byte resolver; required when any message carries images.
* @returns the wire messages; order preserved, each tool result expanded into its own entry.
*/
async function serializeMessages(messages, attachments) {
	const wire = [];
	for (const message of messages) {
		if (message.role === "system") {
			assertNoImage(message.content, "system");
			wire.push({
				role: "system",
				content: flattenText(message.content)
			});
			continue;
		}
		if (message.role === "assistant") {
			assertNoImage(message.content, "assistant");
			wire.push(serializeAssistant(message));
			continue;
		}
		const toolResults = message.content.filter((block) => block.type === "tool-result");
		const content = await serializeUserContent(message.content.filter((block) => block.type !== "tool-result"), attachments);
		if (content.length > 0 || toolResults.length === 0) wire.push({
			role: "user",
			content
		});
		for (const result of toolResults) {
			assertNoImage(result.content, "tool");
			wire.push({
				role: "tool",
				tool_call_id: result.toolCallId,
				content: flattenText(result.content) || "(no output)"
			});
		}
	}
	return wire;
}
/**
* Build the full wire request. Always streaming (`stream: true`, usage
* reporting on); optional fields are omitted rather than sent as null, so
* provider defaults apply.
* @param options - the harness request (model, history, system, tools, sampling).
* @param defaults - adapter-level thinking defaults; undefined fields put nothing on the wire.
* @param attachments - durable byte resolver; required when the history carries images.
* @returns the chat-completions request body.
*/
async function serializeRequest(options, defaults = {}, attachments) {
	const messages = [];
	if (options.system !== void 0) messages.push({
		role: "system",
		content: options.system
	});
	messages.push(...await serializeMessages(options.messages, attachments));
	const tools = options.tools?.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters
		}
	}));
	const resolvedThinking = resolveThinking(options, defaults);
	return {
		model: options.model,
		messages,
		stream: true,
		stream_options: { include_usage: true },
		...resolvedThinking.thinking !== void 0 ? { thinking: { type: resolvedThinking.thinking } } : {},
		...resolvedThinking.reasoningEffort !== void 0 ? { reasoning_effort: resolvedThinking.reasoningEffort } : {},
		...tools !== void 0 && tools.length > 0 ? { tools } : {},
		...options.temperature !== void 0 ? { temperature: options.temperature } : {},
		...options.maxTokens === void 0 ? {} : { max_tokens: options.maxTokens },
		...options.stop !== void 0 ? { stop: options.stop } : {}
	};
}
/**
* Parse an SSE byte stream into data payloads. Yields `[DONE]` as the final
* value and returns; throws `LlmError('STREAM_CLOSED')` when the stream ends
* without it (truncated response — the model call cannot be trusted).
* @param stream - raw SSE bytes; reads may split anywhere, including mid-UTF-8 sequence.
* @param onComment - optional transport-activity callback; comments never enter the yielded payload stream.
* @returns each event's data payload in arrival order, the `[DONE]` sentinel last.
*/
async function* parseSse(stream, onComment) {
	const events = stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream({ onComment }));
	for await (const { data } of events) {
		yield data;
		if (data === "[DONE]") return;
	}
	throw new LlmError("SSE stream ended without [DONE]", "STREAM_CLOSED");
}
//#endregion
//#region src/translate.ts
/**
* Translate OpenAI-compatible relay SSE payloads into the harness
* `StreamChunk` protocol, with one stateful harness block per content,
* reasoning, or tool call index. An empty initial reasoning delta does not
* open a block. Finish reason and the latest usage are deferred until
* `[DONE]`, covering both finish-attached and trailing usage-only shapes
* while ensuring no chunk follows `finish`.
*
* Adapted from `@deepseek-ai/dsh-llm-deepseek/src/translate.ts` (MIT).
*
* @module dsh-llm-autorouter/translate
*/
/**
* Map the wire finish_reason vocabulary to the harness FinishReason.
* @param reason - the wire `finish_reason` string.
* @returns the mapped reason; unrecognized values (content_filter, …) become `{kind: 'error'}` with the uppercased value as `code`.
*/
function mapFinishReason(reason) {
	switch (reason) {
		case "stop": return { kind: "stop" };
		case "tool_calls": return { kind: "tool-calls" };
		case "length": return { kind: "max-tokens" };
		default: return {
			kind: "error",
			failure: {
				message: `model stopped: ${reason}`,
				code: reason.toUpperCase()
			}
		};
	}
}
/**
* Map wire usage fields. DeepSeek-family channels report `prompt_tokens`
* INCLUDING cache hits (`prompt_tokens = prompt_cache_hit_tokens +
* prompt_cache_miss_tokens`); the harness TokenUsage convention is DISJOINT
* counts, so cache reads are subtracted out of `inputTokens`.
* @param usage - wire usage from the finish chunk or the trailing usage-only chunk.
* @returns disjoint harness counts; cache/reasoning fields present only when the wire reported them.
*/
function mapUsage(usage) {
	const cacheRead = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens;
	const reasoning = usage.completion_tokens_details?.reasoning_tokens;
	return {
		inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
		outputTokens: usage.completion_tokens,
		...cacheRead !== void 0 ? { cacheReadTokens: cacheRead } : {},
		...reasoning !== void 0 ? { reasoningTokens: reasoning } : {}
	};
}
/** Assemble the final ContentBlock for one open block. */
function closeBlock(block) {
	switch (block.kind) {
		case "text": return {
			type: "text",
			text: block.text
		};
		case "reasoning": return {
			type: "reasoning",
			text: block.text
		};
		case "tool-call": return {
			type: "tool-call",
			id: CallId(block.callId ?? ""),
			name: block.name ?? "",
			arguments: block.text
		};
	}
}
/**
* Consume SSE data payloads (ending with `[DONE]`) and yield StreamChunks.
* Malformed JSON payloads abort the stream with `MALFORMED_RESPONSE`.
* @param payloads - SSE data payloads from {@link parseSse}, `[DONE]`-terminated.
* @returns deltas as they arrive; `block-end`s, `usage`, and `finish` are all deferred to the `[DONE]` sentinel.
*   A `stop` (or absent) finish with no opened blocks is a degenerate provider completion and maps to an
*   `EMPTY_RESPONSE` error finish instead of a successful empty message.
*/
async function* translate(payloads) {
	let nextIndex = 0;
	let textBlock;
	let reasoningBlock;
	const toolBlocks = /* @__PURE__ */ new Map();
	const order = [];
	let pendingFinish;
	let pendingUsage;
	function open(kind) {
		const block = {
			index: nextIndex++,
			kind,
			text: ""
		};
		order.push(block);
		return block;
	}
	for await (const payload of payloads) {
		if (payload === "[DONE]") {
			for (const block of order) yield {
				type: "block-end",
				index: block.index,
				block: closeBlock(block)
			};
			if (pendingUsage) yield {
				type: "usage",
				usage: pendingUsage
			};
			const reason = pendingFinish ?? { kind: "stop" };
			yield {
				type: "finish",
				reason: reason.kind === "stop" && order.length === 0 ? {
					kind: "error",
					failure: {
						message: "model returned a completed response with no content",
						code: EMPTY_RESPONSE_CODE
					}
				} : reason
			};
			return;
		}
		let chunk;
		try {
			chunk = JSON.parse(payload);
		} catch {
			throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, "MALFORMED_RESPONSE");
		}
		for (const choice of chunk.choices ?? []) {
			const delta = choice.delta;
			const reasoning = delta?.reasoning_content;
			if (typeof reasoning === "string" && reasoning.length > 0) {
				if (!reasoningBlock) {
					reasoningBlock = open("reasoning");
					yield {
						type: "block-start",
						index: reasoningBlock.index,
						blockType: "reasoning"
					};
				}
				reasoningBlock.text += reasoning;
				yield {
					type: "reasoning-delta",
					index: reasoningBlock.index,
					text: reasoning
				};
			}
			const content = delta?.content;
			if (typeof content === "string" && content.length > 0) {
				if (!textBlock) {
					textBlock = open("text");
					yield {
						type: "block-start",
						index: textBlock.index,
						blockType: "text"
					};
				}
				textBlock.text += content;
				yield {
					type: "text-delta",
					index: textBlock.index,
					text: content
				};
			}
			for (const call of delta?.tool_calls ?? []) {
				let block = toolBlocks.get(call.index);
				if (!block) {
					block = open("tool-call");
					toolBlocks.set(call.index, block);
					yield {
						type: "block-start",
						index: block.index,
						blockType: "tool-call"
					};
				}
				if (call.id !== void 0) block.callId = call.id;
				if (call.function?.name !== void 0) block.name = call.function.name;
				const fragment = call.function?.arguments ?? "";
				block.text += fragment;
				yield {
					type: "tool-call-delta",
					index: block.index,
					id: CallId(block.callId ?? ""),
					...block.name !== void 0 ? { name: block.name } : {},
					argumentsDelta: fragment
				};
			}
			if (typeof choice.finish_reason === "string") pendingFinish = mapFinishReason(choice.finish_reason);
		}
		if (chunk.usage) pendingUsage = mapUsage(chunk.usage);
	}
	throw new LlmError("SSE payload stream ended without [DONE]", "STREAM_CLOSED");
}
//#endregion
//#region src/adapter.ts
/**
* `AutorouterAdapter`: fetch + SSE against an AutoRouter (OpenAI-compatible) relay
* chat-completions endpoint, emitting harness StreamChunks. The adapter is
* transport-only: connection facts arrive through a thunk resolved once per
* operation and the bearer token through a per-request resolver, so the
* registering plugin owns validation and credential policy. The chat model
* catalog comes from the saved allowlist; configuration discovery reads
* `GET /v1/models` through the Host plugin's separate discovery registration.
* User images are sent as OpenAI `image_url` data URLs when the durable
* attachment service is present.
*
* Adapted from `@deepseek-ai/dsh-llm-deepseek/src/adapter.ts` (MIT).
*
* @module dsh-llm-autorouter/adapter
*/
/** The relay chat-completions route appended to the configured base URL. */
const CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
/** The model-listing route appended to the configured base URL. */
const MODELS_PATH = "/v1/models";
/** Default maximum idle interval while an adapter stream read is outstanding. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
/** Default combined request/response context capacity for unknown models. */
const DEFAULT_CONTEXT_WINDOW = 128e3;
/** Default per-listing network timeout for `/v1/models`. */
const DEFAULT_DISCOVERY_TIMEOUT_MS = 1e4;
/** Upper bound on live-discovered models, to bound memory for large gateways. */
const MAX_DISCOVERED_MODELS = 1e3;
const STREAM_IDLE_TIMEOUT_CODE = "LLM_STREAM_IDLE_TIMEOUT";
const OFF_REASONING_EFFORT = ReasoningEffortId("off");
const LOW_REASONING_EFFORT = ReasoningEffortId("low");
const HIGH_REASONING_EFFORT = ReasoningEffortId("high");
const MAX_REASONING_EFFORT = ReasoningEffortId("max");
const REASONING_EFFORTS = [
	{
		id: OFF_REASONING_EFFORT,
		name: "Off"
	},
	{
		id: LOW_REASONING_EFFORT,
		name: "Low"
	},
	{
		id: HIGH_REASONING_EFFORT,
		name: "High"
	},
	{
		id: MAX_REASONING_EFFORT,
		name: "Max"
	}
];
const OFF_ONLY_REASONING_EFFORTS = [{
	id: OFF_REASONING_EFFORT,
	name: "Off"
}];
function modelInfo(provider, model) {
	return {
		provider,
		id: model.id,
		name: model.name ?? model.id,
		...model.description === void 0 ? {} : { description: model.description },
		inputModalities: model.inputModalities === void 0 ? ["text"] : [...model.inputModalities]
	};
}
function providerRetryAfterMs(value) {
	if (value === null) return void 0;
	if (/^\d+$/.test(value)) {
		const delay = Number(value) * 1e3;
		return Number.isFinite(delay) && delay > 0 ? delay : void 0;
	}
	const delay = Date.parse(value) - Date.now();
	return Number.isFinite(delay) && delay > 0 ? delay : void 0;
}
function requestId(headers) {
	const value = headers.get("x-request-id");
	return value === null || value.length === 0 ? void 0 : ProviderRequestId(value);
}
/**
* Map an HTTP status to a stable LlmError code.
* @param status - status of a non-2xx provider response.
* @param error - parsed provider error body, when available.
* @returns the normalized harness error code.
*/
function httpErrorCode(status, error) {
	if (status === 401 || status === 403) return "AUTH";
	const detail = [
		error?.code,
		error?.type,
		error?.message
	].filter(Boolean).join(" ");
	if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE;
	if (status === 429) return "RATE_LIMIT";
	if (status === 400) {
		if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE;
		return "INVALID_REQUEST";
	}
	if (status >= 500) return "SERVER";
	return `HTTP_${status}`;
}
/** Normalize common gateway capability encodings from an untrusted model-listing row. */
function capabilitiesOf(value) {
	const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : value !== null && typeof value === "object" ? Object.entries(value).flatMap(([capability, enabled]) => enabled === true ? [capability] : []) : [];
	const capabilities = [...new Set(raw.filter((capability) => typeof capability === "string" && capability.length > 0))];
	return capabilities.length === 0 ? void 0 : capabilities;
}
/** Read OpenAI-style `input_modalities` (or camelCase) from an untrusted listing row. */
function inputModalitiesOf(entry) {
	const raw = entry.input_modalities ?? entry.inputModalities;
	if (!Array.isArray(raw)) return void 0;
	const modalities = [...new Set(raw.filter((value) => value === "text" || value === "image"))];
	return modalities.length === 0 ? void 0 : modalities;
}
/**
* Read a positive token count from an untrusted gateway listing field.
* Invalid or missing values are omitted.
*/
function positiveTokenCount(raw) {
	if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return void 0;
	const tokens = Math.round(raw);
	return tokens > 0 ? tokens : void 0;
}
/** Read the gateway's authenticated OpenAI-compatible model listing. */
async function discoverGatewayModels(connection, apiKey, signal) {
	const response = await fetch(`${connection.baseURL}${MODELS_PATH}`, {
		headers: {
			"authorization": `Bearer ${apiKey}`,
			"accept": "application/json",
			...attributionHeaders()
		},
		...signal === void 0 ? {} : { signal }
	});
	if (!response.ok) throw new LlmError(`AutoRouter models listing failed (HTTP ${response.status})`, httpErrorCode(response.status));
	return ((await response.json()).data ?? []).filter((entry) => typeof entry.id === "string" && entry.id.length > 0).slice(0, MAX_DISCOVERED_MODELS).map((entry) => {
		const capabilities = capabilitiesOf(entry.capabilities);
		const inputModalities = inputModalitiesOf(entry);
		const contextWindow = positiveTokenCount(entry.context_window ?? entry.contextWindow);
		const maxTokens = positiveTokenCount(entry.max_output_tokens ?? entry.maxOutputTokens);
		return {
			id: entry.id,
			...capabilities === void 0 ? {} : { capabilities },
			...inputModalities === void 0 ? {} : { inputModalities },
			...contextWindow === void 0 ? {} : { contextWindow },
			...maxTokens === void 0 ? {} : { maxTokens }
		};
	});
}
/** Project a gateway listing onto the generic discovery fields. */
async function discoverModels(connection, apiKey, signal) {
	return (await discoverGatewayModels(connection, apiKey, signal)).map(({ id }) => ({ id }));
}
/**
* The first real `LlmAdapter`. One instance serves every model name it was
* registered under (the gateway routes any listed model id).
*
* One stable signal reaches both initial fetch and body reads. Caller aborts
* map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
*/
var AutorouterAdapter = class extends LlmAdapter {
	config;
	constructor(config) {
		super();
		this.config = config;
	}
	providerInfo(provider) {
		return {
			id: provider,
			name: "AutoRouter"
		};
	}
	providerRetryPolicy(_provider) {
		return this.config.options().retryPolicy;
	}
	listModels(provider) {
		const connection = this.config.options();
		return Promise.resolve(connection.models.map((model) => modelInfo(provider, model)));
	}
	resolveModel(provider, model, _signal) {
		const connection = this.config.options();
		const configured = connection.models.find((entry) => entry.id === model);
		const contextWindow = configured?.contextWindow ?? connection.defaultContextWindow;
		return Promise.resolve({
			...configured === void 0 ? {
				provider,
				id: model,
				name: model,
				inputModalities: ["text"]
			} : modelInfo(provider, configured),
			context: { contextWindow },
			...configured?.maxTokens !== void 0 ? { defaultMaxTokens: configured.maxTokens } : {},
			reasoning: connection.defaults.thinking === "disabled" ? {
				efforts: OFF_ONLY_REASONING_EFFORTS,
				defaultEffort: OFF_REASONING_EFFORT
			} : {
				efforts: REASONING_EFFORTS,
				...effortDefault(connection.defaults.reasoningEffort)
			}
		});
	}
	async *stream(options) {
		const connection = this.config.options();
		const apiKey = await this.config.resolveApiKey(connection);
		const consumer = new AbortController();
		const upstream = options.signal === void 0 ? consumer.signal : AbortSignal.any([options.signal, consumer.signal]);
		using watchdog = idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE);
		const iterator = this.request(options, watchdog.signal, connection, apiKey, () => {
			watchdog.pulse();
		})[Symbol.asyncIterator]();
		let exhausted = false;
		try {
			while (true) {
				const result = await watchdog.next(iterator);
				if (result.done) {
					exhausted = true;
					return;
				}
				yield result.value;
			}
		} catch (error) {
			if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== void 0) throw new LlmError(`AutoRouter stream idle timeout after ${connection.streamIdleTimeoutMs}ms`, "TIMEOUT", { cause: error });
			if (options.signal?.aborted) throw new LlmError("AutoRouter request aborted by caller", "ABORTED", { cause: error });
			if (error instanceof LlmError) throw error;
			throw new LlmError(`AutoRouter stream from ${connection.baseURL} failed`, "TRANSPORT", { cause: error });
		} finally {
			consumer.abort("AutoRouter stream consumer stopped");
			if (!exhausted && iterator.return !== void 0) try {
				await iterator.return();
			} catch (_abortedTransportTeardown) {}
		}
	}
	async *request(options, signal, connection, apiKey, onComment) {
		const body = await serializeRequest(options, connection.defaults, contentHasImage(options.messages.flatMap((message) => message.content)) ? this.config.resolveAttachments?.() : void 0);
		const payload = JSON.stringify(body);
		const headers = {
			"authorization": `Bearer ${apiKey}`,
			"content-type": "application/json",
			"accept": "text/event-stream",
			...attributionHeaders()
		};
		let response;
		try {
			response = await fetch(`${connection.baseURL}${CHAT_COMPLETIONS_PATH}`, {
				method: "POST",
				headers,
				body: payload,
				signal
			});
		} catch (error) {
			if (signal.aborted) throw error;
			throw new LlmError(`AutoRouter request to ${connection.baseURL} failed`, "TRANSPORT", { cause: error });
		}
		if (!response.ok) {
			let message = `AutoRouter error (HTTP ${response.status})`;
			let providerError;
			try {
				providerError = (await response.json()).error;
				if (providerError?.message) message = providerError.message;
			} catch {}
			const delay = providerRetryAfterMs(response.headers.get("retry-after"));
			const id = requestId(response.headers);
			throw new LlmError(message, httpErrorCode(response.status, providerError), {
				status: response.status,
				...delay === void 0 ? {} : { providerRetryAfterMs: delay },
				...id === void 0 ? {} : { requestId: id }
			});
		}
		if (!response.body) throw new LlmError("AutoRouter returned no response body", "EMPTY_RESPONSE");
		yield* translate(parseSse(response.body, onComment));
	}
};
/** Map a configured reasoning effort to a materialized default effort, if any. */
function effortDefault(effort) {
	if (effort === "off") return { defaultEffort: OFF_REASONING_EFFORT };
	if (effort === "low") return { defaultEffort: LOW_REASONING_EFFORT };
	if (effort === "high") return { defaultEffort: HIGH_REASONING_EFFORT };
	if (effort === "max") return { defaultEffort: MAX_REASONING_EFFORT };
	return {};
}
//#endregion
//#region src/index.ts
const name = "llm-autorouter";
const inject = ["llm"];
/** The provider route this plugin owns by default. */
const PROVIDER = "autorouter";
/** Settings namespace shared by the Host and browser halves. */
const SETTINGS_NS = settingsNamespace("llm-autorouter");
/** Credential-reference default; store the token under this name (web Models page / credentials service) or export it. */
const DEFAULT_API_KEY_ENV = "AUTOROUTER_API_KEY";
/** Default gateway origin; every deployment should override it. */
const DEFAULT_BASE_URL = "https://api.autorouter.top";
/** Environment variable naming the gateway origin; read when `baseURL` config is absent. */
const BASE_URL_ENV = "AUTOROUTER_BASE_URL";
const catalogModel = z.object({
	id: z.string().required(),
	name: z.string(),
	description: z.string(),
	contextWindow: z.number().step(1).min(1),
	maxTokens: z.number().step(1).min(1),
	inputModalities: z.array(z.union(["text", "image"]))
});
const Config = z.object({
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
	baseURL: z.string().default(DEFAULT_BASE_URL),
	providers: z.array(z.string()).default([PROVIDER]),
	thinking: z.union(["enabled", "disabled"]),
	reasoningEffort: z.union([
		"off",
		"low",
		"high",
		"max"
	]),
	defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
	models: z.array(catalogModel).default([]),
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
	discoveryTimeoutMs: z.number().step(1).min(1).default(DEFAULT_DISCOVERY_TIMEOUT_MS),
	retryPolicy: RetryPolicySchema
});
/** Resolve, validate, and detach the advisory model catalog. */
function resolveModels(models) {
	const seen = /* @__PURE__ */ new Set();
	return (models ?? []).map((model) => {
		if (model.id.length === 0) throw new Error("dsh-llm-autorouter: catalog model ids must be non-empty");
		if (model.name !== void 0 && model.name.length === 0) throw new Error(`dsh-llm-autorouter: catalog model "${model.id}" has an empty name`);
		if (model.contextWindow !== void 0 && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) throw new Error(`dsh-llm-autorouter: catalog model "${model.id}" contextWindow must be a positive integer`);
		if (model.maxTokens !== void 0 && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) throw new Error(`dsh-llm-autorouter: catalog model "${model.id}" maxTokens must be a positive integer`);
		const inputModalities = model.inputModalities === void 0 || model.inputModalities.length === 0 ? void 0 : model.inputModalities;
		if (inputModalities !== void 0) {
			for (const modality of inputModalities) if (modality !== "text" && modality !== "image") throw new Error(`dsh-llm-autorouter: catalog model "${model.id}" inputModalities must contain only "text" and "image"`);
		}
		if (seen.has(model.id)) throw new Error(`dsh-llm-autorouter: duplicate catalog model "${model.id}"`);
		seen.add(model.id);
		return {
			id: model.id,
			...model.name === void 0 ? {} : { name: model.name },
			...model.description === void 0 ? {} : { description: model.description },
			...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
			...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens },
			...inputModalities === void 0 ? {} : { inputModalities: [...inputModalities] }
		};
	});
}
/** Normalize the gateway origin: reject non-URLs, strip a trailing slash and any `/v1` suffix. */
function normalizeBaseUrl(baseURL) {
	let url;
	try {
		url = new URL(baseURL);
	} catch {
		throw new Error(`dsh-llm-autorouter: baseURL "${baseURL}" is not a valid URL`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`dsh-llm-autorouter: baseURL "${baseURL}" must use http or https`);
	let origin = baseURL.replace(/\/+$/, "");
	if (origin.endsWith("/v1")) origin = origin.slice(0, -3);
	return origin;
}
/**
* The one explicit resolve step from raw config to validated connection
* facts. Programmatic construction may bypass Schemastery normalization, so
* every default and bound is re-judged here (fail loud at load).
* @param config - raw plugin config or resolved settings snapshot.
* @returns validated connection facts plus the credential reference.
*/
function resolveAdapterOptions(config) {
	if (config.thinking === "disabled" && config.reasoningEffort !== void 0 && config.reasoningEffort !== "off") throw new Error("dsh-llm-autorouter: only reasoningEffort \"off\" can be configured when thinking is disabled");
	if (config.defaultContextWindow !== void 0 && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) throw new Error("dsh-llm-autorouter: defaultContextWindow must be a positive integer");
	const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? 3e5;
	if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`dsh-llm-autorouter: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	const discoveryTimeoutMs = config.discoveryTimeoutMs ?? 1e4;
	if (!Number.isInteger(discoveryTimeoutMs) || discoveryTimeoutMs <= 0) throw new Error("dsh-llm-autorouter: discoveryTimeoutMs must be a positive integer");
	return {
		apiKeyEnv: credentialRef(config.apiKeyEnv ?? "AUTOROUTER_API_KEY"),
		baseURL: normalizeBaseUrl(config.baseURL ?? process.env[BASE_URL_ENV] ?? "https://api.autorouter.top"),
		defaults: {
			thinking: config.thinking,
			reasoningEffort: config.reasoningEffort
		},
		defaultContextWindow: config.defaultContextWindow ?? 128e3,
		models: resolveModels(config.models),
		streamIdleTimeoutMs,
		discoveryTimeoutMs,
		retryPolicy: resolveRetryPolicy(config.retryPolicy, "dsh-llm-autorouter: retryPolicy")
	};
}
function apply(ctx, config) {
	let current = () => config;
	const options = () => resolveAdapterOptions(current());
	options();
	const resolveApiKey = async (connection) => {
		const ref = connection.apiKeyEnv;
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) {
			const hit = await credentials.resolve(ref);
			if (hit !== void 0) return assertUsableApiKey(hit.value, "dsh-llm-autorouter", ref);
		} else {
			const ambient = process.env[ref];
			if (ambient !== void 0 && ambient.length > 0) return assertUsableApiKey(ambient, "dsh-llm-autorouter", ref);
		}
		throw new LlmError(`dsh-llm-autorouter: no API key for provider route "${PROVIDER}"; store ${ref} through the credentials service, or export ${ref} in the launching environment`, "MISSING_CREDENTIAL");
	};
	const adapter = new AutorouterAdapter({
		options,
		resolveApiKey,
		resolveAttachments: () => ctx.get("attachments")
	});
	ctx.llm.registerConfigurableProviders([{
		provider: PROVIDER,
		displayName: "AutoRouter",
		settingsNs: SETTINGS_NS,
		settingsPath: []
	}]);
	ctx.llm.registerModelDiscovery(SETTINGS_NS, async (request) => {
		const currentOptions = options();
		const connection = request.baseURL === void 0 ? currentOptions : {
			...currentOptions,
			baseURL: normalizeBaseUrl(request.baseURL)
		};
		const apiKey = request.apiKey === void 0 ? await resolveApiKey(connection) : assertUsableApiKey(request.apiKey, "dsh-llm-autorouter", connection.apiKeyEnv);
		const timeout = AbortSignal.timeout(connection.discoveryTimeoutMs);
		return discoverModels(connection, apiKey, request.signal === void 0 ? timeout : AbortSignal.any([request.signal, timeout]));
	});
	ctx.inject(["webServer"], (webCtx) => {
		webCtx.effect(() => webCtx.webServer.register({
			kind: "exact",
			path: "/plugins/dsh-llm-autorouter/models",
			handler: async (request, response) => {
				if (request.method !== "POST") {
					response.writeHead(405, { allow: "POST" });
					response.end();
					return;
				}
				try {
					const connection = options();
					const models = await discoverGatewayModels(connection, await resolveApiKey(connection), AbortSignal.timeout(connection.discoveryTimeoutMs));
					response.writeHead(200, { "content-type": "application/json" });
					response.end(JSON.stringify({ models }));
				} catch (error) {
					response.writeHead(502, { "content-type": "application/json" });
					response.end(JSON.stringify({ error: error instanceof Error ? error.message : "AutoRouter model discovery failed" }));
				}
			}
		}), "llm-autorouter: model discovery route");
	});
	const registration = ctx.llm.registerAdapter(current().providers ?? ["autorouter"], adapter);
	const refreshRegistration = () => {
		registration.replace(current().providers ?? ["autorouter"]);
	};
	installSettingsSection(ctx, SETTINGS_NS, Config, config, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {
			options();
			refreshRegistration();
		},
		validate: (value) => {
			resolveAdapterOptions(value);
		}
	});
}
//#endregion
export { AutorouterAdapter, CHAT_COMPLETIONS_PATH, Config, DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, DEFAULT_CONTEXT_WINDOW, DEFAULT_DISCOVERY_TIMEOUT_MS, DEFAULT_STREAM_IDLE_TIMEOUT_MS, MODELS_PATH, PROVIDER, SETTINGS_NS, apply, inject, name, resolveAdapterOptions };
