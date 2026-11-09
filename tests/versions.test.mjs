import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { addBlock, setVersion, updateMetadata, workspace } from './fixtures.mjs'
import { checkVersions } from '../scripts/lib/versions.mjs'

async function baseline(t, version = '1.0.0') {
  const root = await workspace(t)
  await writeFile(path.join(root, 'README.md'), '# Registry\n')
  await setVersion(root, version)
  await writeFile(
    path.join(root, 'blocks/hello-world/package/image.png'),
    Buffer.from([255, 0, 128, 254])
  )
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  git(['init', '--quiet', '-b', 'main'])
  git(['config', '--local', 'commit.gpgsign', 'false']) // Do not invoke a developer's signing agent in fixtures.
  git(['add', '.'])
  git([
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--quiet',
    '-m',
    'test: baseline',
  ])
  return { root, base: git(['rev-parse', 'HEAD']) }
}

test('ordinary PRs change code and metadata without manually bumping versions', async (t) => {
  const { root, base } = await baseline(t)
  await writeFile(
    path.join(root, 'blocks/hello-world/README.md'),
    '# Better documentation'
  )
  await writeFile(
    path.join(root, 'blocks/hello-world/package/app.mjs'),
    '// changed'
  )
  await updateMetadata(root, { description: 'A better description.' })
  await checkVersions(root, base)
})

test('ordinary PRs cannot change release state even with synchronized version files', async (t) => {
  const { root, base } = await baseline(t)
  await setVersion(root, '1.0.1')
  await assert.rejects(checkVersions(root, base), /Only a release PR/)
})

test('new blocks use 0.0.0 and are registered without inventing a published manifest entry', async (t) => {
  const { root, base } = await baseline(t)
  await addBlock(root, 'new-block', '0.0.0')
  await checkVersions(root, base)
  await assert.rejects(
    checkVersions(root, base, { release: true }),
    /cannot introduce blocks/
  )
})

test('release PRs bump synchronized versions without changing package bytes', async (t) => {
  const { root, base } = await baseline(t)
  await setVersion(root, '1.0.1')
  await writeFile(
    path.join(root, 'blocks/hello-world/CHANGELOG.md'),
    '# 1.0.1\n'
  )
  await checkVersions(root, base, { release: true })
  await writeFile(
    path.join(root, 'blocks/hello-world/package/app.mjs'),
    '// changed'
  )
  await assert.rejects(
    checkVersions(root, base, { release: true }),
    /cannot change package files/
  )
})

test('release PRs cannot smuggle metadata, tooling changes or a version downgrade', async (t) => {
  const { root, base } = await baseline(t)
  await setVersion(root, '0.9.0')
  await assert.rejects(
    checkVersions(root, base, { release: true }),
    /cannot go backwards/
  )
  await setVersion(root, '1.1.0')
  await updateMetadata(root, { description: 'Unreviewed description.' })
  await assert.rejects(
    checkVersions(root, base, { release: true }),
    /not other metadata/
  )
})

test('the first release is 1.0.0 and no-op release PRs fail', async (t) => {
  const { root, base } = await baseline(t, '0.0.0')
  await assert.rejects(
    checkVersions(root, base, { release: true }),
    /must increase/
  )
  await setVersion(root, '0.0.1')
  await assert.rejects(
    checkVersions(root, base, { release: true }),
    /first release must be 1.0.0/
  )
  await setVersion(root, '1.0.0')
  await checkVersions(root, base, { release: true })
})

test('release PRs reject unrelated tracked repository changes', async (t) => {
  const { root, base } = await baseline(t)
  await setVersion(root, '1.0.1')
  await writeFile(
    path.join(root, 'README.md'),
    '# Unrelated repository change\n'
  )
  await assert.rejects(
    checkVersions(root, base, { release: true }),
    /may only change version files/
  )
})

test('version mirrors must agree, and base arguments cannot become arbitrary git revisions', async (t) => {
  const { root, base } = await baseline(t)
  await updateMetadata(root, { version: '1.0.1' })
  await assert.rejects(checkVersions(root, base), /must match/)
  await assert.rejects(checkVersions(root, '--help'), /full commit SHA/)
  await assert.rejects(checkVersions(root, 'main'), /full commit SHA/)
})
