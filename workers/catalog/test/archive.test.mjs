import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { maxArchiveBytes } from '../src/archive.mjs'
import { cacheSeconds, catalogUrl } from '../src/catalog.mjs'
import { checksum, legacyRecord, prepared, record, zip } from './helpers.mjs'

const origin = 'https://community-blocks.quillow.com'
const archivePath = '/blocks/crypto-coinpaprika/1.0.0.zip'
const downloadUrl = record().blocks[0].downloadUrl
const assetUrl =
  'https://release-assets.githubusercontent.com/github-production-release-asset/123/archive?signature=public-test'
const request = (init = {}, path = archivePath) =>
  new Request(`${origin}${path}`, init)
const zipState = (
  fetchArchive = async () => new Response(zip),
  options,
  getRecord = record
) =>
  prepared(async (url, init) => {
    if (url === catalogUrl) return Response.json(getRecord())
    return fetchArchive(url, init)
  }, options)
const cachedArchives = (state) =>
  [...state.stored.keys()].filter((key) => key.includes('/blocks/'))

test('legacy catalog ZIPs may redirect only to the same release under the renamed repository', async () => {
  const legacy = legacyRecord()
  const legacyUrl = legacy.blocks[0].downloadUrl
  const state = zipState(
    async (url) => {
      if (url === legacyUrl) return Response.redirect(downloadUrl)
      if (url === downloadUrl) return Response.redirect(assetUrl)
      assert.equal(url, assetUrl)
      return new Response(zip)
    },
    undefined,
    () => legacy
  )
  const response = await state.request(request())
  assert.equal(response.status, 200)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), zip)
  assert.deepEqual(
    state.calls.map(([url]) => url),
    [catalogUrl, legacyUrl, downloadUrl, assetUrl]
  )
  await state.flush()
})

for (const location of [
  downloadUrl.replace(
    '/crypto-coinpaprika-v1.0.0/',
    '/crypto-coinpaprika-v2.0.0/'
  ),
  downloadUrl.replace('quillow-com/community-blocks', 'another/repo'),
  downloadUrl.replace('https:', 'http:'),
  `${downloadUrl}?token=not-allowed`,
  `${downloadUrl}#fragment`,
]) {
  test(`legacy ZIP redirects still reject an unrelated target: ${location}`, async () => {
    const state = zipState(
      async () => Response.redirect(location),
      undefined,
      legacyRecord
    )
    assert.equal((await state.request(request())).status, 502)
    assert.equal(state.calls.length, 2)
    await state.flush()
    assert.deepEqual(cachedArchives(state), [])
  })
}

test('serves verified ZIP bytes with safe CORS/download headers and a checksum ETag', async () => {
  const state = zipState(async (url) => {
    if (url === downloadUrl) return Response.redirect(assetUrl)
    assert.equal(url, assetUrl)
    return new Response(zip, {
      headers: {
        'Set-Cookie': 'upstream=private',
        'Content-Disposition': 'inline; filename=untrusted.html',
        'Content-Type': 'text/html',
        'X-Internal': 'private upstream details',
      },
    })
  })
  const response = await state.request(
    request({
      headers: {
        Authorization: 'Bearer client-test',
        Cookie: 'client=private',
        Origin: 'https://app.quillow.com',
        Range: 'bytes=0-1',
        'If-None-Match': '"unrelated"',
      },
    })
  )
  assert.equal(response.status, 200)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), zip)
  assert.equal(response.headers.get('content-type'), 'application/zip')
  assert.equal(response.headers.get('content-length'), String(zip.byteLength))
  assert.equal(
    response.headers.get('content-disposition'),
    'attachment; filename="crypto-coinpaprika-1.0.0.zip"'
  )
  assert.equal(response.headers.get('etag'), `"${checksum}"`)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.equal(response.headers.get('access-control-allow-credentials'), null)
  assert.match(
    response.headers.get('access-control-expose-headers'),
    /Content-Disposition/
  )
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(
    response.headers.get('cache-control'),
    `public, max-age=60, s-maxage=${cacheSeconds}`
  )
  assert.equal(response.headers.get('x-catalog-cache'), 'MISS')
  for (const name of ['set-cookie', 'x-internal', 'location'])
    assert.equal(response.headers.get(name), null)
  for (const [url, init] of state.calls) {
    assert.equal(init.method, 'GET')
    assert.equal(init.redirect, 'manual')
    assert.equal(init.credentials, 'omit')
    assert.deepEqual(init.headers, {
      Accept:
        url === catalogUrl
          ? 'application/json'
          : 'application/zip, application/octet-stream',
      'User-Agent': 'Quillow-Community-Catalog',
    })
  }
  assert.equal(state.calls.length, 3)
  await state.flush()
  assert.equal(cachedArchives(state).length, 1)
})

