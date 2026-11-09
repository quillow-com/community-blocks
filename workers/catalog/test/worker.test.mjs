import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cacheSeconds,
  catalogUrl,
  createCatalogWorker,
  maxCatalogBytes,
} from '../src/catalog.mjs'

const commit = 'a'.repeat(40)

test('the runtime entrypoint exposes only the default handler', async () => {
  const entry = await import('../src/index.mjs')
  assert.deepEqual(Object.keys(entry), ['default'])
  assert.equal(typeof entry.default.fetch, 'function')
})
const record = () => ({
  schemaVersion: 1,
  repository: 'quillow-com/custom-blocks',
  channel: 'released',
  blocks: [
    {
      slug: 'crypto-coinpaprika',
      version: '1.0.0',
      sourceCommit: commit,
      name: 'Crypto Price · CoinPaprika',
      description: 'Live cryptocurrency prices.',
      author: { name: 'Ilya Suhodolskiy', github: 'suhodolskiy' },
      screenshots: ['small', 'medium', 'large'].map(
        (name) =>
          `https://raw.githubusercontent.com/quillow-com/custom-blocks/${commit}/blocks/crypto-coinpaprika/screenshots/${name}.png`
      ),
    },
  ],
})

function prepared(fetch = async () => Response.json(record()), options = {}) {
  const stored = new Map()
  const calls = []
  const tasks = []
  const cache = {
    async match(request) {
      return stored.get(request.url)?.clone()
    },
    async put(request, response) {
      const bytes = await response.arrayBuffer()
      stored.set(
        request.url,
        new Response(bytes, { headers: response.headers })
      )
    },
  }
  const worker = createCatalogWorker({
    fetch: async (...args) => {
      calls.push(args)
      return fetch(...args)
    },
    cache: () => cache,
    ...options,
  })
  const context = {
    waitUntil(task) {
      tasks.push(task)
    },
  }
  return {
    calls,
    stored,
    cache,
    request: (
      request = new Request('https://community-blocks.quillow.com/catalog.json')
    ) => worker.fetch(request, {}, context),
    async flush() {
      await Promise.all(tasks)
    },
  }
}

test('serves the fixed released catalog with JSON/CORS headers, bounds and a stable ETag', async () => {
  const state = prepared()
  const response = await state.request(
    new Request('https://community-blocks.quillow.com/catalog.json', {
      headers: {
        Authorization: 'Bearer private-client-token',
        Cookie: 'private=value',
        Origin: 'https://app.quillow.com',
      },
    })
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), record())
  assert.equal(
    response.headers.get('content-type'),
    'application/json; charset=utf-8'
  )
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.equal(response.headers.get('access-control-allow-credentials'), null)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(
    response.headers.get('cache-control'),
    `public, max-age=60, s-maxage=${cacheSeconds}`
  )
  assert.match(response.headers.get('etag'), /^"[a-f0-9]{64}"$/)
  assert.equal(response.headers.get('x-catalog-cache'), 'MISS')
  const [url, options] = state.calls[0]
  assert.equal(url, catalogUrl)
  assert.equal(options.redirect, 'manual')
  assert.deepEqual(options.headers, {
    Accept: 'application/json',
    'User-Agent': 'Quillow-Community-Catalog',
  })
  assert.equal(options.body, undefined)
  await state.flush()
})

test('reuses a cached response for GET/HEAD and handles strong, weak and wildcard conditional requests', async () => {
  const state = prepared()
  const first = await state.request()
  const etag = first.headers.get('etag')
  await first.arrayBuffer()
  await state.flush()
  const second = await state.request()
  assert.equal(second.headers.get('x-catalog-cache'), 'HIT')
  assert.deepEqual(await second.json(), record())
  const head = await state.request(
    new Request('https://community-blocks.quillow.com/catalog.json', {
      method: 'HEAD',
    })
  )
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.equal(head.headers.get('etag'), etag)
  for (const value of [etag, `W/${etag}`, '*', `"unrelated", ${etag}`]) {
    const response = await state.request(
      new Request('https://community-blocks.quillow.com/catalog.json', {
        headers: { 'If-None-Match': value },
      })
    )
    assert.equal(response.status, 304)
    assert.equal(await response.text(), '')
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
  }
  assert.equal(state.calls.length, 1)
})

