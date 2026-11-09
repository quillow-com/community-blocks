import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { packageDirectory } from '@quillow/skills/src/package-core.mjs'
import {
  readMetadata,
  regularFile,
  repository,
  validSlug,
} from './metadata.mjs'

export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex')

export function catalogEntry({
  metadata,
  manifest,
  sourceCommit,
  checksum,
  zipBytes,
  expandedBytes,
}) {
  const { slug, version } = metadata
  const releaseTag = `${slug}-v${version}`
  const filename = `${slug}-${version}.zip`
  const sourceRef = sourceCommit ?? 'main'
  return {
    slug,
    version,
    sourceCommit,
    name: manifest.name,
    description: metadata.description,
    author: metadata.author,
    license: metadata.license,
    tags: metadata.tags,
    screenshots: metadata.screenshots.map(
      (name) =>
        `https://raw.githubusercontent.com/${repository}/${sourceRef}/blocks/${slug}/${name}`
    ),
    sourceUrl: `https://github.com/${repository}/tree/${sourceRef}/blocks/${slug}`,
    manifest,
    hasEditor: !!manifest.editor,
    networkOrigins: manifest.network?.allowedOrigins ?? [],
    releaseTag,
    filename,
    downloadUrl: `https://github.com/${repository}/releases/download/${releaseTag}/${filename}`,
    sha256: checksum,
    zipBytes,
    expandedBytes,
  }
}

export async function discoverBlocks(root) {
  const directory = path.join(root, 'blocks')
  if (!(await lstat(directory)).isDirectory())
    throw new Error('blocks/ must be a real directory')
  const entries = await readdir(directory, { withFileTypes: true })
  const slugs = []
  for (const entry of entries) {
    if (['README.md', '.DS_Store'].includes(entry.name) && entry.isFile())
      continue
    if (!entry.isDirectory() || !validSlug(entry.name))
      throw new Error(
        `blocks/${entry.name}: expected a lowercase slug directory (no symlinks)`
      )
    slugs.push(entry.name)
  }
  return slugs.sort()
}

async function emitArchive(filename, bytes) {
  try {
    await writeFile(filename, bytes, { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    if (!(await regularFile(filename, 10 * 1024 * 1024)).equals(bytes))
      await writeFile(filename, bytes) // Local previews are mutable; published release assets are not.
  }
}

export async function buildCatalog({ root, output, sourceCommit = null }) {
  if (sourceCommit !== null && !/^[a-f0-9]{40}$/.test(sourceCommit))
    throw new Error('sourceCommit must be a full Git commit SHA')
  if (output) {
    const relative = path.relative(
      path.join(root, 'blocks'),
      path.resolve(output)
    )
    if (
      !relative ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== '..' &&
        !path.isAbsolute(relative))
    )
      throw new Error('Build output must be outside blocks/')
    await mkdir(output, { recursive: true })
    if (!(await lstat(output)).isDirectory())
      throw new Error('Build output must be a real directory')
  }
  const temporary = await mkdtemp(path.join(tmpdir(), 'quillow-catalog-'))
  const blocks = []
  try {
    for (const slug of await discoverBlocks(root)) {
      const directory = path.join(root, 'blocks', slug)
      const metadata = await readMetadata(directory, slug)
      if (
        !(await regularFile(path.join(directory, 'README.md'), 64 * 1024))
          .length
      )
        throw new Error(`${slug}: README.md must not be empty`)
      if (!(await lstat(path.join(directory, 'package'))).isDirectory())
        throw new Error(`${slug}: package/ must be a real directory`)
      const filename = `${slug}-${metadata.version}.zip`
      const result = await packageDirectory(
        path.join(directory, 'package'),
        path.join(temporary, filename)
      )
      const bytes = await readFile(path.join(temporary, filename))
      if (output) await emitArchive(path.join(output, filename), bytes)
      blocks.push(
        catalogEntry({
          metadata,
          manifest: result.manifest,
          sourceCommit,
          checksum: sha256(bytes),
          zipBytes: result.zipBytes,
          expandedBytes: result.expandedBytes,
        })
      )
    }
    const catalog = {
      schemaVersion: 1,
      repository,
      channel: 'preview',
      sourceCommit,
      blocks,
    }
    if (output) {
      const target = path.join(output, 'catalog.json')
      try {
        if (!(await lstat(target)).isFile())
          throw new Error('catalog.json cannot be a symlink or directory')
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      await writeFile(target, JSON.stringify(catalog, null, 2) + '\n')
    }
    return catalog
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
