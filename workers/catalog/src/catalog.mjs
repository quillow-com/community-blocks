export const catalogUrl =
  'https://github.com/quillow-com/custom-blocks/releases/latest/download/catalog.json'
export const maxCatalogBytes = 5 * 1024 * 1024
export const cacheSeconds = 300

const repository = 'quillow-com/custom-blocks'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, X-Catalog-Cache',
  'X-Content-Type-Options': 'nosniff',
}
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value, max) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  [...value].length <= max &&
  !/[\p{Cc}\uD800-\uDFFF]/u.test(value)
const slug = (value) =>
  typeof value === 'string' &&
  value.length <= 64 &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
const version = (value) =>
  typeof value === 'string' &&
  /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value) &&
  value !== '0.0.0'

export function validateCatalog(value) {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.repository !== repository ||
    value.channel !== 'released' ||
    !Array.isArray(value.blocks)
  )
    throw new Error('Invalid released catalog')
  const seen = new Set()
  for (const block of value.blocks) {
    if (
      !record(block) ||
      !slug(block.slug) ||
      seen.has(block.slug) ||
      !version(block.version) ||
      typeof block.sourceCommit !== 'string' ||
      !/^[a-f0-9]{40}$/.test(block.sourceCommit ?? '') ||
      !text(block.name, 80) ||
      !text(block.description, 280) ||
      !record(block.author) ||
      !text(block.author.name, 80) ||
      typeof block.author.github !== 'string' ||
      !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(
        block.author.github
      )
    )
      throw new Error('Invalid catalog block')
    seen.add(block.slug)
    const prefix = `https://raw.githubusercontent.com/${repository}/${block.sourceCommit}/blocks/${block.slug}/`
    if (
      !Array.isArray(block.screenshots) ||
      block.screenshots.length !== 3 ||
      new Set(block.screenshots).size !== 3 ||
      !block.screenshots.every(
        (url) =>
          typeof url === 'string' &&
          url.startsWith(prefix) &&
          /^screenshots\/[A-Za-z0-9_/-]+\.(png|jpg|jpeg|webp)$/.test(
            url.slice(prefix.length)
          ) &&
          !url.slice(prefix.length).includes('//')
      )
    )
      throw new Error('Invalid catalog screenshots')
  }
  return value
}

function allowedRedirect(url) {
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return false
  if (url.hostname === 'github.com')
    return (
      /^\/quillow-com\/custom-blocks\/releases\/download\/catalog-[a-f0-9]{64}\/catalog\.json$/.test(
        url.pathname
      ) && !url.search
    )
  return [
    'release-assets.githubusercontent.com',
    'objects.githubusercontent.com',
  ].includes(url.hostname)
}

async function readBounded(response, signal) {
  if (Number(response.headers.get('content-length')) > maxCatalogBytes) {
    void response.body?.cancel().catch(() => {})
    throw new Error('Oversized catalog')
  }
  if (!response.body) throw new Error('Missing catalog body')
  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  const abort = () => {
    void reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      length += value.byteLength
      if (length > maxCatalogBytes) {
        void reader.cancel().catch(() => {})
        throw new Error('Oversized catalog')
      }
      chunks.push(value)
    }
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

class UpstreamError extends Error {
  constructor(status) {
    super('Catalog unavailable')
    this.status = status
  }
}

async function loadCatalog(fetchUpstream, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let url = catalogUrl
  try {
    for (let redirects = 0; redirects <= 4; redirects++) {
      const response = await fetchUpstream(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        // Never forward client cookies, authorization, Origin or arbitrary headers.
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Quillow-Community-Catalog',
        },
      })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        void response.body?.cancel().catch(() => {})
        if (!location) throw new Error('Missing redirect')
        const next = new URL(location, url)
        if (!allowedRedirect(next))
          throw new Error('Unexpected catalog redirect')
        url = next.href
        continue
      }
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {})
        throw new Error('Upstream failure')
      }
      const bytes = await readBounded(response, controller.signal)
      validateCatalog(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      )
      return bytes
    }
    throw new Error('Too many redirects')
  } catch {
    throw new UpstreamError(controller.signal.aborted ? 504 : 502)
  } finally {
    clearTimeout(timer)
  }
}

function errorResponse(status, message, head = false) {
  return new Response(head ? null : JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export function createCatalogWorker({
  fetch: fetchUpstream = globalThis.fetch,
  cache: getCache = () => globalThis.caches.default,
  timeoutMs = 10000,
} = {}) {
  return {
    async fetch(request, _env, context) {
      const url = new URL(request.url)
      const head = request.method === 'HEAD'
      if (url.pathname !== '/catalog.json')
        return errorResponse(404, 'Not found', head)
      if (url.search)
        return errorResponse(400, 'Query parameters are not supported', head)
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const response = errorResponse(405, 'Method not allowed')
        response.headers.set('Allow', 'GET, HEAD, OPTIONS')
        return response
      }
      if (request.method === 'OPTIONS')
        return new Response(null, {
          status: 204,
          headers: { ...corsHeaders, 'Access-Control-Max-Age': '86400' },
        })
      // One public representation per endpoint; user headers never affect the cache key.
      url.protocol = 'https:'
      const key = new Request(url.href, { method: 'GET' })
      let cache
      let response
      try {
        cache = getCache()
        response = await cache.match(key)
      } catch {
        /* Cache outages must not block a valid upstream response. */
      }
      const hit = !!response
      if (!response) {
        try {
          const bytes = await loadCatalog(fetchUpstream, timeoutMs)
          const digest = await crypto.subtle.digest('SHA-256', bytes)
          const etag = `"${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}"`
          response = new Response(bytes, {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': `public, max-age=60, s-maxage=${cacheSeconds}`,
              ETag: etag,
            },
          })
          if (cache) {
            const copy = response.clone()
            context.waitUntil(
              Promise.resolve()
                .then(() => cache.put(key, copy))
                .catch(() => {
                  void copy.body?.cancel().catch(() => {})
                })
            )
          }
        } catch (error) {
          return errorResponse(
            error instanceof UpstreamError ? error.status : 502,
            'Community catalog is temporarily unavailable. Please try again.',
            head
          )
        }
      }
      const headers = new Headers(response.headers)
      headers.set('X-Catalog-Cache', hit ? 'HIT' : 'MISS')
      const matched = request.headers
        .get('if-none-match')
        ?.split(',')
        .some(
          (value) =>
            value.trim() === '*' ||
            value.trim().replace(/^W\//, '') === headers.get('etag')
        )
      if (matched || request.method === 'HEAD') {
        void response.body?.cancel().catch(() => {})
        return new Response(null, { status: matched ? 304 : 200, headers })
      }
      return new Response(response.body, { status: 200, headers })
    },
  }
}
