import { repository } from './metadata.mjs'

async function boundedBytes(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel()
    throw new Error('Published asset exceeds its size limit')
  }
  const parts = []
  let length = 0
  if (!response.body) throw new Error('Published asset has no body')
  for await (const part of response.body) {
    length += part.length
    if (length > limit)
      throw new Error('Published asset exceeds its size limit')
    parts.push(Buffer.from(part))
  }
  return Buffer.concat(parts)
}

export function createGitHubClient(token, request = fetch) {
  if (!token) throw new Error('GITHUB_TOKEN is required for publication')
  const base = `https://api.github.com/repos/${repository}`
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const send = async (method, suffix, body, missing = false) => {
    const response = await request(base + suffix, {
      method,
      headers: {
        ...headers,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60_000),
    })
    if (missing && response.status === 404) return null
    if (!response.ok)
      throw new Error(`GitHub ${method} ${suffix}: HTTP ${response.status}`)
    if (response.status === 204) return null
    return response.json()
  }
  const listReleases = async () => {
    const all = []
    for (let page = 1; ; page++) {
      const releases = await send('GET', `/releases?per_page=100&page=${page}`)
      if (!Array.isArray(releases))
        throw new Error('Invalid GitHub release list')
      all.push(...releases)
      if (releases.length < 100) return all
    }
  }
  let drafts
  const getDrafts = () => {
    drafts ??= (async () => {
      const found = new Map()
      // Tag lookup is for published releases. List authenticated drafts as a fallback for interrupted runs.
      for (const release of await listReleases()) {
        if (release.draft) found.set(release.tag_name, release)
      }
      return found
    })()
    return drafts
  }
  return {
    listReleases,
    async getMainCommit() {
      return (await send('GET', '/commits/main')).sha
    },
    async resolveTagCommit(tag) {
      if (typeof tag !== 'string' || !/^[a-z0-9-]+-v\d+\.\d+\.\d+$/.test(tag))
        throw new Error('Invalid block release tag')
      let object = (
        await send('GET', `/git/ref/tags/${encodeURIComponent(tag)}`)
      ).object
      for (let i = 0; i < 10; i++) {
        if (!object || !/^[a-f0-9]{40}$/.test(object.sha))
          throw new Error('Invalid GitHub tag object')
        if (object.type === 'commit') return object.sha
        if (object.type !== 'tag')
          throw new Error('Release tag does not reference a commit')
        object = (await send('GET', `/git/tags/${object.sha}`)).object
      }
      throw new Error('Too many nested annotated tags')
    },
    async isAncestor(baseCommit, headCommit) {
      if (
        ![baseCommit, headCommit].every(
          (sha) => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha)
        )
      )
        throw new Error('Invalid comparison commit')
      const comparison = await send(
        'GET',
        `/compare/${baseCommit}...${headCommit}`
      )
      return ['ahead', 'identical'].includes(comparison.status)
    },
    async dispatchCheck(branch, baseCommit) {
      if (
        typeof branch !== 'string' ||
        !/^release-please--[A-Za-z0-9/_-]+$/.test(branch) ||
        !/^[a-f0-9]{40}$/.test(baseCommit)
      )
        throw new Error('Invalid release PR validation target')
      await send('POST', '/actions/workflows/check.yml/dispatches', {
        ref: branch,
        inputs: { 'base-sha': baseCommit },
      })
    },
    async getRelease(tag) {
      return (
        (await send(
          'GET',
          `/releases/tags/${encodeURIComponent(tag)}`,
          undefined,
          true
        )) ??
        (await getDrafts()).get(tag) ??
        null
      )
    },
    createRelease: (tag, commit, name) =>
      send('POST', '/releases', {
        tag_name: tag,
        target_commitish: commit,
        name,
        body: `Built from https://github.com/${repository}/commit/${commit}. Assets must not be replaced.`,
        draft: true,
        make_latest: 'false',
      }),
    publishRelease: (id, latest) =>
      send('PATCH', `/releases/${id}`, {
        draft: false,
        make_latest: String(latest),
      }),
    async upload(release, name, bytes, contentType) {
      const target = new URL(release.upload_url.replace('{?name,label}', ''))
      if (
        target.origin !== 'https://uploads.github.com' ||
        target.pathname !== `/repos/${repository}/releases/${release.id}/assets`
      )
        throw new Error('Unexpected GitHub upload endpoint')
      target.searchParams.set('name', name)
      const response = await request(target, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType },
        body: bytes,
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok)
        throw new Error(`GitHub asset upload: HTTP ${response.status}`)
      return response.json()
    },
    async download(asset, limit) {
      if (
        !Number.isSafeInteger(asset.id) ||
        asset.id < 1 ||
        !Number.isSafeInteger(asset.size) ||
        asset.size < 0 ||
        asset.size > limit
      )
        throw new Error('Invalid or oversized GitHub release asset')
      // The URL comes from a validated numeric API ID, never from widget metadata.
      const response = await request(`${base}/releases/assets/${asset.id}`, {
        headers: { ...headers, Accept: 'application/octet-stream' },
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok)
        throw new Error(`GitHub asset download: HTTP ${response.status}`)
      return boundedBytes(response, limit)
    },
  }
}
