export const repository = 'quillow-com/community-blocks'
// The last catalog published before the rename remains an immutable release.
export const catalogRepositories = [repository, 'quillow-com/custom-blocks']
export const catalogUrl = `https://github.com/${repository}/releases/latest/download/catalog.json`

export const discard = (body) => {
  void body?.cancel().catch(() => {})
}

export const sha256 = async (bytes) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export const githubAssetRedirect = (url) =>
  url.protocol === 'https:' &&
  !url.username &&
  !url.password &&
  !url.port &&
  !url.hash &&
  [
    'release-assets.githubusercontent.com',
    'objects.githubusercontent.com',
  ].includes(url.hostname)

export async function readBounded(response, signal, limit) {
  if (Number(response.headers.get('content-length')) > limit) {
    discard(response.body)
    throw new Error('Oversized response')
  }
  if (!response.body) throw new Error('Missing response body')
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  const abort = () => discard(reader)
  signal.addEventListener('abort', abort, { once: true })
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      length += value.byteLength
      if (length > limit) throw new Error('Oversized response')
      chunks.push(value)
    }
  } catch (error) {
    discard(reader)
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function fetchBytes(
  fetchUpstream,
  url,
  { signal, limit, accept, allowRedirect }
) {
  for (let redirects = 0; redirects <= 4; redirects++) {
    signal.throwIfAborted()
    const response = await fetchUpstream(url, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'manual',
      signal,
      // No client cookies, authorization, conditional/range headers or Origin.
      headers: { Accept: accept, 'User-Agent': 'Quillow-Community-Catalog' },
    })
    if (signal.aborted) {
      discard(response.body)
      signal.throwIfAborted()
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      discard(response.body)
      if (!location) throw new Error('Missing redirect')
      const next = new URL(location, url)
      if (!allowRedirect(next)) throw new Error('Unexpected upstream redirect')
      url = next.href
      continue
    }
    if (response.status !== 200) {
      discard(response.body)
      throw new Error('Upstream failure')
    }
    return readBounded(response, signal, limit)
  }
  throw new Error('Too many redirects')
}
