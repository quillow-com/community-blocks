import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { discoverBlocks } from './catalog.mjs'
import {
  compareVersions,
  readMetadataFile,
  regularFile,
  validSlug,
} from './metadata.mjs'

export const configFilename = 'release-please-config.json'
export const manifestFilename = '.release-please-manifest.json'

export function releaseConfig(slugs) {
  return {
    $schema:
      'https://raw.githubusercontent.com/googleapis/release-please/v17.3.0/schemas/config.json',
    'release-type': 'simple',
    draft: true,
    'force-tag-creation': true,
    'include-component-in-tag': true,
    'include-v-in-tag': true,
    'tag-separator': '-',
    'separate-pull-requests': true,
    'sequential-calls': true,
    'changelog-sections': [
      { type: 'feat', section: 'Features' },
      { type: 'fix', section: 'Bug Fixes' },
      { type: 'perf', section: 'Performance' },
      { type: 'refactor', section: 'Refactoring' },
      { type: 'docs', section: 'Documentation' },
      { type: 'chore', section: 'Maintenance' },
    ],
    packages: Object.fromEntries(
      [...slugs].sort().map((slug) => {
        if (!validSlug(slug)) throw new Error('Invalid release component')
        return [
          `blocks/${slug}`,
          {
            component: slug,
            'package-name': slug,
            'initial-version': '1.0.0',
            'extra-files': [
              { type: 'json', path: 'metadata.json', jsonpath: '$.version' },
            ],
          },
        ]
      })
    ),
  }
}

export async function readReleaseManifest(root) {
  const manifest = JSON.parse(
    await regularFile(path.join(root, manifestFilename), 1024 * 1024)
  )
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    throw new Error('Invalid release-please manifest')
  for (const [name, version] of Object.entries(manifest)) {
    if (
      !name.startsWith('blocks/') ||
      !validSlug(name.slice(7)) ||
      typeof version !== 'string'
    )
      throw new Error('Invalid release-please manifest entry')
    compareVersions(version, version)
    if (version === '0.0.0')
      throw new Error('New blocks must not invent a released manifest entry')
  }
  return manifest
}

export async function syncReleaseConfig(root, { check = false } = {}) {
  const slugs = await discoverBlocks(root)
  const manifestPath = path.join(root, manifestFilename)
  if (!check) {
    try {
      await regularFile(manifestPath, 1024 * 1024)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      await writeFile(manifestPath, '{}\n', { flag: 'wx' })
    }
  }
  const manifest = await readReleaseManifest(root)
  for (const slug of slugs) {
    const directory = path.join(root, 'blocks', slug)
    // Registration must work before the author captures the three real screenshots.
    // Builds/publication use readMetadata(), which also checks the image files.
    const metadata = await readMetadataFile(directory, slug)
    const versionFile = (
      await regularFile(path.join(directory, 'version.txt'), 64)
    ).toString('utf8')
    if (versionFile !== metadata.version + '\n')
      throw new Error(`${slug}: version.txt and metadata.version must match`)
    if (metadata.version !== (manifest[`blocks/${slug}`] ?? '0.0.0'))
      throw new Error(
        `${slug}: version must match release-please state; new blocks start at 0.0.0`
      )
  }
  const config = releaseConfig(slugs)
  if (check) {
    if (
      !isDeepStrictEqual(
        JSON.parse(await readFile(path.join(root, configFilename), 'utf8')),
        config
      )
    )
      throw new Error(
        'Release configuration is stale; run npm run sync:releases'
      )
  } else {
    await writeFile(
      path.join(root, configFilename),
      JSON.stringify(config, null, 2) + '\n'
    )
  }
  return { slugs, manifest, config }
}

export function parseReleaseTag(tag) {
  const match = typeof tag === 'string' && tag.match(/^(.+)-v(\d+\.\d+\.\d+)$/)
  if (!match || !validSlug(match[1]))
    throw new Error('Expected a block tag such as my-widget-v1.0.0')
  compareVersions(match[2], match[2])
  if (match[2] === '0.0.0')
    throw new Error('0.0.0 is an unreleased placeholder, not a release')
  return { slug: match[1], version: match[2] }
}

export function tagsFromActionOutputs(outputs = {}) {
  const paths = JSON.parse(outputs.paths_released ?? '[]')
  if (!Array.isArray(paths))
    throw new Error('Invalid release-please action outputs')
  return paths.map((name) => {
    if (
      typeof name !== 'string' ||
      !name.startsWith('blocks/') ||
      !validSlug(name.slice(7))
    )
      throw new Error('Invalid released path')
    const tag = outputs[`${name}--tag_name`]
    if (parseReleaseTag(tag).slug !== name.slice(7))
      throw new Error('Release output component mismatch')
    return tag
  })
}
