import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

import { syncReleaseConfig } from '../scripts/lib/release-config.mjs'
import { screenshotLayouts } from '../scripts/lib/screenshots.mjs'

export const commit = 'a'.repeat(40)
export const metadata = () => ({
  schemaVersion: 1,
  slug: 'hello-world',
  version: '1.0.0',
  description: 'A useful community block.',
  author: { name: 'Quillow', github: 'quillow-com' },
  license: 'MIT',
  tags: ['starter'],
  screenshots: [
    'screenshots/small.png',
    'screenshots/medium.png',
    'screenshots/large.png',
  ],
})

// Synthetic images are test fixtures only; the scaffold never generates them.
export function pngImage(width, height) {
  const chunk = (name, data) => {
    const type = Buffer.from(name)
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(Buffer.concat([type, data])))
    return Buffer.concat([length, type, data, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // 8-bit grayscale, one filter byte before each scanline.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((width + 1) * height))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export async function addScreenshots(directory) {
  await mkdir(path.join(directory, 'screenshots'), { recursive: true })
  for (const { name, width, height } of screenshotLayouts)
    await writeFile(
      path.join(directory, 'screenshots', `${name}.png`),
      pngImage(width, height)
    )
}

export async function workspace(t, withBlock = true) {
  const root = await mkdtemp(path.join(tmpdir(), 'quillow-blocks-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'blocks'))
  await writeFile(path.join(root, 'blocks/README.md'), '# Community blocks\n')
  await writeFile(path.join(root, '.release-please-manifest.json'), '{}\n')
  if (withBlock) await addBlock(root)
  await syncReleaseConfig(root)
  return root
}

export async function addBlock(root, slug = 'hello-world', version = '1.0.0') {
  const directory = path.join(root, 'blocks', slug)
  await cp(new URL('../examples/hello-world/', import.meta.url), directory, {
    recursive: true,
  })
  const value = metadata()
  value.slug = slug
  value.version = version
  await addScreenshots(directory)
  await writeFile(path.join(directory, 'metadata.json'), JSON.stringify(value))
  await setVersion(root, version, slug)
  await syncReleaseConfig(root)
  return directory
}

export async function setVersion(root, version, slug = 'hello-world') {
  const filename = path.join(root, 'blocks', slug, 'metadata.json')
  const value = JSON.parse(await readFile(filename, 'utf8'))
  value.version = version
  await writeFile(filename, JSON.stringify(value))
  await writeFile(
    path.join(root, 'blocks', slug, 'version.txt'),
    version + '\n'
  )
  const manifestPath = path.join(root, '.release-please-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (version === '0.0.0') delete manifest[`blocks/${slug}`]
  else manifest[`blocks/${slug}`] = version
  await writeFile(manifestPath, JSON.stringify(manifest))
}

export async function updateMetadata(root, update) {
  const filename = path.join(root, 'blocks/hello-world/metadata.json')
  const value = JSON.parse(await readFile(filename, 'utf8'))
  Object.assign(value, update)
  await writeFile(filename, JSON.stringify(value))
}

export function fakeGitHub() {
  const releases = new Map()
  const data = new Map()
  const tags = new Map()
  const writes = []
  let next = 1
  let main = commit
  const api = {
    releases,
    data,
    writes,
    tags,
    async listReleases() {
      return structuredClone([...releases.values()])
    },
    async resolveTagCommit(tag) {
      if (!tags.has(tag)) throw new Error('Missing tag')
      return tags.get(tag)
    },
    async isAncestor(source, head) {
      return /^[a-f0-9]{40}$/.test(source) && head === main
    },
    setMain(value) {
      main = value
    },
    async getMainCommit() {
      return main
    },
    async getRelease(tag) {
      return releases.has(tag) ? structuredClone(releases.get(tag)) : null
    },
    async createRelease(tag, source, name) {
      writes.push(['create', tag])
      const release = {
        id: next++,
        tag_name: tag,
        target_commitish: source,
        name,
        draft: true,
        assets: [],
      }
      releases.set(tag, release)
      tags.set(tag, source)
      return structuredClone(release)
    },
    async upload(release, name, bytes) {
      writes.push(['upload', release.tag_name, name])
      const asset = { id: next++, name, size: bytes.length }
      data.set(asset.id, Buffer.from(bytes))
      releases.get(release.tag_name).assets.push(asset)
      return asset
    },
    async publishRelease(id, latest) {
      const release = [...releases.values()].find((item) => item.id === id)
      writes.push(['publish', release.tag_name, latest])
      release.draft = false
      return structuredClone(release)
    },
    async download(asset, limit) {
      const bytes = data.get(asset.id)
      if (bytes.length > limit) throw new Error('Asset too large')
      return bytes
    },
    async seed(tag, name, bytes, draft = false, source = commit) {
      const release = await api.createRelease(tag, source, tag)
      await api.upload(release, name, bytes)
      releases.get(tag).draft = draft
      writes.length = 0
    },
  }
  return api
}
