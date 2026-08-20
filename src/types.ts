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
export interface WireRequest {
  model: string
  messages: WireMessage[]
  stream: true
  stream_options: { include_usage: true }
  /** Thinking-mode toggle (top level, NOT inside extra_body on the wire). */
  thinking?: { type: 'enabled' | 'disabled' }
  /** Thinking effort (official levels; relayed to DeepSeek-family channels). */
  reasoning_effort?: 'low' | 'high' | 'max'
  tools?: WireTool[]
  temperature?: number
  max_tokens?: number
  /**
   * Stop sequences (OpenAI `stop`): generation halts as soon as the model
   * produces any one of these strings. Mapped from `GenerateOptions.stop`.
   */
  stop?: string[]
}

/** System-role message: a single string of instructions. */
export interface WireSystemMessage {
  role: 'system'
  content: string
}

/** User-role message: a string when text-only, or OpenAI vision parts when images are present. */
export interface WireUserMessage {
  role: 'user'
  content: string | readonly WireUserContentPart[]
}

/** One OpenAI chat-completions user content part. */
export type WireUserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** Tool-role message: the result of one tool call, keyed by its call id. */
export interface WireToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

/** One entry of the request `messages` array, discriminated on `role`. */
export type WireMessage =
  | WireSystemMessage
  | WireUserMessage
  | WireAssistantMessage
  | WireToolMessage

/**
 * Assistant-role history message. The harness replays `content: ""` (never
 * null) on tool-call-only turns — some gateways reject null — and sends null
 * only when the turn carried neither text nor tool calls.
 */
export interface WireAssistantMessage {
  role: 'assistant'
  content: string | null
  /**
   * CoT passback. REQUIRED on assistant turns that carried tool calls
   * (thinking mode); ignored on tool-call-free turns (we omit it there to
   * save tokens).
   */
  reasoning_content?: string
  tool_calls?: WireToolCall[]
}

/** A completed tool call replayed on an assistant history message; `arguments` is the raw JSON string. */
export interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** One entry of the request `tools` array; `parameters` is a JSON Schema object. */
export interface WireTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** One parsed SSE `data:` payload (a chat.completion.chunk). */
export interface WireChunk {
  choices?: WireChoice[]
  /** Arrives attached to the finish chunk and/or as a trailing usage-only chunk. */
  usage?: WireUsage | null
}

/** One streamed choice (requests always ask for a single one); `finish_reason` is non-null only on its terminal chunk. */
export interface WireChoice {
  delta?: WireDelta
  finish_reason?: string | null
}

/** The incremental content of one streamed choice; any subset of fields may be present per chunk. */
export interface WireDelta {
  role?: string
  /** Visible text. Null/empty on reasoning/tool-call chunks. */
  content?: string | null
  /**
   * Thinking-mode CoT, relayed from DeepSeek-family channels. The FIRST chunk
   * carries an empty string (must not open a reasoning block); absent
   * entirely in non-thinking mode.
   */
  reasoning_content?: string | null
  tool_calls?: WireToolCallDelta[]
}

/** A streamed fragment of one tool call; fragments sharing an `index` concatenate into one call. */
export interface WireToolCallDelta {
  /** Disambiguates parallel tool calls; stable across a call's deltas. */
  index: number
  /** Present on the first delta of each call only. */
  id?: string
  type?: 'function'
  function?: {
    /** Present on the first delta of each call only. */
    name?: string
    /** Argument JSON fragment (concatenate across deltas). */
    arguments?: string
  }
}

/**
 * Wire token accounting. DeepSeek-family channels report `prompt_tokens`
 * INCLUDING cache hits (it equals `prompt_cache_hit_tokens +
 * prompt_cache_miss_tokens`); `mapUsage` subtracts them to keep the harness
 * convention of disjoint counts. `prompt_tokens_details.cached_tokens` is the
 * OpenAI-compat spelling of the hit count. Other channels report plain
 * prompt/completion counts without details.
 */
export interface WireUsage {
  prompt_tokens: number
  completion_tokens: number
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}

/** Non-2xx error body (OpenAI shape). */
export interface WireError {
  error?: { message?: string; type?: string; code?: string }
}

/** One entry of `GET {baseURL}/v1/models` (`data[].id` is the only required field). */
export interface WireModelEntry {
  id?: string
  object?: string
  created?: number
  owned_by?: string
  capabilities?: unknown
  input_modalities?: unknown
  inputModalities?: unknown
  /** Combined context capacity in tokens. */
  context_window?: unknown
  contextWindow?: unknown
  /** Per-request output cap in tokens. */
  max_output_tokens?: unknown
  maxOutputTokens?: unknown
}

/** `GET {baseURL}/v1/models` success body. */
export interface WireModelsResponse {
  success?: boolean
  object?: string
  data?: WireModelEntry[]
}
