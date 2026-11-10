import { createHash } from 'node:crypto'

import { createCatalogWorker } from '../src/catalog.mjs'

export const commit = 'a'.repeat(40)
// Opaque archive bytes: the Worker checks signature/integrity, not ZIP contents.
export const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])
export const checksum = createHash('sha256').update(zip).digest('hex')
export const record = () => ({
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
      filename: 'crypto-coinpaprika-1.0.0.zip',
      releaseTag: 'crypto-coinpaprika-v1.0.0',
      downloadUrl:
        'https://github.com/quillow-com/custom-blocks/releases/download/crypto-coinpaprika-v1.0.0/crypto-coinpaprika-1.0.0.zip',
      sha256: checksum,
      zipBytes: zip.byteLength,
    },
  ],
})

export function prepared(
  fetch = async () => Response.json(record()),
  options = {}
) {
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
