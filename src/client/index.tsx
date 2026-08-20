/** Browser configuration card for the AutoRouter provider. */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-web-react'
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Config } from '../index.ts'
import { ensureCardStyles } from './card.css.ts'
import { en, zh, type LocaleKey } from './locales.ts'

const SETTINGS_NS = 'llm-autorouter'
const LOCALE_NS = 'llm-autorouter'
const DEFAULT_BASE_URL = 'http://127.0.0.1:3000'
const DEFAULT_API_KEY_ENV = 'AUTOROUTER_API_KEY'
const UNLABELLED = 'unlabelled'

const CAPABILITY_KEY: Readonly<Record<string, LocaleKey>> = {
  chat: 'capChat',
  'image-generation': 'capImage',
  'video-generation': 'capVideo',
  [UNLABELLED]: 'capUnlabelled',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** AutoRouter Plugins card copy. */
    'llm-autorouter': LocaleKey
  }
}

/** Required browser services. */
export const inject = ['slots', 'connection', 'settingsScope', 'locale']

type Translate = TranslateNS<'llm-autorouter'>

interface Injected {
  scope: SettingsScope<Config>
  useSnapshot: SnapshotSelectorHook<SettingsScopeSnapshot<Config>>
  api: ConnectionHandle['api']
  t: Translate
}

