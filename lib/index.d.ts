import z from "@deepseek-ai/schemastery";
import { GenerateOptions, LlmAdapter, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, ModelModality, ResolvedRetryPolicy, RetryPolicyConfig, StreamChunk } from "@deepseek-ai/dsh-llm";
import { CredentialRef } from "@deepseek-ai/dsh-credentials";
import * as _deepseek_ai_dsh_settings0 from "@deepseek-ai/dsh-settings";
import { Context } from "@deepseek-ai/cordis";
import { AttachmentStore } from "@deepseek-ai/dsh-attachment";

//#region src/types.d.ts
/**
 * AutoRouter relay wire format (OpenAI-compatible chat completions). Types only.
 *
 * AutoRouter (the model routing gateway) is a passthrough relay: it reads an
 * OpenAI-format request, routes the model name to a configured channel
 * (DeepSeek / OpenAI / Claude / Gemini / …), converts per channel, and relays
 * OpenAI-compatible streaming chunks back. The DeepSeek-specific fields below
 * (`thinking`, `reasoning_effort`, `reasoning_content`, cache usage) are
 * relayed verbatim to DeepSeek-family channels and are simply absent from
 * other channels' streams, so the same serialization is safe across the whole
 * gateway.
 *
 * Wire vocabulary mirrors `@deepseek-ai/dsh-llm-deepseek/src/types.ts`.
 *
 * @module dsh-llm-autorouter/types
 */
/** Request body for `POST {baseURL}/v1/chat/completions`. */
interface WireRequest {
  model: string;
  messages: WireMessage[];
  stream: true;
  stream_options: {
    include_usage: true;
  };
  /** Thinking-mode toggle (top level, NOT inside extra_body on the wire). */
  thinking?: {
    type: 'enabled' | 'disabled';
  };
  /** Thinking effort (official levels; relayed to DeepSeek-family channels). */
  reasoning_effort?: 'low' | 'high' | 'max';
  tools?: WireTool[];
  temperature?: number;
  max_tokens?: number;
  /**
   * Stop sequences (OpenAI `stop`): generation halts as soon as the model
   * produces any one of these strings. Mapped from `GenerateOptions.stop`.
   */
  stop?: string[];
}
/** System-role message: a single string of instructions. */
interface WireSystemMessage {
  role: 'system';
  content: string;
}
/** User-role message: a string when text-only, or OpenAI vision parts when images are present. */
interface WireUserMessage {
  role: 'user';
  content: string | readonly WireUserContentPart[];
}
/** One OpenAI chat-completions user content part. */
type WireUserContentPart = {
  type: 'text';
  text: string;
} | {
  type: 'image_url';
  image_url: {
    url: string;
  };
};
/** Tool-role message: the result of one tool call, keyed by its call id. */
interface WireToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}
/** One entry of the request `messages` array, discriminated on `role`. */
type WireMessage = WireSystemMessage | WireUserMessage | WireAssistantMessage | WireToolMessage;
/**
 * Assistant-role history message. The harness replays `content: ""` (never
 * null) on tool-call-only turns — some gateways reject null — and sends null
 * only when the turn carried neither text nor tool calls.
 */
interface WireAssistantMessage {
  role: 'assistant';
  content: string | null;
  /**
   * CoT passback. REQUIRED on assistant turns that carried tool calls
   * (thinking mode); ignored on tool-call-free turns (we omit it there to
   * save tokens).
   */
  reasoning_content?: string;
  tool_calls?: WireToolCall[];
}
/** A completed tool call replayed on an assistant history message; `arguments` is the raw JSON string. */
interface WireToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}
/** One entry of the request `tools` array; `parameters` is a JSON Schema object. */
interface WireTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
/** One parsed SSE `data:` payload (a chat.completion.chunk). */
interface WireChunk {
  choices?: WireChoice[];
  /** Arrives attached to the finish chunk and/or as a trailing usage-only chunk. */
  usage?: WireUsage | null;
}
/** One streamed choice (requests always ask for a single one); `finish_reason` is non-null only on its terminal chunk. */
interface WireChoice {
  delta?: WireDelta;
  finish_reason?: string | null;
}
/** The incremental content of one streamed choice; any subset of fields may be present per chunk. */
interface WireDelta {
  role?: string;
  /** Visible text. Null/empty on reasoning/tool-call chunks. */
  content?: string | null;
  /**
   * Thinking-mode CoT, relayed from DeepSeek-family channels. The FIRST chunk
   * carries an empty string (must not open a reasoning block); absent
   * entirely in non-thinking mode.
   */
  reasoning_content?: string | null;
  tool_calls?: WireToolCallDelta[];
}
/** A streamed fragment of one tool call; fragments sharing an `index` concatenate into one call. */
interface WireToolCallDelta {
  /** Disambiguates parallel tool calls; stable across a call's deltas. */
  index: number;
  /** Present on the first delta of each call only. */
  id?: string;
  type?: 'function';
  function?: {
    /** Present on the first delta of each call only. */name?: string; /** Argument JSON fragment (concatenate across deltas). */
    arguments?: string;
  };
}
/**
 * Wire token accounting. DeepSeek-family channels report `prompt_tokens`
 * INCLUDING cache hits (it equals `prompt_cache_hit_tokens +
 * prompt_cache_miss_tokens`); `mapUsage` subtracts them to keep the harness
 * convention of disjoint counts. `prompt_tokens_details.cached_tokens` is the
 * OpenAI-compat spelling of the hit count. Other channels report plain
 * prompt/completion counts without details.
 */
