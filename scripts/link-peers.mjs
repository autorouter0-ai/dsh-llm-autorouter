import { mkdir, rm, symlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const harness = path.resolve(root, process.env.DSH_HARNESS_DIR ?? '../..')

const links = [
  ['node_modules/@deepseek-ai/dsh-llm', path.join(harness, 'packages/llm/llm')],
  ['node_modules/@deepseek-ai/dsh-attachment', path.join(harness, 'packages/attachment/attachment')],
  ['node_modules/@deepseek-ai/dsh-credentials', path.join(harness, 'packages/credentials/credentials')],
  ['node_modules/@deepseek-ai/dsh-timeout', path.join(harness, 'packages/util/timeout')],
  ['node_modules/@deepseek-ai/dsh-settings', path.join(harness, 'packages/settings/settings')],
  ['node_modules/@deepseek-ai/dsh-host-webserver', path.join(harness, 'packages/host/webserver')],
  ['node_modules/@deepseek-ai/dsh-api-remotes', path.join(harness, 'packages/api/remotes')],
  ['node_modules/@deepseek-ai/dsh-client-connection', path.join(harness, 'packages/client/connection')],
  ['node_modules/@deepseek-ai/dsh-client-runtime', path.join(harness, 'packages/client/runtime')],
  ['node_modules/@deepseek-ai/dsh-client-ui-settings', path.join(harness, 'packages/client/ui-settings')],
  ['node_modules/@deepseek-ai/dsh-client-ui-settings-plugins', path.join(harness, 'packages/client/ui-settings-plugins')],
  ['node_modules/@deepseek-ai/dsh-client-locale', path.join(harness, 'packages/client/locale')],
  ['node_modules/@deepseek-ai/dsh-client-ui-slots', path.join(harness, 'packages/client/ui-slots')],
  ['node_modules/@deepseek-ai/cordis', path.join(harness, 'vendor/cordis')],
  ['node_modules/@deepseek-ai/schemastery', path.join(harness, 'vendor/schemastery')],
  ['node_modules/@deepseek-ai/cordis-plugin-loader', path.join(harness, 'vendor/loader')],
  ['node_modules/@deepseek-ai/cordis-plugin-include', path.join(harness, 'vendor/include')],
]

const localLinks = [
  ['node_modules/react', path.join(harness, 'packages/client/ui-settings-models/node_modules/react')],
  ['node_modules/@types/react', path.join(harness, 'packages/client/ui-settings-models/node_modules/@types/react')],
]

await mkdir(path.join(root, 'node_modules', '@deepseek-ai'), { recursive: true })

for (const [relativeLink, target] of links) {
  const link = path.join(root, relativeLink)
  await rm(link, { force: true, recursive: true })
  await symlink(target, link)
  process.stdout.write(`${relativeLink} -> ${target}\n`)
}

for (const [relativeLink, target] of localLinks) {
  const link = path.join(root, relativeLink)
  await mkdir(path.dirname(link), { recursive: true })
  await rm(link, { force: true, recursive: true })
  await symlink(target, link)
  process.stdout.write(`${relativeLink} -> ${target}\n`)
}
