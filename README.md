# dsh-llm-autorouter

[中文文档](README.zh-CN.md)

DeepSeek Harness LLM adapter for **AutoRouter** — a model routing gateway that unifies access to multiple upstream channels. AutoRouter supports mainstream API formats (OpenAI-compatible, Anthropic, Gemini, and others) and handles routing, channel failover, billing, and observability inside the gateway.

This plugin mounts on the Harness so every model call goes through your AutoRouter deployment instead of hitting providers directly. It registers one provider route (`autorouter` by default) on `ctx.llm`; first fetch and import the models exposed by the gateway, then use those imported model ids in your agent config.

Tested with DeepSeek Harness `0.1.0-rc.5`. Harness is still Developer Preview — later versions may break compatibility.

## Requirements

- An AutoRouter API key.
- A working DeepSeek Harness environment.

## Install

Choose the installation method that matches how you run DeepSeek Harness.

### Direct install from npm (recommended)

If you use DeepSeek Harness directly from npm:

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh-llm-autorouter
```

### Direct install from git

If you want to install the plugin from a git repository:

```sh
npx @deepseek-ai/dsh plugin --profile web add github:autorouter0-ai/dsh-llm-autorouter
```

A git install fetches sources and runs the `prepare` build. If the first attempt fails, follow the `allowBuilds` instructions printed by the command.

### Install from source

If you are developing this plugin locally, build the package first and then install it into a Web profile:

```sh
pnpm install
pnpm build
pnpm pack    # produces dsh-llm-autorouter-0.1.0.tgz

npx @deepseek-ai/dsh plugin --profile web add ./dsh-llm-autorouter-0.1.0.tgz
```

## Configuration

The bundle has two entries with one installation: the **Host** entry supplies the LLM adapter, settings namespace, and model discovery; the **browser** entry supplies the AutoRouter card on the Web **Plugins** page.

### Web UI (recommended)

After install, open the AutoRouter card under **Plugins**. Enter the gateway URL and API key. The key is stored only through the credentials service (`AUTOROUTER_API_KEY` by default) — never in `settings.yaml` or the browser.

Use **Fetch models** and **Import selected** to populate the `models` allowlist that chat selectors read from.

### Headless / CLI profiles

Headless profiles load only the Host entry. Set `AUTOROUTER_API_KEY` in the launching environment, or store the key through the credentials service.

### Config fields

Defaults apply when the bundle is installed with no extra config. Override any field in your profile's `cordis.patch.yml` or a `--patch` overlay:


| Field                  | Default                                               | Meaning                                                                                                   |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `baseURL`              | `$AUTOROUTER_BASE_URL` → `https://api.autorouter.top` | Gateway origin, **without** a trailing slash.                                                             |
| `apiKeyEnv`            | `AUTOROUTER_API_KEY`                                  | Credential reference resolved per request through the credentials service.                                |
| `providers`            | `['autorouter']`                                      | Provider routes this adapter owns.                                                                        |
| `thinking`             | *(neutral)*                                           | `'enabled'` / `'disabled'`. Neutral: nothing is sent; upstream keeps its own default.                     |
| `reasoningEffort`      | *(neutral)*                                           | `'off'` / `'low'` / `'high'` / `'max'`. When set, materialized into requests that omit one.               |
| `defaultContextWindow` | `128000`                                              | Context capacity when the selected model has no exact value.                                              |
| `models`               | `[]`                                                  | Saved chat-model allowlist (`{ id, name?, description?, contextWindow?, maxTokens?, inputModalities? }`). |
| `streamIdleTimeoutMs`  | `300000`                                              | Max idle time while one stream read is outstanding.                                                       |
| `discoveryTimeoutMs`   | `10000`                                               | Network timeout for model listing.                                                                        |
| `retryPolicy`          | normal defaults                                       | Provider-owned request retry policy.                                                                      |


Example `cordis.patch.yml`:

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

Environment overrides for local overlays:

- `AUTOROUTER_BASE_URL` — gateway origin
- `AUTOROUTER_API_KEY_ENV` — credential env var name

## Usage

Point an agent at the `autorouter` provider:

```yaml
- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: autorouter
        model: deepseek-v4-flash   # any model id your gateway routes
```

### Thinking mode

Neutral by default: with no `thinking` / `reasoningEffort` configured, neither field is sent on the wire and each upstream channel keeps its own default. AutoRouter relays the request body per channel (including DeepSeek-V4 thinking inferred from model-name suffixes).

- Set `reasoningEffort: high` (etc.) to send thinking + reasoning effort on every request.
- Set `thinking: disabled` to force thinking off on every request.
- `reasoning_content` from DeepSeek-family channels is streamed back as `reasoning` blocks.

## Model discovery

Chat selectors list only the saved `models` allowlist — they never probe the gateway on their own. The Web card's **Fetch models** action queries the gateway with your token and returns up to 1000 candidates grouped by capability. **Import selected** saves the chosen ids and their advertised modalities / token limits into the allowlist. Re-import after a gateway upgrade to pick up new fields. A failed discovery leaves the existing catalog unchanged.

## Known limitations

- Discovery failures fall back silently; misconfiguration usually surfaces on the first chat request.
- Image input requires the Host attachment service (included in the Web profile) and a gateway route that accepts image payloads.

## Development

```sh
pnpm install
pnpm typecheck
pnpm build
```

For a local Host overlay without installing the bundle:

```sh
pnpm build
pnpm dev:overlay          # writes dev-cordis.local.yml
pnpm dsh web --patch ./dev-cordis.local.yml
```

Peer packages (`@deepseek-ai/*`) must be linked from a deepseek-harness checkout:

```sh
DSH_HARNESS_DIR=/path/to/deepseek-harness pnpm dev:link-peers
pnpm build && pnpm smoke
```

## License

MIT. Portions adapted from `@deepseek-ai/dsh-llm-deepseek` (MIT, [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)).