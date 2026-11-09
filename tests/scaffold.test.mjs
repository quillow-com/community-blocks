import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cp, readFile, readdir, symlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import { addScreenshots, workspace } from './fixtures.mjs'
import { buildCatalog } from '../scripts/lib/catalog.mjs'

const exec = promisify(execFile)

test('scaffolds required metadata and screenshot guidance without fake images; real screenshots are required to build', async (t) => {
  const root = await workspace(t, false)
  await cp(
    new URL('../scripts/', import.meta.url),
    path.join(root, 'scripts'),
    { recursive: true }
  )
  await cp(
    new URL('../examples/', import.meta.url),
    path.join(root, 'examples'),
    { recursive: true }
  )
  const script = path.join(root, 'scripts/new.mjs')
  await symlink(
    fileURLToPath(new URL('../node_modules/', import.meta.url)),
    path.join(root, 'node_modules')
  )
  const { stdout } = await exec(process.execPath, [
    script,
    'my-widget',
    '--author',
    'contributor',
  ])
  assert.match(stdout, /small 156×156, medium 336×156, large 336×336/)
  const directory = path.join(root, 'blocks/my-widget')
  assert.deepEqual(await readdir(path.join(directory, 'screenshots')), [
    'README.md',
  ])
  const metadata = JSON.parse(
    await readFile(path.join(directory, 'metadata.json'))
  )
  assert.deepEqual(metadata.screenshots, [
    'screenshots/small.png',
    'screenshots/medium.png',
    'screenshots/large.png',
  ])
  await assert.rejects(buildCatalog({ root }), /small.png/)
  await addScreenshots(directory)
  const catalog = await buildCatalog({ root })
  assert.equal(catalog.blocks.length, 1)
  assert.equal(catalog.blocks[0].slug, 'my-widget')
  assert.equal(catalog.blocks[0].name, 'My Widget')
  assert.equal(catalog.blocks[0].version, '0.0.0')
  assert.deepEqual(
    JSON.parse(
      await readFile(path.join(root, '.release-please-manifest.json'))
    ),
    {}
  )
  assert.ok(
    JSON.parse(await readFile(path.join(root, 'release-please-config.json')))
      .packages['blocks/my-widget']
  )
  assert.deepEqual(catalog.blocks[0].author, {
    name: 'contributor',
    github: 'contributor',
  })
  const original = await readFile(
    path.join(root, 'blocks/my-widget/metadata.json')
  )
  await assert.rejects(
    exec(process.execPath, [script, 'my-widget', '--author', 'other'])
  )
  assert.deepEqual(
    await readFile(path.join(root, 'blocks/my-widget/metadata.json')),
    original
  )
  await assert.rejects(
    exec(process.execPath, [script, '../escape', '--author', 'other'])
  )
})
