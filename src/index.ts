/**
 * Register a {@link AutorouterAdapter} for the `autorouter` provider route on
 * `ctx.llm`, so the DeepSeek Harness routes model calls through an AutoRouter
 * (model routing gateway / relay) deployment. Connection facts are resolved
 * per request instead of frozen at load: the plugin's `cordis.yml` entry
 * config is the one source, a config edit hot-reloads the fiber (HMR) and
 * re-registers the route with the new facts, and the API key resolves through
 * the optional credential seam (`ctx.credentials`) with an environment
 * fallback, so a changed base URL, catalog, or key reaches the very next
 * request while an in-flight stream keeps the facts it started with.
 *
 * This package is the standalone, out-of-tree distribution of the adapter;
 * if it is merged into the community dsh repository it becomes
 * `@deepseek-ai/dsh-llm-autorouter` under `packages/llm/llm-autorouter`.
 * @module dsh-llm-autorouter
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-attachment'
import z from '@deepseek-ai/schemastery'
import { assertUsableApiKey, LlmError, resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { RetryPolicyConfig, ModelModality } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_DISCOVERY_TIMEOUT_MS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  AutorouterAdapter,
  discoverModels,
  discoverGatewayModels,
} from './adapter.ts'
import type { AutorouterCatalogModel, AutorouterConnectionOptions } from './adapter.ts'

export {
  CHAT_COMPLETIONS_PATH,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_DISCOVERY_TIMEOUT_MS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  MODELS_PATH,
  AutorouterAdapter,
} from './adapter.ts'
export type { AutorouterAdapterOptions, AutorouterCatalogModel, AutorouterConnectionOptions } from './adapter.ts'
export type { RequestDefaults } from './serialize.ts'
export type * from './types.ts'

export const name = 'llm-autorouter'
export const inject = ['llm']

/** The provider route this plugin owns by default. */
export const PROVIDER = 'autorouter'
/** Settings namespace shared by the Host and browser halves. */
export const SETTINGS_NS = settingsNamespace('llm-autorouter')
/** Credential-reference default; store the token under this name (web Models page / credentials service) or export it. */
export const DEFAULT_API_KEY_ENV = 'AUTOROUTER_API_KEY'
/** Default gateway origin; every deployment should override it. */
export const DEFAULT_BASE_URL = 'https://api.autorouter.top'
/** Environment variable naming the gateway origin; read when `baseURL` config is absent. */
const BASE_URL_ENV = 'AUTOROUTER_BASE_URL'

/**
 * Plugin config, validated by the same-named schemastery schema. Every field
 * is optional in yml: a missing API key resolves through
 * {@link Config.apiKeyEnv} at each request (a request without any key fails
 * with `MISSING_CREDENTIAL`, not at plugin load), omitted thinking mode and
 * reasoning effort stay neutral (nothing is put on the wire, so each upstream
 * keeps its own default), and the endpoint defaults to the local gateway.
 */
export interface Config {
  /** Credential reference (environment-variable name) resolved per request; defaults to `AUTOROUTER_API_KEY`. */
  apiKeyEnv?: string
  /** Gateway origin WITHOUT a trailing slash or `/v1`; the adapter appends `/v1/chat/completions`. Falls back to $AUTOROUTER_BASE_URL, then `https://api.autorouter.top`. */
  baseURL?: string
  /** Provider routes this adapter owns; defaults to `autorouter`. */
  providers?: string[]
  /** Deployment thinking policy; `disabled` limits every conversation request to `off`. Neutral (omitted) by default. */
  thinking?: 'enabled' | 'disabled'
  /** Default thinking effort; when set, it is materialized into every request that omits one. Neutral (omitted) by default. */
  reasoningEffort?: 'off' | 'low' | 'high' | 'max'
  /** Positive context capacity used when the selected model has no exact value (default 128,000). */
  defaultContextWindow?: number
  /** Saved model allowlist shown by chat selectors. */
  models?: AutorouterCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
  /** Per-listing network timeout for `/v1/models` (default 10 s). */
  discoveryTimeoutMs?: number
  /** Provider-owned model-request retry policy; omission uses normal defaults. */
  retryPolicy?: RetryPolicyConfig
}

const catalogModel: z<AutorouterCatalogModel> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  inputModalities: z.array(z.union(['text', 'image'])),
})

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(DEFAULT_BASE_URL),
  providers: z.array(z.string()).default([PROVIDER]),
  thinking: z.union(['enabled', 'disabled']),
  reasoningEffort: z.union(['off', 'low', 'high', 'max']),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
  models: z.array(catalogModel).default([]),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  discoveryTimeoutMs: z.number().step(1).min(1).default(DEFAULT_DISCOVERY_TIMEOUT_MS),
  retryPolicy: RetryPolicySchema,
})

