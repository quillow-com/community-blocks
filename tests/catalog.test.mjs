import assert from 'node:assert/strict'
import { cp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { validateArchive } from '@quillow/skills/src/archive-contract.mjs'
import { commit, workspace } from './fixtures.mjs'
import { buildCatalog, sha256 } from '../scripts/lib/catalog.mjs'

test('the starter SDK is SSR-safe and pinned to the generated ESM bundle', async () => {
  const { Quillow, connect, WidgetSDKError } =
    await import('../examples/hello-world/package/runtime.js')
  assert.equal(Quillow.getContext(), undefined)
  await assert.rejects(
    connect(),
    (error) =>
      error instanceof WidgetSDKError && error.code === 'HOST_UNAVAILABLE'
  )
})

test('an empty catalog excludes examples/docs and needs no fake community entries', async (t) => {
  const root = await workspace(t, false)
  await cp(
    new URL('../examples/', import.meta.url),
    path.join(root, 'examples'),
    { recursive: true }
  )
  await mkdir(path.join(root, 'docs'))
  await writeFile(path.join(root, 'docs/invalid-widget.json'), '{}')
  const catalog = await buildCatalog({ root, sourceCommit: commit })
  assert.deepEqual(catalog.blocks, [])
})

test('builds deterministic, root-layout ZIPs and commit-pinned catalog URLs', async (t) => {
  const root = await workspace(t)
  const output = path.join(root, 'dist')
  const first = await buildCatalog({ root, output, sourceCommit: commit })
  const second = await buildCatalog({ root, output, sourceCommit: commit })
  assert.deepEqual(first, second)
  const entry = first.blocks[0]
  const bytes = await readFile(path.join(output, entry.filename))
  const validated = await validateArchive(bytes)
  assert.equal(sha256(bytes), entry.sha256)
  assert.equal(entry.zipBytes, bytes.length)
  assert.match(entry.sourceUrl, new RegExp(commit))
  assert.equal(
    entry.downloadUrl,
    'https://github.com/quillow-com/custom-blocks/releases/download/hello-world-v1.0.0/hello-world-1.0.0.zip'
  )
  assert.deepEqual(validated.files.sort(), [
    'app.mjs',
    'index.html',
    'runtime.js',
    'style.css',
  ])
  assert.equal(validated.manifest.entrypoint, 'index.html')
  assert.deepEqual(entry.networkOrigins, [])
  assert.equal(entry.hasEditor, false)
  assert.deepEqual(
    entry.screenshots,
    ['small', 'medium', 'large'].map(
      (name) =>
        `https://raw.githubusercontent.com/quillow-com/custom-blocks/${commit}/blocks/hello-world/screenshots/${name}.png`
    )
  )
  assert.deepEqual(
    JSON.parse(await readFile(path.join(output, 'catalog.json'), 'utf8')),
    first
  )
})

for (const name of [undefined, '', '   ']) {
  test(`block name is mandatory in package/manifest.json: ${JSON.stringify(name)}`, async (t) => {
    const root = await workspace(t)
    const filename = path.join(root, 'blocks/hello-world/package/manifest.json')
    const manifest = JSON.parse(await readFile(filename, 'utf8'))
    manifest.name = name
    await writeFile(filename, JSON.stringify(manifest))
    await assert.rejects(buildCatalog({ root }), /nonblank name/)
  })
}

test('reuses the existing validator and never packages surrounding metadata/docs', async (t) => {
  const root = await workspace(t)
  const packageFile = path.join(root, 'blocks/hello-world/package/readme.md')
  await writeFile(packageFile, '# Not an upload asset')
  await assert.rejects(
    buildCatalog({ root }),
    /readme\.md: unsupported file type/
  )
})

test('rejects symlink blocks and does not write artifacts into blocks/', async (t) => {
  const root = await workspace(t)
  await assert.rejects(
    buildCatalog({ root, output: path.join(root, 'blocks/output') }),
    /outside blocks/
  )
  await symlink(
    path.join(root, 'blocks/hello-world'),
    path.join(root, 'blocks/other')
  )
  await assert.rejects(buildCatalog({ root }), /no symlinks/)
})

test('refreshes mutable local previews without requiring an author version bump', async (t) => {
  const root = await workspace(t)
  const output = path.join(root, 'dist')
  const first = await buildCatalog({ root, output })
  await writeFile(
    path.join(root, 'blocks/hello-world/package/app.mjs'),
    'console.log("Changed")'
  )
  const second = await buildCatalog({ root, output })
  assert.equal(second.channel, 'preview')
  assert.equal(second.blocks[0].version, first.blocks[0].version)
  assert.notEqual(second.blocks[0].sha256, first.blocks[0].sha256)
})