test('GET, cold/cached HEAD and conditional reads reuse only fully verified ZIP bodies', async () => {
  const state = zipState()
  const head = await state.request(request({ method: 'HEAD' }))
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.equal(head.headers.get('content-length'), String(zip.byteLength))
  await state.flush()
  const response = await state.request(request())
  assert.equal(response.headers.get('x-catalog-cache'), 'HIT')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), zip)
  for (const tag of [
    `"${checksum}"`,
    `W/"${checksum}"`,
    '*',
    `"other", "${checksum}"`,
  ]) {
    const conditional = await state.request(
      request({ headers: { 'If-None-Match': tag } })
    )
    assert.equal(conditional.status, 304)
    assert.equal(await conditional.text(), '')
    assert.equal(conditional.headers.get('access-control-allow-origin'), '*')
  }
  assert.equal(state.calls.length, 2)
  assert.ok(cachedArchives(state)[0].includes(`sha256=${checksum}`))
})

test('a matching conditional request on a cold cache does not skip integrity checks', async () => {
  const state = zipState(
    async () =>
      new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9, 9]))
  )
  const response = await state.request(
    request({ headers: { 'If-None-Match': '*' } })
  )
  assert.equal(response.status, 502)
  await state.flush()
  assert.deepEqual(cachedArchives(state), [])
})

