import {
  archiveDescriptor,
  loadArchive,
  matchArchive,
  slug,
  version,
} from './archive.mjs'
import {
  catalogUrl,
  discard,
  fetchBytes,
  githubAssetRedirect,
  readBounded,
  repository,
  sha256,
} from './upstream.mjs'

export { catalogUrl } from './upstream.mjs'
export const maxCatalogBytes = 5 * 1024 * 1024
export const cacheSeconds = 300

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'If-None-Match',
  'Access-Control-Expose-Headers': 'ETag, X-Catalog-Cache, Content-Disposition',
  'X-Content-Type-Options': 'nosniff',
}
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value, max) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  [...value].length <= max &&
  !/[\p{Cc}\uD800-\uDFFF]/u.test(value)

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
    archiveDescriptor(block)
  }
  return value
}

const parseCatalog = (bytes) =>
  validateCatalog(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  )

const cacheKey = (url, pathname) => {
  const key = new URL(url)
  key.protocol = 'https:'
  key.pathname = pathname
  key.search = ''
  return key
}

const matchCache = async (cache, key) => {
  try {
    return await cache?.match(new Request(key, { method: 'GET' }))
  } catch {
    /* Optional cache. */
  }
}

const storeCache = (cache, key, response, context) => {
  if (!cache) return
  const copy = response.clone()
  context.waitUntil(
    Promise.resolve()
      .then(() => cache.put(new Request(key, { method: 'GET' }), copy))
      .catch(() => discard(copy.body))
  )
}

const responseHeaders = (contentType, checksum) => ({
  ...corsHeaders,
  'Content-Type': contentType,
  'Cache-Control': `public, max-age=60, s-maxage=${cacheSeconds}`,
  ETag: `"${checksum}"`,
})

async function getCatalog(fetchUpstream, cache, key, context, signal) {
  const cached = await matchCache(cache, key)
  if (cached) {
    try {
      // Revalidate cached data too: an older deployment may have cached only
      // browsing metadata, before download metadata validation was introduced.
      const bytes = await readBounded(cached, signal, maxCatalogBytes)
      const catalog = parseCatalog(bytes)
      return {
        catalog,
        response: new Response(bytes, { headers: cached.headers }),
        hit: true,
      }
    } catch {
      signal.throwIfAborted()
    }
  }
  const bytes = await fetchBytes(fetchUpstream, catalogUrl, {
    signal,
    limit: maxCatalogBytes,
    accept: 'application/json',
    allowRedirect: (url) =>
      githubAssetRedirect(url) ||
      (url.protocol === 'https:' &&
        url.hostname === 'github.com' &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.search &&
        !url.hash &&
        /^\/quillow-com\/custom-blocks\/releases\/download\/catalog-[a-f0-9]{64}\/catalog\.json$/.test(
          url.pathname
        )),
  })
  const catalog = parseCatalog(bytes)
  const response = new Response(bytes, {
    headers: responseHeaders(
      'application/json; charset=utf-8',
      await sha256(bytes)
    ),
  })
  signal.throwIfAborted()
  storeCache(cache, key, response, context)
  return { catalog, response, hit: false }
}

async function getArchive(fetchUpstream, block, cache, key, context, signal) {
  const descriptor = archiveDescriptor(block)
  // Internal-only cache identity. Client query parameters remain forbidden.
  key.searchParams.set('sha256', descriptor.checksum)
  key.searchParams.set('size', String(descriptor.size))
  const cached = await matchCache(cache, key)
  if (signal.aborted) {
    discard(cached?.body)
    signal.throwIfAborted()
  }
  if (cached) return { response: cached, hit: true }

  const bytes = await loadArchive(fetchUpstream, descriptor, signal)
  const response = new Response(bytes, {
    headers: {
      ...responseHeaders('application/zip', descriptor.checksum),
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `attachment; filename="${descriptor.filename}"`,
    },
  })
  storeCache(cache, key, response, context)
  return { response, hit: false }
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
      const archive = matchArchive(url.pathname)
      if (url.pathname !== '/catalog.json' && !archive)
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
      let cache
      try {
        cache = getCache()
      } catch {
        /* Cache outages must not block a valid upstream response. */
      }
      const controller = new AbortController()
      // One deadline covers catalog lookup, redirects and archive body/hash verification.
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        let result = await getCatalog(
          fetchUpstream,
          cache,
          cacheKey(url, '/catalog.json'),
          context,
          controller.signal
        )
        if (archive) {
          discard(result.response.body)
          const block = result.catalog.blocks.find(
            (block) =>
              block.slug === archive.slug && block.version === archive.version
          )
          // Check membership BEFORE using a cached archive, so withdrawn/old
          // versions stop being served when the five-minute catalog cache expires.
          if (!block)
            return errorResponse(404, 'Released block version not found', head)
          result = await getArchive(
            fetchUpstream,
            block,
            cache,
            cacheKey(url, url.pathname),
            context,
            controller.signal
          )
        }
        const { response, hit } = result
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
        if (matched || head) {
          discard(response.body)
          return new Response(null, { status: matched ? 304 : 200, headers })
        }
        return new Response(response.body, { status: 200, headers })
      } catch {
        return errorResponse(
          controller.signal.aborted ? 504 : 502,
          archive
            ? 'Community block archive is temporarily unavailable. Please try again.'
            : 'Community catalog is temporarily unavailable. Please try again.',
          head
        )
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
