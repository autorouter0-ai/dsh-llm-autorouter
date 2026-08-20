# dsh-llm-autorouter

[English](README.md)

DeepSeek Harness 的 **AutoRouter** LLM 适配器。AutoRouter 是模型路由网关，统一对接多种上游渠道，支持 OpenAI 兼容、Anthropic、Gemini 等主流协议，并在网关内完成路由、渠道 failover、计费与可观测性。

安装本插件后，Harness 的所有模型调用都会经由你的 AutoRouter 部署转发，而不是直连各厂商 API。插件在 `ctx.llm` 上注册一条 provider 路由（默认 `autorouter`）；先通过“获取模型”与“导入选中模型”把网关提供的模型导入进来，再在 agent 中使用这些导入后的 model id。

已在 DeepSeek Harness `0.1.0-rc.5` 上测试通过。Harness 仍为 Developer Preview，后续版本可能不兼容。

## 环境要求

- AutoRouter API 密钥。
- 可用的 DeepSeek Harness 环境。

## 安装

可按你的 Harness 使用方式选择安装方法。

### 直接安装（npm，推荐）

如果你是通过 npm 直接使用 DeepSeek Harness：

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh-llm-autorouter
```

### 直接安装（git）

如果你希望直接从 git 仓库安装插件：

```sh
npx @deepseek-ai/dsh plugin --profile web add github:autorouter0-ai/dsh-llm-autorouter
```

git 安装会拉取源码并执行 `prepare` 构建。若首次失败，按命令输出的 `allowBuilds` 提示操作即可。

### 源码安装

如果你正在本地开发此插件，先构建插件包，再安装到 Web profile：

```sh
pnpm install
pnpm build
pnpm pack    # 生成 dsh-llm-autorouter-0.1.0.tgz

npx @deepseek-ai/dsh plugin --profile web add ./dsh-llm-autorouter-0.1.0.tgz
```

## 配置

插件包含 Host 与浏览器两个入口，但只需安装一次：**Host** 侧提供 LLM 适配器、settings 命名空间与模型发现；**浏览器**侧在 Web **Plugins** 页面提供 AutoRouter 配置卡片。

### Web 界面（推荐）

安装后打开 **Plugins** 中的 AutoRouter 卡片，填写网关地址与 API Key。Key 仅通过 credentials 服务存储（默认 `AUTOROUTER_API_KEY`），不会写入 `settings.yaml` 或返回浏览器。

使用 **获取模型** 与 **导入选中模型** 填充 `models` 白名单，供聊天模型选择器读取。

### 无界面 / CLI profile

无界面 profile 只加载 Host 入口。在启动环境中设置 `AUTOROUTER_API_KEY`，或通过 credentials 服务写入密钥。

### 配置项

安装 bundle 后若未额外配置，则使用 schema 默认值。可在 profile 的 `cordis.patch.yml` 或 `--patch` overlay 中覆盖任意字段：


| 字段                     | 默认值                                                   | 含义                                                                                        |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `baseURL`              | `$AUTOROUTER_BASE_URL` → `https://api.autorouter.top` | 网关地址，**不要**带尾部斜杠。                                                                         |
| `apiKeyEnv`            | `AUTOROUTER_API_KEY`                                  | 每次请求通过 credentials 服务解析的凭据引用。                                                             |
| `providers`            | `['autorouter']`                                      | 本适配器注册的 provider 路由。                                                                      |
| `thinking`             | *（中性）*                                                | `'enabled'` / `'disabled'`。中性时不发送，由上游自行决定。                                                |
| `reasoningEffort`      | *（中性）*                                                | `'off'` / `'low'` / `'high'` / `'max'`。设置后会写入未显式指定的请求。                                    |
| `defaultContextWindow` | `128000`                                              | 选中模型无精确值时使用的上下文容量。                                                                        |
| `models`               | `[]`                                                  | 已保存的聊天模型白名单（`{ id, name?, description?, contextWindow?, maxTokens?, inputModalities? }`）。 |
| `streamIdleTimeoutMs`  | `300000`                                              | 单次流式读取的最大空闲时间。                                                                            |
| `discoveryTimeoutMs`   | `10000`                                               | 模型列表请求的网络超时。                                                                              |
| `retryPolicy`          | 正常默认值                                                 | provider 侧请求重试策略。                                                                         |


`cordis.patch.yml` 示例：

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

本地 overlay 可用环境变量覆盖：

- `AUTOROUTER_BASE_URL` — 网关地址
- `AUTOROUTER_API_KEY_ENV` — 凭据环境变量名



## 使用

在 agent 中指定 `autorouter` provider：

```yaml
- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: autorouter
        model: deepseek-v4-flash   # 网关已路由的任意模型 id
```



### 思考模式（Thinking）

默认中性：未配置 `thinking` / `reasoningEffort` 时，请求中不会携带这些字段，各上游渠道保持自身默认行为。AutoRouter 会按渠道转发请求体（含从模型名后缀推断的 DeepSeek-V4 thinking 参数）。

- 设置 `reasoningEffort: high` 等，可在每次请求中启用思考并指定强度。
- 设置 `thinking: disabled` 可强制关闭思考。
- DeepSeek 系渠道返回的 `reasoning_content` 会以 `reasoning` 块流式回传。



## 模型发现

聊天选择器只展示已保存的 `models` 白名单，不会主动探测网关。Web 卡片的 **获取模型** 使用你的 token 向网关拉取最多 1000 个候选，并按能力分组。**导入选中模型** 将所选 id 及其 modalities、token 上限写入白名单。网关升级后如需新字段，请重新导入。发现失败时不改变已有目录。

## 已知限制

- 模型发现失败时静默回退，配置错误通常在首次聊天请求时才暴露。
- 图片输入需要 Host attachment 服务（Web profile 已包含），且模型需支持图片。



## 开发

```sh
pnpm install
pnpm typecheck
pnpm build
```

本地 Host 调试（无需安装 bundle）：

```sh
pnpm build
pnpm dev:overlay          # 生成 dev-cordis.local.yml
pnpm dsh web --patch ./dev-cordis.local.yml
```

`@deepseek-ai/*` 对等依赖需从 deepseek-harness 仓库链接：

```sh
DSH_HARNESS_DIR=/path/to/deepseek-harness pnpm dev:link-peers
pnpm build && pnpm smoke
```



## 许可证

MIT。部分代码改编自 `@deepseek-ai/dsh-llm-deepseek`（MIT，[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)）。