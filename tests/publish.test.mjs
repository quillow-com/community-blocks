import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  addBlock,
  commit,
  fakeGitHub,
  setVersion,
  updateMetadata,
  workspace,
} from './fixtures.mjs'
import { buildCatalog, sha256 } from '../scripts/lib/catalog.mjs'
import {
  collectReleasedCatalog,
  publishCatalog,
} from '../scripts/lib/publish.mjs'

async function snapshot(root, slug = 'hello-world', sourceCommit = commit) {
  const output = path.join(root, 'dist')
  const catalog = await buildCatalog({ root, output, sourceCommit })
  const entry = catalog.blocks.find((block) => block.slug === slug)
  return { entry, zip: await readFile(path.join(output, entry.filename)) }
}

async function prepared(t) {
  const root = await workspace(t)
  const github = fakeGitHub()
  const data = await snapshot(root)
  const releases = new Map([[data.entry.releaseTag, data]])
  await github.createRelease(
    data.entry.releaseTag,
    commit,
    'Release-please draft'
  )
  github.writes.length = 0
  return {
    root,
    github,
    releases,
    mainCommit: commit,
    activeSlugs: ['hello-world'],
    tags: [data.entry.releaseTag],
    loadRelease: async (tag) => releases.get(tag),
  }
}

async function indexFor(options) {
  const catalog = await collectReleasedCatalog(options)
  const bytes = Buffer.from(JSON.stringify(catalog, null, 2) + '\n')
  return { catalog, tag: `catalog-${sha256(bytes)}` }
}

test('attaches ZIP and block.json before publishing the RP draft; catalog is latest and content addressed', async (t) => {
  const options = await prepared(t)
  await publishCatalog(options)
  const { tag, catalog } = await indexFor(options)
  assert.equal(catalog.channel, 'released')
  assert.deepEqual(options.github.writes, [
    ['upload', 'hello-world-v1.0.0', 'hello-world-1.0.0.zip'],
    ['upload', 'hello-world-v1.0.0', 'block.json'],
    ['publish', 'hello-world-v1.0.0', false],
    ['create', tag],
    ['upload', tag, 'catalog.json'],
    ['publish', tag, true],
  ])
  options.github.writes.length = 0
  await publishCatalog(options)
  assert.deepEqual(options.github.writes, [['publish', tag, true]])
})

test('unreleased main code, metadata and brand-new blocks never leak into the released catalog', async (t) => {
  const options = await prepared(t)
  await publishCatalog(options)
  const before = await indexFor(options)
  await writeFile(
    path.join(options.root, 'blocks/hello-world/package/app.mjs'),
    '// unreleased'
  )
  await updateMetadata(options.root, { description: 'Not released yet.' })
  await addBlock(options.root, 'new-block', '0.0.0')
  options.activeSlugs.push('new-block')
  options.tags = []
  options.loadRelease = () => {
    throw new Error('Must not rebuild any released or unreleased block')
  }
  options.mainCommit = 'b'.repeat(40)
  options.github.setMain(options.mainCommit)
  options.github.writes.length = 0
  await publishCatalog(options)
  assert.deepEqual(await indexFor(options), before)
  assert.deepEqual(options.github.writes, [['publish', before.tag, true]])
})

test('all candidate assets are checked before any upload and changed immutable bytes fail', async (t) => {
  const options = await prepared(t)
  await addBlock(options.root, 'another-block')
  const another = await snapshot(options.root, 'another-block')
  options.releases.set(another.entry.releaseTag, another)
  options.activeSlugs.push('another-block')
  options.tags.push(another.entry.releaseTag)
  await options.github.createRelease(another.entry.releaseTag, commit, 'Draft')
  await options.github.upload(
    await options.github.getRelease('hello-world-v1.0.0'),
    'hello-world-1.0.0.zip',
    Buffer.from('different bytes')
  )
  options.github.writes.length = 0
  await assert.rejects(publishCatalog(options), /published bytes differ/)
  assert.deepEqual(options.github.writes, [])
})

test('an interrupted ZIP upload leaves a draft and never promotes an index', async (t) => {
  const options = await prepared(t)
  options.github.upload = async () => {
    throw new Error('Upload interrupted')
  }
  await assert.rejects(publishCatalog(options), /Upload interrupted/)
  assert.deepEqual(options.github.writes, [])
  assert.equal(options.github.releases.get('hello-world-v1.0.0').draft, true)
})

test('recovers a tagged draft without action outputs and reuses an existing ZIP', async (t) => {
  const options = await prepared(t)
  const data = options.releases.get('hello-world-v1.0.0')
  await options.github.upload(
    await options.github.getRelease(data.entry.releaseTag),
    data.entry.filename,
    data.zip
  )
  options.github.writes.length = 0
  options.tags = []
  await publishCatalog(options)
  assert.deepEqual(options.github.writes.slice(0, 2), [
    ['upload', data.entry.releaseTag, 'block.json'],
    ['publish', data.entry.releaseTag, false],
  ])
})

