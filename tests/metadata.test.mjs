import assert from 'node:assert/strict'
import { rename, symlink, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { metadata, pngImage, updateMetadata, workspace } from './fixtures.mjs'
import { largeWebp, mediumJpeg } from './image-fixtures.mjs'
import {
  compareVersions,
  parseMetadata,
  readMetadata,
} from '../scripts/lib/metadata.mjs'

test('metadata matches its slug, is detached, and versions compare numerically', () => {
  const input = metadata()
  const result = parseMetadata(input, 'hello-world')
  input.tags.push('changed')
  assert.deepEqual(result.tags, ['starter'])
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1)
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('0.9.0', '1.0.0'), -1)
})

for (const change of [
  { schemaVersion: 2 },
  { slug: '../escape' },
  { slug: 'Hello-World' },
  { version: '01.0.0' },
  { version: '1.0.0-beta' },
  { version: '1000000.0.0' },
  { description: '' },
  { description: ' padded ' },
  { description: 'line\nbreak' },
  { description: 'x'.repeat(281) },
  { author: { name: '', github: 'test' } },
  { author: { name: 'Test', github: 'https://evil.example' } },
  { author: { name: 'Test', github: 'test', token: 'secret' } },
  { license: 'proprietary' },
  { tags: ['same', 'same'] },
  { tags: ['Not-Lowercase'] },
  { screenshots: [] },
  { screenshots: ['screenshots/small.png'] },
  { screenshots: ['screenshots/small.png', 'screenshots/medium.png'] },
  { screenshots: [...metadata().screenshots, 'screenshots/extra.png'] },
  {
    screenshots: [
      'screenshots/small.png',
      'screenshots/small.png',
      'screenshots/large.png',
    ],
  },
  {
    screenshots: [
      'https://evil.example/image.png',
      ...metadata().screenshots.slice(1),
    ],
  },
  {
    screenshots: [
      'screenshots/../image.png',
      ...metadata().screenshots.slice(1),
    ],
  },
  { screenshots: ['screenshots/icon.svg', ...metadata().screenshots.slice(1)] },
  { downloadUrl: 'https://evil.example/archive.zip' },
]) {
  test(`reject invalid metadata: ${JSON.stringify(change)}`, () => {
    assert.throws(() =>
      parseMetadata({ ...metadata(), ...change }, 'hello-world')
    )
  })
}

for (const field of ['description', 'author', 'screenshots']) {
  test(`${field} is mandatory`, () => {
    const value = metadata()
    delete value[field]
    assert.throws(() => parseMetadata(value, 'hello-world'))
  })
}

test('requires all three screenshot files at their exact layout dimensions', async (t) => {
  const root = await workspace(t)
  const directory = path.join(root, 'blocks/hello-world')
  assert.deepEqual(
    (await readMetadata(directory, 'hello-world')).screenshots,
    metadata().screenshots
  )
  const small = path.join(directory, 'screenshots/small.png')
  await writeFile(small, pngImage(312, 312))
  await assert.rejects(
    readMetadata(directory, 'hello-world'),
    /small screenshot must be 156×156 pixels; got 312×312/
  )
  await writeFile(small, pngImage(156, 156))
  await unlink(path.join(directory, 'screenshots/medium.png'))
  await assert.rejects(readMetadata(directory, 'hello-world'), /medium.png/)
})

test('screenshot array order is small, medium, large, not interchangeable', async (t) => {
  const root = await workspace(t)
  await updateMetadata(root, {
    screenshots: [
      'screenshots/medium.png',
      'screenshots/small.png',
      'screenshots/large.png',
    ],
  })
  await assert.rejects(
    readMetadata(path.join(root, 'blocks/hello-world'), 'hello-world'),
    /small screenshot must be 156×156/
  )
})

test('accepts actual PNG, JPEG and WebP headers and preserves the three ordered paths', async (t) => {
  const root = await workspace(t)
  const directory = path.join(root, 'blocks/hello-world')
  await writeFile(path.join(directory, 'screenshots/medium.jpeg'), mediumJpeg)
  await writeFile(path.join(directory, 'screenshots/large.webp'), largeWebp)
  const screenshots = [
    'screenshots/small.png',
    'screenshots/medium.jpeg',
    'screenshots/large.webp',
  ]
  await updateMetadata(root, { screenshots })
  assert.deepEqual(
    (await readMetadata(directory, 'hello-world')).screenshots,
    screenshots
  )
  await writeFile(path.join(directory, 'screenshots/medium.jpg'), mediumJpeg)
  screenshots[1] = 'screenshots/medium.jpg'
  await updateMetadata(root, { screenshots })
  await readMetadata(directory, 'hello-world')
})

test('EXIF rotation cannot make a portrait JPEG masquerade as the required medium layout', async (t) => {
  const root = await workspace(t)
  const directory = path.join(root, 'blocks/hello-world')
  // APP1 Exif block with a single TIFF orientation entry: rotate 90° clockwise.
  const exif = Buffer.from(
    'ffe100224578696600004d4d002a00000008000101120003000000010006000000000000',
    'hex'
  )
  await writeFile(
    path.join(directory, 'screenshots/medium.jpg'),
    Buffer.concat([mediumJpeg.subarray(0, 2), exif, mediumJpeg.subarray(2)])
  )
  await updateMetadata(root, {
    screenshots: [
      'screenshots/small.png',
      'screenshots/medium.jpg',
      'screenshots/large.png',
    ],
  })
  await assert.rejects(
    readMetadata(directory, 'hello-world'),
    /medium screenshot must be 336×156 pixels; got 156×336/
  )
})

test('image signatures, readable dimensions, file size and file extension are checked', async (t) => {
  const root = await workspace(t)
  const directory = path.join(root, 'blocks/hello-world')
  const filename = path.join(directory, 'screenshots/small.png')
  await writeFile(filename, '<script>not an image</script>')
  await assert.rejects(readMetadata(directory, 'hello-world'), /do not match/)
  await writeFile(filename, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  await assert.rejects(
    readMetadata(directory, 'hello-world'),
    /cannot read screenshot image dimensions/
  )
  await writeFile(filename, Buffer.alloc(2 * 1024 * 1024 + 1))
  await assert.rejects(
    readMetadata(directory, 'hello-world'),
    /at most 2097152 bytes/
  )
  await writeFile(filename, mediumJpeg)
  await assert.rejects(readMetadata(directory, 'hello-world'), /do not match/)
})

test('metadata and screenshot directory symlinks cannot escape the block', async (t) => {
  const root = await workspace(t)
  const directory = path.join(root, 'blocks/hello-world')
  await rename(path.join(directory, 'screenshots'), path.join(root, 'outside'))
  await symlink(path.join(root, 'outside'), path.join(directory, 'screenshots'))
  await assert.rejects(
    readMetadata(directory, 'hello-world'),
    /cannot be symlinks/
  )
})

test('individual screenshot and metadata symlinks are rejected', async (t) => {
  const root = await workspace(t)
  const directory = path.join(root, 'blocks/hello-world')
  const image = path.join(directory, 'screenshots/small.png')
  await rename(image, path.join(root, 'outside.png'))
  await symlink(path.join(root, 'outside.png'), image)
  await assert.rejects(
    readMetadata(directory, 'hello-world'),
    /expected a regular file/
  )
  const filename = path.join(directory, 'metadata.json')
  await rename(filename, path.join(root, 'metadata.json'))
  await symlink(path.join(root, 'metadata.json'), filename)
  await assert.rejects(
    readMetadata(directory, 'hello-world'),
    /expected a regular file/
  )
})
