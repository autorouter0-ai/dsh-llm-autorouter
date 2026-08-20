import { rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await rename(path.join(root, 'lib', 'index.mjs'), path.join(root, 'lib', 'index.js'))
await rename(path.join(root, 'lib', 'index.d.mts'), path.join(root, 'lib', 'index.d.ts'))