interface WireUsage {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}
/** Non-2xx error body (OpenAI shape). */
interface WireError {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}
/** One entry of `GET {baseURL}/v1/models` (`data[].id` is the only required field). */
interface WireModelEntry {
  id?: string;
  object?: string;
  created?: number;
  owned_by?: string;
  capabilities?: unknown;
  input_modalities?: unknown;
  inputModalities?: unknown;
  /** Combined context capacity in tokens. */
  context_window?: unknown;
  contextWindow?: unknown;
  /** Per-request output cap in tokens. */
  max_output_tokens?: unknown;
  maxOutputTokens?: unknown;
}
/** `GET {baseURL}/v1/models` success body. */
interface WireModelsResponse {
  success?: boolean;
  object?: string;
  data?: WireModelEntry[];
}
//#endregion
//#region src/serialize.d.ts
/** Adapter-level request defaults (from plugin config). */
interface RequestDefaults {
  thinking?: 'enabled' | 'disabled' | undefined;
  reasoningEffort?: 'off' | 'low' | 'high' | 'max' | undefined;
}
//#endregion
//#region src/adapter.d.ts
/** One optional model entry advertised by the adapter (static catalog overlay). */
interface AutorouterCatalogModel {
  /** Wire model id accepted by the gateway. */
  id: string;
  /** Selector label; defaults to {@link id}. */
  name?: string;
  /** Optional selector detail for deployments with similar model variants. */
  description?: string;
  /** Known combined request/response context capacity; omitted when deployment metadata is unavailable. */
  contextWindow?: number;
  /** Per-request output cap for this model; omission leaves the provider default. */
  maxTokens?: number;
  /** Accepted request modalities; omission is treated as text-only. */
  inputModalities?: ModelModality[];
}
/**
 * Validated connection facts for one operation. The plugin's
 * `resolveAdapterOptions` is the one explicit resolve step producing this
 * shape; the adapter trusts it and re-reads it per operation, which is what
 * makes a configuration change reach the next request without re-registration.
 */
interface AutorouterConnectionOptions {
  /** Gateway origin WITHOUT a trailing slash or `/v1`; the adapter appends `/v1/chat/completions`. */
  baseURL: string;
  /**
   * Credential reference of this same resolution, resolved per request.
   * Travelling with the endpoint is the point: a request can never pair one
   * generation's URL with another generation's secret. Configuration carries
   * only this name — a literal key is not a configuration value.
   */
  apiKeyEnv: CredentialRef;
  /** Request defaults applied to every call (thinking mode, effort). */
  defaults: RequestDefaults;
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow: number;
  /** Saved model allowlist shown by chat selectors. */
  models: readonly AutorouterCatalogModel[];
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number;
  /** Per-listing network timeout for `/v1/models`. */
  discoveryTimeoutMs: number;
  /** Provider-owned model-request retry policy, already resolved. */
  retryPolicy: ResolvedRetryPolicy;
}
/** Constructor options for {@link AutorouterAdapter}: the operation-local resolution hooks the plugin owns. */
interface AutorouterAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => AutorouterConnectionOptions;
  /**
   * Resolve the bearer token for the connection facts of one request. The
   * snapshot is passed in — never re-read — so the key can only ever come
   * from the same resolution as the endpoint it is sent to. Throws `LlmError`
   * `MISSING_CREDENTIAL` when no key is available anywhere.
   */
  resolveApiKey: (connection: AutorouterConnectionOptions) => Promise<string>;
  /** Resolve the optional durable attachment service at request time. */
  resolveAttachments?: () => AttachmentStore | undefined;
}
/** The relay chat-completions route appended to the configured base URL. */
declare const CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
/** The model-listing route appended to the configured base URL. */
declare const MODELS_PATH = "/v1/models";
/** Default maximum idle interval while an adapter stream read is outstanding. */
declare const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300000;
/** Default combined request/response context capacity for unknown models. */
declare const DEFAULT_CONTEXT_WINDOW = 128000;
/** Default per-listing network timeout for `/v1/models`. */
declare const DEFAULT_DISCOVERY_TIMEOUT_MS = 10000;
/**
 * The first real `LlmAdapter`. One instance serves every model name it was
 * registered under (the gateway routes any listed model id).
 *
 * One stable signal reaches both initial fetch and body reads. Caller aborts
 * map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
 */
