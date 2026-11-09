import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { assertPath, limits } from '@quillow/skills/src/archive-contract.mjs'
import { buildCatalog } from './catalog.mjs'
import { parseMetadata } from './metadata.mjs'
import { manifestFilename, parseReleaseTag } from './release-config.mjs'

const exec = promisify(execFile)
const git = async (root, args, maxBuffer = 1024 * 1024) =>
  (await exec('git', args, { cwd: root, encoding: 'buffer', maxBuffer })).stdout

export async function loadTaggedBlock(root, tag, mainCommit) {
  const { slug, version } = parseReleaseTag(tag)
  if (!/^[a-f0-9]{40}$/.test(mainCommit)) throw new Error('Invalid main commit')
  const sourceCommit = (
    await git(root, ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`])
  )
    .toString('utf8')
    .trim()
  if (!/^[a-f0-9]{40}$/.test(sourceCommit))
    throw new Error('Invalid tagged commit')
  await git(root, ['merge-base', '--is-ancestor', sourceCommit, mainCommit])
  const state = JSON.parse(
    await git(root, ['show', `${sourceCommit}:${manifestFilename}`])
  )
  if (state[`blocks/${slug}`] !== version)
    throw new Error(`${tag}: tag is not a release-please version snapshot`)
  const prefix = `blocks/${slug}/`
  const listing = (
    await git(root, [
      'ls-tree',
      '-r',
      '-z',
      '--full-tree',
      sourceCommit,
      '--',
      prefix,
    ])
  ).toString('utf8')
  const files = new Map()
  for (const line of listing.split('\0').filter(Boolean)) {
    const tab = line.indexOf('\t')
    const [mode, type, oid] = line.slice(0, tab).split(' ')
    const name = line.slice(tab + 1).slice(prefix.length)
    if (path.posix.basename(name) === '.DS_Store') continue
    if (
      !['metadata.json', 'README.md', 'version.txt'].includes(name) &&
      !name.startsWith('package/') &&
      !name.startsWith('screenshots/')
    )
      continue
    assertPath(name.startsWith('package/') ? name.slice(8) : name)
    files.set(name, { mode, type, oid })
  }
  const read = async (name, limit) => {
    const file = files.get(name)
    if (
      !file ||
      file.type !== 'blob' ||
      !['100644', '100755'].includes(file.mode)
    )
      throw new Error(`${tag}/${name}: missing or non-regular tagged file`)
    const data = await git(root, ['cat-file', 'blob', file.oid], limit)
    if (data.length > limit) throw new Error(`${name}: size exceeded`)
    return data
  }
  const metadata = parseMetadata(
    JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(
        await read('metadata.json', 16 * 1024)
      )
    ),
    slug
  )
  if (
    metadata.version !== version ||
    (await read('version.txt', 64)).toString('utf8') !== version + '\n'
  )
    throw new Error(`${tag}: tagged version files do not agree`)
  const temporary = await mkdtemp(path.join(tmpdir(), 'quillow-tagged-block-'))
  try {
    const block = path.join(temporary, 'blocks', slug)
    await mkdir(block, { recursive: true })
    const copy = async (name, limit) => {
      const data = await read(name, limit)
      const destination = path.join(block, name)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, data, { flag: 'wx' })
      return data.length
    }
    await copy('metadata.json', 16 * 1024)
    await copy('README.md', 64 * 1024)
    for (const screenshot of metadata.screenshots)
      await copy(screenshot, 2 * 1024 * 1024)
    let expanded = 0
    let count = 0
    for (const name of [...files.keys()]
      .filter((name) => name.startsWith('package/'))
      .sort()) {
      if (path.posix.basename(name) === '.DS_Store') continue
      if (++count > limits.entries)
        throw new Error(`${tag}: too many package files`)
      expanded += await copy(
        name,
        Math.min(limits.file, limits.expanded - expanded)
      )
    }
    const output = path.join(temporary, 'dist')
    const catalog = await buildCatalog({
      root: temporary,
      output,
      sourceCommit,
    })
    const entry = catalog.blocks[0]
    return { entry, zip: await readFile(path.join(output, entry.filename)) }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
