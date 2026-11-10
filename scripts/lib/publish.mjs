import { isDeepStrictEqual } from 'node:util'

import {
  limits,
  validateArchive,
} from '@quillow/skills/src/archive-contract.mjs'
import { catalogEntry, sha256 } from './catalog.mjs'
import {
  compareVersions,
  legacyRepository,
  parseMetadata,
  repository,
  validSlug,
} from './metadata.mjs'
import { parseReleaseTag } from './release-config.mjs'

const catalogLimit = 5 * 1024 * 1024

async function verifyAsset(github, release, name, bytes, limit) {
  const tag = release.tag_name
  const assets = release.assets.filter((asset) => asset.name === name)
  if (assets.length > 1) throw new Error(`${tag}: duplicate release assets`)
  if (!assets.length && !release.draft)
    throw new Error(
      `${tag}: published asset is missing; refusing to repair or replace a published version`
    )
  if (
    assets.length &&
    sha256(await github.download(assets[0], limit)) !== sha256(bytes)
  )
    throw new Error(
      `${tag}: published bytes differ; bump the block version instead of replacing assets`
    )
  return assets.length > 0
}

async function ensureRelease(
  github,
  existing,
  { tag, name, bytes, contentType, commit, title, latest }
) {
  const release = existing ?? (await github.createRelease(tag, commit, title))
  if (!release.assets.some((asset) => asset.name === name))
    await github.upload(release, name, bytes, contentType)
  if (release.draft || latest) await github.publishRelease(release.id, latest)
}

const recordLimit = 64 * 1024

const parseReleaseRecord = (bytes) => {
  const snapshot = JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(bytes)
  )
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    ![repository, legacyRepository].includes(snapshot.repository) ||
    typeof snapshot.sourceCommit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(snapshot.sourceCommit) ||
    Object.keys(snapshot).sort().join(',') !==
      'block,repository,schemaVersion,sourceCommit'
  )
    throw new Error('Invalid published release record')
  return snapshot
}

export async function verifyEntry(
  entry,
  zip,
  sourceCommit,
  entryRepository = repository
) {
  if (
    !entry ||
    ![repository, legacyRepository].includes(entryRepository) ||
    !/^[a-f0-9]{40}$/.test(sourceCommit ?? '') ||
    entry.sourceCommit !== sourceCommit
  )
    throw new Error('Invalid release source commit')
  const { slug, version } = parseReleaseTag(entry.releaseTag)
  const prefix = `https://raw.githubusercontent.com/${entryRepository}/${sourceCommit}/blocks/${slug}/`
  if (!Array.isArray(entry.screenshots))
    throw new Error('Invalid screenshot record')
  const screenshots = entry.screenshots.map((url) => {
    if (typeof url !== 'string' || !url.startsWith(prefix))
      throw new Error('Screenshot URL does not match the released commit')
    return url.slice(prefix.length)
  })
  const metadata = parseMetadata(
    {
      schemaVersion: 1,
      slug: entry.slug,
      version: entry.version,
      description: entry.description,
      author: entry.author,
      license: entry.license,
      tags: entry.tags,
      screenshots,
    },
    slug
  )
  if (metadata.version !== version)
    throw new Error('Release version does not match tag')
  const archive = await validateArchive(zip)
  const descriptor = {
    metadata,
    manifest: archive.manifest,
    sourceCommit,
    checksum: sha256(zip),
    zipBytes: archive.zipBytes,
    expandedBytes: archive.expandedBytes,
  }
  const expected = catalogEntry({ ...descriptor, repository: entryRepository })
  if (!isDeepStrictEqual(expected, entry))
    throw new Error(
      `${entry.releaseTag}: release record does not match archive or artifact identity`
    )
  // Validate historical records against their original identity first. Only a
  // newly published catalog uses canonical URLs; existing assets stay untouched.
  return catalogEntry(descriptor)
}

function recordBytes(entry) {
  const bytes = Buffer.from(
    JSON.stringify(
      {
        schemaVersion: 1,
        repository,
        sourceCommit: entry.sourceCommit,
        block: entry,
      },
      null,
      2
    ) + '\n'
  )
  if (bytes.length > recordLimit)
    throw new Error('Release record exceeds 64 KiB')
  return bytes
}

async function prepareBlock(github, tag, data, mainCommit) {
  const entry = await verifyEntry(data.entry, data.zip, data.entry.sourceCommit)
  if (
    entry.releaseTag !== tag ||
    (await github.resolveTagCommit(tag)) !== entry.sourceCommit ||
    !(await github.isAncestor(entry.sourceCommit, mainCommit))
  )
    throw new Error(`${tag}: tag source must be an approved main commit`)
  const release = await github.getRelease(tag)
  if (!release || release.prerelease)
    throw new Error(
      `${tag}: release-please must create the release before packaging`
    )
  if (release.draft && release.target_commitish !== entry.sourceCommit)
    throw new Error(`${tag}: draft target does not match its immutable tag`)
  await verifyAsset(github, release, entry.filename, data.zip, limits.zip)
  let record = recordBytes(entry)
  const records = release.assets.filter((asset) => asset.name === 'block.json')
  if (records.length === 1) {
    record = await github.download(records[0], recordLimit)
    const snapshot = parseReleaseRecord(record)
    const published = await verifyEntry(
      snapshot.block,
      data.zip,
      snapshot.sourceCommit,
      snapshot.repository
    )
    if (!isDeepStrictEqual(published, entry))
      throw new Error(`${tag}: published record does not match tagged source`)
  }
  await verifyAsset(github, release, 'block.json', record, recordLimit)
  return { release, entry, record }
}