/** Resolve, validate, and detach the advisory model catalog. */
function resolveModels(models: readonly AutorouterCatalogModel[] | undefined): AutorouterCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? []).map((model) => {
    if (model.id.length === 0) throw new Error('dsh-llm-autorouter: catalog model ids must be non-empty')
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`dsh-llm-autorouter: catalog model "${model.id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(
        `dsh-llm-autorouter: catalog model "${model.id}" contextWindow must be a positive integer`,
      )
    }
    if (model.maxTokens !== undefined
      && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(
        `dsh-llm-autorouter: catalog model "${model.id}" maxTokens must be a positive integer`,
      )
    }
    const inputModalities = model.inputModalities === undefined || model.inputModalities.length === 0
      ? undefined
      : model.inputModalities
    if (inputModalities !== undefined) {
      for (const modality of inputModalities) {
        if (modality !== 'text' && modality !== 'image') {
          throw new Error(
            `dsh-llm-autorouter: catalog model "${model.id}" inputModalities must contain only "text" and "image"`,
          )
        }
      }
    }
    if (seen.has(model.id)) throw new Error(`dsh-llm-autorouter: duplicate catalog model "${model.id}"`)
    seen.add(model.id)
    return {
      id: model.id,
      ...model.name === undefined ? {} : { name: model.name },
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      ...inputModalities === undefined ? {} : { inputModalities: [...inputModalities] as ModelModality[] },
    }
  })
}

/** Normalize the gateway origin: reject non-URLs, strip a trailing slash and any `/v1` suffix. */
function normalizeBaseUrl(baseURL: string): string {
  let url: URL
  try {
    url = new URL(baseURL)
  } catch {
    throw new Error(`dsh-llm-autorouter: baseURL "${baseURL}" is not a valid URL`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`dsh-llm-autorouter: baseURL "${baseURL}" must use http or https`)
  }
  let origin = baseURL.replace(/\/+$/, '')
  if (origin.endsWith('/v1')) origin = origin.slice(0, -3)
  return origin
}

/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every default and bound is re-judged here (fail loud at load).
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts plus the credential reference.
 */
export function resolveAdapterOptions(config: Config): AutorouterConnectionOptions {
  if (config.thinking === 'disabled'
    && config.reasoningEffort !== undefined
    && config.reasoningEffort !== 'off') {
    throw new Error('dsh-llm-autorouter: only reasoningEffort "off" can be configured when thinking is disabled')
  }
  if (config.defaultContextWindow !== undefined
    && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error('dsh-llm-autorouter: defaultContextWindow must be a positive integer')
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `dsh-llm-autorouter: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  const discoveryTimeoutMs = config.discoveryTimeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS
  if (!Number.isInteger(discoveryTimeoutMs) || discoveryTimeoutMs <= 0) {
    throw new Error('dsh-llm-autorouter: discoveryTimeoutMs must be a positive integer')
  }
  return {
    apiKeyEnv: credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV),
    baseURL: normalizeBaseUrl(config.baseURL ?? process.env[BASE_URL_ENV] ?? DEFAULT_BASE_URL),
    defaults: {
      thinking: config.thinking,
      reasoningEffort: config.reasoningEffort,
    },
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    models: resolveModels(config.models),
    streamIdleTimeoutMs,
    discoveryTimeoutMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'dsh-llm-autorouter: retryPolicy'),
  }
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  const options = (): AutorouterConnectionOptions => resolveAdapterOptions(current())
  options()

  const resolveApiKey = async (connection: AutorouterConnectionOptions): Promise<string> => {
    // Every credential fact comes from the caller's snapshot, so a rejected
    // settings generation cannot leak its key onto the previous endpoint.
    const ref = connection.apiKeyEnv
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined) return assertUsableApiKey(hit.value, 'dsh-llm-autorouter', ref)
    } else {
      // Without the seam there is no managed store to rank against, so the
      // environment is the whole credential plane.
      const ambient = process.env[ref]
      if (ambient !== undefined && ambient.length > 0) {
        return assertUsableApiKey(ambient, 'dsh-llm-autorouter', ref)
      }
    }
    throw new LlmError(
      `dsh-llm-autorouter: no API key for provider route "${PROVIDER}"; store ${ref} through the`
      + ` credentials service, or export ${ref} in the launching environment`,
      'MISSING_CREDENTIAL',
    )
  }

  const adapter = new AutorouterAdapter({
    options,
    resolveApiKey,
    resolveAttachments: () => ctx.get('attachments'),
  })
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'AutoRouter', settingsNs: SETTINGS_NS, settingsPath: [] },
  ])
  ctx.llm.registerModelDiscovery(SETTINGS_NS, async (request) => {
    const currentOptions = options()
    const connection = request.baseURL === undefined
      ? currentOptions
      : { ...currentOptions, baseURL: normalizeBaseUrl(request.baseURL) }
    const apiKey = request.apiKey === undefined
      ? await resolveApiKey(connection)
      : assertUsableApiKey(request.apiKey, 'dsh-llm-autorouter', connection.apiKeyEnv)
    const timeout = AbortSignal.timeout(connection.discoveryTimeoutMs)
    const signal = request.signal === undefined ? timeout : AbortSignal.any([request.signal, timeout])
    return discoverModels(connection, apiKey, signal)
  })
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/plugins/dsh-llm-autorouter/models',
      handler: async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        try {
          const connection = options()
          const apiKey = await resolveApiKey(connection)
          const models = await discoverGatewayModels(
            connection,
            apiKey,
            AbortSignal.timeout(connection.discoveryTimeoutMs),
          )
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ models }))
        } catch (error) {
          response.writeHead(502, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'AutoRouter model discovery failed' }))
        }
      },
    }), 'llm-autorouter: model discovery route')
  })
  const registration = ctx.llm.registerAdapter(current().providers ?? [PROVIDER], adapter)
  const refreshRegistration = (): void => {
    registration.replace(current().providers ?? [PROVIDER])
  }
  installSettingsSection(ctx, SETTINGS_NS, Config, config, {
    setSource: (source) => { current = source },
    onChange: () => {
      options()
      refreshRegistration()
    },
    validate: value => { resolveAdapterOptions(value) },
  })
}
