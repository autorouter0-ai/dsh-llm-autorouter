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

import { attributionHeaders, CONTEXT_WINDOW_EXCEEDED_CODE, contentHasImage, isContextWindowExceededError, isQuotaExceededError, LlmAdapter, LlmError, ProviderRequestId, QUOTA_EXCEEDED_CODE, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmDiscoveredModel,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ModelModality,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { serializeRequest } from './serialize.ts'
import type { RequestDefaults } from './serialize.ts'
import { parseSse } from './sse.ts'
import { translate } from './translate.ts'
import type { WireError, WireModelEntry, WireModelsResponse } from './types.ts'

/** One optional model entry advertised by the adapter (static catalog overlay). */
export interface AutorouterCatalogModel {
  /** Wire model id accepted by the gateway. */
  id: string
  /** Selector label; defaults to {@link id}. */
  name?: string
  /** Optional selector detail for deployments with similar model variants. */
  description?: string
  /** Known combined request/response context capacity; omitted when deployment metadata is unavailable. */
  contextWindow?: number
  /** Per-request output cap for this model; omission leaves the provider default. */
  maxTokens?: number
  /** Accepted request modalities; omission is treated as text-only. */
  inputModalities?: ModelModality[]
}

/** One gateway model returned to the plugin-owned configuration card. */
export interface AutorouterDiscoveredModel {
  /** Model id accepted by the gateway. */
  id: string
  /** Gateway-advertised abilities used only to initialize card selection. */
  capabilities?: string[]
  /** Gateway-advertised request modalities; used when importing the catalog. */
  inputModalities?: readonly ModelModality[]
  /** Combined context capacity in tokens. */
  contextWindow?: number
  /** Per-request output cap in tokens. */
  maxTokens?: number
}

/**
 * Validated connection facts for one operation. The plugin's
 * `resolveAdapterOptions` is the one explicit resolve step producing this
 * shape; the adapter trusts it and re-reads it per operation, which is what
 * makes a configuration change reach the next request without re-registration.
 */
export interface AutorouterConnectionOptions {
  /** Gateway origin WITHOUT a trailing slash or `/v1`; the adapter appends `/v1/chat/completions`. */
  baseURL: string
  /**
   * Credential reference of this same resolution, resolved per request.
   * Travelling with the endpoint is the point: a request can never pair one
   * generation's URL with another generation's secret. Configuration carries
   * only this name — a literal key is not a configuration value.
   */
  apiKeyEnv: CredentialRef
  /** Request defaults applied to every call (thinking mode, effort). */
  defaults: RequestDefaults
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow: number
  /** Saved model allowlist shown by chat selectors. */
  models: readonly AutorouterCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number
  /** Per-listing network timeout for `/v1/models`. */
  discoveryTimeoutMs: number
  /** Provider-owned model-request retry policy, already resolved. */
  retryPolicy: ResolvedRetryPolicy
}

/** Constructor options for {@link AutorouterAdapter}: the operation-local resolution hooks the plugin owns. */
export interface AutorouterAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => AutorouterConnectionOptions
  /**
   * Resolve the bearer token for the connection facts of one request. The
   * snapshot is passed in — never re-read — so the key can only ever come
   * from the same resolution as the endpoint it is sent to. Throws `LlmError`
   * `MISSING_CREDENTIAL` when no key is available anywhere.
   */
  resolveApiKey: (connection: AutorouterConnectionOptions) => Promise<string>
  /** Resolve the optional durable attachment service at request time. */
  resolveAttachments?: () => AttachmentStore | undefined
}

/** The relay chat-completions route appended to the configured base URL. */
export const CHAT_COMPLETIONS_PATH = '/v1/chat/completions'
/** The model-listing route appended to the configured base URL. */
export const MODELS_PATH = '/v1/models'
/** Default maximum idle interval while an adapter stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/** Default combined request/response context capacity for unknown models. */
export const DEFAULT_CONTEXT_WINDOW = 128_000
/** Default per-listing network timeout for `/v1/models`. */
export const DEFAULT_DISCOVERY_TIMEOUT_MS = 10_000
/** Upper bound on live-discovered models, to bound memory for large gateways. */
export const MAX_DISCOVERED_MODELS = 1_000

const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'
const OFF_REASONING_EFFORT = ReasoningEffortId('off')
const LOW_REASONING_EFFORT = ReasoningEffortId('low')
const HIGH_REASONING_EFFORT = ReasoningEffortId('high')
const MAX_REASONING_EFFORT = ReasoningEffortId('max')
const REASONING_EFFORTS = [
  { id: OFF_REASONING_EFFORT, name: 'Off' },
  { id: LOW_REASONING_EFFORT, name: 'Low' },
  { id: HIGH_REASONING_EFFORT, name: 'High' },
  { id: MAX_REASONING_EFFORT, name: 'Max' },
] as const
const OFF_ONLY_REASONING_EFFORTS = [
  { id: OFF_REASONING_EFFORT, name: 'Off' },
] as const

function modelInfo(provider: string, model: AutorouterCatalogModel): LlmModelInfo {
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    ...model.description === undefined ? {} : { description: model.description },
    inputModalities: model.inputModalities === undefined ? ['text'] : [...model.inputModalities],
  }
}

function providerRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined
  if (/^\d+$/.test(value)) {
    const delay = Number(value) * 1_000
    return Number.isFinite(delay) && delay > 0 ? delay : undefined
  }
  const delay = Date.parse(value) - Date.now()
  return Number.isFinite(delay) && delay > 0 ? delay : undefined
}

function requestId(headers: Headers): ReturnType<typeof ProviderRequestId> | undefined {
  const value = headers.get('x-request-id')
  return value === null || value.length === 0 ? undefined : ProviderRequestId(value)
}

/**
 * Map an HTTP status to a stable LlmError code.
 * @param status - status of a non-2xx provider response.
 * @param error - parsed provider error body, when available.
 * @returns the normalized harness error code.
 */
export function httpErrorCode(status: number, error?: WireError['error']): string {
  if (status === 401 || status === 403) return 'AUTH'
  const detail = [error?.code, error?.type, error?.message].filter(Boolean).join(' ')
  if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE
  if (status === 429) return 'RATE_LIMIT'
  if (status === 400) {
    if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE
    return 'INVALID_REQUEST'
  }
  if (status >= 500) return 'SERVER'
  return `HTTP_${status}`
}

/** Normalize common gateway capability encodings from an untrusted model-listing row. */
function capabilitiesOf(value: unknown): string[] | undefined {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : value !== null && typeof value === 'object'
        ? Object.entries(value).flatMap(([capability, enabled]) => enabled === true ? [capability] : [])
        : []
  const capabilities = [...new Set(raw.filter(capability => typeof capability === 'string' && capability.length > 0))]
  return capabilities.length === 0 ? undefined : capabilities
}

/** Read OpenAI-style `input_modalities` (or camelCase) from an untrusted listing row. */
function inputModalitiesOf(entry: WireModelEntry): ModelModality[] | undefined {
  const raw = entry.input_modalities ?? entry.inputModalities
  if (!Array.isArray(raw)) return undefined
  const modalities = [...new Set(raw.filter((value): value is ModelModality => value === 'text' || value === 'image'))]
  return modalities.length === 0 ? undefined : modalities
}

/**
 * Read a positive token count from an untrusted gateway listing field.
 * Invalid or missing values are omitted.
 */
function positiveTokenCount(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined
  const tokens = Math.round(raw)
  return tokens > 0 ? tokens : undefined
}

/** Read the gateway's authenticated OpenAI-compatible model listing. */
export async function discoverGatewayModels(
  connection: AutorouterConnectionOptions,
  apiKey: string,
  signal?: AbortSignal,
): Promise<readonly AutorouterDiscoveredModel[]> {
  const response = await fetch(`${connection.baseURL}${MODELS_PATH}`, {
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'accept': 'application/json',
      ...attributionHeaders(),
    },
    ...signal === undefined ? {} : { signal },
  })
  if (!response.ok) {
    throw new LlmError(
      `AutoRouter models listing failed (HTTP ${response.status})`,
      httpErrorCode(response.status),
    )
  }
  const body = await response.json() as WireModelsResponse
  return (body.data ?? [])
    .filter((entry): entry is WireModelEntry & { id: string } => typeof entry.id === 'string' && entry.id.length > 0)
    .slice(0, MAX_DISCOVERED_MODELS)
    .map((entry) => {
      const capabilities = capabilitiesOf(entry.capabilities)
      const inputModalities = inputModalitiesOf(entry)
      const contextWindow = positiveTokenCount(entry.context_window ?? entry.contextWindow)
      const maxTokens = positiveTokenCount(entry.max_output_tokens ?? entry.maxOutputTokens)
      return {
        id: entry.id,
        ...capabilities === undefined ? {} : { capabilities },
        ...inputModalities === undefined ? {} : { inputModalities },
        ...contextWindow === undefined ? {} : { contextWindow },
        ...maxTokens === undefined ? {} : { maxTokens },
      }
    })
}

/** Project a gateway listing onto the generic discovery fields. */
export async function discoverModels(
  connection: AutorouterConnectionOptions,
  apiKey: string,
  signal?: AbortSignal,
): Promise<readonly LlmDiscoveredModel[]> {
  return (await discoverGatewayModels(connection, apiKey, signal)).map(({ id }) => ({ id }))
}

/**
 * The first real `LlmAdapter`. One instance serves every model name it was
 * registered under (the gateway routes any listed model id).
 *
 * One stable signal reaches both initial fetch and body reads. Caller aborts
 * map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
 */
export class AutorouterAdapter extends LlmAdapter {
  constructor(private readonly config: AutorouterAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'AutoRouter' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return this.config.options().retryPolicy
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const connection = this.config.options()
    return Promise.resolve(connection.models.map(model => modelInfo(provider, model)))
  }

