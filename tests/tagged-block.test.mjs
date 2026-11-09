import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { pngImage, workspace } from './fixtures.mjs'
import { buildCatalog } from '../scripts/lib/catalog.mjs'
import { loadTaggedBlock } from '../scripts/lib/tagged-block.mjs'

async function tagged(t, prepare = async () => {}) {
  const root = await workspace(t)
  const git = (args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim()
  git(['init', '--quiet', '-b', 'main'])
  // Fixture commits/tags must not depend on a developer's signing agent.
  git(['config', '--local', 'commit.gpgsign', 'false'])
  git(['config', '--local', 'tag.gpgsign', 'false'])
  await prepare(root)
  git(['add', '.'])
  git(['commit', '--quiet', '-m', 'chore(main): release hello-world 1.0.0'])
  const commit = git(['rev-parse', 'HEAD'])
  git(['tag', '-a', 'hello-world-v1.0.0', '-m', 'Release 1.0.0'])
  return { root, git, commit }
}

test('reconstructs an annotated tagged snapshot, ignores current files and never executes widget code', async (t) => {
  const { root, git, commit } = await tagged(t, async (root) => {
    await writeFile(
      path.join(root, 'blocks/hello-world/package/app.mjs'),
      'throw new Error("Widget code must never run")\n'
    )
    await writeFile(
      path.join(root, 'blocks/hello-world/CHANGELOG.md'),
      '# 1.0.0\n'
    )
    await writeFile(
      path.join(root, 'blocks/hello-world/package/.DS_Store'),
      'ignored'
    )
  })
  const output = path.join(root, 'dist')
  const preview = await buildCatalog({ root, output, sourceCommit: commit })
  const expected = await readFile(path.join(output, preview.blocks[0].filename))
  await writeFile(
    path.join(root, 'blocks/hello-world/package/app.mjs'),
    '// Unreleased main code'
  )
  git(['add', 'blocks'])
  git(['commit', '--quiet', '-m', 'fix(blocks): change the widget'])
  const main = git(['rev-parse', 'HEAD'])
  const data = await loadTaggedBlock(root, 'hello-world-v1.0.0', main)
  assert.deepEqual(data.zip, expected)
  assert.equal(data.entry.sourceCommit, commit)
  assert.equal(data.entry.version, '1.0.0')
})

test('a tag with mismatched release state is rejected before packaging', async (t) => {
  const { root, commit } = await tagged(t, async (root) => {
    await writeFile(path.join(root, '.release-please-manifest.json'), '{}\n')
  })
  await assert.rejects(
    loadTaggedBlock(root, 'hello-world-v1.0.0', commit),
    /release-please version snapshot/
  )
})

test('tagged package symlinks cannot read outside the block', async (t) => {
  const { root, commit } = await tagged(t, async (root) => {
    await symlink(
      '/etc/passwd',
      path.join(root, 'blocks/hello-world/package/secret.js')
    )
  })
  await assert.rejects(
    loadTaggedBlock(root, 'hello-world-v1.0.0', commit),
    /non-regular tagged file/
  )
})

test('publication checks screenshot dimensions from the tagged snapshot, not main', async (t) => {
  const { root, git } = await tagged(t, async (root) => {
    await writeFile(
      path.join(root, 'blocks/hello-world/screenshots/small.png'),
      pngImage(336, 336)
    )
  })
  await writeFile(
    path.join(root, 'blocks/hello-world/screenshots/small.png'),
    pngImage(156, 156)
  )
  git(['add', 'blocks'])
  git(['commit', '--quiet', '-m', 'fix(blocks): correct screenshot'])
  await assert.rejects(
    loadTaggedBlock(root, 'hello-world-v1.0.0', git(['rev-parse', 'HEAD'])),
    /small screenshot must be 156×156/
  )
})

test('tags outside main history and arbitrary ref arguments cannot be packaged', async (t) => {
  const { root, git, commit } = await tagged(t)
  git(['checkout', '--quiet', '--orphan', 'unrelated'])
  git(['commit', '--quiet', '-m', 'test: unrelated history'])
  const unrelated = git(['rev-parse', 'HEAD'])
  await assert.rejects(loadTaggedBlock(root, 'hello-world-v1.0.0', unrelated))
  await assert.rejects(
    loadTaggedBlock(root, 'main', commit),
    /Expected a block tag/
  )
  await assert.rejects(
    loadTaggedBlock(root, 'hello-world-v1.0.0', '--help'),
    /Invalid main commit/
  )
})