type Candidate = {
  id: string
  name?: string
  capabilities?: string[]
  inputModalities?: readonly ('text' | 'image')[]
  contextWindow?: number
  maxTokens?: number
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function asCandidate(model: unknown): model is Candidate {
  if (typeof model !== 'object' || model === null || typeof (model as { id?: unknown }).id !== 'string') {
    return false
  }
  const row = model as {
    inputModalities?: unknown
    contextWindow?: unknown
    maxTokens?: unknown
  }
  if (row.contextWindow !== undefined && !isPositiveInt(row.contextWindow)) return false
  if (row.maxTokens !== undefined && !isPositiveInt(row.maxTokens)) return false
  if (row.inputModalities === undefined) return true
  return Array.isArray(row.inputModalities)
    && row.inputModalities.every((value): value is 'text' | 'image' => value === 'text' || value === 'image')
}

interface ModelGroup {
  capability: string
  models: readonly Candidate[]
}

type ConnectionFlash =
  | { kind: 'ok'; key: 'saved' }
  | { kind: 'error'; detail: string }

type CatalogFlash =
  | { kind: 'ok'; key: 'discovered'; count: number }
  | { kind: 'ok'; key: 'imported'; count: number }
  | { kind: 'ok'; key: 'cleared' }
  | { kind: 'ok'; key: 'noModels' }
  | { kind: 'error'; detail: string; area: 'discover' | 'import' }

/** Map a catalog flash to the toolbar or import footer that should show it. */
function catalogFlashArea(flash: CatalogFlash): 'discover' | 'import' {
  if (flash.kind === 'error') return flash.area
  return flash.key === 'imported' ? 'import' : 'discover'
}

/** Render catalog flash copy for the active locale. */
function catalogFlashText(flash: CatalogFlash, t: Translate): string {
  if (flash.kind === 'error') return flash.detail
  if (flash.key === 'noModels') return t('noModels')
  if (flash.key === 'cleared') return t('cleared')
  if (flash.key === 'discovered') return t('discovered', { count: flash.count })
  return t('imported', { count: flash.count })
}

const GROUP_PRIORITY: Readonly<Record<string, number>> = {
  chat: 0,
  'image-generation': 1,
  'video-generation': 2,
}

/** Group models by gateway-advertised capability, retaining unlabelled models. */
function groupModels(models: readonly Candidate[]): readonly ModelGroup[] {
  const groups = new Map<string, Candidate[]>()
  for (const model of models) {
    const capabilities = model.capabilities?.length === 0 ? undefined : model.capabilities
    for (const capability of capabilities ?? [UNLABELLED]) {
      const group = groups.get(capability)
      if (group === undefined) groups.set(capability, [model])
      else group.push(model)
    }
  }
  return [...groups]
    .map(([capability, members]) => ({ capability, models: members }))
    .sort((left, right) => (GROUP_PRIORITY[left.capability] ?? Number.MAX_SAFE_INTEGER)
      - (GROUP_PRIORITY[right.capability] ?? Number.MAX_SAFE_INTEGER)
      || left.capability.localeCompare(right.capability))
}

function capabilityLabel(t: Translate, capability: string): string {
  const key = CAPABILITY_KEY[capability]
  return key === undefined ? capability : t(key)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function matchesQuery(model: Candidate, query: string): boolean {
  if (query.length === 0) return true
  const haystack = `${model.id} ${model.name ?? ''}`.toLowerCase()
  return haystack.includes(query)
}

/**
 * Pre-check models already saved in the catalog after a refresh. The first
 * fetch with an empty catalog still defaults to every chat-capable candidate.
 */
function initialSelection(
  models: readonly Candidate[],
  importedIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const retained = models.filter(model => importedIds.has(model.id)).map(model => model.id)
  if (retained.length > 0) return new Set(retained)
  return new Set(models.filter(model => model.capabilities?.includes('chat') === true).map(model => model.id))
}

/** Chevron matching the in-tree Plugins accordion. */
function Chevron(): ReactNode {
  return (
    <svg className="dsh-autorouter-chevron" width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Checkbox for a capability group, including the partial-selection state. */
function GroupCheckbox({ checked, partial, disabled, onChange }: {
  checked: boolean
  partial: boolean
  disabled: boolean
  onChange: () => void
}): ReactNode {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (input.current !== null) input.current.indeterminate = partial }, [partial])
  return <input ref={input} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
}

/** Render the AutoRouter provider configuration card. */
function AutorouterCard({ scope, useSnapshot, api, t }: Injected): ReactNode {
  const snapshot = useSnapshot(value => value)
  const config = snapshot.value as Config | undefined
  const storedBaseURL = config?.baseURL ?? DEFAULT_BASE_URL
  const apiKeyEnv = config?.apiKeyEnv ?? DEFAULT_API_KEY_ENV
  const userLayer = asRecord(snapshot.user)
  const baseLayer = asRecord(snapshot.base)
  const overridden = userLayer !== undefined && Object.hasOwn(userLayer, 'baseURL')
  const [open, setOpen] = useState(false)
  const [baseURLDraft, setBaseURLDraft] = useState(storedBaseURL)
  const [resetBaseURL, setResetBaseURL] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyConfigured, setKeyConfigured] = useState(false)
  const [keyWritable, setKeyWritable] = useState(true)
  const [candidates, setCandidates] = useState<readonly Candidate[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [connectionMessage, setConnectionMessage] = useState<ConnectionFlash | undefined>(undefined)
  const [catalogMessage, setCatalogMessage] = useState<CatalogFlash | undefined>(undefined)

  useEffect(() => { ensureCardStyles() }, [])
  useEffect(() => {
    if (!resetBaseURL) setBaseURLDraft(storedBaseURL)
  }, [storedBaseURL, resetBaseURL])

  const refreshCredential = async (): Promise<void> => {
    try {
      const response = await api.credentials.describe({ refs: [apiKeyEnv] })
      if (!response.result.ok) return
      const view = response.result.value.credentials[apiKeyEnv]
      setKeyConfigured(view?.configured ?? false)
      setKeyWritable(view?.writable ?? true)
    } catch (_credentialReadFailure) {
      // Advisory only: the key control stays usable and a write still reaches the Host.
    }
  }

  useEffect(() => {
    let stale = false
    void api.credentials.describe({ refs: [apiKeyEnv] }).then(
      (response) => {
        if (stale || !response.result.ok) return
        const view = response.result.value.credentials[apiKeyEnv]
        setKeyConfigured(view?.configured ?? false)
        setKeyWritable(view?.writable ?? true)
      },
      () => undefined,
    )
    return () => { stale = true }
  }, [api.credentials, apiKeyEnv])

  const trimmedBaseURL = baseURLDraft.trim()
  const dirty = resetBaseURL || trimmedBaseURL !== storedBaseURL || keyDraft.trim().length > 0
  const disabled = !snapshot.writable || busy
  const filter = query.trim().toLowerCase()

  const persistConnection = async (): Promise<void> => {
    if (resetBaseURL || trimmedBaseURL.length === 0) await scope.unset('baseURL')
    else if (trimmedBaseURL !== storedBaseURL) await scope.set('baseURL', trimmedBaseURL)
    setResetBaseURL(false)
    if (keyDraft.trim().length > 0) {
      const response = await api.credentials.set({ ref: apiKeyEnv, value: keyDraft.trim() })
      if (!response.result.ok) throw new Error(response.result.error.message)
      setKeyDraft('')
    }
    await refreshCredential()
  }

  const runConnection = async (action: () => Promise<ConnectionFlash | undefined>): Promise<void> => {
    setBusy(true)
    setFailed(false)
    setConnectionMessage(undefined)
    try {
      const flash = await action()
      if (flash !== undefined) setConnectionMessage(flash)
    } catch (error) {
      setFailed(true)
      setConnectionMessage({
        kind: 'error',
        detail: error instanceof Error ? error.message : t('operationFailed'),
      })
    } finally {
      setBusy(false)
    }
  }

  const runCatalog = async (
    area: 'discover' | 'import',
    action: () => Promise<CatalogFlash | undefined>,
  ): Promise<void> => {
    setBusy(true)
    setCatalogMessage(undefined)
    try {
      const flash = await action()
      if (flash !== undefined) setCatalogMessage(flash)
    } catch (error) {
      setCatalogMessage({
        kind: 'error',
        area,
        detail: error instanceof Error ? error.message : t('operationFailed'),
      })
    } finally {
      setBusy(false)
    }
  }

  const save = (): void => {
    void runConnection(async () => {
      await persistConnection()
      return { kind: 'ok', key: 'saved' }
    })
  }

  const discard = (): void => {
    setBaseURLDraft(storedBaseURL)
    setResetBaseURL(false)
    setKeyDraft('')
    setFailed(false)
    setConnectionMessage(undefined)
  }

  const resetField = (): void => {
    const inherited = typeof baseLayer?.baseURL === 'string' && baseLayer.baseURL.length > 0
      ? baseLayer.baseURL
      : DEFAULT_BASE_URL
    setBaseURLDraft(inherited)
    setResetBaseURL(true)
    setFailed(false)
  }

  const discover = (): void => {
    void runCatalog('discover', async () => {
      await persistConnection()
      const response = await fetch('/plugins/dsh-llm-autorouter/models', { method: 'POST' })
      const body = await response.json() as { models?: unknown; error?: unknown }
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : t('discoverFailed'))
      const models = Array.isArray(body.models) ? body.models.filter(asCandidate) : []
      setCandidates(models)
      setSelected(initialSelection(models, new Set((config?.models ?? []).map(model => model.id))))
      setQuery('')
      return models.length === 0
        ? { kind: 'ok', key: 'noModels' }
        : { kind: 'ok', key: 'discovered', count: models.length }
    })
  }

  const importModels = (): void => {
    void runCatalog('import', async () => {
      await persistConnection()
      const imported = candidates.filter(model => selected.has(model.id))
      await scope.set('models', imported.map(model => ({
        id: model.id,
        ...model.name === undefined ? {} : { name: model.name },
        ...model.inputModalities !== undefined && model.inputModalities.length > 0
          ? { inputModalities: [...model.inputModalities] }
          : {},
        ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
        ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      })))
      return imported.length === 0
        ? { kind: 'ok', key: 'cleared' }
        : { kind: 'ok', key: 'imported', count: imported.length }
    })
  }

  const toggle = (id: string): void => {
    setSelected(current => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  const toggleGroup = (models: readonly Candidate[]): void => {
    const ids = models.map(model => model.id)
    setSelected(current => {
      const next = new Set(current)
      const allSelected = ids.every(id => next.has(id))
      for (const id of ids) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  if (snapshot.status !== 'ready') return null
  const title = t('title')
  const discoverStatus = catalogMessage !== undefined && catalogFlashArea(catalogMessage) === 'discover'
    ? catalogMessage
    : undefined
  const importStatus = catalogMessage !== undefined && catalogFlashArea(catalogMessage) === 'import'
    ? catalogMessage
    : undefined
  return (
    <li className={`dsh-autorouter${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="dsh-autorouter-header"
        aria-expanded={open}
        aria-label={t(open ? 'collapse' : 'expand', { title })}
        onClick={() => { setOpen(!open) }}
      >
        <span className="dsh-autorouter-head-text">
          <span className="dsh-autorouter-name">{title}</span>
          <span className="dsh-autorouter-description">{t('description')}</span>
        </span>
        {dirty ? <span className="dsh-autorouter-pending">{t('unsaved')}</span> : null}
        <Chevron />
      </button>
      {open
        ? (
          <div className="dsh-autorouter-body">
            {!snapshot.writable
              ? <p className="dsh-autorouter-readonly" role="status">{t('readOnly')}</p>
              : null}
            <div className="dsh-autorouter-field">
              <div className="dsh-autorouter-field-head">
                <label className="dsh-autorouter-label" htmlFor="autorouter-api-key">{t('apiKey')}</label>
                <span className="dsh-autorouter-badges">
                  <span className={`dsh-autorouter-badge${keyConfigured ? '' : ' is-muted'}`}>
                    {keyConfigured ? t('apiKeySet') : t('apiKeyUnset')}
                  </span>
                </span>
              </div>
              <input
                id="autorouter-api-key"
                className="dsh-autorouter-input"
                type="password"
                autoComplete="off"
                value={keyDraft}
                disabled={!keyWritable || busy}
                onChange={event => setKeyDraft(event.target.value)}
              />
              <p className="dsh-autorouter-hint">{keyWritable ? t('apiKeyHint') : t('apiKeyLocked', { ref: apiKeyEnv })}</p>
            </div>
            <div className="dsh-autorouter-field">
              <div className="dsh-autorouter-field-head">
                <label className="dsh-autorouter-label" htmlFor="autorouter-base-url">{t('baseUrl')}</label>
                {overridden || resetBaseURL
                  ? (
                    <span className="dsh-autorouter-badges">
                      <span className="dsh-autorouter-badge">{t('overridden')}</span>
                      <button type="button" className="dsh-autorouter-reset" disabled={disabled} onClick={resetField}>
                        {t('reset')}
                      </button>
                    </span>
                  )
                  : null}
              </div>
              <input
                id="autorouter-base-url"
                className="dsh-autorouter-input"
                value={baseURLDraft}
                disabled={disabled}
                onChange={(event) => {
                  setBaseURLDraft(event.target.value)
                  setResetBaseURL(false)
                }}
              />
              <p className="dsh-autorouter-hint">{t('baseUrlHint')}</p>
            </div>
            <div className="dsh-autorouter-footer">
              {failed
                ? <p className="dsh-autorouter-status is-error" role="status">{t('saveFailed')}</p>
                : connectionMessage === undefined ? null : (
                  <p
                    className={`dsh-autorouter-status${connectionMessage.kind === 'error' ? ' is-error' : ' is-ok'}`}
                    role="status"
                  >
                    {connectionMessage.kind === 'error' ? connectionMessage.detail : t(connectionMessage.key)}
                  </p>
                )}
              <button type="button" className="dsh-autorouter-btn is-ghost" disabled={!dirty || busy} onClick={discard}>
                {t('discard')}
              </button>
              <button type="button" className="dsh-autorouter-btn is-primary" disabled={!dirty || busy} onClick={save}>
                {t('save')}
              </button>
            </div>
            <div className="dsh-autorouter-toolbar">
              {discoverStatus === undefined
                ? <p className="dsh-autorouter-hint">{t('discoverHint')}</p>
                : (
                  <p
                    className={`dsh-autorouter-status${discoverStatus.kind === 'error' ? ' is-error' : ' is-ok'}`}
                    role="status"
                  >
                    {catalogFlashText(discoverStatus, t)}
                  </p>
                )}
              <div className="dsh-autorouter-toolbar-actions">
                <button type="button" className="dsh-autorouter-btn is-ghost" disabled={busy} onClick={discover}>
                  {t('discover')}
                </button>
              </div>
            </div>
            {candidates.length === 0 ? null : (
              <section className="dsh-autorouter-models" aria-label={t('catalog')}>
                <div className="dsh-autorouter-models-head">
                  <h3 className="dsh-autorouter-models-title">{t('catalog')}</h3>
                  <span className="dsh-autorouter-models-meta">
                    {t('selectedCount', { selected: selected.size, total: candidates.length })}
                  </span>
                </div>
                <input
                  className="dsh-autorouter-search"
                  type="search"
                  placeholder={t('filterPlaceholder')}
                  value={query}
                  disabled={busy}
                  onChange={event => setQuery(event.target.value)}
                />
                {groupModels(candidates).map((group) => {
                  const visible = group.models.filter(model => matchesQuery(model, filter))
                  if (visible.length === 0) return null
                  const selectedCount = visible.filter(model => selected.has(model.id)).length
                  const groupSelected = selectedCount === visible.length
                  const name = capabilityLabel(t, group.capability)
                  return (
                    <section key={group.capability} className="dsh-autorouter-group" aria-label={t('groupAria', { name })}>
                      <label className="dsh-autorouter-group-head">
                        <GroupCheckbox
                          checked={groupSelected}
                          partial={selectedCount > 0 && !groupSelected}
                          disabled={disabled}
                          onChange={() => toggleGroup(visible)}
                        />
                        {name}
                        <span className="dsh-autorouter-badge">{visible.length}</span>
                      </label>
                      <ul className="dsh-autorouter-list">
                        {visible.map(model => (
                          <li key={model.id}>
                            <label className="dsh-autorouter-model">
                              <input type="checkbox" checked={selected.has(model.id)} disabled={disabled} onChange={() => toggle(model.id)} />
                              <span className="dsh-autorouter-model-text">
                                <span>{model.name ?? model.id}</span>
                                {model.name === undefined ? null : <span className="dsh-autorouter-model-id">{model.id}</span>}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                })}
                <div className="dsh-autorouter-footer">
                  {importStatus === undefined
                    ? selected.size === 0 && candidates.length > 0
                      ? <p className="dsh-autorouter-hint">{t('importClearHint')}</p>
                      : null
                    : (
                      <p
                        className={`dsh-autorouter-status${importStatus.kind === 'error' ? ' is-error' : ' is-ok'}`}
                        role="status"
                      >
                        {catalogFlashText(importStatus, t)}
                      </p>
                    )}
                  <button
                    type="button"
                    className="dsh-autorouter-btn is-primary"
                    disabled={disabled}
                    onClick={importModels}
                  >
                    {t('importSelected')}
                  </button>
                </div>
              </section>
            )}
          </div>
        )
        : null}
    </li>
  )
}

/** Register the AutoRouter card after the generic plugin-configuration tab exists. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-llm-autorouter: dictionaries')
  const scope = ctx.settingsScope.bind<Config>({ namespace: SETTINGS_NS })
  const connection = ctx.get('connection') as ConnectionHandle
  const useSnapshot: SnapshotSelectorHook<SettingsScopeSnapshot<Config>> = bindSnapshotSelector(scope)
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: SETTINGS_NS,
    locale: LOCALE_NS,
    inject: () => ({ scope, useSnapshot, api: connection.api }),
  }, AutorouterCard))
}