test('handles a cold HEAD request without dropping the cached body', async () => {
  const state = prepared()
  const response = await state.request(
    new Request('https://community-blocks.quillow.com/catalog.json', {
      method: 'HEAD',
    })
  )
  assert.equal(response.status, 200)
  assert.equal(await response.text(), '')
  await state.flush()
  assert.deepEqual(await (await state.request()).json(), record())
  assert.equal(state.calls.length, 1)
})

test('preflight, unsupported paths/methods and proxy query arguments never call GitHub', async () => {
  const state = prepared()
  const preflight = await state.request(
    new Request('https://community-blocks.quillow.com/catalog.json', {
      method: 'OPTIONS',
    })
  )
  assert.equal(preflight.status, 204)
  assert.equal(
    preflight.headers.get('access-control-allow-methods'),
    'GET, HEAD, OPTIONS'
  )
  assert.equal(
    preflight.headers.get('access-control-allow-headers'),
    'If-None-Match'
  )
  for (const [url, method, status] of [
    ['/', 'GET', 404],
    ['/catalog.json?url=https://evil.example', 'GET', 400],
    ['/catalog.json?cache-bust=1', 'GET', 400],
    ['/catalog.json', 'POST', 405],
  ]) {
    const response = await state.request(
      new Request(`https://community-blocks.quillow.com${url}`, { method })
    )
    assert.equal(response.status, status)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
  }
  assert.equal(state.calls.length, 0)
})

test('follows only repository catalog releases and trusted GitHub asset redirects', async () => {
  const release = `https://github.com/quillow-com/custom-blocks/releases/download/catalog-${'b'.repeat(64)}/catalog.json`
  const asset =
    'https://release-assets.githubusercontent.com/github-production-release-asset/123/example?signature=public-test'
  const state = prepared(async (url) => {
    if (url === catalogUrl) return Response.redirect(release)
    if (url === release) return Response.redirect(asset)
    assert.equal(url, asset)
    return Response.json(record())
  })
  assert.deepEqual(await (await state.request()).json(), record())
  assert.equal(state.calls.length, 3)
  await state.flush()
})

for (const location of [
  'https://evil.example/catalog.json',
  'http://release-assets.githubusercontent.com/file',
  'https://user:password@release-assets.githubusercontent.com/file',
  'https://github.com/another/repository/releases/download/catalog-test/catalog.json',
  'https://github.com/quillow-com/custom-blocks/releases/download/preview/catalog.json',
]) {
  test(`rejects an untrusted redirect: ${location}`, async () => {
    const state = prepared(async () => Response.redirect(location))
    assert.equal((await state.request()).status, 502)
    assert.equal(state.calls.length, 1)
    assert.equal(state.stored.size, 0)
  })
}

test('redirect chains have a fixed bound', async () => {
  const state = prepared(async () =>
    Response.redirect(
      `https://github.com/quillow-com/custom-blocks/releases/download/catalog-${'b'.repeat(64)}/catalog.json`
    )
  )
  assert.equal((await state.request()).status, 502)
  assert.equal(state.calls.length, 5)
})

