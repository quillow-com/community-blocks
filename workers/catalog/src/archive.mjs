import {
  fetchBytes,
  githubAssetRedirect,
  repository,
  sha256,
} from './upstream.mjs'

export const maxArchiveBytes = 10 * 1024 * 1024
export const slug = (value) =>
  typeof value === 'string' &&
  value.length <= 64 &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
export const version = (value) =>
  typeof value === 'string' &&
  /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value) &&
  value !== '0.0.0'

export const matchArchive = (pathname) => {
  const match = /^\/blocks\/([^/]+)\/([^/]+)\.zip$/.exec(pathname)
  return match && slug(match[1]) && version(match[2])
    ? { slug: match[1], version: match[2] }
    : undefined
}

export const archiveDescriptor = (block) => {
  const filename = `${block.slug}-${block.version}.zip`
  const releaseTag = `${block.slug}-v${block.version}`
  const url = `https://github.com/${repository}/releases/download/${releaseTag}/${filename}`
  if (
    block.filename !== filename ||
    block.releaseTag !== releaseTag ||
    block.downloadUrl !== url ||
    typeof block.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(block.sha256) ||
    !Number.isSafeInteger(block.zipBytes) ||
    block.zipBytes < 1 ||
    block.zipBytes > maxArchiveBytes
  )
    throw new Error('Invalid catalog archive')
  return { url, filename, checksum: block.sha256, size: block.zipBytes }
}

export async function loadArchive(fetchUpstream, descriptor, signal) {
  const bytes = await fetchBytes(fetchUpstream, descriptor.url, {
    signal,
    limit: descriptor.size,
    accept: 'application/zip, application/octet-stream',
    allowRedirect: (url) =>
      githubAssetRedirect(url) || url.href === descriptor.url,
  })
  // This is an integrity check, not an archive/security validator. The upload API
  // must still run its full Custom Block ZIP validation before applying a block.
  if (
    bytes.byteLength !== descriptor.size ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04 ||
    (await sha256(bytes)) !== descriptor.checksum
  )
    throw new Error('Archive integrity mismatch')
  signal.throwIfAborted()
  return bytes
}
