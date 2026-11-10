import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { Manifest, VERSION, setLogger } from 'release-please'
import { check, format } from 'prettier'

import { addBlock, commit, setVersion, workspace } from './fixtures.mjs'
import {
  configFilename,
  manifestFilename,
  parseReleaseTag,
  releaseConfig,
  syncReleaseConfig,
  tagsFromActionOutputs,
} from '../scripts/lib/release-config.mjs'

const logger = Object.fromEntries(
  ['info', 'debug', 'warn', 'error', 'trace'].map((name) => [name, () => {}])
)
setLogger(logger)

for (const [previous, message, expected] of [
  [null, 'feat(blocks): add a block', '1.0.0'],
  ['1.0.0', 'fix(blocks): correct display', '1.0.1'],
  ['1.0.0', 'feat(blocks): add an editor', '1.1.0'],
  ['1.0.0', 'feat(blocks)!: change stored settings', '2.0.0'],
  ['1.0.0', 'docs(blocks): clarify external API use', '1.0.1'],
]) {
  test(`real release-please ${previous ?? 'unreleased'} + ${message} produces ${expected} independently`, async (t) => {
    assert.equal(VERSION, '17.3.0')
    const root = await workspace(t)
    await setVersion(root, previous ?? '0.0.0')
    await addBlock(root, 'untouched-block', previous ?? '0.0.0')
    for (const slug of ['hello-world', 'untouched-block']) {
      const filename = path.join(root, 'blocks', slug, 'metadata.json')
      await writeFile(
        filename,
        await format(await readFile(filename, 'utf8'), {
          parser: 'json-stringify',
        })
      )
    }
    const base = 'b'.repeat(40)
    const github = {
      repository: {
        owner: 'quillow-com',
        repo: 'community-blocks',
        defaultBranch: 'main',
      },
      getFileJson: async (name) =>
        JSON.parse(await readFile(path.join(root, name), 'utf8')),
      async *releaseIterator() {
        if (previous) {
          for (const slug of ['hello-world', 'untouched-block'])
            yield {
              tagName: `${slug}-v${previous}`,
              sha: base,
              name: slug,
              notes: '',
            }
        }
      },
      async *tagIterator() {},
      async *mergeCommitIterator() {
        yield {
          sha: commit,
          message,
          files: ['blocks/hello-world/package/app.mjs'],
        }
        if (previous) yield { sha: base, message: 'chore: release', files: [] }
      },
    }
    const manifest = await Manifest.fromManifest(
      github,
      'main',
      configFilename,
      manifestFilename,
      { logger }
    )
    assert.equal(manifest.repositoryConfig['blocks/hello-world'].draft, true)
    assert.equal(manifest.repositoryConfig['blocks/hello-world'].forceTag, true)
    const prs = await manifest.buildPullRequests()
    assert.equal(prs.length, 1)
    const pr = prs[0]
    assert.equal(pr.version.toString(), expected)
    assert.match(pr.headRefName, /^release-please--/)
    assert.deepEqual(pr.updates.map((update) => update.path).sort(), [
      manifestFilename,
      'blocks/hello-world/CHANGELOG.md',
      'blocks/hello-world/metadata.json',
      'blocks/hello-world/version.txt',
    ])
    for (const update of pr.updates) {
      let content = ''
      try {
        content = await readFile(path.join(root, update.path), 'utf8')
      } catch (error) {
        if (error.code !== 'ENOENT' || !update.createIfMissing) throw error
      }
      await writeFile(
        path.join(root, update.path),
        update.updater.updateContent(content, logger)
      )
    }
    await syncReleaseConfig(root, { check: true })
    const metadata = JSON.parse(
      await readFile(path.join(root, 'blocks/hello-world/metadata.json'))
    )
    assert.equal(metadata.version, expected)
    assert.equal(
      await check(
        await readFile(
          path.join(root, 'blocks/hello-world/metadata.json'),
          'utf8'
        ),
        { parser: 'json-stringify' }
      ),
      true
    )
    assert.equal(
      JSON.parse(
        await readFile(path.join(root, 'blocks/untouched-block/metadata.json'))
      ).version,
      previous ?? '0.0.0'
    )
    assert.match(
      await readFile(
        path.join(root, 'blocks/hello-world/CHANGELOG.md'),
        'utf8'
      ),
      new RegExp(expected.replaceAll('.', '\\.'))
    )
  })
}

test('config registration is deterministic and stale or fabricated version state fails', async (t) => {
  const root = await workspace(t, false)
  assert.deepEqual(
    releaseConfig(['zebra', 'alpha']),
    releaseConfig(['alpha', 'zebra'])
  )
  assert.throws(() => releaseConfig(['../escape']), /Invalid release component/)
  await addBlock(root, 'new-block', '0.0.0')
  const state = JSON.parse(await readFile(path.join(root, manifestFilename)))
  assert.deepEqual(state, {})
  await writeFile(path.join(root, configFilename), '{}')
  await assert.rejects(syncReleaseConfig(root, { check: true }), /stale/)
  await syncReleaseConfig(root)
  await writeFile(path.join(root, 'blocks/new-block/version.txt'), '1.0.0\n')
  await assert.rejects(syncReleaseConfig(root, { check: true }), /must match/)
})

test('release action output paths and tags must agree and cannot select arbitrary Git revisions', () => {
  assert.deepEqual(
    tagsFromActionOutputs({
      paths_released: '["blocks/my-widget"]',
      'blocks/my-widget--tag_name': 'my-widget-v1.0.0',
    }),
    ['my-widget-v1.0.0']
  )
  assert.deepEqual(tagsFromActionOutputs(), [])
  assert.throws(
    () => tagsFromActionOutputs({ paths_released: '["examples/hello-world"]' }),
    /Invalid released path/
  )
  assert.throws(
    () =>
      tagsFromActionOutputs({
        paths_released: '["blocks/my-widget"]',
        'blocks/my-widget--tag_name': 'another-v1.0.0',
      }),
    /component mismatch/
  )
  for (const tag of [
    '--help',
    'main',
    'my-widget-v0.0.0',
    'my-widget-v01.0.0',
    'my-widget-v1.0.0-beta',
    '../escape-v1.0.0',
  ])
    assert.throws(() => parseReleaseTag(tag))
})

test('the minimatch override preserves the git-file-utils glob API', async () => {
  const { BranchFileCache } = await import('@google-automations/git-file-utils')
  const cache = new BranchFileCache({}, { owner: 'test', repo: 'test' }, 'main')
  cache.treeEntryIterator = async function* () {
    for (const name of [
      'blocks/a/metadata.json',
      'blocks/b/metadata.json',
      'examples/c/metadata.json',
      'blocks/a/package/app.mjs',
    ])
      yield { path: name }
  }
  assert.deepEqual(await cache.findFilesByGlob('blocks/*/metadata.json'), [
    'blocks/a/metadata.json',
    'blocks/b/metadata.json',
  ])
})
