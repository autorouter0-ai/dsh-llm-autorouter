# dsh-llm-autorouter

DeepSeek Harness LLM adapter for **AutoRouter** — the
model routing gateway (中转站). With this plugin mounted, every model call the
Harness makes is sent to your AutoRouter deployment's OpenAI-compatible relay
(`/v1/chat/completions`), so routing, channel failover, billing, and
observability all happen inside the gateway instead of inside the Harness.

The plugin registers one provider route (`autorouter` by default) on `ctx.llm`.
The model id you configure in the agent loop is any model the gateway routes;
the adapter discovers the gateway's model list live from `GET /v1/models`
(authorized with the same token), merged over an optional static catalog.

This package is the standalone, out-of-tree distribution. If it is merged
into the community dsh repository it becomes `@deepseek-ai/dsh-llm-autorouter`
under `packages/llm/llm-autorouter` (see [Publishing to the community dsh
repository](#publishing-to-the-community-dsh-repository)).

## Requirements

- A running AutoRouter deployment (the relay listens on `/v1/chat/completions`).
- An AutoRouter access token (created in the gateway admin, e.g. 令牌管理).
- A DeepSeek Harness install (the `dsh` CLI / `pnpm dsh`).

## Install

### As a bundle (recommended)

Build the package, then install it into a profile:

```sh
cd plugins/dsh-llm-autorouter
pnpm install          # installs typescript + dev deps
pnpm build            # emits lib/
pnpm pack             # produces dsh-llm-autorouter-0.1.0.tgz

dsh plugin --profile web add ./dsh-llm-autorouter-0.1.0.tgz
```

Installing from git works too (`dsh plugin --profile web add github:you/dsh-llm-autorouter`),
but a git install fetches sources and must run the `prepare` build — follow the
`allowBuilds` instructions printed by `dsh plugin` on the first failure.

### Host-only dev overlay

`dsh web --patch` expects a **Cordis YAML overlay**, not the plugin bundle
itself. In other words: pass a `.yml` file whose `name` points at
`lib/index.js`; do **not** pass `lib/index.js` directly or the CLI will try to
parse JavaScript as YAML.

From a deepseek-harness checkout, mount the built Host entry directly:

```sh
# plugins/dsh-llm-autorouter/dev-cordis.yml
- insert:
    - id: llm-autorouter
      name: '/absolute/path/to/autorouter/plugins/dsh-llm-autorouter/lib/index.js'
      config:
        baseURL: http://127.0.0.1:3000
        apiKeyEnv: AUTOROUTER_API_KEY
```

```sh
pnpm dsh web --patch ./dev-cordis.yml
```

This repository also ships the same example at
`plugins/dsh-llm-autorouter/dev-cordis.yml`; you can copy it and replace the
absolute path.

For local Host development, generate a machine-specific overlay after building:

```sh
cd plugins/dsh-llm-autorouter
pnpm build
pnpm dev:overlay
pnpm dsh web --patch ./dev-cordis.local.yml
```

`pnpm dev:overlay` writes `dev-cordis.local.yml` with the current absolute
`lib/index.js` path. A file-path Loader entry has no package manifest for the
Web client-module registry to scan, so this mode verifies the Host entry only.
To test the browser card, install the built directory or tgz into the Web
profile by package name:

```sh
pnpm dsh plugin --profile web add ./my_plugins/dsh-llm-autorouter
```

Override the emitted Host config via environment variables if needed:

- `AUTOROUTER_BASE_URL` changes `config.baseURL`
- `AUTOROUTER_API_KEY_ENV` changes `config.apiKeyEnv`

## Configuration

The package has two entries but one installation: the Host entry supplies the
adapter, settings namespace, and authenticated `/v1/models` discovery; the
browser entry supplies the AutoRouter card on the Web **Plugins** page. Install
only this bundle:

```sh
dsh plugin --profile web add ./dsh-llm-autorouter.tgz
```

Enter the gateway URL and API key in that card. The key is written only through
the credentials service under `AUTOROUTER_API_KEY` (or the configured
`apiKeyEnv`); it is never stored in `settings.yaml` or returned to the browser.
Both model discovery and model requests resolve that same credential. Use
**获取模型** and **导入选中模型** to make the selected ids the `models` allowlist.
Headless profiles load only the Host entry; set `AUTOROUTER_API_KEY` in the
launching environment or store it through the credentials service.

The bundle patch mounts the plugin with no config; schema defaults apply and
every field can be overridden in your profile's `cordis.patch.yml` or a
`--patch` overlay:

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `$AUTOROUTER_BASE_URL` → `http://127.0.0.1:3000` | Gateway origin **without** a trailing slash or `/v1`; the adapter appends `/v1/chat/completions`. |
| `apiKeyEnv` | `AUTOROUTER_API_KEY` | Credential reference resolved per request through the credentials service; without it, the ambient environment is the whole credential plane. |
| `providers` | `['autorouter']` | Provider routes this adapter owns. |
| `thinking` | *(neutral)* | `'enabled'` / `'disabled'`. Neutral by default: nothing is put on the wire. |
| `reasoningEffort` | *(neutral)* | `'off'` / `'low'` / `'high'` / `'max'`. When set, it is materialized into requests that omit one. |
| `defaultContextWindow` | `128000` | Context capacity used when the selected model has no exact value. |
| `models` | `[]` | Saved chat-model allowlist (`{ id, name?, description?, contextWindow?, maxTokens?, inputModalities? }`). On import, `inputModalities` is copied from gateway `input_modalities`; `contextWindow` / `maxTokens` are copied from gateway `context_window` / `max_output_tokens`. Omitted `inputModalities` is treated as text-only; omitted capacity fields use `defaultContextWindow` / the provider default. |
| `streamIdleTimeoutMs` | `300000` | Max provider idle time while one stream read is outstanding. |
| `discoveryTimeoutMs` | `10000` | Per-listing network timeout for `/v1/models`. |
| `retryPolicy` | normal defaults | Provider-owned request retry policy. |

Example `cordis.patch.yml` layer for a profile:

```yaml
- insert:
    - id: llm-autorouter
      name: dsh-llm-autorouter
      config:
        baseURL: https://gateway.example.com
        apiKeyEnv: AUTOROUTER_API_KEY
        thinking: enabled
        reasoningEffort: high
        models:
          - id: deepseek-v4-flash
            contextWindow: 1000000
```

## Using the provider

Point an agent at the route:

```yaml
- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: autorouter
        model: deepseek-v4-flash   # any model id your gateway routes
```

### Thinking semantics (read this)

This adapter is **neutral by default**: with no `thinking` / `reasoningEffort`
configured, neither `thinking` nor `reasoning_effort` is placed on the wire,
so each upstream channel keeps its own thinking default. AutoRouter relays the
OpenAI-format body per channel (it even injects DeepSeek-V4 thinking from
model-name suffixes), so:

- Configure `reasoningEffort: high` (etc.) to send `thinking: {type:"enabled"}`
  + `reasoning_effort` on every request.
- Configure `thinking: disabled` to limit every conversation request to `off`.
- `reasoning_content` from DeepSeek-family channels is streamed back as
  `reasoning` blocks and replayed as `reasoning_content` on tool-call turns.

## Model discovery

The chat model selector lists only the saved `models` allowlist. It never
probes the gateway. The Web card's **获取模型** action calls
`GET {baseURL}/v1/models` with the resolved token and returns at most 1000
candidates. Models whose returned `capabilities` contain `chat` start selected;
The card groups candidates by capability. Selecting a group selects every
model in it; clearing a group clears every model in it. A model with multiple
capabilities appears in each applicable group. **导入选中模型** saves the chosen
ids, advertised `input_modalities`, and token `context_window` /
`max_output_tokens` (stored as `contextWindow` / `maxTokens`) into that
allowlist. Re-import to pick up vision or capacity fields after an upgrade. A
failed discovery leaves the saved chat catalog unchanged.

## Errors and stream behavior

- Every provider HTTP request sends `attributionHeaders()` and forwards the
  caller's abort signal; idle streams are killed by
  `streamIdleTimeoutMs` (`LLM_STREAM_IDLE_TIMEOUT` → `TIMEOUT`).
- Transport failures → `LlmError('TRANSPORT')`; HTTP errors map to stable
  codes (`AUTH`, `RATE_LIMIT`, `QUOTA_EXCEEDED`, `CONTEXT_WINDOW_EXCEEDED`,
  `INVALID_REQUEST`, `SERVER`, `HTTP_<status>`), carrying the provider
  `retry-after` and `x-request-id` when present.
- A truncated SSE stream (EOF before `[DONE]`) fails with `STREAM_CLOSED`.

## Local development

The package typechecks and builds with tsdown; its only runtime dependency
beyond the `@deepseek-ai` peers is `eventsource-parser`.

```sh
cd plugins/dsh-llm-autorouter
pnpm install
pnpm typecheck
pnpm build
```

If `pnpm build` fails with `TS2688: Cannot find type definition file for
'node'`, your local `node_modules/@types/node` link is probably broken by an
older manual setup. Repair it by reinstalling the local toolchain:

```sh
rm -rf node_modules/@types node_modules/typescript node_modules/.bin/tsc
pnpm install
```

The smoke test boots a **real** Cordis Loader + Include + LlmRuntime and a
mock AutoRouter server, then drives discovery and streaming round-trips
(text + tool calls) through the production `BlockAssembler` path. It resolves
the `@deepseek-ai/*` packages from a deepseek-harness checkout via dev
symlinks:

```sh
# one-time dev setup (paths as in this repo):
D=../..  # or wherever your deepseek-harness checkout lives
pnpm install
DSH_HARNESS_DIR="$D" pnpm dev:link-peers
pnpm build && pnpm smoke
```

`pnpm install` provides the local `typescript`, `@types/node`, and
`eventsource-parser` toolchain. `pnpm dev:link-peers` only wires the
`@deepseek-ai/*` peer packages from a deepseek-harness checkout, so it avoids
the broken nested symlink problem that can make `@types/node` disappear.

The `node_modules` development setup is gitignored.

## Publishing to the community dsh repository

When contributing this adapter upstream, the mechanical changes are:

1. Move the package to `packages/llm/llm-autorouter` and rename to
   `@deepseek-ai/dsh-llm-autorouter`; keep the source split
   (`index.ts` / `adapter.ts` / `serialize.ts` / `sse.ts` / `translate.ts` /
   `types.ts`).
2. Adopt the repository package layout: `package.json` invariants
   (`private: true`, `workspace:^` peers, `files: lib/index.js +
   lib/invariant.js + lib/types/**/*.d.ts`), `tsconfig.json` extending
   `tsconfig.base.json` with `references` to cordis / schemastery / llm /
   credentials / timeout, registration in `tsconfig.host.json`, and the
   shared tsdown build.
3. Port `scripts/smoke.mjs` to a vitest real-composition spec
   (`tests/loader-composition.spec.ts` style) and add unit specs for
   `serialize`, `sse`, and `translate`.
4. Add the README **Model Experience** section and the **Known Limitations**
   section required by the repository verifier.

## Known limitations

- **Catalog fields need a re-import**: models already saved without `inputModalities`, `contextWindow`, or `maxTokens` keep the previous values until you fetch and import them again. Image bytes go on the OpenAI `image_url` data-URL wire form; the gateway's chat-completions route must accept that. The Host attachment service must be present (the Web profile includes it).
- **Discovery is advisory**: `/v1/models` failures fall back to the static
  catalog silently; misconfiguration surfaces on the first chat request
  instead of at listing time.
- **One chat format**: only the OpenAI-compatible relay (`/v1/chat/completions`)
  is used; the gateway's Gemini/Anthropic-compatible surfaces are not.

## License

MIT. Portions adapted from `@deepseek-ai/dsh-llm-deepseek` (MIT,
https://github.com/deepseek-ai/deepseek-harness) — the reference
OpenAI-compatible adapter this package mirrors.