test('ZIP preflight, malformed paths, queries and unsupported methods never fetch upstream', async () => {
  const state = zipState()
  const preflight = await state.request(
    request({
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.quillow.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'If-None-Match',
      },
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
  for (const [path, method, status] of [
    [archivePath, 'POST', 405],
    [archivePath, 'PUT', 405],
    [`${archivePath}?url=https://evil.example/evil.zip`, 'GET', 400],
    [`${archivePath}?sha256=${checksum}`, 'GET', 400],
    ['/blocks/crypto-coinpaprika/latest.zip', 'GET', 404],
    ['/blocks/crypto-coinpaprika/0.0.0.zip', 'GET', 404],
    ['/blocks/crypto-coinpaprika/01.0.0.zip', 'GET', 404],
    ['/blocks/crypto-coinpaprika/1.0.0-beta.zip', 'GET', 404],
    ['/blocks/crypto-coinpaprika/1000000.0.0.zip', 'GET', 404],
    ['/blocks/Crypto/1.0.0.zip', 'GET', 404],
    ['/blocks/bad--slug/1.0.0.zip', 'GET', 404],
    ['/blocks/%2fetc/1.0.0.zip', 'GET', 404],
    ['/blocks/crypto-coinpaprika/1.0.0.zip/extra', 'GET', 404],
  ]) {
    const response = await state.request(request({ method }, path))
    assert.equal(response.status, status, path)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
  assert.equal(state.calls.length, 0)
})

test('unknown slugs, unlisted historical versions and preview catalogs never download a ZIP', async () => {
  const state = zipState()
  for (const path of [
    '/blocks/unknown/1.0.0.zip',
    '/blocks/crypto-coinpaprika/2.0.0.zip',
    '/blocks/crypto-coinpaprika/0.9.0.zip',
  ]) {
    const response = await state.request(request({}, path))
    assert.equal(response.status, 404)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    await state.flush()
  }
  assert.deepEqual(
    state.calls.map(([url]) => url),
    [catalogUrl]
  )
  const preview = zipState(undefined, undefined, () => ({
    ...record(),
    channel: 'preview',
  }))
  assert.equal((await preview.request(request())).status, 502)
  assert.deepEqual(
    preview.calls.map(([url]) => url),
    [catalogUrl]
  )
})

test('a withdrawn version cannot bypass current catalog membership through its ZIP cache entry', async () => {
  let catalog = record()
  const state = zipState(undefined, undefined, () => catalog)
  await (await state.request(request())).arrayBuffer()
  await state.flush()
  assert.equal(cachedArchives(state).length, 1)
  // Simulate the catalog TTL expiring while the ZIP entry is still present.
  state.stored.delete(`${origin}/catalog.json`)
  catalog = { ...record(), blocks: [] }
  const response = await state.request(
    request({ headers: { 'If-None-Match': '*' } })
  )
  assert.equal(response.status, 404)
  assert.equal(state.calls.filter(([url]) => url === downloadUrl).length, 1)
})

test('changed catalog checksums cannot reuse an earlier ZIP cache entry', async () => {
  let catalog = record()
  const state = zipState(undefined, undefined, () => catalog)
  await (await state.request(request())).arrayBuffer()
  await state.flush()
  state.stored.delete(`${origin}/catalog.json`)
  catalog.blocks[0].sha256 = 'b'.repeat(64)
  const response = await state.request(request())
  assert.equal(response.status, 502)
  assert.equal(state.calls.filter(([url]) => url === downloadUrl).length, 2)
  await state.flush()
  assert.equal(cachedArchives(state).length, 1)
})

for (const [name, change] of [
  [
    'missing checksum',
    (block) => {
      delete block.sha256
    },
  ],
  [
    'invalid checksum',
    (block) => {
      block.sha256 = '../evil'
    },
  ],
  [
    'numeric checksum',
    (block) => {
      block.sha256 = 123
    },
  ],
  [
    'missing size',
    (block) => {
      delete block.zipBytes
    },
  ],
  [
    'zero size',
    (block) => {
      block.zipBytes = 0
    },
  ],
  [
    'negative size',
    (block) => {
      block.zipBytes = -1
    },
  ],
  [
    'non-integer size',
    (block) => {
      block.zipBytes = 1.5
    },
  ],
  [
    'string size',
    (block) => {
      block.zipBytes = '8'
    },
  ],
  [
    'oversized archive',
    (block) => {
      block.zipBytes = maxArchiveBytes + 1
    },
  ],
  [
    'wrong filename',
    (block) => {
      block.filename = 'evil.html'
    },
  ],
  [
    'wrong release',
    (block) => {
      block.releaseTag = 'crypto-coinpaprika-v2.0.0'
    },
  ],
  ...[
    'https://evil.example/file.zip',
    'http://github.com/quillow-com/community-blocks/releases/download/crypto-coinpaprika-v1.0.0/crypto-coinpaprika-1.0.0.zip',
    'https://user:password@github.com/quillow-com/community-blocks/releases/download/crypto-coinpaprika-v1.0.0/crypto-coinpaprika-1.0.0.zip',
    `${downloadUrl}?token=not-allowed`,
    `${downloadUrl}#fragment`,
    downloadUrl.replace('quillow-com/community-blocks', 'another/repo'),
    downloadUrl.replace(
      '/crypto-coinpaprika-v1.0.0/',
      '/crypto-coinpaprika-v2.0.0/'
    ),
  ].map((url) => [
    url,
    (block) => {
      block.downloadUrl = url
    },
  ]),
]) {
  test(`invalid archive metadata is never served/cached: ${name}`, async () => {
    const catalog = record()
    change(catalog.blocks[0])
    const state = zipState(undefined, undefined, () => catalog)
    assert.equal((await state.request(request())).status, 502)
    assert.deepEqual(
      state.calls.map(([url]) => url),
      [catalogUrl]
    )
    assert.equal(state.stored.size, 0)
  })
}

test('cached catalog data from an older deployment is revalidated before authorizing a download', async () => {
  const state = zipState()
  const catalog = record()
  catalog.blocks[0].downloadUrl = 'https://evil.example/file.zip'
  state.stored.set(`${origin}/catalog.json`, Response.json(catalog))
  const response = await state.request(request())
  assert.equal(response.status, 200)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), zip)
  assert.ok(
    state.calls.every(([url]) => url !== 'https://evil.example/file.zip')
  )
  assert.equal(state.calls[0][0], catalogUrl)
  await state.flush()
})

for (const location of [
  'https://evil.example/file.zip',
  'http://release-assets.githubusercontent.com/file.zip',
  'https://user:secret@release-assets.githubusercontent.com/file.zip',
  'https://release-assets.githubusercontent.com:444/file.zip',
  'https://release-assets.githubusercontent.com.evil.example/file.zip',
  downloadUrl.replace('quillow-com/community-blocks', 'another/repo'),
  downloadUrl.replace(
    '/crypto-coinpaprika-v1.0.0/',
    '/crypto-coinpaprika-v2.0.0/'
  ),
  `https://github.com/quillow-com/community-blocks/releases/download/catalog-${'a'.repeat(64)}/catalog.json`,
]) {
  test(`ZIP redirects cannot escape the selected release/assets: ${location}`, async () => {
    const state = zipState(async () => Response.redirect(location))
    assert.equal((await state.request(request())).status, 502)
    assert.deepEqual(
      state.calls.map(([url]) => url),
      [catalogUrl, downloadUrl]
    )
    await state.flush()
    assert.deepEqual(cachedArchives(state), [])
  })
}

test('ZIP redirect loops are bounded', async () => {
  const state = zipState(async () => Response.redirect(assetUrl))
  assert.equal((await state.request(request())).status, 502)
  assert.equal(state.calls.length, 6)
  await state.flush()
  assert.deepEqual(cachedArchives(state), [])
})

for (const status of [206, 404, 429, 500]) {
  test(`ZIP HTTP ${status} is a retryable error and never cached as a successful ZIP`, async () => {
    const state = zipState(
      async () => new Response('private upstream details', { status })
    )
    const response = await state.request(request())
    assert.equal(response.status, 502)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.doesNotMatch(await response.text(), /private upstream details/)
    await state.flush()
    assert.deepEqual(cachedArchives(state), [])
  })
}

test('rejects truncated, oversized, checksum-mismatched and non-ZIP bytes before caching', async () => {
  for (const bytes of [
    zip.slice(0, -1),
    new Uint8Array([...zip, 0]),
    new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9, 9]),
  ]) {
    const state = zipState(async () => new Response(bytes))
    assert.equal((await state.request(request())).status, 502)
    await state.flush()
    assert.deepEqual(cachedArchives(state), [])
  }
  const html = new TextEncoder().encode('<script>not a ZIP</script>')
  const state = zipState(
    async () => new Response(html),
    undefined,
    () => {
      const catalog = record()
      catalog.blocks[0].sha256 = createHash('sha256').update(html).digest('hex')
      catalog.blocks[0].zipBytes = html.byteLength
      return catalog
    }
  )
  assert.equal((await state.request(request())).status, 502)
  await state.flush()
  assert.deepEqual(cachedArchives(state), [])
})

