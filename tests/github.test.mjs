import assert from 'node:assert/strict'
import test from 'node:test'

import { createGitHubClient } from '../scripts/lib/github.mjs'

test('release lists paginate and annotated tags are peeled to an immutable commit', async () => {
  const sha = 'a'.repeat(40)
  const github = createGitHubClient('test-token', async (url) => {
    if (url.includes('/git/ref/tags/'))
      return Response.json({ object: { type: 'tag', sha: 'b'.repeat(40) } })
    if (url.includes('/git/tags/'))
      return Response.json({ object: { type: 'commit', sha } })
    return Response.json(
      url.endsWith('page=1')
        ? Array.from({ length: 100 }, (_, i) => ({ id: i }))
        : [{ id: 101 }]
    )
  })
  assert.equal((await github.listReleases()).length, 101)
  assert.equal(await github.resolveTagCommit('my-widget-v1.0.0'), sha)
  await assert.rejects(
    github.resolveTagCommit('../escape'),
    /Invalid block release tag/
  )
})

test('ancestry checks accept only ahead/identical and validate commit inputs', async () => {
  const sha = 'a'.repeat(40)
  for (const status of ['ahead', 'identical', 'behind', 'diverged']) {
    const github = createGitHubClient('test-token', async () =>
      Response.json({ status })
    )
    assert.equal(
      await github.isAncestor(sha, sha),
      ['ahead', 'identical'].includes(status)
    )
    await assert.rejects(
      github.isAncestor('main', sha),
      /Invalid comparison commit/
    )
  }
})

test('bot PR validation dispatch uses a read-only workflow and handles empty HTTP 204', async () => {
  const calls = []
  const sha = 'a'.repeat(40)
  const github = createGitHubClient('test-token', async (url, options) => {
    calls.push({ url, ...options })
    return new Response(null, { status: 204 })
  })
  await github.dispatchCheck(
    'release-please--branches--main--components--my-widget',
    sha
  )
  assert.match(calls[0].url, /\/actions\/workflows\/check.yml\/dispatches$/)
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].body), {
    ref: 'release-please--branches--main--components--my-widget',
    inputs: { 'base-sha': sha },
  })
  await assert.rejects(
    github.dispatchCheck('untrusted-branch', sha),
    /Invalid release PR validation target/
  )
  assert.equal(calls.length, 1)
})

test('missing releases are distinct from authentication and server failures', async () => {
  const missing = createGitHubClient('test-token', async (url) =>
    url.includes('/releases/tags/')
      ? new Response('', { status: 404 })
      : new Response('[]')
  )
  assert.equal(await missing.getRelease('missing'), null)
  for (const status of [401, 403, 500]) {
    const github = createGitHubClient(
      'test-token',
      async () => new Response('secret internal error', { status })
    )
    await assert.rejects(github.getRelease('blocked'), (error) => {
      assert.match(error.message, new RegExp(`HTTP ${status}`))
      assert.doesNotMatch(error.message, /test-token|secret/)
      return true
    })
  }
})

test('an unexpected upload URL cannot receive the GitHub token', async () => {
  let calls = 0
  const github = createGitHubClient('test-token', async () => {
    calls++
    return new Response('{}')
  })
  await assert.rejects(
    github.upload(
      { id: 1, upload_url: 'https://evil.example/upload' },
      'file.zip',
      Buffer.from('data'),
      'application/zip'
    ),
    /Unexpected GitHub upload endpoint/
  )
  assert.equal(calls, 0)
})

test('draft fallback paginates and is cached when tag lookup returns 404', async () => {
  const draft = { id: 123, tag_name: 'pending-v1.0.0', draft: true }
  const calls = []
  const github = createGitHubClient('test-token', async (url) => {
    calls.push(url)
    if (url.includes('/releases/tags/'))
      return new Response('', { status: 404 })
    return new Response(
      JSON.stringify(
        url.endsWith('page=1')
          ? Array.from({ length: 100 }, (_, i) => ({
              tag_name: `old-${i}`,
              draft: false,
            }))
          : [draft]
      )
    )
  })
  assert.deepEqual(await github.getRelease('pending-v1.0.0'), draft)
  assert.equal(await github.getRelease('missing'), null)
  assert.equal(calls.filter((url) => url.includes('/releases?')).length, 2)
})

test('asset downloads reject oversized metadata, oversized bodies and invalid IDs', async () => {
  let calls = 0
  const github = createGitHubClient('test-token', async () => {
    calls++
    return new Response(Buffer.alloc(11))
  })
  await assert.rejects(github.download({ id: 1, size: 11 }, 10), /oversized/)
  await assert.rejects(
    github.download({ id: '../secret', size: 1 }, 10),
    /Invalid/
  )
  assert.equal(calls, 0)
  await assert.rejects(github.download({ id: 1, size: 1 }, 10), /size limit/)
})