for (const status of [404, 429, 500]) {
  test(`upstream HTTP ${status} is not cached and exposes no raw error details`, async () => {
    const state = prepared(
      async () => new Response('private upstream details', { status })
    )
    const response = await state.request()
    assert.equal(response.status, 502)
    assert.doesNotMatch(await response.text(), /private upstream details/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal((await state.request()).status, 502)
    assert.equal(state.calls.length, 2)
    assert.equal(state.stored.size, 0)
  })
}

for (const [name, mutate] of [
  [
    'preview channel',
    (value) => {
      value.channel = 'preview'
    },
  ],
  [
    'unknown schema',
    (value) => {
      value.schemaVersion = 2
    },
  ],
  [
    'foreign repository',
    (value) => {
      value.repository = 'other/repo'
    },
  ],
  [
    'unreleased placeholder',
    (value) => {
      value.blocks[0].version = '0.0.0'
    },
  ],
  [
    'duplicate slug',
    (value) => {
      value.blocks.push(structuredClone(value.blocks[0]))
    },
  ],
  [
    'missing author',
    (value) => {
      delete value.blocks[0].author
    },
  ],
  [
    'non-string commit',
    (value) => {
      value.blocks[0].sourceCommit = [commit]
    },
  ],
  [
    'wrong screenshots count',
    (value) => {
      value.blocks[0].screenshots.pop()
    },
  ],
  [
    'external screenshot',
    (value) => {
      value.blocks[0].screenshots[0] = 'https://evil.example/image.png'
    },
  ],
]) {
  test(`invalid catalogs are never served/cached: ${name}`, async () => {
    const value = record()
    mutate(value)
    const state = prepared(async () => Response.json(value))
    assert.equal((await state.request()).status, 502)
    assert.equal(state.stored.size, 0)
  })
}

test('an empty released catalog remains valid', async () => {
  const value = record()
  value.blocks = []
  const state = prepared(async () => Response.json(value))
  assert.deepEqual(await (await state.request()).json(), value)
  await state.flush()
})

test('rejects malformed JSON/UTF-8 and oversized Content-Length before caching', async () => {
  for (const body of ['not json', new Uint8Array([0xff])]) {
    const state = prepared(async () => new Response(body))
    assert.equal((await state.request()).status, 502)
    assert.equal(state.stored.size, 0)
  }
  const state = prepared(
    async () =>
      new Response('{}', {
        headers: { 'Content-Length': String(maxCatalogBytes + 1) },
      })
  )
  assert.equal((await state.request()).status, 502)
  assert.equal(state.stored.size, 0)
})

test('bounds actual streamed bytes even if Content-Length is absent or dishonest', async () => {
  let cancelled = false
  const state = prepared(
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(maxCatalogBytes + 1))
          },
          cancel() {
            cancelled = true
          },
        }),
        { headers: { 'Content-Length': '1' } }
      )
  )
  assert.equal((await state.request()).status, 502)
  assert.equal(cancelled, true)
  assert.equal(state.stored.size, 0)
})

test('the upstream deadline also covers a stalled response body', async () => {
  let cancelled = false
  const state = prepared(
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true
          },
        })
      ),
    { timeoutMs: 10 }
  )
  assert.equal((await state.request()).status, 504)
  assert.equal(cancelled, true)
})

test('a stalled fetch is aborted and returns a retryable timeout', async () => {
  const state = prepared(
    async (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      ),
    { timeoutMs: 10 }
  )
  const response = await state.request()
  assert.equal(response.status, 504)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('cache read/write failures do not turn successful catalog reads into failures', async () => {
  const state = prepared()
  state.cache.match = async () => {
    throw new Error('Cache offline')
  }
  state.cache.put = () => {
    throw new Error('Cache offline')
  }
  const response = await state.request()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), record())
  await state.flush()
})

test('HEAD error responses omit bodies too', async () => {
  const state = prepared(async () => new Response('Offline', { status: 502 }))
  for (const [path, status] of [
    ['/', 404],
    ['/catalog.json?bad=1', 400],
    ['/catalog.json', 502],
  ]) {
    const response = await state.request(
      new Request(`https://community-blocks.quillow.com${path}`, {
        method: 'HEAD',
      })
    )
    assert.equal(response.status, status)
    assert.equal(await response.text(), '')
  }
})

test('cancelling a rejected body cannot hold the response open', async () => {
  const state = prepared(
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            return new Promise(() => {})
          },
        }),
        { status: 502 }
      )
  )
  assert.equal((await state.request()).status, 502)
})