declare class AutorouterAdapter extends LlmAdapter {
  private readonly config;
  constructor(config: AutorouterAdapterOptions);
  providerInfo(provider: string): LlmProviderInfo;
  providerRetryPolicy(_provider: string): ResolvedRetryPolicy;
  listModels(provider: string): Promise<readonly LlmModelInfo[]>;
  resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
  private request;
}
//#endregion
//#region src/index.d.ts
declare const name = "llm-autorouter";
declare const inject: string[];
/** The provider route this plugin owns by default. */
declare const PROVIDER = "autorouter";
/** Settings namespace shared by the Host and browser halves. */
declare const SETTINGS_NS: _deepseek_ai_dsh_settings0.SettingsNamespace;
/** Credential-reference default; store the token under this name (web Models page / credentials service) or export it. */
declare const DEFAULT_API_KEY_ENV = "AUTOROUTER_API_KEY";
/** Default gateway origin; every deployment should override it. */
declare const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
/**
 * Plugin config, validated by the same-named schemastery schema. Every field
 * is optional in yml: a missing API key resolves through
 * {@link Config.apiKeyEnv} at each request (a request without any key fails
 * with `MISSING_CREDENTIAL`, not at plugin load), omitted thinking mode and
 * reasoning effort stay neutral (nothing is put on the wire, so each upstream
 * keeps its own default), and the endpoint defaults to the local gateway.
 */
interface Config {
  /** Credential reference (environment-variable name) resolved per request; defaults to `AUTOROUTER_API_KEY`. */
  apiKeyEnv?: string;
  /** Gateway origin WITHOUT a trailing slash or `/v1`; the adapter appends `/v1/chat/completions`. Falls back to $AUTOROUTER_BASE_URL, then `http://127.0.0.1:3000`. */
  baseURL?: string;
  /** Provider routes this adapter owns; defaults to `autorouter`. */
  providers?: string[];
  /** Deployment thinking policy; `disabled` limits every conversation request to `off`. Neutral (omitted) by default. */
  thinking?: 'enabled' | 'disabled';
  /** Default thinking effort; when set, it is materialized into every request that omits one. Neutral (omitted) by default. */
  reasoningEffort?: 'off' | 'low' | 'high' | 'max';
  /** Positive context capacity used when the selected model has no exact value (default 128,000). */
  defaultContextWindow?: number;
  /** Saved model allowlist shown by chat selectors. */
  models?: AutorouterCatalogModel[];
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number;
  /** Per-listing network timeout for `/v1/models` (default 10 s). */
  discoveryTimeoutMs?: number;
  /** Provider-owned model-request retry policy; omission uses normal defaults. */
  retryPolicy?: RetryPolicyConfig;
}
declare const Config: z<Config>;
/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every default and bound is re-judged here (fail loud at load).
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts plus the credential reference.
 */
declare function resolveAdapterOptions(config: Config): AutorouterConnectionOptions;
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { AutorouterAdapter, type AutorouterAdapterOptions, type AutorouterCatalogModel, type AutorouterConnectionOptions, CHAT_COMPLETIONS_PATH, Config, DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, DEFAULT_CONTEXT_WINDOW, DEFAULT_DISCOVERY_TIMEOUT_MS, DEFAULT_STREAM_IDLE_TIMEOUT_MS, MODELS_PATH, PROVIDER, type RequestDefaults, SETTINGS_NS, WireAssistantMessage, WireChoice, WireChunk, WireDelta, WireError, WireMessage, WireModelEntry, WireModelsResponse, WireRequest, WireSystemMessage, WireTool, WireToolCall, WireToolCallDelta, WireToolMessage, WireUsage, WireUserContentPart, WireUserMessage, apply, inject, name, resolveAdapterOptions };