export async function collectReleasedCatalog({
  github,
  activeSlugs,
  mainCommit,
}) {
  const active = new Set(activeSlugs)
  const candidates = new Map()
  for (const release of await github.listReleases()) {
    if (release.draft || release.prerelease) continue
    let parsed
    try {
      parsed = parseReleaseTag(release.tag_name)
    } catch {
      continue
    }
    const { slug, version } = parsed
    if (!active.has(slug)) continue
    const zipName = `${slug}-${version}.zip`
    const zipAssets = release.assets.filter((asset) => asset.name === zipName)
    const recordAssets = release.assets.filter(
      (asset) => asset.name === 'block.json'
    )
    if (zipAssets.length > 1 || recordAssets.length > 1)
      throw new Error(`${release.tag_name}: duplicate assets`)
    if (!zipAssets.length || !recordAssets.length) continue
    const previous = candidates.get(slug)
    if (!previous || compareVersions(version, previous.version) > 0)
      candidates.set(slug, {
        version,
        release,
        zip: zipAssets[0],
        record: recordAssets[0],
      })
  }
  const blocks = []
  for (const slug of [...candidates.keys()].sort()) {
    const candidate = candidates.get(slug)
    const snapshot = parseReleaseRecord(
      await github.download(candidate.record, recordLimit)
    )
    if (
      (await github.resolveTagCommit(candidate.release.tag_name)) !==
        snapshot.sourceCommit ||
      !(await github.isAncestor(snapshot.sourceCommit, mainCommit))
    )
      throw new Error('Published source does not match its tag/main history')
    const entry = await verifyEntry(
      snapshot.block,
      await github.download(candidate.zip, limits.zip),
      snapshot.sourceCommit,
      snapshot.repository
    )
    if (entry.slug !== slug || entry.releaseTag !== candidate.release.tag_name)
      throw new Error('Published record component mismatch')
    blocks.push(entry)
  }
  return { schemaVersion: 1, repository, channel: 'released', blocks }
}

export async function publishCatalog({
  mainCommit,
  activeSlugs,
  tags = [],
  loadRelease,
  github,
}) {
  if (!/^[a-f0-9]{40}$/.test(mainCommit ?? '') || !activeSlugs.every(validSlug))
    throw new Error('Invalid main commit or active slugs')
  if ((await github.getMainCommit()) !== mainCommit)
    throw new Error('Only the current main checkout can publish')
  const requested = new Set(tags)
  // Recover interrupted release-please drafts even when a retry has no new action outputs.
  for (const release of await github.listReleases()) {
    if (!release.draft || release.prerelease) continue
    try {
      if (activeSlugs.includes(parseReleaseTag(release.tag_name).slug))
        requested.add(release.tag_name)
    } catch {
      /* Not a block release. */
    }
  }
  const plans = []
  for (const tag of [...requested].sort()) {
    if (!activeSlugs.includes(parseReleaseTag(tag).slug))
      throw new Error(`${tag}: block is not registered in main`)
    plans.push(
      await prepareBlock(github, tag, await loadRelease(tag), mainCommit)
    )
  }
  // Validate all candidates before uploading anything; no ZIP is ever built from the current main tree.
  for (const { release, entry, record } of plans) {
    const data = await loadRelease(entry.releaseTag)
    if (
      !isDeepStrictEqual(
        await verifyEntry(data.entry, data.zip, entry.sourceCommit),
        entry
      )
    )
      throw new Error('Tagged source changed during publication')
    if (!release.assets.some((asset) => asset.name === entry.filename))
      await github.upload(release, entry.filename, data.zip, 'application/zip')
    if (!release.assets.some((asset) => asset.name === 'block.json'))
      await github.upload(release, 'block.json', record, 'application/json')
    if (release.draft) await github.publishRelease(release.id, false)
  }
  const catalog = await collectReleasedCatalog({
    github,
    activeSlugs,
    mainCommit,
  })
  const index = Buffer.from(JSON.stringify(catalog, null, 2) + '\n')
  if (index.length > catalogLimit) throw new Error('Catalog exceeds 5 MiB')
  if ((await github.getMainCommit()) !== mainCommit)
    return { blocks: catalog.blocks.length, superseded: true }
  // Content-addressed snapshots do not change merely because main receives unreleased code.
  const indexTag = `catalog-${sha256(index)}`
  const existing = await github.getRelease(indexTag)
  if (existing)
    await verifyAsset(github, existing, 'catalog.json', index, catalogLimit)
  await ensureRelease(github, existing, {
    tag: indexTag,
    name: 'catalog.json',
    bytes: index,
    contentType: 'application/json',
    commit: mainCommit,
    title: `Community catalog ${sha256(index).slice(0, 12)}`,
    latest: true,
  })
  return { blocks: catalog.blocks.length, superseded: false }
}
