import { execFile } from 'node:child_process'
import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual, promisify } from 'node:util'

import { discoverBlocks, sha256 } from './catalog.mjs'
import { compareVersions, parseMetadata, readMetadata } from './metadata.mjs'
import { manifestFilename, syncReleaseConfig } from './release-config.mjs'

const exec = promisify(execFile)
const git = (root, args) =>
  exec('git', args, {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
  })
const fingerprint = (records) =>
  sha256(JSON.stringify(records.sort(([a], [b]) => a.localeCompare(b, 'en'))))

async function currentPackage(directory, prefix = '') {
  const records = []
  for (const name of (await readdir(directory)).sort()) {
    if (name === '.DS_Store') continue
    const file = path.join(directory, name)
    const relative = prefix + name
    const stat = await lstat(file)
    if (stat.isDirectory())
      records.push(...(await currentPackage(file, relative + '/')))
    else if (stat.isFile())
      records.push([relative, sha256(await readFile(file))])
    else throw new Error(`${file}: only regular package files are allowed`)
  }
  return records
}

async function previousPackage(root, base, slug) {
  const prefix = `blocks/${slug}/package/`
  const { stdout } = await git(root, [
    'ls-tree',
    '-r',
    '-z',
    '--full-tree',
    base,
    '--',
    prefix,
  ])
  const records = []
  for (const item of stdout.toString('utf8').split('\0').filter(Boolean)) {
    const tab = item.indexOf('\t')
    const [mode, type, oid] = item.slice(0, tab).split(' ')
    if (type !== 'blob' || !['100644', '100755'].includes(mode))
      throw new Error(`${slug}: unsupported file in base package`)
    const filename = item.slice(tab + 1)
    if (path.posix.basename(filename) === '.DS_Store') continue
    const { stdout: bytes } = await git(root, ['cat-file', 'blob', oid])
    records.push([filename.slice(prefix.length), sha256(bytes)])
  }
  return records
}

export async function checkVersions(root, base, { release = false } = {}) {
  if (!/^[a-f0-9]{40}$/.test(base))
    throw new Error('--base must be a full commit SHA')
  await git(root, ['rev-parse', '--verify', `${base}^{commit}`])
  const { manifest } = await syncReleaseConfig(root, { check: true })
  const { stdout: state } = await git(root, [
    'show',
    `${base}:${manifestFilename}`,
  ])
  const previousManifest = JSON.parse(state.toString('utf8'))
  if (!release && !isDeepStrictEqual(manifest, previousManifest))
    throw new Error('Only a release PR may update the release-please manifest')
  const expectedManifest = { ...previousManifest }
  let bumped = 0
  for (const slug of await discoverBlocks(root)) {
    const filename = `blocks/${slug}/metadata.json`
    try {
      await git(root, ['cat-file', '-e', `${base}:${filename}`])
    } catch {
      if (release)
        throw new Error(`${slug}: release PRs cannot introduce blocks`)
      continue
    }
    const { stdout } = await git(root, ['show', `${base}:${filename}`])
    const previous = parseMetadata(JSON.parse(stdout.toString('utf8')), slug)
    const current = await readMetadata(path.join(root, 'blocks', slug), slug)
    const comparison = compareVersions(current.version, previous.version)
    if (!release) {
      if (comparison !== 0)
        throw new Error(
          `${slug}: leave versions unchanged; release-please owns version bumps`
        )
      continue
    }
    if (comparison < 0) throw new Error(`${slug}: version cannot go backwards`)
    if (!isDeepStrictEqual({ ...current, version: previous.version }, previous))
      throw new Error(
        `${slug}: release PRs may only change metadata.version, not other metadata`
      )
    const before = fingerprint(await previousPackage(root, base, slug))
    const after = fingerprint(
      await currentPackage(path.join(root, 'blocks', slug, 'package'))
    )
    if (before !== after)
      throw new Error(`${slug}: release PRs cannot change package files`)
    if (comparison > 0) {
      if (previous.version === '0.0.0' && current.version !== '1.0.0')
        throw new Error(`${slug}: the first release must be 1.0.0`)
      expectedManifest[`blocks/${slug}`] = current.version
      bumped++
    }
  }
  if (release) {
    if (!bumped) throw new Error('A release PR must increase a block version')
    if (!isDeepStrictEqual(expectedManifest, manifest))
      throw new Error('Release manifest changed outside the version bump')
    const { stdout } = await git(root, [
      'diff',
      '--name-only',
      '-z',
      base,
      '--',
    ])
    for (const name of stdout.toString('utf8').split('\0').filter(Boolean)) {
      if (
        name === manifestFilename ||
        /^blocks\/[a-z0-9-]+\/(metadata\.json|version\.txt|CHANGELOG\.md)$/.test(
          name
        )
      )
        continue
      throw new Error(
        `${name}: release PRs may only change version files and changelogs`
      )
    }
  }
}
