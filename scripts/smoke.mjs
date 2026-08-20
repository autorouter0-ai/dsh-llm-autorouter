/**
 * Real-composition smoke test for dsh-llm-autorouter, runnable without the DSH
 * workspace: it boots a genuine Cordis Context + Loader + Include + LlmRuntime
 * from the @deepseek-ai packages (resolved through this package's dev
 * node_modules), mounts dsh-llm-autorouter from a test-only cordis.yml, and drives
 * discovery and a streaming round-trip against a local mock AutoRouter server.
 *
 * Dev setup (see README.md "Local development"): symlink node_modules to a
 * deepseek-harness checkout, then `pnpm build && node scripts/smoke.mjs`.
 *
 * The mock server asserts the request shape the relay receives (auth header,
 * OpenAI-format body), then replays scripted SSE: a text completion, a
 * tool-call completion, and the /v1/models listing.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime, { BlockAssembler } from '@deepseek-ai/dsh-llm'
import WebServer from '@deepseek-ai/dsh-host-webserver'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PLUGIN_ENTRY = join(__dirname, '..', 'lib', 'index.js')
const API_KEY = 'smoke-key'

let passed = 0
function ok(condition, label) {
  if (!condition) throw new Error(`SMOKE FAIL: ${label}`)
  passed++
  console.log(`  ok - ${label}`)
}

/** Minimal OpenAI-compatible mock of the AutoRouter relay surface. */
async function mockAutorouter() {
  const requests = []
  const modelRequests = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk.toString('utf8') })
    req.on('end', () => {
      if (req.method === 'GET' && req.url === '/v1/models') {
        modelRequests.push({ url: req.url, headers: req.headers })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          success: true,
          object: 'list',
          data: [
            { id: 'mock-text', object: 'model', created: 1, capabilities: ['chat'] },
            { id: 'mock-object-chat', object: 'model', created: 1, capabilities: { chat: true, embedding: false } },
            { id: 'mock-reasoner', object: 'model', created: 1, capabilities: 'embedding' },
            {
              id: 'mock-vision',
              object: 'model',
              created: 1,
              capabilities: ['chat'],
              input_modalities: ['text', 'image'],
              context_window: 128000,
              max_output_tokens: 8000,
            },
          ],
        }))
        return
      }
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        const parsed = JSON.parse(body)
        requests.push({ url: req.url, headers: req.headers, body: parsed })
        const toolUse = parsed.tools !== undefined && parsed.tools.length > 0
        const events = toolUse
          ? [
            '{"choices":[{"delta":{"role":"assistant","content":null}}]}',
            '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"greet","arguments":""}}]}}]}',
            '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"name\\":\\"Ada\\"}"}}]}}]}',
            '{"choices":[{"delta":{"content":""},"finish_reason":"tool_calls"}]}',
            '{"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":6}}',
            '[DONE]',
          ]
          : [
            '{"choices":[{"delta":{"role":"assistant","content":null,"reasoning_content":""}}]}',
            '{"choices":[{"delta":{"content":"hello "}}]}',
            '{"choices":[{"delta":{"content":"world"}}]}',
            '{"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}',
            '[DONE]',
          ]
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        for (const event of events) res.write(`data: ${event}\n\n`)
        res.end()
        return
      }
      res.writeHead(404).end('not found')
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server: no port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    modelRequests,
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

/** Drive ctx.llm.stream through the production BlockAssembler path. */
async function assemble(ctx, options) {
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
  return {
    message: assembler.message({
      kind: 'model',
      provider: options.provider,
      model: options.model,
      ...assembler.replayState === undefined ? {} : { replayState: assembler.replayState },
    }),
    ...assembler.usage !== undefined ? { usage: assembler.usage } : {},
    finish: assembler.finish,
  }
}

const root = await mkdtemp(join(tmpdir(), 'dsh-llm-autorouter-smoke-'))
const autorouter = await mockAutorouter()
let context