test('requires an RP-created release, the immutable tag source and main ancestry', async (t) => {
  const options = await prepared(t)
  const release = options.github.releases.get('hello-world-v1.0.0')
  release.target_commitish = 'b'.repeat(40)
  await assert.rejects(publishCatalog(options), /draft target/)
  release.target_commitish = commit
  options.github.tags.set(release.tag_name, 'b'.repeat(40))
  await assert.rejects(publishCatalog(options), /approved main commit/)
  options.github.tags.set(release.tag_name, commit)
  options.github.isAncestor = async () => false
  await assert.rejects(publishCatalog(options), /approved main commit/)
  options.github.isAncestor = async () => true
  options.github.releases.clear()
  await assert.rejects(publishCatalog(options), /release-please must create/)
  assert.deepEqual(options.github.writes, [])
})

test('published incomplete versions are skipped by catalog collection but cannot be silently repaired', async (t) => {
  const options = await prepared(t)
  options.github.releases.get('hello-world-v1.0.0').draft = false
  assert.deepEqual((await collectReleasedCatalog(options)).blocks, [])
  await assert.rejects(publishCatalog(options), /published asset is missing/)
  assert.deepEqual(options.github.writes, [])
})

test('chooses the highest complete stable version, retains history and supports withdrawal', async (t) => {
  const options = await prepared(t)
  await publishCatalog(options)
  await setVersion(options.root, '1.2.0')
  const newer = await snapshot(options.root)
  options.releases.set(newer.entry.releaseTag, newer)
  await options.github.createRelease(newer.entry.releaseTag, commit, 'Draft')
  options.tags = [newer.entry.releaseTag]
  await publishCatalog(options)
  assert.equal((await indexFor(options)).catalog.blocks[0].version, '1.2.0')
  assert.ok(options.github.releases.has('hello-world-v1.0.0'))
  const incomplete = await options.github.createRelease(
    'hello-world-v2.0.0',
    commit,
    'Incomplete'
  )
  options.github.releases.get(incomplete.tag_name).draft = false
  const prerelease = await options.github.createRelease(
    'hello-world-v3.0.0',
    commit,
    'Prerelease'
  )
  Object.assign(options.github.releases.get(prerelease.tag_name), {
    draft: false,
    prerelease: true,
  })
  assert.equal((await indexFor(options)).catalog.blocks[0].version, '1.2.0')
  options.activeSlugs = []
  options.tags = []
  await publishCatalog(options)
  assert.deepEqual((await indexFor(options)).catalog.blocks, [])
})

test('tampered ZIPs, records and artifact paths fail before writes', async (t) => {
  const options = await prepared(t)
  const data = options.releases.get('hello-world-v1.0.0')
  data.entry.filename = '../secret.zip'
  await assert.rejects(publishCatalog(options), /artifact identity/)
  data.entry.filename = 'hello-world-1.0.0.zip'
  data.entry.sha256 = '0'.repeat(64)
  await assert.rejects(publishCatalog(options), /does not match archive/)
  assert.deepEqual(options.github.writes, [])
})

test('published record tampering or a moved tag blocks catalog promotion', async (t) => {
  const options = await prepared(t)
  await publishCatalog(options)
  options.tags = []
  options.github.writes.length = 0
  options.github.tags.set('hello-world-v1.0.0', 'b'.repeat(40))
  await assert.rejects(publishCatalog(options), /tag\/main history/)
  options.github.tags.set('hello-world-v1.0.0', commit)
  const release = options.github.releases.get('hello-world-v1.0.0')
  const recordAsset = release.assets.find(
    (asset) => asset.name === 'block.json'
  )
  const record = JSON.parse(
    await options.github.download(recordAsset, 64 * 1024)
  )
  record.block.sha256 = '0'.repeat(64)
  const bytes = Buffer.from(JSON.stringify(record))
  options.github.data.set(recordAsset.id, bytes)
  recordAsset.size = bytes.length
  await assert.rejects(publishCatalog(options), /does not match archive/)
  assert.deepEqual(options.github.writes, [])
})

test('rejects a stale checkout and does not promote a catalog when main advances mid-run', async (t) => {
  const options = await prepared(t)
  options.github.setMain('b'.repeat(40))
  await assert.rejects(publishCatalog(options), /current main checkout/)
  options.github.setMain(commit)
  let calls = 0
  options.github.getMainCommit = async () =>
    ++calls === 1 ? commit : 'b'.repeat(40)
  assert.deepEqual(await publishCatalog(options), {
    blocks: 1,
    superseded: true,
  })
  assert.equal(
    [...options.github.releases.keys()].some((tag) =>
      tag.startsWith('catalog-')
    ),
    false
  )
})

test('an empty registry publishes a valid empty released catalog', async () => {
  const github = fakeGitHub()
  await publishCatalog({ mainCommit: commit, activeSlugs: [], github })
  assert.deepEqual(
    github.writes.map(([type]) => type),
    ['create', 'upload', 'publish']
  )
})
