import { appendFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { syncReleaseConfig } from './lib/release-config.mjs'

const check = process.argv.includes('--check')
if (process.argv.slice(2).some((arg) => arg !== '--check'))
  throw new Error('Usage: npm run sync:releases [-- --check]')
const { slugs } = await syncReleaseConfig(
  fileURLToPath(new URL('../', import.meta.url)),
  { check }
)
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `has_packages=${slugs.length > 0}\n`
  )
console.log(
  `Release-please configuration ${check ? 'verified' : 'updated'}: ${slugs.length} independent component(s).`
)
