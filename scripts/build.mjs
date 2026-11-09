import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildCatalog } from './lib/catalog.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const check = process.argv.includes('--check')
if (process.argv.slice(2).some((arg) => arg !== '--check'))
  throw new Error('Usage: npm run build [-- --check]')
let sourceCommit = null
try {
  sourceCommit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  }).trim()
} catch {
  // An unborn repository can be checked locally, but its catalog cannot be published.
}
const catalog = await buildCatalog({
  root,
  output: check ? undefined : path.join(root, 'dist'),
  sourceCommit,
})
console.log(
  `${check ? 'Validated' : 'Built'} ${catalog.blocks.length} community block(s)${check ? '' : ' in dist/'}. examples/ and docs/ are excluded.`
)
