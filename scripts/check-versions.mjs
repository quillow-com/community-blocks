import { fileURLToPath } from 'node:url'
import { checkVersions } from './lib/versions.mjs'

const [, , flag, base, ...extra] = process.argv
if (flag !== '--base' || !base || extra.some((arg) => arg !== '--release'))
  throw new Error(
    'Usage: npm run check:versions -- --base <full-base-commit> [--release]'
  )
await checkVersions(fileURLToPath(new URL('../', import.meta.url)), base, {
  release: extra.includes('--release'),
})
console.log('Block versions are valid relative to the base commit.')
