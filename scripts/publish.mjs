import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { discoverBlocks } from './lib/catalog.mjs'
import { createGitHubClient } from './lib/github.mjs'
import { repository } from './lib/metadata.mjs'
import { publishCatalog } from './lib/publish.mjs'
import { tagsFromActionOutputs } from './lib/release-config.mjs'
import { loadTaggedBlock } from './lib/tagged-block.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const retryTag =
  process.env.RETRY_TAG ||
  (args[0] === '--tag' && args.length === 2 ? args[1] : '')
if (args.length && !(args.length === 2 && args[0] === '--tag'))
  throw new Error('Usage: npm run publish:catalog [-- --tag my-widget-v1.0.0]')
if (
  process.env.GITHUB_REPOSITORY &&
  process.env.GITHUB_REPOSITORY !== repository
)
  throw new Error(
    'Forks run checks only; publication belongs to the upstream repository'
  )
const git = (args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
if (git(['status', '--porcelain', '--untracked-files=normal']))
  throw new Error('Publication requires a clean committed checkout')
const commit = git(['rev-parse', '--verify', 'HEAD'])
const tags = tagsFromActionOutputs(
  JSON.parse(process.env.RELEASE_OUTPUTS_JSON ?? '{}')
)
if (retryTag) tags.push(retryTag)
const result = await publishCatalog({
  mainCommit: commit,
  activeSlugs: await discoverBlocks(root),
  tags,
  loadRelease: (tag) => loadTaggedBlock(root, tag, commit),
  github: createGitHubClient(process.env.GITHUB_TOKEN),
})
console.log(
  result.superseded
    ? 'Block assets checked; a newer main commit superseded this catalog. The latest index was not changed.'
    : `Published catalog with ${result.blocks} block(s).`
)
