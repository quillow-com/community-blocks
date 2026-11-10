import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'

import { screenshotLayouts, validateScreenshot } from './screenshots.mjs'

export const repository = 'quillow-com/community-blocks'
// Published release records retain the repository name used at publication.
export const legacyRepository = 'quillow-com/custom-blocks'
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const versionPattern = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/

export function validSlug(value) {
  return (
    typeof value === 'string' && value.length <= 64 && slugPattern.test(value)
  )
}

export function compareVersions(a, b) {
  if (!versionPattern.test(a) || !versionPattern.test(b))
    throw new Error(
      'Versions must be stable X.Y.Z numbers (each at most 999999)'
    )
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return Math.sign(left[i] - right[i])
  }
  return 0
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fields(value, allowed, label) {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new Error(`${label}: unknown fields or invalid object`)
}

function text(value, max, label) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    [...value].length > max ||
    /[\p{Cc}\uD800-\uDFFF]/u.test(value)
  )
    throw new Error(
      `${label}: expected 1–${max} characters without control characters`
    )
}

export function parseMetadata(value, slug) {
  fields(
    value,
    [
      'schemaVersion',
      'slug',
      'version',
      'description',
      'author',
      'license',
      'tags',
      'screenshots',
    ],
    'metadata'
  )
  if (value.schemaVersion !== 1 || !validSlug(slug) || value.slug !== slug)
    throw new Error(
      'metadata: schemaVersion must be 1 and slug must match its directory'
    )
  if (typeof value.version !== 'string' || !versionPattern.test(value.version))
    throw new Error('metadata.version: expected a stable X.Y.Z version')
  text(value.description, 280, 'metadata.description')
  fields(value.author, ['name', 'github'], 'metadata.author')
  text(value.author.name, 80, 'metadata.author.name')
  if (
    typeof value.author.github !== 'string' ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value.author.github)
  )
    throw new Error(
      'metadata.author.github: expected a GitHub username or organization'
    )
  if (value.license !== 'MIT')
    throw new Error('metadata.license: community submissions must use MIT')
  if (
    !Array.isArray(value.tags) ||
    value.tags.length > 8 ||
    !value.tags.every(
      (tag) => typeof tag === 'string' && /^[a-z][a-z0-9-]{0,29}$/.test(tag)
    ) ||
    new Set(value.tags).size !== value.tags.length
  )
    throw new Error('metadata.tags: expected at most 8 unique lowercase tags')
  if (
    !Array.isArray(value.screenshots) ||
    value.screenshots.length !== screenshotLayouts.length ||
    new Set(value.screenshots).size !== value.screenshots.length ||
    !value.screenshots.every(
      (name) =>
        typeof name === 'string' &&
        name.length <= 240 &&
        /^screenshots\/[A-Za-z0-9_/-]+\.(png|jpg|jpeg|webp)$/.test(name) &&
        path.posix.normalize(name) === name
    )
  )
    throw new Error(
      'metadata.screenshots: expected exactly 3 unique local PNG/JPEG/WebP paths under screenshots/, ordered small (156×156), medium (336×156), large (336×336)'
    )
  return structuredClone(value)
}

export async function regularFile(filename, limit) {
  const stat = await lstat(filename)
  if (!stat.isFile() || stat.size > limit)
    throw new Error(
      `${filename}: expected a regular file of at most ${limit} bytes`
    )
  const bytes = await readFile(filename)
  if (bytes.length > limit) throw new Error(`${filename}: file size exceeded`)
  return bytes
}

export async function readMetadataFile(directory, slug) {
  const bytes = await regularFile(
    path.join(directory, 'metadata.json'),
    16 * 1024
  )
  return parseMetadata(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    slug
  )
}

export async function readMetadata(directory, slug) {
  const metadata = await readMetadataFile(directory, slug)
  for (const [index, name] of metadata.screenshots.entries()) {
    let current = directory
    for (const segment of name.split('/').slice(0, -1)) {
      current = path.join(current, segment)
      if (!(await lstat(current)).isDirectory())
        throw new Error(`${name}: screenshot directories cannot be symlinks`)
    }
    const bytes = await regularFile(path.join(directory, name), 2 * 1024 * 1024)
    validateScreenshot(bytes, name, screenshotLayouts[index])
  }
  return metadata
}
