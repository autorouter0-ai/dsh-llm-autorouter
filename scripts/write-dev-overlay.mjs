import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const entry = path.join(root, 'lib', 'index.js')
const output = path.join(root, 'dev-cordis.local.yml')
const baseURL = process.env.AUTOROUTER_BASE_URL ?? 'https://api.autorouter.top'
const apiKeyEnv = process.env.AUTOROUTER_API_KEY_ENV ?? 'AUTOROUTER_API_KEY'

const yaml = `- insert:
    - id: llm-autorouter
      name: '${entry}'
      config:
        baseURL: ${baseURL}
        apiKeyEnv: ${apiKeyEnv}
`

await writeFile(output, yaml, 'utf8')
process.stdout.write(`${output}\n`)