test('bounds declared and actual ZIP bodies, including dishonest Content-Length', async () => {
  let cancelled = 0
  for (const length of [String(maxArchiveBytes + 1), '1', undefined]) {
    const state = zipState(
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(new Uint8Array(maxArchiveBytes + 1))
            },
            cancel() {
              cancelled++
            },
          }),
          { headers: length ? { 'Content-Length': length } : {} }
        )
    )
    assert.equal((await state.request(request())).status, 502)
    await state.flush()
    assert.deepEqual(cachedArchives(state), [])
  }
  assert.equal(cancelled, 3)
})

test('accepts an exactly 10 MiB archive and rejects anything larger', async () => {
  const bytes = new Uint8Array(maxArchiveBytes)
  bytes.set(zip)
  const catalog = record()
  catalog.blocks[0].sha256 = createHash('sha256').update(bytes).digest('hex')
  catalog.blocks[0].zipBytes = bytes.byteLength
  const state = zipState(
    async () => new Response(bytes),
    undefined,
    () => catalog
  )
  const response = await state.request(request())
  assert.equal(response.status, 200)
  assert.equal((await response.arrayBuffer()).byteLength, maxArchiveBytes)
  await state.flush()
})

test('ZIP fetch and stalled body reads are aborted at the deadline', async () => {
  let cancelled = false
  for (const fetcher of [
    async (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      ),
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true
          },
        })
      ),
  ]) {
    const state = zipState(fetcher, { timeoutMs: 20 })
    const response = await state.request(request())
    assert.equal(response.status, 504)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    await state.flush()
    assert.deepEqual(cachedArchives(state), [])
  }
  assert.equal(cancelled, true)
})

test('catalog lookup and ZIP retrieval share the same deadline signal', async () => {
  let catalogSignal
  const state = prepared(async (url, { signal }) => {
    if (url === catalogUrl) {
      catalogSignal = signal
      return Response.json(record())
    }
    assert.equal(signal, catalogSignal)
    return new Response(zip)
  })
  assert.equal((await state.request(request())).status, 200)
  await state.flush()
})

test('HEAD errors are bodyless and failed ZIP reads can be retried', async () => {
  let available = false
  const state = zipState(
    async () =>
      new Response(available ? zip : 'offline', {
        status: available ? 200 : 500,
      })
  )
  const response = await state.request(request({ method: 'HEAD' }))
  assert.equal(response.status, 502)
  assert.equal(await response.text(), '')
  await state.flush()
  available = true
  const success = await state.request(request())
  assert.equal(success.status, 200)
  assert.deepEqual(new Uint8Array(await success.arrayBuffer()), zip)
  await state.flush()
})

test('ZIP cache read/write failures do not block valid downloads', async () => {
  const state = zipState()
  state.cache.match = async () => {
    throw new Error('Offline cache')
  }
  state.cache.put = () => {
    throw new Error('Offline cache')
  }
  const response = await state.request(request())
  assert.equal(response.status, 200)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), zip)
  await state.flush()
})

test('missing cache bindings do not block verified ZIP downloads', async () => {
  for (const cache of [
    () => undefined,
    () => {
      throw new Error('Cache unavailable')
    },
  ]) {
    const state = zipState(undefined, { cache })
    const response = await state.request(request())
    assert.equal(response.status, 200)
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), zip)
    assert.equal(state.stored.size, 0)
  }
})

test('missing or broken ZIP streams are retryable errors and never cached', async () => {
  for (const response of [
    new Response(null),
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('Broken stream'))
        },
      })
    ),
  ]) {
    const state = zipState(async () => response)
    assert.equal((await state.request(request())).status, 502)
    await state.flush()
    assert.deepEqual(cachedArchives(state), [])
  }
})