try {
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: llm',
    "  name: 'test-llm-service'",
    '- id: llm-autorouter',
    `  name: ${JSON.stringify(PLUGIN_ENTRY)}`,
    '  config:',
    `    baseURL: ${JSON.stringify(autorouter.url)}`,
    '    apiKeyEnv: AUTOROUTER_API_KEY',
    '    models:',
    '      - id: mock-text',
    '      - id: mock-vision',
    '        inputModalities:',
    '          - text',
    '          - image',
    '',
  ].join('\n'))

  process.env.AUTOROUTER_API_KEY = API_KEY
  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map([
    ['test-llm-service', LlmRuntime],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier) {
      if (modules.has(specifier)) return modules.get(specifier)
      if (specifier.startsWith('/') || specifier.startsWith('file:')) {
        return import(specifier.startsWith('file:') ? specifier : pathToFileURL(specifier).href)
      }
      throw new Error(`unexpected Loader import: ${specifier}`)
    },
  }
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()

  console.log('plugin loaded and llm service registered')
  ok(ctx.get('llm') !== undefined, 'ctx.llm service exists')

  // Provider route registration.
  const providers = ctx.llm.listProviders()
  const routeIds = providers.map(provider => provider.id)
  ok(routeIds.includes('autorouter'), `provider route "autorouter" registered (got ${routeIds.join(', ')})`)
  const autorouterProvider = providers.find(provider => provider.id === 'autorouter')
  ok(autorouterProvider?.name === 'AutoRouter', `provider display name "AutoRouter" (got ${autorouterProvider?.name})`)

  // The chat selector reads only the saved allowlist, so it must not probe.
  const configuredModels = await ctx.llm.listModels('autorouter')
  ok(configuredModels.some(model => model.id === 'mock-text'), 'saved allowlist lists mock-text')
  ok(configuredModels.find(model => model.id === 'mock-vision')?.inputModalities?.includes('image') === true,
    'saved allowlist lists mock-vision as image-capable')
  ok(autorouter.modelRequests.length === 0, 'chat selector does not call /v1/models')

  // The Web configuration action uses the separate discovery registration.
  const models = await ctx.llm.discoverModels('llm-autorouter', { provider: 'autorouter' })
  const ids = models.map(model => model.id)
  ok(ids.includes('mock-text') && ids.includes('mock-object-chat') && ids.includes('mock-reasoner') && ids.includes('mock-vision'),
    `configuration discovery reads /v1/models (got ${ids.join(', ')})`)
  ok(models.find(model => model.id === 'mock-text')?.capabilities === undefined,
    'generic discovery keeps its standard result fields')
  ok(autorouter.modelRequests[0]?.headers.authorization === `Bearer ${API_KEY}`,
    'model discovery uses the resolved API key')

  // The plugin-owned Web route retains gateway capabilities for its own card.
  const discoveryRoute = await fetch(`http://127.0.0.1:${ctx.webServer.port}/plugins/dsh-llm-autorouter/models`, {
    method: 'POST',
  })
  const discoveryBody = await discoveryRoute.json()
  ok(discoveryRoute.ok, 'plugin-owned model route succeeds')
  ok(discoveryBody.models.find(model => model.id === 'mock-text')?.capabilities?.includes('chat') === true,
    'plugin-owned model route preserves array chat capability')
  ok(discoveryBody.models.find(model => model.id === 'mock-object-chat')?.capabilities?.includes('chat') === true,
    'plugin-owned model route preserves object chat capability')
  ok(discoveryBody.models.find(model => model.id === 'mock-vision')?.inputModalities?.includes('image') === true,
    'plugin-owned model route preserves input_modalities')
  ok(discoveryBody.models.find(model => model.id === 'mock-vision')?.contextWindow === 128000,
    'plugin-owned model route preserves context_window')
  ok(discoveryBody.models.find(model => model.id === 'mock-vision')?.maxTokens === 8000,
    'plugin-owned model route preserves max_output_tokens')

  // Text streaming round-trip.
  const text = await assemble(ctx, {
    provider: 'autorouter',
    model: 'mock-text',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })
  const textContent = text.message.content.map(block => block.text).join('')
  ok(textContent === 'hello world', `streamed text assembled ("${textContent}")`)
  ok(text.usage?.inputTokens === 5 && text.usage?.outputTokens === 2, 'usage mapped (5 in / 2 out)')
  ok(text.finish.kind === 'stop', `finish reason stop (${JSON.stringify(text.finish)})`)

  // Request shape the relay received.
  const chat = autorouter.requests[0]
  ok(chat !== undefined, 'relay received the chat request')
  ok(chat.headers.authorization === `Bearer ${API_KEY}`, 'authorization header carries the resolved key')
  ok(chat.body.model === 'mock-text' && chat.body.stream === true, 'wire body: model + stream:true')
  ok(chat.body.messages[0]?.role === 'user' && chat.body.messages[0]?.content === 'hi', 'wire body: user message serialized')
  ok(chat.body.thinking === undefined && chat.body.reasoning_effort === undefined,
    'neutral default: no thinking / reasoning_effort on the wire')

  // Tool-call streaming round-trip (second request).
  const tool = await assemble(ctx, {
    provider: 'autorouter',
    model: 'mock-text',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'greet Ada' }] }],
    tools: [{
      name: 'greet',
      description: 'Greet someone by name.',
      parameters: { type: 'object', properties: { name: { type: 'string' } } },
    }],
  })
  const toolCalls = tool.message.content.filter(block => block.type === 'tool-call')
  ok(toolCalls.length === 1, 'tool-call block assembled')
  ok(toolCalls[0].name === 'greet', `tool call name greet (${toolCalls[0].name})`)
  ok(toolCalls[0].arguments.includes('Ada'), `tool call arguments contain Ada (${toolCalls[0].arguments})`)
  ok(tool.finish.kind === 'tool-calls', `finish reason tool-calls (${JSON.stringify(tool.finish)})`)
  const toolWire = autorouter.requests[1]
  ok(toolWire?.body.tools?.[0]?.function?.name === 'greet', 'wire body: tools serialized for the relay')

  const visionInfo = await ctx.llm.resolveModelInfo('autorouter', 'mock-vision')
  ok(visionInfo.inputModalities?.includes('image') === true,
    'resolveModelInfo reports image input for an imported vision model')

  ctx.provide('attachments', {
    readImage: async (ref) => ({ ref, data: Uint8Array.of(1, 2, 3) }),
  })
  const vision = await assemble(ctx, {
    provider: 'autorouter',
    model: 'mock-vision',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'describe' },
        {
          type: 'image',
          attachment: {
            attachmentId: `sha256:${'a'.repeat(64)}`,
            mediaType: 'image/png',
            bytes: 3,
            width: 1,
            height: 1,
          },
        },
      ],
    }],
  })
  ok(vision.finish.kind === 'stop', 'vision request streams to a stop')
  const visionWire = autorouter.requests[2]
  const visionContent = visionWire?.body.messages[0]?.content
  ok(Array.isArray(visionContent), 'vision user message uses multipart content')
  ok(visionContent?.[0]?.type === 'text' && visionContent?.[0]?.text === 'describe', 'vision text part')
  ok(visionContent?.[1]?.type === 'image_url'
    && typeof visionContent?.[1]?.image_url?.url === 'string'
    && visionContent[1].image_url.url.startsWith('data:image/png;base64,'),
    'vision image_url data URL')

  console.log(`\nSMOKE PASS: ${passed} assertions`)
} finally {
  process.env.AUTOROUTER_API_KEY = undefined
  await context?.fiber.dispose()
  await autorouter.close()
  await rm(root, { recursive: true, force: true })
}