  override resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const connection = this.config.options()
    const configured = connection.models.find(entry => entry.id === model)
    const contextWindow = configured?.contextWindow
      ?? connection.defaultContextWindow
    return Promise.resolve({
      // Uncatalogued ids stay text-only until imported with gateway
      // `input_modalities`; "unknown" would let the host accept images the
      // user never opted into for that id.
      ...configured === undefined
        ? { provider, id: model, name: model, inputModalities: ['text' as const] }
        : modelInfo(provider, configured),
      context: { contextWindow },
      ...configured?.maxTokens !== undefined ? { defaultMaxTokens: configured.maxTokens } : {},
      // Neutral by default: no default effort is materialized, so the relay
      // keeps each upstream's own thinking default until the deployment
      // configures `thinking` / `reasoningEffort`.
      reasoning: connection.defaults.thinking === 'disabled'
        ? { efforts: OFF_ONLY_REASONING_EFFORTS, defaultEffort: OFF_REASONING_EFFORT }
        : {
          efforts: REASONING_EFFORTS,
          ...effortDefault(connection.defaults.reasoningEffort),
        },
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // One resolution per stream call: connection facts and the credential
    // freeze here and hold for this whole request, so an in-flight stream
    // never observes a configuration change and the next call re-resolves.
    // The key resolves *from this snapshot*, so an endpoint and the secret
    // sent to it can never come from different configuration generations.
    const connection = this.config.options()
    const apiKey = await this.config.resolveApiKey(connection)
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    using watchdog = idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
    const iterator = this.request(
      options,
      watchdog.signal,
      connection,
      apiKey,
      () => { watchdog.pulse() },
    )[Symbol.asyncIterator]()
    let exhausted = false
    try {
      while (true) {
        const result = await watchdog.next(iterator)
        if (result.done) {
          exhausted = true
          return
        }
        yield result.value
      }
    } catch (error: unknown) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(
          `AutoRouter stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          'TIMEOUT',
          { cause: error },
        )
      }
      if (options.signal?.aborted) {
        throw new LlmError('AutoRouter request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`AutoRouter stream from ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    } finally {
      consumer.abort('AutoRouter stream consumer stopped')
      if (!exhausted && iterator.return !== undefined) {
        try {
          await iterator.return()
        } catch (_abortedTransportTeardown) {
          // The consumer controller already owns termination; a return-time abort cannot add a second outcome.
        }
      }
    }
  }

  private async * request(
    options: GenerateOptions,
    signal: AbortSignal,
    connection: AutorouterConnectionOptions,
    apiKey: string,
    onComment: () => void,
  ): AsyncIterable<StreamChunk> {
    const body = await serializeRequest(
      options,
      connection.defaults,
      contentHasImage(options.messages.flatMap(message => message.content))
        ? this.config.resolveAttachments?.()
        : undefined,
    )
    // Prepared outside the try so the TRANSPORT label below covers exactly the
    // transport boundary, never a serialization failure.
    const payload = JSON.stringify(body)
    const headers = {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'accept': 'text/event-stream',
      ...attributionHeaders(),
    }

    let response: Response
    try {
      response = await fetch(`${connection.baseURL}${CHAT_COMPLETIONS_PATH}`, {
        method: 'POST',
        headers,
        body: payload,
        signal,
      })
    } catch (error: unknown) {
      // The outer stream distinguishes caller cancellation and watchdog expiry.
      if (signal.aborted) throw error
      // fetch wraps every transport failure (DNS, refused connection, TLS,
      // proxy) in a bare `TypeError: fetch failed` whose actionable detail
      // lives on `cause`. Wrapping with the endpoint and chaining the cause
      // lets `errorChain` render the full diagnosis at every reporting boundary.
      throw new LlmError(
        `AutoRouter request to ${connection.baseURL} failed`,
        'TRANSPORT',
        { cause: error },
      )
    }

    if (!response.ok) {
      let message = `AutoRouter error (HTTP ${response.status})`
      let providerError: WireError['error']
      try {
        const parsed = await response.json() as WireError
        providerError = parsed.error
        if (providerError?.message) message = providerError.message
      } catch {
        // Only swallow error-body parsing: the HTTP status still identifies the
        // failure, so malformed gateway JSON must not mask it.
      }
      const delay = providerRetryAfterMs(response.headers.get('retry-after'))
      const id = requestId(response.headers)
      throw new LlmError(message, httpErrorCode(response.status, providerError), {
        status: response.status,
        ...delay === undefined ? {} : { providerRetryAfterMs: delay },
        ...id === undefined ? {} : { requestId: id },
      })
    }
    if (!response.body) {
      throw new LlmError('AutoRouter returned no response body', 'EMPTY_RESPONSE')
    }

    yield* translate(parseSse(response.body, onComment))
  }
}

/** Map a configured reasoning effort to a materialized default effort, if any. */
function effortDefault(
  effort: NonNullable<RequestDefaults['reasoningEffort']> | undefined,
): { defaultEffort: ReturnType<typeof ReasoningEffortId> } | Record<string, never> {
  if (effort === 'off') return { defaultEffort: OFF_REASONING_EFFORT }
  if (effort === 'low') return { defaultEffort: LOW_REASONING_EFFORT }
  if (effort === 'high') return { defaultEffort: HIGH_REASONING_EFFORT }
  if (effort === 'max') return { defaultEffort: MAX_REASONING_EFFORT }
  return {}
}
